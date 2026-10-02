import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import type { Job, JobType } from '@/domain/jobs';
import { JOB_TYPES } from '@/domain/jobs';
import { isStudioError } from '@/domain/errors';
import { env } from '@/server/env';
import { log as baseLog } from '@/server/log';
import { bootstrap } from '@/server/bootstrap';
import { closeDb } from '@/server/db/client';
import { ORCHESTRATION_LANE, addEvent, cancelled, claim, complete, fail, heartbeat, laneOf, setProgress, type Lane } from '@/server/jobs/queue';
import { HANDLERS, type HandlerContext } from './handlers';
import { gpuLease } from './gpu';
import { syncRegistry } from '@/server/registry';
import { syncOrg } from '@/server/org/registry';
import { agentForJob, classifyFailure, finishRun, RETRYABLE_CLASSES, reliabilityEvent, resolveReliability, startRun, studioEvent } from '@/server/org/runs';
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

class Cancelled extends Error { constructor() { super('cancelled'); this.name = 'Cancelled'; } }

async function run(job: Job, lane: Lane) {
  const agent = agentForJob(job);
  const jl = log.child({ jobId: job.id, type: job.type, attempt: job.attempts, productionId: job.productionId, shotId: job.shotId, agent: agent.id });
  running[lane].add(job.id);
  let cancelRequested = false;
  const hb = setInterval(() => { heartbeat(job.id, workerId).then((r) => { if (r.cancelRequested) cancelRequested = true; }).catch((e) => { jl.warn({ err: e.message }, 'heartbeat failed; another worker may own this job now'); cancelRequested = true; }); }, 20_000);
  const t0 = Date.now();
  // Recording the outcome can itself fail (the database is away, or a reset removed the job while it ran); that is
  // logged and never takes the worker down. The lease expires and another worker, or the next tick, carries on.
  const record = async (what: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { jl.error({ err: (e as Error).message, what }, 'could not record the job outcome'); } };
  // the agent run: who is doing this, which attempt, what it calls
  let runId = '';
  await record('start run', async () => { runId = await startRun(job, agent.id); });
  const label = JOB_LABELS[job.type]?.en ?? job.type;
  const ctx: HandlerContext = {
    job, log: jl, workerId, agent, runId,
    tool: runId ? makeToolRunner(agent, runId, jl) : (_id, fn) => fn(),
    // without a parent run (recording failed) the step still runs, unrecorded, rather than failing the job
    delegate: runId ? makeDelegator(job, runId, jl) : (_agentId, _purpose, fn) => fn((_id, f) => f()),
    activity: (kind, message, data, opts) => studioEvent({ departmentId: opts?.departmentId ?? agent.department, agentId: opts?.agentId ?? agent.id, productionId: opts?.productionId ?? job.productionId, kind, message, data, jobId: job.id }),
    checkpoint: async () => { if (cancelRequested) throw new Cancelled(); },
    progress: async (status, progress, extra) => { if (cancelRequested) throw new Cancelled(); await setProgress(job.id, status, progress, extra); },
    event: (level, message, data) => addEvent(job.id, level, message, data),
    gpu: gpuLease,
  };
  await studioEvent({ departmentId: agent.department, agentId: agent.id, productionId: job.productionId, kind: 'RUN_STARTED', message: `${agent.name} started: ${label}${job.attempts > 1 ? ` (attempt ${job.attempts} of ${job.maxAttempts})` : ''}`, data: { attempt: job.attempts, shotId: job.shotId }, jobId: job.id });
  try {
    const handler = HANDLERS[job.type];
    if (!handler) throw Object.assign(new Error(`No handler for ${job.type}`), { retryable: false });
    const result = await handler(ctx);
    const ms = Date.now() - t0;
    const outcome = result?.awaitingReview ? 'AWAITING_REVIEW' : 'COMPLETED';
    await record('complete', () => complete(job.id, { ...result, ms, agentId: agent.id, runId }, outcome));
    if (runId) await record('finish run', () => finishRun(runId, { outcome, ms, costUsd: typeof result?.costUsd === 'number' ? result.costUsd : undefined }));
    if (job.attempts > 1) await record('resolve reliability', () => resolveReliability(job.id, `attempt ${job.attempts} succeeded`));
    await studioEvent({ departmentId: agent.department, agentId: agent.id, productionId: job.productionId, kind: outcome === 'COMPLETED' ? 'RUN_COMPLETED' : 'RUN_REVIEW', message: `${agent.name} finished: ${label} in ${ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${(ms / 60_000).toFixed(1)} min`}${outcome === 'AWAITING_REVIEW' ? ' — awaiting review' : ''}`, data: { ms, attempt: job.attempts, shotId: job.shotId }, jobId: job.id });
    jl.info({ ms }, 'job completed');
  } catch (e) {
    const ms = Date.now() - t0;
    if (e instanceof Cancelled || cancelRequested) {
      await record('cancelled', () => cancelled(job.id));
      if (runId) await record('finish run', () => finishRun(runId, { outcome: 'CANCELLED', failureClass: 'CANCELLED', ms }));
      await studioEvent({ departmentId: agent.department, agentId: agent.id, productionId: job.productionId, kind: 'RUN_CANCELLED', message: `${agent.name} stopped: ${label} was cancelled`, jobId: job.id });
      jl.info('job cancelled');
    } else {
      const err = e as Error & { code?: string; retryable?: boolean; details?: Record<string, unknown> };
      const code = isStudioError(e) ? e.code : err.code ?? 'ERROR';
      const failureClass = classifyFailure(e);
      // a blind retry is allowed only for transient infrastructure and provider failures; every other class needs a
      // change (a corrected reference, plan or parameter) before it is tried again, which the retry endpoint provides
      const retryable = RETRYABLE_CLASSES.includes(failureClass) && (isStudioError(e) ? (e.code === 'PROVIDER' || e.code === 'UNAVAILABLE') : err.retryable !== false);
      jl.error({ err: err.message, code, failureClass, retryable, stack: err.stack?.split('\n').slice(0, 4).join(' | ') }, 'job failed');
      await record('fail', () => fail(job.id, { code, message: err.message, retryable, details: { ...(isStudioError(e) ? e.details : err.details), failureClass } }, job.attempts, job.maxAttempts));
      if (runId) await record('finish run', () => finishRun(runId, { outcome: 'FAILED', failureClass, errorMessage: err.message, ms }));
      // every failure is accounted; a retry that follows is an event the Reliability Engineer sees
      await record('reliability', () => reliabilityEvent({ job, failureClass, failureMessage: err.message, changeMade: retryable && job.attempts < job.maxAttempts ? `automatic retry scheduled (${failureClass})` : undefined }));
      await studioEvent({ departmentId: agent.department, agentId: agent.id, productionId: job.productionId, kind: 'RUN_FAILED', message: `${agent.name} failed: ${label} — ${failureClass}: ${err.message.slice(0, 200)}`, data: { failureClass, code, attempt: job.attempts, retryable, shotId: job.shotId }, jobId: job.id });
    }
  } finally {
    clearInterval(hb);
    running[lane].delete(job.id);
  }
}

async function tick() {
  await touchAlive();
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
  await bootstrap();
  await syncOrg();
  syncRegistry().catch((e) => log.warn({ err: (e as Error).message }, 'registry sync failed'));
  const loop = setInterval(() => { void tick(); }, 1500);
  void tick();
  const shutdown = async (sig: string) => {
    if (stopping) return;
    stopping = true;
    log.info({ sig }, 'worker stopping; waiting for running jobs');
    clearInterval(loop);
    const deadline = Date.now() + 25_000;
    while (Object.values(running).some((s) => s.size > 0) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 500));
    await closeDb();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  // a stray rejection (a heartbeat after a reset, a provider stream closing late) is logged, not fatal
  process.on('unhandledRejection', (e) => log.error({ err: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack?.split('\n').slice(0, 5).join(' | ') : undefined }, 'unhandled rejection'));
  process.on('uncaughtException', (e) => { log.fatal({ err: e.message, stack: e.stack?.split('\n').slice(0, 5).join(' | ') }, 'uncaught exception; stopping'); void shutdown('uncaughtException'); });
}

main().catch((e) => { log.fatal({ err: e }, 'worker crashed'); process.exit(1); });
