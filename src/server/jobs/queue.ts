import { and, asc, desc, eq, inArray, isNull, lt, or, sql as dsql } from 'drizzle-orm';
import { z } from 'zod';
import { JOB_PAYLOADS, JOB_RESOURCE, type Job, type JobError, type JobEvent, type JobProgress, type JobStatus, type JobType, isActiveStatus, isTerminalStatus } from '@/domain/jobs';
import { StudioError } from '@/domain/errors';
import { nid } from '@/domain/ids';
import { db, schema } from '../db/client';
import { notifyJobs } from '../studio/engine';
import { log } from '../log';
import { assertIntakeOpen, intakeState } from './intake';

/** THE JOB QUEUE — Postgres is the broker. Enqueue inserts a row; a worker claims the oldest runnable row with
 *  `FOR UPDATE SKIP LOCKED` and holds a lease it renews by heartbeat; a lease that goes stale is reclaimed by the next
 *  worker. Retries back off exponentially. Cancellation is a flag the handler checks between steps. Idempotency
 *  keys stop a double submission from becoming a double MiniMax request. */

const undef = <T>(v: T | null): T | undefined => (v === null ? undefined : v);

export function rowToJob(r: typeof schema.jobs.$inferSelect): Job {
  return { id: r.id, type: r.type as JobType, status: r.status as JobStatus, priority: r.priority, payload: r.payload, result: undef(r.result), progress: undef(r.progress), error: undef(r.error), attempts: r.attempts, maxAttempts: r.maxAttempts, runAfter: undef(r.runAfter), startedAt: undef(r.startedAt), finishedAt: undef(r.finishedAt), heartbeatAt: undef(r.heartbeatAt), cancelRequested: r.cancelRequested, providerTaskId: undef(r.providerTaskId), parentId: undef(r.parentId), productionId: undef(r.productionId), sceneId: undef(r.sceneId), shotId: undef(r.shotId), takeId: undef(r.takeId), characterId: undef(r.characterId), locationId: undef(r.locationId), createdAt: r.createdAt, updatedAt: r.updatedAt };
}

export interface EnqueueInput<T extends JobType = JobType> { type: T; payload: unknown; priority?: number; maxAttempts?: number; idempotencyKey?: string; parentId?: string; runAfter?: string }

const DEFAULT_ATTEMPTS: Partial<Record<JobType, number>> = { GENERATE_TAKE: 3, GENERATE_SONG: 2, AUTO_IDEA: 3, DEVELOP_STORY: 3, WRITE_SCRIPT: 3, PLAN_SHOTS: 3, EXPORT: 2, ASSEMBLE: 2, PRODUCE: 1, EPISODE_CONTINUITY: 2, DESIGN_CHARACTER: 3, CREATE_CHARACTER: 1 };

/** WORKER LANES — which concurrency pool runs a job. Most follow the resource they use (JOB_RESOURCE). Orchestrators
 *  spend their life waiting for their children: they get a lane of their own (review finding 10), so a waiting chain
 *  never holds one of the CPU slots its own ASSEMBLE/EXPORT/MEDIA_PROBE children — or anyone else's — need. */
export type Lane = 'HOSTED' | 'LLM' | 'CPU' | 'GPU' | 'ORCHESTRATION';
export const ORCHESTRATION_LANE: { types: readonly JobType[]; limit: number } = { types: ['CREATE_CHARACTER', 'PRODUCE'], limit: 6 };
export const laneOf = (type: JobType): Lane => (ORCHESTRATION_LANE.types.includes(type) ? 'ORCHESTRATION' : JOB_RESOURCE[type]);

/** Jobs that work on one character and must never run twice at once for it: a second request while one is active
 *  gets the active job back (created: false), whatever key it carries. */
export const ONE_PER_CHARACTER: readonly JobType[] = ['VOICE_BUILD', 'CHARACTER_APPEARANCE', 'CHARACTER_REFS'];

/** Validate and insert. A matching idempotency key returns the existing job instead of a new one. */
export async function enqueue<T extends JobType>(input: EnqueueInput<T>): Promise<{ job: Job; created: boolean }> {
  const schemaFor = JOB_PAYLOADS[input.type] as z.ZodTypeAny | undefined;
  if (!schemaFor) throw new StudioError('INVALID', `Unknown job type ${input.type}`);
  const parsed = schemaFor.safeParse(input.payload);
  if (!parsed.success) throw new StudioError('INVALID', `Invalid payload for ${input.type}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  const p = parsed.data as Record<string, unknown>;
  await assertIntakeOpen();
  if (ONE_PER_CHARACTER.includes(input.type) && typeof p.characterId === 'string') {
    const active = await findActive(input.type, { characterId: p.characterId });
    if (active) return { job: active, created: false };
  }
  const now = new Date().toISOString();
  const row: typeof schema.jobs.$inferInsert = {
    id: nid('job'), type: input.type, status: 'QUEUED', priority: input.priority ?? 0, payload: p, attempts: 0, maxAttempts: input.maxAttempts ?? DEFAULT_ATTEMPTS[input.type] ?? 3,
    runAfter: input.runAfter ?? null, idempotencyKey: input.idempotencyKey ?? null, parentId: input.parentId ?? null,
    productionId: (p.productionId as string | undefined) ?? null, sceneId: (p.sceneId as string | undefined) ?? null, shotId: (p.shotId as string | undefined) ?? null, characterId: (p.characterId as string | undefined) ?? null, locationId: (p.locationId as string | undefined) ?? null,
    createdAt: now, updatedAt: now,
  };
  if (input.idempotencyKey) {
    const inserted = await db().insert(schema.jobs).values(row).onConflictDoNothing({ target: schema.jobs.idempotencyKey }).returning();
    if (inserted.length === 0) {
      const existing = await db().select().from(schema.jobs).where(eq(schema.jobs.idempotencyKey, input.idempotencyKey));
      return { job: rowToJob(existing[0]), created: false };
    }
    await notifyJobs(inserted[0].id, 'QUEUED');
    return { job: rowToJob(inserted[0]), created: true };
  }
  const inserted = await db().insert(schema.jobs).values(row).returning();
  await notifyJobs(inserted[0].id, 'QUEUED');
  await addEvent(inserted[0].id, 'info', 'queued');
  return { job: rowToJob(inserted[0]), created: true };
}

/** An active job for the same target of the same type, if any — the UI uses it to show one spinner, not two. */
export async function findActive(type: JobType, where: Partial<Pick<Job, 'productionId' | 'shotId' | 'characterId' | 'locationId'>>): Promise<Job | undefined> {
  const conds = [eq(schema.jobs.type, type), inArray(schema.jobs.status, ['QUEUED', 'PREPARING', 'GENERATING', 'DOWNLOADING', 'VALIDATING', 'POSTPROCESSING'])];
  if (where.productionId) conds.push(eq(schema.jobs.productionId, where.productionId));
  if (where.shotId) conds.push(eq(schema.jobs.shotId, where.shotId));
  if (where.characterId) conds.push(eq(schema.jobs.characterId, where.characterId));
  if (where.locationId) conds.push(eq(schema.jobs.locationId, where.locationId));
  const rows = await db().select().from(schema.jobs).where(and(...conds)).limit(1);
  return rows[0] ? rowToJob(rows[0]) : undefined;
}

/** Every child an orchestrator queued, newest first (active and finished alike), so a restarted run can adopt the
 *  ones still working and read the results of the ones that finished. */
export async function listChildren(parentId: string): Promise<Job[]> {
  const rows = await db().select().from(schema.jobs).where(eq(schema.jobs.parentId, parentId)).orderBy(desc(schema.jobs.createdAt)).limit(200);
  return rows.map(rowToJob);
}

export async function getJob(id: string): Promise<Job | undefined> {
  const rows = await db().select().from(schema.jobs).where(eq(schema.jobs.id, id));
  return rows[0] ? rowToJob(rows[0]) : undefined;
}

export async function listJobs(opts: { productionId?: string; activeOnly?: boolean; limit?: number; since?: string } = {}): Promise<Job[]> {
  const conds = [];
  if (opts.productionId) conds.push(eq(schema.jobs.productionId, opts.productionId));
  if (opts.activeOnly) conds.push(inArray(schema.jobs.status, ['QUEUED', 'PREPARING', 'GENERATING', 'DOWNLOADING', 'VALIDATING', 'POSTPROCESSING', 'AWAITING_REVIEW']));
  if (opts.since) conds.push(dsql`${schema.jobs.updatedAt} > ${opts.since}`);
  const rows = await db().select().from(schema.jobs).where(conds.length ? and(...conds) : undefined).orderBy(desc(schema.jobs.createdAt)).limit(opts.limit ?? 200);
  return rows.map(rowToJob);
}

export async function listEvents(jobId: string, limit = 200): Promise<JobEvent[]> {
  const rows = await db().select().from(schema.jobEvents).where(eq(schema.jobEvents.jobId, jobId)).orderBy(asc(schema.jobEvents.id)).limit(limit);
  return rows.map((r) => ({ id: r.id, jobId: r.jobId, at: r.at, level: r.level as JobEvent['level'], message: r.message, data: undef(r.data) }));
}

export async function addEvent(jobId: string, level: JobEvent['level'], message: string, data?: Record<string, unknown>) {
  try {
    await db().insert(schema.jobEvents).values({ jobId, at: new Date().toISOString(), level, message, data: data ?? null });
  } catch (e) {
    // the job row is gone (a reset cleared the history while the worker was still finishing): nothing to record
    if ((e as { code?: string }).code === '23503' || (e as { cause?: { code?: string } }).cause?.code === '23503') { log.info({ jobId, message }, 'event for a job that no longer exists'); return; }
    throw e;
  }
}

/** The user asks for a job to stop. Queued jobs stop at once; running jobs stop at their next checkpoint. */
export async function requestCancel(id: string): Promise<Job> {
  const job = await getJob(id);
  if (!job) throw new StudioError('NOT_FOUND', `Job ${id} not found`);
  if (isTerminalStatus(job.status)) return job;
  const now = new Date().toISOString();
  if (job.status === 'QUEUED') {
    await db().update(schema.jobs).set({ status: 'CANCELLED', cancelRequested: true, finishedAt: now, updatedAt: now }).where(and(eq(schema.jobs.id, id), eq(schema.jobs.status, 'QUEUED')));
    await addEvent(id, 'info', 'cancelled before it started');
  } else {
    await db().update(schema.jobs).set({ cancelRequested: true, updatedAt: now }).where(eq(schema.jobs.id, id));
    await addEvent(id, 'info', 'cancel requested');
  }
  // children follow the parent
  const children = await db().select({ id: schema.jobs.id }).from(schema.jobs).where(and(eq(schema.jobs.parentId, id), inArray(schema.jobs.status, ['QUEUED', 'PREPARING', 'GENERATING', 'DOWNLOADING', 'VALIDATING', 'POSTPROCESSING'])));
  for (const c of children) await requestCancel(c.id);
  await notifyJobs(id, 'CANCEL_REQUESTED');
  return (await getJob(id))!;
}

/** Re-run a failed or cancelled job as a new attempt of the same row. */
export async function retry(id: string): Promise<Job> {
  const job = await getJob(id);
  if (!job) throw new StudioError('NOT_FOUND', `Job ${id} not found`);
  if (!(job.status === 'FAILED' || job.status === 'CANCELLED')) throw new StudioError('CONFLICT', 'Only a failed or cancelled job can be retried.');
  const now = new Date().toISOString();
  await db().update(schema.jobs).set({ status: 'QUEUED', cancelRequested: false, error: null, progress: null, runAfter: null, lockedBy: null, lockedAt: null, heartbeatAt: null, startedAt: null, finishedAt: null, maxAttempts: Math.max(job.maxAttempts, job.attempts + 1), updatedAt: now }).where(eq(schema.jobs.id, id));
  await addEvent(id, 'info', 'retry requested');
  await notifyJobs(id, 'QUEUED');
  return (await getJob(id))!;
}

// ------------------------------------------------------------------------------------------------------ worker side

export const LEASE_SECONDS = 90;

/** Claim the next runnable job of the given types. Stale leases (no heartbeat within the lease) are taken over. */
export async function claim(workerId: string, types: JobType[]): Promise<Job | undefined> {
  if (types.length === 0) return undefined;
  if ((await intakeState()).paused) return undefined;
  const now = new Date();
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - LEASE_SECONDS * 1000).toISOString();
  return db().transaction(async (tx) => {
    const rows = await tx.select().from(schema.jobs).where(and(
      inArray(schema.jobs.type, types),
      or(
        and(eq(schema.jobs.status, 'QUEUED'), or(isNull(schema.jobs.runAfter), lt(schema.jobs.runAfter, nowIso))),
        and(inArray(schema.jobs.status, ['PREPARING', 'GENERATING', 'DOWNLOADING', 'VALIDATING', 'POSTPROCESSING']), lt(schema.jobs.heartbeatAt, staleBefore)),
      ),
      eq(schema.jobs.cancelRequested, false),
    )).orderBy(desc(schema.jobs.priority), asc(schema.jobs.createdAt)).limit(1).for('update', { skipLocked: true });
    const r = rows[0];
    if (!r) return undefined;
    const reclaimed = r.status !== 'QUEUED';
    const updated = await tx.update(schema.jobs).set({ status: 'PREPARING', lockedBy: workerId, lockedAt: nowIso, heartbeatAt: nowIso, startedAt: r.startedAt ?? nowIso, attempts: r.attempts + 1, updatedAt: nowIso, progress: reclaimed ? { phase: 'recovering', message: 'picked up after a worker went quiet' } : { phase: 'preparing' } }).where(eq(schema.jobs.id, r.id)).returning();
    if (reclaimed) log.warn({ jobId: r.id, previousWorker: r.lockedBy }, 'reclaimed a stale job');
    return rowToJob(updated[0]);
  });
}

export async function heartbeat(id: string, workerId: string): Promise<{ cancelRequested: boolean }> {
  const now = new Date().toISOString();
  const rows = await db().update(schema.jobs).set({ heartbeatAt: now }).where(and(eq(schema.jobs.id, id), eq(schema.jobs.lockedBy, workerId))).returning({ cancelRequested: schema.jobs.cancelRequested });
  if (rows.length === 0) throw new StudioError('CONFLICT', 'Lost the lease on this job.');
  return { cancelRequested: rows[0].cancelRequested };
}

/** The lease a worker's attempt holds (claim sets `locked_by` and increments `attempts`). A write fenced on it touches
 *  the row only while that attempt still owns it: a worker whose lease went stale and was reclaimed cannot
 *  overwrite the attempt that took over. Without a lease (tests, tools) the write is by id, as before. */
export interface Lease { workerId: string; attempt: number }
const owned = (id: string, lease?: Lease) => (lease ? and(eq(schema.jobs.id, id), eq(schema.jobs.lockedBy, lease.workerId), eq(schema.jobs.attempts, lease.attempt)) : eq(schema.jobs.id, id));
const leaseLost = async (id: string, lease: Lease | undefined, what: string) => {
  log.warn({ jobId: id, lease, what }, 'write refused: this attempt no longer holds the lease');
  await addEvent(id, 'warn', `${what} discarded: attempt ${lease?.attempt} on ${lease?.workerId} no longer holds the lease`).catch(() => undefined);
  return false;
};

/** Returns false when the lease was lost (nothing was written). */
export async function setProgress(id: string, status: JobStatus, progress: JobProgress, extra: { providerTaskId?: string; takeId?: string } = {}, lease?: Lease): Promise<boolean> {
  if (!isActiveStatus(status) && status !== 'AWAITING_REVIEW') throw new Error(`setProgress with terminal status ${status}`);
  const now = new Date().toISOString();
  const rows = await db().update(schema.jobs).set({ status, progress, heartbeatAt: now, updatedAt: now, ...(extra.providerTaskId ? { providerTaskId: extra.providerTaskId } : {}), ...(extra.takeId ? { takeId: extra.takeId } : {}) }).where(owned(id, lease)).returning({ id: schema.jobs.id });
  if (lease && rows.length === 0) return leaseLost(id, lease, 'progress');
  await notifyJobs(id, status);
  return true;
}

/** Returns false when the lease was lost (the result was not written). */
export async function complete(id: string, result: Record<string, unknown>, status: 'COMPLETED' | 'AWAITING_REVIEW' = 'COMPLETED', lease?: Lease): Promise<boolean> {
  const now = new Date().toISOString();
  const rows = await db().update(schema.jobs).set({ status, result, finishedAt: status === 'COMPLETED' ? now : null, progress: { phase: status === 'COMPLETED' ? 'done' : 'awaiting review', percent: status === 'COMPLETED' ? 100 : null }, lockedBy: null, updatedAt: now }).where(owned(id, lease)).returning({ id: schema.jobs.id });
  if (lease && rows.length === 0) return leaseLost(id, lease, 'result');
  await addEvent(id, 'info', status === 'COMPLETED' ? 'completed' : 'awaiting review', result);
  await notifyJobs(id, status);
  return true;
}

/** Backoff: 15 s, 60 s, 4 min, 15 min, capped. Jitter stops a fleet from retrying in lockstep. */
export function backoffMs(attempt: number): number {
  const base = Math.min(15_000 * 4 ** Math.max(0, attempt - 1), 15 * 60_000);
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

/** Returns false when the lease was lost (the failure was not written). */
export async function fail(id: string, error: JobError, attempts: number, maxAttempts: number, lease?: Lease): Promise<boolean> {
  const now = new Date();
  const retryable = error.retryable !== false && attempts < maxAttempts;
  if (retryable) {
    const runAfter = new Date(now.getTime() + backoffMs(attempts)).toISOString();
    const rows = await db().update(schema.jobs).set({ status: 'QUEUED', error, runAfter, lockedBy: null, lockedAt: null, heartbeatAt: null, progress: { phase: 'retry scheduled', message: error.message }, updatedAt: now.toISOString() }).where(owned(id, lease)).returning({ id: schema.jobs.id });
    if (lease && rows.length === 0) return leaseLost(id, lease, 'failure');
    await addEvent(id, 'warn', `attempt ${attempts} failed; retrying`, { error, runAfter });
    await notifyJobs(id, 'QUEUED');
  } else {
    const rows = await db().update(schema.jobs).set({ status: 'FAILED', error, finishedAt: now.toISOString(), lockedBy: null, updatedAt: now.toISOString() }).where(owned(id, lease)).returning({ id: schema.jobs.id });
    if (lease && rows.length === 0) return leaseLost(id, lease, 'failure');
    await addEvent(id, 'error', 'failed', { error });
    await notifyJobs(id, 'FAILED');
  }
  return true;
}

/** Returns false when the lease was lost (nothing was written). */
export async function cancelled(id: string, lease?: Lease): Promise<boolean> {
  const now = new Date().toISOString();
  const rows = await db().update(schema.jobs).set({ status: 'CANCELLED', finishedAt: now, lockedBy: null, updatedAt: now, progress: { phase: 'cancelled' } }).where(owned(id, lease)).returning({ id: schema.jobs.id });
  if (lease && rows.length === 0) return leaseLost(id, lease, 'cancellation');
  await addEvent(id, 'info', 'cancelled');
  await notifyJobs(id, 'CANCELLED');
  return true;
}

/** A studio reset takes the job history with it: running jobs lose their lease (the worker stops at its next
 *  heartbeat or checkpoint), queued ones never start, and the activity list starts clean. Metrics stay. */
export async function clearJobs(): Promise<{ removed: number; running: number }> {
  return db().transaction(async (tx) => {
    const running = await tx.select({ id: schema.jobs.id }).from(schema.jobs).where(inArray(schema.jobs.status, ['PREPARING', 'GENERATING', 'DOWNLOADING', 'VALIDATING', 'POSTPROCESSING']));
    await tx.delete(schema.jobEvents);
    await tx.delete(schema.proposals);
    const gone = await tx.delete(schema.jobs).returning({ id: schema.jobs.id });
    return { removed: gone.length, running: running.length };
  });
}

export async function setProviderTask(id: string, providerTaskId: string) {
  await db().update(schema.jobs).set({ providerTaskId, updatedAt: new Date().toISOString() }).where(eq(schema.jobs.id, id));
}

/** Queue depth and recent outcomes, for the activity page and health. */
export async function queueStats(): Promise<{ queued: number; running: number; failed24h: number; completed24h: number }> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const rows = await db().execute<{ queued: string; running: string; failed24h: string; completed24h: string }>(dsql`
    select
      count(*) filter (where status = 'QUEUED') as queued,
      count(*) filter (where status in ('PREPARING','GENERATING','DOWNLOADING','VALIDATING','POSTPROCESSING')) as running,
      count(*) filter (where status = 'FAILED' and finished_at > ${since}) as "failed24h",
      count(*) filter (where status = 'COMPLETED' and finished_at > ${since}) as "completed24h"
    from jobs`);
  const r = rows[0];
  return { queued: Number(r?.queued ?? 0), running: Number(r?.running ?? 0), failed24h: Number(r?.failed24h ?? 0), completed24h: Number(r?.completed24h ?? 0) };
}

export async function recordMetric(name: string, value: number, unit?: string, labels?: Record<string, string | number | boolean>, jobId?: string) {
  await db().insert(schema.metrics).values({ at: new Date().toISOString(), name, value, unit: unit ?? null, labels: labels ?? null, jobId: jobId ?? null });
}
