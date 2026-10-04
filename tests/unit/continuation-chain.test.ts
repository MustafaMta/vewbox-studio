import { describe, expect, it } from 'vitest';
import type { Production, Shot, StudioState, Take } from '@/domain/types';
import { runCommand, validateClientCommand, type Command } from '@/domain/commands';
import { continuationStale, reconcileContinuationChain, staleContinuations, staleVerdict } from '@/domain/continuation';
import { buildAudioTimeline } from '@/domain/timeline';
import { mixPlanOf } from '@/server/media/mix';
import { fixture, shotOf, TAKE_A } from './continuity-fixture';

/** THE STALE CHAIN (gap V3): a continuation take is anchored on one take of the shot before it. When that shot's
 *  choice changes, every continuation downstream is marked stale by the same command (pure reducers, so the browser
 *  computes the same flag), cleared when the chain is whole again, refused by the cut unless overridden, and
 *  re-conditioned by PRODUCE (tests/unit/produce-pilot.test.ts). */

/** every take its own video file (one file routed twice would be an audio problem of its own) */
const take = (id: string, over: Partial<Take> = {}): Take => ({ ...TAKE_A, id, label: `Take ${id.slice(-1)}`, assetId: `vid-${id.slice(5)}`, ...over });
const AT = '2026-10-04T12:00:00.000Z';
const run = (s: StudioState, name: string, args: unknown[], at = AT) => runCommand(s, { name, args, seed: `s-${name}-${Math.random()}`, at } as unknown as Command).state;

/** A: a1 (chosen), a2; B continues a1 (b1 chosen); C continues b1 (c1 chosen); the next scene's shot is a cut. */
function chain(): { state: StudioState; p: Production } {
  const { state, p } = fixture({ shots: (shots) => shots.map((s) => {
    if (s.id === 's11') return { ...s, takes: [take('take-a1'), take('take-a2')], selectedTakeId: 'take-a1' };
    if (s.id === 's12') return { ...s, dialogue: [], takes: [take('take-b1', { relation: 'CONTINUATION', continuesTakeId: 'take-a1', trimStartFrames: 22 })], selectedTakeId: 'take-b1' };
    if (s.id === 's13') return { ...s, continuity: { ...s.continuity!, relationToPrevious: 'CONTINUATION' }, takes: [take('take-c1', { relation: 'CONTINUATION', continuesTakeId: 'take-b1', trimStartFrames: 22 })], selectedTakeId: 'take-c1' };
    return { ...s, takes: [take('take-d1')], selectedTakeId: 'take-d1' };
  }) });
  const vid = state.assets.find((a) => a.id === 'vid-a')!;
  return { state: { ...state, assets: [...state.assets, ...['a1', 'a2', 'b1', 'c1', 'd1'].map((x) => ({ ...vid, id: `vid-${x}`, provenance: { ...vid.provenance, path: `vid/vid-${x}.mp4` } }))] }, p };
}
const prod = (s: StudioState, id: string) => s.productions.find((x) => x.id === id)!;
const takeIn = (s: StudioState, pid: string, shotId: string, takeId: string) => shotOf(prod(s, pid), shotId).takes.find((t) => t.id === takeId)!;

describe('reconcileContinuationChain (pure)', () => {
  it('a whole chain is not stale; a re-selected predecessor marks the continuation and everything downstream', () => {
    const { p } = chain();
    expect(reconcileContinuationChain(p, AT)).toBe(p); // same object: nothing to change
    expect(staleContinuations(p)).toEqual([]);
    const reselected = { ...p, shots: p.shots.map((s) => (s.id === 's11' ? { ...s, selectedTakeId: 'take-a2' } : s)) };
    const r = reconcileContinuationChain(reselected, AT);
    expect(r).not.toBe(reselected);
    const b1 = shotOf(r, 's12').takes[0]; const c1 = shotOf(r, 's13').takes[0];
    expect(b1.stale).toEqual({ since: AT, because: 'PREDECESSOR_RESELECTED', previousShotId: 's11', expectedTakeId: 'take-a2', detail: 'shot 1 now chooses Take 2 (take-a2); this take continues take-a1' });
    expect(c1.stale).toMatchObject({ since: AT, because: 'UPSTREAM_STALE', previousShotId: 's12', expectedTakeId: 'take-b1', detail: expect.stringMatching(/Take 1 is itself stale \(shot 1 now chooses Take 2/) });
    expect(staleContinuations(r).map((s) => s.id)).toEqual(['s12', 's13']);
    // marking again changes nothing (the since stays)
    expect(reconcileContinuationChain(r, '2026-10-05T00:00:00.000Z')).toBe(r);
    // a take that is not a continuation never carries the mark
    expect(shotOf(r, 's11').takes.every((t) => !t.stale)).toBe(true);
  });

  it('staleVerdict names the predecessor with no chosen take, and is empty across scenes', () => {
    const { p } = chain();
    const b1 = shotOf(p, 's12').takes[0];
    expect(staleVerdict(b1, { ...shotOf(p, 's11'), selectedTakeId: undefined }, AT)).toMatchObject({ because: 'PREDECESSOR_RESELECTED', expectedTakeId: undefined, detail: expect.stringMatching(/has no chosen take/) });
    expect(staleVerdict(b1, undefined, AT)).toBeUndefined();
    expect(staleVerdict({ ...b1, relation: 'CUT' }, shotOf(p, 's11'), AT)).toBeUndefined();
  });
});

describe('through the commands (what a page and the server both compute)', () => {
  it('selectTake on the predecessor marks the chain; selecting the original take again clears it', () => {
    const { state, p } = chain();
    const s1 = run(state, 'selectTake', [p.id, 's11', 'take-a2']);
    expect(continuationStale(shotOf(prod(s1, p.id), 's12'))).toBe(true);
    expect(continuationStale(shotOf(prod(s1, p.id), 's13'))).toBe(true);
    expect(takeIn(s1, p.id, 's12', 'take-b1').stale).toMatchObject({ because: 'PREDECESSOR_RESELECTED', expectedTakeId: 'take-a2', since: AT });
    const s2 = run(s1, 'selectTake', [p.id, 's11', 'take-a1'], '2026-10-05T00:00:00.000Z');
    expect(takeIn(s2, p.id, 's12', 'take-b1').stale).toBeUndefined();
    expect(takeIn(s2, p.id, 's13', 'take-c1').stale).toBeUndefined();
    expect(staleContinuations(prod(s2, p.id))).toEqual([]);
  });

  it('a fresh continuation of the new choice replaces the stale take: it is whole, and the shot after it is stale until it is remade too', () => {
    const { state, p } = chain();
    const s1 = run(state, 'selectTake', [p.id, 's11', 'take-a2']);
    // the worker's regenerated take for shot 2, continuing take-a2, chosen as it is added (PRODUCE passes select)
    const s2 = run(s1, 'addTake', [p.id, 's12', { id: 'take-b2', assetId: 'vid-a', provider: 'MINIMAX', relation: 'CONTINUATION', continuesTakeId: 'take-a2', trimStartFrames: 22, select: 'ALWAYS' }]);
    const b = shotOf(prod(s2, p.id), 's12');
    expect(b.selectedTakeId).toBe('take-b2');
    expect(b.takes.find((t) => t.id === 'take-b2')!.stale).toBeUndefined();
    expect(b.takes.find((t) => t.id === 'take-b1')!.stale).toMatchObject({ because: 'PREDECESSOR_RESELECTED' });
    expect(continuationStale(b)).toBe(false);
    // shot 3 continued take-b1, which is no longer chosen
    expect(takeIn(s2, p.id, 's13', 'take-c1').stale).toMatchObject({ because: 'PREDECESSOR_RESELECTED', previousShotId: 's12', expectedTakeId: 'take-b2' });
    const s3 = run(s2, 'addTake', [p.id, 's13', { id: 'take-c2', assetId: 'vid-a', provider: 'MINIMAX', relation: 'CONTINUATION', continuesTakeId: 'take-b2', trimStartFrames: 22, select: 'ALWAYS' }]);
    expect(staleContinuations(prod(s3, p.id))).toEqual([]);
  });

  it('rejecting, rating REJECTED or removing the predecessor’s chosen take marks the chain; a cut after the chain is never marked', () => {
    const { state, p } = chain();
    expect(continuationStale(shotOf(prod(run(state, 'rejectTake', [p.id, 's11', 'take-a1', 'bad']), p.id), 's12'))).toBe(true);
    expect(continuationStale(shotOf(prod(run(state, 'rateTake', [p.id, 's11', 'take-a1', 'REJECTED']), p.id), 's12'))).toBe(true);
    const removed = run(state, 'removeTake', [p.id, 's11', 'take-a1']);
    expect(takeIn(removed, p.id, 's12', 'take-b1').stale).toMatchObject({ detail: expect.stringMatching(/has no chosen take/) });
    // s21 is in another scene (generated as a cut): never stale whatever happens before it
    expect(shotOf(prod(removed, p.id), 's21').takes.every((t) => !t.stale)).toBe(true);
  });

  it('a page cannot write the mark (an uploaded take carries no studio fields)', () => {
    const { p } = chain();
    expect(() => validateClientCommand('addTake', [p.id, 's12', { assetId: 'vid-a', provider: 'UPLOAD', stale: { since: AT } }])).toThrow(/stale/);
  });
});

describe('the cut refuses a stale join', () => {
  const assets = (s: StudioState) => s.assets;
  it('STALE_JOIN is a problem the mix plan refuses as INCONSISTENT_PLAN; with the override it is a hard cut, noted', () => {
    const { state, p } = chain();
    const stale = prod(run(state, 'selectTake', [p.id, 's11', 'take-a2']), p.id);
    const tl = buildAudioTimeline(stale, assets(state));
    expect(tl.problems.map((x) => x.kind)).toEqual(['STALE_JOIN', 'STALE_JOIN']);
    expect(tl.problems[0].detail).toMatch(/shot s12: its take Take 1 is a stale continuation \(shot 1 now chooses Take 2/);
    expect(() => mixPlanOf(p, tl)).toThrow(expect.objectContaining({ failureClass: 'INCONSISTENT_PLAN' }));
    const over = buildAudioTimeline(stale, assets(state), { allowStaleJoins: true });
    expect(over.problems).toEqual([]);
    expect(over.shots.filter((s) => s.join === 'HARD').map((s) => s.shotId)).toEqual(['s12', 's13']);
    expect(over.notes.join('\n')).toMatch(/assembled anyway as a hard cut \(producer override\)/);
    expect(over.notes.join('\n')).not.toMatch(/cross-fades/);
    // the cue of a stale take starts on its frame, with the edge fade only (no cross-fade pulled before the join)
    const b = over.cues.find((c) => c.id === 'take-take-b1')!;
    expect(b).toMatchObject({ startSample: 124 * 2000, sourceOffsetSamples: 22 * 2000, fadeInSamples: 480 });
    expect(() => mixPlanOf(p, over)).not.toThrow();
    // a whole chain: no problem, the joins cross-fade
    const whole = buildAudioTimeline(prod(state, p.id), assets(state));
    expect(whole.problems).toEqual([]);
    expect(whole.shots.map((s) => s.join)).toEqual([undefined, 'TRIM', 'TRIM', undefined]);
  });
});

describe('fixture sanity', () => {
  it('the chain fixture is a continuation chain in one scene', () => {
    const { p } = chain();
    const ids = (sh: Shot) => sh.takes.map((t) => t.continuesTakeId);
    expect(ids(shotOf(p, 's12'))).toEqual(['take-a1']);
    expect(ids(shotOf(p, 's13'))).toEqual(['take-b1']);
  });
});
