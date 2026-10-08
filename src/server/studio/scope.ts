import type { Command, CommandName } from '@/domain/commands';
import type { Character, Production, StudioState } from '@/domain/types';

/** SCOPED PERSISTENCE, PART A — WHAT EACH COMMAND TOUCHES (docs/BACKEND-AUDIT-2026-10.md H2, step 13a).
 *
 *  Every studio command is classified by the aggregates it reads and writes: a production (with its scenes, shots and
 *  takes), a show (with its seasons), a character (with its usage records), a location, an asset, the settings. The
 *  command engine (src/server/studio/engine.ts) loads only that part of the studio, runs the SAME reducer on it, and
 *  saves only what changed — instead of loading and diffing the whole studio for every edit.
 *
 *  A scope says, per collection, what is loaded:
 *  - `'all'`  — every live row;
 *  - a Set    — exactly these ids (a SUBSET: a reducer may find them and append new ones);
 *  - `null`   — nothing. The collection is a POISONED array: a reducer that touches it throws `ScopeMiss`, and the
 *               engine runs the batch again with that collection loaded whole. A wrong `null` costs a retry, never a
 *               wrong result.
 *  A wrong SUBSET could hide a row a reducer needed, so a command whose reducer looks across a collection (counts,
 *  scans, cascades) is classified `'all'` for it or `full` — the whole studio under the exclusive lock, exactly as
 *  before. tests/unit/command-scope.test.ts runs every command of the corpus on the full sample studio and on its
 *  scoped part and requires the same result.
 *
 *  `locks` are the aggregates the batch is known to write, locked before anything is loaded (per-aggregate advisory
 *  locks; the global lock is then taken SHARED). The guarantee does not rest on them: every changed production, show,
 *  character and location is saved with compare-and-set on its version, and changed assets and settings are locked and
 *  re-checked before they are written (src/server/studio/store.ts). */

export type IdScope = 'all' | Set<string> | null;

export interface Scope {
  /** the whole studio, under the exclusive global lock (the v1 path) */
  full: boolean;
  productions: IdScope;
  /** every production of these seasons is loaded too (episode numbering) */
  seasonProductions: Set<string>;
  /** shows and seasons (few rows): all or nothing */
  shows: boolean;
  characters: IdScope;
  /** locations (few rows): all or nothing */
  locations: boolean;
  assets: IdScope;
  settings: boolean;
  locks: Set<string>;
  /** resolved once the productions are loaded: the characters of these shots (a take records their usage) */
  charactersOfShots: Array<{ productionId: string; shotId: string }>;
  /** the characters with a usage record of these takes (a removed take marks them) */
  charactersWithUsageOfTakes: Set<string>;
  /** the recordings of these dialogue lines (keeping a recording writes its review) */
  assetsOfLines: Array<{ productionId: string; shotId: string; lineId: string }>;
}

export const emptyScope = (): Scope => ({ full: false, productions: null, seasonProductions: new Set(), shows: false, characters: null, locations: false, assets: null, settings: false, locks: new Set(), charactersOfShots: [], charactersWithUsageOfTakes: new Set(), assetsOfLines: [] });
export const fullScope = (): Scope => ({ ...emptyScope(), full: true, productions: 'all', shows: true, characters: 'all', locations: true, assets: 'all', settings: true });

/** A lock key of one aggregate (hashed into an advisory lock by the engine). */
export const lockKey = (kind: 'production' | 'show' | 'character' | 'location' | 'asset' | 'settings', id = '') => (kind === 'settings' ? 'studio:settings' : `studio:${kind}:${id}`);

const add = (into: IdScope, ids: Array<string | undefined | null>): IdScope => {
  if (into === 'all') return 'all';
  const s = new Set(into ?? []);
  for (const id of ids) if (typeof id === 'string' && id) s.add(id);
  return s;
};
const all = (): IdScope => 'all';
const str = (x: unknown): string | undefined => (typeof x === 'string' && x ? x : undefined);
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});

type Classifier = (sc: Scope, args: unknown[]) => void;

/** one production, locked */
const production: Classifier = (sc, a) => { const id = str(a[0]); sc.productions = add(sc.productions, [id]); if (id) sc.locks.add(lockKey('production', id)); };
/** one character, locked (+ the settings: a dialect defaults to the studio's) */
const character = (opts: { settings?: boolean; assets?: (a: unknown[]) => Array<string | undefined>; allAssets?: boolean; allCharacters?: boolean } = {}): Classifier => (sc, a) => {
  const id = str(a[0]);
  sc.characters = opts.allCharacters ? all() : add(sc.characters, [id]);
  if (id) sc.locks.add(lockKey('character', id));
  if (opts.settings) sc.settings = true;
  if (opts.allAssets) sc.assets = all();
  else if (opts.assets) sc.assets = add(sc.assets, opts.assets(a));
};
const show: Classifier = (sc, a) => { sc.shows = true; const id = str(a[0]); if (id) sc.locks.add(lockKey('show', id)); };
const location: Classifier = (sc, a) => { sc.locations = true; const id = str(a[0]); if (id) sc.locks.add(lockKey('location', id)); };
const asset: Classifier = (sc, a) => { const id = str(a[0]); sc.assets = add(sc.assets, [id]); if (id) sc.locks.add(lockKey('asset', id)); };
const full: Classifier = (sc) => { sc.full = true; };

/** THE CLASSIFICATION — one entry per command (a missing one is a compile error). */
/** ONE STYLE PER PRODUCTION (src/domain/style-rule.ts): a command that brings people or places into a production or a
 *  show reads them to judge their style. `ids`: the people it names; a style change judges every member (all people). */
const members = (sc: Scope, people: unknown, places: unknown, styleChange = false) => {
  sc.characters = styleChange ? all() : add(sc.characters, Array.isArray(people) ? (people as unknown[]).map(str) : []);
  if (styleChange || places !== undefined) sc.locations = true;
};

export const COMMAND_SCOPES: Record<CommandName, Classifier> = {
  // shows and seasons (season numbering and the show's version are the show's)
  addShow: (sc, a) => { sc.shows = true; members(sc, obj(a[0]).castIds, obj(a[0]).locationIds ?? []); },
  updateShow: (sc, a) => { show(sc, a); const p = obj(a[1]); members(sc, p.castIds, p.locationIds, p.style !== undefined); },
  updateShowBible: show,
  // the episode (its scenes, its season and number) and its show's bible; the show is locked by its id in the episode
  finishEpisode: (sc, a) => { production(sc, a); sc.shows = true; },
  addSeason: show,
  updateSeason: (sc) => { sc.shows = true; },
  deleteShow: full, deleteSeason: full,
  // productions
  addProduction: (sc, a) => {
    const input = obj(a[0]);
    sc.productions = add(sc.productions, []);
    if (input.kind === 'EPISODE' && str(input.seasonId)) sc.seasonProductions.add(str(input.seasonId)!);
    if (str(input.showId)) sc.locks.add(lockKey('show', str(input.showId)!));
    members(sc, input.castIds, input.locationIds ?? []);
  },
  updateProduction: (sc, a) => { production(sc, a); const p = obj(a[1]); members(sc, p.castIds, p.locationIds, p.style !== undefined); },
  deleteProduction: production, setStage: production, markStepDone: production, recordExport: production, setCut: production, fillProductionFields: production,
  duplicateProduction: full,
  addCastMember: (sc, a) => { const t = obj(a[0]); if (str(t.productionId)) production(sc, [t.productionId]); if (str(t.showId)) show(sc, [t.showId]); sc.characters = add(sc.characters, Array.isArray(a[1]) ? (a[1] as unknown[]).map(str) : []); },
  addLocationMember: (sc, a) => { const t = obj(a[0]); if (str(t.productionId)) production(sc, [t.productionId]); if (str(t.showId)) show(sc, [t.showId]); sc.locations = true; },
  addScene: (sc, a) => { production(sc, a); const i = obj(a[1]); members(sc, i.characterIds, i.locationId); },
  updateScene: (sc, a) => { production(sc, a); const p = obj(a[2]); members(sc, p.characterIds, p.locationId); },
  deleteScene: production, replaceScript: production,
  addShot: production, replaceSceneShots: production, updateShot: production, deleteShot: production, duplicateShot: production, moveShot: production, reorderShot: production, setShotContinuity: production,
  selectTake: production, noteTake: production, recordTakeEndState: production, rejectTake: production, rateTake: production, setShotFrames: production, setDialogueAudio: production, setSong: production, updateSong: production, recordSongListening: production,
  removeTake: (sc, a) => { production(sc, a); if (str(a[2])) sc.charactersWithUsageOfTakes.add(str(a[2])!); sc.characters = add(sc.characters, []); },
  addTake: (sc, a) => { production(sc, a); sc.assets = add(sc.assets, [str(obj(a[2]).assetId), str(obj(a[2]).id)]); if (str(a[0]) && str(a[1])) sc.charactersOfShots.push({ productionId: str(a[0])!, shotId: str(a[1])! }); sc.characters = add(sc.characters, []); },
  keepLineRecordings: (sc, a) => { production(sc, a); sc.assets = add(sc.assets, []); if (str(a[0]) && Array.isArray(a[1])) for (const l of a[1] as unknown[]) { const x = obj(l); if (str(x.shotId) && str(x.lineId)) sc.assetsOfLines.push({ productionId: str(a[0])!, shotId: str(x.shotId)!, lineId: str(x.lineId)! }); } },
  // characters
  addCharacter: (sc) => { sc.characters = add(sc.characters, []); sc.settings = true; },
  updateCharacter: character({ settings: true }),
  setPendingReference: character({ assets: (a) => [str(a[1])] }),
  addVoiceSample: character(), addVoiceRecording: character({ assets: (a) => [str(a[1])] }),
  updateVoiceSample: character(), removeVoiceSample: character(), selectVoiceSample: character(),
  setVoiceIdentity: character({ settings: true, allAssets: true }),
  addVoiceDesign: character({ settings: true, allAssets: true }), updateVoiceDesign: character({ allAssets: true }),
  recordVoiceListening: character(), confirmVoiceConsent: character(), setSpokenLanguages: character(), approveCanonicalImage: character(),
  // a canonical image is unique across characters and moves asset tiers
  setCanonicalImage: character({ allCharacters: true, allAssets: true }),
  deleteCharacter: full,
  // locations
  addLocation: (sc) => { sc.locations = true; },
  updateLocation: location, addLocationRefs: location,
  // a new place from an existing one (its ambience asset kept)
  duplicateLocationInStyle: (sc, a) => { location(sc, a); sc.assets = all(); },
  // the bed must be an audio recording in the library
  setLocationAmbience: (sc, a) => { location(sc, a); sc.assets = add(sc.assets, [str(obj(a[1]).assetId)]); },
  deleteLocation: full,
  // assets
  addAsset: (sc, a) => { sc.assets = add(sc.assets, [str(obj(a[0]).id)]); },
  updateAsset: asset,
  setAssetTier: (sc, a) => { asset(sc, a); sc.characters = all(); },
  deleteAsset: full,
  // cross-cutting
  acceptProposal: full,
  updateSettings: (sc) => { sc.settings = true; sc.locks.add(lockKey('settings')); },
  proposePronunciation: (sc) => { sc.settings = true; sc.locks.add(lockKey('settings')); },
  reviewPronunciation: (sc) => { sc.settings = true; sc.locks.add(lockKey('settings')); },
  removePronunciation: (sc) => { sc.settings = true; sc.locks.add(lockKey('settings')); },
};

/** The scope of a batch: the union of its commands' scopes (and of the aggregates whose versions it expects). */
export function batchScope(commands: Array<Pick<Command, 'name' | 'args'>>, expect: Array<{ kind: 'production' | 'show' | 'character' | 'location'; id: string }> = []): Scope {
  const sc = emptyScope();
  for (const c of commands) {
    const classify = COMMAND_SCOPES[c.name as CommandName];
    if (!classify) { sc.full = true; continue; }
    classify(sc, Array.isArray(c.args) ? (c.args as unknown[]) : []);
  }
  for (const x of expect) {
    if (x.kind === 'production') production(sc, [x.id]);
    else if (x.kind === 'show') show(sc, [x.id]);
    else if (x.kind === 'character') character()(sc, [x.id]);
    else location(sc, [x.id]);
  }
  return sc.full ? { ...fullScope(), locks: sc.locks } : sc;
}

/** Widen one collection to everything (after a ScopeMiss). */
export function widen(sc: Scope, what: ScopeCollection): Scope {
  const next: Scope = { ...sc, locks: new Set(sc.locks) };
  if (what === 'productions') next.productions = 'all';
  else if (what === 'characters') next.characters = 'all';
  else if (what === 'assets') next.assets = 'all';
  else if (what === 'shows' || what === 'seasons') next.shows = true;
  else if (what === 'locations') next.locations = true;
  else if (what === 'settings') next.settings = true;
  return next;
}

/** The second step of resolving a scope, once its productions are loaded: the characters of a shot that gets a take,
 *  the recordings of the lines being kept, the characters whose usage names a removed take (`usageOf`, from the
 *  usage table — or, in memory, from the characters). Returns the scope with those ids added. */
export function expandScope(sc: Scope, productions: Production[], usageOf: (takeIds: string[]) => string[]): Scope {
  if (sc.full) return sc;
  let characters = sc.characters; let assets = sc.assets;
  for (const x of sc.charactersOfShots) {
    const sh = productions.find((p) => p.id === x.productionId)?.shots.find((s) => s.id === x.shotId);
    if (sh) characters = add(characters, sh.characterIds);
  }
  if (sc.charactersWithUsageOfTakes.size) characters = add(characters, usageOf([...sc.charactersWithUsageOfTakes]));
  for (const x of sc.assetsOfLines) {
    const d = productions.find((p) => p.id === x.productionId)?.shots.find((s) => s.id === x.shotId)?.dialogue.find((l) => l.id === x.lineId);
    if (d?.audioAssetId) assets = add(assets, [d.audioAssetId]);
  }
  return { ...sc, characters, assets };
}

// ------------------------------------------------------------------------------------------- the scoped state

export type ScopeCollection = 'productions' | 'shows' | 'seasons' | 'characters' | 'locations' | 'assets' | 'settings';

/** A reducer touched a collection its command's scope did not load. Never escapes the engine: the batch runs again
 *  with that collection loaded. */
export class ScopeMiss extends Error {
  constructor(public readonly collection: ScopeCollection) { super(`scope miss: ${collection}`); this.name = 'ScopeMiss'; }
}
export const isScopeMiss = (e: unknown): e is ScopeMiss => e instanceof ScopeMiss || (e as { name?: string })?.name === 'ScopeMiss';

/** The stand-in for a collection that was not loaded: any use of it throws ScopeMiss. */
export function poisoned<T extends object>(collection: ScopeCollection, shape: T): T {
  const miss = () => { throw new ScopeMiss(collection); };
  return new Proxy(shape, { get: miss, has: miss, ownKeys: miss, getOwnPropertyDescriptor: miss, set: miss, deleteProperty: miss, defineProperty: miss, getPrototypeOf: miss, apply: miss });
}

/** What was actually loaded, per collection (the saver and the read model work from it). */
export interface Loaded {
  productions: Set<string> | 'all' | null; shows: boolean; characters: Set<string> | 'all' | null; locations: boolean; assets: Set<string> | 'all' | null; settings: boolean;
}

const pick = <T extends { id: string }>(xs: T[], scope: IdScope): T[] => (scope === 'all' ? xs : scope === null ? [] : xs.filter((x) => scope.has(x.id)));
const idsOf = (xs: Array<{ id: string }>) => new Set(xs.map((x) => x.id));

/** THE LOADER, IN MEMORY: the part of a whole studio a (resolved) scope loads — what src/server/studio/store.ts reads
 *  from the database. Used by the classification test and by nothing on the write path. */
export function restrictState(full: StudioState, sc: Scope): { state: StudioState; loaded: Loaded } {
  if (sc.full) return { state: full, loaded: { productions: 'all', shows: true, characters: 'all', locations: true, assets: 'all', settings: true } };
  const prodIds: IdScope = sc.productions === 'all' ? 'all' : sc.productions === null && sc.seasonProductions.size === 0 ? null : new Set([...(sc.productions ?? []), ...full.productions.filter((p) => p.seasonId && sc.seasonProductions.has(p.seasonId)).map((p) => p.id)]);
  const productions = pick(full.productions, prodIds);
  const characters = pick(full.characters, sc.characters);
  const assets = pick(full.assets, sc.assets);
  const loaded: Loaded = { productions: prodIds === 'all' ? 'all' : prodIds === null ? null : idsOf(productions), shows: sc.shows, characters: sc.characters === 'all' ? 'all' : sc.characters === null ? null : idsOf(characters), locations: sc.locations, assets: sc.assets === 'all' ? 'all' : sc.assets === null ? null : idsOf(assets), settings: sc.settings };
  return { state: scopedState({ version: full.version, productions: prodIds === null ? null : productions, shows: sc.shows ? full.shows : null, seasons: sc.shows ? full.seasons : null, characters: sc.characters === null ? null : characters, locations: sc.locations ? full.locations : null, assets: sc.assets === null ? null : assets, settings: sc.settings ? full.settings : null }), loaded };
}

/** A StudioState of the loaded parts, poisoned where nothing was loaded. */
export function scopedState(parts: { version: StudioState['version']; productions: StudioState['productions'] | null; shows: StudioState['shows'] | null; seasons: StudioState['seasons'] | null; characters: StudioState['characters'] | null; locations: StudioState['locations'] | null; assets: StudioState['assets'] | null; settings: StudioState['settings'] | null }): StudioState {
  return {
    version: parts.version,
    productions: parts.productions ?? poisoned('productions', []),
    shows: parts.shows ?? poisoned('shows', []),
    seasons: parts.seasons ?? poisoned('seasons', []),
    characters: parts.characters ?? poisoned('characters', []),
    locations: parts.locations ?? poisoned('locations', []),
    assets: parts.assets ?? poisoned('assets', []),
    settings: parts.settings ?? poisoned('settings', {} as StudioState['settings']),
  };
}

/** Put a scoped result back into a whole studio: loaded rows replaced in place (or removed when the batch removed
 *  them), new rows appended in the order the reducers appended them, everything else untouched. `full` is the studio
 *  the scoped part was loaded from; the result is the studio the same batch run on `full` produces. Pure. */
export function mergeScoped(full: StudioState, after: StudioState, loaded: Loaded): StudioState {
  const mergeIds = <T extends { id: string }>(whole: T[], part: T[], ids: Set<string> | 'all' | null): T[] => {
    if (ids === null) return whole;
    if (ids === 'all') return part;
    const byId = new Map(part.map((x) => [x.id, x]));
    const kept = whole.flatMap((x) => (ids.has(x.id) ? (byId.has(x.id) ? [byId.get(x.id)!] : []) : [x]));
    const known = new Set(whole.map((x) => x.id));
    return [...kept, ...part.filter((x) => !known.has(x.id))];
  };
  return {
    version: full.version,
    productions: mergeIds<Production>(full.productions, loaded.productions === null ? [] : after.productions, loaded.productions),
    shows: loaded.shows ? after.shows : full.shows,
    seasons: loaded.shows ? after.seasons : full.seasons,
    characters: mergeIds<Character>(full.characters, loaded.characters === null ? [] : after.characters, loaded.characters),
    locations: loaded.locations ? after.locations : full.locations,
    assets: mergeIds(full.assets, loaded.assets === null ? [] : after.assets, loaded.assets),
    settings: loaded.settings ? after.settings : full.settings,
  };
}
