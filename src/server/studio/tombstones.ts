import { and, desc, eq, inArray, isNotNull, sql as dsql } from 'drizzle-orm';
import { StudioError } from '@/domain/errors';
import { db, schema } from '../db/client';
import { log } from '../log';
import { notifyChange } from './engine';

/** RECOVERING WHAT WAS REMOVED (docs/BACKEND-AUDIT-2026-10.md C4, step 10). The studio never deletes a show, season,
 *  production, scene, shot or take: removing one tombstones it (src/server/studio/persist.ts) — the producer's rule is
 *  that a failed or replaced story step, a deleted scene or production, never destroys generated work. This module
 *  lists the tombstones and brings them back:
 *  - a TAKE comes back to its shot (and the shot, scene and production with it, when they were removed too);
 *  - a SHOT, SCENE or PRODUCTION comes back with everything the same change removed with it (the same deletion
 *    instant: a deleted scene's shots and their takes), never with what an earlier, separate removal took.
 *  A take whose media file record the producer deleted on purpose (DELETE /api/assets) cannot come back; it is
 *  reported, not restored. Restored rows rejoin the studio as they were (ids, provenance, ratings, positions). */

export type DeletedKind = 'production' | 'scene' | 'shot' | 'take';
export const DELETED_KINDS: readonly DeletedKind[] = ['production', 'scene', 'shot', 'take'];

export interface DeletedItem { kind: DeletedKind; id: string; productionId: string; label: string; deletedAt: string; deletedBy: string | null; takes: number }


/** The tombstones, newest first (one production's, or all). `takes`: how many takes the item holds. */
export async function listDeleted(opts: { productionId?: string; limit?: number } = {}): Promise<DeletedItem[]> {
  const limit = Math.min(500, opts.limit ?? 200);
  const byP = <T extends { productionId: unknown }>(t: T) => (opts.productionId ? eq(t.productionId as never, opts.productionId) : undefined);
  const [productions, scenes, shots, takes] = await Promise.all([
    db().select({ id: schema.productions.id, title: schema.productions.title, deletedAt: schema.productions.deletedAt, deletedBy: schema.productions.deletedBy }).from(schema.productions).where(and(isNotNull(schema.productions.deletedAt), opts.productionId ? eq(schema.productions.id, opts.productionId) : undefined)).orderBy(desc(schema.productions.deletedAt)).limit(limit),
    db().select({ id: schema.scenes.id, productionId: schema.scenes.productionId, number: schema.scenes.number, title: schema.scenes.title, deletedAt: schema.scenes.deletedAt, deletedBy: schema.scenes.deletedBy }).from(schema.scenes).where(and(isNotNull(schema.scenes.deletedAt), byP(schema.scenes))).orderBy(desc(schema.scenes.deletedAt)).limit(limit),
    db().select({ id: schema.shots.id, productionId: schema.shots.productionId, sceneId: schema.shots.sceneId, number: schema.shots.number, purpose: schema.shots.purpose, deletedAt: schema.shots.deletedAt, deletedBy: schema.shots.deletedBy }).from(schema.shots).where(and(isNotNull(schema.shots.deletedAt), byP(schema.shots))).orderBy(desc(schema.shots.deletedAt)).limit(limit),
    db().select({ id: schema.takes.id, productionId: schema.takes.productionId, shotId: schema.takes.shotId, label: schema.takes.label, deletedAt: schema.takes.deletedAt, deletedBy: schema.takes.deletedBy }).from(schema.takes).where(and(isNotNull(schema.takes.deletedAt), byP(schema.takes))).orderBy(desc(schema.takes.deletedAt)).limit(limit),
  ]);
  const takesIn = (pred: (t: (typeof takes)[number]) => boolean) => takes.filter(pred).length;
  const shotOf = new Map(shots.map((s) => [s.id, s]));
  const items: DeletedItem[] = [
    ...productions.map((p) => ({ kind: 'production' as const, id: p.id, productionId: p.id, label: p.title, deletedAt: p.deletedAt!, deletedBy: p.deletedBy, takes: takesIn((t) => t.productionId === p.id) })),
    ...scenes.map((s) => ({ kind: 'scene' as const, id: s.id, productionId: s.productionId, label: `Scene ${s.number}: ${s.title}`, deletedAt: s.deletedAt!, deletedBy: s.deletedBy, takes: takesIn((t) => shotOf.get(t.shotId)?.sceneId === s.id) })),
    ...shots.map((s) => ({ kind: 'shot' as const, id: s.id, productionId: s.productionId, label: `Shot ${s.number}${s.purpose ? `: ${s.purpose.slice(0, 60)}` : ''}`, deletedAt: s.deletedAt!, deletedBy: s.deletedBy, takes: takesIn((t) => t.shotId === s.id) })),
    ...takes.map((t) => ({ kind: 'take' as const, id: t.id, productionId: t.productionId, label: t.label, deletedAt: t.deletedAt!, deletedBy: t.deletedBy, takes: 1 })),
  ];
  return items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)).slice(0, limit);
}

export interface RestoreReport { restored: { shows: string[]; seasons: string[]; productions: string[]; scenes: string[]; shots: string[]; takes: string[] }; skipped: Array<{ takeId: string; reason: string }>; version: number }

const live = { deletedAt: null, deletedBy: null };
const same = (a: string | null, b: string | null) => a !== null && b !== null && new Date(a).getTime() === new Date(b).getTime();

/** Bring a tombstoned production, scene, shot or take back, with what the same removal took and the parents it needs. */
export async function restoreDeleted(kind: DeletedKind, id: string): Promise<RestoreReport> {
  if (!DELETED_KINDS.includes(kind)) throw new StudioError('INVALID', `Nothing of kind ${String(kind)} can be restored; restore a production, scene, shot or take.`);
  const out = await db().transaction(async (tx) => {
    await tx.execute(dsql`select pg_advisory_xact_lock(hashtext('vewbox-studio'))`);
    const report: RestoreReport = { restored: { shows: [], seasons: [], productions: [], scenes: [], shots: [], takes: [] }, skipped: [], version: 0 };
    const takeIds: string[] = []; const shotIds: string[] = []; const sceneIds: string[] = []; let productionId: string;
    if (kind === 'take') {
      const [t] = await tx.select().from(schema.takes).where(eq(schema.takes.id, id));
      if (!t) throw new StudioError('NOT_FOUND', `Take ${id} was not found.`, { id });
      if (!t.deletedAt) throw new StudioError('INVALID', `Take ${t.label} was not removed.`, { id });
      takeIds.push(t.id); shotIds.push(t.shotId); productionId = t.productionId;
    } else if (kind === 'shot') {
      const [sh] = await tx.select().from(schema.shots).where(eq(schema.shots.id, id));
      if (!sh) throw new StudioError('NOT_FOUND', `Shot ${id} was not found.`, { id });
      if (!sh.deletedAt) throw new StudioError('INVALID', `Shot ${sh.number} was not removed.`, { id });
      shotIds.push(sh.id); sceneIds.push(sh.sceneId); productionId = sh.productionId;
      takeIds.push(...(await tx.select({ id: schema.takes.id, deletedAt: schema.takes.deletedAt }).from(schema.takes).where(eq(schema.takes.shotId, sh.id))).filter((t) => same(t.deletedAt, sh.deletedAt)).map((t) => t.id));
    } else if (kind === 'scene') {
      const [sc] = await tx.select().from(schema.scenes).where(eq(schema.scenes.id, id));
      if (!sc) throw new StudioError('NOT_FOUND', `Scene ${id} was not found.`, { id });
      if (!sc.deletedAt) throw new StudioError('INVALID', `Scene ${sc.number} was not removed.`, { id });
      sceneIds.push(sc.id); productionId = sc.productionId;
      const shots = (await tx.select({ id: schema.shots.id, deletedAt: schema.shots.deletedAt }).from(schema.shots).where(eq(schema.shots.sceneId, sc.id))).filter((s) => same(s.deletedAt, sc.deletedAt));
      shotIds.push(...shots.map((s) => s.id));
      if (shots.length) takeIds.push(...(await tx.select({ id: schema.takes.id, deletedAt: schema.takes.deletedAt }).from(schema.takes).where(inArray(schema.takes.shotId, shots.map((s) => s.id)))).filter((t) => same(t.deletedAt, sc.deletedAt)).map((t) => t.id));
    } else {
      const [p] = await tx.select().from(schema.productions).where(eq(schema.productions.id, id));
      if (!p) throw new StudioError('NOT_FOUND', `Production ${id} was not found.`, { id });
      if (!p.deletedAt) throw new StudioError('INVALID', `“${p.title}” was not removed.`, { id });
      productionId = p.id;
      sceneIds.push(...(await tx.select({ id: schema.scenes.id, deletedAt: schema.scenes.deletedAt }).from(schema.scenes).where(eq(schema.scenes.productionId, p.id))).filter((x) => same(x.deletedAt, p.deletedAt)).map((x) => x.id));
      shotIds.push(...(await tx.select({ id: schema.shots.id, deletedAt: schema.shots.deletedAt }).from(schema.shots).where(eq(schema.shots.productionId, p.id))).filter((x) => same(x.deletedAt, p.deletedAt)).map((x) => x.id));
      takeIds.push(...(await tx.select({ id: schema.takes.id, deletedAt: schema.takes.deletedAt }).from(schema.takes).where(eq(schema.takes.productionId, p.id))).filter((x) => same(x.deletedAt, p.deletedAt)).map((x) => x.id));
    }
    // the parents a restored row needs: its shot's scene, the production, its season and show — whatever removed them
    if (shotIds.length) sceneIds.push(...(await tx.select({ sceneId: schema.shots.sceneId }).from(schema.shots).where(inArray(schema.shots.id, shotIds))).map((s) => s.sceneId));
    const [prod] = await tx.select({ id: schema.productions.id, showId: schema.productions.showId, seasonId: schema.productions.seasonId }).from(schema.productions).where(eq(schema.productions.id, productionId));
    // a take whose video asset the producer deleted on purpose cannot come back
    const takes = takeIds.length ? await tx.select({ id: schema.takes.id, assetId: schema.takes.assetId }).from(schema.takes).where(inArray(schema.takes.id, takeIds)) : [];
    const present = new Set(takes.length ? (await tx.select({ id: schema.assets.id }).from(schema.assets).where(inArray(schema.assets.id, takes.map((t) => t.assetId)))).map((a) => a.id) : []);
    for (const t of takes) if (!present.has(t.assetId)) report.skipped.push({ takeId: t.id, reason: `its video (${t.assetId}) was deleted from the library` });
    const restorable = takes.filter((t) => present.has(t.assetId)).map((t) => t.id);
    if (kind === 'take' && restorable.length === 0) throw new StudioError('INVALID', `This take cannot be restored: ${report.skipped[0]?.reason ?? 'its media is gone'}.`, { id });
    const revive = async <T extends typeof schema.shows | typeof schema.seasons | typeof schema.productions | typeof schema.scenes | typeof schema.shots | typeof schema.takes>(table: T, ids: string[]) => {
      if (!ids.length) return [] as string[];
      return (await tx.update(table).set(live as never).where(and(inArray(table.id, Array.from(new Set(ids))), isNotNull(table.deletedAt))).returning({ id: table.id })).map((r) => r.id);
    };
    report.restored.shows = await revive(schema.shows, prod?.showId ? [prod.showId] : []);
    report.restored.seasons = await revive(schema.seasons, prod?.seasonId ? [prod.seasonId] : []);
    report.restored.productions = await revive(schema.productions, [productionId]);
    report.restored.scenes = await revive(schema.scenes, sceneIds);
    report.restored.shots = await revive(schema.shots, shotIds);
    report.restored.takes = await revive(schema.takes, restorable);
    // the characters of a restored take were in it again: their usage record says so
    if (report.restored.takes.length) await tx.update(schema.characterUsage).set({ status: 'IN_TAKE' }).where(and(inArray(schema.characterUsage.takeId, report.restored.takes), eq(schema.characterUsage.status, 'TAKE_REMOVED')));
    const now = new Date().toISOString();
    const rows = await tx.insert(schema.studioMeta).values({ id: 'studio', version: 1, updatedAt: now }).onConflictDoUpdate({ target: schema.studioMeta.id, set: { version: dsql`${schema.studioMeta.version} + 1`, updatedAt: now } }).returning({ version: schema.studioMeta.version });
    report.version = rows[0].version;
    return report;
  });
  log.info({ kind, id, restored: out.restored, skipped: out.skipped }, 'restored from tombstones');
  await notifyChange(out.version, 'restore');
  return out;
}

