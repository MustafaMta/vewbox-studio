import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { TEST_PORT } from '../../src/server/test-guard';
import { describeDb, e2eLibraryRoot, resolveE2EDatabaseUrl } from '../../scripts/lib/test-db';
import { FIXTURE_PATH, readFixture } from '../../scripts/e2e-fixture';

/** THE BROWSER SUITE'S ONE SERVER (docs/TESTING.md). Before any test:
 *   1. the e2e database (`vewbox_e2e`, never the live `vewbox`) is created or migrated and its studio replaced with
 *      tests/fixtures/e2e/studio.json, and the scratch library filled (scripts/e2e-fixture.ts apply) — every run
 *      starts from the same records, whatever the last run left behind;
 *   2. one dev server is started on http://127.0.0.1:4210 with VEWBOX_ALLOW_RESET=1, that database and that library
 *      (scripts/test-server.ts), unless one is already there — and then only if it is a TEST server on THAT database
 *      (its /api/health says so); a server on another database, or the producer's studio, stops the run here;
 *   3. the routes the specs visit are opened once, so the dev server has compiled them before a test waits on them.
 *  The server this setup started is stopped when the run ends. STUDIO_URL points the suite at a server you run
 *  yourself (it must still be a test server on the e2e database; the seed is applied to that database all the same). */

const DEFAULT = `http://127.0.0.1:${TEST_PORT}`;
type Health = { ok?: boolean; testServer?: boolean; testDatabase?: string; version?: number };

const health = async (base: string): Promise<Health | null> => { try { const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(10_000) }); return (await r.json()) as Health; } catch { return null; } };
const say = (s: string) => console.log(`[e2e] ${s}`);

/** The pages the specs open, one per route, so the first test never waits on a cold compile. */
function routesToWarm(): string[] {
  const fx = readFixture(FIXTURE_PATH);
  const film = fx.state.productions.find((p) => p.cutAssetId) ?? fx.state.productions[0];
  const shot = film?.shots[0]?.id ?? 'shot-1';
  const character = fx.state.characters[0]?.id ?? 'abu-samir';
  const location = fx.state.locations[0]?.id ?? 'cafe';
  const ep = '/shows/last-sip/seasons/last-sip-s1/episodes/s1e1';
  return [
    '/', '/shows', '/shows/last-sip', '/shows/last-sip/seasons/last-sip-s1', ep, `${ep}/production`, `${ep}/shots/s1e1-2`,
    '/shorts', `/shorts/${film?.id ?? 'x'}`, `/shorts/${film?.id ?? 'x'}/production`, `/shorts/${film?.id ?? 'x'}/shots/${shot}`,
    '/music-videos', '/music-videos/river-lights', '/music-videos/river-lights/production',
    '/characters', '/characters/new', `/characters/${character}`, '/locations', '/locations/new', `/locations/${location}`,
    '/new', '/new/short', '/new/show', '/new/music-video', '/new/episode?show=missing-show',
    '/screening', `/screening?p=${film?.id ?? 'x'}`, '/studio', '/studio/departments/CASTING', '/studio/agents/casting-director',
    '/production', '/settings', '/assets', '/kit', '/jobs', '/library', '/projects',
  ];
}

export default async function globalSetup() {
  const base = process.env.STUDIO_URL || DEFAULT;
  const managed = base === DEFAULT;
  const dbUrl = resolveE2EDatabaseUrl();
  const dbName = describeDb(dbUrl);
  const library = e2eLibraryRoot();
  const logDir = path.resolve('test-results');
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, 'e2e-server.log');

  // ---- 1. whoever is on the port must be OUR test server ------------------------------------------------------
  let h = await health(base);
  if (h && h.testServer !== true) throw new Error(`Refusing to run the browser tests against ${base}: it is not a test server (its /api/health does not report testServer: true — VEWBOX_ALLOW_RESET=1 on a test database). The producer's studio on :4200 is never a target.`);
  if (h && h.testDatabase && h.testDatabase !== dbName) throw new Error(`The test server on ${base} serves the database "${h.testDatabase}", not the e2e database "${dbName}" (another suite's \`pnpm test:server\`?). Stop it, then run the suite again.`);
  if (!h && !managed) throw new Error(`No studio answers at ${base}. Start a test server on the e2e database there, or unset STUDIO_URL to let the suite start its own.`);

  // ---- 2. the fixture: the same studio every run ---------------------------------------------------------------
  if (process.env.E2E_SKIP_SEED === '1') say(`seed skipped (E2E_SKIP_SEED=1): ${dbName} as it is`);
  else {
    say(`seeding ${dbName} and ${library} from ${FIXTURE_PATH}`);
    const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/e2e-fixture.ts', 'apply'], { stdio: 'inherit', env: { ...process.env, E2E_DATABASE_URL: dbUrl, E2E_LIBRARY_ROOT: library } });
    if (r.status !== 0) throw new Error(`the e2e fixture could not be applied (exit ${r.status})`);
  }

  // ---- 3. the server ----------------------------------------------------------------------------------------------
  let child: ChildProcess | undefined;
  if (!h) {
    const out = fs.openSync(logFile, 'a');
    say(`starting the test server on ${base} (log: ${path.relative(process.cwd(), logFile)})`);
    child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/test-server.ts'], { stdio: ['ignore', out, out], env: { ...process.env, TEST_DATABASE_URL: dbUrl, TEST_LIBRARY_ROOT: library, STUDIO_URL: base } });
    for (let i = 0; i < 180 && !h?.ok; i++) {
      if (child.exitCode !== null) throw new Error(`the test server exited with ${child.exitCode}; see ${logFile}`);
      await new Promise((r) => setTimeout(r, 1000));
      h = await health(base);
    }
    if (!h?.ok) throw new Error(`the test server did not answer on ${base} within 3 minutes; see ${logFile}`);
    if (h.testServer !== true || (h.testDatabase && h.testDatabase !== dbName)) throw new Error(`the server that came up on ${base} is not the e2e test server (${JSON.stringify({ testServer: h.testServer, testDatabase: h.testDatabase })})`);
  } else say(`reusing the test server on ${base} (${h.testDatabase ?? 'test database'})`);

  // ---- 4. warm the routes --------------------------------------------------------------------------------------------
  const t0 = Date.now();
  let slow = 0;
  for (const route of routesToWarm()) {
    const t = Date.now();
    try { await fetch(`${base}${route}`, { signal: AbortSignal.timeout(180_000), redirect: 'manual' }); } catch (e) { say(`warm ${route}: ${(e as Error).message}`); }
    if (Date.now() - t > 5000) slow++;
  }
  say(`routes warm in ${Math.round((Date.now() - t0) / 1000)} s (${slow} compiled slowly)`);

  return async () => {
    if (!child?.pid || child.exitCode !== null) return;
    // the server runs under tsx → next → its workers: stop the whole tree
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  };
}
