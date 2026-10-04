import { defineConfig, devices, type Project } from '@playwright/test';
import { TEST_PORT } from './src/server/test-guard';

const BASE = process.env.STUDIO_URL || `http://127.0.0.1:${TEST_PORT}`;
process.env.STUDIO_URL = BASE; // the helpers and specs read it

/** BROWSER TESTS against ONE ISOLATED test studio (docs/TESTING.md; docs/BACKEND-AUDIT-2026-10.md C3): the global
 *  setup (tests/e2e/global-setup.ts) seeds the e2e database `vewbox_e2e` (never the live `vewbox`) and a scratch
 *  library from tests/fixtures/e2e/studio.json, starts `scripts/test-server.ts` on http://127.0.0.1:4210 with
 *  VEWBOX_ALLOW_RESET=1 against them (or reuses a test server that is already there on that database), warms the
 *  routes, and stops the server it started when the run ends. One worker: the database is shared.
 *
 *  STUDIO_URL points the suite at a server you run yourself — but only at a TEST server on the e2e database: the
 *  global setup refuses any server whose /api/health does not report `testServer: true`, and a server on another
 *  test database. The producer's studio on :4200 is never a target.
 *
 *  Projects:
 *    v5        `pnpm test:e2e` — the regression suite: every page spec under tests/e2e/v5 (read-only against the
 *              fixture studio, or routing their writes in the browser; the theatre's notes are removed again).
 *    desktop   the older reset-based suites at tests/e2e/*.spec.ts (each test resets the studio to the sample
 *              fixture through the API — on this test server only).
 *    mobile    their @mobile tests on a phone.
 *    journeys  tests/e2e/journeys (the wave-2 acceptance scenarios), only through scripts/qa-journeys.mjs
 *              (QA_JOURNEYS=1): real generation when QA_GPU=1 (`@gpu` titles), needs the worker, and one scenario
 *              waits for an operator restart (QA_RESTART=1). Long timeouts, strictly serial. */
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
  use: { baseURL: BASE, trace: 'retain-on-failure', screenshot: 'only-on-failure', locale: 'en-GB' },
  projects: [
    // the regression suite: one desktop browser; a spec that needs a phone sets its own viewport
    { name: 'v5', testDir: 'tests/e2e/v5', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, grepInvert: /@mobile/, testIgnore: /(journeys|v5)[\\/]/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/, testIgnore: /(journeys|v5)[\\/]/ },
    ...(process.env.QA_JOURNEYS === '1' ? [journeys] : []),
  ],
});
