import { and, eq, inArray, isNull, sql as dsql } from 'drizzle-orm';
import type { Asset, Character, Production, Scene, Shot, StudioState, Take, VideoUsage } from '@/domain/types';
import { canonical, hashString } from '@/domain/hash';
import { schema, type Db } from '../db/client';
import type { RowHashes } from './snapshot';
import { canonicalToColumns } from './canonical-image';

/** WRITING THE STUDIO — compare the state after a command with the fingerprints taken on load, then insert, update
 *  and delete only the rows that changed. Everything runs inside the caller's transaction. */

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
const h = (v: unknown) => hashString(canonical(v));
const nul = <T>(v: T | undefined): T | null => (v === undefined ? null : v);

export interface PersistReport { inserted: number; updated: number; deleted: number }

function parsePoster(poster: string | undefined): { posterAssetId: string | null; posterPath: string | null } {
  if (!poster) return { posterAssetId: null, posterPath: null };
  const m = /^\/api\/media\/([^/?#]+)/.exec(poster);
  if (m) return { posterAssetId: m[1], posterPath: null };
  return { posterAssetId: null, posterPath: poster.replace(/^\/+/, '') };
}

export function assetRow(a: Asset & { storage?: string; path?: string }) {
  // src is derived: /sample/... (PUBLIC) or /api/media/{id} (LIBRARY). A library row needs its path on insert; the
  // asset's provenance carries it under `path` when the server created it.
  const isPublic = a.src.startsWith('/sample/') || a.src.startsWith('/public/');
  const path = a.path ?? (isPublic ? a.src.replace(/^\/+/, '') : (a.provenance?.path as string | undefined) ?? '');
  const poster = parsePoster(a.poster);
  const thumb = a.thumb ? { path: a.thumb.path, width: a.thumb.width, height: a.thumb.height, bytes: a.thumb.bytes } : null;
  return { id: a.id, kind: a.kind, storage: a.storage ?? (isPublic ? 'PUBLIC' : 'LIBRARY'), path, posterAssetId: poster.posterAssetId, posterPath: poster.posterPath, label: a.label, width: nul(a.width), height: nul(a.height), durationSeconds: nul(a.durationSeconds), fps: nul(a.fps), tags: a.tags, sample: a.sample, origin: a.origin, mimeType: nul(a.mimeType), bytes: nul(a.bytes), sha256: nul(a.sha256), provenance: nul(a.provenance), jobId: nul(a.jobId), unavailable: Boolean(a.unavailable), tier: nul(a.tier), presentation: nul(a.presentation), thumb, createdAt: a.createdAt };
}

/** A usage record as its row (the fact is written once; later saves only mark it). */
export function usageRow(characterId: string, v: VideoUsage) {
  return { characterId, productionId: v.productionId, productionTitle: v.productionTitle, shotId: v.shotId, shotLabel: v.shotLabel, takeId: v.takeId, takeLabel: v.takeLabel, recordedAt: v.recordedAt, status: v.status, canonicalImageVersion: nul(v.canonicalImageVersion) };
}

/** `deletedBy`: what removed the rows this save takes out of the studio (the batch's commands) — recorded on their
 *  tombstones. Shows, seasons, productions, scenes, shots and takes are never deleted here (docs/BACKEND-AUDIT-2026-10.md
 *  C4, step 10): a row that left the state is TOMBSTONED (`deleted_at` set, one instant for the whole save, so a
 *  restore can bring back exactly what one change removed), and a row that comes back under the same id is revived.
 *  Characters, locations and assets are deleted as before (an asset only by the producer's explicit deletion). */
export interface PersistOptions { deletedBy?: string }

export async function persistState(tx: Tx, before: RowHashes, state: StudioState, opts: PersistOptions = {}): Promise<PersistReport> {
  const report: PersistReport = { inserted: 0, updated: 0, deleted: 0 };
  const deletedAt = new Date().toISOString();
  const deletedBy = (opts.deletedBy ?? 'studio').slice(0, 200);
  const live = { deletedAt: null, deletedBy: null };
  type Tombstoned = typeof schema.shows | typeof schema.seasons | typeof schema.productions | typeof schema.scenes | typeof schema.shots | typeof schema.takes;
  const tombstone = async (table: Tombstoned, ids: string[]): Promise<string[]> => {
    if (!ids.length) return [];
    const parent = 'productionId' in table ? table.productionId : 'showId' in table ? table.showId : table.id;
    const rows = await tx.update(table).set({ deletedAt, deletedBy }).where(and(inArray(table.id, ids), isNull(table.deletedAt))).returning({ parent });
    report.deleted += ids.length;
    return rows.map((r) => String(r.parent));
  };
  // AGGREGATE VERSIONS (docs/BACKEND-AUDIT-2026-10.md H3, step 11): every aggregate this save changes moves on by one —
  // a production with its scenes, shots and takes; a show with its seasons; a character; a location
  const touched = { productions: new Set<string>(), shows: new Set<string>(), characters: new Set<string>(), locations: new Set<string>() };

  // ---- assets (first: other rows point at them — characters' canonical image column with a foreign key) ----
  // Rows that went away are deleted LAST, after every row that pointed at them has been rewritten or deleted.
  const goneAssets: string[] = [];
  {
    const seen = new Set<string>();
    for (const a of state.assets) {
      seen.add(a.id);
      const hash = h(a);
      const prev = before.assets.get(a.id);
      if (prev === hash) continue;
      const row = assetRow(a);
      if (prev === undefined) { await tx.insert(schema.assets).values(row).onConflictDoUpdate({ target: schema.assets.id, set: row }); report.inserted++; }
      else { const { id: _id, storage: _s, path: _p, ...set } = row; void _id; void _s; void _p; await tx.update(schema.assets).set(set).where(eq(schema.assets.id, a.id)); report.updated++; }
    }
    goneAssets.push(...[...before.assets.keys()].filter((id) => !seen.has(id)));
  }

  // ---- shows ----
  {
    const seen = new Set<string>();
    for (const s of state.shows) {
      seen.add(s.id);
      const hash = h(s); const prev = before.shows.get(s.id);
      if (prev === hash) continue;
      touched.shows.add(s.id);
      const row = { id: s.id, title: s.title, titleAr: nul(s.titleAr), logline: s.logline, genre: s.genre, style: s.style, language: s.language, dialect: nul(s.dialect), aspect: s.aspect, synopsis: nul(s.synopsis), coverAssetId: nul(s.coverAssetId), posterAssetId: nul(s.posterAssetId), castIds: s.castIds, locationIds: s.locationIds, bible: nul(s.bible), createdAt: s.createdAt, updatedAt: s.updatedAt };
      if (prev === undefined) { await tx.insert(schema.shows).values(row).onConflictDoUpdate({ target: schema.shows.id, set: { ...row, ...live } }); report.inserted++; } else { await tx.update(schema.shows).set(row).where(eq(schema.shows.id, s.id)); report.updated++; }
    }
    await tombstone(schema.shows, [...before.shows.keys()].filter((id) => !seen.has(id)));
  }

  // ---- seasons ----
  {
    const seen = new Set<string>();
    for (const s of state.seasons) {
      seen.add(s.id);
      const hash = h(s); const prev = before.seasons.get(s.id);
      if (prev === hash) continue;
      touched.shows.add(s.showId);
      const row = { id: s.id, showId: s.showId, number: s.number, title: s.title, arc: s.arc, createdAt: s.createdAt };
      if (prev === undefined) { await tx.insert(schema.seasons).values(row).onConflictDoUpdate({ target: schema.seasons.id, set: { ...row, ...live } }); report.inserted++; } else { await tx.update(schema.seasons).set(row).where(eq(schema.seasons.id, s.id)); report.updated++; }
    }
    for (const showId of await tombstone(schema.seasons, [...before.seasons.keys()].filter((id) => !seen.has(id)))) touched.shows.add(showId);
  }

  // ---- characters (+ usage) ----
  {
    const seen = new Set<string>();
    for (const c of state.characters) {
      seen.add(c.id);
      const hash = h({ ...c, usage: { known: c.usage?.known ?? false } }); const prev = before.characters.get(c.id);
      if (prev !== hash) {
        touched.characters.add(c.id);
        const row = characterRow(c);
        if (prev === undefined) { await tx.insert(schema.characters).values(row); report.inserted++; } else { await tx.update(schema.characters).set(row).where(eq(schema.characters.id, c.id)); report.updated++; }
      }
      for (const v of c.usage?.videos ?? []) {
        const key = `${c.id}|${v.shotId}|${v.takeId}`;
        const vh = h(v); const vprev = before.usage.get(key);
        if (vprev === vh) continue;
        const row = usageRow(c.id, v);
        if (vprev === undefined) { await tx.insert(schema.characterUsage).values(row).onConflictDoUpdate({ target: [schema.characterUsage.characterId, schema.characterUsage.shotId, schema.characterUsage.takeId], set: { status: v.status, productionTitle: v.productionTitle } }); report.inserted++; }
        else { await tx.update(schema.characterUsage).set({ status: v.status, productionTitle: v.productionTitle, takeLabel: v.takeLabel, shotLabel: v.shotLabel }).where(and(eq(schema.characterUsage.characterId, c.id), eq(schema.characterUsage.shotId, v.shotId), eq(schema.characterUsage.takeId, v.takeId))); report.updated++; }
      }
      // usage rows are never deleted while the character exists
    }
    const gone = [...before.characters.keys()].filter((id) => !seen.has(id));
    if (gone.length) { await tx.delete(schema.characters).where(inArray(schema.characters.id, gone)); report.deleted += gone.length; }
  }

  // ---- locations ----
  {
    const seen = new Set<string>();
    for (const l of state.locations) {
      seen.add(l.id);
      const hash = h(l); const prev = before.locations.get(l.id);
      if (prev === hash) continue;
      touched.locations.add(l.id);
      const row = { id: l.id, name: l.name, nameAr: nul(l.nameAr), kind: l.kind, description: l.description, style: l.style, lighting: l.lighting, landmarks: l.landmarks, props: l.props, refs: l.refs, masterAssetId: nul(l.masterAssetId), layout: nul(l.layout), createdAt: l.createdAt, updatedAt: l.updatedAt };
      if (prev === undefined) { await tx.insert(schema.locations).values(row); report.inserted++; } else { await tx.update(schema.locations).set(row).where(eq(schema.locations.id, l.id)); report.updated++; }
    }
    const gone = [...before.locations.keys()].filter((id) => !seen.has(id));
    if (gone.length) { await tx.delete(schema.locations).where(inArray(schema.locations.id, gone)); report.deleted += gone.length; }
  }

  // ---- productions, scenes, shots, takes ----
  {
    const seenP = new Set<string>(); const seenSc = new Set<string>(); const seenSh = new Set<string>(); const seenT = new Set<string>();
    for (const p of state.productions) {
      seenP.add(p.id);
      const hash = h({ ...p, scenes: undefined, shots: undefined }); const prev = before.productions.get(p.id);
      if (prev !== hash) {
        touched.productions.add(p.id);
        const row = productionRow(p);
        if (prev === undefined) { await tx.insert(schema.productions).values(row).onConflictDoUpdate({ target: schema.productions.id, set: { ...row, ...live } }); report.inserted++; } else { await tx.update(schema.productions).set(row).where(eq(schema.productions.id, p.id)); report.updated++; }
      }
      // scenes first (shots reference them)
      for (let i = 0; i < p.scenes.length; i++) {
        const sc = p.scenes[i]; seenSc.add(sc.id);
        const sh = h(sc); const sprev = before.scenes.get(sc.id);
        const row = sceneRow(p.id, i, sc);
        if (sprev === undefined) { await tx.insert(schema.scenes).values(row).onConflictDoUpdate({ target: schema.scenes.id, set: { ...row, ...live } }); report.inserted++; touched.productions.add(p.id); }
        else if (sprev !== sh) { await tx.update(schema.scenes).set(row).where(eq(schema.scenes.id, sc.id)); report.updated++; touched.productions.add(p.id); }
        else if ((await tx.update(schema.scenes).set({ position: i }).where(and(eq(schema.scenes.id, sc.id), dsql`${schema.scenes.position} <> ${i}`)).returning({ id: schema.scenes.id })).length) touched.productions.add(p.id);
      }
    }
    // shots after every scene of every production exists
    for (const p of state.productions) {
      for (let i = 0; i < p.shots.length; i++) {
        const sh = p.shots[i]; seenSh.add(sh.id);
        const hh = h({ ...sh, takes: undefined }); const sprev = before.shots.get(sh.id);
        const row = shotRow(p.id, i, sh);
        if (sprev === undefined) { await tx.insert(schema.shots).values(row).onConflictDoUpdate({ target: schema.shots.id, set: { ...row, ...live } }); report.inserted++; touched.productions.add(p.id); }
        else if (sprev !== hh) { await tx.update(schema.shots).set(row).where(eq(schema.shots.id, sh.id)); report.updated++; touched.productions.add(p.id); }
        else if ((await tx.update(schema.shots).set({ position: i }).where(and(eq(schema.shots.id, sh.id), dsql`${schema.shots.position} <> ${i}`)).returning({ id: schema.shots.id })).length) touched.productions.add(p.id);
        for (let j = 0; j < sh.takes.length; j++) {
          const t = sh.takes[j]; seenT.add(t.id);
          const th = h(t); const tprev = before.takes.get(t.id);
          const trow = takeRow(p.id, sh.id, j, t);
          if (tprev === undefined) { await tx.insert(schema.takes).values(trow).onConflictDoUpdate({ target: schema.takes.id, set: { ...trow, ...live } }); report.inserted++; touched.productions.add(p.id); }
          else if (tprev !== th) { await tx.update(schema.takes).set(trow).where(eq(schema.takes.id, t.id)); report.updated++; touched.productions.add(p.id); }
        }
      }
    }
    // what left the studio is tombstoned, never deleted: a take, its media and its provenance stay recoverable
    for (const table of [schema.takes, schema.shots, schema.scenes] as const) {
      const seenIds = table === schema.takes ? seenT : table === schema.shots ? seenSh : seenSc;
      const prevIds = table === schema.takes ? before.takes : table === schema.shots ? before.shots : before.scenes;
      for (const productionId of await tombstone(table, [...prevIds.keys()].filter((id) => !seenIds.has(id)))) touched.productions.add(productionId);
    }
    await tombstone(schema.productions, [...before.productions.keys()].filter((id) => !seenP.has(id)));
  }

  // ---- assets that went away: nothing points at them any more ----
  if (goneAssets.length) { await tx.delete(schema.assets).where(inArray(schema.assets.id, goneAssets)); report.deleted += goneAssets.length; }

  // ---- the versions of what changed ----
  if (touched.productions.size) await tx.update(schema.productions).set({ version: dsql`${schema.productions.version} + 1` }).where(inArray(schema.productions.id, [...touched.productions]));
  if (touched.shows.size) await tx.update(schema.shows).set({ version: dsql`${schema.shows.version} + 1` }).where(inArray(schema.shows.id, [...touched.shows]));
  if (touched.characters.size) await tx.update(schema.characters).set({ version: dsql`${schema.characters.version} + 1` }).where(inArray(schema.characters.id, [...touched.characters]));
  if (touched.locations.size) await tx.update(schema.locations).set({ version: dsql`${schema.locations.version} + 1` }).where(inArray(schema.locations.id, [...touched.locations]));

  // ---- settings ----
  if (h(state.settings) !== before.settings) {
    const now = new Date().toISOString();
    await tx.insert(schema.settings).values({ id: 'studio', data: state.settings, updatedAt: now }).onConflictDoUpdate({ target: schema.settings.id, set: { data: state.settings, updatedAt: now } });
    report.updated++;
  }

  return report;
}

export function characterRow(c: Character) {
  return { id: c.id, name: c.name, nameAr: nul(c.nameAr), role: c.role, style: c.style, sex: c.sex, species: nul(c.species), ageYears: c.ageYears, build: c.build, face: c.face, hair: c.hair, skin: c.skin, eyes: c.eyes, distinguishing: c.distinguishing, wardrobe: c.wardrobe, personality: c.personality, language: c.language, dialect: nul(c.dialect), voice: c.voice, refs: c.refs, portraitAssetId: nul(c.portraitAssetId), usageKnown: c.usage?.known ?? false, pendingReference: nul(c.pendingReference), canon: nul(c.canon), notes: nul(c.notes), ...canonicalToColumns(c.canonicalImage), createdAt: c.createdAt, updatedAt: c.updatedAt };
}
export function productionRow(p: Production) {
  return { id: p.id, kind: p.kind, showId: nul(p.showId), seasonId: nul(p.seasonId), episodeNumber: nul(p.episodeNumber), title: p.title, titleAr: nul(p.titleAr), logline: p.logline, synopsis: p.synopsis, style: p.style, language: p.language, dialect: nul(p.dialect), aspect: p.aspect, targetSeconds: p.targetSeconds, stage: p.stage, brief: p.brief, castIds: p.castIds, locationIds: p.locationIds, song: nul(p.song), coverAssetId: nul(p.coverAssetId), posterAssetId: nul(p.posterAssetId), artist: nul(p.artist), concept: nul(p.concept), genre: nul(p.genre), mood: nul(p.mood), cutAssetId: nul(p.cutAssetId), cutStale: Boolean(p.cutStale), exports: nul(p.exports), framePosterAssetId: nul(p.framePosterAssetId), createdAt: p.createdAt, updatedAt: p.updatedAt };
}
export function sceneRow(productionId: string, position: number, sc: Scene) {
  return { id: sc.id, productionId, position, number: sc.number, title: sc.title, locationId: nul(sc.locationId), timeOfDay: sc.timeOfDay, characterIds: sc.characterIds, beats: sc.beats, purpose: nul(sc.purpose), emotionalObjective: nul(sc.emotionalObjective), entryState: nul(sc.entryState), exitState: nul(sc.exitState) };
}
export function shotRow(productionId: string, position: number, sh: Shot) {
  return { id: sh.id, productionId, sceneId: sh.sceneId, position, number: sh.number, purpose: sh.purpose, action: sh.action, framing: sh.framing, cameraMove: sh.cameraMove, durationSeconds: sh.durationSeconds, characterIds: sh.characterIds, dialogue: sh.dialogue, transition: sh.transition, openingFrameAssetId: nul(sh.openingFrameAssetId), endingFrameAssetId: nul(sh.endingFrameAssetId), selectedTakeId: nul(sh.selectedTakeId), songWindow: nul(sh.songWindow), performance: nul(sh.performance), notes: nul(sh.notes), continuity: nul(sh.continuity), prompt: nul(sh.prompt) };
}
export function takeRow(productionId: string, shotId: string, position: number, t: Take) {
  return { id: t.id, shotId, productionId, position, label: t.label, assetId: t.assetId, createdAt: t.createdAt, note: nul(t.note), status: t.status, provider: nul(t.provider), model: nul(t.model), requestId: nul(t.requestId), prompt: nul(t.prompt), params: nul(t.params), seed: nul(t.seed), references: nul(t.references), width: nul(t.width), height: nul(t.height), durationSeconds: nul(t.durationSeconds), fps: nul(t.fps), generationMs: nul(t.generationMs), costUsd: nul(t.costUsd), qa: nul(t.qa), rejectionReason: nul(t.rejectionReason), jobId: nul(t.jobId), codeVersion: nul(t.codeVersion), workflowVersion: nul(t.workflowVersion), thumbnailAssetId: nul(t.thumbnailAssetId), trimStartFrames: nul(t.trimStartFrames), soundtrack: nul(t.soundtrack), relation: nul(t.relation), continuesTakeId: nul(t.continuesTakeId), rating: nul(t.rating), ratingReason: nul(t.ratingReason), ratedBy: nul(t.ratedBy), ratedAt: nul(t.ratedAt) };
}
