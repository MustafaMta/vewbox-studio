import { expect, type Page, type Request } from '@playwright/test';
import { loadFixture, prepare } from '../../../scripts/lib/capture.mjs';

/** F4's browser tests run against a dev server on the fixture studio, answered in the browser by the capture harness
 *  (scripts/lib/capture.mjs `prepare`): the studio's GETs come from the fixture, the event stream is replaced in the
 *  page, and no write reaches the server (commands are answered in the page). Nothing here resets or changes the
 *  shared studio. */

type Fixture = Awaited<ReturnType<typeof loadFixture>>;
const cache = new Map<string, Fixture>();
export async function fixture(kind: 'sample' | 'empty' | 'states', lang: 'en' | 'ar' = 'en'): Promise<Fixture> {
  const key = `${kind}:${lang}`;
  if (!cache.has(key)) cache.set(key, await loadFixture(kind, lang, 'reduce'));
  return cache.get(key)!;
}

/** Open a page on the fixture studio and wait for the page's own heading (not the shell's placeholder). */
export async function open(page: Page, path: string, opts: { kind?: 'sample' | 'empty' | 'states'; lang?: 'en' | 'ar'; prefs?: Record<string, unknown>; /** more set-up after the harness's, before the page loads */ before?: (page: Page) => Promise<unknown> } = {}) {
  const lang = opts.lang ?? 'en';
  const fx = await fixture(opts.kind ?? 'sample', lang);
  await prepare(page, { lang, fixture: fx, motion: 'reduce' });
  if (opts.prefs) await page.addInitScript((p) => { const u = JSON.parse(localStorage.getItem('vewbox.ui') || '{}'); localStorage.setItem('vewbox.ui', JSON.stringify({ ...u, ...p })); }, opts.prefs);
  if (opts.before) await opts.before(page);
  // the dev server can hand out a chunk while it is still compiling it (a SyntaxError in the page): load again
  let broken = false;
  page.on('pageerror', (e) => { if (e.name === 'SyntaxError' || /Invalid or unexpected token|ChunkLoadError/.test(e.message)) broken = true; });
  for (let attempt = 1; ; attempt++) {
    broken = false;
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    try { await expect(page.locator('main h1').first()).toBeVisible({ timeout: attempt < 3 ? 30_000 : 90_000 }); return; }
    catch (e) { if (attempt >= 3 || !broken) throw e; }
  }
}

export async function waitForPage(page: Page) {
  await expect(page.locator('main h1').first()).toBeVisible({ timeout: 90_000 });
}

/** Every write the page tries (to prove a test sent none, or only the intercepted command). */
export function writes(page: Page): Request[] {
  const out: Request[] = [];
  page.on('request', (r) => { if (r.method() !== 'GET' && r.method() !== 'HEAD' && new URL(r.url()).pathname.startsWith('/api/')) out.push(r); });
  return out;
}

export const nav = (page: Page) => page.locator('.shell > nav.shell-nav');
export const palette = (page: Page) => page.locator('dialog.palette-dialog');
export const sheet = (page: Page) => page.locator('dialog.keys-dialog');
