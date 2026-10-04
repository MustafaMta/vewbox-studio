import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/server/db/client';
import { enqueue } from '@/server/jobs/queue';
import { command, commands, readState } from '@/server/studio/engine';
import { runInJobScope } from '@/server/jobs/context';
import { jobFiles, jobOutputs, sweepJobFiles } from '@/server/jobs/outputs';
import { assetFromStored, libraryRoot } from '@/server/media';
import { commitTake, committedTake, takeIdOf } from '@/worker/handlers/take-commit';

/** ATOMIC, IDEMPOTENT TAKE COMMIT (docs/BACKEND-AUDIT-2026-10.md C2, step 6), with crashes injected where they hurt:
 *  between storing the files and committing the records, and after the commit but before the job is completed. The
 *  result is always ONE take and no orphan file. Real files (ffmpeg), real database (the test database), the marked
 *  test library. */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-commit-'));
const made: string[] = [];
let productionId = '';
let shotId = '';

const clip = (name: string) => { const f = path.join(tmp, `${name}-${Math.random().toString(36).slice(2, 8)}.mp4`); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', f]); return f; };
const still = (name: string) => { const f = path.join(tmp, `${name}-${Math.random().toString(36).slice(2, 8)}.jpg`); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180', '-frames:v', '1', f]); return f; };

beforeAll(async () => {
  const [prod] = await commands([{ name: 'addProduction', args: [{ kind: 'SHORT', title: 'Commit test', style: 'ANIME', language: 'EN', aspect: 'WIDE_16_9', targetSeconds: 10, brief: { mode: 'MANUAL', text: 'x' }, castIds: [], locationIds: [] }] }]) as [{ production: { id: string } }];
  productionId = prod.production.id;
  const { scene } = await command('addScene', [productionId, { title: 'S', timeOfDay: 'NIGHT' }]);
  shotId = (await command('addShot', [productionId, { sceneId: scene.id, purpose: '', action: '', framing: 'WIDE', cameraMove: 'STATIC', durationSeconds: 5, characterIds: [], dialogue: [], transition: 'CUT' }])).shot.id;
}, 60_000);

afterAll(async () => {
  if (made.length) {
    await db().delete(schema.qaReports).where(inArray(schema.qaReports.jobId, made));
    await db().delete(schema.worldReads).where(inArray(schema.worldReads.jobId, made));
    await db().delete(schema.jobEvents).where(inArray(schema.jobEvents.jobId, made));
    await db().delete(schema.jobs).where(inArray(schema.jobs.id, made));
  }
  if (productionId) await commands([{ name: 'deleteProduction', args: [productionId] }]).catch(() => undefined);
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** One attempt of a take job: store the poster and the video under the job's output ids, then (unless it "crashes")
 *  commit the take, its QA report and its selection as one batch. */
async function attempt(job: { id: string; attempts: number }, crash: 'before-commit' | 'none') {
  const lease = { workerId: 'commit-test', attempt: job.attempts };
  await db().update(schema.jobs).set({ status: 'GENERATING', lockedBy: lease.workerId, attempts: job.attempts, heartbeatAt: new Date().toISOString() }).where(eq(schema.jobs.id, job.id));
  return runInJobScope({ jobId: job.id, signal: new AbortController().signal, lease }, async () => {
    // what the worker does first on attempt > 1: the GC of earlier attempts' uncommitted files
    if (job.attempts > 1) await sweepJobFiles(job.id, { attempts: (a) => a !== undefined && a < job.attempts, reason: 'test: earlier attempts' });
    const done = committedTake((await readState()).state, job.id);
    if (done) return { resumed: true, takeId: done.take.id };
    const out = jobOutputs(job);
    const poster = await out.adopt('poster', still('poster'), { expectKind: 'IMAGE' });
    const video = await out.adopt('video', clip('take'), { expectKind: 'VIDEO' });
    if (crash === 'before-commit') throw new Error('injected crash between storing the files and committing the take');
    const take = await commitTake({
      jobId: job.id, productionId, shotId,
      assets: [
        assetFromStored(poster.id, poster.stored, { label: 'poster', tags: ['take', 'poster'], origin: 'DERIVED', jobId: job.id }),
        assetFromStored(video.id, video.stored, { label: 'video', tags: ['take'], origin: 'GENERATED', jobId: job.id, poster: `/api/media/${poster.id}` }),
      ],
      take: { assetId: video.id, label: 'Take 1', provider: 'MINIMAX', status: 'READY', jobId: job.id, thumbnailAssetId: poster.id, select: 'IF_UNCHOSEN' },
      qa: [{ name: 'picture', productionId, subjectKind: 'TAKE', subjectId: '', inspectorId: 'visual-quality-inspector', checks: [{ name: 'decodable', ok: true }], decision: 'ACCEPT', jobId: job.id }],
    });
    return { resumed: false, takeId: take.id };
  });
}

describe('atomic, idempotent take commit (audit C2, step 6)', () => {
  it('a crash between the files and the commit, then a crash after the commit: one take, its QA report once, no orphan file', async () => {
    const { job } = await enqueue({ type: 'GENERATE_TAKE', payload: { productionId, shotId }, runAfter: new Date(Date.now() + 3600_000).toISOString() });
    made.push(job.id);

    // attempt 1 stores its files and dies before the commit: files on disk, no record
    await expect(attempt({ id: job.id, attempts: 1 }, 'before-commit')).rejects.toThrow(/injected crash/);
    const orphans = await jobFiles(job.id);
    expect(orphans.length).toBeGreaterThanOrEqual(2);
    expect(orphans.every((f) => f.attempt === 1)).toBe(true);
    expect(committedTake((await readState()).state, job.id)).toBeUndefined();

    // attempt 2: the GC removes attempt 1's files, the take is generated and committed in one batch (and chosen)
    const second = await attempt({ id: job.id, attempts: 2 }, 'none');
    expect(second).toEqual({ resumed: false, takeId: takeIdOf(job.id) });
    const files = await jobFiles(job.id);
    expect(files.length).toBeGreaterThanOrEqual(2);
    expect(files.every((f) => f.attempt === 2)).toBe(true);
    for (const f of files) expect(fs.existsSync(path.join(libraryRoot(), f.rel))).toBe(true);

    // attempt 3 (attempt 2 crashed after its commit, before the job was completed): the committed take is found and
    // returned; nothing is stored or recorded again
    const third = await attempt({ id: job.id, attempts: 3 }, 'none');
    expect(third).toEqual({ resumed: true, takeId: takeIdOf(job.id) });

    const shot = (await readState()).state.productions.find((p) => p.id === productionId)!.shots.find((s) => s.id === shotId)!;
    expect(shot.takes.map((t) => t.id)).toEqual([takeIdOf(job.id)]);
    expect(shot.selectedTakeId).toBe(takeIdOf(job.id));
    const reports = await db().select().from(schema.qaReports).where(eq(schema.qaReports.jobId, job.id));
    expect(reports).toHaveLength(1);
    expect(reports[0].subjectId).toBe(takeIdOf(job.id));
    // every file of the job is one a record points at: the GC of a finished attempt removes nothing more
    expect(await sweepJobFiles(job.id, { reason: 'test: final' })).toEqual([]);
    expect((await jobFiles(job.id)).map((f) => f.rel).sort()).toEqual(files.map((f) => f.rel).sort());
  }, 120_000);

  it('the commit is all or nothing: a refused take leaves no asset record behind', async () => {
    const { job } = await enqueue({ type: 'GENERATE_TAKE', payload: { productionId, shotId }, runAfter: new Date(Date.now() + 3600_000).toISOString() });
    made.push(job.id);
    const lease = { workerId: 'commit-test', attempt: 1 };
    await db().update(schema.jobs).set({ status: 'GENERATING', lockedBy: lease.workerId, attempts: 1, heartbeatAt: new Date().toISOString() }).where(eq(schema.jobs.id, job.id));
    const err = await runInJobScope({ jobId: job.id, signal: new AbortController().signal, lease }, async () => {
      const out = jobOutputs({ id: job.id, attempts: 1 });
      const video = await out.adopt('video', clip('refused'), { expectKind: 'VIDEO' });
      // the take names a shot that does not exist: the whole batch is refused
      return commitTake({ jobId: job.id, productionId, shotId: 'shot-missing', assets: [assetFromStored(video.id, video.stored, { label: 'video', tags: [], origin: 'GENERATED', jobId: job.id })], take: { assetId: video.id, provider: 'MINIMAX', status: 'READY' }, qa: [] }).then(() => null, (e: unknown) => e);
    });
    expect(err).toMatchObject({ code: 'NOT_FOUND' });
    const s = (await readState()).state;
    expect(s.assets.some((a) => a.jobId === job.id)).toBe(false);
    // the attempt ends: its uncommitted file goes
    const removed = await sweepJobFiles(job.id, { attempts: (a) => a === 1, reason: 'test: attempt ended' });
    expect(removed).toHaveLength(1);
    expect(await jobFiles(job.id)).toEqual([]);
  }, 60_000);
});
