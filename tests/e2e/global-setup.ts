import { TEST_PORT } from '../../src/server/test-guard';

/** Before any browser test: the target must be a TEST server (docs/BACKEND-AUDIT-2026-10.md C3). Its /api/health must
 *  report `testServer: true` — VEWBOX_ALLOW_RESET=1 on a database that is not the live `vewbox` — or the run stops
 *  here, before the first reset is even sent. */
export default async function globalSetup() {
  const base = process.env.STUDIO_URL || `http://127.0.0.1:${TEST_PORT}`;
  let h: { ok?: boolean; testServer?: boolean } | null = null;
  try { h = await (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(10_000) })).json(); } catch { h = null; }
  if (!h) throw new Error(`No studio answers at ${base}. Start the isolated test server with \`pnpm test:server\`.`);
  if (h.testServer !== true) throw new Error(`Refusing to run the browser tests against ${base}: it is not a test server (its /api/health does not report testServer: true). Run \`pnpm test:server\` and point STUDIO_URL at it.`);
}
