import { describe, expect, it } from 'vitest';
import { MINIMAX_H3_API, MINIMAX_H3_LOCAL, continuationBudget, framesFor, guideAudioLatentSteps, guideFramesKept, guideLengths, resolveContinuation } from '@/domain/video-capability';
import { h3FrameCount, h3GuideClipFrames } from '@/server/workflows/minimax-h3';
import { resolveShotPack, boundaryProblem } from '@/server/production/shot-pack';
import { validateClientCommand } from '@/domain/commands';
import { fixture, shotOf } from './continuity-fixture';

/** Continuation settings are capability DATA (cloud directive §6): the numbers come from the engine's record, the
 *  studio and the shot choose within it, and a choice the engine cannot keep is set aside with a reason — never
 *  floored silently. */

describe('the MiniMax H3 capability record', () => {
  it('reproduces the node: 17k+5 grid snapped up into 124–362; guides kept as 1 frame below 5, else snapped down', () => {
    for (let s = 0.1; s < 16; s += 0.37) expect(framesFor(MINIMAX_H3_LOCAL, s)).toBe(h3FrameCount(s));
    expect(framesFor(MINIMAX_H3_LOCAL, 5)).toBe(124);
    expect(framesFor(MINIMAX_H3_LOCAL, 15.5)).toBe(362);
    expect([1, 4, 5, 21, 22, 38, 39, 40].map((n) => guideFramesKept(MINIMAX_H3_LOCAL, n))).toEqual([1, 1, 5, 5, 22, 22, 39, 39]);
    for (let n = 0; n < 60; n++) expect(guideFramesKept(MINIMAX_H3_LOCAL, n)).toBe(h3GuideClipFrames(n));
    expect(guideLengths(MINIMAX_H3_LOCAL, 39)).toEqual([5, 22, 39]);
    expect(guideAudioLatentSteps(MINIMAX_H3_LOCAL, 22)).toBe(36.67);
  });

  it('every continuation choice the engine offers is a length the node keeps', () => {
    for (const n of MINIMAX_H3_LOCAL.guides!.continuationChoices) expect(guideFramesKept(MINIMAX_H3_LOCAL, n)).toBe(n);
    expect(MINIMAX_H3_LOCAL.guides!.continuationChoices).toContain(MINIMAX_H3_LOCAL.guides!.defaultContinuationFrames);
  });

  it('the hosted engine has no guides: a continuation is lowered, never anchored', () => {
    expect(MINIMAX_H3_API.guides).toBeUndefined();
    expect(MINIMAX_H3_API.continuationLowering).toBe('LAST_FRAME_AS_FIRST');
    expect(resolveContinuation(MINIMAX_H3_API, { guideFrames: 39 })).toMatchObject({ guideFrames: 0, guideAudio: 'OFF' });
  });
});

describe('resolving the continuation choice (shot > studio > engine)', () => {
  it('the engine default when nobody chooses', () => {
    expect(resolveContinuation(MINIMAX_H3_LOCAL)).toEqual({ engine: 'minimax-h3-local', guideFrames: 22, guideAudio: 'AUTO', source: { guideFrames: 'ENGINE', guideAudio: 'ENGINE' }, problems: [] });
  });
  it('the studio, then the shot', () => {
    expect(resolveContinuation(MINIMAX_H3_LOCAL, { guideFrames: 39, guideAudio: 'OFF' })).toMatchObject({ guideFrames: 39, guideAudio: 'OFF', source: { guideFrames: 'STUDIO', guideAudio: 'STUDIO' } });
    expect(resolveContinuation(MINIMAX_H3_LOCAL, { guideFrames: 39 }, { guideFrames: 5, guideAudio: 'ON' })).toMatchObject({ guideFrames: 5, guideAudio: 'ON', source: { guideFrames: 'SHOT', guideAudio: 'SHOT' } });
  });
  it('a length the node would floor (21 → 5) is set aside with the reason, the previous choice stands', () => {
    const r = resolveContinuation(MINIMAX_H3_LOCAL, { guideFrames: 39 }, { guideFrames: 21 });
    expect(r.guideFrames).toBe(39);
    expect(r.problems[0]).toMatch(/21-frame guide; minimax-h3-local keeps 5 of it/);
  });
  it('the budget after the guide follows the chosen length', () => {
    expect(continuationBudget(MINIMAX_H3_LOCAL, 39, 14)).toMatchObject({ budgetFrames: 323, neededFrames: 336, fits: false });
    expect(continuationBudget(MINIMAX_H3_LOCAL, 5, 14)).toMatchObject({ budgetFrames: 357, fits: true });
  });
});

describe('the shot pack reads the resolved choice', () => {
  it('a studio choice of 39 frames cuts a 39-frame tail and trims 39', () => {
    const { state, p } = fixture();
    // the previous take must show at least 39 frames in the cut (it shows 5 s = 120)
    const pack = resolveShotPack({ ...state, settings: { ...state.settings, generation: { continuation: { guideFrames: 39 } } } }, p, shotOf(p, 's12'), { backend: 'local' });
    expect(pack.opening).toMatchObject({ kind: 'TAIL', frames: 39 });
    expect(pack.trimStartFrames).toBe(39);
    expect(pack.continuation.source.guideFrames).toBe('STUDIO');
  });
  it('a shot choice OFF anchors the tail without its sound, and says why', () => {
    const { state, p } = fixture({ shots: (shots) => shots.map((s) => (s.id === 's12' ? { ...s, continuation: { guideAudio: 'OFF' as const } } : s)) });
    const pack = resolveShotPack(state, p, shotOf(p, 's12'), { backend: 'local' });
    expect(pack.opening).toMatchObject({ kind: 'TAIL', frames: 22, withAudio: false });
    expect(pack.notes.join(' ')).toMatch(/without its sound \(the shot chose it\)/);
  });
  it('an invalid shot choice falls back and the pack carries the problem', () => {
    const { state, p } = fixture({ shots: (shots) => shots.map((s) => (s.id === 's12' ? { ...s, continuation: { guideFrames: 30 } } : s)) });
    const pack = resolveShotPack(state, p, shotOf(p, 's12'), { backend: 'local' });
    expect(pack.trimStartFrames).toBe(22);
    expect(pack.continuation.problems).toHaveLength(1);
  });
  it('a longer chosen guide makes a short previous window unusable (refused, not floored)', () => {
    const { state, p } = fixture({ shots: (shots) => shots.map((s) => (s.id === 's12' ? { ...s, boundary: 'continuous' as const, continuation: { guideFrames: 39 } } : s.id === 's11' ? { ...s, takes: s.takes.map((t) => ({ ...t, durationSeconds: 1.5 })) } : s)) });
    expect(boundaryProblem(state, p, shotOf(p, 's12'))).toMatch(/fewer than the 39-frame guide/);
  });
  it('the commands accept a continuation choice on a shot and in the settings, and refuse junk', () => {
    expect(() => validateClientCommand('updateShot', ['prod-cont', 's12', { continuation: { guideFrames: 39, guideAudio: 'AUTO' } }])).not.toThrow();
    expect(() => validateClientCommand('updateShot', ['prod-cont', 's12', { continuation: { guideAudio: 'LOUD' } }])).toThrow();
    expect(() => validateClientCommand('updateSettings', [{ generation: { continuation: { guideFrames: 5 } } }])).not.toThrow();
  });
});
