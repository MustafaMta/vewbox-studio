import { and, asc, desc, eq, inArray, isNull, lt, or, sql as dsql } from 'drizzle-orm';
import { z } from 'zod';
import { ACTIVE_STATUSES, JOB_PAYLOADS, JOB_RESOURCE, type Job, type JobError, type JobEvent, type JobProgress, type JobStatus, type JobType, isActiveStatus } from '@/domain/jobs';
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

/** A WAITING parent (step 14) is shown as the running job it is to every reader (status GENERATING, `waiting: true`):
 *  the job list, the event stream and the pages keep their statuses. */
export function rowToJob(r: typeof schema.jobs.$inferSelect): Job {
  const waiting = r.status === WAITING;
  return { ...(waiting ? { waiting: true } : {}), ...(r.wakes ? { wakes: r.wakes } : {}), ...(r.plan ? { plan: r.plan } : {}), id: r.id, type: r.type as JobType, status: (waiting ? 'GENERATING' : r.status) as JobStatus, priority: r.priority, payload: r.payload, result: undef(r.result), progress: undef(r.progress), error: undef(r.error), attempts: r.attempts, maxAttempts: r.maxAttempts, runAfter: undef(r.runAfter), startedAt: undef(r.startedAt), finishedAt: undef(r.finishedAt), heartbeatAt: undef(r.heartbeatAt), cancelRequested: r.cancelRequested, providerTaskId: undef(r.providerTaskId), parentId: undef(r.parentId), productionId: undef(r.productionId), sceneId: undef(r.sceneId), shotId: undef(r.shotId), takeId: undef(r.takeId), characterId: undef(r.characterId), locationId: undef(r.locationId), createdAt: r.createdAt, updatedAt: r.updatedAt };
}

/** The stored status of a parent waiting for its children (never a JobStatus a reader sees: rowToJob). */
export const WAITING = 'WAITING';
/** A child is SETTLED for its parent once nothing more happens to it without a person. */
export const SETTLED_STATUSES = ['COMPLETED', 'FAILED', 'CANCELLED', 'AWAITING_REVIEW'] as const;

export interface EnqueueInput<T extends JobType = JobType> { type: T; payload: unknown; priority?: number; maxAttempts?: number; idempotencyKey?: string; parentId?: string; runAfter?: string; /** a request identical to an ACTIVE job (type + payload) returns that job instead of queueing a second one (the web's submissions) */ dedupeActive?: boolean }

/** JSON with sorted keys (a stable lock key for one request). */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as Record<string, unknown>).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

const DEFAULT_ATTEMPTS: Partial<Record<JobType, number>> = { GENERATE_TAKE: 3, CORRECT_LIPSYNC: 2, GENERATE_SONG: 2, AUTO_IDEA: 1, DEVELOP_STORY: 3, WRITE_SCRIPT: 3, PLAN_SHOTS: 3, EXPORT: 2, ASSEMBLE: 2, PRODUCE: 1, EPISODE_CONTINUITY: 2, DESIGN_CHARACTER: 3, CREATE_CHARACTER: 1, VOICE_DESIGN: 2 };

/** WORKER LANES — which concurrency pool runs a job. Most follow the resource they use (JOB_RESOURCE). Orchestrators
 *  spend their life waiting for their children: they get a lane of their own (review finding 10), so a waiting chain
 *  never holds one of the CPU slots its own ASSEMBLE/EXPORT/MEDIA_PROBE children — or anyone else's — need. */
export type Lane = 'HOSTED' | 'LLM' | 'CPU' | 'GPU' | 'ORCHESTRATION';
export const ORCHESTRATION_LANE: { types: readonly JobType[]; limit: number } = { types: ['CREATE_CHARACTER', 'PRODUCE', 'AUTO_IDEA'], limit: 6 };
export const laneOf = (type: JobType): Lane => (ORCHESTRATION_LANE.types.includes(type) ? 'ORCHESTRATION' : JOB_RESOURCE[type]);

/** Jobs that work on one character and must never run twice at once for it: a second request while one is active
 *  gets the active job back (created: false), whatever key it carries. */
export const ONE_PER_CHARACTER: readonly JobType[] = ['VOICE_BUILD', 'VOICE_DESIGN', 'CHARACTER_APPEARANCE', 'CHARACTER_REFS'];

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
  // A DUPLICATE SUBMISSION (directive §26): the same request (type + identical payload) sent again while the first is
  // still active — a double click, two tabs, a client retry after a lost answer — gets the active job back
  // (created: false) instead of a second render. Atomic: the check and the insert run under one advisory lock on the
  // request, so two concurrent submissions cannot both insert. A request whose earlier twin has ended is new.
  if (input.dedupeActive) {
    const out = await db().transaction(async (tx) => {
      await tx.execute(dsql`select pg_advisory_xact_lock(hashtext(${`enqueue:${input.type}:${canonicalJson(p)}`}))`);
      const same = await tx.select().from(schema.jobs).where(and(eq(schema.jobs.type, input.type), inArray(schema.jobs.status, [...ACTIVE_STATUSES, WAITING]), dsql`${schema.jobs.payload} = ${JSON.stringify(p)}::jsonb`)).orderBy(asc(schema.jobs.createdAt)).limit(1);
      if (same[0]) return { job: rowToJob(same[0]), created: false };
      const ins = input.idempotencyKey
        ? await tx.insert(schema.jobs).values(row).onConflictDoNothing({ target: schema.jobs.idempotencyKey }).returning()
        : await tx.insert(schema.jobs).values(row).returning();
      if (ins[0]) return { job: rowToJob(ins[0]), created: true };
      const existing = await tx.select().from(schema.jobs).where(eq(schema.jobs.idempotencyKey, input.idempotencyKey!));
      return { job: rowToJob(existing[0]), created: false };
    });
    if (out.created) { await notifyJobs(out.job.id, 'QUEUED'); await addEvent(out.job.id, 'info', 'queued'); }
    else await addEvent(out.job.id, 'info', 'a duplicate submission of this request was answered with this job (no second job was queued)').catch(() => undefined);
    return out;
  }
  // the check above is a fast path; the partial unique index jobs_one_active_per_character (migration 0014) is the
  // guarantee: a concurrent insert that loses the race gets the winner back
  const oneActive = async <T>(insert: () => Promise<T>): Promise<T | { job: Job; created: false }> => {
    try { return await insert(); } catch (e) {
      if (isUniqueViolation(e, 'jobs_one_active_per_character') && typeof p.characterId === 'string') {
        const active = await findActive(input.type, { characterId: p.characterId });
        if (active) return { job: active, created: false };
      }
      throw e;
    }
  };
  if (input.idempotencyKey) {
    const inserted = await oneActive(() => db().insert(schema.jobs).values(row).onConflictDoNothing({ target: schema.jobs.idempotencyKey }).returning());
    if (!Array.isArray(inserted)) return inserted;
    if (inserted.length === 0) {
      const existing = await db().select().from(schema.jobs).where(eq(schema.jobs.idempotencyKey, input.idempotencyKey));
      return { job: rowToJob(existing[0]), created: false };
    }
    await notifyJobs(inserted[0].id, 'QUEUED');
    return { job: rowToJob(inserted[0]), created: true };
  }
  const inserted = await oneActive(() => db().insert(schema.jobs).values(row).returning());
  if (!Array.isArray(inserted)) return inserted;
  await notifyJobs(inserted[0].id, 'QUEUED');
  await addEvent(inserted[0].id, 'info', 'queued');
  return { job: rowToJob(inserted[0]), created: true };
}

/** A Postgres unique violation (23505), optionally on one constraint/index. postgres.js puts the fields on the error;
 *  Drizzle may wrap it as `cause`. */
export function isUniqueViolation(e: unknown, constraint?: string): boolean {
  const pg = (e as { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } }) ?? {};
  const x = pg.code === '23505' ? pg : pg.cause?.code === '23505' ? pg.cause : undefined;
  return Boolean(x) && (!constraint || x!.constraint_name === constraint || String((e as Error).message ?? '').includes(constraint) || String((pg.cause as Error | undefined)?.message ?? '').includes(constraint));
}

/** An active job for the same target of the same type, if any — the UI uses it to show one spinner, not two. */
export async function findActive(type: JobType, where: Partial<Pick<Job, 'productionId' | 'shotId' | 'characterId' | 'locationId'>>): Promise<Job | undefined> {
  const conds = [eq(schema.jobs.type, type), inArray(schema.jobs.status, ['QUEUED', 'PREPARING', 'GENERATING', 'DOWNLOADING', 'VALIDATING', 'POSTPROCESSING', WAITING])];
  if (where.productionId) conds.push(eq(schema.jobs.productionId, where.productionId));
  if (where.shotId) conds.push(eq(schema.jobs.shotId, where.shotId));
  if (where.characterId) conds.push(eq(schema.jobs.characterId, where.characterId));
  if (where.locationId) conds.push(eq(schema.jobs.locationId, where.locationId));
  const rows = await db().select().from(schema.jobs).where(and(...conds)).limit(1);
  return rows[0] ? rowToJob(rows[0]) : undefined;
}

export async function getJob(id: string): Promise<Job | undefined> {
  const rows = await db().select().from(schema.jobs).where(eq(schema.jobs.id, id));
  return rows[0] ? rowToJob(rows[0]) : undefined;
}

export async function listJobs(opts: { productionId?: string; activeOnly?: boolean; limit?: number; since?: string } = {}): Promise<Job[]> {
  const conds = [];
  if (opts.productionId) conds.push(eq(schema.jobs.productionId, opts.productionId));
  if (opts.activeOnly) conds.push(inArray(schema.jobs.status, ['QUEUED', 'PREPARING', 'GENERATING', 'DOWNLOADING', 'VALIDATING', 'POSTPROCESSING', 'AWAITING_REVIEW', WAITING]));
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
  const now = new Date().toISOString();
  // ONE STATEMENT, compare-and-set on the status (audit H4): a queued job becomes CANCELLED, a running one gets the
  // flag, decided on the row as it is when the update takes its lock. A claim racing with this either committed
  // first (the row is PREPARING now: the flag is set and the worker stops at its next checkpoint) or waits for us
  // (the row is CANCELLED: claim skips it). Both CASEs read the row's old status.
  const rows = await db().update(schema.jobs).set({
    cancelRequested: true,
    // a QUEUED job, or a parent WAITING for its children (no worker holds it: step 14), is cancelled at once
    status: dsql`case when ${schema.jobs.status} in ('QUEUED', 'WAITING') then 'CANCELLED' else ${schema.jobs.status} end`,
    finishedAt: dsql`case when ${schema.jobs.status} in ('QUEUED', 'WAITING') then ${now}::timestamptz else ${schema.jobs.finishedAt} end`,
    updatedAt: now,
  }).where(and(eq(schema.jobs.id, id), inArray(schema.jobs.status, [...ACTIVE_STATUSES, 'AWAITING_REVIEW', WAITING]))).returning({ status: schema.jobs.status });
  if (rows.length === 0) {
    const job = await getJob(id);
    if (!job) throw new StudioError('NOT_FOUND', `Job ${id} not found`);
    return job; // already finished: nothing to cancel
  }
  await addEvent(id, 'info', rows[0].status === 'CANCELLED' ? 'cancelled before it started' : 'cancel requested');
  // children follow the parent
  const children = await db().select({ id: schema.jobs.id }).from(schema.jobs).where(and(eq(schema.jobs.parentId, id), inArray(schema.jobs.status, ['QUEUED', 'PREPARING', 'GENERATING', 'DOWNLOADING', 'VALIDATING', 'POSTPROCESSING'])));
  for (const c of children) await requestCancel(c.id);
  if (rows[0].status === 'CANCELLED') {
    // a waiting parent's run was left open between its passes: it ends here, with the job
    await db().update(schema.agentRuns).set({ finishedAt: now, outcome: 'CANCELLED', failureClass: 'CANCELLED' }).where(and(eq(schema.agentRuns.jobId, id), isNull(schema.agentRuns.outcome)));
    await wakeParents([id]);
  }
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
/** The lease in force: WORKER_LEASE_SECONDS (≥ 3; the failure-injection tests use a few seconds so a killed worker's
 *  job is reclaimed quickly), else 90 s. Read per call. Every process sharing the database must use the same value. */
export function leaseSeconds(env: Record<string, string | undefined> = process.env): number {
  const v = Number(env.WORKER_LEASE_SECONDS);
  return Number.isFinite(v) && v >= 3 ? v : LEASE_SECONDS;
}
/** How often a running job renews its lease: a quarter of the lease, at most every 20 s. */
export const heartbeatIntervalMs = (env: Record<string, string | undefined> = process.env): number => Math.min(20_000, Math.floor((leaseSeconds(env) * 1000) / 4));
const RUNNING_STATUSES: JobStatus[] = ['PREPARING', 'GENERATING', 'DOWNLOADING', 'VALIDATING', 'POSTPROCESSING'];

/** THE REAPER (audit H4) — settles running jobs whose worker went quiet (no heartbeat within the lease) and that no
 *  worker may take over:
 *  - a cancel was requested: CANCELLED (claim never takes over a cancelled job, so before this it stayed "running"
 *    forever);
 *  - its attempts are used up: FAILED, failure class INFRASTRUCTURE (`WORKER_LOST`), not retryable — the job that
 *    crashes its worker is not retried forever; the retry endpoint can still revive it on purpose.
 *  Each is one conditional UPDATE (the row must still be stale and running when it is written), safe to run from
 *  every worker at once. Returns the jobs it settled. */
export async function reapStale(now = new Date()): Promise<{ cancelled: string[]; failed: string[]; woken?: string[] }> {
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - leaseSeconds() * 1000).toISOString();
  const stale = and(inArray(schema.jobs.status, RUNNING_STATUSES), or(isNull(schema.jobs.heartbeatAt), lt(schema.jobs.heartbeatAt, staleBefore)), servedHere());
  // ONE TRANSACTION: the job is settled and the attempt its lost worker never finished is closed together (step 15) —
  // a reaper that stopped between the two left the attempt "running" forever under a settled job (found by the
  // failure-injection harness, tests/worker/failure-recovery.test.ts)
  const { cancelled, failed } = await db().transaction(async (tx) => {
  const cancelled = await tx.update(schema.jobs).set({ status: 'CANCELLED', finishedAt: nowIso, lockedBy: null, updatedAt: nowIso, progress: { phase: 'cancelled', message: 'cancelled; its worker had stopped' } })
    .where(and(stale, eq(schema.jobs.cancelRequested, true))).returning({ id: schema.jobs.id });
  const failed = await tx.update(schema.jobs).set({
    status: 'FAILED', finishedAt: nowIso, lockedBy: null, updatedAt: nowIso, progress: { phase: 'failed', message: 'its worker stopped on every attempt' },
    error: dsql`jsonb_build_object('code', 'UNAVAILABLE', 'message', 'The worker running this job stopped responding on each of its ' || ${schema.jobs.attempts} || ' attempts (it may crash the worker: out of memory, a runaway process). It was not retried again.', 'retryable', false, 'details', jsonb_build_object('failureClass', 'INFRASTRUCTURE', 'reason', 'WORKER_LOST', 'previousError', ${schema.jobs.error}))`,
  }).where(and(stale, eq(schema.jobs.cancelRequested, false), dsql`${schema.jobs.attempts} >= ${schema.jobs.maxAttempts}`)).returning({ id: schema.jobs.id, lockedBy: schema.jobs.lockedBy });
  const settled = [...cancelled, ...failed].map((r) => r.id);
  if (settled.length) await tx.execute(dsql`update job_attempts a set finished_at = ${nowIso}, outcome = case when j.status = 'CANCELLED' then 'CANCELLED' else 'FAILED' end, failure_class = case when j.status = 'CANCELLED' then 'CANCELLED' else 'INFRASTRUCTURE' end, failure_message = 'its worker stopped responding (WORKER_LOST)' from jobs j where a.job_id = j.id and a.attempt = j.attempts and a.outcome is null and j.id in (${dsql.join(settled.map((x) => dsql`${x}`), dsql`, `)})`);
  return { cancelled, failed };
  });
  for (const r of cancelled) { await addEvent(r.id, 'info', 'cancelled: its worker had stopped before reaching a checkpoint').catch(() => undefined); await notifyJobs(r.id, 'CANCELLED').catch(() => undefined); }
  for (const r of failed) { log.warn({ jobId: r.id }, 'job failed: its worker was lost on every attempt'); await addEvent(r.id, 'error', 'failed: its worker was lost on every attempt', { failureClass: 'INFRASTRUCTURE', reason: 'WORKER_LOST' }).catch(() => undefined); await notifyJobs(r.id, 'FAILED').catch(() => undefined); }
  // their parents may be waiting for them; and a parent whose wake-up was missed is woken here (the backstop)
  const woken = [...await wakeParents([...cancelled, ...failed].map((r) => r.id)), ...await wakeReady()];
  return { cancelled: cancelled.map((r) => r.id), failed: failed.map((r) => r.id), ...(woken.length ? { woken } : {}) };
}

// ------------------------------------------------------------------------------- orchestration as data (step 14)

/** A PARENT WAITS FOR ITS CHILDREN (docs/BACKEND-AUDIT-2026-10.md M1). Instead of holding a worker slot and polling
 *  them, a planner's pass ends by recording what it waits for (job_dependencies) and its plan (`jobs.plan`), and its
 *  job becomes WAITING with no lease. When the last child it waits for settles (completed, failed for good, cancelled,
 *  or waiting for a person), the parent is QUEUED again and the next pass continues from its plan. Fenced on the
 *  pass's lease. The children are read FOR SHARE: a child settling at the same moment either committed first (it is
 *  seen settled, and the parent is queued again at once) or waits for this to commit (and then wakes it).
 *  Returns 'waiting', 'ready' (everything was already settled: queued again at once), or 'lost' (the lease). */
export async function suspend(id: string, dependsOn: string[], opts: { lease?: Lease; progress?: JobProgress; plan?: Record<string, unknown> } = {}): Promise<'waiting' | 'ready' | 'lost'> {
  const now = new Date().toISOString();
  const deps = Array.from(new Set(dependsOn.filter((d) => d && d !== id)));
  const out = await db().transaction(async (tx) => {
    if (deps.length) await tx.insert(schema.jobDependencies).values(deps.map((d) => ({ jobId: id, dependsOn: d, createdAt: now }))).onConflictDoNothing();
    const children = deps.length ? await tx.select({ id: schema.jobs.id, status: schema.jobs.status }).from(schema.jobs).where(inArray(schema.jobs.id, deps)).for('share') : [];
    const open = children.filter((c) => !(SETTLED_STATUSES as readonly string[]).includes(c.status)).length;
    const ready = open === 0;
    const rows = await tx.update(schema.jobs).set({
      ...(ready ? { status: 'QUEUED', wakes: dsql`${schema.jobs.wakes} + 1`, maxAttempts: dsql`${schema.jobs.maxAttempts} + 1`, runAfter: null } : { status: WAITING }),
      lockedBy: null, lockedAt: null, heartbeatAt: null, updatedAt: now,
      progress: opts.progress ?? { phase: 'waiting', message: `waiting for ${open} job(s)` }, ...(opts.plan ? { plan: opts.plan } : {}),
    }).where(owned(id, opts.lease)).returning({ id: schema.jobs.id });
    if (!rows.length) return 'lost' as const;
    return ready ? ('ready' as const) : ('waiting' as const);
  });
  if (out === 'lost') { await leaseLost(id, opts.lease, 'suspension'); return out; }
  await addEvent(id, 'info', out === 'ready' ? 'continues at once: what it waits for has settled' : `waiting for ${deps.length} job(s)`, { dependsOn: deps });
  await notifyJobs(id, out === 'ready' ? 'QUEUED' : 'GENERATING');
  return out;
}

/** Queue again every WAITING parent of these children whose children have all settled. A wake is not an attempt: the
 *  attempt budget grows with it (`attempts - wakes` stays the failure round). Returns the woken parents. */
export async function wakeParents(childIds: string[]): Promise<string[]> {
  if (!childIds.length) return [];
  const now = new Date().toISOString();
  const rows = await db().execute<{ id: string }>(dsql`
    update jobs p set status = 'QUEUED', wakes = p.wakes + 1, max_attempts = p.max_attempts + 1, run_after = null, updated_at = ${now}
    where p.status = 'WAITING'
      and p.id in (select job_id from job_dependencies where depends_on in (${dsql.join(childIds.map((c) => dsql`${c}`), dsql`, `)}))
      and not exists (select 1 from job_dependencies d join jobs c on c.id = d.depends_on where d.job_id = p.id and c.status not in ('COMPLETED', 'FAILED', 'CANCELLED', 'AWAITING_REVIEW'))
    returning p.id`);
  for (const r of rows) { await addEvent(r.id, 'info', 'woken: everything it waited for has settled').catch(() => undefined); await notifyJobs(r.id, 'QUEUED').catch(() => undefined); }
  return rows.map((r) => r.id);
}

/** The backstop: every WAITING parent whose children have all settled (a wake-up that was missed). */
export async function wakeReady(): Promise<string[]> {
  const waiting = await db().select({ id: schema.jobDependencies.dependsOn }).from(schema.jobDependencies).innerJoin(schema.jobs, eq(schema.jobs.id, schema.jobDependencies.jobId)).where(eq(schema.jobs.status, WAITING));
  return wakeParents(Array.from(new Set(waiting.map((w) => w.id))));
}

/** WORKER_ONLY_PRODUCTIONS (comma-separated production ids): this worker claims and reaps only those productions' jobs.
 *  A maintenance and test knob — the failure-injection harness's workers serve only their own fixtures and never touch
 *  another test's jobs. Unset (the studio): every job. Read per call. */
export function servedHere(env: Record<string, string | undefined> = process.env) {
  const ids = (env.WORKER_ONLY_PRODUCTIONS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return ids.length ? inArray(schema.jobs.productionId, ids) : undefined;
}

/** Claim the next runnable job of the given types. Stale leases (no heartbeat within the lease) are taken over. */
export async function claim(workerId: string, types: JobType[]): Promise<Job | undefined> {
  if (types.length === 0) return undefined;
  if ((await intakeState()).paused) return undefined;
  const now = new Date();
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - leaseSeconds() * 1000).toISOString();
  const taken = await db().transaction(async (tx) => {
    const rows = await tx.select().from(schema.jobs).where(and(
      inArray(schema.jobs.type, types),
      or(
        and(eq(schema.jobs.status, 'QUEUED'), or(isNull(schema.jobs.runAfter), lt(schema.jobs.runAfter, nowIso))),
        // a stale attempt is taken over only while attempts remain: a job that kills its worker every time (OOM, a
        // runaway child) is failed by reapStale, never retried forever (audit H4)
        and(inArray(schema.jobs.status, RUNNING_STATUSES), lt(schema.jobs.heartbeatAt, staleBefore), lt(schema.jobs.attempts, schema.jobs.maxAttempts)),
      ),
      eq(schema.jobs.cancelRequested, false),
      servedHere(),
    )).orderBy(desc(schema.jobs.priority), asc(schema.jobs.createdAt)).limit(1).for('update', { skipLocked: true });
    const r = rows[0];
    if (!r) return undefined;
    const reclaimed = r.status !== 'QUEUED';
    const updated = await tx.update(schema.jobs).set({ status: 'PREPARING', lockedBy: workerId, lockedAt: nowIso, heartbeatAt: nowIso, startedAt: r.startedAt ?? nowIso, attempts: r.attempts + 1, updatedAt: nowIso, progress: reclaimed ? { phase: 'recovering', message: 'picked up after a worker went quiet' } : { phase: 'preparing' } }).where(eq(schema.jobs.id, r.id)).returning();
    if (reclaimed) {
      log.warn({ jobId: r.id, previousWorker: r.lockedBy }, 'reclaimed a stale job');
      // THE LOST ATTEMPT STAYS VISIBLE (directive §20/§26): the attempt whose worker went quiet (killed, crashed, frozen)
      // is closed on its own row — FAILED, INFRASTRUCTURE, WORKER_LOST — in the same transaction as the takeover, so
      // the history never shows it "running" forever nor hides it behind the attempt that took over. A row the lost
      // worker never managed to write is created; one it already closed is left as it is.
      const msg = `its worker (${r.lockedBy ?? 'unknown'}) stopped responding — no heartbeat for ${leaseSeconds()} s (WORKER_LOST); attempt ${r.attempts + 1} took the job over`;
      await tx.execute(dsql`insert into job_attempts (job_id, attempt, job_type, production_id, shot_id, worker_id, started_at, finished_at, outcome, failure_class, failure_message)
        values (${r.id}, ${r.attempts}, ${r.type}, ${r.productionId}, ${r.shotId}, ${r.lockedBy}, ${r.lockedAt ?? r.startedAt ?? nowIso}, ${nowIso}, 'FAILED', 'INFRASTRUCTURE', ${msg})
        on conflict (job_id, attempt) do update set finished_at = excluded.finished_at, outcome = excluded.outcome, failure_class = excluded.failure_class, failure_message = excluded.failure_message
        where job_attempts.outcome is null`);
      return { job: rowToJob(updated[0]), lost: { attempt: r.attempts, worker: r.lockedBy, msg } };
    }
    return { job: rowToJob(updated[0]) };
  });
  if (taken?.lost) await addEvent(taken.job.id, 'warn', `attempt ${taken.lost.attempt} lost: ${taken.lost.msg}`, { failureClass: 'INFRASTRUCTURE', reason: 'WORKER_LOST', previousWorker: taken.lost.worker, lostAttempt: taken.lost.attempt }).catch(() => undefined);
  return taken?.job;
}

/** Renew the lease. Fenced on the worker AND, when given, the attempt: a worker id reused by a restarted process
 *  (WORKER_ID set) never renews an attempt that is not its own. */
export async function heartbeat(id: string, workerId: string, attempt?: number): Promise<{ cancelRequested: boolean }> {
  const now = new Date().toISOString();
  // (no status condition: a handler may park its job in AWAITING_REVIEW while it still runs; a job handed back or
  // finished has no locked_by)
  const conds = [eq(schema.jobs.id, id), eq(schema.jobs.lockedBy, workerId)];
  if (attempt !== undefined) conds.push(eq(schema.jobs.attempts, attempt));
  const rows = await db().update(schema.jobs).set({ heartbeatAt: now }).where(and(...conds)).returning({ cancelRequested: schema.jobs.cancelRequested });
  if (rows.length === 0) throw new StudioError('CONFLICT', 'Lost the lease on this job.');
  return { cancelRequested: rows[0].cancelRequested };
}

/** A WORKER THAT IS STOPPING (a restart, a deploy, Ctrl+C) hands its running job back instead of letting the lease
 *  go stale (audit M7): the job is QUEUED again at once for the next worker, and the interrupted attempt does not
 *  count against its budget (`max_attempts + 1`, as a wake does) — a restart is not a failure of the job. The attempt
 *  stays in the history, closed as INTERRUPTED. Nothing is cancelled: a provider task the attempt started (a ComfyUI
 *  prompt, a hosted MiniMax task) keeps running and the next attempt adopts it by its recorded id / prompt key.
 *  Fenced on the lease: a job that already moved on is not touched. Returns false when the lease was lost. */
export async function releaseForRestart(id: string, lease: Lease, reason = 'the worker is stopping'): Promise<boolean> {
  const now = new Date().toISOString();
  const rows = await db().update(schema.jobs).set({
    status: 'QUEUED', lockedBy: null, lockedAt: null, heartbeatAt: null, runAfter: null, updatedAt: now,
    maxAttempts: dsql`${schema.jobs.maxAttempts} + 1`,
    progress: { phase: 'queued', message: `handed back: ${reason}; the next worker continues it` },
  }).where(and(owned(id, lease), inArray(schema.jobs.status, RUNNING_STATUSES))).returning({ id: schema.jobs.id });
  if (!rows.length) return leaseLost(id, lease, 'hand-back');
  await db().update(schema.jobAttempts).set({ finishedAt: now, outcome: 'INTERRUPTED', failureMessage: `handed back to the queue: ${reason}` })
    .where(and(eq(schema.jobAttempts.jobId, id), eq(schema.jobAttempts.attempt, lease.attempt), isNull(schema.jobAttempts.outcome))).catch(() => undefined);
  await addEvent(id, 'warn', `attempt ${lease.attempt} interrupted: ${reason}; handed back to the queue (it does not count against the attempts)`, { reason: 'WORKER_STOPPING', worker: lease.workerId });
  await notifyJobs(id, 'QUEUED');
  return true;
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
  await wakeParents([id]);
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
    await wakeParents([id]);
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
  await wakeParents([id]);
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
