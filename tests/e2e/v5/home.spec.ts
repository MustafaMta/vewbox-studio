import { expect, test, type Page } from '@playwright/test';
import { prepare } from '../../../scripts/lib/capture.mjs';

/** HOME (docs/design/VISUAL-STANDARD-V5.1.md §7, §8) against the studio's real data, read-only: every write the page
 *  might send is answered by the capture helper and never reaches the server. Run against your own server and database
 *  copy, never the live studio:  $env:STUDIO_URL='http://localhost:4252'; npx playwright test tests/e2e/v5/home.spec.ts
 *  (the old suites reset the studio; this one does not). */

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

/** 2026-10-04: Home was rebuilt twice after this spec (26cf8e4 "Home on the producer's Krea reference", 383c7cf "Home on
 *  the shared kit") and is in the producer's design QA; none of the hooks below (.home-marquee, .home-dcard,
 *  .home-newchar, .home-action, .home-railpos) exists any more. The tests are kept as the acceptance intent and marked
 *  fixme until the Home engineer rewrites them against the approved Home (docs/TESTING.md). */
test.beforeEach(() => { test.fixme(true, 'Home was rebuilt after this spec (Krea reference, shared kit) and awaits design QA: rewrite against the approved Home'); });

async function open(page: Page, width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
  await (prepare as (p: Page, o: { motion?: string }) => Promise<void>)(page, { motion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.home h1', { timeout: 90_000 });
  await page.evaluate(() => document.fonts.ready);
}

interface Decisions { items: Array<{ id: string; href: string; since: string | null }>; count: number }
const oldestFour = (d: Decisions) => d.items.map((x, i) => ({ x, i, at: x.since ? Date.parse(x.since.includes('T') ? x.since : x.since.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')) : Infinity }))
  .sort((a, b) => a.at - b.at || a.i - b.i).slice(0, 4).map((y) => y.x);

test('the marquee: the film’s frame with nothing over it, then "Open the film" and "Screen it" to the right places', async ({ page, request }) => {
  await open(page);
  const snap = await (await request.get('/api/studio')).json();
  const latest = [...snap.state.productions].filter((p: { cutAssetId?: string }) => p.cutAssetId).sort((a: { updatedAt: string }, b: { updatedAt: string }) => b.updatedAt.localeCompare(a.updatedAt))[0];
  test.skip(!latest, 'the studio has no finished film');
  const marquee = page.locator('.home-marquee');
  await expect(marquee.locator('h1')).toHaveText(latest.title);
  const open_ = marquee.getByRole('link', { name: 'Open the film' });
  const screen = marquee.getByRole('link', { name: 'Screen it' });
  await expect(open_).toHaveAttribute('href', new RegExp(`/${latest.id}$`));
  await expect(screen).toHaveAttribute('href', `/screening?p=${latest.id}`);
  // nothing is drawn over the picture (§8.5)
  const over = await page.evaluate(() => {
    const f = document.querySelector('.home-marquee-frame')!; const fb = f.getBoundingClientRect();
    return [...document.querySelectorAll('main *')].filter((e) => !f.contains(e) && !e.contains(f)).filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.left < fb.right - 1 && b.right > fb.left + 1 && b.top < fb.bottom - 1 && b.bottom > fb.top + 1; }).length;
  });
  expect(over).toBe(0);
  await screen.click();
  await expect(page).toHaveURL(new RegExp(`/screening\\?p=${latest.id}$`));
});

test('Needs you: the four oldest decisions as cards, each one link to where it is decided', async ({ page, request }) => {
  const d: Decisions = await (await request.get('/api/decisions')).json();
  test.skip(d.count === 0, 'nothing waits');
  await open(page);
  const section = page.locator('section', { has: page.getByRole('heading', { name: /^Needs you/ }) });
  await expect(section.locator('.home-count')).toHaveText(new RegExp(`(^|\\D)${d.count}$`));
  const cards = section.locator('.home-dcard');
  const want = oldestFour(d);
  await expect(cards).toHaveCount(want.length);
  for (let i = 0; i < want.length; i++) await expect(cards.nth(i)).toHaveAttribute('href', want[i].href);
  await expect(section.getByRole('link', { name: d.count > 4 ? `All ${d.count} decisions` : 'All decisions' })).toHaveAttribute('href', '/production#needs-you');
  // equal heights and aligned buttons (§5.7)
  const geo = await cards.evaluateAll((els) => els.map((e) => ({ h: e.getBoundingClientRect().height, b: e.querySelector('.home-dcard-btn')!.getBoundingClientRect().bottom })));
  expect(new Set(geo.map((g) => g.h)).size).toBe(1);
  expect(new Set(geo.map((g) => g.b)).size).toBe(1);
});

test('the New character tile and the four start actions link to their pages', async ({ page }) => {
  await open(page);
  await expect(page.locator('.home-newchar')).toHaveAttribute('href', '/characters/new');
  await expect(page.locator('.home-newchar')).toContainText('New character');
  const starts = page.locator('.home-action');
  await expect(starts).toHaveCount(4);
  expect(await starts.evaluateAll((els) => els.map((e) => [e.querySelector('.t-card')!.textContent, e.getAttribute('href')]))).toEqual([
    ['New show', '/new/show'], ['New short', '/new/short'], ['New music video', '/new/music-video'], ['New character', '/characters/new'],
  ]);
  const heights = await starts.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(heights.every((h) => h === 112)).toBe(true);
  await starts.first().click();
  await expect(page).toHaveURL(/\/new\/show$/);
});

test('every card and tile shows the focus ring when reached with the keyboard', async ({ page }) => {
  await open(page);
  const targets = await page.locator('.home :is(.home-card, .home-tile):is(a)').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.getAttribute('href')));
  const seen = new Map<string, { style: string; width: string; offset: string }>();
  for (let i = 0; i < 120 && seen.size < targets.length; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      if (!a || !a.matches('.home-card, .home-tile') || !a.matches(':focus-visible')) return null;
      const cs = getComputedStyle(a);
      return { href: a.getAttribute('href')!, style: cs.outlineStyle, width: cs.outlineWidth, offset: cs.outlineOffset };
    });
    if (f) seen.set(f.href + '#' + seen.size, f);
  }
  expect(seen.size).toBeGreaterThanOrEqual(targets.length);
  for (const f of seen.values()) { expect(f.style).toBe('solid'); expect(f.width).toBe('2px'); expect(f.offset).toBe('3px'); }
});

test('phone 390: rails with a "1 of 4" readout, no horizontal overflow', async ({ page, request }) => {
  const d: Decisions = await (await request.get('/api/decisions')).json();
  await open(page, 390, 844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
  test.skip(d.count < 2, 'the rail readout needs two decisions');
  const n = Math.min(4, d.count);
  const readout = page.locator('.home-railpos');
  await expect(readout).toBeVisible();
  await expect(readout).toHaveText(`1 of ${n}`);
  const rail = page.locator('.home-decisions');
  expect(await rail.evaluate((el) => (el.firstElementChild as HTMLElement).getBoundingClientRect().width)).toBe(280);
  await rail.evaluate((el) => { const second = el.children[1] as HTMLElement; el.scrollTo({ left: second.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft - 16, behavior: 'instant' }); });
  await expect(readout).toHaveText(`2 of ${n}`);
  // the marquee is a 4:5 window of the same wide frame
  const box = await page.locator('.home-marquee-frame').boundingBox();
  expect(Math.round((box!.width / box!.height) * 100) / 100).toBe(0.8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
});
