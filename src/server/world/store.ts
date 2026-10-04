import { and, desc, eq, sql as dsql } from 'drizzle-orm';
import type { WorldBible, WorldPin, WorldRead, WorldRevision, WorldScope } from '@/domain/types';
import { nid } from '@/domain/ids';
import { canonical, hashString } from '@/domain/hash';
import { diffWorld, hashWorld, scopeKey } from '@/domain/world';
import { db, schema } from '../db/client';
import { assertLeaseHeld, fenced } from '../jobs/fence';

/** WORLD BIBLE STORAGE — append-only rows (src/server/db/schema.ts): revisions per scope, pins per production, reads
 *  per take, audio timelines per production. Nothing here updates or deletes a row. Writes that number a sequence
 *  (a revision, an audio timeline) take a per-scope advisory lock, so parallel jobs never collide on a number, and
 *  identical content is not written twice. */

type RevisionRow = typeof schema.worldRevisions.$inferSelect;
type PinRow = typeof schema.worldPins.$inferSelect;

const toRevision = (r: RevisionRow): WorldRevision => ({ id: r.id, scopeKey: r.scopeKey, number: r.number, parentId: r.parentId ?? undefined, author: { kind: r.authorKind as WorldRevision['author']['kind'], id: r.authorId }, reason: r.reason, changes: r.changes, hash: r.hash, bible: r.bible, jobId: r.jobId ?? undefined, createdAt: r.createdAt });
const toPin = (r: PinRow): WorldPin => ({ id: r.id, productionId: r.productionId, revisionId: r.revisionId, revisionNumber: r.revisionNumber, scopeKey: r.scopeKey, reason: r.reason as WorldPin['reason'], approvalId: r.approvalId ?? undefined, diff: r.diff, by: r.by, jobId: r.jobId ?? undefined, createdAt: r.createdAt });

export async function latestRevision(key: string): Promise<WorldRevision | undefined> {
  const rows = await db().select().from(schema.worldRevisions).where(eq(schema.worldRevisions.scopeKey, key)).orderBy(desc(schema.worldRevisions.number)).limit(1);
  return rows[0] ? toRevision(rows[0]) : undefined;
}

export async function revisionById(id: string): Promise<WorldRevision | undefined> {
  const rows = await db().select().from(schema.worldRevisions).where(eq(schema.worldRevisions.id, id)).limit(1);
  return rows[0] ? toRevision(rows[0]) : undefined;
}

/** Append the next revision of a scope: `build` gets the latest revision (or none) and returns the next bible. Under
 *  the scope's lock; a bible identical to the latest (same hash) is not written and the latest comes back. */
export async function appendRevision(scope: WorldScope, build: (latest: WorldRevision | undefined) => WorldBible, meta: { author: WorldRevision['author']; reason: string; jobId?: string }): Promise<{ revision: WorldRevision; created: boolean }> {
  const key = scopeKey(scope);
  return db().transaction(async (tx) => {
    await tx.execute(dsql`select pg_advisory_xact_lock(hashtext(${`world:${key}`}))`);
    await assertLeaseHeld(tx, 'world revision');
    const rows = await tx.select().from(schema.worldRevisions).where(eq(schema.worldRevisions.scopeKey, key)).orderBy(desc(schema.worldRevisions.number)).limit(1);
    const latest = rows[0] ? toRevision(rows[0]) : undefined;
    const next = build(latest);
    const hash = hashWorld(next);
    if (latest && latest.hash === hash) return { revision: latest, created: false };
    const row: RevisionRow = { id: nid('wrev'), scopeKey: key, showId: scope.kind === 'SHOW' ? scope.showId : null, productionId: scope.kind === 'PRODUCTION' ? scope.productionId : null, number: (latest?.number ?? 0) + 1, parentId: latest?.id ?? null, authorKind: meta.author.kind, authorId: meta.author.id, reason: meta.reason, changes: diffWorld(latest?.bible, next), hash, bible: next, jobId: meta.jobId ?? null, createdAt: new Date().toISOString() };
    await tx.insert(schema.worldRevisions).values(row);
    return { revision: toRevision(row), created: true };
  });
}

/** A production's pin: the latest pin row, or none. */
export async function currentPin(productionId: string): Promise<WorldPin | undefined> {
  const rows = await db().select().from(schema.worldPins).where(eq(schema.worldPins.productionId, productionId)).orderBy(desc(schema.worldPins.createdAt), desc(schema.worldPins.id)).limit(1);
  return rows[0] ? toPin(rows[0]) : undefined;
}

export async function pinHistory(productionId: string): Promise<WorldPin[]> {
  return (await db().select().from(schema.worldPins).where(eq(schema.worldPins.productionId, productionId)).orderBy(desc(schema.worldPins.createdAt))).map(toPin);
}

export async function appendPin(pin: Omit<WorldPin, 'id' | 'createdAt'>): Promise<WorldPin> {
  const row: PinRow = { id: nid('wpin'), productionId: pin.productionId, revisionId: pin.revisionId, revisionNumber: pin.revisionNumber, scopeKey: pin.scopeKey, reason: pin.reason, approvalId: pin.approvalId ?? null, diff: pin.diff, by: pin.by, jobId: pin.jobId ?? null, createdAt: new Date().toISOString() };
  await fenced('world pin', (tx) => tx.insert(schema.worldPins).values(row));
  return toPin(row);
}

export type WorldReadRecord = { productionId: string; read: WorldRead; jobId?: string; jobType: string; shotId?: string; takeId?: string };

/** The read's row, in the caller's transaction (a take's result commit writes it with the take, step 6). */
export async function insertWorldRead(tx: Pick<ReturnType<typeof db>, 'insert'>, r: WorldReadRecord): Promise<void> {
  await tx.insert(schema.worldReads).values({ productionId: r.productionId, revisionId: r.read.revisionId, revisionNumber: r.read.revisionNumber, pinned: r.read.pinned, jobId: r.jobId ?? null, jobType: r.jobType, shotId: r.shotId ?? null, takeId: r.takeId ?? null, read: r.read, createdAt: new Date().toISOString() });
}

export async function recordWorldRead(r: WorldReadRecord): Promise<void> {
  await fenced('world read', (tx) => insertWorldRead(tx, r));
}

export async function worldReads(filter: { takeId?: string; productionId?: string }): Promise<Array<{ productionId: string; revisionId: string; revisionNumber: number; pinned: boolean; jobType: string; shotId: string | null; takeId: string | null; read: WorldRead }>> {
  const where = filter.takeId ? eq(schema.worldReads.takeId, filter.takeId) : filter.productionId ? eq(schema.worldReads.productionId, filter.productionId) : undefined;
  return db().select({ productionId: schema.worldReads.productionId, revisionId: schema.worldReads.revisionId, revisionNumber: schema.worldReads.revisionNumber, pinned: schema.worldReads.pinned, jobType: schema.worldReads.jobType, shotId: schema.worldReads.shotId, takeId: schema.worldReads.takeId, read: schema.worldReads.read }).from(schema.worldReads).where(where).orderBy(desc(schema.worldReads.id));
}

/** Store a production's audio timeline as a new revision when it differs from the last one. */
export async function saveAudioTimeline(productionId: string, timeline: Record<string, unknown>, meta: { cutAssetId?: string; jobId?: string } = {}): Promise<{ revision: number; created: boolean }> {
  const hash = hashString(canonical(timeline));
  return db().transaction(async (tx) => {
    await tx.execute(dsql`select pg_advisory_xact_lock(hashtext(${`audio-timeline:${productionId}`}))`);
    await assertLeaseHeld(tx, 'audio timeline');
    const rows = await tx.select({ revision: schema.audioTimelines.revision, hash: schema.audioTimelines.hash }).from(schema.audioTimelines).where(eq(schema.audioTimelines.productionId, productionId)).orderBy(desc(schema.audioTimelines.revision)).limit(1);
    if (rows[0]?.hash === hash) return { revision: rows[0].revision, created: false };
    const revision = (rows[0]?.revision ?? 0) + 1;
    await tx.insert(schema.audioTimelines).values({ id: nid('atl'), productionId, revision, hash, timeline, cutAssetId: meta.cutAssetId ?? null, jobId: meta.jobId ?? null, createdAt: new Date().toISOString() });
    return { revision, created: true };
  });
}

export async function latestAudioTimeline(productionId: string): Promise<{ revision: number; timeline: Record<string, unknown>; cutAssetId: string | null } | undefined> {
  const rows = await db().select({ revision: schema.audioTimelines.revision, timeline: schema.audioTimelines.timeline, cutAssetId: schema.audioTimelines.cutAssetId }).from(schema.audioTimelines).where(and(eq(schema.audioTimelines.productionId, productionId))).orderBy(desc(schema.audioTimelines.revision)).limit(1);
  return rows[0];
}
