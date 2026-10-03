import { describe, expect, it } from 'vitest';
import { keepLineRecordings } from '@/domain/actions';
import { CLIENT_COMMANDS, runCommand, validateClientCommand, type Command } from '@/domain/commands';
import { earReason, openReviewLines } from '@/domain/line-review';
import { waitingDecisions } from '@/studio/selectors/decisions';
import { buildFixture } from '../../scripts/v4-fixture';
import type { Asset } from '@/domain/types';
import type { Job } from '@/domain/jobs';

/** SETTLING A DIALOGUE REVIEW from the shot workspace: "keep this recording" for lines the voice check flagged —
 *  recorded in the recording's provenance, and the shared decisions selector drops the lines once none is open. */

const recording = (id: string, jobId: string, check: { ok: boolean } | null): Asset => ({ id, kind: 'AUDIO', src: `/api/media/${id}`, label: id, tags: ['dialogue', 'voice'], sample: false, origin: 'GENERATED', jobId, provenance: { engine: 'indextts', check }, createdAt: '2026-10-03T07:20:00.000Z' });
const reviewJob: Job = { id: 'job-dialogue', type: 'DIALOGUE_AUDIO', status: 'AWAITING_REVIEW', priority: 0, payload: { productionId: 's1e1' }, productionId: 's1e1', attempts: 1, maxAttempts: 2, cancelRequested: false, result: { lines: 3, flagged: 1, unverified: 1, awaitingReview: true }, createdAt: '2026-10-03T07:00:00.000Z', updatedAt: '2026-10-03T08:15:00.000Z' };

function studio() {
  const f = buildFixture('states');
  const s = f.state;
  const p = s.productions.find((x) => x.id === 's1e1')!;
  const [d1, d2, d3] = p.shots.flatMap((sh) => sh.dialogue.map((d) => ({ sh, d })));
  d1.d.audioAssetId = 'rec-1'; d2.d.audioAssetId = 'rec-2'; d3.d.audioAssetId = 'rec-3';
  s.assets.push(recording('rec-1', 'job-dialogue', { ok: false }), recording('rec-2', 'job-dialogue', null), recording('rec-3', 'job-dialogue', { ok: true }));
  return { s, p, d1, d2, d3, jobs: [...f.jobs, reviewJob], pipeline: f.pipeline.productions };
}
const linesItem = (st: ReturnType<typeof studio>, state = st.s) => waitingDecisions(state, st.pipeline, st.jobs).items.find((x) => x.kind === 'lines');
const cmd = (args: unknown[]): Command => ({ name: 'keepLineRecordings', args: args as Command['args'], seed: 'seed-keep', at: '2026-10-04T10:00:00.000Z' });

describe('keepLineRecordings (a client command)', () => {
  it('is browser-allowed with the shape (productionId, [{ shotId, lineId }…], { by? })', () => {
    const f = studio();
    expect(CLIENT_COMMANDS).toContain('keepLineRecordings');
    expect(() => validateClientCommand('keepLineRecordings', [f.p.id, [{ shotId: f.d1.sh.id, lineId: f.d1.d.id }]])).not.toThrow();
    expect(() => validateClientCommand('keepLineRecordings', [f.p.id, [{ shotId: f.d1.sh.id, lineId: f.d1.d.id }], { by: 'Mustafa' }])).not.toThrow();
    expect(() => validateClientCommand('keepLineRecordings', [f.p.id, []])).toThrow();
    expect(() => validateClientCommand('keepLineRecordings', [f.p.id, [{ shotId: 'x' }]])).toThrow();
    expect(() => validateClientCommand('keepLineRecordings', [f.p.id, [{ shotId: 'x', lineId: 'y', review: 'forged' }]])).toThrow();
  });

  it('records who, when and KEPT on the line\'s current recording, and nothing else', () => {
    const f = studio();
    const next = runCommand(f.s, cmd([f.p.id, [{ shotId: f.d1.sh.id, lineId: f.d1.d.id }, { shotId: f.d2.sh.id, lineId: f.d2.d.id }], { by: 'Mustafa' }])).state;
    const rec1 = next.assets.find((a) => a.id === 'rec-1')!;
    expect(rec1.provenance).toMatchObject({ engine: 'indextts', check: { ok: false }, review: { decision: 'KEPT', by: 'Mustafa', at: '2026-10-04T10:00:00.000Z', shotId: f.d1.sh.id, lineId: f.d1.d.id } });
    expect(next.assets.find((a) => a.id === 'rec-2')!.provenance).toMatchObject({ review: { decision: 'KEPT' } });
    expect(next.assets.find((a) => a.id === 'rec-3')).toEqual(f.s.assets.find((a) => a.id === 'rec-3'));
    expect(next.productions).toBe(f.s.productions);
    expect(earReason(rec1)).toBeUndefined();
    // keeping again changes nothing (the first decision stands)
    expect(keepLineRecordings(next, f.p.id, [{ shotId: f.d1.sh.id, lineId: f.d1.d.id }])).toBe(next);
  });

  it('refuses a line that does not exist or has no recording', () => {
    const f = studio();
    expect(() => keepLineRecordings(f.s, f.p.id, [{ shotId: f.d1.sh.id, lineId: 'nope' }])).toThrow(/not found/);
    f.d3.d.audioAssetId = undefined;
    expect(() => keepLineRecordings(f.s, f.p.id, [{ shotId: f.d3.sh.id, lineId: f.d3.d.id }])).toThrow(/no recording/);
    expect(() => keepLineRecordings(f.s, f.p.id, [])).toThrow(/at least one/);
  });
});

describe('waitingDecisions drops what was decided', () => {
  it('kept lines leave the lines item; with every flagged line kept the item is gone', () => {
    const f = studio();
    expect(linesItem(f)?.lines?.map((l) => l.lineId)).toEqual([f.d1.d.id, f.d2.d.id]);
    const one = runCommand(f.s, cmd([f.p.id, [{ shotId: f.d1.sh.id, lineId: f.d1.d.id }]])).state;
    expect(linesItem(f, one)?.lines?.map((l) => l.lineId)).toEqual([f.d2.d.id]);
    const both = runCommand(one, cmd([f.p.id, [{ shotId: f.d2.sh.id, lineId: f.d2.d.id }]])).state;
    expect(linesItem(f, both)).toBeUndefined();
    expect(openReviewLines(both.productions.find((x) => x.id === f.p.id)!, new Map(both.assets.map((a) => [a.id, a])), 'job-dialogue')).toEqual([]);
  });

  it('a line recorded again (its current recording is another job\'s) is decided too', () => {
    const f = studio();
    f.s.assets.push(recording('rec-1b', 'job-again', { ok: true }), recording('rec-2b', 'job-again', { ok: true }));
    f.d1.d.audioAssetId = 'rec-1b';
    expect(linesItem(f)?.lines?.map((l) => l.lineId)).toEqual([f.d2.d.id]);
    f.d2.d.audioAssetId = 'rec-2b';
    expect(linesItem(f)).toBeUndefined();
  });
});
