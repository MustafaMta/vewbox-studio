import type { Page } from '@playwright/test';
import { expect, test } from './helpers';

/** The character surfaces that need no GPU: the creation page's three starts and its browser-side preflight, the
 *  voice lock on the sample studio's used character, and the directory as a wall of portrait links. */

/** A real PNG of the given size, drawn in the browser, so the min-side check measures a decoded picture. */
async function pngOf(page: Page, width: number, height: number): Promise<Buffer> {
  const dataUrl = await page.evaluate(([w, h]: readonly [number, number]) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!; g.fillStyle = '#556'; g.fillRect(0, 0, w, h); return c.toDataURL('image/png'); }, [width, height] as const);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

test('the creation page offers three starts and refuses an empty Describe start with the right copy', async ({ page }) => {
  await page.goto('/characters/new');
  await expect(page.getByRole('heading', { level: 1, name: 'Add Character' })).toBeVisible();
  const starts = page.getByRole('radiogroup').filter({ has: page.getByText('Describe them') });
  await expect(starts.getByRole('radio', { name: /Describe them/ })).toBeChecked();
  await expect(starts.getByText('Write the sheet')).toBeVisible();
  await expect(starts.getByText('From a picture')).toBeVisible();
  // the shared header: for whom, style, language (dialect only for Arabic)
  await expect(page.getByLabel('For', { exact: true })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Style' })).toBeVisible();
  await expect(page.getByLabel('Dialect')).toHaveCount(0);
  await page.getByRole('radiogroup', { name: 'Language' }).getByRole('radio', { name: 'Arabic' }).click();
  await expect(page.getByLabel('Dialect')).toBeVisible();
  // an empty brief and no name: the button says why instead of starting a job
  const design = page.getByRole('button', { name: 'Design character' });
  await design.click();
  await expect(page.getByRole('alert')).toContainText('Write a line about them, or at least a name.');
  await expect(page).toHaveURL(/\/characters\/new/);
});

test('the From a picture start refuses a 100×100 image with the min-side reason, before any upload', async ({ page }) => {
  await page.goto('/characters/new');
  await page.getByRole('radio', { name: /From a picture/ }).check({ force: true });
  const small = await pngOf(page, 100, 100);
  const uploads: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/assets') && r.method() === 'POST') uploads.push(r.url()); });
  await page.getByLabel('Drop the picture here').setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: small });
  await expect(page.getByRole('alert')).toContainText('the shortest side must be at least 512 px');
  await expect(page.getByRole('alert')).toContainText('100 × 100');
  await expect(page.getByRole('button', { name: 'Design from picture' })).toBeDisabled();
  expect(uploads).toEqual([]);
  // an SVG is refused by type, with a sentence
  await page.getByLabel('Drop the picture here').setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  await expect(page.getByRole('alert')).toContainText('SVG and GIF are refused');
  expect(uploads).toEqual([]);
});

test('the Voice tab shows the lock notice for the sample studio’s used character, with the build disabled', async ({ page }) => {
  await page.goto('/characters/layla?tab=voice');
  await expect(page.getByRole('heading', { name: 'Voice identity' })).toBeVisible();
  await expect(page.getByText('This character has spoken in a video. The voice identity is preserved for continuity')).toBeVisible();
  const build = page.getByRole('button', { name: /^Build the voice/ });
  if (await build.count()) await expect(build.first()).toBeDisabled();
  // the lock is also said in the hero
  await expect(page.getByText(/Look and voice preserved|Look preserved/)).toBeVisible();
});

test('the directory renders portraits as links, with the name and role beneath the picture', async ({ page }) => {
  await page.goto('/characters');
  const wall = page.getByRole('list', { name: 'Characters' });
  await expect(wall).toBeVisible();
  const links = wall.getByRole('link', { name: /Layla/ });
  await expect(links.first()).toHaveAttribute('href', /\/characters\/layla/);
  await expect(links.first().locator('.poster')).toBeVisible();
  await expect(links.first().locator('.poster-title')).toContainText('Layla');
  // the usage filter speaks the producer's words
  await expect(page.getByLabel('Usage').locator('option')).toContainText(['Unused', 'In videos', 'History not on record']);
});
