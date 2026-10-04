import { describe, expect, it } from 'vitest';
import { bindingOf, clipSecondsFor, continuationSource, continuationTail, effectiveRelation, guideProblems, plannedGuides, plateFor, resolveShotPack } from '@/server/production/shot-pack';
import type { Character } from '@/domain/types';
import { VideoGenerateInput } from '@/server/org/contracts';
import { fixture, shotOf, TAKE_A } from './continuity-fixture';

/** The shot pack decides, purely, what a take is conditioned on (docs/research/MINIMAX-CONTINUITY.md §3–4): the three
 *  relations are handled distinctly, the canonical images and the plate ride on every shot that shows them (a
 *  continuation included), the opening frame is a production asset (never an identity), and the hosted API gets a
 *  lowered request instead of a silently stripped one. */

describe('relations', () => {
  it('CONTINUATION inside a scene; a continuation across scenes is a cut; an unstated relation is a cut inside a scene and a story transition at its start', () => {
    const { p } = fixture();
    expect(effectiveRelation(p, shotOf(p, 's12')).relation).toBe('CONTINUATION');
    expect(effectiveRelation(p, shotOf(p, 's13')).relation).toBe('CUT');
    expect(effectiveRelation(p, shotOf(p, 's21'))).toMatchObject({ relation: 'CUT', planned: 'CONTINUATION' });
    const { p: q } = fixture({ shots: (shots) => shots.map((s) => ({ ...s, continuity: s.continuity && { ...s.continuity, relationToPrevious: undefined } })) });
    expect(effectiveRelation(q, shotOf(q, 's11')).relation).toBe('STORY_TRANSITION');
    expect(effectiveRelation(q, shotOf(q, 's13')).relation).toBe('CUT');
    expect(effectiveRelation(q, shotOf(q, 's21')).relation).toBe('STORY_TRANSITION');
  });

  it('CONTINUATION: the previous take’s last 22 frames WITH their sound at frame 0, the references re-applied, no opening frame', () => {
    const { state, p } = fixture();
    const pack = resolveShotPack(state, p, shotOf(p, 's12'), { backend: 'local' });
    expect(pack.relation).toBe('CONTINUATION');
    expect(pack.opening).toEqual({ kind: 'TAIL', shotId: 's11', takeId: 'take-a', assetId: 'vid-a', frames: 22, withAudio: true });
    expect(pack.trimStartFrames).toBe(22);
    expect(pack.graph).toBe('REF2VA');
    // identity: both characters' canonical images (not the drawn opening frame), then the dusk plate
    expect(pack.pictures.map((x) => [x.role, x.assetId])).toEqual([['SUBJECT', 'canon-a'], ['SUBJECT', 'canon-b'], ['LOCATION', 'plate-dusk']]);
    expect(pack.pictures.map((x) => x.binding)).toEqual(['<Picture 1> = <Subject 1>', '<Picture 2> = <Subject 2>', '<Picture 3> = <Subject 3>']);
    expect(pack.openingPicture).toBeUndefined();
    expect(plannedGuides(pack, { soundtrack: true })).toEqual([{ kind: 'TAIL', frameIdx: 0, frames: 22, audio: true }, { kind: 'SOUNDTRACK', frameIdx: 22, frames: 1, audio: true }]);
    expect(bindingOf(pack)).toMatchObject({ labels: 'LOCAL', subjects: [{ picture: 1 }, { picture: 2 }], location: { picture: 3 }, opening: { kind: 'TAIL', seconds: 22 / 24 } });
  });

  it('CUT: the drawn opening frame anchored at 0 and bound as the last picture; the ending frame at −1; canonical image + plate', () => {
    const { state, p } = fixture();
    const pack = resolveShotPack(state, p, shotOf(p, 's13'), { backend: 'local' });
    expect(pack.relation).toBe('CUT');
    expect(pack.opening).toEqual({ kind: 'FRAME', assetId: 'open-13' });
    expect(pack.pictures.map((x) => [x.role, x.assetId])).toEqual([['SUBJECT', 'canon-a'], ['LOCATION', 'plate-dusk'], ['OPENING_FRAME', 'open-13']]);
    expect(pack.openingPicture).toBe(3);
    expect(pack.pictures[2].binding).toBe('<Picture 3>');
    expect(pack.ending).toEqual({ assetId: 'end-13' });
    expect(pack.trimStartFrames).toBe(0);
    expect(plannedGuides(pack, { soundtrack: false }).map((g) => [g.kind, g.frameIdx])).toEqual([['OPENING_FRAME', 0], ['ENDING_FRAME', -1]]);
  });

  it('STORY_TRANSITION / a new scene: its own plate (no time-of-day state → master), its own opening frame, nothing from the previous shot', () => {
    const { state, p } = fixture();
    const pack = resolveShotPack(state, p, shotOf(p, 's21'), { backend: 'local' });
    expect(pack.opening).toEqual({ kind: 'FRAME', assetId: 'open-21' });
    expect(pack.location).toMatchObject({ assetId: 'plate-street', role: 'MASTER' });
    expect(pack.pictures.some((x) => x.assetId === 'vid-a')).toBe(false);
  });

  it('a continuation without lines anchors the tail WITHOUT its sound when the previous take speaks there (C1 vs C1c)', () => {
    const speaking = (to: number | undefined) => fixture({ shots: (shots) => shots.map((s) => (s.id === 's11' ? { ...s, dialogue: [{ id: 'l0', characterId: s.characterIds[0], text: 'Take what you need.' }], takes: [{ ...TAKE_A, ...(to === undefined ? {} : { soundtrack: { kind: 'DIALOGUE' as const, lines: [{ lineId: 'l0', from: 2.7, to }] } }) }] } : s.id === 's12' ? { ...s, dialogue: [] } : s)) });
    // the line ends at 4.76 s in a 5.17 s take: it reaches the last 22 frames (from 4.25 s)
    let { state, p } = speaking(4.76);
    let pack = resolveShotPack(state, p, shotOf(p, 's12'), { backend: 'local' });
    expect(pack.opening).toMatchObject({ kind: 'TAIL', withAudio: false });
    expect(pack.notes.join(' ')).toMatch(/speaks in its last 22 frames/);
    expect(plannedGuides(pack, { soundtrack: false })).toEqual([{ kind: 'TAIL', frameIdx: 0, frames: 22, audio: false }]);
    // a line that ends before the tail: the tail keeps its sound (room tone)
    ({ state, p } = speaking(3.5));
    expect(resolveShotPack(state, p, shotOf(p, 's12'), { backend: 'local' }).opening).toMatchObject({ withAudio: true });
    // no placed lines on a speaking take: assumed to speak there
    ({ state, p } = speaking(undefined));
    expect(resolveShotPack(state, p, shotOf(p, 's12'), { backend: 'local' }).opening).toMatchObject({ withAudio: false });
    // the continuation that speaks itself keeps the tail's sound
    const { state: s2, p: p2 } = fixture({ shots: (shots) => shots.map((s) => (s.id === 's11' ? { ...s, dialogue: [{ id: 'l0', characterId: s.characterIds[0], text: 'x' }] } : s)) });
    expect(resolveShotPack(s2, p2, shotOf(p2, 's12'), { backend: 'local' }).opening).toMatchObject({ withAudio: true });
  });

  it('a continuation whose predecessor has no real take resolves to no opening (the preflight refuses it)', () => {
    const { state, p } = fixture({ shots: (shots) => shots.map((s) => (s.id === 's11' ? { ...s, selectedTakeId: undefined } : s)) });
    const pack = resolveShotPack(state, p, shotOf(p, 's12'), { backend: 'local' });
    expect(pack.opening).toEqual({ kind: 'NONE' });
    expect(pack.notes.join(' ')).toMatch(/no chosen real take/);
    expect(continuationTail(state, p, shotOf(p, 's11'))).toEqual({ problem: 'shot 1 has no chosen real take yet' });
  });

  it('a predecessor whose window on the cut is shorter than the guide has no usable tail (the node would floor the clip)', () => {
    const { state, p } = fixture({ shots: (shots) => shots.map((s) => (s.id === 's11' ? { ...s, takes: [{ ...TAKE_A, params: { timeline: { newFrames: 15 } } }] } : s)) });
    const tail = continuationTail(state, p, shotOf(p, 's11'));
    expect(tail.source).toBeUndefined();
    expect(tail).toMatchObject({ windowFrames: 15, problem: expect.stringMatching(/shows only 15 frames in the cut, fewer than the 22-frame guide \(the node would silently keep 5\)/) });
    expect(continuationSource(state, p, shotOf(p, 's11'))).toBeUndefined();
    const pack = resolveShotPack(state, p, shotOf(p, 's12'), { backend: 'local' });
    expect(pack.opening).toEqual({ kind: 'NONE' });
    expect(pack.notes[0]).toMatch(/no usable tail: shot 1's take shows only 15 frames/);
    // the whole 124-frame take (no recorded window): 124 frames shown, the tail is usable
    const { state: s2, p: p2 } = fixture();
    expect(continuationTail(s2, p2, shotOf(p2, 's11'))).toEqual({ source: { shotId: 's11', takeId: 'take-a', assetId: 'vid-a' }, windowFrames: 124 });
    // a 39-frame guide against a 30-frame window: refused for that length too
    const p3 = { ...p2, shots: p2.shots.map((s) => (s.id === 's11' ? { ...s, takes: [{ ...TAKE_A, params: { timeline: { newFrames: 30 } } }] } : s)) };
    expect(continuationTail(s2, p3, shotOf(p3, 's11'), 39).problem).toMatch(/30 frames in the cut, fewer than the 39-frame guide/);
  });
});

describe('identity references', () => {
  it('the plate follows the scene’s time of day; a missing state plate falls back to the master', () => {
    const { state } = fixture();
    const loc = state.locations.find((l) => l.id === 'loc-pharmacy');
    expect(plateFor(loc, 'DUSK', state.assets)).toEqual({ assetId: 'plate-dusk', role: 'STATE' });
    expect(plateFor(loc, 'MORNING', state.assets)).toEqual({ assetId: 'plate-master', role: 'MASTER' });
  });

  it('every character is referenced up to the nine-picture budget; the place keeps its slot; the rest are named', () => {
    const { state: s0, p: p0 } = fixture();
    const extra: Character[] = Array.from({ length: 9 }, (_, i) => ({ ...s0.characters[0], id: `extra-${i}`, name: `Extra ${i}`, canonicalImage: { assetId: `canon-x${i}`, status: 'APPROVED', version: 1, generatedAt: 'x' } }));
    const state = { ...s0, characters: [...s0.characters, ...extra], assets: [...s0.assets, ...extra.map((c) => ({ ...s0.assets.find((a) => a.id === 'canon-a')!, id: c.canonicalImage!.assetId }))] };
    const p = { ...p0, castIds: [...p0.castIds, ...extra.map((c) => c.id)], shots: p0.shots.map((s) => (s.id === 's13' ? { ...s, characterIds: [...s.characterIds, ...extra.map((c) => c.id)] } : s)) };
    const pack = resolveShotPack(state, p, shotOf(p, 's13'), { backend: 'local' });
    expect(pack.pictures).toHaveLength(9);
    expect(pack.pictures.filter((x) => x.role === 'SUBJECT')).toHaveLength(7); // 9 − plate − opening frame
    expect(pack.location).toBeDefined();
    expect(pack.unreferenced).toHaveLength(3);
    expect(pack.unreferenced.map((u) => u.characterId)).toEqual(['extra-6', 'extra-7', 'extra-8']); // dropped last-to-first
  });

  it('a shot with neither a character nor a plate is a reference-free FL2VA shot on its opening frame', () => {
    const { state: s0, p: p0 } = fixture();
    const state = { ...s0, locations: s0.locations.map((l) => (l.id === 'loc-pharmacy' ? { ...l, refs: [], masterAssetId: undefined } : l)) };
    const p = { ...p0, shots: p0.shots.map((s) => (s.id === 's13' ? { ...s, characterIds: [] } : s)) };
    const pack = resolveShotPack(state, p, shotOf(p, 's13'), { backend: 'local' });
    expect(pack.graph).toBe('FL2VA');
    expect(pack.pictures).toEqual([]);
    expect(plannedGuides(pack, { soundtrack: false })).toEqual([]);
  });

  it('a character without a canonical image is listed as unreferenced; a legacy portrait stands in and is noted', () => {
    const { state, p } = fixture({ characters: (cs) => cs.map((c, i) => (i === 1 ? { ...c, canonicalImage: undefined, portraitAssetId: undefined } : c)) });
    const pack = resolveShotPack(state, p, shotOf(p, 's12'), { backend: 'local' });
    expect(pack.subjects).toHaveLength(1);
    expect(pack.unreferenced[0].reason).toMatch(/no usable canonical image/);
  });
});

describe('the hosted API (lowered, never silently stripped)', () => {
  it('a continuation becomes “last frame as first frame”: frame mode, no references, no guides', () => {
    const { state, p } = fixture();
    const pack = resolveShotPack(state, p, shotOf(p, 's12'), { backend: 'api' });
    expect(pack.opening).toMatchObject({ kind: 'LAST_FRAME_AS_FIRST', takeId: 'take-a' });
    expect(pack.graph).toBe('FRAMES');
    expect(pack.pictures).toEqual([]);
    expect(pack.trimStartFrames).toBe(0);
    expect(pack.lowering).toMatch(/last frame as the first frame/);
    expect(plannedGuides(pack, { soundtrack: true })).toEqual([]);
  });
  it('a cut becomes reference mode with the canonical image and the plate; the drawn frame is not sent, and that is recorded', () => {
    const { state, p } = fixture();
    const pack = resolveShotPack(state, p, shotOf(p, 's13'), { backend: 'api' });
    expect(pack.graph).toBe('REFERENCE');
    expect(pack.pictures.map((x) => x.role)).toEqual(['SUBJECT', 'LOCATION']);
    expect(pack.pictures[0].binding).toBe('Image 1 = <Subject 1>');
    expect(pack.lowering).toMatch(/frame and reference roles cannot be mixed/);
    expect(bindingOf(pack)).toMatchObject({ labels: 'HOSTED', opening: undefined, ending: false });
  });
});

describe('clip length', () => {
  it('a continuation adds its guide frames, snapped up; the new content is capped at 362 − guide frames', () => {
    expect(clipSecondsFor({ trimStartFrames: 22 }, 5)).toEqual({ seconds: 5.9167, frames: 158, newFrames: 136, truncated: false });
    expect(clipSecondsFor({ trimStartFrames: 0 }, 4)).toMatchObject({ frames: 124, truncated: false });
    const long = clipSecondsFor({ trimStartFrames: 22 }, 15);
    expect(long).toMatchObject({ seconds: 15, frames: 362, newFrames: 340, truncated: true });
    // the request stays inside the tool contract (seconds ≤ 15) while the engine still makes all 362 frames
    expect(VideoGenerateInput.safeParse({ prompt: 'p', seconds: long.seconds, width: 1280, height: 720, aspect: 'WIDE_16_9', guides: [{ frameIdx: 0, imageFile: '/t.mov', imageIsVideo: true, audioFromVideo: true }, { frameIdx: 22, audioFile: '/l.wav' }] }).success).toBe(true);
    expect(VideoGenerateInput.safeParse({ prompt: 'p', seconds: 5, width: 1280, height: 720, aspect: 'WIDE_16_9', guides: [{ frameIdx: 0, audioFromVideo: true }] }).success).toBe(false);
  });
  it('guide problems name a guide that does not fit', () => {
    expect(guideProblems([{ kind: 'TAIL', frameIdx: 0, frames: 22, audio: true }], 124)).toEqual([]);
    expect(guideProblems([{ kind: 'TAIL', frameIdx: 110, frames: 22, audio: true }], 124)[0]).toMatch(/tail \(22 frames at 110\) does not fit 124 frames/);
  });
});
