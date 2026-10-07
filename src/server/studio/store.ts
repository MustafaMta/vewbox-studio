import { and, asc, eq, inArray, isNull, or, sql as dsql, type SQL } from 'drizzle-orm';
import type { Asset, Character, Location, Production, Scene, Season, Shot, Show, StudioState, Take, VideoUsage } from '@/domain/types';
import { STATE_VERSION } from '@/domain/version';
import { canonical } from '@/domain/hash';
import { StudioError } from '@/domain/errors';
import { schema, type Db } from '../db/client';
import { assetFromRow, assetSrc, characterFromRow, locationFromRow, productionFromRow, rowHash as h, sceneFromRow, seasonFromRow, shotFromRow, showFromRow, takeFromRow, usageFromRow, type AggregateVersions, type RowHashes } from './snapshot';
import { assetRow, characterRow, productionRow, sceneRow, shotRow, takeRow, usageRow, type PersistReport } from './persist';
import { expandScope, scopedState, type Loaded, type Scope } from './scope';

/** SCOPED PERSISTENCE, PART B — THE STORE (docs/BACKEND-AUDIT-2026-10.md H2, step 13b). Loads only the aggregates a
 *  batch's scope names (src/server/studio/scope.ts) and saves only what changed in them:
 *  - LOAD: one production with its live scenes, shots and takes (or the productions of a season), the shows, the
 *    characters and their usage, the locations, the assets, the settings — each only when the scope asks for it.
 *  - SAVE: the same row-by-row diff as the whole-studio saver (persist.ts) restricted to what was loaded, with the same
 *    tombstones, usage records and version rules, plus:
 *      · COMPARE-AND-SET on every production, show, character and location the batch changes or removes
 *        (`version = loaded version`), BEFORE any row is written — a writer that changed it meanwhile makes this batch
 *        a `ScopedConflict`, which the engine runs again on fresh rows;
 *      · changed or removed ASSETS and the SETTINGS are locked and compared with what was loaded before they are
 *        written (they have no version);
 *      · a new take, shot, scene or production whose id is already a live row elsewhere is refused (CONFLICT) instead
 *        of overwriting it (the whole-studio saver could never meet one: it had every row);
 *      · scene and shot positions are compared with the loaded ones, not rewritten row by row.
 *  Everything runs in the caller's transaction. */

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
const nul = <T>(v: T | undefined): T | null => (v === undefined ? null : v);

/** Another writer changed an aggregate this batch read: the batch is run again (never surfaced to a caller). */
export class ScopedConflict extends Error {
  constructor(public readonly what: string) { super(`scoped write conflict: ${what}`); this.name = 'ScopedConflict'; }
}
export const isScopedConflict = (e: unknown): e is ScopedConflict => e instanceof ScopedConflict || (e as { name?: string })?.name === 'ScopedConflict';

export interface ScopedSnapshot {
  /** the loaded part of the studio (collections not loaded are poisoned) */
  state: StudioState;
  loaded: Loaded;
  scope: Scope;
  hashes: RowHashes;
  positions: { scenes: Map<string, number>; shots: Map<string, number> };
  versions: AggregateVersions;
  /** loaded asset rows and settings, as stored: the save re-reads and compares them before writing (no version) */
  rawAssets: Map<string, unknown>;
  rawSettings: unknown;
}

type AssetRowRead = typeof schema.assets.$inferSelect;

/** Load what a scope names (and resolve its second step: shot characters, usage of removed takes, kept lines). */
export async function loadScoped(tx: Tx, scope: Scope): Promise<ScopedSnapshot> {
  const live = <T extends { deletedAt: unknown }>(t: T) => isNull(t.deletedAt as never);
  // ---- productions, with their live scenes, shots and takes ----
  let productionRows: Array<typeof schema.productions.$inferSelect> | null = null;
  if (scope.productions === 'all') productionRows = await tx.select().from(schema.productions).where(live(schema.productions)).orderBy(asc(schema.productions.createdAt));
  else if (scope.productions !== null || scope.seasonProductions.size) {
    const conds: SQL[] = [];
    const ids = [...(scope.productions ?? [])];
    if (ids.length) conds.push(inArray(schema.productions.id, ids));
    if (scope.seasonProductions.size) conds.push(inArray(schema.productions.seasonId, [...scope.seasonProductions]));
    productionRows = conds.length ? await tx.select().from(schema.productions).where(and(live(schema.productions), or(...conds))).orderBy(asc(schema.productions.createdAt)) : [];
  }
  const pids = (productionRows ?? []).map((p) => p.id);
  const [sceneRows, shotRows, takeRows, showRows, seasonRows, locationRows, settingsRows] = await Promise.all([
    pids.length ? tx.select().from(schema.scenes).where(and(live(schema.scenes), inArray(schema.scenes.productionId, pids))).orderBy(asc(schema.scenes.position)) : Promise.resolve([]),
    pids.length ? tx.select().from(schema.shots).where(and(live(schema.shots), inArray(schema.shots.productionId, pids))).orderBy(asc(schema.shots.position)) : Promise.resolve([]),
    pids.length ? tx.select().from(schema.takes).where(and(live(schema.takes), inArray(schema.takes.productionId, pids))).orderBy(asc(schema.takes.position)) : Promise.resolve([]),
    scope.shows ? tx.select().from(schema.shows).where(live(schema.shows)).orderBy(asc(schema.shows.createdAt)) : Promise.resolve(null),
    scope.shows ? tx.select().from(schema.seasons).where(live(schema.seasons)).orderBy(asc(schema.seasons.number)) : Promise.resolve(null),
    scope.locations ? tx.select().from(schema.locations).orderBy(asc(schema.locations.createdAt)) : Promise.resolve(null),
    scope.settings ? tx.select().from(schema.settings) : Promise.resolve(null),
  ]);
  const hashes: RowHashes = { shows: new Map(), seasons: new Map(), productions: new Map(), scenes: new Map(), shots: new Map(), takes: new Map(), characters: new Map(), locations: new Map(), assets: new Map(), usage: new Map(), settings: '' };
  const positions = { scenes: new Map(sceneRows.map((s) => [s.id, s.position])), shots: new Map(shotRows.map((s) => [s.id, s.position])) };
  const takesByShot = new Map<string, Take[]>();
  for (const t of takeRows) { const take = takeFromRow(t); hashes.takes.set(t.id, h(take)); takesByShot.set(t.shotId, [...(takesByShot.get(t.shotId) ?? []), take]); }
  const shotsByProduction = new Map<string, Shot[]>();
  for (const s of shotRows) { const shot = shotFromRow(s, takesByShot.get(s.id) ?? []); hashes.shots.set(s.id, h({ ...shot, takes: undefined })); shotsByProduction.set(s.productionId, [...(shotsByProduction.get(s.productionId) ?? []), shot]); }
  const scenesByProduction = new Map<string, Scene[]>();
  for (const sc of sceneRows) { const scene = sceneFromRow(sc); hashes.scenes.set(sc.id, h(scene)); scenesByProduction.set(sc.productionId, [...(scenesByProduction.get(sc.productionId) ?? []), scene]); }
  const productions: Production[] | null = productionRows ? productionRows.map((p) => { const production = productionFromRow(p, scenesByProduction.get(p.id) ?? [], shotsByProduction.get(p.id) ?? []); hashes.productions.set(p.id, h({ ...production, scenes: undefined, shots: undefined })); return production; }) : null;
  const shows: Show[] | null = showRows ? showRows.map((r) => { const s = showFromRow(r); hashes.shows.set(r.id, h(s)); return s; }) : null;
  const seasons: Season[] | null = seasonRows ? seasonRows.map((r) => { const s = seasonFromRow(r); hashes.seasons.set(r.id, h(s)); return s; }) : null;
  const locations: Location[] | null = locationRows ? locationRows.map((l) => { const x = locationFromRow(l); hashes.locations.set(l.id, h(x)); return x; }) : null;
  const settings = settingsRows ? settingsRows[0]?.data ?? (await import('@/domain/settings')).DEFAULT_SETTINGS : null;
  if (settings) hashes.settings = h(settings);

  // ---- the second step: who and what the loaded productions name ----
  const resolved = expandScope(scope, productions ?? [], () => []);
  let usageCharacters: string[] = [];
  if (scope.charactersWithUsageOfTakes.size && resolved.characters !== 'all') {
    usageCharacters = (await tx.selectDistinct({ id: schema.characterUsage.characterId }).from(schema.characterUsage).where(inArray(schema.characterUsage.takeId, [...scope.charactersWithUsageOfTakes]))).map((r) => r.id);
  }
  const charScope = resolved.characters === 'all' ? 'all' : resolved.characters === null ? null : new Set([...resolved.characters, ...usageCharacters]);
  const finalScope: Scope = { ...resolved, characters: charScope };

  const [characterRows, assetRows] = await Promise.all([
    charScope === 'all' ? tx.select().from(schema.characters).orderBy(asc(schema.characters.createdAt)) : charScope === null ? Promise.resolve(null) : charScope.size ? tx.select().from(schema.characters).where(inArray(schema.characters.id, [...charScope])).orderBy(asc(schema.characters.createdAt)) : Promise.resolve([]),
    finalScope.assets === 'all' ? tx.select().from(schema.assets).orderBy(asc(schema.assets.createdAt)) : finalScope.assets === null ? Promise.resolve(null) : finalScope.assets.size ? tx.select().from(schema.assets).where(inArray(schema.assets.id, [...finalScope.assets])).orderBy(asc(schema.assets.createdAt)) : Promise.resolve([]),
  ]);
  const usageRows = characterRows?.length ? await tx.select().from(schema.characterUsage).where(inArray(schema.characterUsage.characterId, characterRows.map((c) => c.id))).orderBy(asc(schema.characterUsage.id)) : [];

  // posters and canonical images may live in assets this scope did not load: their rows are read for the lookup only
  const assetById = new Map<string, AssetRowRead>((assetRows ?? []).map((a) => [a.id, a]));
  const lookups = new Set<string>();
  for (const a of assetRows ?? []) if (a.posterAssetId && !assetById.has(a.posterAssetId)) lookups.add(a.posterAssetId);
  for (const c of characterRows ?? []) if (c.canonicalAssetId && !assetById.has(c.canonicalAssetId)) lookups.add(c.canonicalAssetId);
  const lookupById = new Map(assetById);
  if (lookups.size) for (const a of await tx.select().from(schema.assets).where(inArray(schema.assets.id, [...lookups]))) lookupById.set(a.id, a);
  const posterOf = (id: string) => { const p = lookupById.get(id); return p ? assetSrc(p) : undefined; };
  const rawAssets = new Map<string, unknown>();
  const assets: Asset[] | null = assetRows ? assetRows.map((a) => { const asset = assetFromRow(a, posterOf); hashes.assets.set(a.id, h(asset)); rawAssets.set(a.id, a); return asset; }) : null;

  const usageByCharacter = new Map<string, VideoUsage[]>();
  for (const u of usageRows) { const v = usageFromRow(u); hashes.usage.set(`${u.characterId}|${u.shotId}|${u.takeId}`, h(v)); usageByCharacter.set(u.characterId, [...(usageByCharacter.get(u.characterId) ?? []), v]); }
  const characters: Character[] | null = characterRows ? characterRows.map((c) => { const character = characterFromRow(c, usageByCharacter.get(c.id) ?? [], (id) => lookupById.get(id)?.createdAt); hashes.characters.set(c.id, h({ ...character, usage: { known: character.usage!.known } })); return character; }) : null;

  const versions: AggregateVersions = { productions: new Map((productionRows ?? []).map((r) => [r.id, r.version])), shows: new Map((showRows ?? []).map((r) => [r.id, r.version])), characters: new Map((characterRows ?? []).map((r) => [r.id, r.version])), locations: new Map((locationRows ?? []).map((r) => [r.id, r.version])) };
  const loaded: Loaded = {
    productions: scope.productions === 'all' ? 'all' : productions ? new Set(pids) : null,
    shows: Boolean(shows), characters: charScope === 'all' ? 'all' : characters ? new Set(characters.map((c) => c.id)) : null,
    locations: Boolean(locations), assets: finalScope.assets === 'all' ? 'all' : assets ? new Set(assets.map((a) => a.id)) : null, settings: Boolean(settings),
  };
  const state = scopedState({ version: STATE_VERSION, productions, shows, seasons, characters, locations, assets, settings });
  return { state, loaded, scope: finalScope, hashes, positions, versions, rawAssets, rawSettings: settingsRows ? settingsRows[0]?.data ?? null : null };
}

export interface ScopedSaveReport extends PersistReport { touched: { productions: string[]; shows: string[]; characters: string[]; locations: string[] }; assets: string[]; settings: boolean }

/** Save what a batch changed in its scope. Throws ScopedConflict when an aggregate it changes moved since it was
 *  loaded, StudioError CONFLICT when a new row's id is already taken. */
export async function saveScoped(tx: Tx, snap: ScopedSnapshot, after: StudioState, opts: { deletedBy?: string } = {}): Promise<ScopedSaveReport> {
  const { hashes: before, loaded } = snap;
  const prev = snap.state;
  const report: PersistReport = { inserted: 0, updated: 0, deleted: 0 };
  const deletedAt = new Date().toISOString();
  const deletedBy = (opts.deletedBy ?? 'studio').slice(0, 200);
  const live = { deletedAt: null, deletedBy: null };
  const ops: Array<() => Promise<unknown>> = [];
  const touched = { productions: new Set<string>(), shows: new Set<string>(), characters: new Set<string>(), locations: new Set<string>() };
  /** removed aggregates move their version too, so a concurrent writer of one conflicts */
  const removed = { productions: new Set<string>(), shows: new Set<string>() };
  const changedAssets = new Set<string>();
  let settingsChanged = false;

  /** insert a new row of a tombstoned table: revive OUR tombstone of the same id, never take over a live row */
  const insertRevivable = <T extends typeof schema.shows | typeof schema.seasons | typeof schema.productions | typeof schema.scenes | typeof schema.shots | typeof schema.takes>(table: T, row: Record<string, unknown>, what: string) => ops.push(async () => {
    const rows = await tx.insert(table).values(row as never).onConflictDoUpdate({ target: table.id, set: { ...row, ...live } as never, setWhere: dsql`${table.deletedAt} is not null` }).returning({ id: table.id });
    if (!rows.length) throw new StudioError('CONFLICT', `${what} ${String(row.id)} already exists.`, { id: row.id });
  });
  const tombstone = (table: typeof schema.shows | typeof schema.seasons | typeof schema.productions | typeof schema.scenes | typeof schema.shots | typeof schema.takes, ids: string[]) => {
    if (!ids.length) return;
    report.deleted += ids.length;
    ops.push(() => tx.update(table).set({ deletedAt, deletedBy }).where(and(inArray(table.id, ids), isNull(table.deletedAt))));
  };

  // ---- assets (inserted and updated first; removed ones last) ----
  const goneAssets: string[] = [];
  if (loaded.assets !== null) {
    const seen = new Set<string>();
    for (const a of after.assets) {
      seen.add(a.id);
      const hash = h(a); const p = before.assets.get(a.id);
      if (p === hash) continue;
      const row = assetRow(a);
      if (p === undefined) {
        report.inserted++;
        ops.push(async () => { const rows = await tx.insert(schema.assets).values(row).onConflictDoNothing({ target: schema.assets.id }).returning({ id: schema.assets.id }); if (!rows.length) throw new StudioError('CONFLICT', `Asset ${a.id} already exists.`, { id: a.id }); });
      } else {
        report.updated++; changedAssets.add(a.id);
        const { id: _id, storage: _s, path: _p, ...set } = row; void _id; void _s; void _p;
        ops.push(() => tx.update(schema.assets).set(set).where(eq(schema.assets.id, a.id)));
      }
    }
    goneAssets.push(...[...before.assets.keys()].filter((id) => !seen.has(id)));
    for (const id of goneAssets) changedAssets.add(id);
  }

  // ---- shows and seasons ----
  if (loaded.shows) {
    const seen = new Set<string>();
    for (const s of after.shows) {
      seen.add(s.id);
      const hash = h(s); const p = before.shows.get(s.id);
      if (p === hash) continue;
      touched.shows.add(s.id);
      const row = { id: s.id, title: s.title, titleAr: nul(s.titleAr), logline: s.logline, genre: s.genre, style: s.style, language: s.language, dialect: nul(s.dialect), aspect: s.aspect, synopsis: nul(s.synopsis), coverAssetId: nul(s.coverAssetId), posterAssetId: nul(s.posterAssetId), castIds: s.castIds, locationIds: s.locationIds, bible: nul(s.bible), createdAt: s.createdAt, updatedAt: s.updatedAt };
      if (p === undefined) { report.inserted++; insertRevivable(schema.shows, row, 'Show'); } else { report.updated++; ops.push(() => tx.update(schema.shows).set(row).where(eq(schema.shows.id, s.id))); }
    }
    const goneShows = [...before.shows.keys()].filter((id) => !seen.has(id));
    for (const id of goneShows) removed.shows.add(id);
    tombstone(schema.shows, goneShows);
    const seenSe = new Set<string>();
    for (const s of after.seasons) {
      seenSe.add(s.id);
      const hash = h(s); const p = before.seasons.get(s.id);
      if (p === hash) continue;
      touched.shows.add(s.showId);
      const row = { id: s.id, showId: s.showId, number: s.number, title: s.title, arc: s.arc, createdAt: s.createdAt };
      if (p === undefined) { report.inserted++; insertRevivable(schema.seasons, row, 'Season'); } else { report.updated++; ops.push(() => tx.update(schema.seasons).set(row).where(eq(schema.seasons.id, s.id))); }
    }
    const goneSeasons = [...before.seasons.keys()].filter((id) => !seenSe.has(id));
    for (const id of goneSeasons) { const showId = prev.seasons.find((x) => x.id === id)?.showId; if (showId) touched.shows.add(showId); }
    tombstone(schema.seasons, goneSeasons);
  }

  // ---- characters and their usage records ----
  if (loaded.characters !== null) {
    const seen = new Set<string>();
    for (const c of after.characters) {
      seen.add(c.id);
      const hash = h({ ...c, usage: { known: c.usage?.known ?? false } }); const p = before.characters.get(c.id);
      if (p !== hash) {
        touched.characters.add(c.id);
        const row = characterRow(c);
        if (p === undefined) { report.inserted++; ops.push(() => tx.insert(schema.characters).values(row)); } else { report.updated++; ops.push(() => tx.update(schema.characters).set(row).where(eq(schema.characters.id, c.id))); }
      }
      for (const v of c.usage?.videos ?? []) {
        const key = `${c.id}|${v.shotId}|${v.takeId}`;
        const vh = h(v); const vp = before.usage.get(key);
        if (vp === vh) continue;
        const row = usageRow(c.id, v);
        if (vp === undefined) { report.inserted++; ops.push(() => tx.insert(schema.characterUsage).values(row).onConflictDoUpdate({ target: [schema.characterUsage.characterId, schema.characterUsage.shotId, schema.characterUsage.takeId], set: { status: v.status, productionTitle: v.productionTitle } })); }
        else { report.updated++; ops.push(() => tx.update(schema.characterUsage).set({ status: v.status, productionTitle: v.productionTitle, takeLabel: v.takeLabel, shotLabel: v.shotLabel }).where(and(eq(schema.characterUsage.characterId, c.id), eq(schema.characterUsage.shotId, v.shotId), eq(schema.characterUsage.takeId, v.takeId)))); }
      }
    }
    const gone = [...before.characters.keys()].filter((id) => !seen.has(id));
    if (gone.length) { report.deleted += gone.length; for (const id of gone) touched.characters.add(id); ops.push(() => tx.delete(schema.characters).where(inArray(schema.characters.id, gone))); }
  }

  // ---- locations ----
  if (loaded.locations) {
    const seen = new Set<string>();
    for (const l of after.locations) {
      seen.add(l.id);
      const hash = h(l); const p = before.locations.get(l.id);
      if (p === hash) continue;
      touched.locations.add(l.id);
      const row = { id: l.id, name: l.name, nameAr: nul(l.nameAr), kind: l.kind, description: l.description, style: l.style, lighting: l.lighting, landmarks: l.landmarks, props: l.props, refs: l.refs, masterAssetId: nul(l.masterAssetId), layout: nul(l.layout), identity: nul(l.identity), ambience: nul(l.ambience), createdAt: l.createdAt, updatedAt: l.updatedAt };
      if (p === undefined) { report.inserted++; ops.push(() => tx.insert(schema.locations).values(row)); } else { report.updated++; ops.push(() => tx.update(schema.locations).set(row).where(eq(schema.locations.id, l.id))); }
    }
    const gone = [...before.locations.keys()].filter((id) => !seen.has(id));
    if (gone.length) { report.deleted += gone.length; for (const id of gone) touched.locations.add(id); ops.push(() => tx.delete(schema.locations).where(inArray(schema.locations.id, gone))); }
  }

  // ---- productions, scenes, shots, takes ----
  if (loaded.productions !== null) {
    const seenP = new Set<string>(); const seenSc = new Set<string>(); const seenSh = new Set<string>(); const seenT = new Set<string>();
    for (const p of after.productions) {
      seenP.add(p.id);
      const hash = h({ ...p, scenes: undefined, shots: undefined }); const pp = before.productions.get(p.id);
      if (pp !== hash) {
        touched.productions.add(p.id);
        const row = productionRow(p);
        if (pp === undefined) { report.inserted++; insertRevivable(schema.productions, row, 'Production'); } else { report.updated++; ops.push(() => tx.update(schema.productions).set(row).where(eq(schema.productions.id, p.id))); }
      }
      for (let i = 0; i < p.scenes.length; i++) {
        const sc = p.scenes[i]; seenSc.add(sc.id);
        const sh = h(sc); const sp = before.scenes.get(sc.id);
        const row = sceneRow(p.id, i, sc);
        if (sp === undefined) { report.inserted++; touched.productions.add(p.id); insertRevivable(schema.scenes, row, 'Scene'); }
        else if (sp !== sh) { report.updated++; touched.productions.add(p.id); ops.push(() => tx.update(schema.scenes).set(row).where(eq(schema.scenes.id, sc.id))); }
        else if (snap.positions.scenes.get(sc.id) !== i) { touched.productions.add(p.id); ops.push(() => tx.update(schema.scenes).set({ position: i }).where(eq(schema.scenes.id, sc.id))); }
      }
    }
    // shots after every scene of every production exists
    for (const p of after.productions) {
      for (let i = 0; i < p.shots.length; i++) {
        const sh = p.shots[i]; seenSh.add(sh.id);
        const hh = h({ ...sh, takes: undefined }); const sp = before.shots.get(sh.id);
        const row = shotRow(p.id, i, sh);
        if (sp === undefined) { report.inserted++; touched.productions.add(p.id); insertRevivable(schema.shots, row, 'Shot'); }
        else if (sp !== hh) { report.updated++; touched.productions.add(p.id); ops.push(() => tx.update(schema.shots).set(row).where(eq(schema.shots.id, sh.id))); }
        else if (snap.positions.shots.get(sh.id) !== i) { touched.productions.add(p.id); ops.push(() => tx.update(schema.shots).set({ position: i }).where(eq(schema.shots.id, sh.id))); }
        for (let j = 0; j < sh.takes.length; j++) {
          const t = sh.takes[j]; seenT.add(t.id);
          const th = h(t); const tp = before.takes.get(t.id);
          const trow = takeRow(p.id, sh.id, j, t);
          if (tp === undefined) { report.inserted++; touched.productions.add(p.id); insertRevivable(schema.takes, trow, 'Take'); }
          else if (tp !== th) { report.updated++; touched.productions.add(p.id); ops.push(() => tx.update(schema.takes).set(trow).where(eq(schema.takes.id, t.id))); }
        }
      }
    }
    // what left the studio is tombstoned, never deleted; its production's version moves
    const parentOf = { takes: new Map<string, string>(), shots: new Map<string, string>(), scenes: new Map<string, string>() };
    for (const p of prev.productions) { for (const sc of p.scenes) parentOf.scenes.set(sc.id, p.id); for (const sh of p.shots) { parentOf.shots.set(sh.id, p.id); for (const t of sh.takes) parentOf.takes.set(t.id, p.id); } }
    for (const [table, seenIds, prevIds, parents] of [[schema.takes, seenT, before.takes, parentOf.takes], [schema.shots, seenSh, before.shots, parentOf.shots], [schema.scenes, seenSc, before.scenes, parentOf.scenes]] as const) {
      const gone = [...prevIds.keys()].filter((id) => !seenIds.has(id));
      for (const id of gone) { const pid = parents.get(id); if (pid) touched.productions.add(pid); }
      tombstone(table, gone);
    }
    const goneP = [...before.productions.keys()].filter((id) => !seenP.has(id));
    for (const id of goneP) removed.productions.add(id);
    tombstone(schema.productions, goneP);
  }

  // ---- assets that went away: nothing points at them any more ----
  if (goneAssets.length) { report.deleted += goneAssets.length; ops.push(() => tx.delete(schema.assets).where(inArray(schema.assets.id, goneAssets))); }

  // ---- settings ----
  if (loaded.settings && h(after.settings) !== before.settings) {
    settingsChanged = true; report.updated++;
    const now = new Date().toISOString();
    ops.push(() => tx.insert(schema.settings).values({ id: 'studio', data: after.settings, updatedAt: now }).onConflictDoUpdate({ target: schema.settings.id, set: { data: after.settings, updatedAt: now } }));
  }

  // ---- 1. assets and settings without a version: locked, then compared with what was loaded ----
  for (const id of [...changedAssets].sort()) {
    await tx.execute(dsql`select pg_advisory_xact_lock(hashtext(${`studio:asset:${id}`}))`);
    const [row] = await tx.select().from(schema.assets).where(eq(schema.assets.id, id));
    if (canonical(row ?? null) !== canonical(snap.rawAssets.get(id) ?? null)) throw new ScopedConflict(`asset ${id}`);
  }
  if (settingsChanged) {
    await tx.execute(dsql`select pg_advisory_xact_lock(hashtext('studio:settings'))`);
    const [row] = await tx.select({ data: schema.settings.data }).from(schema.settings).where(eq(schema.settings.id, 'studio'));
    if (canonical(row?.data ?? null) !== canonical(snap.rawSettings ?? null)) throw new ScopedConflict('settings');
  }
  // ---- 2. compare-and-set on every versioned aggregate that existed (sorted: no two batches wait on each other in
  //         opposite orders). A 0-row update: someone else moved it since it was loaded ----
  const cas = async (table: typeof schema.productions | typeof schema.shows | typeof schema.characters | typeof schema.locations, kind: string, ids: Iterable<string>, versions: Map<string, number>) => {
    for (const id of [...ids].sort()) {
      const v = versions.get(id);
      if (v === undefined) continue; // new in this batch
      const rows = await tx.update(table).set({ version: dsql`${table.version} + 1` }).where(and(eq(table.id, id), eq(table.version, v))).returning({ id: table.id });
      if (!rows.length) throw new ScopedConflict(`${kind} ${id} (version ${v})`);
    }
  };
  await cas(schema.productions, 'production', new Set([...touched.productions, ...removed.productions]), snap.versions.productions);
  await cas(schema.shows, 'show', new Set([...touched.shows, ...removed.shows]), snap.versions.shows);
  await cas(schema.characters, 'character', [...touched.characters].filter((id) => after.characters.some((c) => c.id === id)), snap.versions.characters);
  await cas(schema.locations, 'location', [...touched.locations].filter((id) => after.locations.some((l) => l.id === id)), snap.versions.locations);
  // ---- 3. the rows ----
  for (const op of ops) await op();
  // ---- 4. new aggregates start at version 1, as the whole-studio saver leaves them ----
  const fresh = <T extends typeof schema.productions | typeof schema.shows | typeof schema.characters | typeof schema.locations>(table: T, ids: string[], versions: Map<string, number>, exists: (id: string) => boolean) => {
    const news = ids.filter((id) => !versions.has(id) && exists(id));
    return news.length ? tx.update(table).set({ version: dsql`${table.version} + 1` } as never).where(inArray(table.id, news)) : Promise.resolve();
  };
  await fresh(schema.productions, [...touched.productions], snap.versions.productions, () => true);
  await fresh(schema.shows, [...touched.shows], snap.versions.shows, () => true);
  await fresh(schema.characters, [...touched.characters], snap.versions.characters, (id) => after.characters.some((c) => c.id === id));
  await fresh(schema.locations, [...touched.locations], snap.versions.locations, (id) => after.locations.some((l) => l.id === id));
  return { ...report, touched: { productions: [...touched.productions], shows: [...touched.shows], characters: [...touched.characters], locations: [...touched.locations] }, assets: [...changedAssets], settings: settingsChanged };
}
