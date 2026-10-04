import { devices, expect, type Page } from '@playwright/test';
import { loadFixture, prepare } from '../../../scripts/lib/capture.mjs';

/** The shell spec runs on the FIXTURE studio, answered in the browser by the capture harness (scripts/lib/capture.mjs
 *  `prepare`): the studio's GETs come from scripts/v4-fixture.ts, the event stream is replaced in the page, and no
 *  write reaches the server. Nothing here resets or changes the test studio. */

/** A phone for a describe-level `test.use` (the v5 project has one desktop browser): the Pixel 7's viewport, scale,
 *  touch and user agent — without `defaultBrowserType`, which Playwright refuses below the top level. */
export const PHONE = (() => { const { defaultBrowserType: _browser, ...rest } = devices['Pixel 7']; void _browser; return rest; })();

type Fixture = Awaited<ReturnType<typeof loadFixture>>;
const cache = new Map<string, Fixture>();
export async function fixture(kind: 'sample' | 'empty' | 'states'): Promise<Fixture> {
  if (!cache.has(kind)) cache.set(kind, await loadFixture(kind, 'reduce'));
  return cache.get(kind)!;
}

/** Open a page on the fixture studio and wait for the page's own heading (not the shell's placeholder). */
export async function open(page: Page, path: string, opts: { kind?: 'sample' | 'empty' | 'states' } = {}) {
  const fx = await fixture(opts.kind ?? 'sample');
  await prepare(page, { fixture: fx, motion: 'reduce' });
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main h1').first()).toBeVisible({ timeout: 90_000 });
}
