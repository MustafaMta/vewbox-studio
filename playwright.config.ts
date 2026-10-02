import { defineConfig, devices } from '@playwright/test';

/** BROWSER TESTS against the running studio (web + database). One worker: every test resets the shared sample
 *  studio through the API, so tests must not overlap. Set BASE_URL to test a production build or the Docker stack. */
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  webServer: process.env.BASE_URL ? undefined : { command: 'pnpm dev', url: 'http://localhost:4200/api/health', reuseExistingServer: true, timeout: 180_000 },
  use: { baseURL: process.env.BASE_URL ?? 'http://localhost:4200', trace: 'retain-on-failure', screenshot: 'only-on-failure', locale: 'en-GB' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, grepInvert: /@mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
});
