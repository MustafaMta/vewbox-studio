import postgres from 'postgres';
import { env } from './env';
import { log } from './log';

/** CHANGE FEED — one LISTEN connection per web process fans Postgres notifications out to every open SSE stream.
 *  Two channels: `vewbox_studio` (the state changed; carries the version and who changed it) and `vewbox_jobs` (a job
 *  changed status). */

export interface StudioEvent { type: 'studio' | 'job' | 'hello' | 'ping'; version?: number; origin?: string; jobId?: string; status?: string; at: string }
type Listener = (e: StudioEvent) => void;

const g = globalThis as unknown as { __vewboxListeners?: Set<Listener>; __vewboxListenConn?: ReturnType<typeof postgres>; __vewboxListening?: Promise<void> };
const listeners = () => (g.__vewboxListeners ??= new Set<Listener>());

async function ensureListening() {
  if (g.__vewboxListening) return g.__vewboxListening;
  g.__vewboxListening = (async () => {
    const conn = postgres(env().DATABASE_URL, { max: 1, onnotice: () => {} });
    g.__vewboxListenConn = conn;
    const fan = (payload: string) => { try { const e = JSON.parse(payload) as StudioEvent; for (const l of listeners()) l(e); } catch { /* malformed notification */ } };
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
