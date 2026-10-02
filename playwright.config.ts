import { defineConfig, devices, type Project } from '@playwright/test';

/** BROWSER TESTS against the running studio (web + database). One worker: every test resets the shared sample
 *  studio through the API, so tests must not overlap. Set BASE_URL to test a production build or the Docker stack.
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
  webServer: process.env.STUDIO_URL ? undefined : { command: 'pnpm dev', url: 'http://localhost:4200/api/health', reuseExistingServer: true, timeout: 180_000 },
  use: { baseURL: process.env.STUDIO_URL || 'http://localhost:4200', trace: 'retain-on-failure', screenshot: 'only-on-failure', locale: 'en-GB' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, grepInvert: /@mobile/, testIgnore: /journeys[\\/]/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/, testIgnore: /journeys[\\/]/ },
    ...(process.env.QA_JOURNEYS === '1' ? [journeys] : []),
  ],
});
