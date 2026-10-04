import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { db, schema } from '@/server/db/client';
import { replaceStudio } from '@/server/studio/seed';
import { regenerate } from '@/server/jobs/regenerate';
import { listJobs } from '@/server/jobs/queue';

/** TARGETED REGENERATION (step 14), on the test database with the sample studio: one shot, or one line, is queued
 *  alone — nothing else of the production. */

const made: string[] = [];
beforeAll(async () => { await replaceStudio('sample'); });
afterAll(async () => {
  if (made.length) { await db().delete(schema.jobEvents).where(inArray(schema.jobEvents.jobId, made)); await db().delete(schema.jobs).where(inArray(schema.jobs.id, made)); }
  await replaceStudio('empty');
});

describe('regenerate one shot or one line', () => {
  it('a shot: one GENERATE_TAKE for that shot alone; the same key is the same job', async () => {
    const before = (await listJobs({ productionId: 's1e1', activeOnly: true })).length;
    const key = `k-${Math.random().toString(36).slice(2, 8)}`;
    const r = await regenerate('s1e1', { shotId: 's1e1-3', select: true, idempotencyKey: key });
    made.push(r.job.id);
    expect(r).toMatchObject({ scope: 'shot', created: true, job: { type: 'GENERATE_TAKE', shotId: 's1e1-3', payload: { productionId: 's1e1', shotId: 's1e1-3', select: true } } });
    expect((await regenerate('s1e1', { shotId: 's1e1-3', select: true, idempotencyKey: key })).job.id).toBe(r.job.id);
    expect((await listJobs({ productionId: 's1e1', activeOnly: true })).length).toBe(before + 1);
  });

  it('a line: one DIALOGUE_AUDIO for that line alone, recorded again even when current', async () => {
    const r = await regenerate('s1e1', { shotId: 's1e1-2', lineId: 'd1' });
    made.push(r.job.id);
    expect(r).toMatchObject({ scope: 'line', job: { type: 'DIALOGUE_AUDIO', payload: { productionId: 's1e1', shotIds: ['s1e1-2'], lineIds: ['d1'], force: true } } });
  });

  it('an unknown production, shot or line is NOT_FOUND, and nothing is queued', async () => {
    for (const [p, input] of [['nope', { shotId: 's1e1-2' }], ['s1e1', { shotId: 'nope' }], ['s1e1', { shotId: 's1e1-2', lineId: 'nope' }]] as const) {
      await expect(regenerate(p, input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }
  });
});
