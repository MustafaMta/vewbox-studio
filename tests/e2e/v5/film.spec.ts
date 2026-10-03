import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare } from '../../../scripts/lib/capture.mjs';

/** SHORTS (docs/DESIGN-SYSTEM-V5.md §8.4–8.5 under VISUAL-STANDARD-V5.1) against the studio's real data, read-only:
 *  every write the page might send is answered by the capture helper and never reaches the server. Run against your own
 *  server and database copy, never the live studio:
 *    $env:STUDIO_URL='http://localhost:4254'; npx playwright test tests/e2e/v5/film.spec.ts
 *  The film checked is the studio's newest short with a cut (The Static Sky in the live studio). */

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

async function open(page: Page, path: string, ready: string, width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
  await (prepare as (p: Page, o: { motion?: string }) => Promise<void>)(page, { motion: 'reduce' });
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(ready, { timeout: 120_000 });
  await page.evaluate(() => document.fonts.ready);
}

interface P { id: string; kind: string; title: string; cutAssetId?: string; updatedAt: string; shots: unknown[]; scenes: Array<{ number: number; title: string }>; exports?: unknown[] }
async function film(request: import('@playwright/test').APIRequestContext): Promise<P | undefined> {
  const snap = await (await request.get('/api/studio')).json();
  return (snap.state.productions as P[]).filter((p) => p.kind === 'SHORT' && p.cutAssetId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

test('the catalogue: a 2:3 poster with runtime and status that opens the film, a play button to the Screening Room, five columns', async ({ page, request }) => {
  const f = await film(request);
  test.skip(!f, 'the studio has no finished short');
  await open(page, '/shorts', '.shorts-grid');
  await expect(page.getByRole('heading', { level: 1, name: 'Shorts' })).toBeVisible();
  const card = page.locator('.short-card', { has: page.locator(`a[href="/shorts/${f!.id}"]`) });
  await expect(card.locator('.mcard-meta')).toHaveText(/^\d+:\d\d · (Finished|.+)$/);
  const box = await card.locator('.mcard').boundingBox();
  expect(Math.round((box!.width / box!.height) * 100) / 100).toBe(0.67);
  await expect(card.getByRole('link', { name: `Screen ${f!.title}` })).toHaveAttribute('href', `/screening?p=${f!.id}`);
  expect(await page.locator('.shorts-grid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(5);
  await card.locator('.mcard').click();
  await expect(page).toHaveURL(new RegExp(`/shorts/${f!.id}$`));
  await expect(page.locator('h1')).toHaveText(f!.title);
});

test('New short: the primary lets the studio propose; its menu offers both ways', async ({ page }) => {
  await open(page, '/shorts', '.shorts-grid');
  await expect(page.locator('.film-split > a.btn-primary')).toHaveAttribute('href', '/new/short?mode=auto');
  await page.getByRole('button', { name: 'More ways to start a short' }).click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: /Let the studio propose/ })).toHaveAttribute('href', '/new/short?mode=auto');
  await expect(menu.getByRole('menuitem', { name: /Write it yourself/ })).toHaveAttribute('href', '/new/short?mode=manual');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(page.locator('.shorts-grid .start-card')).toHaveAttribute('href', '/new/short?mode=auto');
});

test('an empty studio: the head stays and one start card in the poster’s shape says "Your first short"', async ({ page, request }) => {
  const snap = await (await request.get('/api/studio')).json();
  snap.state.productions = [];
  await page.setViewportSize({ width: 1440, height: 900 });
  await (prepare as (p: Page, o: { motion?: string }) => Promise<void>)(page, { motion: 'reduce' });
  await page.route('**/api/studio', (route) => (route.request().method() === 'GET' ? route.fulfill({ json: snap }) : route.fallback()));
  await page.goto('/shorts', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.shorts-grid', { timeout: 120_000 });
  await expect(page.locator('.short-card')).toHaveCount(0);
  await expect(page.locator('.shorts-grid .start-card')).toContainText('Your first short');
});

test('the title page: slate, title, logline; Screen it and Open production; the poster beside the player at one height', async ({ page, request }) => {
  const f = await film(request);
  test.skip(!f, 'the studio has no finished short');
  await open(page, `/shorts/${f!.id}`, '.film-stage');
  await expect(page.locator('h1')).toHaveText(f!.title);
  await expect(page.locator('.film-meta .badge')).toHaveText('Finished');
  await expect(page.locator('.film-acts').getByRole('link', { name: 'Screen it' })).toHaveAttribute('href', `/screening?p=${f!.id}`);
  await expect(page.locator('.film-acts').getByRole('link', { name: 'Open production' })).toHaveAttribute('href', `/shorts/${f!.id}/production`);
  await expect(page.getByRole('link', { name: 'Edit the story' })).toHaveAttribute('href', `/shorts/${f!.id}/production?tab=story`);
  const poster = await page.locator('.film-poster-frame').boundingBox();
  const player = await page.locator('.film-screen .film-player').boundingBox();
  expect(Math.abs(poster!.height - player!.height)).toBeLessThanOrEqual(1);
  expect(Math.round(poster!.y)).toBe(Math.round(player!.y));
  // the old workspace is not rendered here
  await expect(page.getByRole('tablist')).toHaveCount(0);
});

test('the strip: every shot by scene; a shot plays the film from where it starts; play and pause; visible focus', async ({ page, request }) => {
  const f = await film(request);
  test.skip(!f, 'the studio has no finished short');
  await open(page, `/shorts/${f!.id}`, '.film-strip');
  await expect(page.locator('.film-strip-shot')).toHaveCount(f!.shots.length);
  const labels = await page.locator('.film-strip-label').allTextContents();
  expect(labels).toEqual([...f!.scenes].sort((a, b) => a.number - b.number).map((s) => `Scene ${s.number}${s.title ? ` · ${s.title}` : ''}`));
  const video = page.locator('.film-player-video');
  await video.evaluate((v: HTMLVideoElement) => new Promise((r) => (v.readyState >= 1 ? r(null) : v.addEventListener('loadedmetadata', () => r(null), { once: true }))));
  const last = page.locator('.film-strip-shot').last();
  const label = (await last.getAttribute('aria-label'))!;
  const [, mm, ss] = /, (\d+):(\d\d)$/.exec(label)!;
  await last.click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThanOrEqual(Number(mm) * 60 + Number(ss));
  await expect(last).toHaveAttribute('aria-current', 'true');
  const play = page.locator('.film-play');
  await expect(play).toHaveAttribute('aria-label', `Pause ${f!.title}`);
  await play.click();
  await expect(play).toHaveAttribute('aria-label', `Play ${f!.title}`);
  // keyboard: the shot buttons show the focus ring
  await page.locator('.film-strip-shot').first().focus();
  await page.keyboard.press('Tab');
  const ring = await page.evaluate(() => { const a = document.activeElement as HTMLElement; const cs = getComputedStyle(a); return { cls: a.className, style: cs.outlineStyle, width: cs.outlineWidth }; });
  expect(ring.cls).toContain('film-strip-shot');
  expect(ring.style).toBe('solid');
  expect(parseFloat(ring.width)).toBeGreaterThanOrEqual(2);
});

test('downloads, cast, places and credits come from the records; the definition lists are valid (axe)', async ({ page, request }) => {
  const f = await film(request);
  test.skip(!f, 'the studio has no finished short');
  await open(page, `/shorts/${f!.id}`, '.film-stage');
  if ((f!.exports?.length ?? 0) > 0) {
    const dl = page.locator('section', { has: page.getByRole('heading', { name: 'Downloads' }) });
    const links = dl.locator('a[download]');
    expect(await links.count()).toBeGreaterThan(0);
    for (const href of await links.evaluateAll((els) => els.map((e) => e.getAttribute('href')))) expect(href).toMatch(/^\/api\/media\/[\w-]+\?download=1$/);
    const heights = await dl.locator('.film-file').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    expect(new Set(heights).size).toBe(1);
  }
  await expect(page.locator('.film-cast .fcard').first()).toHaveAttribute('href', /^\/characters\//);
  await expect(page.locator('.film-cast .fcard-state').first()).toHaveText(/^\d+ lines?$|^No lines$/);
  const credits = page.locator('.film-credits');
  await expect(credits.locator('.film-credit dt').first()).toBeVisible({ timeout: 60_000 });
  await expect(credits.locator('.film-credit a').first()).toHaveAttribute('href', /^\/studio\/departments\//);
  const axe = await new AxeBuilder({ page }).include('main').withRules(['definition-list', 'dlitem', 'list', 'listitem', 'button-name', 'link-name', 'image-alt', 'nested-interactive']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});

test('phone 390: the player first, no poster, no horizontal overflow; actions share the row', async ({ page, request }) => {
  const f = await film(request);
  test.skip(!f, 'the studio has no finished short');
  await open(page, `/shorts/${f!.id}`, '.film-stage', 390, 844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
  await expect(page.locator('.film-poster')).toBeHidden();
  const player = await page.locator('.film-screen').boundingBox();
  const title = await page.locator('h1').boundingBox();
  expect(player!.y).toBeLessThan(title!.y);
  const acts = await page.locator('.film-acts .btn').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
  expect(Math.abs(acts[0] - acts[1])).toBeLessThanOrEqual(1);
  await open(page, '/shorts', '.shorts-grid', 390, 844);
  expect(await page.locator('.shorts-grid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
});

test('a short that is not in the studio is a 404, not an empty page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await (prepare as (p: Page, o: { motion?: string }) => Promise<void>)(page, { motion: 'reduce' });
  await page.goto('/shorts/short-does-not-exist', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.film')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Not here' })).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('.film')).toHaveCount(0);
});
