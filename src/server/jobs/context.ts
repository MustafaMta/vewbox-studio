import { AsyncLocalStorage } from 'node:async_hooks';
import { StudioError } from '@/domain/errors';

/** THE JOB SCOPE (docs/BACKEND-AUDIT-2026-10.md H5 and C1, steps 4–5). The worker runs every handler inside a scope
 *  that carries, through every await, without changing a single provider signature:
 *  - `signal`: aborted when the job is cancelled, passes its deadline, loses its lease, or (narrowed by the tool
 *    runner) when one tool call times out. ffmpeg/ffprobe children are killed on it (src/server/media/exec.ts,
 *    media/ffmpeg.ts), every provider fetch is aborted on it (`followJobSignal`), ComfyUI prompts are cancelled on it.
 *  - `lease`: the attempt's lease (worker id + attempt number). Every studio command the attempt writes is fenced on
 *    it inside the command's own transaction (src/server/studio/engine.ts).
 *  Outside a job (the web server, scripts, tests) there is no scope: no signal, no fence — as before. */

export interface Lease { workerId: string; attempt: number }
export interface JobScope { jobId: string; signal: AbortSignal; lease?: Lease }

const als = new AsyncLocalStorage<JobScope>();

export const runInJobScope = <T>(scope: JobScope, fn: () => T): T => als.run(scope, fn);
export const jobScope = (): JobScope | undefined => als.getStore();
export const jobSignal = (): AbortSignal | undefined => als.getStore()?.signal;

/** Run `fn` with a narrower signal (the scope's AND `signal`), keeping the job and its lease. */
export function withSignal<T>(signal: AbortSignal, fn: () => T): T {
  const s = als.getStore();
  if (!s) return als.run({ jobId: '', signal }, fn);
  return als.run({ ...s, signal: AbortSignal.any([s.signal, signal]) }, fn);
}

/** Abort `ctrl` when the job's signal aborts (with the same reason). Returns the unlink to call in `finally`. */
export function followJobSignal(ctrl: AbortController, signal: AbortSignal | undefined = jobSignal()): () => void {
  if (!signal) return () => {};
  if (signal.aborted) { ctrl.abort(signal.reason); return () => {}; }
  const on = () => ctrl.abort(signal.reason);
  signal.addEventListener('abort', on, { once: true });
  return () => signal.removeEventListener('abort', on);
}

/** The job's reason when `signal` was aborted by a stopped job (not by a plain timer's `abort()`, whose reason is a
 *  DOMException) — providers rethrow it instead of reporting "not reachable" or "timed out". */
export const stopReasonOf = (signal: AbortSignal): unknown => (signal.aborted && signal.reason && !(signal.reason instanceof DOMException) ? signal.reason : undefined);

/** The reasons a job's signal is aborted with. */
export class JobCancelled extends Error { constructor() { super('cancelled'); this.name = 'Cancelled'; } }
export class LeaseLost extends Error { constructor() { super('lease lost: another worker owns this job now'); this.name = 'LeaseLost'; } }
export const deadlineExceeded = (what: string, ms: number) => new StudioError('UNAVAILABLE', `${what} did not finish within its deadline of ${ms < 3_600_000 ? `${Math.round(ms / 60_000)} min` : `${(ms / 3_600_000).toFixed(1)} h`}; it was stopped.`, { failureClass: 'INFRASTRUCTURE', reason: 'DEADLINE', deadlineMs: ms });

/** Throw the abort reason when the signal is aborted (a checkpoint). */
export function throwIfAborted(signal: AbortSignal | undefined = jobSignal()): void {
  if (signal?.aborted) throw signal.reason ?? new JobCancelled();
}

/** Settle with `p`, or reject with the signal's reason once it aborts and `graceMs` more have passed without `p`
 *  settling — so work that ignores the signal cannot hold its caller (a lane slot, a tool call) past an abort. */
export function raceAbort<T>(p: Promise<T>, signal: AbortSignal | undefined, graceMs = 0): Promise<T> {
  if (!signal) return p;
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => { timer = setTimeout(() => reject(signal.reason ?? new JobCancelled()), graceMs); };
    if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true });
    p.then((v) => { if (timer) clearTimeout(timer); signal.removeEventListener('abort', onAbort); resolve(v); }, (e) => { if (timer) clearTimeout(timer); signal.removeEventListener('abort', onAbort); reject(e); });
  });
}

/** A sleep that ends early (rejecting with the reason) when the signal aborts. */
export function sleep(ms: number, signal: AbortSignal | undefined = jobSignal()): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason ?? new JobCancelled()); return; }
    const t = setTimeout(() => { signal?.removeEventListener('abort', on); resolve(); }, ms);
    const on = () => { clearTimeout(t); reject(signal!.reason ?? new JobCancelled()); };
    signal?.addEventListener('abort', on, { once: true });
  });
}
