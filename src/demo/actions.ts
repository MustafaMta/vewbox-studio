import type { Asset, Character, IdeaPreferences, IdeaProposal, Location, Production, Scene, Season, Settings, Shot, Show, Song, StudioState, Take } from '@/domain/types';
import type { Aspect, Dialect, Kind, Language, Stage, Style } from '@/domain/vocabulary';
import { STATE_VERSION } from './fixtures';
import { canChangeAppearance, guardCharacterPatch, markTakeRemoved, protectedAssetOwner, recordTakeUsage } from './rules';

/** WHAT THE INTERFACE CAN DO — every change to the studio is one of these pure functions: state in, new state out.
 *  Pages call them through the store's `update`; the unit tests call them directly. Nothing here talks to a server;
 *  there is none. */

export const nid = (prefix: string) => `${prefix}-${(globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).slice(0, 8)}`;
const now = () => new Date().toISOString();

type S = StudioState;
const touchProduction = (p: Production): Production => ({ ...p, updatedAt: now() });

// ------------------------------------------------------------------------------------------------------- shows

export interface NewShowInput { title: string; titleAr?: string; logline: string; genre: string; style: Style; language: Language; dialect?: Dialect; aspect: Aspect; castIds?: string[]; locationIds?: string[] }

export function addShow(s: S, input: NewShowInput): { state: S; show: Show; season: Season } {
  const t = now();
  const show: Show = { id: nid('show'), title: input.title.trim(), titleAr: input.titleAr?.trim() || undefined, logline: input.logline.trim(), genre: input.genre.trim(), style: input.style, language: input.language, dialect: input.language === 'AR' ? input.dialect : undefined, aspect: input.aspect, castIds: input.castIds ?? [], locationIds: input.locationIds ?? [], createdAt: t, updatedAt: t };
  const season: Season = { id: nid('season'), showId: show.id, number: 1, title: 'Season 1', arc: '', createdAt: t };
  return { state: { ...s, shows: [...s.shows, show], seasons: [...s.seasons, season] }, show, season };
}

export function updateShow(s: S, id: string, patch: Partial<Omit<Show, 'id' | 'createdAt'>>): S {
  return { ...s, shows: s.shows.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: now() } : x)) };
}

export function deleteShow(s: S, id: string): S {
  const seasonIds = new Set(s.seasons.filter((x) => x.showId === id).map((x) => x.id));
  return { ...s, shows: s.shows.filter((x) => x.id !== id), seasons: s.seasons.filter((x) => x.showId !== id), productions: s.productions.filter((p) => p.showId !== id && !(p.seasonId && seasonIds.has(p.seasonId))) };
}

export function addSeason(s: S, showId: string, title?: string, arc = ''): { state: S; season: Season } {
  const number = s.seasons.filter((x) => x.showId === showId).length + 1;
  const season: Season = { id: nid('season'), showId, number, title: title?.trim() || `Season ${number}`, arc, createdAt: now() };
  return { state: { ...updateShow(s, showId, {}), seasons: [...s.seasons, season] }, season };
}

export function updateSeason(s: S, id: string, patch: Partial<Pick<Season, 'title' | 'arc'>>): S {
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
  return { ...s, productions: s.productions.map((p) => (p.id === id ? touchProduction({ ...p, ...patch }) : p)) };
}

export function deleteProduction(s: S, id: string): S {
  return { ...s, productions: s.productions.filter((p) => p.id !== id) };
}

export function duplicateProduction(s: S, id: string): { state: S; production: Production | null } {
  const src = s.productions.find((p) => p.id === id);
  if (!src) return { state: s, production: null };
  const t = now();
  const copy: Production = structuredClone({ ...src, id: nid('copy'), title: `${src.title} (copy)`, titleAr: undefined, stage: 'STORY', createdAt: t, updatedAt: t, cutAssetId: undefined });
  copy.shots = copy.shots.map((sh) => ({ ...sh, id: nid('shot'), takes: [], selectedTakeId: undefined }));
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

// ------------------------------------------------------------------------------------------------------ scenes

function withProduction(s: S, id: string, fn: (p: Production) => Production): S {
  const p = s.productions.find((x) => x.id === id);
  if (!p) return s;
  const next = fn(p);
  if (next === p) return s; // nothing changed: same state, so callers and effects can tell
  return { ...s, productions: s.productions.map((x) => (x.id === id ? touchProduction(next) : x)) };
}

export function addScene(s: S, productionId: string, input: Pick<Scene, 'title' | 'timeOfDay'> & { locationId?: string; characterIds?: string[] }): { state: S; scene: Scene } {
  const p = s.productions.find((x) => x.id === productionId);
  const scene: Scene = { id: nid('scene'), number: (p?.scenes.length ?? 0) + 1, title: input.title.trim(), locationId: input.locationId || undefined, timeOfDay: input.timeOfDay, characterIds: input.characterIds ?? [], beats: [] };
  return { state: withProduction(s, productionId, (x) => ({ ...x, scenes: [...x.scenes, scene] })), scene };
}

export function updateScene(s: S, productionId: string, sceneId: string, patch: Partial<Omit<Scene, 'id' | 'number'>>): S {
  return withProduction(s, productionId, (p) => ({ ...p, scenes: p.scenes.map((sc) => (sc.id === sceneId ? { ...sc, ...patch } : sc)) }));
}

export function deleteScene(s: S, productionId: string, sceneId: string): S {
  return withProduction(s, productionId, (p) => ({ ...p, scenes: renumberScenes(p.scenes.filter((sc) => sc.id !== sceneId)), shots: renumberShots(p.shots.filter((sh) => sh.sceneId !== sceneId)) }));
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
  const shot: Shot = { ...input, id: nid('shot'), number: 0, takes: [] };
  const state = withProduction(s, productionId, (p) => {
    // insert after the last shot of the same scene so the storyboard reads in scene order
    const idx = p.shots.map((x) => x.sceneId).lastIndexOf(input.sceneId);
    const shots = [...p.shots]; shots.splice(idx === -1 ? shots.length : idx + 1, 0, shot);
    return { ...p, shots: renumberShots(shots) };
  });
  // the numbered copy, as it now sits in the storyboard
  return { state, shot: state.productions.find((p) => p.id === productionId)?.shots.find((x) => x.id === shot.id) ?? shot };
}

export function updateShot(s: S, productionId: string, shotId: string, patch: Partial<Omit<Shot, 'id' | 'number'>>): S {
  return withProduction(s, productionId, (p) => ({ ...p, shots: renumberShots(p.shots.map((sh) => (sh.id === shotId ? { ...sh, ...patch } : sh))) }));
}

export function deleteShot(s: S, productionId: string, shotId: string): S {
  return withProduction(s, productionId, (p) => ({ ...p, shots: renumberShots(p.shots.filter((sh) => sh.id !== shotId)) }));
}

export function duplicateShot(s: S, productionId: string, shotId: string): S {
  return withProduction(s, productionId, (p) => {
    const i = p.shots.findIndex((sh) => sh.id === shotId);
    if (i === -1) return p;
    const copy: Shot = { ...structuredClone(p.shots[i]), id: nid('shot'), takes: [], selectedTakeId: undefined };
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

export function selectTake(s: S, productionId: string, shotId: string, takeId: string | undefined): S {
  return updateShot(s, productionId, shotId, { selectedTakeId: takeId });
}

export function noteTake(s: S, productionId: string, shotId: string, takeId: string, note: string): S {
  return withProduction(s, productionId, (p) => ({ ...p, shots: p.shots.map((sh) => (sh.id === shotId ? { ...sh, takes: sh.takes.map((t): Take => (t.id === takeId ? { ...t, note } : t)) } : sh)) }));
}

/** Removing a take keeps the fact that its characters were in a video (see rules.ts). */
export function removeTake(s: S, productionId: string, shotId: string, takeId: string): S {
  const next = withProduction(s, productionId, (p) => ({ ...p, shots: p.shots.map((sh) => (sh.id === shotId ? { ...sh, takes: sh.takes.filter((t) => t.id !== takeId), selectedTakeId: sh.selectedTakeId === takeId ? undefined : sh.selectedTakeId } : sh)) }));
  return next === s ? s : { ...next, characters: markTakeRemoved(next.characters, shotId, takeId) };
}

/** A take arrives for a shot (from a future generation, or an upload): every character in the shot is recorded as
 *  having been in a video, and from then on their appearance is preserved. */
export function addTake(s: S, productionId: string, shotId: string, input: { assetId: string; label?: string; note?: string }): { state: S; take: Take | null } {
  const p = s.productions.find((x) => x.id === productionId);
  const sh = p?.shots.find((x) => x.id === shotId);
  if (!p || !sh) return { state: s, take: null };
  const take: Take = { id: nid('take'), label: input.label ?? `Take ${sh.takes.length + 1}`, assetId: input.assetId, createdAt: now(), note: input.note };
  const next = withProduction(s, productionId, (x) => ({ ...x, shots: x.shots.map((y) => (y.id === shotId ? { ...y, takes: [...y.takes, take] } : y)) }));
  const updated = next.productions.find((x) => x.id === productionId)!;
  return { state: { ...next, characters: recordTakeUsage(next.characters, updated, shotId, take.id, take.createdAt) }, take };
}

// -------------------------------------------------------------------------------------------------------- song

export function setSong(s: S, productionId: string, song: Song | undefined): S { return updateProduction(s, productionId, { song }); }

export function updateSong(s: S, productionId: string, patch: Partial<Song>): S {
  return withProduction(s, productionId, (p) => (p.song ? { ...p, song: { ...p.song, ...patch } } : p));
}

// -------------------------------------------------------------------------------------------------- characters

export type CharacterInput = Omit<Character, 'id' | 'createdAt' | 'updatedAt' | 'refs' | 'voice'> & { voice?: Partial<Character['voice']> };

export function addCharacter(s: S, input: CharacterInput): { state: S; character: Character } {
  const t = now();
  const character: Character = { ...input, id: nid('char'), refs: [], voice: { pitch: 'MID', pace: 'MEASURED', timbre: '', notes: '', samples: [], ...input.voice }, usage: { known: true, videos: [] }, createdAt: t, updatedAt: t };
  return { state: { ...s, characters: [...s.characters, character] }, character };
}

/** Any change to a character. A character who has been in a video keeps their appearance: the appearance fields of
 *  the patch are dropped for them (see rules.ts), whatever page the change comes from. Usage is never patched here. */
export function updateCharacter(s: S, id: string, patch: Partial<Omit<Character, 'id' | 'createdAt' | 'usage'>>): S {
  const c = s.characters.find((x) => x.id === id);
  if (!c) return s;
  const allowed = guardCharacterPatch(c, patch as Partial<Character>);
  delete (allowed as Partial<Character>).usage;
  if (Object.keys(allowed).length === 0) return s;
  return { ...s, characters: s.characters.map((x) => (x.id === id ? { ...x, ...allowed, updatedAt: now() } : x)) };
}

/** Keep (or clear) the reference picture an unused character's appearance will be generated from. Refused for a
 *  character who has been in a video. The picture itself is kept by the media store. */
export function setPendingReference(s: S, id: string, assetId: string | undefined): S {
  const c = s.characters.find((x) => x.id === id);
  if (!c || !canChangeAppearance(c)) return s;
  return updateCharacter(s, id, { pendingReference: assetId ? { assetId, addedAt: now() } : undefined });
}

/** Add a voice line the producer recorded (the audio is kept by the media store). Voice is not appearance: this works
 *  for every character. */
export function addVoiceRecording(s: S, id: string, assetId: string, label: string): S {
  const c = s.characters.find((x) => x.id === id);
  if (!c) return s;
  const sample = { id: nid('voice'), label, assetId, source: 'UPLOADED' as const };
  return updateCharacter(s, id, { voice: { ...c.voice, samples: [...c.voice.samples, sample] } });
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

export function selectVoiceSample(s: S, id: string, sampleId: string | undefined): S {
  return { ...s, characters: s.characters.map((c) => (c.id === id ? { ...c, voice: { ...c.voice, selectedSampleId: sampleId }, updatedAt: now() } : c)) };
}

// --------------------------------------------------------------------------------------------------- locations

export type LocationInput = Omit<Location, 'id' | 'createdAt' | 'updatedAt' | 'refs'>;

export function addLocation(s: S, input: LocationInput): { state: S; location: Location } {
  const t = now();
  const location: Location = { ...input, id: nid('loc'), refs: [], createdAt: t, updatedAt: t };
  return { state: { ...s, locations: [...s.locations, location] }, location };
}

export function updateLocation(s: S, id: string, patch: Partial<Omit<Location, 'id' | 'createdAt'>>): S {
  return { ...s, locations: s.locations.map((l) => (l.id === id ? { ...l, ...patch, updatedAt: now() } : l)) };
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

/** A file the producer added in the browser. The bytes are kept by the media store (IndexedDB); this is the record. */
export function addLocalAsset(s: S, input: Omit<Asset, 'id' | 'createdAt' | 'sample' | 'local'>): { state: S; asset: Asset } {
  const asset: Asset = { ...input, src: '', id: nid('local'), sample: false, local: true, createdAt: now() };
  return { state: { ...s, assets: [...s.assets, asset] }, asset };
}

/** Nothing but your settings: the studio as it would be on day one. */
export function emptyStudio(settings: Settings): S {
  return { version: STATE_VERSION, shows: [], seasons: [], productions: [], characters: [], locations: [], assets: [], settings };
}

/** Removing a file removes every use of it too: a reference view, a portrait, a frame, a take, a song's track. A
 *  picture a used character's appearance rests on is not removed at all (see rules.ts). */
export function deleteAsset(s: S, id: string): S {
  if (protectedAssetOwner(s, id)) return s;
  const not = (x: string | undefined) => (x === id ? undefined : x);
  return {
    ...s,
    assets: s.assets.filter((a) => a.id !== id),
    characters: s.characters.map((c) => ({ ...c, refs: c.refs.filter((r) => r.assetId !== id), portraitAssetId: not(c.portraitAssetId), pendingReference: c.pendingReference?.assetId === id ? undefined : c.pendingReference, voice: { ...c.voice, samples: c.voice.samples.filter((v) => v.assetId !== id), selectedSampleId: c.voice.samples.find((v) => v.id === c.voice.selectedSampleId)?.assetId === id ? undefined : c.voice.selectedSampleId } })),
    locations: s.locations.map((l) => ({ ...l, refs: l.refs.filter((r) => r.assetId !== id), masterAssetId: not(l.masterAssetId) })),
    shows: s.shows.map((sh) => ({ ...sh, coverAssetId: not(sh.coverAssetId) })),
    productions: s.productions.map((p) => ({
      ...p, coverAssetId: not(p.coverAssetId), cutAssetId: not(p.cutAssetId), song: p.song ? { ...p.song, assetId: not(p.song.assetId) } : undefined,
      shots: p.shots.map((sh) => { const takes = sh.takes.filter((t) => t.assetId !== id); return { ...sh, openingFrameAssetId: not(sh.openingFrameAssetId), endingFrameAssetId: not(sh.endingFrameAssetId), takes, selectedTakeId: takes.some((t) => t.id === sh.selectedTakeId) ? sh.selectedTakeId : undefined }; }),
    })),
  };
}

// ------------------------------------------------------------------------------------------------- Auto Idea

/** Accept a reviewed proposal: create the new characters and places the producer kept (with no appearance yet),
 *  then the production — or, for a show, the show with its first season and first episode — with the structure as
 *  scenes. Nothing else is invented: kept existing characters and places are linked, not copied. */
export function acceptProposal(s: S, input: { kind: 'SHOW' | 'EPISODE' | 'SHORT' | 'MUSIC_VIDEO'; showId?: string; seasonId?: string; aspect: Aspect; proposal: IdeaProposal; keepCast: string[]; keepLocations: string[]; preferences: IdeaPreferences; lyricsToSections?: (lyrics: string, total: number) => Song['sections'] }): { state: S; production: Production } {
  const { proposal: pr } = input;
  let st = s;
  const castIds: string[] = []; const locationIds: string[] = [];
  for (const c of pr.cast.filter((x) => input.keepCast.includes(x.key))) {
    if (c.characterId) { castIds.push(c.characterId); continue; }
    const r = addCharacter(st, { name: c.name, role: c.role, style: pr.style, sex: c.sex ?? 'FEMALE', ageYears: 30, build: '', face: '', hair: '', skin: '', eyes: '', distinguishing: [], wardrobe: '', personality: c.reason, language: pr.language, dialect: pr.dialect, notes: 'Proposed by Auto Idea (sample proposal).' });
    st = r.state; castIds.push(r.character.id);
  }
  for (const l of pr.locations.filter((x) => input.keepLocations.includes(x.key))) {
    if (l.locationId) { locationIds.push(l.locationId); continue; }
    const r = addLocation(st, { name: l.name, kind: l.kind ?? 'EXTERIOR', description: l.description, style: pr.style, lighting: [], landmarks: [], props: [] });
    st = r.state; locationIds.push(r.location.id);
  }
  const brief = { mode: 'AUTO_IDEA' as const, text: pr.premise, ideaTitle: pr.title, preferences: input.preferences, fromSampleProposal: true };
  const common = { style: pr.style, language: pr.language, dialect: pr.dialect, aspect: input.aspect, targetSeconds: pr.durationSeconds, brief };
  const withStructure = (state: S, productionId: string, items: IdeaProposal['structure']) => items.reduce((acc, it) => {
    const r = addScene(acc, productionId, { title: it.title, timeOfDay: 'MORNING', characterIds: [] });
    return updateScene(r.state, productionId, r.scene.id, { beats: [{ id: nid('beat'), action: it.summary, lines: [] }] });
  }, state);
  if (input.kind === 'SHOW') {
    const r = addShow(st, { title: pr.title, logline: pr.logline, genre: pr.genre, style: pr.style, language: pr.language, dialect: pr.dialect, aspect: input.aspect, castIds, locationIds });
    let next = updateShow(r.state, r.show.id, { synopsis: pr.premise });
    const first = pr.structure[0];
    const ep = addProduction(next, { ...common, kind: 'EPISODE', title: first?.title ?? 'Episode 1', logline: first?.summary ?? '', synopsis: first?.summary ?? '', showId: r.show.id, seasonId: r.season.id, castIds: [], locationIds: [] });
    next = updateSeason(ep.state, r.season.id, { arc: pr.structure.map((x) => x.title).join(' · ') });
    return { state: next, production: ep.production };
  }
  const kind: Kind = input.kind === 'MUSIC_VIDEO' ? 'MUSIC_VIDEO' : input.kind === 'SHORT' ? 'SHORT' : 'EPISODE';
  const song: Song | undefined = input.kind === 'MUSIC_VIDEO' && pr.song ? { id: nid('song'), title: pr.song.title, source: 'GENERATED_EXAMPLE', durationSeconds: pr.durationSeconds, caption: pr.song.caption, sections: (input.lyricsToSections?.(pr.song.lyrics, pr.durationSeconds) ?? []).map((x) => ({ ...x, singerIds: castIds })), singerIds: castIds } : undefined;
  const r = addProduction(st, { ...common, kind, title: pr.title, logline: pr.logline, synopsis: pr.premise, showId: input.showId, seasonId: input.seasonId, castIds, locationIds, song });
  let next = updateProduction(r.state, r.production.id, { genre: pr.genre, mood: pr.mood, ...(kind === 'MUSIC_VIDEO' ? { concept: pr.concept, artist: st.characters.filter((c) => castIds.includes(c.id)).map((c) => c.name).join(' & ') || undefined } : {}) });
  if (kind !== 'MUSIC_VIDEO') next = withStructure(next, r.production.id, pr.structure);
  return { state: next, production: next.productions.find((x) => x.id === r.production.id)! };
}

// ---------------------------------------------------------------------------------------------------- settings

export function updateSettings(s: S, patch: Partial<Settings>): S {
  return { ...s, settings: { ...s.settings, ...patch, defaults: { ...s.settings.defaults, ...(patch.defaults ?? {}) } } };
}
