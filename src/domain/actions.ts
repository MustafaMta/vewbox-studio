import type { Asset, Character, CharacterProfileInput, CharacterRef, ContinuityState, ExportRecord, IdeaPreferences, IdeaProposal, Location, LocationRef, PendingReference, Production, QaReport, Scene, Season, Settings, Shot, Show, Song, StudioState, Take, TakeReference, Voice, VoiceIdentity, VoiceProfileInput, VoiceSample } from './types';
import type { Aspect, Dialect, Kind, Language, Stage, Style } from './vocabulary';
import { STATE_VERSION } from './version';
import { nid, now } from './ids';
import { StudioError } from './errors';
import { VOICE_INTERNAL_KEYS, canChangeAppearance, guardCharacterPatch, guardVoiceBuild, guardVoiceChange, isCloneSource, markTakeRemoved, protectedAssetOwner, protectedVoiceAssetOwner, recordTakeUsage } from './rules';
import { splitLyrics } from './lyrics';

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
  const copy: Production = structuredClone({ ...src, id: nid('copy'), title: `${src.title} (copy)`, titleAr: undefined, stage: 'STORY', createdAt: t, updatedAt: t, cutAssetId: undefined, exports: [] });
  copy.scenes = copy.scenes.map((sc) => ({ ...sc }));
  copy.shots = copy.shots.map((sh) => ({ ...sh, id: nid('shot'), takes: [], selectedTakeId: undefined, continuity: undefined }));
  if (copy.kind === 'EPISODE' && copy.seasonId) copy.episodeNumber = s.productions.filter((p) => p.seasonId === copy.seasonId).length + 1;
  return { state: { ...s, productions: [...s.productions, copy] }, production: copy };
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

export function setCut(s: S, id: string, cutAssetId: string | undefined): S { return updateProduction(s, id, { cutAssetId }); }

// ------------------------------------------------------------------------------------------------------ scenes

function withProduction(s: S, id: string, fn: (p: Production) => Production): S {
  const p = mustFind(s.productions, id, 'Production');
  const next = fn(p);
  if (next === p) return s; // nothing changed: same state, so callers and effects can tell
  return { ...s, productions: s.productions.map((x) => (x.id === id ? touchProduction(next) : x)) };
}

export function addScene(s: S, productionId: string, input: Pick<Scene, 'title' | 'timeOfDay'> & { locationId?: string; characterIds?: string[]; purpose?: string; emotionalObjective?: string; entryState?: string; exitState?: string; beats?: Scene['beats'] }): { state: S; scene: Scene } {
  const p = mustFind(s.productions, productionId, 'Production');
  const scene: Scene = { id: nid('scene'), number: p.scenes.length + 1, title: input.title.trim(), locationId: input.locationId || undefined, timeOfDay: input.timeOfDay, characterIds: input.characterIds ?? [], beats: input.beats ?? [], purpose: input.purpose, emotionalObjective: input.emotionalObjective, entryState: input.entryState, exitState: input.exitState };
  return { state: withProduction(s, productionId, (x) => ({ ...x, scenes: [...x.scenes, scene] })), scene };
}

export function updateScene(s: S, productionId: string, sceneId: string, patch: Partial<Omit<Scene, 'id' | 'number'>>): S {
  return withProduction(s, productionId, (p) => ({ ...p, scenes: p.scenes.map((sc) => (sc.id === sceneId ? { ...sc, ...patch } : sc)) }));
}

export function deleteScene(s: S, productionId: string, sceneId: string): S {
  return withProduction(s, productionId, (p) => ({ ...p, scenes: renumberScenes(p.scenes.filter((sc) => sc.id !== sceneId)), shots: renumberShots(p.shots.filter((sh) => sh.sceneId !== sceneId)) }));
}

/** Replace the script wholesale (the story engine wrote it): scenes with beats and lines. Shots of scenes that no
 *  longer exist are dropped; shots of scenes that stay keep their id. Scenes are matched by id when given. */
export function replaceScript(s: S, productionId: string, scenes: Array<Omit<Scene, 'number'> & { id?: string }>): S {
  return withProduction(s, productionId, (p) => {
    const next: Scene[] = scenes.map((sc, i) => ({ ...sc, id: sc.id ?? nid('scene'), number: i + 1 }));
    const keep = new Set(next.map((x) => x.id));
    return { ...p, scenes: next, shots: renumberShots(p.shots.filter((sh) => keep.has(sh.sceneId))) };
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

export function updateShot(s: S, productionId: string, shotId: string, patch: Partial<Omit<Shot, 'id' | 'number'>>): S {
  return withProduction(s, productionId, (p) => { mustFind(p.shots, shotId, 'Shot'); return { ...p, shots: renumberShots(p.shots.map((sh) => (sh.id === shotId ? { ...sh, ...patch } : sh))) }; });
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
    if (takeId) { const t = mustFind(sh.takes, takeId, 'Take'); if (t.status === 'REJECTED') throw new StudioError('INVALID', 'A rejected take cannot be chosen for the cut.'); }
    return { ...p, shots: p.shots.map((x) => (x.id === shotId ? { ...x, selectedTakeId: takeId } : x)) };
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
  const next = withProduction(s, productionId, (p) => ({ ...p, shots: p.shots.map((sh) => (sh.id === shotId ? { ...sh, takes: sh.takes.filter((t) => t.id !== takeId), selectedTakeId: sh.selectedTakeId === takeId ? undefined : sh.selectedTakeId } : sh)) }));
  return next === s ? s : { ...next, characters: markTakeRemoved(next.characters, shotId, takeId) };
}

export interface NewTakeInput {
  assetId: string; label?: string; note?: string; status?: Take['status'];
  provider?: Take['provider']; model?: string; requestId?: string; prompt?: string; params?: Record<string, unknown>; seed?: number; references?: TakeReference[];
  width?: number; height?: number; durationSeconds?: number; fps?: number; generationMs?: number; costUsd?: number; qa?: QaReport; rejectionReason?: string; jobId?: string; codeVersion?: string; workflowVersion?: string; thumbnailAssetId?: string;
  trimStartFrames?: number; soundtrack?: Take['soundtrack'];
}

/** A take arrives for a shot (from a generation, or an upload): every character in the shot is recorded as having
 *  been in a video, and from then on their appearance is preserved. A new take never replaces an existing one. */
export function addTake(s: S, productionId: string, shotId: string, input: NewTakeInput): { state: S; take: Take } {
  const p = mustFind(s.productions, productionId, 'Production');
  const sh = mustFind(p.shots, shotId, 'Shot');
  mustFind(s.assets, input.assetId, 'Asset');
  const take: Take = { ...input, id: nid('take'), label: input.label ?? `Take ${sh.takes.length + 1}`, assetId: input.assetId, createdAt: now(), status: input.status ?? 'READY' };
  const next = withProduction(s, productionId, (x) => ({ ...x, shots: x.shots.map((y) => (y.id === shotId ? { ...y, takes: [...y.takes, take] } : y)) }));
  const updated = next.productions.find((x) => x.id === productionId)!;
  return { state: { ...next, characters: recordTakeUsage(next.characters, updated, shotId, take.id, take.createdAt) }, take };
}

/** The studio drew (or redrew) a shot's frames. */
export function setShotFrames(s: S, productionId: string, shotId: string, frames: { openingFrameAssetId?: string; endingFrameAssetId?: string }): S {
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

/** The studio drew the character: a new portrait and, optionally, a fresh set of reference views. Refused when
 *  locked. The pending reference is consumed. */
export function setCharacterAppearance(s: S, id: string, input: { portraitAssetId: string; refs?: CharacterRef[]; keepExistingRefs?: boolean }): S {
  const c = mustFind(s.characters, id, 'Character');
  if (!canChangeAppearance(c)) throw new StudioError('APPEARANCE_LOCKED', `${c.name} has been used in a video; the appearance is preserved for continuity.`, { characterId: id });
  const refs = input.keepExistingRefs ? [...c.refs, ...(input.refs ?? [])] : (input.refs ?? c.refs.filter((r) => r.assetId !== c.portraitAssetId));
  return writeCharacter(s, id, { portraitAssetId: input.portraitAssetId, refs, pendingReference: undefined });
}

/** Add reference views the studio drew for a character (front, side, …). Refused when locked. */
export function addCharacterRefs(s: S, id: string, refs: CharacterRef[]): S {
  const c = mustFind(s.characters, id, 'Character');
  if (!canChangeAppearance(c)) throw new StudioError('APPEARANCE_LOCKED', `${c.name} has been used in a video; the appearance is preserved for continuity.`, { characterId: id });
  const roles = new Set(refs.map((r) => r.role));
  return writeCharacter(s, id, { refs: [...c.refs.filter((r) => !roles.has(r.role)), ...refs], portraitAssetId: c.portraitAssetId ?? refs[0]?.assetId });
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
  const v: VoiceSample = { ...sample, id: sample.id ?? nid('voice') };
  return { state: writeCharacter(s, id, { voice: { ...c.voice, samples: [...c.voice.samples, v], selectedSampleId: select ? v.id : c.voice.selectedSampleId } }), sample: v };
}

/** The producer uploaded a recording: it must exist in the library as real audio (never a bundled sample). */
export function addVoiceRecording(s: S, id: string, assetId: string, label: string, extra: Partial<Pick<VoiceSample, 'text' | 'language' | 'dialect' | 'durationSeconds' | 'provenance'>> = {}): S {
  const a = mustFind(s.assets, assetId, 'Asset');
  if (a.kind !== 'AUDIO' || a.sample) throw new StudioError('INVALID', 'A voice recording must be an uploaded audio file.', { assetId });
  return addVoiceSample(s, id, { label, assetId, source: 'UPLOADED', ...extra }).state;
}

/** Correct what a sample says or how it is labelled (the transcript stored once, a producer's label). */
export function updateVoiceSample(s: S, id: string, sampleId: string, patch: Partial<Pick<VoiceSample, 'label' | 'text' | 'language' | 'dialect' | 'durationSeconds' | 'provenance'>>): S {
  const c = mustFind(s.characters, id, 'Character');
  mustFind(c.voice.samples, sampleId, 'Voice sample');
  return writeCharacter(s, id, { voice: { ...c.voice, samples: c.voice.samples.map((x) => (x.id === sampleId ? { ...x, ...patch } : x)) } });
}

export function removeVoiceSample(s: S, id: string, sampleId: string): S {
  const c = mustFind(s.characters, id, 'Character');
  if (c.voice.selectedSampleId === sampleId || c.voice.identity?.referenceSampleId === sampleId) guardVoiceChange(c, 'chosen recording');
  const identity = c.voice.identity?.referenceSampleId === sampleId ? { ...c.voice.identity, status: 'STALE' as const } : c.voice.identity;
  return writeCharacter(s, id, { voice: { ...c.voice, identity, samples: c.voice.samples.filter((x) => x.id !== sampleId), selectedSampleId: c.voice.selectedSampleId === sampleId ? undefined : c.voice.selectedSampleId } });
}

export type VoiceIdentityInput = Omit<VoiceIdentity, 'revision' | 'createdAt' | 'status'> & { status?: VoiceIdentity['status'] };

/** The character's one voice identity: set when the voice is built (after the proof line exists, in the same
 *  batch), bumped when rebuilt, refused for a voice-locked character. The only writer of `voice.identity`. */
export function setVoiceIdentity(s: S, id: string, identity: VoiceIdentityInput): S {
  const c = mustFind(s.characters, id, 'Character');
  // a locked voice keeps its identity; a voice locked by its chosen recording alone may only be pinned to that one
  guardVoiceBuild(c, identity.referenceSampleId, 'voice identity');
  if (!identity.proof?.sampleId || !identity.proof.assetId) throw new StudioError('INVALID', 'A voice identity needs its proof: the line that was spoken with it and heard back.', { characterId: id });
  const proof = c.voice.samples.find((x) => x.id === identity.proof!.sampleId);
  if (!proof || proof.assetId !== identity.proof.assetId || proof.source !== 'GENERATED') throw new StudioError('INVALID', 'The proof line must be a generated sample of this character, stored before the identity is pinned.', { characterId: id, sampleId: identity.proof.sampleId });
  if (identity.referenceSampleId) {
    const ref = c.voice.samples.find((x) => x.id === identity.referenceSampleId);
    if (!ref || !isCloneSource(ref)) throw new StudioError('INVALID', 'The reference of a voice identity must be an uploaded recording, never a generated line or a bundled sample.', { characterId: id, sampleId: identity.referenceSampleId });
    if (identity.referenceAssetId && identity.referenceAssetId !== ref.assetId) throw new StudioError('INVALID', 'The reference asset does not belong to the reference sample.', { characterId: id });
  }
  if (identity.referenceAssetId) {
    const a = mustFind(s.assets, identity.referenceAssetId, 'Asset');
    if (a.kind !== 'AUDIO' || a.sample || a.origin === 'GENERATED') throw new StudioError('INVALID', 'The reference of a voice identity must be an uploaded recording.', { assetId: identity.referenceAssetId });
  }
  if (identity.mode === 'MANUAL' && !identity.providerVoiceId) throw new StudioError('INVALID', 'A catalogue voice needs the provider’s voice id.');
  const next: VoiceIdentity = { ...identity, status: identity.status ?? 'ACTIVE', revision: (c.voice.identity?.revision ?? 0) + 1, createdAt: now() };
  // the proof line is listened to, never spoken from: it is not the chosen recording
  const selectedSampleId = c.voice.selectedSampleId === next.proof!.sampleId ? undefined : c.voice.selectedSampleId;
  return writeCharacter(s, id, { voice: { ...c.voice, identity: next, selectedSampleId } });
}

export function deleteCharacter(s: S, id: string): S {
  const drop = (ids: string[]) => ids.filter((x) => x !== id);
  return {
    ...s,
    characters: s.characters.filter((c) => c.id !== id),
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

// --------------------------------------------------------------------------------------------------- locations

export type LocationInput = Omit<Location, 'id' | 'createdAt' | 'updatedAt' | 'refs'> & { refs?: LocationRef[] };

export function addLocation(s: S, input: LocationInput): { state: S; location: Location } {
  const t = now();
  if (!input.name?.trim()) throw new StudioError('INVALID', 'A location needs a name.');
  const location: Location = { ...input, name: input.name.trim(), id: nid('loc'), refs: input.refs ?? [], createdAt: t, updatedAt: t };
  return { state: { ...s, locations: [...s.locations, location] }, location };
}

export function updateLocation(s: S, id: string, patch: Partial<Omit<Location, 'id' | 'createdAt'>>): S {
  mustFind(s.locations, id, 'Location');
  return { ...s, locations: s.locations.map((l) => (l.id === id ? { ...l, ...patch, updatedAt: now() } : l)) };
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

export function updateAsset(s: S, id: string, patch: Partial<Pick<Asset, 'label' | 'tags' | 'poster' | 'width' | 'height' | 'durationSeconds' | 'fps' | 'provenance' | 'unavailable'>>): S {
  mustFind(s.assets, id, 'Asset');
  return { ...s, assets: s.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) };
}

/** Nothing but your settings: the studio as it would be on day one. */
export function emptyStudio(settings: Settings): S {
  return { version: STATE_VERSION, shows: [], seasons: [], productions: [], characters: [], locations: [], assets: [], settings };
}

/** Removing a file removes every use of it too: a reference view, a portrait, a frame, a take, a song's track. A
 *  picture a used character's appearance rests on is not removed at all (see rules.ts). */
export function deleteAsset(s: S, id: string): S {
  const owner = protectedAssetOwner(s, id);
  if (owner) throw new StudioError('ASSET_PROTECTED', `${owner.name} has been used in a video; this picture is part of the preserved appearance.`, { assetId: id, characterId: owner.id, characterName: owner.name });
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
      ...p, coverAssetId: not(p.coverAssetId), posterAssetId: not(p.posterAssetId), cutAssetId: not(p.cutAssetId), exports: p.exports?.filter((e) => e.assetId !== id), song: p.song ? { ...p.song, assetId: not(p.song.assetId) } : undefined,
      shots: p.shots.map((sh) => { const takes = sh.takes.filter((t) => t.assetId !== id); return { ...sh, openingFrameAssetId: not(sh.openingFrameAssetId), endingFrameAssetId: not(sh.endingFrameAssetId), takes, selectedTakeId: takes.some((t) => t.id === sh.selectedTakeId) ? sh.selectedTakeId : undefined, dialogue: sh.dialogue.map((d) => (d.audioAssetId === id ? { ...d, audioAssetId: undefined, durationSeconds: undefined } : d)) }; }),
    })),
  };
}

// ------------------------------------------------------------------------------------------------- Auto Idea

/** Accept a reviewed proposal: create the new characters and places the producer kept (with no appearance yet),
 *  then the production — or, for a show, the show with its first season and first episode — with the structure as
 *  scenes. Nothing else is invented: kept existing characters and places are linked, not copied. */
export function acceptProposal(s: S, input: { kind: 'SHOW' | 'SEASON' | 'EPISODE' | 'SHORT' | 'MUSIC_VIDEO'; showId?: string; seasonId?: string; aspect: Aspect; proposal: IdeaProposal; keepCast: string[]; keepLocations: string[]; preferences: IdeaPreferences; proposalJobId?: string }): { state: S; production: Production } {
  const { proposal: pr } = input;
  let st = s;
  let castIds: string[] = []; let locationIds: string[] = [];
  for (const c of pr.cast.filter((x) => input.keepCast.includes(x.key))) {
    if (c.characterId) { castIds.push(c.characterId); continue; }
    const r = addCharacter(st, { name: c.name, role: c.role, style: pr.style, sex: c.sex ?? 'FEMALE', ageYears: c.ageYears ?? 30, build: '', face: c.appearance ?? '', hair: '', skin: '', eyes: '', distinguishing: [], wardrobe: '', personality: c.personality ?? c.reason, language: pr.language, dialect: pr.dialect, notes: pr.sample ? 'Proposed by Auto Idea (sample proposal).' : `Proposed by Auto Idea for “${pr.title}”: ${c.reason}` });
    st = r.state; castIds.push(r.character.id);
  }
  for (const l of pr.locations.filter((x) => input.keepLocations.includes(x.key))) {
    if (l.locationId) { locationIds.push(l.locationId); continue; }
    const r = addLocation(st, { name: l.name, kind: l.kind ?? 'EXTERIOR', description: l.description, style: pr.style, lighting: [], landmarks: [], props: [] });
    st = r.state; locationIds.push(r.location.id);
  }
  // the same library member can be offered twice by a proposal (two reasons, one person): one seat each
  castIds = Array.from(new Set(castIds)); locationIds = Array.from(new Set(locationIds));
  const brief = { mode: 'AUTO_IDEA' as const, text: pr.premise, ideaTitle: pr.title, preferences: input.preferences, fromSampleProposal: pr.sample || undefined, proposalJobId: input.proposalJobId };
  const common = { style: pr.style, language: pr.language, dialect: pr.dialect, aspect: input.aspect, targetSeconds: pr.durationSeconds, brief };
  const withStructure = (state: S, productionId: string, items: IdeaProposal['structure']) => items.reduce((acc, it) => {
    const r = addScene(acc, productionId, { title: it.title, timeOfDay: 'MORNING', characterIds: [], purpose: it.summary });
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
  return { ...s, settings: { ...s.settings, ...patch, defaults: { ...s.settings.defaults, ...(patch.defaults ?? {}) }, generation: { ...(s.settings.generation ?? {}), ...(patch.generation ?? {}) } } };
}
