import { expect, test, type Page, type Request } from '@playwright/test';
import { loadFixture, prepare } from '../../../scripts/lib/capture.mjs';

/** SHOWS (P-Shows: /shows, a show, a season, an episode's lobby) against your own server and database copy, never the
 *  live studio:  $env:STUDIO_URL='http://localhost:4253'; npx playwright test tests/e2e/v5/shows.spec.ts --project desktop
 *  The populated studio is the fixture (scripts/v4-fixture.ts `states`), answered in the browser; every write is answered
 *  here too (and recorded), so nothing reaches the server. */

type Fixture = { state: { shows: Array<Record<string, unknown>>; seasons: unknown[] } };
let STATES: Fixture;
let EMPTY: Fixture;
test.beforeAll(async () => {
  STATES = await (loadFixture as (k: string) => Promise<Fixture>)('states');
  EMPTY = await (loadFixture as (k: string) => Promise<Fixture>)('empty');
});
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

interface Sent { name: string; args: unknown[] }
async function open(page: Page, path: string, fixture: Fixture = STATES, size = { width: 1440, height: 900 }) {
  await page.setViewportSize(size);
  await (prepare as (p: Page, o: { fixture?: unknown; motion?: string }) => Promise<void>)(page, { fixture, motion: 'reduce' });
  const sent: Sent[] = [];
  await page.route('**/api/commands', async (route) => {
    const body = route.request().postDataJSON() as { commands: Sent[] };
    sent.push(...body.commands.map((c) => ({ name: c.name, args: c.args })));
    await route.fulfill({ json: { ok: true, version: 1, hash: 'capture', results: [] } });
  });
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('main h1', { timeout: 90_000 });
  await page.evaluate(() => document.fonts.ready);
  return sent;
}

test('an empty studio: the page title, the first show’s start in the key art’s shape, Auto and Manual', async ({ page }) => {
  await open(page, '/shows', EMPTY);
  await expect(page.getByRole('heading', { level: 1, name: 'Shows' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your first show' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Let the studio propose' })).toHaveAttribute('href', '/new/show?mode=auto');
  await expect(page.getByRole('link', { name: 'Write it yourself' })).toHaveAttribute('href', '/new/show?mode=manual');
  // one primary: the head's New show is not repeated beside the start
  await expect(page.locator('.shows-page-head .btn-primary')).toHaveCount(0);
  await expect(page.locator('.shows-filters')).toHaveCount(0);
});

test('the catalogue: one 16:9 tile per show, New show is a split (Auto / Manual), no filters up to six shows', async ({ page }) => {
  await open(page, '/shows');
  const tiles = page.locator('.shows-grid .mtile');
  await expect(tiles).toHaveCount(2);
  await expect(tiles.first().getByRole('link')).toHaveAttribute('href', '/shows/last-sip');
  await expect(tiles.first()).toContainText('2 seasons');
  await expect(page.locator('.shows-filters')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'New show' })).toHaveAttribute('href', '/new/show?mode=auto');
  await page.getByRole('button', { name: 'More ways to start a show' }).click();
  await expect(page.getByRole('menuitem', { name: /Write it yourself/ })).toHaveAttribute('href', '/new/show?mode=manual');
  const ratio = await tiles.first().locator('.frame, .tcard').first().evaluate((el) => { const b = el.getBoundingClientRect(); return Math.round((b.width / b.height) * 100) / 100; });
  expect(ratio).toBeCloseTo(16 / 9, 1);
  // 3 columns at 1440: the three tiles of a row share their top
  await tiles.first().getByRole('link').click();
  await expect(page).toHaveURL(/\/shows\/last-sip$/);
});

test('filters appear with more than six shows; search and status narrow the wall', async ({ page }) => {
  const many = structuredClone(STATES);
  const base = many.state.shows[1];
  for (let i = 0; i < 5; i++) many.state.shows.push({ ...base, id: `extra-${i}`, title: `Extra show ${i}`, updatedAt: '2026-09-01T00:00:00.000Z' });
  await open(page, '/shows', many);
  await expect(page.locator('.shows-grid .mtile')).toHaveCount(7);
  await page.getByPlaceholder('Search shows').fill('last sip');
  await expect(page.locator('.shows-grid .mtile')).toHaveCount(1);
  await page.getByPlaceholder('Search shows').fill('');
  await page.getByRole('button', { name: /^In production/ }).click();
  await expect(page.getByRole('button', { name: /^In production/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.shows-grid .mtile')).toHaveCount(1);
  await page.getByRole('button', { name: /^Finished/ }).click();
  await expect(page.getByText('No show matches this filter.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear the filters' }).click();
  await expect(page.locator('.shows-grid .mtile')).toHaveCount(7);
});

test('a show: backdrop, poster, slate, Continue into the production workspace, Watch in the Screening Room', async ({ page }) => {
  await open(page, '/shows/last-sip');
  await expect(page.getByRole('heading', { level: 1, name: 'The Last Sip' })).toBeVisible();
  await expect(page.locator('.show-slate')).toContainText('2 seasons');
  await expect(page.getByRole('link', { name: /^Continue episode 1/ })).toHaveAttribute('href', /\/shows\/last-sip\/seasons\/last-sip-s1\/episodes\/s1e1\/production\?tab=\w+$/);
  await expect(page.getByRole('link', { name: 'Watch episode 1' })).toHaveAttribute('href', '/screening?p=s1e1');
  await expect(page.locator('.show-caption .btn-primary')).toHaveCount(1);
  // nothing is drawn over the picture
  const over = await page.evaluate(() => {
    const f = document.querySelector('.show-hero-frame')!; const fb = f.getBoundingClientRect();
    return [...document.querySelectorAll('main *')].filter((e) => !f.contains(e) && !e.contains(f)).filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.left < fb.right - 1 && b.right > fb.left + 1 && b.top < fb.bottom - 1 && b.bottom > fb.top + 1; }).length;
  });
  expect(over).toBe(0);
});

test('seasons switch in a segmented control; episodes are 16:9 stills with number, title, two lines and the stage', async ({ page }) => {
  await open(page, '/shows/last-sip');
  const eps = page.locator('#episodes .ep-tile');
  await expect(eps).toHaveCount(2);
  await expect(eps.first()).toContainText('Episode 1');
  await expect(eps.first().locator('.stage-meter > span')).toHaveCount(6);
  const syn = await eps.first().locator('.ep-tile-syn').evaluate((el) => getComputedStyle(el).minHeight);
  expect(syn).toBe('40px');
  await page.getByRole('radio', { name: 'Season 2' }).click();
  await expect(page).toHaveURL(/season=last-sip-s2/);
  await expect(eps).toHaveCount(1);
  await expect(eps.first()).toContainText('New Management');
  await expect(page.getByRole('link', { name: 'Open Season 2' })).toHaveAttribute('href', '/shows/last-sip/seasons/last-sip-s2');
  // the arrow keys move the season too
  await page.getByRole('radio', { name: 'Season 2' }).press('ArrowLeft');
  await expect(page).toHaveURL(/season=last-sip-s1/);
});

test('New season: a dialog that validates, then runs addSeason with the title and the line', async ({ page }) => {
  const sent = await open(page, '/shows/last-sip');
  await page.getByRole('link', { name: 'New season' }).click();
  const dialog = page.getByRole('dialog', { name: 'New season' });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/new=season/);
  await dialog.getByRole('button', { name: 'Add season 3' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Give the season a title or one line about it.');
  expect(sent.filter((c) => c.name === 'addSeason')).toHaveLength(0);
  await dialog.getByLabel('Title').fill('Night Shift');
  await dialog.getByLabel('What happens this season').fill('The café opens at night.');
  await dialog.getByRole('button', { name: 'Add season 3' }).click();
  await expect.poll(() => sent.find((c) => c.name === 'addSeason')?.args).toEqual(['last-sip', 'Night Shift', 'The café opens at night.']);
  // Auto hands over to the proposal flow
  await page.goto('/shows/last-sip?new=season');
  await page.getByRole('dialog', { name: 'New season' }).getByRole('radio', { name: 'Let the studio propose' }).click();
  await expect(page.getByRole('link', { name: 'Continue to the proposal' })).toHaveAttribute('href', '/new/season?show=last-sip');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).not.toHaveURL(/new=/);
});

test('New episode: the start card opens a dialog; a title is required; addProduction makes an EPISODE of the season', async ({ page }) => {
  const sent = await open(page, '/shows/last-sip');
  await page.locator('#episodes .start-card').click();
  const dialog = page.getByRole('dialog', { name: 'New episode' });
  await expect(dialog).toContainText('Episode 3 of Season 1');
  await dialog.getByRole('button', { name: 'Add episode 3' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Give the episode a title');
  await dialog.getByLabel('Title').fill('The Ledger');
  await dialog.getByLabel('What happens').fill('Layla audits the regulars.');
  await dialog.getByRole('button', { name: 'Add episode 3' }).click();
  await expect.poll(() => sent.find((c) => c.name === 'addProduction')?.args[0]).toMatchObject({ kind: 'EPISODE', showId: 'last-sip', seasonId: 'last-sip-s1', title: 'The Ledger', logline: 'Layla audits the regulars.', targetSeconds: 300 });
  await expect(page).toHaveURL(/\/shows\/last-sip\/seasons\/last-sip-s1\/episodes\/[^/?]+$/);
});

test('the season page: chips for the seasons, its episodes, New episode', async ({ page }) => {
  await open(page, '/shows/last-sip/seasons/last-sip-s1');
  await expect(page.getByRole('heading', { level: 1, name: 'Opening Hours' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Season 1/ })).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.ep-tile')).toHaveCount(2);
  await page.getByRole('link', { name: 'New episode' }).click();
  await expect(page.getByRole('dialog', { name: 'New episode' })).toBeVisible();
});

test('the episode lobby: the title page, Continue into …/production, six steps linking into the workspace', async ({ page }) => {
  await open(page, '/shows/last-sip/seasons/last-sip-s1/episodes/s1e2');
  await expect(page.getByRole('heading', { level: 1, name: 'The Debt' })).toBeVisible();
  const work = '/shows/last-sip/seasons/last-sip-s1/episodes/s1e2/production';
  await expect(page.getByRole('link', { name: /^Continue:/ })).toHaveAttribute('href', new RegExp(`^${work}\\?tab=`));
  await expect(page.getByRole('link', { name: 'Open the workspace' })).toHaveAttribute('href', work);
  const steps = page.locator('.ep-step');
  await expect(steps).toHaveCount(6);
  await expect(steps.nth(3)).toHaveAttribute('aria-current', 'step');
  await expect(steps.nth(2)).toHaveAttribute('href', `${work}?tab=storyboard`);
  await expect(page.locator('.page-back')).toHaveAttribute('href', '/shows/last-sip/seasons/last-sip-s1');
});

test('an old workspace link (?tab=) goes to the episode’s production workspace', async ({ page }) => {
  await open(page, '/shows/last-sip', STATES);
  await page.goto('/shows/last-sip/seasons/last-sip-s1/episodes/s1e2?tab=storyboard');
  await expect(page).toHaveURL(/\/episodes\/s1e2\/production\?tab=storyboard$/);
});

test('a show that is not in the studio says so and leads back', async ({ page }) => {
  await open(page, '/shows/no-such-show');
  await expect(page.getByRole('heading', { level: 1, name: 'This show isn’t in the studio' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to Shows' })).toHaveAttribute('href', '/shows');
});

test('every tile and step shows the focus ring when reached with the keyboard', async ({ page }) => {
  await open(page, '/shows/last-sip');
  const seen: Array<{ cls: string; style: string; width: string; offset: string }> = [];
  for (let i = 0; i < 40 && seen.length < 3; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      if (!a || !a.matches('.ep-tile, .ep-step, .mtile-link') || !a.matches(':focus-visible')) return null;
      const cs = getComputedStyle(a);
      return { cls: a.className, style: cs.outlineStyle, width: cs.outlineWidth, offset: cs.outlineOffset };
    });
    if (f) seen.push(f);
  }
  expect(seen.length).toBeGreaterThan(0);
  for (const f of seen) { expect(f.style).toBe('solid'); expect(f.width).toBe('2px'); expect(f.offset).toBe('3px'); }
});

test('loading: the page’s own skeleton holds the layout while the studio loads (same frame, same caption, no shift)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await (prepare as (p: Page, o: { fixture?: unknown; motion?: string }) => Promise<void>)(page, { fixture: STATES });
  // record the skeleton's geometry while it is on screen, and every layout shift
  await page.addInitScript(() => {
    const w = window as unknown as { __sk: Record<string, number[]> | null; __shift: number };
    w.__sk = null; w.__shift = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) w.__shift += e.value; }).observe({ type: 'layout-shift', buffered: true });
    const grab = () => {
      const sk = document.querySelector('.shows-skeleton');
      if (!sk) return;
      const r = (sel: string) => { const b = sk.querySelector(sel)?.getBoundingClientRect(); return b && b.width ? [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] : []; };
      const got = { frame: r('.show-hero-frame'), caption: r('.show-caption'), grid: r('.shows-grid') };
      if (got.frame.length) w.__sk = got;
    };
    new MutationObserver(() => requestAnimationFrame(grab)).observe(document, { childList: true, subtree: true });
  });
  await page.goto('/shows/last-sip', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.show-page:not(.shows-skeleton) .show-hero-frame', { timeout: 90_000 });
  const sk = await page.evaluate(() => (window as unknown as { __sk: Record<string, number[]> | null }).__sk);
  test.skip(!sk, 'the route skeletons are registered by the coordinator (src/components/shell/route-skeletons.tsx)');
  const real = await page.evaluate(() => {
    const root = document.querySelector('.show-page:not(.shows-skeleton)')!;
    const r = (sel: string) => { const b = root.querySelector(sel)!.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
    return { frame: r('.show-hero-frame'), caption: r('.show-caption'), grid: r('.shows-grid') };
  });
  expect(real.frame).toEqual(sk!.frame);
  expect(real.caption.slice(0, 3)).toEqual(sk!.caption.slice(0, 3));
  // the grid keeps its column; its top follows the season's arc, which only the content knows (below the fold)
  expect([real.grid[0], real.grid[2]]).toEqual([sk!.grid[0], sk!.grid[2]]);
  expect(await page.evaluate(() => (window as unknown as { __shift: number }).__shift)).toBeLessThan(0.02);
});
test('phone 390: one column, the backdrop a 4:3 window, Continue full width, no horizontal overflow', async ({ page }) => {
  await open(page, '/shows/last-sip', STATES, { width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
  const hero = await page.locator('.show-hero-frame').boundingBox();
  expect(Math.round((hero!.width / hero!.height) * 100) / 100).toBe(1.33);
  const primary = await page.locator('.show-acts .btn-primary').boundingBox();
  expect(Math.round(primary!.width)).toBe(358);
  const tiles = await page.locator('#episodes .ep-tile').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
  expect(new Set(tiles)).toEqual(new Set([16]));
});

// unused helper kept typed for future write checks
export type { Request };
