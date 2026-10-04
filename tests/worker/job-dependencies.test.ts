import { afterAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { claim, complete, enqueue, fail, getJob, listJobs, reapStale, requestCancel, suspend, wakeParents } from '@/server/jobs/queue';
import { db, schema } from '@/server/db/client';

/** ORCHESTRATION AS DATA (docs/BACKEND-AUDIT-2026-10.md M1, step 14), on the test database: a parent's pass records
 *  what it waits for and becomes WAITING with no lease (no worker slot); it is woken — once — when the last child it
 *  waits for completes, fails for good, is cancelled or waits for a person; a wake is not an attempt; the plan
 *  survives between passes; a cancelled waiting parent ends at once; a missed wake-up is caught by the reaper. */

const made: string[] = [];
const later = () => new Date(Date.now() + 3600_000).toISOString(); // parked: a live worker never claims these
const job = async (type: 'PRODUCE' | 'GENERATE_TAKE', payload: Record<string, unknown>, parentId?: string) => {
  const r = await enqueue({ type, payload, parentId, runAfter: later(), maxAttempts: type === 'PRODUCE' ? 1 : 3 });
  made.push(r.job.id); return r.job;
};
/** the row as claim() leaves it, for worker `w` */
const claimed = async (id: string, w: string, attempts: number) => { await db().update(schema.jobs).set({ status: 'PREPARING', lockedBy: w, lockedAt: new Date().toISOString(), heartbeatAt: new Date().toISOString(), attempts }).where(eq(schema.jobs.id, id)); return { workerId: w, attempt: attempts }; };
const row = async (id: string) => (await db().select().from(schema.jobs).where(eq(schema.jobs.id, id)))[0];

afterAll(async () => {
  if (made.length) { await db().delete(schema.jobEvents).where(inArray(schema.jobEvents.jobId, made)); await db().delete(schema.jobs).where(inArray(schema.jobs.id, made)); }
});

describe('job dependencies (step 14)', () => {
  it('a pass waits without a lease; children settling wake it once, when the last one settles; a wake is not an attempt', async () => {
    const tag = Math.random().toString(36).slice(2, 8);
    const parent = await job('PRODUCE', { productionId: `p-${tag}` });
    const lease = await claimed(parent.id, 'w-dag', 1);
    const a = await job('GENERATE_TAKE', { productionId: `p-${tag}`, shotId: 'a' }, parent.id);
    const b = await job('GENERATE_TAKE', { productionId: `p-${tag}`, shotId: 'b' }, parent.id);
    expect(await suspend(parent.id, [a.id, b.id], { lease, plan: { stage: 'takes', takes: { a: a.id, b: b.id } }, progress: { phase: 'generating takes', message: '0/2' } })).toBe('waiting');
    const r = await row(parent.id);
    expect([r.status, r.lockedBy, r.heartbeatAt]).toEqual(['WAITING', null, null]);
    // readers see a running job waiting for its children (statuses unchanged for the pages)
    const seen = (await getJob(parent.id))!;
    expect(seen).toMatchObject({ status: 'GENERATING', waiting: true, plan: { stage: 'takes' } });
    expect((await listJobs({ productionId: `p-${tag}`, activeOnly: true })).map((j) => j.id)).toContain(parent.id);
    // nothing claims a waiting job
    expect((await claim('w-other', ['PRODUCE']))?.id).not.toBe(parent.id);
    // one child completes: still waiting
    await complete(a.id, { takeId: 't-a' });
    expect((await row(parent.id)).status).toBe('WAITING');
    // a failure that will be retried is not settled: still waiting
    await fail(b.id, { code: 'PROVIDER', message: 'busy', retryable: true }, 1, 3);
    expect((await row(parent.id)).status).toBe('WAITING');
    // the last child fails for good: the parent is queued again, one wake, the attempt budget grown by one
    await fail(b.id, { code: 'INVALID', message: 'Preflight failed', retryable: false }, 3, 3);
    const woken = await row(parent.id);
    expect([woken.status, woken.wakes, woken.maxAttempts, woken.attempts]).toEqual(['QUEUED', 1, 2, 1]);
    expect(woken.plan).toEqual({ stage: 'takes', takes: { a: a.id, b: b.id } });
    // waking twice does nothing
    expect(await wakeParents([a.id, b.id])).toEqual([]);
    // the next pass: attempts - wakes is still the first round, so its children's keys are the same
    await db().update(schema.jobs).set({ runAfter: null }).where(eq(schema.jobs.id, parent.id));
    const next = await claimed(parent.id, 'w-dag', woken.attempts + 1);
    expect(next.attempt - (await row(parent.id)).wakes).toBe(1);
    await complete(parent.id, { ok: true }, 'COMPLETED', next);
    expect((await getJob(parent.id))?.status).toBe('COMPLETED');
  });

  it('a pass whose children have already settled is queued again at once (no lost wake-up)', async () => {
    const parent = await job('PRODUCE', { productionId: 'p-ready' });
    const lease = await claimed(parent.id, 'w-dag', 1);
    const a = await job('GENERATE_TAKE', { productionId: 'p-ready', shotId: 'a' }, parent.id);
    await complete(a.id, {});
    expect(await suspend(parent.id, [a.id], { lease, plan: { x: 1 } })).toBe('ready');
    expect((await row(parent.id))).toMatchObject({ status: 'QUEUED', wakes: 1 });
  });

  it('a pass that lost its lease cannot suspend the job', async () => {
    const parent = await job('PRODUCE', { productionId: 'p-lost' });
    await claimed(parent.id, 'w-new', 2);
    const a = await job('GENERATE_TAKE', { productionId: 'p-lost', shotId: 'a' }, parent.id);
    expect(await suspend(parent.id, [a.id], { lease: { workerId: 'w-old', attempt: 1 } })).toBe('lost');
    expect((await row(parent.id)).status).toBe('PREPARING');
  });

  it('cancelling a waiting parent ends it at once, with its children', async () => {
    const parent = await job('PRODUCE', { productionId: 'p-cancel' });
    const lease = await claimed(parent.id, 'w-dag', 1);
    const a = await job('GENERATE_TAKE', { productionId: 'p-cancel', shotId: 'a' }, parent.id);
    await suspend(parent.id, [a.id], { lease });
    const j = await requestCancel(parent.id);
    expect(j.status).toBe('CANCELLED');
    expect((await getJob(a.id))?.status).toBe('CANCELLED');
  });

  it('a wake-up that was missed (children settled while nobody woke the parent) is caught by the reaper', async () => {
    const parent = await job('PRODUCE', { productionId: 'p-missed' });
    const a = await job('GENERATE_TAKE', { productionId: 'p-missed', shotId: 'a' }, parent.id);
    await db().insert(schema.jobDependencies).values({ jobId: parent.id, dependsOn: a.id, createdAt: new Date().toISOString() });
    await db().update(schema.jobs).set({ status: 'COMPLETED', finishedAt: new Date().toISOString() }).where(eq(schema.jobs.id, a.id));
    await db().update(schema.jobs).set({ status: 'WAITING' }).where(eq(schema.jobs.id, parent.id));
    const r = await reapStale();
    expect(r.woken).toContain(parent.id);
    expect((await row(parent.id)).status).toBe('QUEUED');
  });
});
