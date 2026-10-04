import { and, eq, inArray } from 'drizzle-orm';
import { StudioError } from '@/domain/errors';
import { db, schema } from '../db/client';
import { log } from '../log';
import { jobScope, type Lease } from './context';

/** FENCED RESULT WRITES (docs/BACKEND-AUDIT-2026-10.md C1, step 5). A worker that lost its lease (its heartbeat went
 *  stale for > 90 s and another worker reclaimed the job) must never write a result. Every result write a job makes —
 *  studio commands (takes, cuts, exports, assets, voice identities, canonical images, scripts…), world revisions and
 *  pins, audio timelines, QA reports, development artifacts, proposals — checks, INSIDE ITS OWN TRANSACTION, that the
 *  job row is still running and still held by this attempt (`locked_by` + `attempts`), and holds that row with
 *  FOR SHARE until it commits: a reclaim (which updates the row) cannot slip in between the check and the write.
 *  A refused write rolls back, is logged and recorded on the job, and surfaces as FencedWrite — the worker then
 *  ends the attempt as "lease lost" without writing the job either. Outside a job (web routes, scripts, tests) there is
 *  no lease and nothing is checked. */

const RUNNING = ['PREPARING', 'GENERATING', 'DOWNLOADING', 'VALIDATING', 'POSTPROCESSING'];

export class FencedWrite extends StudioError {
  constructor(what: string, jobId: string, lease: Lease) {
    super('CONFLICT', `${what} refused: attempt ${lease.attempt} on ${lease.workerId} no longer holds the lease of job ${jobId}.`, { reason: 'LEASE_LOST', failureClass: 'INFRASTRUCTURE', jobId, lease });
    this.name = 'StudioError';
  }
}
export const isFencedWrite = (e: unknown): boolean => e instanceof FencedWrite || (e as { details?: { reason?: string } } | null)?.details?.reason === 'LEASE_LOST';

type Tx = Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0];

/** Inside a transaction: refuse (throw FencedWrite) unless the current job scope's lease still holds its job. */
export async function assertLeaseHeld(tx: Tx, what: string): Promise<void> {
  const s = jobScope();
  if (!s?.lease || !s.jobId) return;
  const rows = await tx.select({ id: schema.jobs.id }).from(schema.jobs)
    .where(and(eq(schema.jobs.id, s.jobId), eq(schema.jobs.lockedBy, s.lease.workerId), eq(schema.jobs.attempts, s.lease.attempt), inArray(schema.jobs.status, RUNNING)))
    .for('share');
  if (rows.length) return;
  log.warn({ jobId: s.jobId, lease: s.lease, what }, 'result write refused: this attempt no longer holds the lease');
  // recorded on the job outside the (rolled back) transaction; best effort
  void db().insert(schema.jobEvents).values({ jobId: s.jobId, at: new Date().toISOString(), level: 'warn', message: `${what} refused: attempt ${s.lease.attempt} on ${s.lease.workerId} no longer holds the lease`, data: { lease: s.lease, what } }).catch(() => undefined);
  throw new FencedWrite(what, s.jobId, s.lease);
}

/** A result write in its own transaction, fenced on the job scope's lease (without a lease: written as before). */
export function fenced<T>(what: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!jobScope()?.lease) return fn(db() as unknown as Tx);
  return db().transaction(async (tx) => { await assertLeaseHeld(tx, what); return fn(tx); });
}
