import { afterAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { backoffMs, cancelled, claim, complete, enqueue, fail, getJob, heartbeat, isUniqueViolation, reapStale, requestCancel, retry, setProgress } from '@/server/jobs/queue';
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

describe('queue hardening (audit H4, step 3)', () => {
  const stale = () => new Date(Date.now() - 10 * 60_000).toISOString();
  const parked = async (maxAttempts: number) => { const { job } = await enqueue({ type: 'MEDIA_PROBE', payload: { assetId: `asset-h4-${Math.random().toString(36).slice(2)}` }, maxAttempts, runAfter: new Date(Date.now() + 3600_000).toISOString() }); made.push(job.id); return job; };

  it('a job whose worker died on its last attempt is not reclaimed: the reaper fails it (INFRASTRUCTURE, not retryable)', async () => {
    const job = await parked(2);
    await db().update(schema.jobs).set({ status: 'GENERATING', lockedBy: 'dead-worker', heartbeatAt: stale(), attempts: 2, runAfter: null }).where(eq(schema.jobs.id, job.id));
    for (let i = 0; i < 3; i++) { const c = await claim('test-worker-poison', ['MEDIA_PROBE']); expect(c?.id).not.toBe(job.id); if (c) await complete(c.id, { skipped: true }); }
    const r = await reapStale();
    expect(r.failed).toContain(job.id);
    const j = (await getJob(job.id))!;
    expect(j.status).toBe('FAILED'); expect(j.finishedAt).toBeTruthy();
    expect(j.error).toMatchObject({ code: 'UNAVAILABLE', retryable: false, details: { failureClass: 'INFRASTRUCTURE', reason: 'WORKER_LOST' } });
    // a deliberate retry still revives it
    expect((await retry(job.id)).status).toBe('QUEUED');
    await requestCancel(job.id);
  });

  it('a job cancelled while its worker died is settled CANCELLED by the reaper; a live one is left alone', async () => {
    const dead = await parked(3); const live = await parked(3);
    await db().update(schema.jobs).set({ status: 'GENERATING', lockedBy: 'dead-worker', heartbeatAt: stale(), attempts: 1, cancelRequested: true }).where(eq(schema.jobs.id, dead.id));
    await db().update(schema.jobs).set({ status: 'GENERATING', lockedBy: 'live-worker', heartbeatAt: new Date().toISOString(), attempts: 1, cancelRequested: true }).where(eq(schema.jobs.id, live.id));
    const r = await reapStale();
    expect(r.cancelled).toContain(dead.id); expect(r.cancelled).not.toContain(live.id);
    expect((await getJob(dead.id))!.status).toBe('CANCELLED');
    expect((await getJob(live.id))!.status).toBe('GENERATING');
    await cancelled(live.id);
  });

  it('cancel and claim racing: the job is either cancelled before it starts, or claimed WITH the cancel flag — never claimed and unflagged', async () => {
    let claimedFlagged = 0; let cancelledQueued = 0;
    for (let i = 0; i < 25; i++) {
      const { job } = await enqueue({ type: 'EPISODE_CONTINUITY', payload: { productionId: `race-${i}-${Math.random().toString(36).slice(2)}` }, priority: 10_000 });
      made.push(job.id);
      const [, got] = await Promise.all([requestCancel(job.id), claim('test-worker-race', ['EPISODE_CONTINUITY'])]);
      const j = (await getJob(job.id))!;
      if (got?.id === job.id) { expect(j.cancelRequested).toBe(true); expect(j.status).toBe('PREPARING'); claimedFlagged++; await cancelled(job.id); }
      else { expect(j.status).toBe('CANCELLED'); expect(j.cancelRequested).toBe(true); cancelledQueued++; if (got) await cancelled(got.id); }
    }
    expect(claimedFlagged + cancelledQueued).toBe(25);
  });

  it('one active job per character: concurrent requests get the same job; the database refuses a second active row', async () => {
    const characterId = `char-h4-${Math.random().toString(36).slice(2)}`;
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => enqueue({ type: 'VOICE_BUILD', payload: { characterId }, idempotencyKey: i % 2 ? `vb-${characterId}-${i}` : undefined, runAfter: new Date(Date.now() + 3600_000).toISOString() })));
    for (const r of results) made.push(r.job.id);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.job.id)).size).toBe(1);
    const now = new Date().toISOString();
    const second = db().insert(schema.jobs).values({ id: `job-h4-${Math.random().toString(36).slice(2)}`, type: 'VOICE_BUILD', status: 'QUEUED', payload: { characterId }, characterId, createdAt: now, updatedAt: now });
    const err = await second.then(() => null, (e: unknown) => e);
    expect(isUniqueViolation(err, 'jobs_one_active_per_character')).toBe(true);
    // once it is finished, a new one may start
    await requestCancel(results[0].job.id);
    const next = await enqueue({ type: 'VOICE_BUILD', payload: { characterId }, runAfter: new Date(Date.now() + 3600_000).toISOString() });
    made.push(next.job.id);
    expect(next.created).toBe(true);
    await requestCancel(next.job.id);
  });
});
describe('fenced result writes (audit C1, step 5)', () => {
  it('a reclaimed attempt cannot add a take, an asset or a QA report; the owner can; the refusal is recorded on the job', async () => {
    const { command, commands } = await import('@/server/studio/engine');
    const { runInJobScope } = await import('@/server/jobs/context');
    const { isFencedWrite } = await import('@/server/jobs/fence');
    const { recordQaReport } = await import('@/server/org/runs');
    const { listEvents } = await import('@/server/jobs/queue');
    // a fixture production with one shot and one asset, written outside any job (no fence)
    const assetId = `up-fence-${Math.random().toString(36).slice(2, 10)}`;
    const [, prod] = await commands([
      { name: 'addAsset', args: [{ id: assetId, kind: 'VIDEO', src: `/api/media/${assetId}`, label: 'fence', tags: [], sample: false, origin: 'UPLOAD', provenance: { path: `video/2026/10/${assetId}.mp4` } }] },
      { name: 'addProduction', args: [{ kind: 'SHORT', title: 'Fence test', style: 'ANIME', language: 'EN', aspect: 'WIDE_16_9', targetSeconds: 10, brief: { mode: 'MANUAL', text: 'x' }, castIds: [], locationIds: [] }] },
    ]) as [unknown, { production: { id: string } }];
    const productionId = prod.production.id;
    const { scene } = await command('addScene', [productionId, { title: 'S', timeOfDay: 'NIGHT' }]);
    const { shot } = await command('addShot', [productionId, { sceneId: scene.id, purpose: '', action: '', framing: 'WIDE', cameraMove: 'STATIC', durationSeconds: 5, characterIds: [], dialogue: [], transition: 'CUT' }]);
    // attempt 1 on worker A went quiet; attempt 2 on worker B owns the job now
    const { job } = await enqueue({ type: 'MEDIA_PROBE', payload: { assetId }, maxAttempts: 3, runAfter: new Date(Date.now() + 3600_000).toISOString() });
    made.push(job.id);
    await db().update(schema.jobs).set({ status: 'GENERATING', lockedBy: 'test-worker-b', heartbeatAt: new Date().toISOString(), attempts: 2 }).where(eq(schema.jobs.id, job.id));
    const stale = { jobId: job.id, signal: new AbortController().signal, lease: { workerId: 'test-worker-a', attempt: 1 } };
    const owner = { jobId: job.id, signal: new AbortController().signal, lease: { workerId: 'test-worker-b', attempt: 2 } };
    const takesOf = async () => (await (await import('@/server/studio/engine')).readState()).state.productions.find((p) => p.id === productionId)!.shots[0].takes;

    const refused = await runInJobScope(stale, () => command('addTake', [productionId, shot.id, { assetId, provider: 'MINIMAX', label: 'stale take' }])).then(() => null, (e: unknown) => e);
    expect(isFencedWrite(refused)).toBe(true);
    expect(refused).toMatchObject({ code: 'CONFLICT', details: { reason: 'LEASE_LOST', failureClass: 'INFRASTRUCTURE' } });
    expect(await takesOf()).toHaveLength(0);
    const refusedAsset = await runInJobScope(stale, () => command('addAsset', [{ kind: 'IMAGE', src: '/x', label: 'x', tags: [], sample: false, origin: 'GENERATED' }])).then(() => null, (e: unknown) => e);
    expect(isFencedWrite(refusedAsset)).toBe(true);
    const refusedQa = await runInJobScope(stale, () => recordQaReport({ subjectKind: 'TAKE', subjectId: 'x', inspectorId: 'take-inspector', checks: [], decision: 'ACCEPT', jobId: job.id })).then(() => null, (e: unknown) => e);
    expect(isFencedWrite(refusedQa)).toBe(true);
    await new Promise((r) => setTimeout(r, 200)); // the refusal event is written after the rollback
    expect((await listEvents(job.id)).some((ev) => /refused: attempt 1 on test-worker-a no longer holds the lease/.test(ev.message))).toBe(true);

    // the owner writes; once the job is finished (lease released) even the owner is refused
    await runInJobScope(owner, () => command('addTake', [productionId, shot.id, { assetId, provider: 'MINIMAX', label: 'owner take' }]));
    expect((await takesOf()).map((t) => t.label)).toEqual(['owner take']);
    await complete(job.id, { ok: true }, 'COMPLETED', owner.lease);
    const late = await runInJobScope(owner, () => command('addTake', [productionId, shot.id, { assetId, provider: 'MINIMAX', label: 'late take' }])).then(() => null, (e: unknown) => e);
    expect(isFencedWrite(late)).toBe(true);
    expect(await takesOf()).toHaveLength(1);

    await commands([{ name: 'deleteProduction', args: [productionId] }, { name: 'deleteAsset', args: [assetId] }]);
  });
});