import type { Shot } from './types';

/** THE SHOT'S DEPENDENCY CONTRACT (continuity recovery 2026-10-08, "The Relief" 1.6): a shot holds values it was given
 *  (cast, action, framing, camera, boundary, dialogue, continuity, staging, the planner's prompt) and values derived
 *  from them (the timed beats and the prose written for the old action, each person's continuity entry, the drawn
 *  opening and ending frames). Elena was taken out of an insert and her continuity entry stayed: the take's prompt
 *  described her and H3 drew a stranger. The editor saves the WHOLE form, so "the edit brought its own continuity" can
 *  never be read from which keys a request carried — only from what actually changed between the shot before and after.
 *
 *  `reconcileShot(before, after)` is the one rule, for the full-form editor and a partial update alike:
 *   - a person no longer in the cast leaves the continuity (their entry, the props they owned, the point of view); their
 *     lines stay as OFF-SCREEN, audio-only lines — never an image subject;
 *   - a changed cast or action makes the planner's prose and timed beats stale (unless the same edit rewrote them);
 *   - a changed cast, action, framing, camera, boundary or continuity makes the drawn opening and ending frames stale
 *     (unless the same edit set a frame);
 *  and says what it invalidated (`stale`). Pure (tested). */

export type StaleItem = 'continuity-entry' | 'prop-owner' | 'point-of-view' | 'line-offscreen' | 'planned-prose' | 'timed-beats' | 'opening-frame' | 'ending-frame';
export interface Reconciled { shot: Shot; stale: Array<{ item: StaleItem; why: string }> }

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function reconcileShot(before: Shot, after: Shot): Reconciled {
  let shot: Shot = { ...after };
  const stale: Reconciled['stale'] = [];
  const removed = before.characterIds.filter((id) => !after.characterIds.includes(id));
  const added = after.characterIds.filter((id) => !before.characterIds.includes(id));
  const castChanged = removed.length > 0 || added.length > 0;
  const actionChanged = (before.action ?? '').trim() !== (after.action ?? '').trim();
  const proseEdited = !same(before.prompt, after.prompt);
  const beatsEdited = !same(before.staging?.beats, after.staging?.beats);

  // the people no longer in the shot leave its structured state (whatever the form sent back)
  if (shot.continuity) {
    const inCast = (id?: string) => !id || shot.characterIds.includes(id);
    const people = shot.continuity.characters.filter((c) => inCast(c.characterId));
    const gone = shot.continuity.characters.filter((c) => !inCast(c.characterId)).map((c) => c.characterId);
    const props = shot.continuity.props.map((x) => (inCast(x.ownerCharacterId) ? x : (stale.push({ item: 'prop-owner', why: `${x.name}: its owner left the shot` }), { ...x, ownerCharacterId: undefined })));
    for (const id of gone) stale.push({ item: 'continuity-entry', why: `${id} is not in the shot` });
    if (gone.length || props.some((x, i) => x !== shot.continuity!.props[i])) shot = { ...shot, continuity: { ...shot.continuity, characters: people, props } };
  }
  if (shot.staging?.pov && !shot.characterIds.includes(shot.staging.pov)) { stale.push({ item: 'point-of-view', why: `${shot.staging.pov} is not in the shot` }); shot = { ...shot, staging: { ...shot.staging, pov: undefined } }; }
  // a removed speaker is heard off-screen: the line stays (audio), the person is never drawn
  if (shot.dialogue.some((d) => !shot.characterIds.includes(d.characterId) && !d.offscreen)) {
    shot = { ...shot, dialogue: shot.dialogue.map((d) => (shot.characterIds.includes(d.characterId) || d.offscreen ? d : (stale.push({ item: 'line-offscreen', why: `${d.id}: its speaker ${d.characterId} is not in the shot` }), { ...d, offscreen: true }))) };
  }

  // the planner's direction was written for the old cast and action
  if ((castChanged || actionChanged) && !proseEdited && shot.prompt) { stale.push({ item: 'planned-prose', why: castChanged ? 'the cast changed' : 'the action changed' }); shot = { ...shot, prompt: undefined }; }
  if ((castChanged || actionChanged) && !beatsEdited && shot.staging?.beats?.length) { stale.push({ item: 'timed-beats', why: castChanged ? 'the cast changed' : 'the action changed' }); shot = { ...shot, staging: { ...shot.staging, beats: [], actions: undefined } }; }

  // the drawn frames show the old shot
  const pictureChanged = castChanged || actionChanged || before.framing !== after.framing || before.cameraMove !== after.cameraMove || (before.boundary ?? null) !== (after.boundary ?? null) || !same(before.continuity, after.continuity);
  const why = castChanged ? 'the cast changed' : actionChanged ? 'the action changed' : before.framing !== after.framing ? 'the framing changed' : before.cameraMove !== after.cameraMove ? 'the camera changed' : (before.boundary ?? null) !== (after.boundary ?? null) ? 'the boundary changed' : 'the continuity changed';
  if (pictureChanged && shot.openingFrameAssetId && shot.openingFrameAssetId === before.openingFrameAssetId) { stale.push({ item: 'opening-frame', why }); shot = { ...shot, openingFrameAssetId: undefined }; }
  if (pictureChanged && shot.endingFrameAssetId && shot.endingFrameAssetId === before.endingFrameAssetId) { stale.push({ item: 'ending-frame', why }); shot = { ...shot, endingFrameAssetId: undefined }; }
  return { shot, stale };
}

/** A shot whose structured state is already inconsistent (people in its continuity, point of view or speaking on screen
 *  who are not in its cast): made valid the same way, for state written before this contract. Pure. */
export function validShot(sh: Shot): Reconciled {
  return reconcileShot({ ...sh, characterIds: [...sh.characterIds] }, sh);
}
