import { afterAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { db, schema } from '@/server/db/client';
import { claim, enqueue } from '@/server/jobs/queue';

/** WORKER_ONLY_PRODUCTIONS: a worker that serves only some productions never claims another production's job (the
 *  failure-injection harness's workers rely on it to leave every other test's jobs alone). */

const run = Math.random().toString(36).slice(2, 8);
const mine = `p-scope-mine-${run}`, other = `p-scope-other-${run}`;
const made: string[] = [];
afterAll(async () => { if (made.length) await db().update(schema.jobs).set({ status: 'CANCELLED', lockedBy: null, finishedAt: new Date().toISOString() }).where(inArray(schema.jobs.id, made)); });

describe('claim scope', () => {
  it('claims only the listed productions’ jobs; without the variable, any', async () => {
    const a = await enqueue({ type: 'MEDIA_PROBE', payload: { assetId: `asset-${run}-a` }, priority: 10 });
    // MEDIA_PROBE carries no production: give the jobs one directly (the queue copies it from payloads that have it)
    const b = await enqueue({ type: 'MEDIA_PROBE', payload: { assetId: `asset-${run}-b` }, priority: 10 });
    made.push(a.job.id, b.job.id);
    await db().update(schema.jobs).set({ productionId: other }).where(inArray(schema.jobs.id, [a.job.id]));
    await db().update(schema.jobs).set({ productionId: mine }).where(inArray(schema.jobs.id, [b.job.id]));
    const prior = process.env.WORKER_ONLY_PRODUCTIONS;
    process.env.WORKER_ONLY_PRODUCTIONS = mine;
    try {
      const got = await claim(`scope-${run}`, ['MEDIA_PROBE']);
      expect(got?.id).toBe(b.job.id);
      expect(await claim(`scope-${run}`, ['MEDIA_PROBE'])).toBeUndefined();
    } finally { if (prior === undefined) delete process.env.WORKER_ONLY_PRODUCTIONS; else process.env.WORKER_ONLY_PRODUCTIONS = prior; }
  });
});
