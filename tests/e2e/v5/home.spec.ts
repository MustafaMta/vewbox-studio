import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { prepare } from '../../../scripts/lib/capture.mjs';

/** HOME (docs/design/VISUAL-STANDARD-V5.1.md §7–8; the producer's Krea reference, on the shared kit) against the
 *  suite's studio, read-only: every write the page might send is answered by the capture helper and never reaches the
 *  server. What Home is made of (src/components/home/Home.tsx, its words from ./model):
 *    the banner        the latest film's wide frame with nothing over it; under it the title, the badge and the slate,
 *                      "Open the film" and "Screen it" (or "Continue: <stage>")
 *    the featured row  the featured card (what waits for the producer, else the work in progress, else a start) with
 *                      up to four real pictures, beside the six tool cards (the five things the studio makes and the
 *                      company)
 *    the shelves       Shows (16:9), Shorts (2:3), Music videos (1:1), each ending with its start card; Characters
 *                      (figures, then New character) when the studio has any — one row each, one card size per object
 *  Rewritten 2026-10-05 against that Home (docs/TESTING.md: the fixme is gone). */

interface Asset { id: string }
interface Production { id: string; kind: 'SHORT' | 'MUSIC_VIDEO' | 'EPISODE'; title: string; stage: string; cutAssetId?: string; updatedAt: string; showId?: string }
interface Snapshot { state: { productions: Production[]; characters: Array<{ id: string; name: string }>; shows: Array<{ id: string; title: string }>; assets: Asset[] } }
interface Decisions { items: Array<{ id: string; href: string }>; count: number }

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

async function open(page: Page, width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
  await (prepare as (p: Page, o: { motion?: string }) => Promise<void>)(page, { motion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // the skeleton draws the same frames (.home-skeleton) before the snapshot is in: wait for the page itself
  await page.waitForFunction(() => document.querySelector('.home:not(.home-skeleton) h1'), null, { timeout: 90_000 });
  await page.evaluate(() => document.fonts.ready);
}

const snapshot = async (request: APIRequestContext): Promise<Snapshot> => (await request.get('/api/studio')).json();
const decisions = async (request: APIRequestContext): Promise<Decisions> => (await request.get('/api/decisions')).json();
const href = (p: Production) => (p.kind === 'SHORT' ? `/shorts/${p.id}` : p.kind === 'MUSIC_VIDEO' ? `/music-videos/${p.id}` : null);
/** The marquee's film: the most recently updated production with a cut, else the most recently updated at all. */
const marqueeOf = (s: Snapshot) => { const recent = [...s.state.productions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); return recent.find((p) => p.cutAssetId) ?? recent[0]; };
const newestFirst = (ps: Production[]) => [...ps].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

test('the banner: the latest film, nothing over its picture, "Open the film" and "Screen it" to the right places', async ({ page, request }) => {
  const s = await snapshot(request);
  const film = marqueeOf(s);
  test.skip(!film, 'the studio has no production');
  await open(page);
  const hero = page.locator('.home-hero');
  await expect(hero.locator('h1')).toHaveText(film.title);
  // the frame is one link to the film, out of the Tab order (the two buttons under it are the stops)
  const frame = hero.locator('a.home-hero-frame');
  await expect(frame).toHaveAttribute('href', href(film) ?? /./);
  await expect(frame).toHaveAttribute('tabindex', '-1');
  const openIt = hero.getByRole('link', { name: 'Open the film' });
  await expect(openIt).toHaveAttribute('href', href(film) ?? /./);
  const primary = hero.locator('.home-hero-acts .btn-primary');
  if (film.cutAssetId) await expect(primary).toHaveText('Screen it'); else await expect(primary).toHaveText(/^Continue: /);
  await expect(primary).toHaveAttribute('href', film.cutAssetId ? `/screening?p=${film.id}` : `${href(film)}/production`);
  // the badge says Finished only for a complete film with a cut
  await expect(hero.locator('.home-hero-meta .badge')).toHaveText(film.cutAssetId && film.stage === 'COMPLETE' ? 'Finished' : /./);
  // nothing is drawn over the picture (§8.5): no element of the page overlaps the frame except its own content
  const over = await page.evaluate(() => {
    const f = document.querySelector('.home-hero-frame')!; const fb = f.getBoundingClientRect();
    return [...document.querySelectorAll('main *')].filter((e) => !f.contains(e) && !e.contains(f)).filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.left < fb.right - 1 && b.right > fb.left + 1 && b.top < fb.bottom - 1 && b.bottom > fb.top + 1; }).map((e) => e.className);
  });
  expect(over).toEqual([]);
  await primary.click();
  await expect(page).toHaveURL(film.cutAssetId ? new RegExp(`/screening\\?p=${film.id}$`) : new RegExp(`${film.id}/production$`));
});

test('the featured card: what waits for the producer (count, sentence, Review, up to four pictures that are links)', async ({ page, request }) => {
  const d = await decisions(request);
  await open(page);
  const card = page.locator('article.feat-card');
  await expect(card).toHaveCount(1);
  const thumbs = card.locator('.feat-thumbs a.feat-thumb');
  expect(await thumbs.count()).toBeLessThanOrEqual(4);
  for (const t of await thumbs.all()) { await expect(t).toHaveAttribute('href', /^\//); await expect(t).toHaveAttribute('aria-label', /./); }
  if (d.count > 0) {
    await expect(card.locator('.badge')).toHaveText(`${d.count} waiting`);
    await expect(card.locator('.feat-title')).toHaveText(d.count === 1 ? 'One decision waits for you' : /decisions wait for you$/);
    await expect(card.locator('.feat-body')).toHaveText(/\.$/);
    await expect(card.getByRole('link', { name: 'Review', exact: true })).toHaveAttribute('href', '/production#needs-you');
    // its pictures stand for the oldest decisions, in order
    const hrefs = await thumbs.evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    for (const h of hrefs) expect(d.items.map((x) => x.href)).toContain(h);
  } else {
    await expect(card.locator('.feat-title')).toHaveText(/^(Continue |Make your next film)/);
    await expect(card.locator('a.feat-btn')).toHaveAttribute('href', /^\//);
  }
});

test('the six tool cards: the five things the studio makes and the company, 112 high, each one link', async ({ page }) => {
  await open(page);
  const tools = page.locator('.home-tools a.tool-card');
  await expect(tools).toHaveCount(6);
  expect(await tools.evaluateAll((els) => els.map((e) => [e.querySelector('.tool-card-title')!.textContent, e.getAttribute('href')]))).toEqual([
    ['New show', '/new/show'], ['New short', '/new/short'], ['New music video', '/new/music-video'], ['New character', '/characters/new'], ['New location', '/locations/new'], ['Studio Company', '/studio'],
  ]);
  const heights = await tools.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  expect(heights).toEqual([112, 112, 112, 112, 112, 112]);
  // the company's line is its real size once the organisation has answered
  await expect(tools.last().locator('.tool-card-line')).toHaveText(/^\d+ departments? · \d+ agents?$|^The team that makes it$/);
  // a client navigation into a route the dev server may still be compiling: wait for the URL, not a fixed budget
  await Promise.all([page.waitForURL(/\/new\/show$/, { timeout: 60_000 }), tools.first().click()]);
});

test('the shelves: Shows, Shorts and Music videos with their start cards, at one card size per object', async ({ page, request }) => {
  const s = await snapshot(request);
  await open(page);
  // a shelf is the section its heading labels (`<section aria-labelledby="home-shows-h">`)
  const shelf = (id: string) => page.locator(`section.shelf[aria-labelledby="${id}-h"]`);
  // Shows: the studio's shows as 16:9 cards, else only the start card
  const shows = shelf('home-shows');
  await expect(shows).toHaveAttribute('data-kind', 'wide');
  await expect(shows.getByRole('link', { name: /^All shows/ })).toHaveAttribute('href', '/shows');
  if (s.state.shows.length === 0) {
    await expect(shows.locator('.shelf-track > li')).toHaveCount(1);
    await expect(shows.locator('a.start-card')).toHaveAttribute('href', '/new/show');
    await expect(shows.locator('.start-title')).toHaveText('New show');
  } else {
    await expect(shows.locator('.shelf-track a.mcard')).toHaveCount(Math.min(12, s.state.shows.length));
  }
  // Shorts: newest first as 2:3 posters, then New short
  const shorts = newestFirst(s.state.productions.filter((p) => p.kind === 'SHORT')).slice(0, 12);
  const sh = shelf('home-shorts');
  await expect(sh).toHaveAttribute('data-kind', 'poster');
  await expect(sh.getByRole('link', { name: /^All shorts/ })).toHaveAttribute('href', '/shorts');
  const posters = sh.locator('.shelf-track a.mcard');
  await expect(posters).toHaveCount(shorts.length);
  for (let i = 0; i < shorts.length; i++) {
    await expect(posters.nth(i)).toHaveAttribute('href', `/shorts/${shorts[i].id}`);
    await expect(posters.nth(i).locator('.mcard-title')).toHaveText(shorts[i].title);
    await expect(posters.nth(i).locator('.mcard-meta')).toHaveText(shorts[i].stage === 'COMPLETE' ? /Finished$/ : /./);
  }
  await expect(sh.locator('.shelf-track > li').last().locator('a.start-card')).toHaveAttribute('href', '/new/short');
  await expect(sh.locator('.start-title')).toHaveText('New short');
  // Music videos: 1:1 sleeves, then New music video
  const music = newestFirst(s.state.productions.filter((p) => p.kind === 'MUSIC_VIDEO')).slice(0, 12);
  const mv = shelf('home-music');
  await expect(mv).toHaveAttribute('data-kind', 'sleeve');
  await expect(mv.getByRole('link', { name: /^All music videos/ })).toHaveAttribute('href', '/music-videos');
  await expect(mv.locator('.shelf-track a.mcard')).toHaveCount(music.length);
  await expect(mv.locator('.shelf-track > li').last().locator('a.start-card')).toHaveAttribute('href', '/new/music-video');
  // one card size per object (tokens.css --card-*): 288 · 184 · 216, and the posters are 2:3, the sleeves square
  const widths = await page.evaluate(() => Object.fromEntries(['home-shows', 'home-shorts', 'home-music'].map((id) => [id, Math.round(document.querySelector(`section[aria-labelledby="${id}-h"] .shelf-track > li`)!.getBoundingClientRect().width)])));
  expect(widths).toEqual({ 'home-shows': 288, 'home-shorts': 184, 'home-music': 216 });
  const ratio = async (sel: string) => page.locator(sel).first().evaluate((e) => { const b = e.getBoundingClientRect(); return Math.round((b.width / b.height) * 100) / 100; });
  expect(await ratio('section[aria-labelledby="home-shorts-h"] .shelf-track > li > *')).toBe(0.67);
  expect(await ratio('section[aria-labelledby="home-music-h"] .shelf-track > li > *')).toBe(1);
});

test('the character shelf: one figure per character with its name, then the New character card', async ({ page, request }) => {
  const s = await snapshot(request);
  await open(page);
  const cast = page.locator('section.shelf[aria-labelledby="home-cast-h"]');
  if (s.state.characters.length === 0) { await expect(cast).toHaveCount(0); return; }
  await expect(cast).toHaveAttribute('data-kind', 'figure');
  await expect(cast.getByRole('link', { name: /^Casting directory/ })).toHaveAttribute('href', '/characters');
  const figures = cast.locator('.shelf-track a.fcard');
  const want = s.state.characters.slice(0, 15);
  await expect(figures).toHaveCount(want.length);
  for (let i = 0; i < want.length; i++) {
    await expect(figures.nth(i)).toHaveAttribute('href', `/characters/${want[i].id}`);
    await expect(figures.nth(i).locator('.fcard-name')).toHaveText(want[i].name);
  }
  // a figure is never cropped: the frame keeps the figure's own ratio, the name sits under it
  expect(await figures.first().locator('.fcard-frame').evaluate((e) => { const b = e.getBoundingClientRect(); return Math.round((b.width / b.height) * 1000) / 1000; })).toBe(Math.round((928 / 1664) * 1000) / 1000);
  expect(await cast.locator('.shelf-track > li').first().evaluate((e) => Math.round(e.getBoundingClientRect().width))).toBe(168);
  const start = cast.locator('.shelf-track > li').last().locator('a.start-card');
  await expect(start).toHaveAttribute('href', '/characters/new');
  await expect(start.locator('.start-title')).toHaveText('New character');
  await start.click();
  await expect(page).toHaveURL(/\/characters\/new$/);
});

test('every card is a Tab stop and shows the focus ring (2 px, 3 px off the picture)', async ({ page }) => {
  await open(page);
  const SEL = '.home :is(a.mcard, a.fcard, a.start-card, a.tool-card, a.feat-thumb)';
  const targets = await page.locator(SEL).evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0).length);
  expect(targets).toBeGreaterThan(6);
  const seen = new Map<number, { style: string; width: string; offset: string }>();
  for (let i = 0; i < 200 && seen.size < targets; i++) {
    await page.keyboard.press('Tab');
    // read the ring after two frames: under reduced motion every property transitions for 0.01 ms (base.css), so a
    // read in the same task as the focus sees the outline's start value
    const f = await page.evaluate(async (sel) => {
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      const a = document.activeElement as HTMLElement | null;
      if (!a || !a.matches(sel) || !a.matches(':focus-visible')) return null;
      const cs = getComputedStyle(a);
      return { key: [...document.querySelectorAll(sel)].indexOf(a), style: cs.outlineStyle, width: cs.outlineWidth, offset: cs.outlineOffset };
    }, SEL);
    if (f) seen.set(f.key, f);
  }
  expect(seen.size).toBe(targets);
  for (const f of seen.values()) { expect(f.style).toBe('solid'); expect(f.width).toBe('2px'); expect(f.offset).toBe('3px'); }
});

test('phone 390: a 4:5 banner, the shelves swiped edge to edge, two cards across, no horizontal overflow', async ({ page, request }) => {
  const s = await snapshot(request);
  await open(page, 390, 844);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(await overflow()).toBe(0);
  if (s.state.productions.length > 0) {
    const box = await page.locator('.home-hero-frame').boundingBox();
    expect(Math.round((box!.width / box!.height) * 100) / 100).toBe(0.8);
    // the two actions share the row under the banner, about half each (44 high on a real phone's coarse pointer; this
    // browser has a mouse, so 40)
    const acts = await page.locator('.home-hero-acts .btn').evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }));
    expect(acts).toHaveLength(2);
    expect(acts[0][0]).toBe(acts[1][0]);
    expect(Math.abs(acts[0][1] - acts[1][1])).toBeLessThanOrEqual(8);
    expect(acts[0][1] + acts[1][1]).toBeGreaterThanOrEqual(340);
    expect(acts.every((a) => a[2] >= 40)).toBe(true);
  }
  // the tool cards two across, 104 high
  const tools = await page.locator('.home-tools a.tool-card').evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.height)]; }));
  expect(new Set(tools.map((t) => t[0])).size).toBe(2);
  expect(tools.every((t) => t[1] === 104)).toBe(true);
  // a shelf bleeds to the viewport's edges and scrolls inside itself; its cards are two across (posters, figures)
  const shelf = await page.locator('section[aria-labelledby="home-shorts-h"] .shelf-track').evaluate((el) => { const b = el.getBoundingClientRect(); return { left: Math.round(b.left), right: Math.round(b.right), scrolls: el.scrollWidth > el.clientWidth, card: Math.round((el.firstElementChild as HTMLElement).getBoundingClientRect().width), label: el.closest('.shelf')!.querySelector('.shead-link-short')?.textContent ?? '' }; });
  expect(shelf.left).toBe(0);
  expect(shelf.right).toBe(390);
  expect(shelf.card).toBe(173);
  expect(shelf.label).toBe('All');
  if (s.state.characters.length >= 2) expect(await page.locator('section[aria-labelledby="home-cast-h"] .shelf-track').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await overflow()).toBe(0);
});
