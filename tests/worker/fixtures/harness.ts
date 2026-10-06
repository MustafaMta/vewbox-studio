import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** The failure-injection harness's process control (tests/worker/*-recovery.test.ts): start the FIXTURE worker
 *  (fixtures/fault-worker.ts = the real worker loop), hard-kill it, stop it gracefully, wait for a condition. */

export interface Worker { name: string; child: ChildProcess; exited: Promise<number | null> }

export function harness(opts: { dir: string; lease?: number }) {
  const children: ChildProcess[] = [];
  const logDir = path.join(opts.dir, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  return {
    lease: opts.lease ?? 4,
    start(name: string, env: Record<string, string> = {}): Worker {
      const out = fs.openSync(path.join(logDir, `${name}.log`), 'a');
      const child = spawn(process.execPath, ['--import', 'tsx', 'tests/worker/fixtures/fault-worker.ts'], {
        cwd: process.cwd(), stdio: ['ignore', out, out, 'ipc'], windowsHide: true,
        env: { ...process.env, WORKER_ID: name, WORKER_LEASE_SECONDS: String(opts.lease ?? 4), WORKER_SHUTDOWN_GRACE_MS: '300', FIXTURE_DIR: opts.dir, FIXTURE_TAKE: '1', FIXTURE_RENDER_MS: '3000', ...env },
      });
      children.push(child);
      return { name, child, exited: new Promise((r) => child.once('exit', (c) => r(c))) };
    },
    /** TerminateProcess / SIGKILL: no handler runs */
    async kill(w: Worker) { w.child.kill('SIGKILL'); await w.exited; },
    /** the graceful stop a supervisor sends (IPC: Windows cannot signal a child) */
    async stop(w: Worker) { if (w.child.exitCode !== null) return; w.child.send('shutdown'); await w.exited; },
    killAll() { for (const c of children.splice(0)) if (c.exitCode === null) c.kill('SIGKILL'); },
  };
}

export async function until<T>(what: string, fn: () => Promise<T | undefined | false | null>, timeoutMs = 90_000, everyMs = 150): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v as T;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, everyMs));
  }
}
