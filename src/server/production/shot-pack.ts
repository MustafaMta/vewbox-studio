import { BOUNDARY_RELATION, RELATION_BOUNDARY, type Asset, type Character, type Location, type Production, type Shot, type ShotBoundary, type ShotRelation, type StudioState, type Take, type WorldBible } from '@/domain/types';
import { orderedShots, shotWindowFrames } from '@/domain/timeline';
import { sceneStateFor, type SceneState } from '@/domain/scene-state';
import { isCanonicalApproved, primaryImageOf, primaryImageSourceOf } from '@/domain/identity';
import { locationIdentity } from '@/domain/location';
import { castOf, worldOf } from '@/studio/selectors';
import { H3_FPS, H3_GUIDE_FRAMES, h3FrameCount, h3GuideClipFrames, h3GuideFits } from '@/server/workflows/minimax-h3';
import type { H3Binding } from '@/server/story/prompts';

/** THE SHOT PACK — what one take of a shot is conditioned on, resolved once from the studio records by a pure
 *  function, so the preflight that judges the request and the handler that sends it see the same thing
 *  (docs/research/MINIMAX-CONTINUITY.md §3–§4.4). It decides:
 *  - the RELATION to the previous shot, which decides the request: CONTINUATION (the previous take's tail, frames and
 *    sound, anchored at frame 0; no opening frame), CUT (a new opening frame of the same moment, anchored at 0),
 *    STORY_TRANSITION (fresh: the destination's plate, its own opening frame; the previous shot contributes nothing);
 *  - the IDENTITY references, on every shot that shows a character or a place: each character's primary image (the
 *    canonical front full-body image — the authoritative identity; a legacy portrait only for a character drawn before
 *    canonical images) and the location's plate for the scene's time of day, in a fixed slot order (characters first,
 *    then the place, then at most one shot-specific production asset — the drawn opening frame — which is never an
 *    identity); a continuation carries them too, not only the previous tail;
 *  - the graph (Ref2VA whenever there is a reference; FL2VA only for reference-free shots), and the lowering for the
 *    hosted API, which has no anchored guides and cannot mix frame and reference roles. */

export const PACK_LIMITS = { pictures: 9, audios: 3, videos: 3, guides: 4 } as const;
/** The drawn opening frame is also connected as a reference picture (`<Picture k> is the first frame of [Shot 1]`),
 *  besides being anchored at frame 0: the template's way to tell the text encoder what the anchor is. E4 decides. */
export const OPENING_FRAME_AS_PICTURE = true;

export type PackOpening =
  | { kind: 'TAIL'; shotId: string; takeId: string; assetId: string; frames: number; withAudio: boolean }
  | { kind: 'LAST_FRAME_AS_FIRST'; shotId: string; takeId: string; assetId: string }
  | { kind: 'FRAME'; assetId: string }
  | { kind: 'NONE' };

export interface PackPicture { assetId: string; role: 'SUBJECT' | 'LOCATION' | 'OPENING_FRAME'; characterId?: string; locationId?: string; binding: string }

export interface ShotPack {
  backend: 'local' | 'api';
  shotId: string;
  /** the relation the request is built for, and what the plan said */
  relation: ShotRelation;
  plannedRelation?: ShotRelation;
  /** the shot's boundary as the planner set it (or as read from an older plan's relation) */
  boundary?: ShotBoundary;
  previousShotId?: string;
  /** local: REF2VA or FL2VA; hosted: REFERENCE (pictures), FRAMES (first/last frame) or TEXT */
  graph: 'REF2VA' | 'FL2VA' | 'REFERENCE' | 'FRAMES' | 'TEXT';
  subjects: Array<{ characterId: string; assetId: string; source: 'CANONICAL' | 'PORTRAIT'; approved: boolean; picture: number }>;
  /** the place's plate (the World Bible's choice when overlaid: an established frame rides as a STATE ref) and the
   *  identity it stands for (src/domain/location.ts: the version and the line every prompt carries) */
  location?: { locationId: string; assetId: string; role: 'STATE' | 'MASTER'; picture: number; identity: { version: number; line: string } };
  /** "ESTABLISH HERE" (types.ts Scene.establishLocation): the scene's place has no plate and the production declared
   *  this its first appearance — the take is conditioned on the identity line alone and its first frame becomes the
   *  place's plate. Never set when the place has a plate. */
  establishing?: { locationId: string; name: string; identity: { version: number; line: string } };
  /** reference pictures in connection order (picture i is index i-1) */
  pictures: PackPicture[];
  opening: PackOpening;
  /** the opening frame is a connected picture as well as an anchor (Ref2VA) */
  openingPicture?: number;
  ending?: { assetId: string };
  /** characters in the shot with no usable image, or beyond the picture budget */
  unreferenced: Array<{ characterId: string; reason: string }>;
  trimStartFrames: number;
  /** why the plan was changed for the backend, recorded in provenance */
  lowering?: string;
  /** THE SCENE STATE the take is filmed in (src/domain/scene-state.ts): carried from the previous shot across a cut
   *  or a continuation, reset to the scene's declaration on a transition; written into the prompt, recorded on the take */
  sceneState: SceneState;
  notes: string[];
}

const usableImage = (a?: Asset) => Boolean(a && a.kind === 'IMAGE' && !a.sample && !a.unavailable && a.mimeType !== 'image/svg+xml');

/** The shot before this one in cut order, and whether it is in the same scene. */
export function previousShot(p: Production, sh: Shot): Shot | undefined {
  const ordered = orderedShots(p);
  const i = ordered.findIndex((x) => x.id === sh.id);
  return i > 0 ? ordered[i - 1] : undefined;
}

/** The shot's boundary: the explicit field (the planner's decision), else the older plan's `relationToPrevious`. */
export function boundaryOf(sh: Pick<Shot, 'boundary' | 'continuity'>): { boundary?: ShotBoundary; explicit: boolean } {
  if (sh.boundary) return { boundary: sh.boundary, explicit: true };
  const r = sh.continuity?.relationToPrevious;
  return { boundary: r ? RELATION_BOUNDARY[r] : undefined, explicit: false };
}

/** The relation a take is generated for, from the shot's boundary. CONTINUATION only inside a scene (a continuous
 *  shot at a scene's start, or whose previous shot is in another scene, is generated as a cut — an EXPLICIT
 *  `continuous` there is refused by the preflight, an older plan's relation is lowered as before); a shot without a
 *  stated boundary is a CUT inside a scene and a STORY_TRANSITION at a scene's start. `transition` is editorial only. */
export function effectiveRelation(p: Production, sh: Shot): { relation: ShotRelation; planned?: ShotRelation; boundary?: ShotBoundary; previous?: Shot } {
  const prev = previousShot(p, sh);
  const { boundary } = boundaryOf(sh);
  const planned = boundary ? BOUNDARY_RELATION[boundary] : undefined;
  const sameScene = Boolean(prev && prev.sceneId === sh.sceneId);
  if (planned === 'CONTINUATION') return { relation: sameScene ? 'CONTINUATION' : 'CUT', planned, boundary, previous: prev };
  if (planned) return { relation: planned, planned, boundary, previous: prev };
  return { relation: sameScene ? 'CUT' : 'STORY_TRANSITION', planned, boundary, previous: prev };
}

/** Why an explicit boundary cannot be honoured, or undefined: a `continuous` shot needs a previous shot in the same
 *  scene with a usable tail; a `cut` on the same moment needs a previous shot in the same scene. */
export function boundaryProblem(state: Pick<StudioState, 'assets'>, p: Production, sh: Shot): string | undefined {
  const { boundary, explicit } = boundaryOf(sh);
  if (!explicit || !boundary) return undefined;
  const prev = previousShot(p, sh);
  const sameScene = Boolean(prev && prev.sceneId === sh.sceneId);
  if (boundary === 'continuous') {
    if (!prev) return 'a continuous shot needs a shot before it; this is the first shot';
    if (!sameScene) return `a continuous shot needs a previous shot in the same scene; shot ${prev.number} is in another scene (a new scene is a transition)`;
    const tail = continuationTail(state, p, prev);
    return tail.problem ? `the previous shot has no usable tail: ${tail.problem}` : undefined;
  }
  if (boundary === 'cut' && !sameScene) return prev ? `a cut on the same moment needs a previous shot in the same scene; shot ${prev.number} is in another scene (a new scene is a transition)` : 'a cut on the same moment needs a shot before it; this is the first shot (a transition)';
  return undefined;
}

export interface ContinuationSource { shotId: string; takeId: string; assetId: string }

/** The tail a continuation can anchor, or why there is none: the previous shot's chosen, real (generated or
 *  uploaded) video, whose window on the cut (what the audience sees of it, src/domain/timeline.ts) holds at least
 *  the guide's frames — a shorter window would hand the node a clip it silently floors (gap V1), so it is refused
 *  here, before any file is cut. */
export function continuationTail(state: Pick<StudioState, 'assets'>, p: Production, prev: Shot | undefined, guideFrames = H3_GUIDE_FRAMES): { source?: ContinuationSource; windowFrames?: number; problem?: string } {
  if (!prev) return { problem: 'there is no previous shot to continue' };
  const t = prev.takes.find((x) => x.id === prev.selectedTakeId);
  if (!t || t.provider === 'SAMPLE') return { problem: `shot ${prev.number} has no chosen real take yet` };
  const a = state.assets.find((x) => x.id === t.assetId);
  if (!a || a.kind !== 'VIDEO' || a.sample || a.unavailable) return { problem: `the file of shot ${prev.number}'s chosen take is ${a ? (a.unavailable ? 'missing from the library' : 'not a video') : 'gone'}` };
  const w = shotWindowFrames(p, prev, t, a);
  const windowFrames = Math.min(w.frames, w.available);
  if (windowFrames < guideFrames) return { windowFrames, problem: `shot ${prev.number}'s take shows only ${windowFrames} frame${windowFrames === 1 ? '' : 's'} in the cut, fewer than the ${guideFrames}-frame guide (the node would silently keep ${h3GuideClipFrames(windowFrames)})` };
  return { source: { shotId: prev.id, takeId: t.id, assetId: a.id }, windowFrames };
}

/** The take a continuation anchors (see `continuationTail`), or nothing. */
export function continuationSource(state: Pick<StudioState, 'assets'>, p: Production, prev: Shot | undefined): ContinuationSource | undefined {
  return continuationTail(state, p, prev).source;
}

/** Whether a take's speech reaches into its last `frames` frames: from the take's placed line windows (take-relative,
 *  written by the speech check); a speaking shot whose take has no placed lines counts as speaking there (unknown). */
export function speechInTail(shot: Pick<Shot, 'dialogue'>, take: Pick<Take, 'soundtrack' | 'durationSeconds'>, frames: number): boolean {
  if (!shot.dialogue.length) return false;
  const lines = take.soundtrack?.kind === 'DIALOGUE' ? take.soundtrack.lines : [];
  if (!lines.length || !take.durationSeconds) return true;
  const tailFrom = take.durationSeconds - frames / H3_FPS;
  return lines.some((l) => l.to > tailFrom - 0.05);
}

/** The plate a shot is filmed against: the STATE plate for the scene's time of day, else the MASTER plate. */
export function plateFor(loc: Location | undefined, timeOfDay: string | undefined, assets: Asset[]): { assetId: string; role: 'STATE' | 'MASTER' } | undefined {
  if (!loc) return undefined;
  const byId = (id?: string) => (id ? assets.find((a) => a.id === id) : undefined);
  const state = loc.refs.find((r) => r.role === 'STATE' && r.timeOfDay === timeOfDay && usableImage(byId(r.assetId)));
  if (state) return { assetId: state.assetId, role: 'STATE' };
  const master = loc.refs.find((r) => r.role === 'MASTER' && usableImage(byId(r.assetId)))?.assetId ?? (usableImage(byId(loc.masterAssetId)) ? loc.masterAssetId : undefined);
  return master ? { assetId: master, role: 'MASTER' } : undefined;
}

export function resolveShotPack(state: StudioState, p: Production, sh: Shot, opts: { backend: 'local' | 'api'; /** the World Bible revision the production reads (the scene state of a returning place comes from it) */ bible?: WorldBible }): ShotPack {
  const byId = (id?: string) => (id ? state.assets.find((a) => a.id === id) : undefined);
  const cast = castOf(state, p); const world = worldOf(state, p);
  const scene = p.scenes.find((sc) => sc.id === sh.sceneId);
  const loc = world.find((l) => l.id === scene?.locationId);
  const { relation, planned, boundary, previous } = effectiveRelation(p, sh);
  const notes: string[] = [];
  const local = opts.backend === 'local';
  if (boundary && sh.boundary) notes.push(`boundary ${boundary}: ${boundary === 'continuous' ? 'the action carries on from the previous take\'s tail' : boundary === 'cut' ? 'a new camera on the same moment (same cast, place and story state); no tail is anchored' : 'a new place or time: the destination\'s references and the story state there; nothing of the previous shot is anchored'}`);
  // what the clip starts from
  const tail = relation === 'CONTINUATION' ? continuationTail(state, p, previous) : undefined;
  const source = tail?.source;
  let opening: PackOpening = { kind: 'NONE' };
  let lowering: string | undefined;
  if (relation === 'CONTINUATION') {
    if (tail?.problem) notes.push(`no usable tail: ${tail.problem}`);
    // the tail carries its sound — except into a shot without lines when the previous take speaks in its tail: with
    // that sound anchored H3 kept talking after the head ("take what you need. See you, Madhya." in a silent shot),
    // without it the shot was silent (docs/evidence/minimax-p1, C1/C1b vs C1c; one seed each)
    const prevTake = previous?.takes.find((t) => t.id === source?.takeId);
    const muteTail = Boolean(source && previous && prevTake && p.kind !== 'MUSIC_VIDEO' && sh.dialogue.length === 0 && speechInTail(previous, prevTake, H3_GUIDE_FRAMES));
    if (muteTail) notes.push(`shot ${previous!.number} speaks in its last ${H3_GUIDE_FRAMES} frames and this shot has no lines: its tail is anchored without its sound`);
    if (source && local) opening = { kind: 'TAIL', ...source, frames: H3_GUIDE_FRAMES, withAudio: !muteTail };
    else if (source) { opening = { kind: 'LAST_FRAME_AS_FIRST', ...source }; lowering = 'hosted continuation: the previous take\'s last frame as the first frame (no anchored tail, no references in frame mode)'; }
    else notes.push(`the shot continues shot ${previous?.number ?? '?'}, which has no usable tail`);
  } else if (usableImage(byId(sh.openingFrameAssetId))) opening = { kind: 'FRAME', assetId: sh.openingFrameAssetId! };
  const ending = usableImage(byId(sh.endingFrameAssetId)) ? { assetId: sh.endingFrameAssetId! } : undefined;
  // identity: every character in the shot, in the shot's order, by primary image; the place by its plate
  const people = sh.characterIds.map((id) => cast.find((c) => c.id === id)).filter((c): c is Character => Boolean(c));
  const unreferenced: ShotPack['unreferenced'] = [];
  const withImage = people.filter((c) => { const ok = usableImage(byId(primaryImageOf(c))); if (!ok) unreferenced.push({ characterId: c.id, reason: 'no usable canonical image' }); return ok; });
  const plate = plateFor(loc, scene?.timeOfDay, state.assets);
  const hostedFrames = !local && opening.kind === 'LAST_FRAME_AS_FIRST';
  const wantsOpeningPicture = local && OPENING_FRAME_AS_PICTURE && opening.kind === 'FRAME';
  // slot budget: never drop the place; the opening frame takes a slot only when bound; characters beyond the budget
  // are dropped last-to-first (the shot lists its people in order of importance)
  const reserved = (plate ? 1 : 0) + (wantsOpeningPicture ? 1 : 0);
  const budget = Math.max(0, PACK_LIMITS.pictures - reserved);
  const kept = hostedFrames ? [] : withImage.slice(0, budget);
  for (const c of withImage.slice(kept.length)) unreferenced.push({ characterId: c.id, reason: hostedFrames ? 'hosted frame mode carries no references' : `over the ${PACK_LIMITS.pictures}-picture budget` });
  const pictures: PackPicture[] = [];
  const subjects: ShotPack['subjects'] = kept.map((c) => {
    const assetId = primaryImageOf(c)!;
    pictures.push({ assetId, role: 'SUBJECT', characterId: c.id, binding: '' });
    return { characterId: c.id, assetId, source: primaryImageSourceOf(c) ?? 'PORTRAIT', approved: isCanonicalApproved(c), picture: pictures.length };
  });
  let location: ShotPack['location'];
  const identity = loc ? locationIdentity(loc) : undefined;
  if (plate && loc && identity && !hostedFrames) { pictures.push({ assetId: plate.assetId, role: 'LOCATION', locationId: loc.id, binding: '' }); location = { locationId: loc.id, assetId: plate.assetId, role: plate.role, picture: pictures.length, identity: { version: identity.version, line: identity.line } }; }
  // the place has no plate: only a scene declared "establish here" may film it (from its identity line); the first
  // accepted take's opening frame then becomes its plate (take.ts)
  const establishing: ShotPack['establishing'] = !plate && loc && identity && scene?.establishLocation ? { locationId: loc.id, name: loc.name, identity: { version: identity.version, line: identity.line } } : undefined;
  if (establishing) notes.push(`establish here: ${loc!.name} has no plate yet; the take is filmed from its identity line and its first frame becomes the place's plate`);
  const hasRefs = pictures.length > 0;
  let openingPicture: number | undefined;
  if (wantsOpeningPicture && hasRefs && opening.kind === 'FRAME') { pictures.push({ assetId: opening.assetId, role: 'OPENING_FRAME', binding: '' }); openingPicture = pictures.length; }
  // how the prompt names each picture
  const label = (i: number) => (local ? `<Picture ${i}>` : `Image ${i}`);
  pictures.forEach((pic, i) => { pic.binding = pic.role === 'SUBJECT' || pic.role === 'LOCATION' ? `${label(i + 1)} = <Subject ${i + 1}>` : label(i + 1); });
  // the graph
  let graph: ShotPack['graph'];
  if (local) graph = hasRefs ? 'REF2VA' : 'FL2VA';
  else if (hostedFrames) graph = 'FRAMES';
  else if (hasRefs) {
    graph = 'REFERENCE';
    if (opening.kind === 'FRAME' || ending) { lowering = 'hosted reference mode: the drawn opening/ending frame is not sent (frame and reference roles cannot be mixed); identity from the canonical images and the plate'; }
  } else graph = opening.kind === 'FRAME' || ending ? 'FRAMES' : 'TEXT';
  if (subjects.some((s) => s.source === 'PORTRAIT')) notes.push('a legacy portrait stands in for a canonical image');
  // THE SCENE STATE (src/domain/scene-state.ts): what is true when this shot is filmed, carried shot to shot
  const sceneState = sceneStateFor(p, sh, { bible: opts.bible });
  return { backend: opts.backend, shotId: sh.id, relation, plannedRelation: planned, boundary, previousShotId: previous?.id, graph, subjects, location, establishing, pictures, opening, openingPicture, ending, unreferenced, trimStartFrames: opening.kind === 'TAIL' ? opening.frames : 0, lowering, sceneState, notes };
}

/** The prompt binding of a pack (what `h3ReferencePrompt` names). */
export function bindingOf(pack: ShotPack, audioRefs: Array<{ characterId: string }> = []): H3Binding {
  return {
    labels: pack.backend === 'local' ? 'LOCAL' : 'HOSTED',
    subjects: pack.subjects.map((s) => ({ characterId: s.characterId, picture: s.picture })),
    location: pack.location ? { picture: pack.location.picture } : undefined,
    describedLocation: Boolean(pack.establishing),
    opening: pack.opening.kind === 'TAIL' ? { kind: 'TAIL', seconds: pack.opening.frames / H3_FPS } : pack.opening.kind === 'FRAME' && pack.backend === 'local' ? { kind: 'FRAME', picture: pack.openingPicture } : undefined,
    ending: Boolean(pack.ending && pack.backend === 'local'),
    audioRefs,
    // a character with no picture (no canonical image, or beyond the budget) is declared from their description
    described: pack.unreferenced.map((u) => ({ characterId: u.characterId })),
  };
}

/** The length of the clip to generate: the new content the shot needs plus, on a continuation, the guide frames that
 *  repeat the previous shot; the engine holds it inside 124–362 frames, so a continuation carries at most
 *  362 − guide frames of new picture (≈14.2 s with 22 frames). */
export function clipSecondsFor(pack: Pick<ShotPack, 'trimStartFrames'>, newSeconds: number): { seconds: number; frames: number; newFrames: number; truncated: boolean } {
  const want = Math.max(1, newSeconds) + pack.trimStartFrames / H3_FPS;
  // 15 s is the request ceiling (the contract's and the hosted API's); it already snaps up to the 362-frame maximum
  const seconds = Math.min(15, want);
  const frames = h3FrameCount(seconds);
  const newFrames = frames - pack.trimStartFrames;
  return { seconds: Number(seconds.toFixed(4)), frames, newFrames, truncated: Math.round(newSeconds * H3_FPS) > newFrames };
}

export interface PlannedGuide { kind: 'TAIL' | 'OPENING_FRAME' | 'ENDING_FRAME' | 'SOUNDTRACK'; frameIdx: number; frames: number; audio: boolean }

/** The guides the request will chain, in order: on Ref2VA the opening frame at 0 and the ending frame at −1 (Ref2VA
 *  has no frame inputs; FL2VA takes them as first/last frame instead), the continuation tail (frames + sound) at 0,
 *  and the recorded soundtrack at the first new frame. The hosted API takes none. */
export function plannedGuides(pack: ShotPack, opts: { soundtrack: boolean }): PlannedGuide[] {
  if (pack.backend === 'api') return [];
  const out: PlannedGuide[] = [];
  if (pack.opening.kind === 'TAIL') out.push({ kind: 'TAIL', frameIdx: 0, frames: pack.opening.frames, audio: pack.opening.withAudio });
  if (pack.graph === 'REF2VA' && pack.opening.kind === 'FRAME') out.push({ kind: 'OPENING_FRAME', frameIdx: 0, frames: 1, audio: false });
  if (pack.graph === 'REF2VA' && pack.ending) out.push({ kind: 'ENDING_FRAME', frameIdx: -1, frames: 1, audio: false });
  if (opts.soundtrack) out.push({ kind: 'SOUNDTRACK', frameIdx: pack.trimStartFrames, frames: 1, audio: true });
  return out;
}

/** Guides that would not fit the clip (the node refuses them), as readable problems. */
export function guideProblems(guides: PlannedGuide[], frames: number): string[] {
  return guides.filter((g) => !h3GuideFits(g.frameIdx, g.frames, frames)).map((g) => `${g.kind.toLowerCase().replace('_', ' ')} (${g.frames} frame${g.frames > 1 ? 's' : ''} at ${g.frameIdx}) does not fit ${frames} frames`);
}
