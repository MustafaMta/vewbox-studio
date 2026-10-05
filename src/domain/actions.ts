import type { Asset, AssetTier, CanonicalImage, Character, CharacterProfileInput, CharacterRef, ContinuityState, ExportRecord, IdeaPreferences, IdeaProposal, Location, LocationRef, PendingReference, Production, QaReport, Scene, Season, Settings, Shot, Show, Song, StudioState, Take, TakeRating, TakeReference, Voice, VoiceDesignCandidate, VoiceDesignRecord, VoiceIdentity, VoiceProfileInput, VoiceSample } from './types';
import type { Aspect, Dialect, Kind, Language, Stage, Style } from './vocabulary';
import { STATE_VERSION } from './version';
import { nid, now } from './ids';
import { StudioError, consentRequired, missingReference } from './errors';
import { canonical } from './hash';
import { approvalProblem, canonicalCheckFailed, canonicalImageOwner } from './identity';
import { developmentIntentOf } from './development';
import { VOICE_INTERNAL_KEYS, appearanceLock, canChangeAppearance, guardCanonicalChange, guardCharacterPatch, guardVoiceBuild, guardVoiceChange, isCloneSource, markTakeRemoved, protectedAssetOwner, protectedVoiceAssetOwner, recordTakeUsage, voiceBuildLockProblem } from './rules';
import { DESIGN_LABEL, IRAQI_NEEDS_RECORDING, designedIraqiOn, designedSeedProblem, initialDialectStatus, isConsentStatement, isConsentedUpload, isIraqi, withListening, type ConsentStatement } from './voice-identity';
import { splitLyrics } from './lyrics';
import { sceneSetupFrom } from './scene-setup';
import { cutInputsHash } from './cut';
import { reconcileContinuationChain } from './continuation';
import { advanceIdentity, withLocationIdentity } from './location';

export { nid } from './ids';

/** WHAT THE STUDIO CAN DO — every change is one of these pure functions: state in, new state out. The browser runs
 *  them optimistically; the server runs the same function on the authoritative state and persists the difference.
 *  Workers call them too (a take arrives, a script is written). A function that refuses throws a StudioError. */

type S = StudioState;
const touchProduction = (p: Production): Production => ({ ...p, updatedAt: now() });

function mustFind<T extends { id: string }>(xs: T[], id: string, what: string): T {
  const x = xs.find((v) => v.id === id);
  if (!x) throw new StudioError('NOT_FOUND', `${what} ${id} was not found.`, { id, what });
  return x;
}

// ------------------------------------------------------------------------------------------------------- shows

export interface NewShowInput { title: string; titleAr?: string; logline: string; genre: string; style: Style; language: Language; dialect?: Dialect; aspect: Aspect; castIds?: string[]; locationIds?: string[]; synopsis?: string }

export function addShow(s: S, input: NewShowInput): { state: S; show: Show; season: Season } {
  const t = now();
  const show: Show = { id: nid('show'), title: input.title.trim(), titleAr: input.titleAr?.trim() || undefined, logline: input.logline.trim(), genre: input.genre.trim(), style: input.style, language: input.language, dialect: input.language === 'AR' ? input.dialect : undefined, aspect: input.aspect, synopsis: input.synopsis, castIds: input.castIds ?? [], locationIds: input.locationIds ?? [], createdAt: t, updatedAt: t };
  const season: Season = { id: nid('season'), showId: show.id, number: 1, title: 'Season 1', arc: '', createdAt: t };
  return { state: { ...s, shows: [...s.shows, show], seasons: [...s.seasons, season] }, show, season };
}

export function updateShow(s: S, id: string, patch: Partial<Omit<Show, 'id' | 'createdAt'>>): S {
  mustFind(s.shows, id, 'Show');
  return { ...s, shows: s.shows.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: now() } : x)) };
}

export function deleteShow(s: S, id: string): S {
  const seasonIds = new Set(s.seasons.filter((x) => x.showId === id).map((x) => x.id));
  return { ...s, shows: s.shows.filter((x) => x.id !== id), seasons: s.seasons.filter((x) => x.showId !== id), productions: s.productions.filter((p) => p.showId !== id && !(p.seasonId && seasonIds.has(p.seasonId))) };
}

export function addSeason(s: S, showId: string, title?: string, arc = ''): { state: S; season: Season } {
  mustFind(s.shows, showId, 'Show');
  const number = s.seasons.filter((x) => x.showId === showId).length + 1;
  const season: Season = { id: nid('season'), showId, number, title: title?.trim() || `Season ${number}`, arc, createdAt: now() };
  return { state: { ...updateShow(s, showId, {}), seasons: [...s.seasons, season] }, season };
}

export function updateSeason(s: S, id: string, patch: Partial<Pick<Season, 'title' | 'arc'>>): S {
  mustFind(s.seasons, id, 'Season');
  return { ...s, seasons: s.seasons.map((x) => (x.id === id ? { ...x, ...patch } : x)) };
}

export function deleteSeason(s: S, id: string): S {
  return { ...s, seasons: s.seasons.filter((x) => x.id !== id), productions: s.productions.filter((p) => p.seasonId !== id) };
}

// ------------------------------------------------------------------------------------------------- productions

export interface NewProductionInput {
  kind: Kind; showId?: string; seasonId?: string;
  title: string; titleAr?: string; logline?: string; synopsis?: string;
  style: Style; language: Language; dialect?: Dialect; aspect: Aspect; targetSeconds: number;
  brief: Production['brief']; castIds: string[]; locationIds: string[];
  song?: Song;
}

export function addProduction(s: S, input: NewProductionInput): { state: S; production: Production } {
  const t = now();
  if (input.kind === 'EPISODE' && (!input.showId || !input.seasonId)) throw new StudioError('INVALID', 'An episode needs a show and a season.');
  const episodeNumber = input.kind === 'EPISODE' && input.seasonId ? s.productions.filter((p) => p.seasonId === input.seasonId).length + 1 : undefined;
  const production: Production = {
    id: nid(input.kind === 'EPISODE' ? 'ep' : input.kind === 'SHORT' ? 'short' : 'mv'), kind: input.kind, showId: input.showId, seasonId: input.seasonId, episodeNumber,
    title: input.title.trim(), titleAr: input.titleAr?.trim() || undefined, logline: input.logline?.trim() ?? '', synopsis: input.synopsis?.trim() ?? '',
    style: input.style, language: input.language, dialect: input.language === 'AR' ? input.dialect : undefined, aspect: input.aspect, targetSeconds: input.targetSeconds,
    stage: 'STORY', brief: input.brief, castIds: input.castIds, locationIds: input.locationIds, scenes: [], shots: [], song: input.song, createdAt: t, updatedAt: t,
  };
  return { state: { ...s, productions: [...s.productions, production] }, production };
}

export function updateProduction(s: S, id: string, patch: Partial<Omit<Production, 'id' | 'createdAt' | 'kind'>>): S {
  mustFind(s.productions, id, 'Production');
  return { ...s, productions: s.productions.map((p) => (p.id === id ? touchProduction({ ...p, ...patch }) : p)) };
}

export function deleteProduction(s: S, id: string): S {
  return { ...s, productions: s.productions.filter((p) => p.id !== id) };
}

export function duplicateProduction(s: S, id: string): { state: S; production: Production | null } {
  const src = s.productions.find((p) => p.id === id);
  if (!src) return { state: s, production: null };
  const t = now();
  const copy: Production = structuredClone({ ...src, id: nid('copy'), title: `${src.title} (copy)`, titleAr: undefined, stage: 'STORY', createdAt: t, updatedAt: t, cutAssetId: undefined, cutStale: undefined, exports: [] });
  copy.scenes = copy.scenes.map((sc) => ({ ...sc }));
  copy.shots = copy.shots.map((sh) => ({ ...sh, id: nid('shot'), takes: [], selectedTakeId: undefined, continuity: undefined }));
  if (copy.kind === 'EPISODE' && copy.seasonId) copy.episodeNumber = s.productions.filter((p) => p.seasonId === copy.seasonId).length + 1;
  return { state: { ...s, productions: [...s.productions, copy] }, production: copy };
}

// ------------------------------------------------------------------------------------------- intent commands
// docs/BACKEND-AUDIT-2026-10.md H3, step 11. A worker computes for minutes from a read; writing back a WHOLE value
// (a cast list, a bible, a logline) would silently undo what the producer changed meanwhile. These commands say what
// the worker means — add these people, record these events, set this field if nobody touched it — and are applied to
// the state as it is when the command runs, so both edits survive.

export interface MembershipTarget { productionId?: string; showId?: string }

const union = (xs: string[], add: string[]) => Array.from(new Set([...xs, ...add]));

/** Add characters to a production's and/or a show's cast (those already in it stay; order kept). */
export function addCastMember(s: S, target: MembershipTarget, characterIds: string[]): S {
  for (const id of characterIds) mustFind(s.characters, id, 'Character');
  let next = s;
  if (target.productionId) { const p = mustFind(next.productions, target.productionId, 'Production'); const castIds = union(p.castIds, characterIds); if (castIds.length !== p.castIds.length) next = updateProduction(next, p.id, { castIds }); }
  if (target.showId) { const sh = mustFind(next.shows, target.showId, 'Show'); const castIds = union(sh.castIds, characterIds); if (castIds.length !== sh.castIds.length) next = updateShow(next, sh.id, { castIds }); }
  return next;
}

/** Add places to a production's and/or a show's world (those already in it stay; order kept). */
export function addLocationMember(s: S, target: MembershipTarget, locationIds: string[]): S {
  for (const id of locationIds) mustFind(s.locations, id, 'Location');
  let next = s;
  if (target.productionId) { const p = mustFind(next.productions, target.productionId, 'Production'); const locationIds2 = union(p.locationIds, locationIds); if (locationIds2.length !== p.locationIds.length) next = updateProduction(next, p.id, { locationIds: locationIds2 }); }
  if (target.showId) { const sh = mustFind(next.shows, target.showId, 'Show'); const locationIds2 = union(sh.locationIds, locationIds); if (locationIds2.length !== sh.locationIds.length) next = updateShow(next, sh.id, { locationIds: locationIds2 }); }
  return next;
}

/** What the Continuity Writer records in a show's bible after an episode: its timeline entries (replacing that
 *  episode's earlier ones — `dropPrefix`), storylines resolved and opened, relationships learned. Applied to the bible
 *  as it is now: the producer's own entries, written meanwhile, stay. */
export interface ShowBiblePatch {
  timeline?: { dropPrefix?: string; add?: string[] };
  unresolved?: { resolve?: string[]; add?: string[]; max?: number };
  relationships?: { add?: string[]; max?: number };
  worldRules?: { add?: string[] };
}
export function updateShowBible(s: S, showId: string, patch: ShowBiblePatch): S {
  const show = mustFind(s.shows, showId, 'Show');
  const b = show.bible ?? {};
  const next = { ...b };
  if (patch.timeline) next.timeline = [...(b.timeline ?? []).filter((x) => !(patch.timeline!.dropPrefix && x.startsWith(patch.timeline!.dropPrefix))), ...(patch.timeline.add ?? [])];
  if (patch.unresolved) {
    const resolved = new Set((patch.unresolved.resolve ?? []).map((x) => x.toLowerCase()));
    const all = Array.from(new Set([...(b.unresolved ?? []).filter((x) => !resolved.has(x.toLowerCase())), ...(patch.unresolved.add ?? [])]));
    next.unresolved = patch.unresolved.max ? all.slice(0, patch.unresolved.max) : all;
  }
  if (patch.relationships) { const all = union(b.relationships ?? [], patch.relationships.add ?? []); next.relationships = patch.relationships.max ? all.slice(0, patch.relationships.max) : all; }
  if (patch.worldRules) next.worldRules = union(b.worldRules ?? [], patch.worldRules.add ?? []);
  if (canonical(next) === canonical(b)) return s;
  return updateShow(s, showId, { bible: next });
}

/** What a finished episode leaves its show (the Continuity Writer's answer, or nothing — then the scenes' own exit
 *  states are the facts). */
export interface EpisodeFacts { events?: string[]; unresolved?: string[]; resolved?: string[]; relationships?: string[] }

/** `S{season}E{episode}` — the tag an episode's facts carry in its show's bible timeline (the World Bible places them
 *  after that episode's scenes, src/domain/world.ts timelineOf). */
export function episodeTag(s: Pick<S, 'seasons'>, p: Pick<Production, 'seasonId' | 'episodeNumber'>): string {
  return `S${s.seasons.find((x) => x.id === p.seasonId)?.number ?? '?'}E${p.episodeNumber ?? '?'}`;
}

/** The facts of an episode as its show's bible records them: tagged timeline events (given, else each scene's exit
 *  state in scene order), the storylines it opens and closes, the relationships it changed. Pure. */
export function episodeFactsOf(s: Pick<S, 'seasons'>, p: Production, facts: EpisodeFacts = {}): Required<EpisodeFacts> & { tag: string } {
  const tag = episodeTag(s, p);
  const clean = (x: string) => x.replace(/\s+/g, ' ').trim();
  const given = (facts.events ?? []).map(clean).filter(Boolean);
  const derived = [...p.scenes].sort((a, b) => a.number - b.number).map((sc) => clean(sc.exitState ?? '')).filter(Boolean);
  const events = Array.from(new Set((given.length ? given : derived).map((e) => (e.startsWith(`${tag}:`) ? e : `${tag}: ${e}`))));
  const list = (xs?: string[]) => Array.from(new Set((xs ?? []).map(clean).filter(Boolean)));
  return { tag, events, unresolved: list(facts.unresolved), resolved: list(facts.resolved), relationships: list(facts.relationships) };
}

/** FINISHING AN EPISODE (the show's bible; src/server/world recordEpisode): its facts are appended to its show's bible
 *  — its timeline entries REPLACE this episode's earlier ones (a re-cut), the storylines it closed leave the open list,
 *  the ones it opened join it, changed relationships are added — so the next episode's (or season's) World Bible
 *  revision starts from them. IDEMPOTENT: finishing the same episode with the same facts again changes nothing (the
 *  same state object comes back, so no revision is written). Applied to the bible as it is now: the producer's own
 *  entries stay. */
export function finishEpisode(s: S, productionId: string, facts: EpisodeFacts = {}): S {
  const p = mustFind(s.productions, productionId, 'Production');
  if (!p.showId) throw new StudioError('INVALID', 'Only an episode of a show is recorded in its show’s bible.', { productionId });
  mustFind(s.shows, p.showId, 'Show');
  const f = episodeFactsOf(s, p, facts);
  return updateShowBible(s, p.showId, { ...(f.events.length ? { timeline: { dropPrefix: `${f.tag}:`, add: f.events } } : {}), unresolved: { resolve: f.resolved, add: f.unresolved, max: 12 }, relationships: { add: f.relationships, max: 24 } });
}

/** The production fields a worker computed (a logline, a synopsis, a genre…), each written only where the field is
 *  still what the worker read (`base`) — a field the producer changed meanwhile keeps the producer's value. */
export type ProductionFields = Partial<Pick<Production, 'logline' | 'synopsis' | 'genre' | 'mood' | 'titleAr' | 'title' | 'artist' | 'concept'>>;
export function fillProductionFields(s: S, productionId: string, patch: ProductionFields, base: ProductionFields): S {
  const p = mustFind(s.productions, productionId, 'Production');
  const write: Partial<Production> = {};
  for (const k of Object.keys(patch) as Array<keyof ProductionFields>) {
    if (canonical(p[k] ?? null) !== canonical(base[k] ?? null)) continue; // the producer changed it: theirs stays
    if (canonical(p[k] ?? null) === canonical(patch[k] ?? null)) continue;
    (write as Record<string, unknown>)[k] = patch[k];
  }
  return Object.keys(write).length ? updateProduction(s, productionId, write) : s;
}

export function setStage(s: S, id: string, stage: Stage): S { return updateProduction(s, id, { stage }); }

/** The stage advances when the work of a step is done. Nothing advances on its own. */
export function markStepDone(s: S, id: string, done: Stage): S {
  const order: Stage[] = ['STORY', 'CAST_AND_WORLD', 'STORYBOARD', 'PRODUCE', 'FINAL_CUT', 'COMPLETE'];
  const p = s.productions.find((x) => x.id === id);
  if (!p) return s;
  const next = order[Math.min(order.indexOf(done) + 1, order.length - 1)];
  return order.indexOf(next) > order.indexOf(p.stage) ? setStage(s, id, next) : s;
}

export function recordExport(s: S, id: string, rec: Omit<ExportRecord, 'id' | 'createdAt'> & { id?: string }): { state: S; export: ExportRecord } {
  const p = mustFind(s.productions, id, 'Production');
  const ex: ExportRecord = { ...rec, id: rec.id ?? nid('export'), createdAt: now() };
  return { state: updateProduction(s, id, { exports: [...(p.exports ?? []), ex] }), export: ex };
}

/** The assembled cut. inputs: the cutInputsHash it was rendered from (src/domain/cut.ts) — when the production
 *  moved on while it was rendering, the new cut is already stale; without it the cut is taken as current. */
export function setCut(s: S, id: string, cutAssetId: string | undefined, opts: { inputs?: string } = {}): S {
  const p = mustFind(s.productions, id, 'Production');
  return updateProduction(s, id, { cutAssetId, cutStale: cutAssetId && opts.inputs && opts.inputs !== cutInputsHash(p) ? true : undefined });
}

// ------------------------------------------------------------------------------------------------------ scenes

function withProduction(s: S, id: string, fn: (p: Production) => Production): S {
  const p = mustFind(s.productions, id, 'Production');
  const changed = fn(p);
  if (changed === p) return s; // nothing changed: same state, so callers and effects can tell
  // THE CONTINUATION CHAIN (src/domain/continuation.ts): a change of a shot's chosen take, a take added, removed or
  // rejected, a shot moved — every continuation downstream is marked stale (or whole again) in the same change
  const next = reconcileContinuationChain(changed, now());
  // A STALE CUT (audit M2, step 12): a change to what the assembled cut was made from — a shot added, removed, moved
  // or edited in a way the cut shows, a line recorded again, another take chosen — leaves the cut out of date
  const stale = p.cutAssetId && !next.cutStale && cutInputsHash(next) !== cutInputsHash(p) ? { ...next, cutStale: true } : next;
  return { ...s, productions: s.productions.map((x) => (x.id === id ? touchProduction(stale) : x)) };
}

/** The cut is out of date (only when there is one). */
const markCutStale = (p: Production): Production => (p.cutAssetId ? { ...p, cutStale: true } : p);

export function addScene(s: S, productionId: string, input: Pick<Scene, 'title' | 'timeOfDay'> & { locationId?: string; characterIds?: string[]; purpose?: string; emotionalObjective?: string; entryState?: string; exitState?: string; beats?: Scene['beats']; establishLocation?: boolean }): { state: S; scene: Scene } {
  const p = mustFind(s.productions, productionId, 'Production');
  const scene: Scene = { id: nid('scene'), number: p.scenes.length + 1, title: input.title.trim(), locationId: input.locationId || undefined, timeOfDay: input.timeOfDay, characterIds: input.characterIds ?? [], beats: input.beats ?? [], purpose: input.purpose, emotionalObjective: input.emotionalObjective, entryState: input.entryState, exitState: input.exitState, ...(input.establishLocation ? { establishLocation: true } : {}) };
  return { state: withProduction(s, productionId, (x) => ({ ...x, scenes: [...x.scenes, scene] })), scene };
}

export function updateScene(s: S, productionId: string, sceneId: string, patch: Partial<Omit<Scene, 'id' | 'number'>>): S {
  return withProduction(s, productionId, (p) => ({ ...p, scenes: p.scenes.map((sc) => (sc.id === sceneId ? { ...sc, ...patch } : sc)) }));
}

export function deleteScene(s: S, productionId: string, sceneId: string): S {
  return withProduction(s, productionId, (p) => ({ ...p, scenes: renumberScenes(p.scenes.filter((sc) => sc.id !== sceneId)), shots: renumberShots(p.shots.filter((sh) => sh.sceneId !== sceneId)) }));
}

/** Which existing scene each incoming scene of a new script is (docs/BACKEND-AUDIT-2026-10.md C4, step 10): an id
 *  the production already has, else the same title, else the same place in the order — each existing scene claimed
 *  once. Pure. Returns the id each incoming scene keeps (undefined: a new scene). */
export function matchScenes(existing: Array<Pick<Scene, 'id' | 'title'>>, incoming: Array<{ id?: string; title: string }>): Array<string | undefined> {
  const norm = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ');
  const claimed = new Set<string>();
  const out: Array<string | undefined> = incoming.map((sc) => (sc.id && existing.some((e) => e.id === sc.id) && !claimed.has(sc.id) ? (claimed.add(sc.id), sc.id) : undefined));
  incoming.forEach((sc, i) => {
    if (out[i]) return;
    const byTitle = existing.find((e) => !claimed.has(e.id) && norm(e.title) === norm(sc.title));
    if (byTitle) { claimed.add(byTitle.id); out[i] = byTitle.id; }
  });
  incoming.forEach((_sc, i) => {
    if (out[i]) return;
    const atPlace = existing[i];
    if (atPlace && !claimed.has(atPlace.id)) { claimed.add(atPlace.id); out[i] = atPlace.id; }
  });
  return out;
}

/** Replace the script wholesale (the story engine wrote it): scenes with beats and lines. The new scenes KEEP THE IDS
 *  of the scenes they match (`matchScenes`), so the shots of every matched scene — and their takes — stay where they
 *  are, under the same ids. Shots of a scene the new script no longer has leave the studio with it; nothing is lost:
 *  the server tombstones them (src/server/studio/persist.ts) and they can be restored with their takes. */
export function replaceScript(s: S, productionId: string, scenes: Array<Omit<Scene, 'number' | 'id'> & { id?: string }>, opts: { keepWritten?: boolean } = {}): S {
  return withProduction(s, productionId, (p) => {
    // `keepWritten` (the story engine's re-run): decided on the state the command runs on, never on a read taken
    // before a minutes-long model call — once a scene has written lines, the script is the producer's
    if (opts.keepWritten && p.scenes.some((sc) => sc.beats.some((b) => b.lines.length > 0))) throw new StudioError('CONFLICT', 'The scenes already carry written lines; the developed story does not replace them.', { productionId, reason: 'SCRIPT_WRITTEN' });
    const kept = matchScenes(p.scenes, scenes);
    const next: Scene[] = scenes.map((sc, i) => ({ ...sc, id: kept[i] ?? sc.id ?? nid('scene'), number: i + 1 }));
    const keep = new Set(next.map((x) => x.id));
    // the shots follow the new scene order (within a scene, their own order)
    const order = new Map(next.map((sc, i) => [sc.id, i]));
    const shots = p.shots.filter((sh) => keep.has(sh.sceneId)).map((sh, i) => ({ sh, i })).sort((a, b) => order.get(a.sh.sceneId)! - order.get(b.sh.sceneId)! || a.i - b.i).map((x) => x.sh);
    return { ...p, scenes: next, shots: renumberShots(shots) };
  });
}

const renumberScenes = (scenes: Scene[]) => scenes.map((sc, i) => ({ ...sc, number: i + 1 }));
/** Shots are numbered within their scene, in list order. */
function renumberShots(shots: Shot[]): Shot[] {
  const counters = new Map<string, number>();
  return shots.map((sh) => { const n = (counters.get(sh.sceneId) ?? 0) + 1; counters.set(sh.sceneId, n); return { ...sh, number: n }; });
}

// ------------------------------------------------------------------------------------------------------- shots

export type ShotInput = Omit<Shot, 'id' | 'number' | 'takes' | 'selectedTakeId'>;

export function addShot(s: S, productionId: string, input: ShotInput): { state: S; shot: Shot } {
  const p = mustFind(s.productions, productionId, 'Production');
  mustFind(p.scenes, input.sceneId, 'Scene');
  const shot: Shot = { ...input, id: nid('shot'), number: 0, takes: [] };
  const state = withProduction(s, productionId, (x) => {
    // insert after the last shot of the same scene so the storyboard reads in scene order
    const idx = x.shots.map((y) => y.sceneId).lastIndexOf(input.sceneId);
    const shots = [...x.shots]; shots.splice(idx === -1 ? shots.length : idx + 1, 0, shot);
    return { ...x, shots: renumberShots(shots) };
  });
  // the numbered copy, as it now sits in the storyboard
  return { state, shot: state.productions.find((q) => q.id === productionId)?.shots.find((y) => y.id === shot.id) ?? shot };
}

/** Replace the shots of one scene (the studio planned them). Existing takes of replaced shots are lost, so this is
 *  refused when any shot of the scene already has a take unless `force` is set. */
export function replaceSceneShots(s: S, productionId: string, sceneId: string, shots: ShotInput[], force = false): S {
  return withProduction(s, productionId, (p) => {
    const existing = p.shots.filter((sh) => sh.sceneId === sceneId);
    if (!force && existing.some((sh) => sh.takes.length > 0)) throw new StudioError('CONFLICT', 'This scene already has takes; replan with force to replace its shots.', { sceneId });
    const fresh: Shot[] = shots.map((sh) => ({ ...sh, sceneId, id: nid('shot'), number: 0, takes: [] }));
    const idx = p.shots.findIndex((sh) => sh.sceneId === sceneId);
    const rest = p.shots.filter((sh) => sh.sceneId !== sceneId);
    const at = idx === -1 ? rest.length : Math.min(idx, rest.length);
    rest.splice(at, 0, ...fresh);
    return { ...p, shots: renumberShots(rest) };
  });
}

/** A shot edit. A frame is REMOVED with `null` (JSON, the command transport, drops `undefined`: a removal sent as
 *  undefined never reached the server — acceptance 2026-10-05, "Remove the ending frame" on shot 1.3 did nothing). */
export type ShotPatchInput = Partial<Omit<Shot, 'id' | 'number' | 'openingFrameAssetId' | 'endingFrameAssetId'>> & { openingFrameAssetId?: string | null; endingFrameAssetId?: string | null };

export function updateShot(s: S, productionId: string, shotId: string, input: ShotPatchInput): S {
  const { openingFrameAssetId: o, endingFrameAssetId: e, ...rest } = input;
  const patch: Partial<Omit<Shot, 'id' | 'number'>> = { ...rest, ...(o !== undefined ? { openingFrameAssetId: o ?? undefined } : {}), ...(e !== undefined ? { endingFrameAssetId: e ?? undefined } : {}) };
  return withProduction(s, productionId, (p) => { mustFind(p.shots, shotId, 'Shot'); return { ...p, shots: renumberShots(p.shots.map((sh) => (sh.id === shotId ? { ...sh, ...patch, ...plannedDirectionAfter(sh, patch) } : sh))) }; });
}

/** THE PRODUCER'S "WHAT HAPPENS" WINS. The planner's direction of a shot — its prompt body and its timed staging beats —
 *  describes the action it planned; when the action is rewritten (and the same edit does not bring a new prompt or
 *  staging of its own), that direction no longer describes the shot and is dropped, so the take is filmed from the new
 *  action (src/server/story/prompts.ts `shotBody`) instead of the old one. Pace, point of view and extras stay.
 *  Found by the acceptance run 2026-10-05: shot 1.3's edited action never reached the take, whose planned staging kept
 *  a sip at 0:00 over the spoken line. */
export function plannedDirectionAfter(sh: Pick<Shot, 'action' | 'prompt' | 'staging'>, patch: Partial<Pick<Shot, 'action' | 'prompt' | 'staging'>>): Partial<Pick<Shot, 'prompt' | 'staging'>> {
  if (patch.action === undefined || patch.action.trim() === (sh.action ?? '').trim()) return {};
  if (patch.prompt !== undefined || patch.staging !== undefined) return {};
  if (!sh.prompt && !sh.staging?.beats?.length) return {};
  return { prompt: undefined, ...(sh.staging ? { staging: { ...sh.staging, beats: [], actions: undefined } } : {}) };
}

export function deleteShot(s: S, productionId: string, shotId: string): S {
  return withProduction(s, productionId, (p) => ({ ...p, shots: renumberShots(p.shots.filter((sh) => sh.id !== shotId)) }));
}

export function duplicateShot(s: S, productionId: string, shotId: string): S {
  return withProduction(s, productionId, (p) => {
    const i = p.shots.findIndex((sh) => sh.id === shotId);
    if (i === -1) return p;
    const copy: Shot = { ...structuredClone(p.shots[i]), id: nid('shot'), takes: [], selectedTakeId: undefined, continuity: undefined };
    const shots = [...p.shots]; shots.splice(i + 1, 0, copy);
    return { ...p, shots: renumberShots(shots) };
  });
}

/** Move a shot one place within its scene. */
export function moveShot(s: S, productionId: string, shotId: string, dir: -1 | 1): S {
  return withProduction(s, productionId, (p) => {
    const i = p.shots.findIndex((sh) => sh.id === shotId);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= p.shots.length || p.shots[j].sceneId !== p.shots[i].sceneId) return p;
    const shots = [...p.shots]; [shots[i], shots[j]] = [shots[j], shots[i]];
    return { ...p, shots: renumberShots(shots) };
  });
}

/** Reorder by dragging: place `shotId` before `beforeId` (or at the end of its scene when null). Stays in scene. */
export function reorderShot(s: S, productionId: string, shotId: string, beforeId: string | null): S {
  return withProduction(s, productionId, (p) => {
    const moving = p.shots.find((sh) => sh.id === shotId);
    if (!moving) return p;
    const rest = p.shots.filter((sh) => sh.id !== shotId);
    let at = beforeId ? rest.findIndex((sh) => sh.id === beforeId) : rest.map((sh) => sh.sceneId).lastIndexOf(moving.sceneId) + 1;
    if (at === -1) return p;
    if (beforeId && rest[at].sceneId !== moving.sceneId) return p;
    if (!beforeId && at === 0 && !rest.some((sh) => sh.sceneId === moving.sceneId)) at = rest.length;
    rest.splice(at, 0, moving);
    return { ...p, shots: renumberShots(rest) };
  });
}

export function setShotContinuity(s: S, productionId: string, shotId: string, continuity: Omit<ContinuityState, 'version'>): S {
  return withProduction(s, productionId, (p) => ({ ...p, shots: p.shots.map((sh) => (sh.id === shotId ? { ...sh, continuity: { ...continuity, version: (sh.continuity?.version ?? 0) + 1 } } : sh)) }));
}

export function selectTake(s: S, productionId: string, shotId: string, takeId: string | undefined): S {
  return withProduction(s, productionId, (p) => {
    const sh = mustFind(p.shots, shotId, 'Shot');
    if ((sh.selectedTakeId ?? undefined) === (takeId ?? undefined)) return p;
    if (takeId) {
      const t = mustFind(sh.takes, takeId, 'Take');
      if (t.status === 'REJECTED') throw new StudioError('INVALID', 'A rejected take cannot be chosen for the cut.', { takeId, by: 'status' });
      if (t.rating === 'REJECTED') throw new StudioError('INVALID', `This take was rejected${t.ratingReason ? ` (${t.ratingReason})` : ''}; a rejected take cannot be chosen for the cut.`, { takeId, by: 'rating' });
    }
    return markCutStale({ ...p, shots: p.shots.map((x) => (x.id === shotId ? { ...x, selectedTakeId: takeId } : x)) });
  });
}

/** THE PRODUCER'S JUDGEMENT on a take (docs/CONTRACTS-REDESIGN-BACKEND.md B5): GOOD, REJECTED (with an optional
 *  reason), or `null` to withdraw it. Rejecting never deletes: the take, its file and its provenance stay as the
 *  record of what was tried; it only leaves the cut (it is deselected and `selectTake` refuses it). A take the
 *  inspectors rejected (`status: REJECTED`) cannot be called good. Who and when are recorded; the same judgement
 *  again changes nothing. */
export function rateTake(s: S, productionId: string, shotId: string, takeId: string, rating: TakeRating | null, opts: { reason?: string; by?: string } = {}): S {
  return withProduction(s, productionId, (p) => {
    const sh = mustFind(p.shots, shotId, 'Shot');
    const t = mustFind(sh.takes, takeId, 'Take');
    if (rating !== null && rating !== 'GOOD' && rating !== 'REJECTED') throw new StudioError('INVALID', 'A take is rated GOOD or REJECTED.', { takeId, rating });
    if (rating === 'GOOD' && t.status === 'REJECTED') throw new StudioError('INVALID', 'This take failed its checks or was rejected; it cannot be called good.', { takeId });
    const reason = rating === null ? undefined : opts.reason?.trim() || undefined;
    if ((t.rating ?? null) === rating && (t.ratingReason ?? undefined) === reason) return p;
    const judged: Take = rating === null
      ? { ...t, rating: undefined, ratingReason: undefined, ratedBy: undefined, ratedAt: undefined }
      : { ...t, rating, ratingReason: reason, ratedBy: opts.by?.trim() || 'producer', ratedAt: now() };
    const selectedTakeId = rating === 'REJECTED' && sh.selectedTakeId === takeId ? undefined : sh.selectedTakeId;
    return markCutStale({ ...p, shots: p.shots.map((x) => (x.id === shotId ? { ...x, selectedTakeId, takes: x.takes.map((y) => (y.id === takeId ? judged : y)) } : x)) });
  });
}

export function noteTake(s: S, productionId: string, shotId: string, takeId: string, note: string): S {
  return withProduction(s, productionId, (p) => ({ ...p, shots: p.shots.map((sh) => (sh.id === shotId ? { ...sh, takes: sh.takes.map((t): Take => (t.id === takeId ? { ...t, note } : t)) } : sh)) }));
}

/** Rejecting keeps the take and its file (the record of what was tried) and takes it out of the cut. */
export function rejectTake(s: S, productionId: string, shotId: string, takeId: string, reason: string): S {
  return withProduction(s, productionId, (p) => ({ ...p, shots: p.shots.map((sh) => (sh.id === shotId ? { ...sh, selectedTakeId: sh.selectedTakeId === takeId ? undefined : sh.selectedTakeId, takes: sh.takes.map((t): Take => (t.id === takeId ? { ...t, status: 'REJECTED', rejectionReason: reason } : t)) } : sh)) }));
}

/** Removing a take keeps the fact that its characters were in a video (see rules.ts). */
export function removeTake(s: S, productionId: string, shotId: string, takeId: string): S {
  const next = withProduction(s, productionId, (p) => (p.shots.some((sh) => sh.id === shotId && sh.takes.some((t) => t.id === takeId)) ? markCutStale({ ...p, shots: p.shots.map((sh) => (sh.id === shotId ? { ...sh, takes: sh.takes.filter((t) => t.id !== takeId), selectedTakeId: sh.selectedTakeId === takeId ? undefined : sh.selectedTakeId } : sh)) }) : p));
  return next === s ? s : { ...next, characters: markTakeRemoved(next.characters, shotId, takeId) };
}

export interface NewTakeInput {
  /** a worker's take carries its job's deterministic id (src/server/jobs/outputs.ts): a retry can never add it twice */
  id?: string;
  /** a worker's take may be chosen in the same batch: ALWAYS, or IF_UNCHOSEN (the shot has no real chosen take yet —
   *  nothing, or only a bundled sample). Decided on the state the batch runs on, so a producer's choice made while
   *  the take was being generated is never overridden. Ignored for a take that is not READY. */
  select?: 'ALWAYS' | 'IF_UNCHOSEN';
  assetId: string; label?: string; note?: string; status?: Take['status'];
  provider?: Take['provider']; model?: string; requestId?: string; prompt?: string; params?: Record<string, unknown>; seed?: number; references?: TakeReference[];
  width?: number; height?: number; durationSeconds?: number; fps?: number; generationMs?: number; costUsd?: number; qa?: QaReport; rejectionReason?: string; jobId?: string; codeVersion?: string; workflowVersion?: string; thumbnailAssetId?: string;
  trimStartFrames?: number; soundtrack?: Take['soundtrack']; relation?: Take['relation']; continuesTakeId?: string;
}

/** A take arrives for a shot (from a generation, or an upload): every character in the shot is recorded as having
 *  been in a video, and from then on their appearance is preserved. A new take never replaces an existing one. */
export function addTake(s: S, productionId: string, shotId: string, input: NewTakeInput): { state: S; take: Take } {
  const p = mustFind(s.productions, productionId, 'Production');
  const sh = mustFind(p.shots, shotId, 'Shot');
  mustFind(s.assets, input.assetId, 'Asset');
  if (input.id && s.productions.some((x) => x.shots.some((y) => y.takes.some((t) => t.id === input.id)))) throw new StudioError('CONFLICT', `Take ${input.id} already exists.`, { takeId: input.id });
  const { id: givenId, select, ...fields } = input;
  // the take's number is decided HERE, on the state the command runs on (audit H3, step 11): a worker's "Take N",
  // counted from a read minutes old, is renumbered when another take of the shot took N meanwhile
  const nextNumber = Math.max(sh.takes.length, ...sh.takes.map((t) => Number(/\bTake (\d+)/i.exec(t.label)?.[1] ?? 0))) + 1;
  const numbered = input.label && /^Take \d+$/.test(input.label);
  const label = !input.label || (numbered && sh.takes.some((t) => t.label === input.label)) ? `Take ${nextNumber}` : input.label;
  const take: Take = { ...fields, id: givenId ?? nid('take'), label, assetId: input.assetId, createdAt: now(), status: input.status ?? 'READY' };
  const current = sh.takes.find((t) => t.id === sh.selectedTakeId);
  const choose = take.status === 'READY' && take.rating !== 'REJECTED' && (select === 'ALWAYS' || (select === 'IF_UNCHOSEN' && (!current || current.provider === 'SAMPLE')));
  const next = withProduction(s, productionId, (x) => ({ ...x, shots: x.shots.map((y) => (y.id === shotId ? { ...y, takes: [...y.takes, take], ...(choose ? { selectedTakeId: take.id } : {}) } : y)) }));
  const updated = next.productions.find((x) => x.id === productionId)!;
  return { state: { ...next, characters: recordTakeUsage(next.characters, updated, shotId, take.id, take.createdAt) }, take };
}

/** THE PRODUCER KEEPS A FLAGGED RECORDING (src/domain/line-review.ts): "I listened, keep this one" for one or more
 *  dialogue lines whose recording the voice check flagged. The decision — who, when, KEPT — is written into each
 *  line's CURRENT recording's provenance (`review`); nothing else changes, and a recording already kept is left as it
 *  was. Refused for a line that does not exist or has no recording. Once every flagged line of a DIALOGUE_AUDIO job is
 *  kept or recorded again, the server settles that job's review (src/server/jobs/reviews.ts). */
export function keepLineRecordings(s: S, productionId: string, lines: Array<{ shotId: string; lineId: string }>, opts: { by?: string } = {}): S {
  const p = mustFind(s.productions, productionId, 'Production');
  if (!Array.isArray(lines) || lines.length === 0) throw new StudioError('INVALID', 'Name at least one line to keep.', { productionId });
  const by = opts.by?.trim() || 'producer';
  const at = now();
  const keep = new Map<string, { shotId: string; lineId: string }>();
  for (const l of lines) {
    const sh = mustFind(p.shots, l.shotId, 'Shot');
    const d = sh.dialogue.find((x) => x.id === l.lineId);
    if (!d) throw new StudioError('NOT_FOUND', `Line ${l.lineId} not found in this shot.`, { shotId: l.shotId, lineId: l.lineId });
    if (!d.audioAssetId) throw new StudioError('INVALID', 'This line has no recording to keep yet.', { shotId: l.shotId, lineId: l.lineId });
    const a = mustFind(s.assets, d.audioAssetId, 'Asset');
    if ((a.provenance as { review?: { decision?: string } } | undefined)?.review?.decision === 'KEPT') continue;
    keep.set(a.id, { shotId: l.shotId, lineId: l.lineId });
  }
  if (keep.size === 0) return s;
  return { ...s, assets: s.assets.map((a) => (keep.has(a.id) ? { ...a, provenance: { ...(a.provenance ?? {}), review: { decision: 'KEPT', by, at, ...keep.get(a.id)! } } } : a)) };
}

/** The studio drew (or redrew) a shot's frames. */
export function setShotFrames(s: S, productionId: string, shotId: string, frames: { openingFrameAssetId?: string | null; endingFrameAssetId?: string | null }): S {
  return updateShot(s, productionId, shotId, frames);
}

/** A line of a shot's dialogue got its recording (and remembers which voice revision spoke it). */
export function setDialogueAudio(s: S, productionId: string, shotId: string, lineId: string, audio: { audioAssetId: string; durationSeconds: number; voiceRevision?: number }): S {
  return withProduction(s, productionId, (p) => ({ ...p, shots: p.shots.map((sh) => (sh.id === shotId ? { ...sh, dialogue: sh.dialogue.map((d) => (d.id === lineId ? { ...d, ...audio } : d)) } : sh)) }));
}

// -------------------------------------------------------------------------------------------------------- song

export function setSong(s: S, productionId: string, song: Song | undefined): S { return updateProduction(s, productionId, { song }); }

export function updateSong(s: S, productionId: string, patch: Partial<Song>): S {
  return withProduction(s, productionId, (p) => (p.song ? { ...p, song: { ...p.song, ...patch } } : p));
}

// -------------------------------------------------------------------------------------------------- characters

/** What `addCharacter` accepts: the written profile, an optional voice profile (pitch, pace, timbre, notes — never
 *  samples or an identity: a new character has none), and optionally pictures the caller already holds. */
export type CharacterInput = CharacterProfileInput & { voice?: VoiceProfileInput & Partial<Pick<Voice, 'timbre' | 'notes'>>; refs?: CharacterRef[]; portraitAssetId?: string; pendingReference?: PendingReference };

const PROFILE_KEYS = ['nameAr', 'role', 'style', 'sex', 'species', 'ageYears', 'build', 'face', 'hair', 'skin', 'eyes', 'wardrobe', 'personality', 'distinguishing', 'language', 'dialect', 'canon', 'notes'] as const satisfies ReadonlyArray<keyof CharacterProfileInput>;

/** The dialect a character speaks: the given one for Arabic (or the studio's default), none for English. */
function dialectFor(s: S, language: Language, dialect: Dialect | undefined): Dialect | undefined {
  return language === 'AR' ? dialect ?? s.settings.defaults.dialect : undefined;
}

export function addCharacter(s: S, input: CharacterInput): { state: S; character: Character } {
  const t = now();
  if (!input.name?.trim()) throw new StudioError('INVALID', 'A character needs a name.');
  if (!Number.isInteger(input.ageYears) || input.ageYears < 1 || input.ageYears > 120) throw new StudioError('INVALID', 'A character’s age must be a whole number between 1 and 120.');
  const profile = Object.fromEntries(PROFILE_KEYS.filter((k) => input[k] !== undefined).map((k) => [k, input[k]])) as Partial<CharacterProfileInput>;
  const character: Character = {
    ...(profile as Pick<Character, (typeof PROFILE_KEYS)[number]>),
    id: nid('char'), name: input.name.trim(), role: input.role ?? '', style: input.style, sex: input.sex, ageYears: input.ageYears,
    build: input.build ?? '', face: input.face ?? '', hair: input.hair ?? '', skin: input.skin ?? '', eyes: input.eyes ?? '', wardrobe: input.wardrobe ?? '', personality: input.personality ?? '', distinguishing: input.distinguishing ?? [],
    language: input.language, dialect: dialectFor(s, input.language, input.dialect),
    refs: input.refs ?? [], portraitAssetId: input.portraitAssetId, pendingReference: input.pendingReference,
    voice: { pitch: input.voice?.pitch ?? 'MID', pace: input.voice?.pace ?? 'MEASURED', timbre: input.voice?.timbre ?? '', notes: input.voice?.notes ?? '', samples: [] },
    usage: { known: true, videos: [] }, createdAt: t, updatedAt: t,
  };
  return { state: { ...s, characters: [...s.characters, character] }, character };
}

/** The write every character change goes through: the appearance guard, never usage. Internal: the voice commands
 *  below call it with the voice fields they own; `updateCharacter` is the public patch and strips them. */
function writeCharacter(s: S, id: string, patch: Partial<Omit<Character, 'id' | 'createdAt' | 'usage'>>): S {
  const c = mustFind(s.characters, id, 'Character');
  const allowed = guardCharacterPatch(c, patch as Partial<Character>);
  delete (allowed as Partial<Character>).usage;
  if (Object.keys(allowed).length === 0) return s;
  return { ...s, characters: s.characters.map((x) => (x.id === id ? { ...x, ...allowed, updatedAt: now() } : x)) };
}

/** Any change to a character's record. A character who has been in a video keeps their appearance: a patch that
 *  changes an appearance field of a locked character is refused (APPEARANCE_LOCKED), whatever page or worker sends
 *  it. Usage is never patched here, and neither is the voice's identity, its samples or the chosen one: those have
 *  their own commands, so a whole-form save can never replace a built voice. A change of language or dialect makes
 *  an existing identity STALE (it was built for the old one) — or is refused when the voice is locked. */
export function updateCharacter(s: S, id: string, patch: Partial<Omit<Character, 'id' | 'createdAt' | 'usage'>>): S {
  const c = mustFind(s.characters, id, 'Character');
  const next = { ...patch } as Partial<Character>;
  // the canonical image has its own commands (setCanonicalImage, approveCanonicalImage): a whole-form save can never
  // replace, approve or un-approve it
  delete next.canonicalImage;
  if (next.voice) {
    const v = { ...next.voice } as Partial<Voice>;
    for (const k of VOICE_INTERNAL_KEYS) delete v[k];
    next.voice = { ...c.voice, ...v };
  }
  const language = next.language ?? c.language;
  const speechTouched = 'language' in next || 'dialect' in next;
  if (speechTouched) next.dialect = dialectFor(s, language, 'dialect' in next ? next.dialect : c.dialect);
  const speechChanged = language !== c.language || (speechTouched && (next.dialect ?? undefined) !== (c.dialect ?? undefined));
  if (speechChanged && c.voice.identity) {
    guardVoiceChange(c, 'language or dialect');
    next.voice = { ...(next.voice ?? c.voice), identity: { ...c.voice.identity, status: 'STALE' } };
  }
  return writeCharacter(s, id, next);
}

/** Keep (or clear) the reference picture an unused character's appearance will be generated from. Refused for a
 *  character who has been in a video. */
export function setPendingReference(s: S, id: string, assetId: string | undefined, validation?: PendingReference['validation']): S {
  const c = mustFind(s.characters, id, 'Character');
  if (!canChangeAppearance(c)) throw new StudioError('APPEARANCE_LOCKED', `${c.name} has been used in a video; a new reference cannot replace the appearance.`, { characterId: id });
  if (assetId) {
    const a = mustFind(s.assets, assetId, 'Asset');
    if (a.kind !== 'IMAGE' || a.sample) throw new StudioError('INVALID', 'A reference must be an uploaded picture, not a bundled sample.', { assetId });
  }
  return writeCharacter(s, id, { pendingReference: assetId ? { assetId, addedAt: now(), validation } : undefined });
}

/** Add a voice line the producer recorded or the studio generated. Voice is not appearance: this works for every
 *  character. Only an upload can be chosen as the voice: a generated line is engine output, a bundled sample a
 *  placeholder. */
export function addVoiceSample(s: S, id: string, sample: Omit<VoiceSample, 'id'> & { id?: string }, select = false): { state: S; sample: VoiceSample } {
  const c = mustFind(s.characters, id, 'Character');
  if (sample.id && c.voice.samples.some((x) => x.id === sample.id)) throw new StudioError('CONFLICT', `Voice sample ${sample.id} already exists.`);
  // adding a line to listen to is always allowed; making it THE voice of a used character is not
  if (select && c.voice.selectedSampleId) guardVoiceChange(c, 'chosen recording');
  if (select && !isCloneSource(sample)) throw new StudioError('INVALID', 'Only an uploaded recording can be chosen as the voice; a generated line or a bundled sample cannot.', { source: sample.source });
  // a consent statement belongs to a real person's recording only
  const { consent, ...rest } = sample;
  const v: VoiceSample = { ...rest, ...(consent && sample.source === 'UPLOADED' ? { consent } : {}), id: sample.id ?? nid('voice') };
  return { state: writeCharacter(s, id, { voice: { ...c.voice, samples: [...c.voice.samples, v], selectedSampleId: select ? v.id : c.voice.selectedSampleId } }), sample: v };
}

/** The producer uploaded a recording: it must exist in the library as real audio (never a bundled sample). */
export function addVoiceRecording(s: S, id: string, assetId: string, label: string, extra: Partial<Pick<VoiceSample, 'text' | 'language' | 'dialect' | 'durationSeconds' | 'provenance' | 'consent'>> = {}): S {
  const a = mustFind(s.assets, assetId, 'Asset');
  if (a.kind !== 'AUDIO' || a.sample) throw new StudioError('INVALID', 'A voice recording must be an uploaded audio file.', { assetId });
  return addVoiceSample(s, id, { label, assetId, source: 'UPLOADED', ...extra }).state;
}

/** Correct what a sample says or how it is labelled (the transcript stored once, a producer's label). */
export function updateVoiceSample(s: S, id: string, sampleId: string, patch: Partial<Pick<VoiceSample, 'label' | 'text' | 'language' | 'dialect' | 'durationSeconds' | 'provenance'>>): S {
  const c = mustFind(s.characters, id, 'Character');
  mustFind(c.voice.samples, sampleId, 'Voice sample');
  // the consent statement has its own command (confirmVoiceConsent); a correction of the words never writes it
  const { consent: _consent, ...safe } = patch as typeof patch & { consent?: unknown }; void _consent;
  return writeCharacter(s, id, { voice: { ...c.voice, samples: c.voice.samples.map((x) => (x.id === sampleId ? { ...x, ...safe } : x)) } });
}

export function removeVoiceSample(s: S, id: string, sampleId: string): S {
  const c = mustFind(s.characters, id, 'Character');
  if (c.voice.selectedSampleId === sampleId || c.voice.identity?.referenceSampleId === sampleId) guardVoiceChange(c, 'chosen recording');
  const identity = c.voice.identity?.referenceSampleId === sampleId ? { ...c.voice.identity, status: 'STALE' as const } : c.voice.identity;
  return writeCharacter(s, id, { voice: { ...c.voice, identity, samples: c.voice.samples.filter((x) => x.id !== sampleId), selectedSampleId: c.voice.selectedSampleId === sampleId ? undefined : c.voice.selectedSampleId } });
}

export type VoiceIdentityInput = Omit<VoiceIdentity, 'revision' | 'createdAt' | 'status' | 'listening'> & { status?: VoiceIdentity['status'] };

/** The tier of a designed seed (contract v2 §3): the pinned seed and its 48 kHz original are SECONDARY (the voice's
 *  source sample); a seed no longer pinned goes back to RAW, like every unchosen candidate. Files stay. */
function withSeedTiers(s: S, pinned: string[], retired: string[]): S {
  const want = new Map<string, AssetTier>();
  for (const a of retired) if (!pinned.includes(a)) want.set(a, 'RAW');
  for (const a of pinned) want.set(a, 'SECONDARY');
  if (![...want].some(([a, tier]) => s.assets.some((x) => x.id === a && x.tier !== tier))) return s;
  return { ...s, assets: s.assets.map((x) => (want.has(x.id) && x.tier !== want.get(x.id) ? { ...x, tier: want.get(x.id) } : x)) };
}

const seedAssetsOf = (c: Character, identity: Pick<VoiceIdentity, 'origin' | 'designId' | 'referenceAssetId'> | undefined): string[] => {
  if (identity?.origin !== 'DESIGNED' || !identity.referenceAssetId) return [];
  const cand = c.voice.designs?.find((d) => d.id === identity.designId)?.candidates.find((x) => x.assetId === identity.referenceAssetId);
  return [identity.referenceAssetId, ...(cand?.nativeAssetId ? [cand.nativeAssetId] : [])];
};

/** The character's one voice identity: set when the voice is built (after the proof line exists, in the same
 *  batch), bumped when rebuilt, refused for a voice-locked character. The only writer of `voice.identity` (a
 *  listening record and a consent confirmation append to it). Contract v2 §1: every identity names its ORIGIN —
 *  UPLOAD_CONSENTED (the reference is an upload with a consent statement, copied onto the identity), DESIGNED (Rule
 *  V-DESIGN: the reference is a candidate of a design record of this character and its sha256 is the record's; the
 *  record is marked chosen), HOSTED (MiniMax). The dialect status starts UNVERIFIED for Arabic (only a listener moves
 *  it) and the Iraqi designed-seed experiment is always REVIEW. */
export function setVoiceIdentity(s: S, id: string, identity: VoiceIdentityInput): S {
  const c = mustFind(s.characters, id, 'Character');
  // a locked voice keeps its identity; a voice locked by its chosen recording alone may only be pinned to that one
  guardVoiceBuild(c, identity.referenceSampleId, 'voice identity');
  if (!identity.proof?.sampleId || !identity.proof.assetId) throw new StudioError('INVALID', 'A voice identity needs its proof: the line that was spoken with it and heard back.', { characterId: id });
  const proof = c.voice.samples.find((x) => x.id === identity.proof!.sampleId);
  if (!proof || proof.assetId !== identity.proof.assetId || proof.source !== 'GENERATED') throw new StudioError('INVALID', 'The proof line must be a generated sample of this character, stored before the identity is pinned.', { characterId: id, sampleId: identity.proof.sampleId });
  const origin = identity.origin;
  if (!origin) throw new StudioError('INVALID', 'A voice identity names its origin: UPLOAD_CONSENTED (a consented recording), DESIGNED (a studio-designed voice) or HOSTED (MiniMax).', { characterId: id });
  if (origin === 'GENERATED') throw new StudioError('INVALID', 'A generated line is never the origin of a voice.', { characterId: id });
  if ((origin === 'HOSTED') !== (identity.provider === 'MINIMAX')) throw new StudioError('INVALID', 'A hosted (MiniMax) voice has the origin HOSTED, and only it does.', { characterId: id, origin, provider: identity.provider });
  if (identity.dialectStatus === 'LISTENER_APPROVED' || identity.dialectStatus === 'LISTENER_REJECTED') throw new StudioError('INVALID', 'Only a listener’s record sets the dialect status (recordVoiceListening).', { characterId: id });
  let consent: VoiceIdentity['consent'];
  if (identity.referenceSampleId) {
    const ref = c.voice.samples.find((x) => x.id === identity.referenceSampleId);
    if (!ref || !isCloneSource(ref)) throw new StudioError('INVALID', 'The reference of a voice identity must be an uploaded recording, never a generated line or a bundled sample.', { characterId: id, sampleId: identity.referenceSampleId });
    if (identity.referenceAssetId && identity.referenceAssetId !== ref.assetId) throw new StudioError('INVALID', 'The reference asset does not belong to the reference sample.', { characterId: id });
    if (!isConsentedUpload(ref)) throw consentRequired(`“${ref.label}” has no consent statement; a voice is cloned only from a recording the producer confirmed is theirs or the speaker’s with permission.`, { characterId: id, sampleId: ref.id });
    consent = ref.consent;
  }
  let design: { record: VoiceDesignRecord; candidate: VoiceDesignCandidate } | undefined;
  if (origin === 'UPLOAD_CONSENTED' && !identity.referenceSampleId) throw new StudioError('INVALID', 'A recorded voice names the consented recording it was cloned from.', { characterId: id });
  if (origin === 'DESIGNED') {
    if (identity.referenceSampleId) throw new StudioError('INVALID', 'A designed voice is cloned from its design seed, never from a recording.', { characterId: id });
    if (!identity.designId || !identity.seedSha256 || !identity.referenceAssetId) throw new StudioError('INVALID', 'A designed voice names its design record, its seed file and the seed’s sha256 (Rule V-DESIGN).', { characterId: id });
    const a = mustFind(s.assets, identity.referenceAssetId, 'Asset');
    if (a.kind !== 'AUDIO' || a.sample || !a.sha256) throw new StudioError('INVALID', 'A design seed is a stored audio file with its sha256.', { characterId: id, assetId: a.id });
    const problem = designedSeedProblem(c, { designId: identity.designId, assetId: a.id, fileSha256: identity.seedSha256, assetSha256: a.sha256 });
    if (problem) throw new StudioError('INVALID', `Rule V-DESIGN: ${problem}.`, { characterId: id, designId: identity.designId, assetId: a.id });
    if (isIraqi(identity) && !designedIraqiOn(s.settings)) throw missingReference(IRAQI_NEEDS_RECORDING, { characterId: id, designId: identity.designId });
    const record = c.voice.designs!.find((d) => d.id === identity.designId)!;
    design = { record, candidate: record.candidates.find((x) => x.assetId === a.id)! };
  } else if (identity.referenceAssetId) {
    const a = mustFind(s.assets, identity.referenceAssetId, 'Asset');
    if (a.kind !== 'AUDIO' || a.sample || a.origin === 'GENERATED') throw new StudioError('INVALID', 'The reference of a voice identity must be an uploaded recording.', { assetId: identity.referenceAssetId });
  }
  if (identity.mode === 'MANUAL' && !identity.providerVoiceId) throw new StudioError('INVALID', 'A catalogue voice needs the provider’s voice id.');
  const experiment = origin === 'DESIGNED' && isIraqi(identity);
  const { listening: _listening, ...rest } = identity as VoiceIdentityInput & { listening?: unknown }; void _listening;
  const next: VoiceIdentity = {
    ...rest,
    // the designed-Iraqi experiment is never ACTIVE: its dialect is unverified by construction
    status: experiment ? 'REVIEW' : identity.status ?? 'ACTIVE',
    dialectStatus: initialDialectStatus(identity.language),
    revision: (c.voice.identity?.revision ?? 0) + 1, createdAt: now(),
  };
  // what the identity says about its source is the source's, never the caller's
  if (consent) next.consent = consent; else delete next.consent;
  if (design) { next.designId = design.record.id; next.seedSha256 = design.candidate.sha256; } else { delete next.designId; delete next.seedSha256; }
  // the proof line is listened to, never spoken from: it is not the chosen recording
  const selectedSampleId = c.voice.selectedSampleId === next.proof!.sampleId ? undefined : c.voice.selectedSampleId;
  const designs = design ? c.voice.designs!.map((d) => (d.id === design!.record.id ? { ...d, chosen: design!.candidate.index, chosenBy: identity.mode === 'DESIGN' ? ('PRODUCER' as const) : ('AUTOMATIC' as const) } : d)) : c.voice.designs;
  const written = writeCharacter(s, id, { voice: { ...c.voice, identity: next, selectedSampleId, ...(designs ? { designs } : {}) } });
  return withSeedTiers(written, design ? seedAssetsOf({ ...c, voice: { ...c.voice, designs } }, next) : [], seedAssetsOf(c, c.voice.identity));
}

export type VoiceDesignRecordInput = Omit<VoiceDesignRecord, 'label' | 'chosen' | 'chosenBy' | 'createdAt'> & { createdAt?: string };

/** A VOICE_DESIGN result is kept on the character (Rule V-DESIGN §1): written once, after its candidate files are
 *  stored as assets, before anything is measured — so a later failure keeps the candidates and their record. Every
 *  candidate must be a stored generated audio file whose sha256 is the record's and whose provenance names this
 *  design. Refused for a voice-locked character (a design could not be used), and for an Iraqi character unless the
 *  `allowDesignedIraqi` experiment is on. */
export function addVoiceDesign(s: S, id: string, input: VoiceDesignRecordInput): S {
  const c = mustFind(s.characters, id, 'Character');
  const lock = voiceBuildLockProblem(c, undefined);
  if (lock) throw new StudioError('VOICE_LOCKED', `${lock} (voice design).`, { characterId: id });
  if (input.characterId !== id) throw new StudioError('INVALID', 'The design record belongs to another character.', { characterId: id, recordCharacterId: input.characterId });
  if (c.voice.designs?.some((d) => d.id === input.id)) throw new StudioError('CONFLICT', `Voice design ${input.id} already exists.`, { characterId: id, designId: input.id });
  if (input.language !== c.language) throw new StudioError('INVALID', `The design speaks ${input.language}; ${c.name} speaks ${c.language}.`, { characterId: id });
  if (input.candidates.length < 1 || input.candidates.length > 3) throw new StudioError('INVALID', 'A design has one to three candidates.', { characterId: id });
  for (const cand of input.candidates) {
    const a = mustFind(s.assets, cand.assetId, 'Asset');
    if (a.kind !== 'AUDIO' || a.origin !== 'GENERATED' || a.sha256 !== cand.sha256 || a.provenance?.designId !== input.id) throw new StudioError('INVALID', `Rule V-DESIGN: candidate ${cand.index}'s stored file does not match the record (it must be this design's generated audio with the same sha256).`, { characterId: id, designId: input.id, assetId: a.id });
  }
  if (isIraqi(input)) {
    if (!designedIraqiOn(s.settings)) throw missingReference(IRAQI_NEEDS_RECORDING, { characterId: id });
    if (input.experiment !== 'DESIGNED_IRAQI') throw new StudioError('INVALID', 'An Iraqi design is the designed-seed experiment and says so.', { characterId: id });
  }
  const record: VoiceDesignRecord = { ...input, label: DESIGN_LABEL, createdAt: input.createdAt ?? now() };
  delete record.chosen; delete record.chosenBy;
  return writeCharacter(s, id, { voice: { ...c.voice, designs: [...(c.voice.designs ?? []), record] } });
}

export interface VoiceDesignMeasurementPatch {
  candidates: Array<Pick<VoiceDesignCandidate, 'index' | 'measured' | 'gate'> & Partial<Pick<VoiceDesignCandidate, 'previews' | 'similarityMean' | 'letterCoverageMean' | 'cerMean'>>>;
  ranking?: number[]; rankedBy?: string; similarityModel?: string;
}

/** The measurements of a design's candidates (gates, previews through the line engine, ECAPA, the ranking). What a
 *  candidate IS — its file, sha256, seed and length — is never rewritten; a design already pinned is not re-measured. */
export function updateVoiceDesign(s: S, id: string, designId: string, patch: VoiceDesignMeasurementPatch): S {
  const c = mustFind(s.characters, id, 'Character');
  const rec = mustFind(c.voice.designs ?? [], designId, 'Voice design');
  if (rec.chosen !== undefined) throw new StudioError('CONFLICT', 'A pinned design keeps the measurements it was chosen on.', { characterId: id, designId });
  for (const p of patch.candidates) {
    if (!rec.candidates.some((x) => x.index === p.index)) throw new StudioError('INVALID', `Design ${designId} has no candidate ${p.index}.`, { characterId: id, designId });
    for (const pv of p.previews ?? []) if (pv.assetId) { const a = mustFind(s.assets, pv.assetId, 'Asset'); if (a.kind !== 'AUDIO') throw new StudioError('INVALID', 'A preview is an audio file.', { assetId: a.id }); }
  }
  for (const i of patch.ranking ?? []) if (!rec.candidates.some((x) => x.index === i)) throw new StudioError('INVALID', `The ranking names a candidate ${i} the design does not have.`, { characterId: id, designId });
  const next: VoiceDesignRecord = {
    ...rec,
    candidates: rec.candidates.map((x) => {
      const p = patch.candidates.find((y) => y.index === x.index);
      if (!p) return x;
      return { ...x, measured: p.measured, gate: p.gate, ...(p.previews ? { previews: p.previews } : {}), ...(p.similarityMean !== undefined ? { similarityMean: p.similarityMean } : {}), ...(p.letterCoverageMean !== undefined ? { letterCoverageMean: p.letterCoverageMean } : {}), ...(p.cerMean !== undefined ? { cerMean: p.cerMean } : {}) };
    }),
    ...(patch.ranking ? { ranking: patch.ranking } : {}), ...(patch.rankedBy ? { rankedBy: patch.rankedBy } : {}), ...(patch.similarityModel ? { similarityModel: patch.similarityModel } : {}),
  };
  return writeCharacter(s, id, { voice: { ...c.voice, designs: (c.voice.designs ?? []).map((d) => (d.id === designId ? next : d)) } });
}

/** "I listened" (contract v2 §4): naturalness 1–5 and, for an Arabic voice, whether it sounds authentic; the dialect
 *  status follows a listener's answer and nothing else. Allowed on a locked voice — listening changes nothing in it. */
export function recordVoiceListening(s: S, id: string, rec: { natural: number; dialectAuthentic?: boolean; note?: string }): S {
  const c = mustFind(s.characters, id, 'Character');
  const identity = c.voice.identity;
  if (!identity) throw new StudioError('INVALID', `${c.name} has no voice to listen to yet; build the voice first.`, { characterId: id });
  if (!Number.isInteger(rec.natural) || rec.natural < 1 || rec.natural > 5) throw new StudioError('INVALID', 'Naturalness is a whole number from 1 to 5.', { characterId: id });
  if (rec.dialectAuthentic !== undefined && identity.language !== 'AR') throw new StudioError('INVALID', 'Accent and dialect are judged for Arabic voices.', { characterId: id });
  return writeCharacter(s, id, { voice: { ...c.voice, identity: withListening(identity, rec, now()) } });
}

/** The producer's consent for a recording uploaded before consent was recorded (contract v2 §1): the same statement
 *  the upload page asks for. The recording does not change, so this is allowed on a locked voice; an identity pinned
 *  from it before v2 becomes UPLOAD_CONSENTED. */
export function confirmVoiceConsent(s: S, id: string, sampleId: string, statement: ConsentStatement): S {
  const c = mustFind(s.characters, id, 'Character');
  const sm = mustFind(c.voice.samples, sampleId, 'Voice sample');
  if (!isCloneSource(sm)) throw new StudioError('INVALID', 'Consent is recorded for an uploaded recording; a generated line or a bundled sample has none.', { characterId: id, sampleId });
  if (!isConsentStatement(statement)) throw new StudioError('INVALID', 'The consent statement is MY_VOICE or SPEAKER_PERMISSION.', { characterId: id });
  if (sm.consent?.statement === statement) return s;
  const consent = { statement, by: 'PRODUCER' as const, at: now() };
  const identity = c.voice.identity;
  const upgraded = identity && !identity.origin && identity.provider === 'LOCAL_TTS' && identity.referenceSampleId === sampleId ? { ...identity, origin: 'UPLOAD_CONSENTED' as const, consent } : identity && identity.referenceSampleId === sampleId && identity.consent ? { ...identity, consent } : identity;
  return writeCharacter(s, id, { voice: { ...c.voice, identity: upgraded, samples: c.voice.samples.map((x) => (x.id === sampleId ? { ...x, consent } : x)) } });
}

/** Deleting a character keeps every picture it had; its canonical image is no longer canonical (RAW). */
export function deleteCharacter(s: S, id: string): S {
  const drop = (ids: string[]) => ids.filter((x) => x !== id);
  const img = s.characters.find((c) => c.id === id)?.canonicalImage?.assetId;
  const without: S = { ...s, characters: s.characters.filter((c) => c.id !== id) };
  return {
    ...withTiers(without, [], img ? [img] : []),
    shows: s.shows.map((sh) => ({ ...sh, castIds: drop(sh.castIds) })),
    productions: s.productions.map((p) => ({ ...p, castIds: drop(p.castIds), scenes: p.scenes.map((sc) => ({ ...sc, characterIds: drop(sc.characterIds) })), shots: p.shots.map((sh) => ({ ...sh, characterIds: drop(sh.characterIds) })) })),
  };
}

/** Choose the recording the character speaks with. Only an upload qualifies: a generated line (the proof, a
 *  preview) is engine output and a bundled sample is a placeholder; cloning from either drifts the voice. */
export function selectVoiceSample(s: S, id: string, sampleId: string | undefined): S {
  const c = mustFind(s.characters, id, 'Character');
  if (sampleId !== c.voice.selectedSampleId) guardVoiceChange(c, 'chosen recording');
  if (sampleId) {
    const sm = mustFind(c.voice.samples, sampleId, 'Voice sample');
    if (!sm.assetId) throw new StudioError('INVALID', 'This voice has no recording yet.');
    if (!isCloneSource(sm)) throw new StudioError('INVALID', sm.source === 'GENERATED' ? 'A generated line cannot be the voice; choose an uploaded recording.' : 'A bundled sample voice cannot be the voice; upload a recording.', { sampleId, source: sm.source });
  }
  return { ...s, characters: s.characters.map((x) => (x.id === id ? { ...x, voice: { ...x.voice, selectedSampleId: sampleId }, updatedAt: now() } : x)) };
}

// ------------------------------------------------------------------------------------------- the canonical image

/** What the worker hands `setCanonicalImage`: how the picture was drawn. Status and version are the reducer's (a new
 *  image is always a DRAFT one version further); `generatedAt` defaults to the command's clock. */
export type CanonicalImageInput = Pick<CanonicalImage, 'assetId'> & Partial<Pick<CanonicalImage, 'jobId' | 'seed' | 'referenceAssetId' | 'engine' | 'identityLine' | 'check' | 'generatedAt'>>;

/** Set asset tiers: the given assets to CANONICAL; a retired asset (no longer anyone's canonical image) to RAW.
 *  Files and records are never removed here. */
function withTiers(s: S, canonicalIds: string[], retired: string[]): S {
  const still = new Set(s.characters.map((c) => c.canonicalImage?.assetId).filter(Boolean));
  const want = new Map<string, AssetTier>();
  for (const id of retired) if (!still.has(id)) want.set(id, 'RAW');
  for (const id of canonicalIds) want.set(id, 'CANONICAL');
  if (![...want].some(([id, tier]) => s.assets.some((a) => a.id === id && a.tier !== tier))) return s;
  return { ...s, assets: s.assets.map((a) => (want.has(a.id) && a.tier !== want.get(a.id) ? { ...a, tier: want.get(a.id) } : a)) };
}

/** The studio drew (or redrew) the character's canonical front full-body image (docs/CONTRACTS-IDENTITY-PACK.md v2).
 *  It is a DRAFT one version further until the producer approves it; the new picture becomes CANONICAL and the one it
 *  replaces RAW (kept in the library, never deleted). An image drawn from the pending reference picture
 *  (`referenceAssetId`) consumes it. Refused with APPEARANCE_LOCKED once the character has been in a video. The same
 *  picture with the same details again changes nothing (a retried job is harmless). */
export function setCanonicalImage(s: S, characterId: string, input: CanonicalImageInput): S {
  const c = mustFind(s.characters, characterId, 'Character');
  guardCanonicalChange(c, 'redraw');
  const a = mustFind(s.assets, input.assetId, 'Asset');
  if (a.kind !== 'IMAGE' || a.sample) throw new StudioError('INVALID', 'A canonical image must be a drawn or uploaded picture, never a bundled sample.', { assetId: a.id });
  const owner = canonicalImageOwner(s, a.id);
  if (owner && owner.id !== c.id) throw new StudioError('INVALID', `This picture is ${owner.name}’s canonical image.`, { assetId: a.id, characterId: owner.id });
  const prev = c.canonicalImage;
  // only what the worker reports about the drawing; status, version and approval are this reducer's
  const drawn = { assetId: a.id, jobId: input.jobId, seed: input.seed, referenceAssetId: input.referenceAssetId, engine: input.engine, identityLine: input.identityLine, check: input.check };
  const same = prev && canonical(drawn) === canonical({ assetId: prev.assetId, jobId: prev.jobId, seed: prev.seed, referenceAssetId: prev.referenceAssetId, engine: prev.engine, identityLine: prev.identityLine, check: prev.check });
  if (same) return withTiers(s, [a.id], []);
  const next: CanonicalImage = { ...drawn, status: 'DRAFT', version: (prev?.version ?? 0) + 1, generatedAt: input.generatedAt ?? now() };
  const patch: Partial<Character> = { canonicalImage: next };
  if (c.pendingReference && input.referenceAssetId === c.pendingReference.assetId) patch.pendingReference = undefined;
  return withTiers(writeCharacter(s, characterId, patch), [a.id], prev && prev.assetId !== a.id ? [prev.assetId] : []);
}

/** The producer approves the image they reviewed, by its version: refused when there is none, when it changed since
 *  (CONFLICT — never approve a stale image), or when its check failed — unless `override` is set with a reason, which
 *  is recorded on the image. Refused once the character has been in a video. Approving it again changes nothing. */
export function approveCanonicalImage(s: S, characterId: string, version: number, opts: { override?: boolean; reason?: string } = {}): S {
  const c = mustFind(s.characters, characterId, 'Character');
  guardCanonicalChange(c, 'approval');
  const img = c.canonicalImage;
  if (img?.status === 'APPROVED' && img.version === version) return s;
  const problem = approvalProblem(img, version, Boolean(opts.override));
  if (problem) throw new StudioError(problem.code, problem.message, { characterId, ...problem.details });
  const failed = canonicalCheckFailed(img);
  const reason = opts.reason?.trim();
  if (failed && !reason) throw new StudioError('INVALID', 'Approving over a failed check needs a reason.', { characterId, check: img!.check });
  const next: CanonicalImage = { ...img!, status: 'APPROVED', approvedAt: now(), approvalOverride: failed ? { reason: reason!, at: now() } : undefined };
  return writeCharacter(s, characterId, { canonicalImage: next });
}

// --------------------------------------------------------------------------------------------------- locations

export type LocationInput = Omit<Location, 'id' | 'createdAt' | 'updatedAt' | 'refs'> & { refs?: LocationRef[] };

export function addLocation(s: S, input: LocationInput): { state: S; location: Location } {
  const t = now();
  if (!input.name?.trim()) throw new StudioError('INVALID', 'A location needs a name.');
  // the identity (the Location Bible) is the studio's: version 1 of what the place holds, never a caller's
  const { identity: _given, ...fields } = input as LocationInput & { identity?: unknown };
  void _given;
  const location: Location = withLocationIdentity({ ...fields, name: input.name.trim(), id: nid('loc'), refs: input.refs ?? [], createdAt: t, updatedAt: t }, t);
  return { state: { ...s, locations: [...s.locations, location] }, location };
}

/** A change of the place: its identity version moves on when the canon changed (src/domain/location.ts) — a patch
 *  never writes the identity itself. */
export function updateLocation(s: S, id: string, patch: Partial<Omit<Location, 'id' | 'createdAt'>>): S {
  mustFind(s.locations, id, 'Location');
  const t = now();
  const { identity: _given, ...fields } = patch as typeof patch & { identity?: unknown };
  void _given;
  return { ...s, locations: s.locations.map((l) => (l.id === id ? advanceIdentity(l, { ...l, ...fields, updatedAt: t }, t) : l)) };
}

/** The studio drew plates for a location. A new MASTER starts a new plate set (the views and states made from the
 *  old master no longer match it); other roles are added to the current set. Old pictures stay in the library. */
export function addLocationRefs(s: S, id: string, refs: LocationRef[]): S {
  const l = mustFind(s.locations, id, 'Location');
  const master = refs.find((r) => r.role === 'MASTER');
  const kept = master ? [] : l.refs;
  return updateLocation(s, id, { refs: [...kept, ...refs], masterAssetId: master?.assetId ?? l.masterAssetId ?? refs[0]?.assetId });
}

export function deleteLocation(s: S, id: string): S {
  const drop = (ids: string[]) => ids.filter((x) => x !== id);
  return {
    ...s,
    locations: s.locations.filter((l) => l.id !== id),
    shows: s.shows.map((sh) => ({ ...sh, locationIds: drop(sh.locationIds) })),
    productions: s.productions.map((p) => ({ ...p, locationIds: drop(p.locationIds), scenes: p.scenes.map((sc) => (sc.locationId === id ? { ...sc, locationId: undefined } : sc)) })),
  };
}

// ------------------------------------------------------------------------------------------------------ assets

/** Record an asset (the server wrote the file; the browser only ever calls this through an upload). */
export function addAsset(s: S, input: Omit<Asset, 'createdAt' | 'id'> & { id?: string }): { state: S; asset: Asset } {
  const asset: Asset = { ...input, id: input.id ?? nid(input.origin === 'UPLOAD' ? 'up' : 'gen'), createdAt: now() };
  if (s.assets.some((a) => a.id === asset.id)) throw new StudioError('CONFLICT', `Asset ${asset.id} already exists.`);
  return { state: { ...s, assets: [...s.assets, asset] }, asset };
}

export function updateAsset(s: S, id: string, patch: Partial<Pick<Asset, 'label' | 'tags' | 'poster' | 'width' | 'height' | 'durationSeconds' | 'fps' | 'provenance' | 'unavailable' | 'presentation' | 'thumb'>>): S {
  mustFind(s.assets, id, 'Asset');
  // the tier has its own command (setAssetTier) and the identity commands; a general patch never moves it
  const { tier: _tier, ...rest } = patch as typeof patch & { tier?: unknown }; void _tier;
  return { ...s, assets: s.assets.map((a) => (a.id === id ? { ...a, ...rest } : a)) };
}

/** What a picture is to the character system (docs/CONTRACTS-IDENTITY-PACK.md v2 §1): SECONDARY (optional material
 *  made on request) or RAW (rejected candidates, previous versions, intermediate output — never on a profile), or no
 *  tier at all (null). CANONICAL belongs to canonical images and is set only by `setCanonicalImage`: a current
 *  canonical image cannot be moved off it (redraw to replace it — refused outright for a character used in a video)
 *  and no other picture can be moved onto it. Files and records are never removed here. */
export function setAssetTier(s: S, assetId: string, tier: AssetTier | null): S {
  const a = mustFind(s.assets, assetId, 'Asset');
  if (a.kind !== 'IMAGE') throw new StudioError('INVALID', 'Only pictures have a tier.', { assetId });
  if (tier !== null && tier !== 'CANONICAL' && tier !== 'SECONDARY' && tier !== 'RAW') throw new StudioError('INVALID', `Unknown tier ${String(tier)}.`, { assetId, tier });
  const owner = canonicalImageOwner(s, assetId);
  if (owner && tier !== 'CANONICAL') {
    const lock = appearanceLock(owner);
    if (lock.locked) throw new StudioError('APPEARANCE_LOCKED', `${owner.name} has been used in a video; this picture is the preserved canonical image.`, { assetId, characterId: owner.id, reason: lock.reason });
    throw new StudioError('INVALID', `This picture is ${owner.name}’s canonical image; redraw it to replace it.`, { assetId, characterId: owner.id });
  }
  if (!owner && tier === 'CANONICAL') throw new StudioError('INVALID', 'Only a character’s canonical image is canonical; it becomes one when it is set with setCanonicalImage.', { assetId });
  if ((a.tier ?? null) === tier) return s;
  return { ...s, assets: s.assets.map((x) => (x.id === assetId ? { ...x, tier: tier ?? undefined } : x)) };
}

/** Nothing but your settings: the studio as it would be on day one. */
export function emptyStudio(settings: Settings): S {
  return { version: STATE_VERSION, shows: [], seasons: [], productions: [], characters: [], locations: [], assets: [], settings };
}

/** Removing a file removes every use of it too: a reference view, a portrait, a frame, a take, a song's track. A
 *  picture a used character's appearance rests on is not removed at all (see rules.ts), and neither is any
 *  character's current canonical image: redraw it first (the previous one becomes RAW and can then go). */
export function deleteAsset(s: S, id: string): S {
  const owner = protectedAssetOwner(s, id);
  if (owner) throw new StudioError('ASSET_PROTECTED', `${owner.name} has been used in a video; this picture is part of the preserved appearance.`, { assetId: id, characterId: owner.id, characterName: owner.name });
  const canonicalOwner = canonicalImageOwner(s, id);
  if (canonicalOwner) throw new StudioError('ASSET_PROTECTED', `This picture is ${canonicalOwner.name}’s canonical image; redraw it first, then the previous image can be removed.`, { assetId: id, characterId: canonicalOwner.id, characterName: canonicalOwner.name, reason: 'CANONICAL' });
  const voiceOwner = protectedVoiceAssetOwner(s, id);
  if (voiceOwner) throw new StudioError('ASSET_PROTECTED', `${voiceOwner.name} has spoken in a video; this recording is part of the preserved voice.`, { assetId: id, characterId: voiceOwner.id, characterName: voiceOwner.name, reason: 'VOICE' });
  const not = (x: string | undefined) => (x === id ? undefined : x);
  // an identity whose reference recording goes away cannot be rebuilt from it: it is stale until a new build; one
  // whose proof line goes away keeps speaking but is no longer proven
  const voiceWithout = (c: Character): Character['voice'] => {
    const samples = c.voice.samples.filter((v) => v.assetId !== id).map((v) => (v.provenance?.trimmedAssetId === id ? { ...v, provenance: { ...v.provenance, trimmedAssetId: undefined, window: undefined } } : v));
    const selectedSampleId = c.voice.samples.find((v) => v.id === c.voice.selectedSampleId)?.assetId === id ? undefined : c.voice.selectedSampleId;
    let identity = c.voice.identity;
    if (identity && (identity.referenceAssetId === id || identity.referenceWindow?.assetId === id)) identity = { ...identity, status: 'STALE', referenceAssetId: not(identity.referenceAssetId), referenceWindow: identity.referenceWindow?.assetId === id ? undefined : identity.referenceWindow };
    if (identity?.proof?.assetId === id && identity.status === 'ACTIVE') identity = { ...identity, status: 'REVIEW' };
    return { ...c.voice, samples, selectedSampleId, identity };
  };
  return {
    ...s,
    assets: s.assets.filter((a) => a.id !== id),
    characters: s.characters.map((c) => ({ ...c, refs: c.refs.filter((r) => r.assetId !== id), portraitAssetId: not(c.portraitAssetId), pendingReference: c.pendingReference?.assetId === id ? undefined : c.pendingReference, voice: voiceWithout(c) })),
    locations: s.locations.map((l) => ({ ...l, refs: l.refs.filter((r) => r.assetId !== id), masterAssetId: not(l.masterAssetId) })),
    shows: s.shows.map((sh) => ({ ...sh, coverAssetId: not(sh.coverAssetId), posterAssetId: not(sh.posterAssetId) })),
    productions: s.productions.map((p) => ({
      ...p, coverAssetId: not(p.coverAssetId), posterAssetId: not(p.posterAssetId), framePosterAssetId: not(p.framePosterAssetId), cutAssetId: not(p.cutAssetId), cutStale: p.cutAssetId === id ? undefined : p.cutStale, exports: p.exports?.filter((e) => e.assetId !== id), song: p.song ? { ...p.song, assetId: not(p.song.assetId) } : undefined,
      shots: p.shots.map((sh) => { const takes = sh.takes.filter((t) => t.assetId !== id); return { ...sh, openingFrameAssetId: not(sh.openingFrameAssetId), endingFrameAssetId: not(sh.endingFrameAssetId), takes, selectedTakeId: takes.some((t) => t.id === sh.selectedTakeId) ? sh.selectedTakeId : undefined, dialogue: sh.dialogue.map((d) => (d.audioAssetId === id ? { ...d, audioAssetId: undefined, durationSeconds: undefined } : d)) }; }),
    })),
  };
}

// ------------------------------------------------------------------------------------------------- Auto Idea

/** A name as a key for "is this the same character or place": Unicode-compatibility folded, case and diacritics
 *  dropped (Latin accents; Arabic harakat, hamza and madda marks), tatweel removed, Arabic alef forms, alef maqsura and
 *  taa marbuta unified, apostrophes dropped (Elias's = Elias’s = Eliass), other punctuation and runs of whitespace one
 *  space. Pure. */
export function nameKey(name: string): string {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').replace(/ـ/g, '').replace(/[ٱأإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .toLowerCase().replace(/['‘’ʼ`´]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** The record whose name (or Arabic name) has the same `nameKey`, if any. */
export function findByName<T extends { name: string; nameAr?: string }>(xs: T[], name: string): T | undefined {
  const k = nameKey(name);
  if (!k) return undefined;
  return xs.find((x) => nameKey(x.name) === k || (x.nameAr !== undefined && nameKey(x.nameAr) === k));
}

/** Accept a reviewed proposal: create the new characters and places the producer kept (with no appearance yet),
 *  then the production — or, for a show, the show with its first season and first episode — with the structure as
 *  scenes. Nothing else is invented: kept existing characters and places are linked, not copied. */
export function acceptProposal(s: S, input: { kind: 'SHOW' | 'SEASON' | 'EPISODE' | 'SHORT' | 'MUSIC_VIDEO'; showId?: string; seasonId?: string; aspect: Aspect; proposal: IdeaProposal; keepCast: string[]; keepLocations: string[]; preferences: IdeaPreferences; proposalJobId?: string }): { state: S; production: Production } {
  const { proposal: pr } = input;
  let st = s;
  let castIds: string[] = []; let locationIds: string[] = [];
  for (const c of pr.cast.filter((x) => input.keepCast.includes(x.key))) {
    if (c.characterId) { castIds.push(c.characterId); continue; }
    // a proposal may name someone the studio already has without their id: the existing character is linked, never
    // copied (case-, spacing-, apostrophe- and Arabic-spelling-insensitive, on the name and the Arabic name)
    const known = findByName(st.characters, c.name);
    if (known) { castIds.push(known.id); continue; }
    const r = addCharacter(st, { name: c.name, role: c.role, style: pr.style, sex: c.sex ?? 'FEMALE', ageYears: c.ageYears ?? 30, build: '', face: c.appearance ?? '', hair: '', skin: '', eyes: '', distinguishing: [], wardrobe: '', personality: c.personality ?? c.reason, language: pr.language, dialect: pr.dialect, notes: pr.sample ? 'Proposed by Auto Idea (sample proposal).' : `Proposed by Auto Idea for “${pr.title}”: ${c.reason}` });
    st = r.state; castIds.push(r.character.id);
  }
  for (const l of pr.locations.filter((x) => input.keepLocations.includes(x.key))) {
    if (l.locationId) { locationIds.push(l.locationId); continue; }
    const known = findByName(st.locations, l.name);
    if (known) { locationIds.push(known.id); continue; }
    const r = addLocation(st, { name: l.name, kind: l.kind ?? 'EXTERIOR', description: l.description, style: pr.style, lighting: [], landmarks: [], props: [] });
    st = r.state; locationIds.push(r.location.id);
  }
  // the same library member can be offered twice by a proposal (two reasons, one person): one seat each
  castIds = Array.from(new Set(castIds)); locationIds = Array.from(new Set(locationIds));
  // the accepted idea's development intent travels with the brief: later story calls build within it (Auto Idea §4)
  const development = developmentIntentOf(pr);
  const brief = { mode: 'AUTO_IDEA' as const, text: pr.premise, ideaTitle: pr.title, preferences: input.preferences, fromSampleProposal: pr.sample || undefined, proposalJobId: input.proposalJobId, ...(development ? { development } : {}) };
  const common = { style: pr.style, language: pr.language, dialect: pr.dialect, aspect: input.aspect, targetSeconds: pr.durationSeconds, brief };
  // D22: each scene gets what its words state — the place (the only one, or the one it names), who it names, and the
  // time of day a word says (the premise's otherwise)
  const withStructure = (state: S, productionId: string, items: IdeaProposal['structure']) => items.reduce((acc, it) => {
    const setup = sceneSetupFrom(`${it.title}. ${it.summary}`, { premise: pr.premise, locations: acc.locations.filter((l) => locationIds.includes(l.id)), cast: acc.characters.filter((c) => castIds.includes(c.id)) });
    const r = addScene(acc, productionId, { title: it.title, timeOfDay: setup.timeOfDay, locationId: setup.locationId, characterIds: setup.characterIds, purpose: it.summary });
    return updateScene(r.state, productionId, r.scene.id, { beats: [{ id: nid('beat'), action: it.summary, lines: [] }] });
  }, state);
  if (input.kind === 'SHOW') {
    const r = addShow(st, { title: pr.title, titleAr: pr.titleAr, logline: pr.logline, genre: pr.genre, style: pr.style, language: pr.language, dialect: pr.dialect, aspect: input.aspect, castIds, locationIds, synopsis: pr.premise });
    const first = pr.structure[0];
    const ep = addProduction(r.state, { ...common, kind: 'EPISODE', title: first?.title ?? 'Episode 1', logline: first?.summary ?? '', synopsis: first?.summary ?? '', showId: r.show.id, seasonId: r.season.id, castIds: [], locationIds: [] });
    const next = updateSeason(ep.state, r.season.id, { arc: pr.structure.map((x) => x.title).join(' · ') });
    return { state: next, production: ep.production };
  }
  if (input.kind === 'SEASON') {
    // a new season of an existing show: the season carries the proposal as its arc, its first episode is the first
    // item of the structure, and the show's cast and world grow by whatever the season introduces
    if (!input.showId) throw new StudioError('INVALID', 'A season needs a show.');
    const show = mustFind(st.shows, input.showId, 'Show');
    const r = addSeason(st, show.id, pr.title, pr.premise);
    const first = pr.structure[0];
    const ep = addProduction(r.state, { ...common, kind: 'EPISODE', title: first?.title ?? 'Episode 1', logline: first?.summary ?? '', synopsis: first?.summary ?? '', showId: show.id, seasonId: r.season.id, castIds: [], locationIds: [] });
    const grown = updateShow(ep.state, show.id, { castIds: Array.from(new Set([...show.castIds, ...castIds])), locationIds: Array.from(new Set([...show.locationIds, ...locationIds])) });
    return { state: grown, production: ep.production };
  }
  const kind: Kind = input.kind === 'MUSIC_VIDEO' ? 'MUSIC_VIDEO' : input.kind === 'SHORT' ? 'SHORT' : 'EPISODE';
  const song: Song | undefined = input.kind === 'MUSIC_VIDEO' && pr.song ? { id: nid('song'), title: pr.song.title, source: 'GENERATED_EXAMPLE', durationSeconds: pr.durationSeconds, caption: pr.song.caption, lyrics: pr.song.lyrics, sections: splitLyrics(pr.song.lyrics, pr.durationSeconds).map((x) => ({ ...x, singerIds: castIds })), singerIds: castIds } : undefined;
  const r = addProduction(st, { ...common, kind, title: pr.title, titleAr: pr.titleAr, logline: pr.logline, synopsis: pr.premise, showId: input.showId, seasonId: input.seasonId, castIds, locationIds, song });
  let next = updateProduction(r.state, r.production.id, { genre: pr.genre, mood: pr.mood, ...(kind === 'MUSIC_VIDEO' ? { concept: pr.concept, artist: st.characters.filter((c) => castIds.includes(c.id)).map((c) => c.name).join(' & ') || undefined } : {}) });
  if (kind !== 'MUSIC_VIDEO') next = withStructure(next, r.production.id, pr.structure);
  return { state: next, production: next.productions.find((x) => x.id === r.production.id)! };
}

// ---------------------------------------------------------------------------------------------------- settings

export function updateSettings(s: S, patch: Partial<Settings>): S {
  const voice = patch.voice || s.settings.voice ? { voice: { ...(s.settings.voice ?? {}), ...(patch.voice ?? {}) } } : {};
  return { ...s, settings: { ...s.settings, ...patch, defaults: { ...s.settings.defaults, ...(patch.defaults ?? {}) }, generation: { ...(s.settings.generation ?? {}), ...(patch.generation ?? {}) }, ...voice } };
}
