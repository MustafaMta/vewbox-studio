import { defineConfig, devices, type Project } from '@playwright/test';
import { TEST_PORT } from './src/server/test-guard';

const BASE = process.env.STUDIO_URL || `http://127.0.0.1:${TEST_PORT}`;
process.env.STUDIO_URL = BASE; // the helpers read it

/** BROWSER TESTS against an ISOLATED test studio (docs/BACKEND-AUDIT-2026-10.md C3): `scripts/test-server.ts` on
 *  http://127.0.0.1:4210 with its own database (`vewbox_test`, never the live `vewbox`) and a scratch library. One
 *  worker: every test resets the test studio to the sample fixture through the API, so tests must not overlap.
 *
 *  STUDIO_URL points the suite elsewhere (a production build, the Docker stack) — but only at a TEST server: the global
 *  setup (tests/e2e/global-setup.ts) refuses any server whose /api/health does not report `testServer: true`
 *  (VEWBOX_ALLOW_RESET=1 on a database that is not `vewbox`), and that server refuses every reset anyway. The
 *  producer's studio on :4200 is never a target.
 *
 *  The `journeys` project (tests/e2e/journeys, the wave-2 acceptance scenarios) runs only through
 *  scripts/qa-journeys.mjs (QA_JOURNEYS=1): it drives real generation when QA_GPU=1 (`@gpu` titles), needs the
 *  worker, and one scenario waits for an operator restart (QA_RESTART=1). Long timeouts, strictly serial. */
const journeys: Project = {
  name: 'journeys',
  testDir: 'tests/e2e/journeys',
  fullyParallel: false,
  retries: 0,
  timeout: 20 * 60_000,
  expect: { timeout: 30_000 },
  grepInvert: process.env.QA_GPU === '1' ? undefined : /@gpu/,
  use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, actionTimeout: 30_000, navigationTimeout: 60_000, trace: 'retain-on-failure', video: 'retain-on-failure' },
};

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  globalSetup: './tests/e2e/global-setup.ts',
  // the isolated test server; a server already on :4210 is reused only if it is a test server (global setup checks)
  webServer: BASE === `http://127.0.0.1:${TEST_PORT}` ? { command: 'pnpm test:server', url: `${BASE}/api/health`, reuseExistingServer: true, timeout: 180_000 } : undefined,
  use: { baseURL: BASE, trace: 'retain-on-failure', screenshot: 'only-on-failure', locale: 'en-GB' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, grepInvert: /@mobile/, testIgnore: /journeys[\\/]/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/, testIgnore: /journeys[\\/]/ },
    ...(process.env.QA_JOURNEYS === '1' ? [journeys] : []),
  ],
});
