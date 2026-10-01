import { defineConfig, devices } from '@playwright/test';

/** FRONTEND TESTS — the prototype runs on its own: the dev server is started here, and every spec works only with
 *  what the page shows. There is no database and no API to check against; browser storage is cleared per test. */
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  webServer: { command: 'pnpm dev', url: 'http://localhost:4200', reuseExistingServer: true, timeout: 120_000 },
  use: { baseURL: 'http://localhost:4200', trace: 'retain-on-failure', screenshot: 'only-on-failure', locale: 'en-GB' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, grepInvert: /@mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
});
