import { afterAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { backoffMs, cancelled, claim, complete, enqueue, fail, getJob, heartbeat, requestCancel, retry, setProgress } from '@/server/jobs/queue';
import { db, schema } from '@/server/db/client';

/** THE QUEUE'S PROMISES, against the real database. A worker that goes quiet loses its lease; a second worker takes
 *  the job over and the first can no longer heartbeat it. Retries back off. Idempotency keys collapse duplicates. */

const made: string[] = [];
const probe = (n = 1) => enqueue({ type: 'MEDIA_PROBE', payload: { assetId: `asset-test-${Math.random().toString(36).slice(2)}` }, maxAttempts: n }).then((r) => { made.push(r.job.id); return r; });

afterAll(async () => {
  if (made.length) {
    await db().delete(schema.jobEvents).where(inArray(schema.jobEvents.jobId, made));
    await db().delete(schema.jobs).where(inArray(schema.jobs.id, made));
  }
});

describe('queue leases', () => {
  it('a stale lease is reclaimed by another worker and the first worker loses it', async () => {
    // A live worker may be running beside this test and would claim a runnable probe, so the job is parked an hour
    // in the future and "claimed" by worker A directly (the same row state claim() produces).
    const { job } = await enqueue({ type: 'MEDIA_PROBE', payload: { assetId: 'asset-test-stale' }, maxAttempts: 3, runAfter: new Date(Date.now() + 3600_000).toISOString() });
    made.push(job.id);
    await db().update(schema.jobs).set({ status: 'PREPARING', lockedBy: 'test-worker-a', lockedAt: new Date().toISOString(), heartbeatAt: new Date().toISOString(), startedAt: new Date().toISOString(), attempts: 1 }).where(eq(schema.jobs.id, job.id));
    expect((await heartbeat(job.id, 'test-worker-a')).cancelRequested).toBe(false);
    // a live heartbeat keeps the job invisible to other workers
    const other = await claim('test-worker-b', ['MEDIA_PROBE']);
    expect(other?.id).not.toBe(job.id);
    if (other) await complete(other.id, { skipped: true });
    // the worker goes quiet: push its heartbeat into the past
    const stale = new Date(Date.now() - 10 * 60_000).toISOString();
    await db().update(schema.jobs).set({ heartbeatAt: stale }).where(eq(schema.jobs.id, job.id));
    const taken = await claim('test-worker-b', ['MEDIA_PROBE']);
    expect(taken?.id).toBe(job.id);
    expect(taken?.attempts).toBe(2);
    expect(taken?.progress).toMatchObject({ phase: 'recovering' });
    // the first worker's lease is gone
    await expect(heartbeat(job.id, 'test-worker-a')).rejects.toThrow(/lease/i);
    expect((await heartbeat(job.id, 'test-worker-b')).cancelRequested).toBe(false);
    await complete(job.id, { ok: true });
    expect((await getJob(job.id))?.status).toBe('COMPLETED');
  });

  it('fencing: once a job is reclaimed, the old attempt can no longer write progress, a result, a failure or a cancellation', async () => {
    const { job } = await enqueue({ type: 'MEDIA_PROBE', payload: { assetId: 'asset-test-fence' }, maxAttempts: 3, runAfter: new Date(Date.now() + 3600_000).toISOString() });
    made.push(job.id);
    // attempt 1 on worker A went quiet; attempt 2 on worker B owns the job now (the row state claim() leaves)
    await db().update(schema.jobs).set({ status: 'GENERATING', lockedBy: 'test-worker-b', lockedAt: new Date().toISOString(), heartbeatAt: new Date().toISOString(), attempts: 2 }).where(eq(schema.jobs.id, job.id));
    const old = { workerId: 'test-worker-a', attempt: 1 };
    expect(await setProgress(job.id, 'GENERATING', { phase: 'late' }, {}, old)).toBe(false);
    expect(await complete(job.id, { stale: true }, 'COMPLETED', old)).toBe(false);
    expect(await fail(job.id, { code: 'PROVIDER', message: 'late', retryable: false }, 1, 3, old)).toBe(false);
    expect(await cancelled(job.id, old)).toBe(false);
    let j = (await getJob(job.id))!;
    expect(j.status).toBe('GENERATING'); expect(j.result).toBeUndefined();
    // the same worker on a stale attempt number is refused too; the owner writes
    expect(await setProgress(job.id, 'VALIDATING', { phase: 'checking' }, {}, { workerId: 'test-worker-b', attempt: 1 })).toBe(false);
    expect(await complete(job.id, { ok: true }, 'COMPLETED', { workerId: 'test-worker-b', attempt: 2 })).toBe(true);
    j = (await getJob(job.id))!;
    expect(j.status).toBe('COMPLETED'); expect(j.result).toEqual({ ok: true });
  });

  it('a failure schedules a retry with backoff until attempts run out; retry() revives a dead job', async () => {
    const { job } = await probe(2);
    await db().update(schema.jobs).set({ status: 'PREPARING', lockedBy: 'w', heartbeatAt: new Date().toISOString(), attempts: 1 }).where(eq(schema.jobs.id, job.id));
    await fail(job.id, { code: 'PROVIDER', message: 'boom', retryable: true }, 1, 2);
    let j = (await getJob(job.id))!;
    expect(j.status).toBe('QUEUED');
    expect(j.runAfter && new Date(j.runAfter).getTime()).toBeGreaterThan(Date.now() + 5_000);
    expect(j.error?.message).toBe('boom');
    // not claimable before runAfter
    const early = await claim('test-worker-c', ['MEDIA_PROBE']);
    expect(early?.id).not.toBe(job.id);
    if (early) await complete(early.id, { skipped: true });
    await db().update(schema.jobs).set({ status: 'PREPARING', lockedBy: 'w', heartbeatAt: new Date().toISOString(), attempts: 2 }).where(eq(schema.jobs.id, job.id)); // a second claim
    await fail(job.id, { code: 'PROVIDER', message: 'boom again', retryable: true }, 2, 2);
    j = (await getJob(job.id))!;
    expect(j.status).toBe('FAILED');
    expect(j.finishedAt).toBeTruthy();
    const revived = await retry(job.id);
    expect(revived.status).toBe('QUEUED');
    expect(revived.maxAttempts).toBeGreaterThanOrEqual(3);
    expect(revived.error).toBeUndefined();
    await requestCancel(job.id);
    expect((await getJob(job.id))?.status).toBe('CANCELLED');
  });

  it('a non-retryable failure never retries', async () => {
    const { job } = await probe(5);
    await db().update(schema.jobs).set({ status: 'GENERATING', lockedBy: 'w', heartbeatAt: new Date().toISOString(), attempts: 1 }).where(eq(schema.jobs.id, job.id));
    await fail(job.id, { code: 'INVALID', message: 'bad input', retryable: false }, 1, 5);
    expect((await getJob(job.id))?.status).toBe('FAILED');
  });

  it('idempotency keys collapse duplicate submissions', async () => {
    const key = `test-${Math.random().toString(36).slice(2)}`;
    const a = await enqueue({ type: 'MEDIA_PROBE', payload: { assetId: 'asset-dup' }, idempotencyKey: key });
    made.push(a.job.id);
    const b = await enqueue({ type: 'MEDIA_PROBE', payload: { assetId: 'asset-dup' }, idempotencyKey: key });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.job.id).toBe(a.job.id);
    await requestCancel(a.job.id);
  });

  it('cancellation of a running job is a flag the heartbeat reports', async () => {
    const { job } = await probe(1);
    await db().update(schema.jobs).set({ status: 'GENERATING', lockedBy: 'test-worker-d', heartbeatAt: new Date().toISOString(), attempts: 1 }).where(eq(schema.jobs.id, job.id));
    await requestCancel(job.id);
    expect((await getJob(job.id))?.status).toBe('GENERATING'); // still running until the handler reaches a checkpoint
    expect((await heartbeat(job.id, 'test-worker-d')).cancelRequested).toBe(true);
    await setProgress(job.id, 'GENERATING', { phase: 'stopping' });
  });

  it('backoff grows and is capped', () => {
    const b1 = backoffMs(1), b2 = backoffMs(2), b3 = backoffMs(3), b9 = backoffMs(9);
    expect(b1).toBeGreaterThanOrEqual(12_000); expect(b1).toBeLessThanOrEqual(18_000);
    expect(b2).toBeGreaterThan(b1); expect(b3).toBeGreaterThan(b2);
    expect(b9).toBeLessThanOrEqual(15 * 60_000 * 1.2);
  });
});
