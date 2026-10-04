import { describe, expect, it } from 'vitest';
import { closeFramingFor, cutMargin, cutTime, limitCuts, markTime, planCoverage, reconcileCast, scrubSpeech, timeBeats } from '@/server/story/beats';
import { fitDurations } from '@/server/story/engine';

/** The staging helpers (the techniques taken from MinimaxStoryBuilder, docs/research/STORYBUILDER-INTEGRATION.md §d):
 *  beat lengths as ratios tiled over the shot with a one-second floor, in-take cuts policed by margins and count,
 *  the cast reconciled with the actions, speech scrubbed from silent shots, speaking faces framed close, the scene's
 *  beats covered. */

describe('timeBeats', () => {
  it('keeps the ratios, tiles the shot exactly, starts at 0', () => {
    const b = timeBeats([{ seconds: 1, action: 'a' }, { seconds: 3, action: 'b' }, { seconds: 4, action: 'c' }], 16);
    expect(b.map((x) => x.at)).toEqual([0, 2, 8]);
    expect(b.map((x) => x.action)).toEqual(['a', 'b', 'c']);
  });
  it('lifts a beat under a second, taking the time from the longest beats', () => {
    const b = timeBeats([{ seconds: 0.2, action: 'glance' }, { seconds: 5, action: 'cross the room' }, { seconds: 4.8, action: 'sit' }], 5);
    // ratios would give 0.1 s to the glance: it gets 1 s, taken from the longest beat (2.5 s → 1.6 s)
    expect(b.map((x) => x.at)).toEqual([0, 1, 2.6]);
  });
  it('a single beat spans the shot; nothing in, nothing out; a cut travels with its beat', () => {
    expect(timeBeats([{ seconds: 9, action: 'x' }], 5)).toEqual([{ at: 0, action: 'x' }]);
    expect(timeBeats([], 5)).toEqual([]);
    expect(timeBeats([{ seconds: 1, action: 'a' }, { seconds: 1, action: 'b', cut: { camera: 'close on her hands' } }], 6)[1]).toEqual({ at: 3, action: 'b', cut: { camera: 'close on her hands' } });
  });
});

describe('limitCuts', () => {
  const beats = (ats: Array<[number, boolean, string?]>) => ats.map(([at, cut, locationId], i) => ({ at, action: `b${i}`, ...(cut ? { cut: { camera: 'reverse', ...(locationId ? { locationId } : {}) } } : {}) }));
  it('the margin is min(3 s, a fifth of the shot), 2.5 s for a montage', () => {
    expect(cutMargin(10)).toBe(2);
    expect(cutMargin(15)).toBe(3);
    expect(cutMargin(15, 'MONTAGE')).toBe(2.5);
  });
  it('drops a cut inside the margins, keeps at most two, two never closer than the margin', () => {
    const out = limitCuts(beats([[0, true], [1, true], [4, true], [5, true], [9, true]]), 10);
    expect(out.map((b) => Boolean(b.cut))).toEqual([false, false, true, false, false]);
    // 4 and 5 are closer than the 2 s margin: the earlier wins; 9 is inside the end margin (10 − 2 = 8)
    const two = limitCuts(beats([[0, false], [3, true], [6, true], [8, true]]), 15);
    expect(two.map((b) => Boolean(b.cut))).toEqual([false, true, true, false]); // 3 and 6 kept (≥ 3 s apart), 8 is the third
  });
  it('a cut to another place ranks first; a dwell has no cuts; a beat that loses its cut keeps its action', () => {
    const out = limitCuts(beats([[0, false], [3, true], [6, true], [9, true, 'loc-b']]), 15);
    expect(out.map((b) => b.cut?.locationId ?? (b.cut ? 'same' : null))).toEqual([null, 'same', null, 'loc-b']);
    const dwell = limitCuts(beats([[0, false], [5, true]]), 10, { pace: 'DWELL' });
    expect(dwell).toEqual([{ at: 0, action: 'b0' }, { at: 5, action: 'b1' }]);
  });
  it('the fit keeps the beats’ ratios when the shots are stretched', () => {
    const out = fitDurations([{ durationSeconds: 5, staging: { beats: [{ at: 0, action: 'a' }, { at: 2, action: 'b' }] } }, { durationSeconds: 5 }], 20);
    expect(out[0].durationSeconds).toBe(10);
    expect(out[0].staging!.beats!.map((b) => b.at)).toEqual([0, 4]);
  });
});

describe('reconcileCast', () => {
  const cast = [{ id: 'a', name: 'Layla', nameAr: 'ليلى' }, { id: 'b', name: 'Abu Kareem', nameAr: 'أبو كريم' }, { id: 'c', name: 'Sam' }];
  it('whoever the actions name is in the cast, in either script; nobody is removed', () => {
    expect(reconcileCast(['a'], ['Layla sets the box down. Abu Kareem looks up.'], cast)).toEqual({ characterIds: ['a', 'b'], added: ['b'] });
    expect(reconcileCast(['a'], ['أبو كريم يرفع راسه'], cast)).toEqual({ characterIds: ['a', 'b'], added: ['b'] });
    expect(reconcileCast(['a', 'c'], ['She waits.'], cast)).toEqual({ characterIds: ['a', 'c'], added: [] });
    // a name inside another word is not a mention
    expect(reconcileCast([], ['Samantha waits.'], cast).added).toEqual([]);
  });
});

describe('scrubSpeech', () => {
  it('removes quoted words, turns speech verbs into silent action, clamps the mouths', () => {
    expect(scrubSpeech('She says "we close soon" and whispers to him.')).toBe('She stays silent and leans close to him. Mouths stay closed; nobody speaks.');
    expect(scrubSpeech('He shouts across the yard, then asks her name.')).toBe('He gestures sharply across the yard, then looks a question at her name. Mouths stay closed; nobody speaks.');
    expect(scrubSpeech('')).toBe('Mouths stay closed; nobody speaks.');
    expect(scrubSpeech('A quiet moment; mouths stay closed.')).toBe('A quiet moment; mouths stay closed.');
    expect(scrubSpeech('She talks <d>[English] Hi.</d> and laughs.')).not.toMatch(/talks|laughs|<d>/);
  });
});

describe('closeFramingFor', () => {
  it('a speaking face is framed close: wide sizes tighten, a pair becomes a two-shot, silent shots keep their size', () => {
    expect(closeFramingFor('WIDE', { people: 1, dialogue: true })).toBe('MEDIUM_CLOSE_UP');
    expect(closeFramingFor('EXTREME_WIDE', { people: 2, dialogue: true })).toBe('TWO_SHOT');
    expect(closeFramingFor('MEDIUM', { people: 1, dialogue: true })).toBe('MEDIUM');
    expect(closeFramingFor('OVER_THE_SHOULDER', { people: 2, dialogue: true })).toBe('OVER_THE_SHOULDER');
    expect(closeFramingFor('WIDE', { people: 1, dialogue: false })).toBe('WIDE');
    expect(closeFramingFor('WIDE', { people: 0, dialogue: true })).toBe('WIDE');
  });
});

describe('planCoverage', () => {
  it('a written beat is covered by a shot that carries its line or enough of its words', () => {
    const scene = [{ id: 'b1', action: 'Layla sets the heavy parcel on the counter and waits', lines: [{ id: 'l1' }] }, { id: 'b2', action: 'Abu Kareem counts the coins twice before answering', lines: [] }, { id: 'b3', action: 'The cat knocks the lamp over', lines: [] }];
    const shots = [
      { action: 'She waits.', dialogue: [{ id: 'l1' }] },
      { action: 'He counts the coins, slowly, twice.', dialogue: [], staging: { actions: ['counts coins'] } },
      { action: 'Rain on the window.', dialogue: [] },
    ];
    expect(planCoverage(scene, shots).uncovered).toEqual([{ id: 'b3', action: 'The cat knocks the lamp over' }]);
  });
});

describe('time marks', () => {
  it('[M:SS] for a mark, MM:SS.mmm for a cut', () => {
    expect(markTime(0)).toBe('0:00'); expect(markTime(65.4)).toBe('1:05');
    expect(cutTime(5)).toBe('00:05.000'); expect(cutTime(62.25)).toBe('01:02.250');
  });
});
