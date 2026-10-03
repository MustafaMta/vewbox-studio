import { spawn, type ChildProcess } from 'node:child_process';
import { TEST_PORT } from '../../src/server/test-guard';

/** Global setup of the API suite: a TEST server or nothing (docs/BACKEND-AUDIT-2026-10.md C3).
 *  - STUDIO_URL (default http://127.0.0.1:4210) must answer /api/health with `testServer: true`; a server that does not
 *    (the producer's studio, a server without VEWBOX_ALLOW_RESET=1 or on the live database) is refused before any test
 *    sends a request.
 *  - When nothing answers and STUDIO_URL is the default, `scripts/test-server.ts` is started (and stopped afterwards).
 *  - The sample fixture is loaded once; every test file assumes it. */

const base = () => process.env.STUDIO_URL || `http://127.0.0.1:${TEST_PORT}`;
type Health = { ok?: boolean; testServer?: boolean };
const health = async (): Promise<Health | null> => { try { const r = await fetch(`${base()}/api/health`, { signal: AbortSignal.timeout(5000) }); return (await r.json()) as Health; } catch { return null; } };

export async function assertTestServer(h: Health | null): Promise<void> {
  if (!h) throw new Error(`No studio answers at ${base()}. Start the isolated test server with \`pnpm test:server\`.`);
  if (h.testServer !== true) throw new Error(`Refusing to run the API tests against ${base()}: it is not a test server (its /api/health does not report testServer: true — VEWBOX_ALLOW_RESET=1 on a test database). The producer's studio is never a test target.`);
}

export default async function setup() {
  let child: ChildProcess | undefined;
  let h = await health();
  if (!h && base() === `http://127.0.0.1:${TEST_PORT}`) {
    child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/test-server.ts'], { stdio: 'inherit', env: process.env });
    for (let i = 0; i < 180 && !h?.ok; i++) { await new Promise((r) => setTimeout(r, 1000)); h = await health(); }
  }
  await assertTestServer(h);
  const r = await fetch(`${base()}/api/studio/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'sample', keepSettings: false }) });
  if (!r.ok) throw new Error(`the test server refused the sample reset: ${r.status} ${await r.text()}`);
  // the server runs under tsx → next → its workers: stop the whole tree
  return () => { if (child?.pid && child.exitCode === null) { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); else child.kill('SIGTERM'); } };
}
