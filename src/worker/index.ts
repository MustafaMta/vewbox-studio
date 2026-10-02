import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import type { Job, JobType } from '@/domain/jobs';
import { JOB_RESOURCE, JOB_TYPES } from '@/domain/jobs';
import { isStudioError } from '@/domain/errors';
import { env } from '@/server/env';
import { log as baseLog } from '@/server/log';
import { bootstrap } from '@/server/bootstrap';
import { closeDb } from '@/server/db/client';
import { addEvent, cancelled, claim, complete, fail, heartbeat, setProgress } from '@/server/jobs/queue';
import { HANDLERS, type HandlerContext } from './handlers';
import { gpuLease } from './gpu';
import { syncRegistry } from '@/server/registry';

/** THE WORKER — claims jobs from Postgres and runs them. Lanes: hosted (MiniMax, many at once), LLM (a few), CPU
 *  (ffmpeg, a few) and GPU (one at a time against the RTX 5090's VRAM budget). Each running job heartbeats its lease;
 *  a job whose worker dies is reclaimed by the next worker after the lease expires. Cancellation is cooperative:
 *  handlers call `ctx.checkpoint()` between steps and stop when asked. */

const log = baseLog.child({ workerRole: 'worker' });
const workerId = env().WORKER_ID || `${os.hostname()}-${process.pid}`;
/** Touched on every tick: the container healthcheck reads its age (see docker/worker.Dockerfile). */
const ALIVE_FILE = process.env.WORKER_ALIVE_FILE || path.join(os.tmpdir(), 'worker.alive');
const touchAlive = () => fsp.writeFile(ALIVE_FILE, new Date().toISOString()).catch(() => undefined);

type Lane = 'HOSTED' | 'LLM' | 'CPU' | 'GPU';
const LANES: Record<Lane, { limit: number; types: JobType[] }> = {
  HOSTED: { limit: env().WORKER_CONCURRENCY_HOSTED, types: JOB_TYPES.filter((t) => JOB_RESOURCE[t] === 'HOSTED') },
  LLM: { limit: env().WORKER_CONCURRENCY_LLM, types: JOB_TYPES.filter((t) => JOB_RESOURCE[t] === 'LLM') },
  CPU: { limit: env().WORKER_CONCURRENCY_CPU, types: JOB_TYPES.filter((t) => JOB_RESOURCE[t] === 'CPU') },
  GPU: { limit: 1, types: JOB_TYPES.filter((t) => JOB_RESOURCE[t] === 'GPU') },
};
const running: Record<Lane, Set<string>> = { HOSTED: new Set(), LLM: new Set(), CPU: new Set(), GPU: new Set() };
let stopping = false;

class Cancelled extends Error { constructor() { super('cancelled'); this.name = 'Cancelled'; } }

async function run(job: Job, lane: Lane) {
  const jl = log.child({ jobId: job.id, type: job.type, attempt: job.attempts, productionId: job.productionId, shotId: job.shotId });
  running[lane].add(job.id);
  let cancelRequested = false;
  const hb = setInterval(() => { heartbeat(job.id, workerId).then((r) => { if (r.cancelRequested) cancelRequested = true; }).catch((e) => { jl.warn({ err: e.message }, 'heartbeat failed; another worker may own this job now'); cancelRequested = true; }); }, 20_000);
  const ctx: HandlerContext = {
    job, log: jl, workerId,
    checkpoint: async () => { if (cancelRequested) throw new Cancelled(); },
    progress: async (status, progress, extra) => { if (cancelRequested) throw new Cancelled(); await setProgress(job.id, status, progress, extra); },
    event: (level, message, data) => addEvent(job.id, level, message, data),
    gpu: gpuLease,
  };
  const t0 = Date.now();
  // Recording the outcome can itself fail (the database is away, or a reset removed the job while it ran); that is
  // logged and never takes the worker down. The lease expires and another worker, or the next tick, carries on.
  const record = async (what: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { jl.error({ err: (e as Error).message, what }, 'could not record the job outcome'); } };
  try {
    const handler = HANDLERS[job.type];
    if (!handler) throw Object.assign(new Error(`No handler for ${job.type}`), { retryable: false });
    const result = await handler(ctx);
    await record('complete', () => complete(job.id, { ...result, ms: Date.now() - t0 }, result?.awaitingReview ? 'AWAITING_REVIEW' : 'COMPLETED'));
    jl.info({ ms: Date.now() - t0 }, 'job completed');
  } catch (e) {
    if (e instanceof Cancelled || cancelRequested) { await record('cancelled', () => cancelled(job.id)); jl.info('job cancelled'); }
    else {
      const err = e as Error & { code?: string; retryable?: boolean; details?: Record<string, unknown> };
      const code = isStudioError(e) ? e.code : err.code ?? 'ERROR';
      const retryable = isStudioError(e) ? (e.code === 'PROVIDER' || e.code === 'UNAVAILABLE') : err.retryable !== false;
      jl.error({ err: err.message, code, retryable, stack: err.stack?.split('\n').slice(0, 4).join(' | ') }, 'job failed');
      await record('fail', () => fail(job.id, { code, message: err.message, retryable, details: isStudioError(e) ? e.details : err.details }, job.attempts, job.maxAttempts));
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
