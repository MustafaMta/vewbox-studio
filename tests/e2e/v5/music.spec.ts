import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { loadFixture, prepare } from '../../../scripts/lib/capture.mjs';

/** MUSIC VIDEOS (P-Music): the catalogue and the title page, read-only. The live studio has no music videos, so the
 *  populated pages run on the capture fixture (`sample`, plus a finished cut): the helper answers the browser's own
 *  reads from it and answers every write itself, so nothing reaches the server. Run against your own server and
 *  database copy, never the live studio:  $env:STUDIO_URL='http://localhost:4255'; npx playwright test tests/e2e/v5/music.spec.ts */

type Fixture = { state: { productions: Array<Record<string, unknown> & { id: string; kind: string; song?: { bpm?: number } }> } };
const load = loadFixture as (kind: string) => Promise<Fixture>;
const prep = prepare as (p: Page, o: { fixture?: unknown; motion?: string }) => Promise<void>;

let sample: Fixture;
let empty: Fixture;
let finished: Fixture;
test.beforeAll(async () => {
  sample = await load('sample');
  empty = await load('empty');
  finished = structuredClone(sample);
  const rl = finished.state.productions.find((p) => p.id === 'river-lights')!;
  Object.assign(rl, { cutAssetId: 'cut-s1e1', stage: 'COMPLETE', updatedAt: '2026-10-03T08:00:00.000Z' });
  rl.song!.bpm = 84;
});
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

async function open(page: Page, path: string, fixture: unknown, width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
  await prep(page, { fixture, motion: 'reduce' });
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('main h1', { timeout: 90_000 });
  await page.evaluate(() => document.fonts.ready);
}

test('an empty studio: the catalogue starts with the song, two ways in, no invented item', async ({ page }) => {
  await open(page, '/music-videos', empty);
  await expect(page.getByRole('heading', { level: 1, name: 'Music videos' })).toBeVisible();
  await expect(page.locator('.empty-page-sentence')).toHaveText(/^It starts with its song\./);
  await expect(page.locator('.mv-empty .start-card')).toHaveCount(2);
  await expect(page.locator('.mv-steps > li')).toHaveCount(3);
  await expect(page.getByRole('link', { name: /Write the song/ })).toHaveAttribute('href', '/new/music-video?mode=auto');
  await expect(page.getByRole('link', { name: /Bring your own song/ })).toHaveAttribute('href', '/new/music-video?mode=manual');
  await expect(page.locator('.mv-card')).toHaveCount(0);
  await expect(page.locator('.mv-new')).toHaveCount(0);
});

test('the catalogue: square sleeves, newest first, with performers, length and status; New music video offers Auto and Manual', async ({ page }) => {
  await open(page, '/music-videos', sample);
  const cards = page.locator('.mv-card');
  await expect(cards).toHaveCount(2);
  expect(await cards.evaluateAll((els) => els.map((e) => [e.getAttribute('href'), e.querySelector('.mcard-title')!.textContent, e.querySelector('.mcard-meta')!.textContent]))).toEqual([
    ['/music-videos/rooftop-radio', 'Rooftop Radio', 'Layla & Karim · 0:36 · Story'],
    ['/music-videos/river-lights', 'River Lights', 'Nour · 0:48 · Cast and world'],
  ]);
  const sizes = await cards.evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; }));
  expect(new Set(sizes.map((s) => s.join('x'))).size).toBe(1);
  expect(sizes[0][0]).toBe(sizes[0][1]);
  // the primary and its menu
  await expect(page.locator('.mv-new .btn-primary').first()).toHaveAttribute('href', '/new/music-video?mode=auto');
  await page.getByRole('button', { name: 'Choose how to start' }).click();
  await expect(page.getByRole('menuitem', { name: /Let the studio write the song/ })).toHaveAttribute('href', '/new/music-video?mode=auto');
  await expect(page.getByRole('menuitem', { name: /Bring your own song/ })).toHaveAttribute('href', '/new/music-video?mode=manual');
  await page.keyboard.press('Escape');
  await cards.nth(1).click();
  await expect(page).toHaveURL(/\/music-videos\/river-lights$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('River Lights');
});

test('a sleeve previews the real song: the disc shows on hover and focus, and plays the file', async ({ page }) => {
  await open(page, '/music-videos', sample);
  const item = page.locator('.mv-item').nth(1);
  const disc = item.locator('.mv-disc');
  await expect(disc).toHaveCSS('opacity', '0');
  await item.hover();
  await expect(disc).toHaveCSS('opacity', '1');
  await page.mouse.move(0, 0);
  await item.locator('.mv-card').focus();
  await expect(disc).toHaveCSS('opacity', '1');
  await disc.getByRole('button', { name: 'Play River Lights' }).click();
  await expect(disc.getByRole('button', { name: 'Pause River Lights' })).toBeVisible({ timeout: 20_000 });
  await disc.getByRole('button', { name: 'Pause River Lights' }).click();
  await expect(disc.getByRole('button', { name: 'Play River Lights' })).toBeVisible();
});

test('a sleeve card shows the focus ring when reached with the keyboard', async ({ page }) => {
  await open(page, '/music-videos', sample);
  let ring: { style: string; width: string } | null = null;
  for (let i = 0; i < 60 && !ring; i++) {
    await page.keyboard.press('Tab');
    ring = await page.evaluate(() => { const a = document.activeElement as HTMLElement; if (!a?.matches('.mv-card:focus-visible')) return null; const cs = getComputedStyle(a); return { style: cs.outlineStyle, width: cs.outlineWidth }; });
  }
  expect(ring).toEqual({ style: 'solid', width: '2px' });
});

test('the title page: the song first — title, performers, the audio row, lyrics by section with Arabic right to left', async ({ page }) => {
  await open(page, '/music-videos/river-lights', sample);
  await expect(page.locator('h1.t-display')).toHaveText('River Lights');
  await expect(page.locator('.mv-alt')).toHaveText('أضواء النهر');
  await expect(page.locator('.mv-performers')).toContainText('Nour');
  await expect(page.locator('.mv-transport')).toHaveCount(1);
  expect(Math.round((await page.locator('.mv-transport').boundingBox())!.height)).toBe(64);
  await expect(page.locator('.mv-transport').getByRole('slider', { name: 'Seek River Lights' })).toBeVisible({ timeout: 30_000 });
  const labels = await page.locator('.mv-sec-label').allTextContents();
  expect(labels).toEqual(['Intro', 'Verse', 'Chorus', 'Outro']);
  const verse = page.locator('.mv-sec').nth(1);
  await expect(verse.locator('.mv-sec-singer')).toHaveText('Nour');
  const arabic = verse.locator('.mv-line');
  await expect(arabic).toHaveCount(2);
  expect(await arabic.evaluateAll((els) => els.map((e) => [e.getAttribute('lang'), getComputedStyle(e).direction]))).toEqual([['ar', 'rtl'], ['ar', 'rtl']]);
  await expect(verse.locator('.mv-sec-trans p').first()).toHaveText('The river keeps the lights it borrows,');
  // facts and cast: only what the studio has (no tempo in the sample)
  await expect(page.locator('.mv-facts dt')).toHaveText(['Genre', 'Mood', 'Treatment', 'Sung in', 'Song']);
  await expect(page.locator('.mv-person')).toHaveText(/Nour\s*Sings the verse and chorus/);
  await expect(page.locator('.mv-video')).toHaveCount(0);
});

test('Continue and Edit the song open the production at their tabs; the back link returns to the catalogue', async ({ page }) => {
  await open(page, '/music-videos/river-lights', sample);
  await expect(page.locator('.mv-acts .btn-primary')).toHaveText('Continue: filming');
  await expect(page.locator('.mv-acts .btn-primary')).toHaveAttribute('href', '/music-videos/river-lights/production?tab=produce');
  await expect(page.getByRole('link', { name: 'Edit the song' })).toHaveAttribute('href', '/music-videos/river-lights/production?tab=song');
  await page.getByRole('link', { name: 'Music videos', exact: true }).first().click();
  await expect(page).toHaveURL(/\/music-videos$/);
});

test('playback controls: play from a section, the section lights up, pause', async ({ page }) => {
  await open(page, '/music-videos/river-lights', sample);
  await page.getByRole('button', { name: 'Play from Chorus' }).click();
  const disc = page.locator('.mv-transport').getByRole('button', { name: 'Pause', exact: true });
  await expect(disc).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.mv-lyrics')).toHaveAttribute('data-playing');
  await expect(page.locator('.mv-sec').nth(2)).toHaveAttribute('data-live');
  await disc.click();
  await expect(page.locator('.mv-transport').getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

test('More: Delete asks first, and Cancel keeps the music video', async ({ page }) => {
  await open(page, '/music-videos/river-lights', sample);
  await page.getByRole('button', { name: 'More for River Lights' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Delete River Lights?');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('h1.t-display')).toHaveText('River Lights');
});

test('a finished music video shows its cut and its tempo', async ({ page }) => {
  await open(page, '/music-videos/river-lights', finished);
  await expect(page.locator('.mv-meta .badge')).toHaveText('Finished');
  await expect(page.locator('.mv-acts .btn-primary')).toHaveText('Open the production');
  await expect(page.locator('.mv-facts')).toContainText('84 BPM');
  await expect(page.locator('.mv-video video')).toHaveCount(1);
});

test('a link to a music video that is not in the studio says so and leads back', async ({ page }) => {
  await open(page, '/music-videos/not-a-music-video', sample);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This music video isn’t in the studio');
  await expect(page.getByRole('link', { name: 'Back to Music videos' })).toHaveAttribute('href', '/music-videos');
});

test('loading: each page shows its own skeleton, then the content without moving', async ({ page }) => {
  test.skip(!/MusicVideosSkeleton/.test(fs.readFileSync('src/components/shell/route-skeletons.tsx', 'utf8')), 'the route skeletons are registered by the coordinator');
  test.setTimeout(360_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await prep(page, { fixture: sample, motion: 'reduce' });
  // a slow network (as the acceptance script): the studio's first snapshot takes a while, the skeleton holds the page
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.5 * 1024 * 1024) / 8, uploadThroughput: (0.75 * 1024 * 1024) / 8 });
  await page.addInitScript(() => { const w = window as unknown as { __sk: boolean }; w.__sk = false; new MutationObserver(() => { if (document.querySelector('.mv-sk')) w.__sk = true; }).observe(document, { childList: true, subtree: true }); });
  for (const path of ['/music-videos', '/music-videos/river-lights']) {
    await page.goto(path, { waitUntil: 'commit' });
    await expect(page.locator('main h1')).toBeVisible({ timeout: 150_000 });
    expect(await page.evaluate(() => (window as unknown as { __sk: boolean }).__sk)).toBe(true);
    await expect(page.locator('.mv-sk')).toHaveCount(0);
  }
});

test('phone 390: two sleeves across, the disc shown for touch, no horizontal overflow @mobile', async ({ page }) => {
  await open(page, '/music-videos', sample, 390, 844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
  const boxes = await page.locator('.mv-card').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(boxes).size).toBe(1);
  await expect(page.locator('.mv-disc').first()).toHaveCSS('opacity', '1');
  await open(page, '/music-videos/rooftop-radio', sample, 390, 844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
  const primary = await page.locator('.mv-acts .btn-primary').boundingBox();
  expect(Math.round(primary!.width)).toBe(358);
});
