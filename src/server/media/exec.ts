import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { jobSignal } from '../jobs/context';

/** ONE WAY TO RUN ffmpeg/ffprobe AND READ THEIR OUTPUT (docs/BACKEND-AUDIT-2026-10.md H5, step 4): every child has a
 *  timeout (default 20 min; a child that hangs no longer heartbeats forever) and is killed (SIGKILL) when the running
 *  job is cancelled, passes its deadline or loses its lease — the job's signal from src/server/jobs/context.ts, or an
 *  explicit `signal`. Same shape as promisify(execFile). */

const run = promisify(execFile);
export const DEFAULT_EXEC_TIMEOUT_MS = 20 * 60_000;

interface Options { maxBuffer?: number; timeout?: number; signal?: AbortSignal; cwd?: string }
export function execFileP(file: string, args: readonly string[], opts: Options & { encoding: 'buffer' }): Promise<{ stdout: Buffer; stderr: Buffer }>;
export function execFileP(file: string, args: readonly string[], opts?: Options & { encoding?: 'utf8' }): Promise<{ stdout: string; stderr: string }>;
export function execFileP(file: string, args: readonly string[], opts: Options & { encoding?: 'buffer' | 'utf8' } = {}): Promise<{ stdout: string | Buffer; stderr: string | Buffer }> {
  const signal = opts.signal ?? jobSignal();
  const o = { ...opts, timeout: opts.timeout ?? DEFAULT_EXEC_TIMEOUT_MS, killSignal: 'SIGKILL' as const, windowsHide: true, ...(signal ? { signal } : {}) };
  return (opts.encoding === 'buffer' ? run(file, args, { ...o, encoding: 'buffer' }) : run(file, args, { ...o, encoding: 'utf8' })) as Promise<{ stdout: string | Buffer; stderr: string | Buffer }>;
}
