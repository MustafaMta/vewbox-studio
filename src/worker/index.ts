import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import type { Job, JobProgress, JobStatus, JobType } from '@/domain/jobs';
import { JOB_TYPES } from '@/domain/jobs';
import { runPhaseLabel, runPhaseOf, type RunPhase } from '@/domain/phases';
import { isStudioError } from '@/domain/errors';
import { env } from '@/server/env';
import { log as baseLog } from '@/server/log';
import { bootstrap } from '@/server/bootstrap';
import { closeDb } from '@/server/db/client';
import { ORCHESTRATION_LANE, addEvent, cancelled, claim, complete, fail, heartbeat, heartbeatIntervalMs, laneOf, reapStale, releaseForRestart, setProgress, suspend, type Lane } from '@/server/jobs/queue';
import { releaseProcessGpuLeases } from '@/server/gpu/lease';
import { tmpRoot } from '@/server/media/ffmpeg';
import { waitRequestOf } from './handlers/wait';
import { startHeartbeat } from './heartbeat';
import { JobCancelled, LeaseLost, deadlineExceeded, raceAbort, runInJobScope, throwIfAborted } from '@/server/jobs/context';
import { jobDeadline } from '@/server/jobs/deadlines';
import { workDeadlineMs } from '@/server/jobs/work-deadline';
import { isFencedWrite } from '@/server/jobs/fence';
import { sweepJobFiles } from '@/server/jobs/outputs';
import { settleDialogueReviews } from '@/server/jobs/reviews';
import { HANDLERS, type HandlerContext } from './handlers';
import { step } from './handlers/step';
import { gpuLease } from './gpu';
import type { FailureClass } from '@/server/org/model';
import { syncRegistry } from '@/server/registry';
import { agentForJob, classifyFailure, finishAttempt, finishRun, RETRYABLE_CLASSES, recordRunPhase, reliabilityEvent, resolveReliability, resumeRun, startAttempt, startRun, studioEvent } from '@/server/org/runs';
import { makeDelegator, makeToolRunner } from '@/server/org/tools';
import { JOB_LABELS } from '@/domain/jobs';

/** THE WORKER — claims jobs from Postgres and runs them. Lanes: hosted (MiniMax, many at once), LLM (a few), CPU
 *  (ffmpeg, a few), GPU (one at a time against the RTX 5090's VRAM budget) and orchestration (chains that wait on
 *  their child jobs, so a waiting chain never holds a CPU slot). Each running job heartbeats its lease;
 *  a job whose worker dies is reclaimed by the next worker after the lease expires. Cancellation is cooperative:
 *  handlers call `ctx.checkpoint()` between steps and stop when asked. */

const log = baseLog.child({ workerRole: 'worker' });
const workerId = env().WORKER_ID || `${os.hostname()}-${process.pid}`;
/** Touched on every tick: the container healthcheck reads its age (see docker/worker.Dockerfile). */
const ALIVE_FILE = process.env.WORKER_ALIVE_FILE || path.join(os.tmpdir(), 'worker.alive');
const touchAlive = () => fsp.writeFile(ALIVE_FILE, new Date().toISOString()).catch(() => undefined);

// orchestrators (CREATE_CHARACTER, PRODUCE) wait on their children in a lane of their own (src/server/jobs/queue.ts)
const LANES: Record<Lane, { limit: number; types: JobType[] }> = {
  HOSTED: { limit: env().WORKER_CONCURRENCY_HOSTED, types: JOB_TYPES.filter((t) => laneOf(t) === 'HOSTED') },
  LLM: { limit: env().WORKER_CONCURRENCY_LLM, types: JOB_TYPES.filter((t) => laneOf(t) === 'LLM') },
  CPU: { limit: env().WORKER_CONCURRENCY_CPU, types: JOB_TYPES.filter((t) => laneOf(t) === 'CPU') },
  GPU: { limit: 1, types: JOB_TYPES.filter((t) => laneOf(t) === 'GPU') },
  ORCHESTRATION: { limit: ORCHESTRATION_LANE.limit, types: JOB_TYPES.filter((t) => laneOf(t) === 'ORCHESTRATION') },
};
const running: Record<Lane, Set<string>> = { HOSTED: new Set(), LLM: new Set(), CPU: new Set(), GPU: new Set(), ORCHESTRATION: new Set() };
let stopping = false;
/** the lease of every running attempt, so a stopping worker can hand them back */
const leases = new Map<string, { workerId: string; attempt: number }>();
/** jobs a stopping worker handed back to the queue: never aborted, frozen at their next checkpoint */
const handedBack = new Set<string>();

/** How long a stopped handler that ignores its signal is waited for before the lane slot is freed anyway. */
const ABORT_GRACE_MS = 5_000;

async function run(job: Job, lane: Lane) {
  const agent = agentForJob(job);
  const jl = log.child({ jobId: job.id, type: job.type, attempt: job.attempts, productionId: job.productionId, shotId: job.shotId, agent: agent.id });
  running[lane].add(job.id);
  let cancelRequested = false;
  // the lease this attempt holds: every write of the job's progress and outcome is fenced on it, so a worker that
  // lost the job (its lease went stale and another worker reclaimed it) can no longer overwrite the new attempt
  const lease = { workerId, attempt: job.attempts };
  leases.set(job.id, lease);
  let leaseLost = false;
  // THE ATTEMPT'S SIGNAL (audit H5): aborted on cancel, at the deadline, or when the lease is lost; it kills ffmpeg
  // children, aborts provider requests and cancels ComfyUI prompts (src/server/jobs/context.ts)
  const jobCtrl = new AbortController();
  // a job handed back by a stopping worker (releaseForRestart) is never aborted: the abort would cancel the provider
  // task (a ComfyUI prompt) the next attempt is meant to adopt; the attempt freezes at its next checkpoint instead
  const stop = (reason: unknown) => { if (handedBack.has(job.id)) return; if (!jobCtrl.signal.aborted) jobCtrl.abort(reason); };
  const frozen = () => new Promise<never>(() => {});
  // the flat deadline, or longer when the job's own work asks for it (PLAN_SHOTS: its scenes at the model's speed)
  const deadline = jobDeadline(job.type, process.env, await workDeadlineMs(job));
  const deadlineTimer = deadline.mode === 'off' ? undefined : setTimeout(() => {
    jl.warn({ deadlineMs: deadline.ms, mode: deadline.mode }, 'job passed its deadline');
    void addEvent(job.id, 'warn', deadline.mode === 'enforce' ? 'deadline passed: stopping the job' : 'deadline passed (JOB_DEADLINES=log: not stopped)', { deadlineMs: deadline.ms }).catch(() => undefined);
    if (deadline.mode === 'enforce') stop(deadlineExceeded(JOB_LABELS[job.type] ?? job.type, deadline.ms));
  }, deadline.ms);
  // a lost lease (CONFLICT) stops the attempt; a transient database error is retried, never a cancellation (audit H6)
  const stopHeartbeat = startHeartbeat({
    beat: () => heartbeat(job.id, workerId, job.attempts), intervalMs: heartbeatIntervalMs(),
    onCancel: () => { cancelRequested = true; stop(new JobCancelled()); },
    onLost: () => { jl.warn('heartbeat: another worker owns this job now; stopping this attempt'); leaseLost = true; cancelRequested = true; stop(new LeaseLost()); },
    onError: (e, failures) => jl.warn({ err: (e as Error).message, failures }, 'heartbeat failed; retrying (the job keeps running)'),
  });
  const t0 = Date.now();
  // Recording the outcome can itself fail (the database is away, or a reset removed the job while it ran); that is
  // logged and never takes the worker down. The lease expires and another worker, or the next tick, carries on.
  const record = async (what: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { jl.error({ err: (e as Error).message, what }, 'could not record the job outcome'); } };
  // the agent run: who is doing this, which attempt, what it calls
  let runId = '';
  // a woken orchestrator (step 14) continues the run its earlier passes left open
  await record('start run', async () => { runId = job.wakes ? await resumeRun(job, agent.id) : await startRun(job, agent.id); });
  // THE ATTEMPT'S ROW (step 15): one row per attempt in job_attempts — who, when, how it ended, why it failed
  await record('start attempt', () => startAttempt(job, workerId, runId));
  // a handed-back attempt was closed as INTERRUPTED by releaseForRestart; nothing it does afterwards rewrites that
  const attemptEnded = (outcome: Parameters<typeof finishAttempt>[2]['outcome'], extra: { failureClass?: FailureClass; failureMessage?: string } = {}) => (handedBack.has(job.id) ? Promise.resolve() : record('finish attempt', () => finishAttempt(job.id, job.attempts, { outcome, ms: Date.now() - t0, ...extra })));
  const label = JOB_LABELS[job.type] ?? job.type;
  // THE RUN'S PHASES (B9): startRun recorded QUEUED and PREPARING; every later progress report that moves the job
  // to another phase (GENERATING, CHECKING, FINISHING) is appended to the run as a timed event and announced, so
  // a status row can say how long each phase took and what to expect next time
  let lastPhase: RunPhase | null = 'PREPARING';
  const phaseChanged = async (status: JobStatus, progress: JobProgress) => {
    const phase = runPhaseOf(status, progress.phase);
    if (!phase || phase === lastPhase) return;
    lastPhase = phase;
    const at = new Date().toISOString();
    await record('record phase', async () => { if (runId) await recordRunPhase(runId, { phase, at, message: progress.message?.slice(0, 200) }); });
    await studioEvent({ departmentId: agent.department, agentId: agent.id, productionId: job.productionId, kind: 'RUN_PHASE', message: `${agent.name}: ${runPhaseLabel(job.type, phase).toLowerCase()} — ${label}`, data: { phase, label: runPhaseLabel(job.type, phase), shotId: job.shotId, runId, attempt: job.attempts }, jobId: job.id });
  };
  const ctx: HandlerContext = {
    job, log: jl, workerId, agent, runId,
    tool: runId ? makeToolRunner(agent, runId, jl) : (_id, fn) => fn(),
    // without a parent run (recording failed) the step still runs, unrecorded, rather than failing the job
    delegate: runId ? makeDelegator(job, runId, jl) : (_agentId, _purpose, fn) => fn((_id, f) => f()),
    activity: (kind, message, data, opts) => studioEvent({ departmentId: opts?.departmentId ?? agent.department, agentId: opts?.agentId ?? agent.id, productionId: opts?.productionId ?? job.productionId, kind, message, data, jobId: job.id }),
    checkpoint: async () => { if (handedBack.has(job.id)) return frozen(); if (cancelRequested) throw new JobCancelled(); throwIfAborted(jobCtrl.signal); },
    progress: async (status, progress, extra) => { if (handedBack.has(job.id)) return frozen(); if (cancelRequested) throw new JobCancelled(); throwIfAborted(jobCtrl.signal); if (!(await setProgress(job.id, status, progress, extra, lease))) { leaseLost = true; cancelRequested = true; stop(new LeaseLost()); throw new LeaseLost(); } await phaseChanged(status, progress); },
    event: (level, message, data) => addEvent(job.id, level, message, data),
    gpu: gpuLease,
    signal: jobCtrl.signal,
  };
  await studioEvent({ departmentId: agent.department, agentId: agent.id, productionId: job.productionId, kind: 'RUN_STARTED', message: `${agent.name} started: ${label}${job.attempts > 1 ? ` (attempt ${job.attempts} of ${job.maxAttempts})` : ''}`, data: { attempt: job.attempts, shotId: job.shotId }, jobId: job.id });
  // THE JOB GC (audit C2/M5, step 6): files an earlier attempt of this job stored but never committed (it crashed, or
  // lost its lease, between the two) are removed before this attempt starts; their commits can no longer happen
  if (job.attempts > 1) await record('sweep earlier attempts', async () => { await sweepJobFiles(job.id, { attempts: (a) => a !== undefined && a < job.attempts, reason: `earlier attempts of the job, before attempt ${job.attempts}` }); });
  try {
    const handler = HANDLERS[job.type];
    if (!handler) throw Object.assign(new Error(`No handler for ${job.type}`), { retryable: false });
    // the handler runs in the job scope (signal + lease, src/server/jobs/context.ts); a handler that ignores an abort
    // is let go of after ABORT_GRACE_MS so its lane slot is freed — its late writes are fenced on the lease
    const result = await raceAbort(runInJobScope({ jobId: job.id, signal: jobCtrl.signal, lease }, () => handler(ctx)), jobCtrl.signal, ABORT_GRACE_MS);
    const ms = Date.now() - t0;
    // A PLANNER'S PASS THAT WAITS (step 14): its dependencies and plan are recorded and the job becomes WAITING with no
    // lease — the slot is free; the jobs it waits for wake it. The run stays open across passes.
    const wait = waitRequestOf(result);
    if (wait) {
      const outcome = { state: 'lost' as 'waiting' | 'ready' | 'lost' };
      await record('suspend', async () => { outcome.state = await suspend(job.id, wait.jobIds, { lease, progress: wait.progress, plan: wait.plan }); });
      const { state } = outcome;
      await attemptEnded(state === 'lost' ? 'LEASE_LOST' : 'WAITING');
      if (state === 'lost' && runId) await record('finish run', () => finishRun(runId, { outcome: 'FAILED', failureClass: 'INFRASTRUCTURE', errorMessage: 'lease lost before the pass could wait: another worker reclaimed the job', ms }));
      jl.info({ ms, waitingFor: wait.jobIds.length, state }, state === 'ready' ? 'pass done; continues at once' : 'pass done; waiting for its jobs');
      return;
    }
    const outcome = result?.awaitingReview ? 'AWAITING_REVIEW' : 'COMPLETED';
    await record('complete', async () => { if (!(await complete(job.id, { ...result, ms, agentId: agent.id, runId }, outcome, lease))) leaseLost = true; });
    await attemptEnded(leaseLost ? 'LEASE_LOST' : outcome);
    if (leaseLost) {
      if (runId) await record('finish run', () => finishRun(runId, { outcome: 'FAILED', failureClass: 'INFRASTRUCTURE', errorMessage: 'lease lost before completion: another worker reclaimed the job; this attempt’s result was discarded', ms }));
      jl.warn('lease lost before completion; the result was discarded (another attempt owns the job)');
      return;
    }
    if (runId) await record('finish run', () => finishRun(runId, { outcome, ms, costUsd: typeof result?.costUsd === 'number' ? result.costUsd : undefined }));
    if (job.attempts > 1) await record('resolve reliability', () => resolveReliability(job.id, `attempt ${job.attempts} succeeded`));
    // lines recorded again settle earlier reviews of the production whose flagged lines are now all decided
    if (job.type === 'DIALOGUE_AUDIO' && job.productionId) await record('settle dialogue reviews', async () => { await settleDialogueReviews([job.productionId!]); });
    await studioEvent({ departmentId: agent.department, agentId: agent.id, productionId: job.productionId, kind: outcome === 'COMPLETED' ? 'RUN_COMPLETED' : 'RUN_REVIEW', message: `${agent.name} finished: ${label} in ${ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${(ms / 60_000).toFixed(1)} min`}${outcome === 'AWAITING_REVIEW' ? ' — awaiting review' : ''}`, data: { ms, attempt: job.attempts, shotId: job.shotId }, jobId: job.id });
    jl.info({ ms }, 'job completed');
  } catch (thrown) {
    const ms = Date.now() - t0;
    // stopped by its signal: the reason decides the outcome, whatever the provider reported on the way out
    const e = jobCtrl.signal.aborted ? jobCtrl.signal.reason : thrown;
    // a lost lease, seen by the heartbeat, a progress write or a fenced result write (src/server/jobs/fence.ts)
    if (leaseLost || e instanceof LeaseLost || isFencedWrite(e)) {
      // another worker reclaimed this job: its attempt owns the record now; only this run is closed
      if (runId) await record('finish run', () => finishRun(runId, { outcome: 'FAILED', failureClass: 'INFRASTRUCTURE', errorMessage: 'lease lost: another worker reclaimed the job; this attempt’s writes were refused', ms }));
      await attemptEnded('LEASE_LOST');
      jl.warn('lease lost; this attempt stopped without writing the job');
    } else if (e instanceof JobCancelled || cancelRequested) {
      await record('cancelled', async () => { await cancelled(job.id, lease); });
      await attemptEnded('CANCELLED');
      if (runId) await record('finish run', () => finishRun(runId, { outcome: 'CANCELLED', failureClass: 'CANCELLED', ms }));
      await studioEvent({ departmentId: agent.department, agentId: agent.id, productionId: job.productionId, kind: 'RUN_CANCELLED', message: `${agent.name} stopped: ${label} was cancelled`, jobId: job.id });
      jl.info('job cancelled');
    } else {
      const err = e as Error & { code?: string; retryable?: boolean; details?: Record<string, unknown> };
      const code = isStudioError(e) ? e.code : err.code ?? 'ERROR';
      // a blind retry is allowed only for transient infrastructure and provider failures; every other class needs a
      // change (a corrected reference, plan or parameter) before it is tried again, which the retry endpoint provides
      const retryPolicy = (failureClass: FailureClass) => RETRYABLE_CLASSES.includes(failureClass) && (isStudioError(e) ? (e.code === 'PROVIDER' || e.code === 'UNAVAILABLE') : err.retryable !== false);
      // FAILURE CLASSIFICATION (the Reliability Engineer's step): the class, the retry decision and the reliability
      // event every failure leaves; if the step cannot be recorded the classification still decides
      let verdict: { failureClass: FailureClass; retryable: boolean };
      try {
        verdict = await step(ctx, 'reliability-engineer', `failure-classification: ${label}`, async () => {
          const failureClass = classifyFailure(e);
          const retryable = retryPolicy(failureClass);
          await reliabilityEvent({ job, failureClass, failureMessage: err.message, changeMade: retryable && job.attempts < job.maxAttempts ? `automatic retry scheduled (${failureClass})` : undefined });
          return { failureClass, retryable };
        });
      } catch (re) {
        jl.error({ err: (re as Error).message, what: 'reliability' }, 'could not record the job outcome');
        const failureClass = classifyFailure(e);
        verdict = { failureClass, retryable: retryPolicy(failureClass) };
      }
      const { failureClass, retryable } = verdict;
      jl.error({ err: err.message, code, failureClass, retryable, stack: err.stack?.split('\n').slice(0, 4).join(' | ') }, 'job failed');
      await record('fail', async () => { if (!(await fail(job.id, { code, message: err.message, retryable, details: { ...(isStudioError(e) ? e.details : err.details), failureClass } }, job.attempts, job.maxAttempts, lease))) jl.warn('lease lost before the failure was written; another attempt owns the job'); });
      await attemptEnded('FAILED', { failureClass, failureMessage: err.message });
      if (runId) await record('finish run', () => finishRun(runId, { outcome: 'FAILED', failureClass, errorMessage: err.message, ms }));
      await studioEvent({ departmentId: agent.department, agentId: agent.id, productionId: job.productionId, kind: 'RUN_FAILED', message: `${agent.name} failed: ${label} — ${failureClass}: ${err.message.slice(0, 200)}`, data: { failureClass, code, attempt: job.attempts, retryable, shotId: job.shotId }, jobId: job.id });
    }
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
    stopHeartbeat();
    // this attempt is over (its outcome recorded, or its lease lost — a late write of it is fenced either way): the
    // files it — or an earlier attempt still finishing when it started — stored and did not commit are removed; a
    // later attempt's files are never touched
    await record('sweep this attempt', async () => { await sweepJobFiles(job.id, { attempts: (a) => a !== undefined && a <= job.attempts, reason: `attempt ${job.attempts} ended` }); });
    running[lane].delete(job.id);
    leases.delete(job.id);
  }
}

/** Remove entries of the work folder untouched for `maxAgeMs` (default 12 h). */
async function sweepStaleTmp(maxAgeMs = 12 * 3600_000): Promise<void> {
  const root = tmpRoot();
  const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => []);
  let removed = 0;
  for (const e of entries) {
    const abs = path.join(root, e.name);
    const st = await fsp.stat(abs).catch(() => null);
    if (!st || Date.now() - st.mtimeMs < maxAgeMs) continue;
    await fsp.rm(abs, { recursive: true, force: true }).then(() => { removed++; }, () => undefined);
  }
  if (removed) log.info({ root, removed }, 'removed old work folders (left by stopped or killed workers)');
}

let lastReap = 0;
async function tick() {
  await touchAlive();
  // settle stale jobs no worker may take over (cancelled, or out of attempts) — every 15 s is plenty
  if (Date.now() - lastReap > 15_000) {
    lastReap = Date.now();
    try { const r = await reapStale(); if (r.cancelled.length || r.failed.length) log.warn(r, 'reaped stale jobs'); } catch (e) { log.error({ err: (e as Error).message }, 'reap failed'); }
  }
  for (const lane of Object.keys(LANES) as Lane[]) {
    const cfg = LANES[lane];
    while (!stopping && running[lane].size < cfg.limit) {
      let job: Job | undefined;
      try { job = await claim(workerId, cfg.types); } catch (e) { log.error({ err: (e as Error).message }, 'claim failed'); break; }
      if (!job) break;
      run(job, lane).catch((e) => log.error({ err: (e as Error).message, jobId: job!.id }, 'job runner threw'));
    }
  }
}

async function main() {
  log.info({ workerId, lanes: Object.fromEntries(Object.entries(LANES).map(([k, v]) => [k, v.limit])) }, 'worker starting');
  // bootstrap() migrates, seeds an empty database and syncs the organisation (once: audit B5 measured a second sync
  // here, 106–211 ms per start)
  await bootstrap();
  // work folders a killed worker left behind (an export's conformed parts, a take's downloads: gigabytes) are removed
  // once they are older than any job may run (the longest deadline is 3 h; an orchestrator's work folders are small)
  void sweepStaleTmp().catch((e: Error) => log.warn({ err: e.message }, 'could not sweep old work folders'));
  syncRegistry().catch((e) => log.warn({ err: (e as Error).message }, 'registry sync failed'));
  const loop = setInterval(() => { void tick(); }, 1500);
  void tick();
  // A STOPPING WORKER (audit M7): no new claims; the running jobs get a short grace to finish; whatever still runs
  // is handed back to the queue at once (releaseForRestart: QUEUED, the attempt not counted, closed as INTERRUPTED,
  // provider tasks left running for the next attempt to adopt) and this process's GPU lease rows are released — the
  // next worker continues immediately instead of waiting out a 90 s lease and burning an attempt.
  const shutdown = async (sig: string) => {
    if (stopping) return;
    stopping = true;
    const graceMs = Number(process.env.WORKER_SHUTDOWN_GRACE_MS ?? 10_000);
    log.info({ sig, graceMs }, 'worker stopping; waiting briefly for running jobs, then handing the rest back');
    clearInterval(loop);
    const deadline = Date.now() + (Number.isFinite(graceMs) ? graceMs : 10_000);
    while (Object.values(running).some((s) => s.size > 0) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));
    // a crash is not a restart: after an uncaught exception the running jobs are NOT handed back (one of them may be
    // what crashed the worker — handing it back for free would retry it forever); their leases go stale and the
    // reclaim counts the attempt, as for a killed worker
    for (const [jobId, lease] of sig === 'uncaughtException' ? [] : leases) {
      handedBack.add(jobId);
      try { await releaseForRestart(jobId, lease, `worker ${workerId} stopped (${sig})`); log.warn({ jobId, attempt: lease.attempt }, 'running job handed back to the queue'); }
      catch (e) { log.error({ jobId, err: (e as Error).message }, 'could not hand a running job back; its lease will expire'); }
    }
    await releaseProcessGpuLeases(env().WORKER_ID || `${os.hostname()}-${process.pid}`).catch((e: Error) => log.warn({ err: e.message }, 'could not release the GPU lease rows; they expire on their own'));
    await closeDb();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  // a supervisor that cannot send signals (Windows: a child process is terminated, never signalled) asks over IPC
  process.on('message', (m) => { if (m === 'shutdown') void shutdown('IPC'); });
  // a stray rejection (a heartbeat after a reset, a provider stream closing late) is logged, not fatal
  process.on('unhandledRejection', (e) => log.error({ err: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack?.split('\n').slice(0, 5).join(' | ') : undefined }, 'unhandled rejection'));
  process.on('uncaughtException', (e) => { log.fatal({ err: e.message, stack: e.stack?.split('\n').slice(0, 5).join(' | ') }, 'uncaught exception; stopping'); void shutdown('uncaughtException'); });
}

main().catch((e) => { log.fatal({ err: e }, 'worker crashed'); process.exit(1); });
