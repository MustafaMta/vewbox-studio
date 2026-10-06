import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/server/db/client';
import { enqueue } from '@/server/jobs/queue';
import { command, commands, readState } from '@/server/studio/engine';
import { recordApproval } from '@/server/org/runs';
import { approvalSubjectHash } from '@/domain/approvals';
import { regenerate } from '@/server/jobs/regenerate';
import { harness, until } from './fixtures/harness';

/** A PRODUCTION THAT SURVIVES ITS WORKER, AND A FAILED SHOT THAT DOES NOT COST THE FILM (directive 2026-10-06 §26).
 *  The REAL PRODUCE planner (pilot gate, children with idempotency keys, WAITING parent) runs in a real worker
 *  process; the takes come from the FIXTURE provider (tests/worker/fixtures/fault-worker.ts — state/recovery logic
 *  only, never generation evidence) and one shot's provider always fails. The worker is hard-killed while takes are
 *  rendering; a new worker carries the production on. Then only the failed shot is regenerated. */

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-produce-'));
const h = harness({ dir });
let productionId = '';
const shots: string[] = [];
const row = async (id: string) => (await db().select().from(schema.jobs).where(eq(schema.jobs.id, id)))[0];
const prod = async () => (await readState()).state.productions.find((p) => p.id === productionId)!;
const takeJobsOf = (shotId: string) => db().select().from(schema.jobs).where(and(eq(schema.jobs.type, 'GENERATE_TAKE'), eq(schema.jobs.shotId, shotId)));

beforeAll(async () => {
  await db().update(schema.jobs).set({ status: 'CANCELLED', finishedAt: new Date().toISOString(), lockedBy: null }).where(inArray(schema.jobs.status, ['QUEUED', 'PREPARING', 'GENERATING', 'DOWNLOADING', 'VALIDATING', 'POSTPROCESSING', 'WAITING']));
  await db().delete(schema.resourceLeases);
  const [p] = await commands([{ name: 'addProduction', args: [{ kind: 'SHORT', title: 'Production harness', style: 'ANIME', language: 'EN', aspect: 'WIDE_16_9', targetSeconds: 10, brief: { mode: 'MANUAL', text: 'fixture' }, castIds: [], locationIds: [] }] }]) as [{ production: { id: string } }];
  productionId = p.production.id;
  const { scene } = await command('addScene', [productionId, { title: 'S', timeOfDay: 'NIGHT' }]);
  for (let i = 0; i < 5; i++) shots.push((await command('addShot', [productionId, { sceneId: scene.id, purpose: '', action: `shot ${i}`, framing: 'WIDE', cameraMove: 'STATIC', durationSeconds: 2, characterIds: [], dialogue: [], transition: 'CUT' }])).shot.id);
  await recordApproval({ productionId, stage: 'STORY', subjectKind: 'STAGE', subjectId: 'STORY', decision: 'APPROVED', by: 'test', subjectHash: approvalSubjectHash(await prod(), 'STORY') });
}, 60_000);
afterEach(() => h.killAll());
afterAll(async () => { if (productionId) await commands([{ name: 'deleteProduction', args: [productionId] }]).catch(() => undefined); }, 60_000);

describe('a production that loses its worker, with one failing shot', () => {
  it('killed mid-production: the next worker carries on — no shot generated twice, the finished takes kept, the failed shot reported; regenerating it alone completes the film', async () => {
    const failing = shots[4];
    const a = h.start('produce-a', { FIXTURE_FAIL_SHOTS: failing, FIXTURE_RENDER_MS: '2500' });
    const { job: produce } = await enqueue({ type: 'PRODUCE', payload: { productionId } });
    // past the pilot: a later shot is rendering
    await until('a non-pilot take rendering', async () => { const js = (await Promise.all(shots.slice(1, 4).map(takeJobsOf))).flat(); return js.some((j) => j.status === 'GENERATING' && (j.progress as { percent?: number } | null)?.percent) ? js : undefined; });
    await h.kill(a);
    const b = h.start('produce-b', { FIXTURE_FAIL_SHOTS: failing, FIXTURE_RENDER_MS: '2500' });
    const settled = await until('the production settled', async () => { const r = await row(produce.id); return ['COMPLETED', 'FAILED', 'CANCELLED', 'AWAITING_REVIEW'].includes(r.status) ? r : undefined; }, 180_000);
    await h.stop(b);
    // a production with a failed shot is not "done": it waits for the producer, the failure named in its result
    expect(settled.status, JSON.stringify(settled.error ?? settled.result)).toBe('AWAITING_REVIEW');
    expect(settled.result).toMatchObject({ completed: 4, failed: 1, remainingWithoutTake: 1, failedShots: [{ shotId: failing }] });

    // every good shot: ONE take job and ONE take, never a second generation after the kill
    const p1 = await prod();
    for (const s of shots.slice(0, 4)) {
      expect((await takeJobsOf(s)).length, `take jobs of ${s}`).toBe(1);
      const sh = p1.shots.find((x) => x.id === s)!;
      expect(sh.takes).toHaveLength(1);
      expect(sh.selectedTakeId).toBe(sh.takes[0].id);
    }
    // the failed shot is visible: its job FAILED once (no silent retries), no take, no cut yet
    const failedJobs = await takeJobsOf(failing);
    expect(failedJobs.map((j) => [j.status, j.attempts])).toEqual([['FAILED', 1]]);
    const at = await db().select().from(schema.jobAttempts).where(eq(schema.jobAttempts.jobId, failedJobs[0].id));
    expect(at.map((x) => [x.outcome, x.failureClass])).toEqual([['FAILED', 'OUTPUT_CORRUPTION']]);
    expect(p1.shots.find((x) => x.id === failing)!.takes).toEqual([]);
    expect(p1.cutAssetId).toBeFalsy();
    const keep = Object.fromEntries(p1.shots.map((s) => [s.id, s.takes.map((t) => t.id)]));

    // the failed shot alone is generated again (the provider works now): one job, nothing else of the film touched
    const before = (await db().select({ id: schema.jobs.id }).from(schema.jobs).where(eq(schema.jobs.productionId, productionId))).length;
    const c = h.start('produce-c', { FIXTURE_RENDER_MS: '500' });
    const r = await regenerate(productionId, { shotId: failing, select: true });
    await until('the regenerated take', async () => (await row(r.job.id)).status === 'COMPLETED');
    const after = (await db().select({ id: schema.jobs.id }).from(schema.jobs).where(eq(schema.jobs.productionId, productionId))).length;
    expect(after - before).toBe(1);
    const { job: cut } = await enqueue({ type: 'ASSEMBLE', payload: { productionId } });
    await until('the cut', async () => { const x = await row(cut.id); return x.status === 'COMPLETED' || x.status === 'FAILED' ? x : undefined; }, 120_000);
    await h.stop(c);
    const p2 = await prod();
    expect((await row(cut.id)).status).toBe('COMPLETED');
    for (const s of shots.slice(0, 4)) expect(p2.shots.find((x) => x.id === s)!.takes.map((t) => t.id)).toEqual(keep[s]);
    expect(p2.shots.find((x) => x.id === failing)!.takes).toHaveLength(1);
    expect(p2.cutAssetId).toBeTruthy();
  }, 400_000);
});
