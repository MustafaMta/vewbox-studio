/** FIXTURE WORKER — the failure-injection harness's worker process (tests/worker/failure-recovery.test.ts).
 *
 *  It IS the real worker (src/worker/index.ts: claim, lease, heartbeat, fencing, reaper, attempt rows, GC, shutdown),
 *  started as its own OS process so a test can kill it (TerminateProcess / SIGKILL) or stop it (IPC "shutdown") in
 *  the middle of a job. With FIXTURE_TAKE=1 the GENERATE_TAKE handler is replaced by a FIXTURE PROVIDER: a stand-in
 *  for an engine render that records its task id before "submitting", keeps its own clock on disk (so an adopted task
 *  is not restarted), counts its submissions, and draws its clip with ffmpeg's test pattern. It exists to exercise
 *  state and recovery logic only — it is never a generation path and nothing it makes is acceptance evidence. Every
 *  other handler (ASSEMBLE, EXPORT, the real GENERATE_TAKE when FIXTURE_TAKE is unset) is the production code.
 *
 *  Environment (set by the test): DATABASE_URL (a test database — refused if live), LIBRARY_ROOT, TMP_ROOT, WORKER_ID,
 *  WORKER_LEASE_SECONDS, FIXTURE_DIR (the fixture provider's state), FIXTURE_RENDER_MS. */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { assertNotLiveDatabase } from '../../../src/server/test-guard';

assertNotLiveDatabase(process.env.DATABASE_URL, 'fault worker');
const run = promisify(execFile);

if (process.env.FIXTURE_TAKE === '1') {
  const { HANDLERS } = await import('@/worker/handlers');
  const { readState } = await import('@/server/studio/engine');
  const { committedTake, commitTake } = await import('@/worker/handlers/take-commit');
  const { jobOutputs } = await import('@/server/jobs/outputs');
  const { assetFromStored } = await import('@/server/media');
  const { tmpDir } = await import('@/server/media/ffmpeg');
  const { StudioError } = await import('@/domain/errors');
  const dir = process.env.FIXTURE_DIR!;
  const renderMs = Number(process.env.FIXTURE_RENDER_MS ?? 3000);
  HANDLERS.GENERATE_TAKE = async (ctx) => {
    const { productionId, shotId } = ctx.job.payload as { productionId: string; shotId: string };
    const done = committedTake((await readState()).state, ctx.job.id);
    if (done) { await ctx.event('info', 'FIXTURE: the take was already committed by an earlier attempt'); return { takeId: done.take.id, resumedFromCommit: true }; }
    // a shot this fixture provider always fails (a failed shot inside a production): not retried
    if ((process.env.FIXTURE_FAIL_SHOTS ?? '').split(',').includes(shotId)) throw Object.assign(new StudioError('PROVIDER', `FIXTURE provider: the clip of shot ${shotId} is unusable`), { failureClass: 'OUTPUT_CORRUPTION' });
    // the provider task: its id is recorded on the job BEFORE submission; a later attempt adopts it
    const taskId = ctx.job.providerTaskId ?? `fixture-task-${ctx.job.id}`;
    const clock = path.join(dir, `${taskId}.started`);
    if (!ctx.job.providerTaskId) {
      await ctx.progress('GENERATING', { phase: 'generating', message: `FIXTURE provider task ${taskId} submitted` }, { providerTaskId: taskId });
      await fsp.appendFile(path.join(dir, `${taskId}.submits`), `${ctx.job.attempts}\n`);
      await fsp.writeFile(clock, String(Date.now()));
    } else await ctx.event('info', `FIXTURE: adopted provider task ${taskId} from an earlier attempt`);
    const started = Number(await fsp.readFile(clock, 'utf8').catch(() => String(Date.now())));
    while (Date.now() - started < renderMs) {
      await ctx.progress('GENERATING', { phase: 'generating', message: 'FIXTURE provider rendering', percent: Math.min(99, Math.round(((Date.now() - started) / renderMs) * 100)) });
      await new Promise((r) => setTimeout(r, 150));
    }
    await ctx.progress('DOWNLOADING', { phase: 'downloading', message: 'FIXTURE provider output' });
    const work = await tmpDir('fixture-take');
    const clip = path.join(work, 'clip.mp4'); const poster = path.join(work, 'poster.jpg');
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip]);
    await run('ffmpeg', ['-y', '-v', 'error', '-i', clip, '-frames:v', '1', poster]);
    await ctx.checkpoint();
    const out = jobOutputs(ctx.job);
    const p = await out.adopt('poster', poster, { expectKind: 'IMAGE' });
    const v = await out.adopt('video', clip, { expectKind: 'VIDEO' });
    // a hook for "killed between the files and the commit": the test kills the process while this file exists
    if (process.env.FIXTURE_PAUSE_BEFORE_COMMIT_MS) { await fsp.writeFile(path.join(dir, `${ctx.job.id}.before-commit`), ''); await new Promise((r) => setTimeout(r, Number(process.env.FIXTURE_PAUSE_BEFORE_COMMIT_MS))); }
    const take = await commitTake({
      jobId: ctx.job.id, productionId, shotId,
      assets: [
        assetFromStored(p.id, p.stored, { label: 'FIXTURE poster', tags: ['take', 'poster', 'fixture'], origin: 'DERIVED', jobId: ctx.job.id }),
        assetFromStored(v.id, v.stored, { label: 'FIXTURE take', tags: ['take', 'fixture'], origin: 'GENERATED', jobId: ctx.job.id, poster: `/api/media/${p.id}` }),
      ],
      take: { assetId: v.id, label: 'Take', provider: 'MINIMAX', model: 'FIXTURE (not a generation)', status: 'READY', jobId: ctx.job.id, thumbnailAssetId: p.id, durationSeconds: 2, select: 'IF_UNCHOSEN', requestId: taskId },
      qa: [{ name: 'picture', productionId, subjectKind: 'TAKE', subjectId: '', inspectorId: 'visual-quality-inspector', checks: [{ name: 'decodable', ok: true }], decision: 'ACCEPT', jobId: ctx.job.id }],
    });
    return { takeId: take.id, fixture: true };
  };
}

// the real worker, as `pnpm worker` runs it
await import('@/worker/index');
