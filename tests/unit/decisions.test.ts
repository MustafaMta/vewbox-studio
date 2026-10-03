import { describe, expect, it } from 'vitest';
import { decisionCounts, waitingDecisions } from '@/studio/selectors/decisions';
import { waitingDecisions as shellDecisions } from '@/components/shell/decisions';
import { buildFixture } from '../../scripts/v4-fixture';
import type { Job } from '@/domain/jobs';
import type { Asset, Character } from '@/domain/types';
import { addCharacter } from '@/domain/actions';

/** docs/CONTRACTS-REDESIGN-BACKEND.md B8 — the one decisions selector, with the shapes the studio really writes
 *  (the jobs' `result` objects as the handlers return them; recordings with the voice check in their provenance). */

const job = (p: Partial<Job> & Pick<Job, 'id' | 'type' | 'status'>): Job => ({ priority: 0, payload: {}, attempts: 1, maxAttempts: 1, cancelRequested: false, createdAt: '2026-10-03T07:00:00.000Z', updatedAt: '2026-10-03T07:30:00.000Z', finishedAt: undefined, ...p });
const recording = (id: string, jobId: string, check: { ok: boolean } | null | 'none'): Asset => ({ id, kind: 'AUDIO', src: `/api/media/${id}`, label: id, tags: ['dialogue', 'voice'], sample: false, origin: 'GENERATED', jobId, provenance: check === 'none' ? { engine: 'indextts' } : { engine: 'indextts', check }, createdAt: '2026-10-03T07:20:00.000Z' });

/** The sample studio's states fixture (a STORY gate, Layla's locked draft) plus: Hana's and Salam's draft images, two
 *  flagged lines of a DIALOGUE_AUDIO job, a parked PRODUCE pass, a GENERATE_TAKE with a REVIEW verdict and a
 *  CREATE_CHARACTER run awaiting review — the studio of 2026-10-03 (docs/DESIGN-SYSTEM-V5.md §6.7). */
function studio() {
  const f = buildFixture('states');
  // Nour has never been filmed; Salam and Rami are new (addCharacter: usage known, nothing drawn yet)
  const profile = { role: 'Lead', style: 'ANIME' as const, sex: 'FEMALE' as const, ageYears: 29, build: '', face: '', hair: '', skin: '', eyes: '', wardrobe: '', personality: '', distinguishing: [], language: 'EN' as const };
  const r1 = addCharacter(f.state, { ...profile, name: 'Salam' });
  const r2 = addCharacter(r1.state, { ...profile, name: 'Rami', sex: 'MALE' });
  const s = r2.state;
  f.state = s;
  const hana = s.characters.find((c) => c.id === 'nour')!;
  const salam = s.characters.find((c) => c.id === r1.character.id)!;
  const rami = s.characters.find((c) => c.id === r2.character.id)!;
  for (const c of [hana, salam]) c.canonicalImage = { assetId: `ref-${c.id}-full-body`, status: 'DRAFT', version: 1, generatedAt: '2026-10-03T08:00:00.000Z', check: { ok: true } };
  const p = s.productions.find((x) => x.id === 's1e1')!;
  // two lines recorded by the dialogue job drifted; one passed; one older recording belongs to another job
  const [d1, d2, d3, d4] = p.shots.flatMap((sh) => sh.dialogue.map((d) => ({ sh, d })));
  d1.d.audioAssetId = 'rec-1'; d2.d.audioAssetId = 'rec-2'; d3.d.audioAssetId = 'rec-3'; d4.d.audioAssetId = 'rec-4';
  s.assets.push(recording('rec-1', 'job-dialogue', { ok: false }), recording('rec-2', 'job-dialogue', null), recording('rec-3', 'job-dialogue', { ok: true }), recording('rec-4', 'job-older', { ok: false }));
  const jobs: Job[] = [
    ...f.jobs,
    job({ id: 'job-dialogue', type: 'DIALOGUE_AUDIO', status: 'AWAITING_REVIEW', productionId: p.id, payload: { productionId: p.id }, result: { ms: 446223, lines: 6, flagged: 1, unverified: 1, awaitingReview: true }, updatedAt: '2026-10-03T08:15:00.000Z' }),
    job({ id: 'job-produce', type: 'PRODUCE', status: 'AWAITING_REVIEW', productionId: p.id, payload: { productionId: p.id }, result: { ms: 1216821, shots: 8, failed: 1, remainingWithoutTake: 1, awaitingReview: true }, updatedAt: '2026-10-03T08:40:00.000Z' }),
    job({ id: 'job-take', type: 'GENERATE_TAKE', status: 'AWAITING_REVIEW', productionId: p.id, shotId: d1.sh.id, payload: { productionId: p.id, shotId: d1.sh.id }, result: { takeId: 'take-x', qaOk: true, unverifiedLines: 0, takeUnverified: true, awaitingReview: true }, updatedAt: '2026-10-03T08:50:00.000Z' }),
    job({ id: 'job-create', type: 'CREATE_CHARACTER', status: 'AWAITING_REVIEW', payload: { mode: 'AUTO' }, result: { characterId: rami.id, steps: [{ step: 'appearance', status: 'failed', failureClass: 'PROVIDER' }], awaitingReview: true }, updatedAt: '2026-10-03T09:00:00.000Z' }),
  ];
  return { ...f, jobs, hana, salam, rami, p, d1, d2 };
}

describe('waitingDecisions (B8)', () => {
  const f = studio();
  const d = waitingDecisions(f.state, f.pipeline.productions, f.jobs);
  it('lists every kind once, with its subject and the route to decide it', () => {
    expect(d.complete).toBe(true);
    expect(decisionCounts(d)).toEqual({ stage: 1, image: 2, line: 2, take: 1, pass: 1, character: 1 });
    expect(d.count).toBe(8);
    expect(d.items.find((x) => x.kind === 'stage')).toMatchObject({ id: 'stage:paper-boats:STORY', subject: { productionId: 'paper-boats', stage: 'STORY' }, href: '/production#needs-you' });
    expect(d.items.filter((x) => x.kind === 'image').map((x) => x.id)).toEqual([`image:${f.hana.id}`, `image:${f.salam.id}`]);
    const lines = d.items.filter((x) => x.kind === 'line');
    expect(lines.map((x) => x.id)).toEqual(['line:job-dialogue:' + f.d1.d.id, 'line:job-dialogue:' + f.d2.d.id]);
    expect(lines[0]).toMatchObject({ subject: { productionId: 's1e1', shotId: f.d1.sh.id, lineId: f.d1.d.id, characterId: f.d1.d.characterId, jobId: 'job-dialogue' }, since: '2026-10-03T08:15:00.000Z', href: `/shows/last-sip/seasons/last-sip-s1/episodes/s1e1/shots/${f.d1.sh.id}` });
    expect(lines[0].title).toMatch(/: “You could sleep at home like a normal person\.”$/);
    expect(d.items.find((x) => x.kind === 'take')).toMatchObject({ id: 'take:job-take:take-x', subject: { shotId: f.d1.sh.id, takeId: 'take-x', jobId: 'job-take' } });
    expect(d.items.find((x) => x.kind === 'pass')).toMatchObject({ id: 'pass:job-produce', title: 'The Opening Hour', subject: { productionId: 's1e1', jobId: 'job-produce' }, href: '/shows/last-sip/seasons/last-sip-s1/episodes/s1e1/production' });
    expect(d.items.find((x) => x.kind === 'character')).toMatchObject({ id: 'character:job-create', title: 'Rami', subject: { characterId: f.rami.id, jobId: 'job-create' }, href: `/characters/${f.rami.id}` });
  });
  it('a CREATE_CHARACTER run whose draft image is already listed, or whose identity was approved or locked since, is not a decision', () => {
    const pointAt = (id: string) => f.jobs.map((j) => (j.id === 'job-create' ? { ...j, result: { ...j.result, characterId: id } } : j));
    const d2 = waitingDecisions(f.state, f.pipeline.productions, pointAt(f.hana.id));
    expect(decisionCounts(d2).character).toBe(0);
    expect(d2.count).toBe(7);
    // Karim is locked by use, Abu Samir approved: the studio of 2026-10-03 had such a stale run (Elias Moore)
    expect(decisionCounts(waitingDecisions(f.state, f.pipeline.productions, pointAt('karim'))).character).toBe(0);
    expect(decisionCounts(waitingDecisions(f.state, f.pipeline.productions, pointAt('abu-samir'))).character).toBe(0);
  });
  it('a dialogue job whose recordings were replaced since still counts once, on the production map', () => {
    const state = { ...f.state, assets: f.state.assets.filter((a) => !a.id.startsWith('rec-')) };
    const d2 = waitingDecisions(state, f.pipeline.productions, f.jobs);
    const line = d2.items.filter((x) => x.kind === 'line');
    expect(line).toHaveLength(1);
    expect(line[0]).toMatchObject({ id: 'line:job-dialogue', href: '/shows/last-sip/seasons/last-sip-s1/episodes/s1e1/production' });
  });
  it('is incomplete while the pipeline has not answered; a finished production’s gate is not a decision', () => {
    expect(waitingDecisions(f.state, null, f.jobs).complete).toBe(false);
    const state = { ...f.state, productions: f.state.productions.map((p) => (p.id === 'paper-boats' ? { ...p, stage: 'COMPLETE' as const } : p)) };
    expect(decisionCounts(waitingDecisions(state, f.pipeline.productions, f.jobs)).stage).toBe(0);
  });
  it('the shell reads the very same function; the sample and the empty studio have nothing waiting', () => {
    expect(shellDecisions).toBe(waitingDecisions);
    for (const kind of ['sample', 'empty'] as const) { const s = buildFixture(kind); expect(waitingDecisions(s.state, s.pipeline.productions, s.jobs).count).toBe(0); }
  });
  it('a locked character (filmed) and a character being redrawn are never image decisions', () => {
    const drawing = [...f.jobs, job({ id: 'redraw', type: 'CHARACTER_APPEARANCE', status: 'GENERATING', characterId: f.hana.id, payload: { characterId: f.hana.id } })];
    expect(decisionCounts(waitingDecisions(f.state, f.pipeline.productions, drawing)).image).toBe(1);
    const layla = f.state.characters.find((c) => c.id === 'layla') as Character;
    expect(layla.canonicalImage?.status).toBe('DRAFT');
    expect(d.items.some((x) => x.kind === 'image' && x.subject.characterId === 'layla')).toBe(false);
  });
});
