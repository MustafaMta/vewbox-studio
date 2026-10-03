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
  it('lists one item per thing the producer decides, with its subject and the route to decide it', () => {
    expect(d.complete).toBe(true);
    expect(decisionCounts(d)).toEqual({ stage: 1, image: 2, lines: 1, take: 1, pass: 1, character: 1 });
    expect(d.count).toBe(7);
    expect(d.items.find((x) => x.kind === 'stage')).toMatchObject({ id: 'stage:paper-boats:STORY', subject: { productionId: 'paper-boats', stage: 'STORY' }, href: '/production#needs-you' });
    expect(d.items.filter((x) => x.kind === 'image').map((x) => x.id)).toEqual([`image:${f.hana.id}`, `image:${f.salam.id}`]);
    expect(d.items.find((x) => x.kind === 'take')).toMatchObject({ id: 'take:job-take:take-x', subject: { shotId: f.d1.sh.id, takeId: 'take-x', jobId: 'job-take' } });
    expect(d.items.find((x) => x.kind === 'pass')).toMatchObject({ id: 'pass:job-produce', title: 'The Opening Hour', subject: { productionId: 's1e1', jobId: 'job-produce' }, href: '/shows/last-sip/seasons/last-sip-s1/episodes/s1e1/production' });
    expect(d.items.find((x) => x.kind === 'character')).toMatchObject({ id: 'character:job-create', title: 'Rami', subject: { characterId: f.rami.id, jobId: 'job-create' }, href: `/characters/${f.rami.id}` });
  });
  it('the dialogue lines to hear are ONE decision per production, the lines inside it (passed and other jobs’ lines left out)', () => {
    const lines = d.items.filter((x) => x.kind === 'lines');
    expect(lines).toHaveLength(1);
    const it0 = lines[0];
    expect(it0).toMatchObject({ id: 'lines:s1e1', title: 'The Opening Hour', since: '2026-10-03T08:15:00.000Z', subject: { productionId: 's1e1', lineIds: [f.d1.d.id, f.d2.d.id], jobIds: ['job-dialogue'] } });
    // two shots: decided from the production map
    expect(it0.href).toBe('/shows/last-sip/seasons/last-sip-s1/episodes/s1e1/production');
    expect(it0.subject.shotId).toBeUndefined();
    expect(it0.lines!.map((l) => [l.lineId, l.shotId, l.reason, l.audioAssetId, l.jobId])).toEqual([[f.d1.d.id, f.d1.sh.id, 'DRIFTED', 'rec-1', 'job-dialogue'], [f.d2.d.id, f.d2.sh.id, 'NOT_HEARD', 'rec-2', 'job-dialogue']]);
    expect(it0.lines![0]).toMatchObject({ text: 'You could sleep at home like a normal person.', characterId: f.d1.d.characterId });
    expect(it0.lines![0].speaker).toBeTruthy();
  });
  it('lines of one shot open that shot’s workspace', () => {
    const state = { ...f.state, assets: f.state.assets.map((a) => (a.id === 'rec-2' ? { ...a, provenance: { check: { ok: true } } } : a)) };
    const one = waitingDecisions(state, f.pipeline.productions, f.jobs).items.find((x) => x.kind === 'lines')!;
    expect(one.lines).toHaveLength(1);
    expect(one).toMatchObject({ href: `/shows/last-sip/seasons/last-sip-s1/episodes/s1e1/shots/${f.d1.sh.id}`, subject: { shotId: f.d1.sh.id, lineIds: [f.d1.d.id] } });
  });
  it('today’s studio counts 4 (§6.7): two draft images, the lines to hear again, the parked production pass', () => {
    const today = f.jobs.filter((j) => ['job-dialogue', 'job-produce'].includes(j.id) || !j.id.startsWith('job-'));
    const d4 = waitingDecisions(f.state, [], today);
    expect(d4.count).toBe(4);
    expect(d4.items.map((x) => x.kind)).toEqual(['image', 'image', 'lines', 'pass']);
    expect(d4.items[2].lines).toHaveLength(2);
  });  it('a CREATE_CHARACTER run whose draft image is already listed, or whose identity was approved or locked since, is not a decision', () => {
    const pointAt = (id: string) => f.jobs.map((j) => (j.id === 'job-create' ? { ...j, result: { ...j.result, characterId: id } } : j));
    const d2 = waitingDecisions(f.state, f.pipeline.productions, pointAt(f.hana.id));
    expect(decisionCounts(d2).character).toBe(0);
    expect(d2.count).toBe(6);
    // Karim is locked by use, Abu Samir approved: the studio of 2026-10-03 had such a stale run (Elias Moore)
    expect(decisionCounts(waitingDecisions(f.state, f.pipeline.productions, pointAt('karim'))).character).toBe(0);
    expect(decisionCounts(waitingDecisions(f.state, f.pipeline.productions, pointAt('abu-samir'))).character).toBe(0);
  });
  it('a dialogue job whose recordings were replaced since still stands as the production’s lines item, on the production map', () => {
    const state = { ...f.state, assets: f.state.assets.filter((a) => !a.id.startsWith('rec-')) };
    const d2 = waitingDecisions(state, f.pipeline.productions, f.jobs);
    const lines = d2.items.filter((x) => x.kind === 'lines');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ id: 'lines:s1e1', lines: [], subject: { lineIds: [], jobIds: ['job-dialogue'] }, href: '/shows/last-sip/seasons/last-sip-s1/episodes/s1e1/production' });
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
