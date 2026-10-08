import { describe, expect, it } from 'vitest';
import { reconcileShot, validShot } from '@/domain/shot-dependencies';
import { updateShot } from '@/domain/actions';
import type { Shot, StudioState } from '@/domain/types';
import { fixture } from './continuity-fixture';

/** THE SHOT'S DEPENDENCY CONTRACT ("The Relief" 1.6: Elena taken out of an insert kept her continuity entry; the take
 *  prompt described her and H3 drew a stranger). The full-form editor and a partial update must give the same shot. */

const M = 'marcus'; const E = 'elena';
const twoShot = (): Shot => ({
  id: 'sh', sceneId: 'sc', number: 6, purpose: 'the handover', action: 'Elena extends the thermos; Marcus takes it.', framing: 'INSERT', cameraMove: 'STATIC', durationSeconds: 6,
  characterIds: [M, E], dialogue: [{ id: 'l1', characterId: E, text: 'Here.' }], transition: 'CUT', takes: [], boundary: 'cut',
  prompt: 'Close on the two hands passing the brass thermos.',
  staging: { beats: [{ at: 0, action: 'Elena extends the thermos' }, { at: 2, action: 'Marcus takes it' }], pace: 'NORMAL', pov: E },
  continuity: { characters: [{ characterId: M, holding: [] }, { characterId: E, holding: ['thermos'], condition: 'soaked' }], props: [{ name: 'thermos', ownerCharacterId: E, state: 'dented' }], environment: {} },
  openingFrameAssetId: 'frame-old', endingFrameAssetId: 'end-old',
} as unknown as Shot);
const items = (r: ReturnType<typeof reconcileShot>) => r.stale.map((s) => s.item);

describe('cast removal', () => {
  it('removes the person from continuity, props, point of view; their line is heard off-screen; prose, beats and frames are stale', () => {
    const before = twoShot();
    const r = reconcileShot(before, { ...before, characterIds: [M] });
    expect(r.shot.continuity!.characters.map((c) => c.characterId)).toEqual([M]);
    expect(r.shot.continuity!.props[0].ownerCharacterId).toBeUndefined();
    expect(r.shot.staging!.pov).toBeUndefined();
    expect(r.shot.dialogue).toEqual([{ id: 'l1', characterId: E, text: 'Here.', offscreen: true }]);
    expect(r.shot.prompt).toBeUndefined();
    expect(r.shot.staging!.beats).toEqual([]);
    expect(r.shot.openingFrameAssetId).toBeUndefined();
    expect(r.shot.endingFrameAssetId).toBeUndefined();
    expect(items(r)).toEqual(expect.arrayContaining(['continuity-entry', 'prop-owner', 'point-of-view', 'line-offscreen', 'planned-prose', 'timed-beats', 'opening-frame', 'ending-frame']));
  });
});

describe('the full-form editor and a partial update give the same shot', () => {
  it('a full form that sends the old continuity and staging back is still reconciled (the 1.6 save)', () => {
    const before = twoShot();
    // the editor's save: every field, the stale continuity and beats included, only the cast and action edited
    const full = { ...before, characterIds: [M], action: 'Marcus unscrews the cap of the thermos.' };
    const partial = { ...before, ...{ characterIds: [M], action: 'Marcus unscrews the cap of the thermos.' } };
    expect(reconcileShot(before, full).shot).toEqual(reconcileShot(before, partial).shot);
    expect(reconcileShot(before, full).shot.continuity!.characters.map((c) => c.characterId)).toEqual([M]);
  });
  it('updateShot (the command both paths send) applies the contract', () => {
    const { state, p } = fixture();
    const sh = p.shots[0];
    const [a, b] = p.castIds;
    const seeded: StudioState = { ...state, productions: state.productions.map((x) => (x.id !== p.id ? x : { ...x, shots: x.shots.map((s) => (s.id !== sh.id ? s : { ...s, characterIds: [a, b], continuity: { characters: [{ characterId: a }, { characterId: b }], props: [], environment: {} } } as unknown as Shot)) })) };
    const fromForm = updateShot(seeded, p.id, sh.id, { ...seeded.productions.find((x) => x.id === p.id)!.shots.find((s) => s.id === sh.id)!, characterIds: [a] } as never);
    const fromPatch = updateShot(seeded, p.id, sh.id, { characterIds: [a] });
    const of = (s: StudioState) => s.productions.find((x) => x.id === p.id)!.shots.find((x) => x.id === sh.id)!;
    expect(of(fromForm).continuity!.characters.map((c) => c.characterId)).toEqual([a]);
    expect(of(fromPatch).continuity).toEqual(of(fromForm).continuity);
  });
});

describe('cast addition, action, staging', () => {
  it('a person added makes the prose, beats and frames stale; nothing is invented for them', () => {
    const before = { ...twoShot(), characterIds: [M] } as Shot;
    const r = reconcileShot(before, { ...before, characterIds: [M, E] });
    expect(items(r)).toEqual(expect.arrayContaining(['planned-prose', 'timed-beats', 'opening-frame']));
  });
  it('a rewritten action makes the prose, beats and frames stale', () => {
    const before = twoShot();
    const r = reconcileShot(before, { ...before, action: 'They stand at the windows.' });
    expect(r.shot.prompt).toBeUndefined();
    expect(r.shot.staging!.beats).toEqual([]);
    expect(r.shot.openingFrameAssetId).toBeUndefined();
  });
  it('an action rewritten WITH its own new beats keeps them (the edit is the direction)', () => {
    const before = twoShot();
    const beats = [{ at: 0, action: 'They stand at the windows' }];
    const r = reconcileShot(before, { ...before, action: 'They stand at the windows.', staging: { ...before.staging!, beats } });
    expect(r.shot.staging!.beats).toEqual(beats);
  });
  it('an unchanged save invalidates nothing', () => {
    const before = twoShot();
    expect(reconcileShot(before, { ...before }).stale).toEqual([]);
    expect(reconcileShot(before, { ...before }).shot.openingFrameAssetId).toBe('frame-old');
  });
  it('a framing, camera or boundary change makes the drawn frames stale; a new frame set by the edit is kept', () => {
    const before = twoShot();
    expect(reconcileShot(before, { ...before, framing: 'CLOSE_UP' }).shot.openingFrameAssetId).toBeUndefined();
    expect(reconcileShot(before, { ...before, cameraMove: 'PUSH_IN' }).shot.openingFrameAssetId).toBeUndefined();
    expect(reconcileShot(before, { ...before, boundary: 'continuous' }).shot.openingFrameAssetId).toBeUndefined();
    expect(reconcileShot(before, { ...before, framing: 'CLOSE_UP', openingFrameAssetId: 'frame-new' }).shot.openingFrameAssetId).toBe('frame-new');
  });
});

describe('state written before the contract is made valid', () => {
  it('validShot drops continuity of people not in the cast and makes their lines off-screen', () => {
    const sh = { ...twoShot(), characterIds: [M] } as Shot; // the stored 1.6: Elena out of the cast, her entry still there
    const r = validShot(sh);
    expect(r.shot.continuity!.characters.map((c) => c.characterId)).toEqual([M]);
    expect(r.shot.dialogue[0].offscreen).toBe(true);
    expect(r.shot.openingFrameAssetId).toBe('frame-old'); // nothing about the picture changed in this repair
  });
});
