import postgres from 'postgres';
import type { Job } from '@/domain/jobs';
import { env } from './env';
import { log } from './log';
import { getJob } from './jobs/queue';

/** CHANGE FEED — one LISTEN connection per web process fans Postgres notifications out to every open SSE stream.
 *  Two channels: `vewbox_studio` (the state changed; carries the version and who changed it) and `vewbox_jobs` (a job
 *  changed: its status, its progress, its result). A job notification carries only the id; this process reads the
 *  row once and every open tab receives it with the event (`job`), so no tab has to reload the job list to learn
 *  what moved (audit H4: each progress report used to make every tab fetch the newest 300 jobs). */

export interface StudioEvent { type: 'studio' | 'job' | 'activity' | 'hello' | 'ping'; version?: number; origin?: string; jobId?: string; status?: string; departmentId?: string; agentId?: string; productionId?: string; kind?: string; at: string; /** on `job`: the row as it is now; null when it no longer exists */ job?: Job | null }
type Listener = (e: StudioEvent) => void;

/** Attach the job row to each `job` notification. Reads are coalesced per job: while one read for a job is in flight,
 *  further notifications for it only mark it changed, and one more read follows — so a job reporting progress every
 *  second costs at most one primary-key read per report per web process, and the last event always carries the
 *  latest row. A reset (`jobId: '*'`) and activity events pass through untouched; a failed read passes the bare
 *  notification on (the browser then reloads the list, as before). */
export function jobEnricher(load: (id: string) => Promise<Job | undefined>, emit: Listener): Listener {
  const inflight = new Set<string>();
  const dirty = new Set<string>();
  const run = async (e: StudioEvent, id: string) => {
    inflight.add(id);
    try {
      for (;;) {
        dirty.delete(id);
        try {
          const job = await load(id);
          emit({ ...e, status: job?.status ?? e.status, job: job ?? null, at: new Date().toISOString() });
        } catch (err) {
          log.warn({ err: (err as Error).message, jobId: id }, 'job event sent without its row');
          emit(e);
        }
        if (!dirty.has(id)) break;
      }
    } finally { inflight.delete(id); }
  };
  return (e) => {
    if (e.type !== 'job' || !e.jobId || e.jobId === '*') { emit(e); return; }
    if (inflight.has(e.jobId)) { dirty.add(e.jobId); return; }
    void run(e, e.jobId);
  };
}

const g = globalThis as unknown as { __vewboxListeners?: Set<Listener>; __vewboxListenConn?: ReturnType<typeof postgres>; __vewboxListening?: Promise<void> };
const listeners = () => (g.__vewboxListeners ??= new Set<Listener>());

async function ensureListening() {
  if (g.__vewboxListening) return g.__vewboxListening;
  g.__vewboxListening = (async () => {
    const conn = postgres(env().DATABASE_URL, { max: 1, onnotice: () => {} });
    g.__vewboxListenConn = conn;
    const broadcast: Listener = (e) => { for (const l of listeners()) l(e); };
    const enrich = jobEnricher(getJob, broadcast);
    const fan = (payload: string) => { try { enrich(JSON.parse(payload) as StudioEvent); } catch { /* malformed notification */ } };
    await conn.listen('vewbox_studio', fan, () => log.info('listening for studio changes'));
    await conn.listen('vewbox_jobs', fan);
  })();
  g.__vewboxListening.catch((e) => { log.error({ err: e }, 'listen failed'); g.__vewboxListening = undefined; });
  return g.__vewboxListening;
}

export async function subscribe(fn: Listener): Promise<() => void> {
  await ensureListening();
  listeners().add(fn);
  return () => listeners().delete(fn);
}
