import type { Page } from '@playwright/test';
import { expect, test } from './helpers';

/** The character surfaces that need no GPU (docs/CONTRACTS-IDENTITY-PACK.md v2, DESIGN-SYSTEM-V3 §9.4–9.7): the
 *  creation page — method first, settings as one line, the three-step sheet, the 4:5 picture frame and its
 *  browser-side preflight — the single cast profile with its state said once and the voice lock on the sample
 *  studio's used character, and the directory as a wall of cast cards. */

/** A real PNG of the given size, drawn in the browser, so the min-side check measures a decoded picture. */
async function pngOf(page: Page, width: number, height: number): Promise<Buffer> {
  const dataUrl = await page.evaluate(([w, h]: readonly [number, number]) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!; g.fillStyle = '#556'; g.fillRect(0, 0, w, h); return c.toDataURL('image/png'); }, [width, height] as const);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

test('the creation page asks for the method first, keeps the settings to one line, and refuses an empty Describe start', async ({ page }) => {
  await page.goto('/characters/new');
  await expect(page.getByRole('heading', { level: 1, name: 'New character' })).toBeVisible();
  const starts = page.getByRole('radiogroup', { name: 'How do you want to start?' });
  await expect(starts.getByRole('radio', { name: /Describe them/ })).toBeChecked();
  await expect(starts.getByText('Write the sheet')).toBeVisible();
  await expect(starts.getByText('From a picture')).toBeVisible();
  // the settings are a summary line; Change opens for whom, style, language (dialect only for Arabic)
  await expect(page.getByRole('radiogroup', { name: 'Style' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Change' }).click();
  await expect(page.getByLabel('Who it is for')).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Style' })).toBeVisible();
  await page.getByRole('radiogroup', { name: 'Language' }).getByRole('radio', { name: 'English' }).click();
  await expect(page.getByLabel('Dialect')).toHaveCount(0);
  await page.getByRole('radiogroup', { name: 'Language' }).getByRole('radio', { name: 'العربية' }).click();
  await expect(page.getByLabel('Dialect')).toBeVisible();
  // nothing is preselected: sex and age wait on "Studio decides"
  await page.getByText('More control').click();
  await expect(page.getByRole('radiogroup', { name: 'Sex' }).getByRole('radio', { name: 'Studio decides' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radiogroup', { name: 'Age' }).getByRole('radio', { name: 'Studio decides' })).toHaveAttribute('aria-checked', 'true');
  // an empty brief and no name: the button says why instead of starting a job
  await page.getByRole('button', { name: 'Design character' }).click();
  await expect(page.getByRole('alert')).toContainText('Write a line about them, or at least a name.');
  await expect(page).toHaveURL(/\/characters\/new/);
});

test('Write the sheet is three short steps, and the first one needs a name', async ({ page }) => {
  await page.goto('/characters/new?start=sheet');
  const steps = page.getByRole('list', { name: 'The sheet, in three steps' });
  await expect(steps.getByText('Identity')).toBeVisible();
  await expect(steps.locator('[aria-current="step"]')).toContainText('Identity');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('alert')).toContainText('give them a name');
  await page.getByLabel('Name', { exact: true }).fill('Noor');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(steps.locator('[aria-current="step"]')).toContainText('Look');
  await expect(page.getByLabel('Describe how they look')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(steps.locator('[aria-current="step"]')).toContainText('Voice');
  await expect(page.getByRole('button', { name: 'Create and draw' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeVisible();
});

test('the From a picture start is a 4:5 frame that refuses a 100×100 image with the min-side reason, before any upload', async ({ page }) => {
  await page.goto('/characters/new?start=picture');
  const small = await pngOf(page, 100, 100);
  const uploads: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/assets') && r.method() === 'POST') uploads.push(r.url()); });
  const drop = page.getByLabel(/Drop a picture here/);
  const frame = await page.locator('label.dropzone').first().boundingBox();
  expect(frame && Math.abs(frame.width / frame.height - 0.8)).toBeLessThan(0.02);
  await drop.setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: small });
  await expect(page.getByRole('alert')).toContainText('the shortest side must be at least 512 px');
  await expect(page.getByRole('alert')).toContainText('100 × 100');
  await expect(page.getByRole('button', { name: 'Design from picture' })).toBeDisabled();
  expect(uploads).toEqual([]);
  // an SVG is refused by type, with a sentence
  await drop.setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  await expect(page.getByRole('alert')).toContainText('SVG and GIF are refused');
  expect(uploads).toEqual([]);
});

test('the profile is one page: the image, its state said once, the voice, the productions — no tabs', async ({ page }) => {
  await page.goto('/characters/layla');
  await expect(page.getByRole('heading', { level: 1, name: /Layla/ })).toBeVisible();
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Voice identity' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Productions/ })).toBeVisible();
  // the sample studio's Layla has been filmed: the lock is said once, under the image, and nothing offers a redraw
  await expect(page.getByText(/^Locked: (used in \d+ videos?|video history not on record)$/)).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^(Redraw|Approve image)$/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit details' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Edit look' })).toBeDisabled();
});

test('the voice is held for the sample studio’s used character, and a link to the old Voice tab lands on it', async ({ page }) => {
  await page.goto('/characters/layla?tab=voice');
  await expect(page.getByRole('heading', { name: 'Voice identity' })).toBeInViewport();
  await expect(page.getByText('This character has spoken in a video, so the voice is kept as it is.')).toBeVisible();
  const build = page.getByRole('button', { name: /^Build voice from|^Build the voice/ });
  if (await build.count()) await expect(build.first()).toBeDisabled();
  // the voice is never called natural or Iraqi without a listening record
  await expect(page.getByText(/^natural \d of 5/)).toHaveCount(0);
});

test('the directory shows cast cards — the image as one link, the name, the role and one line of state', async ({ page }) => {
  await page.goto('/characters');
  const wall = page.getByRole('list', { name: 'Characters' });
  await expect(wall).toBeVisible();
  const links = wall.getByRole('link', { name: /Layla/ });
  await expect(links.first()).toHaveAttribute('href', /\/characters\/layla/);
  await expect(links.first().locator('.poster')).toBeVisible();
  const card = wall.locator('li').filter({ has: page.locator('a[href="/characters/layla"]') }).first();
  await expect(card).toContainText('Layla');
  await expect(card).toContainText(/In \d+ videos?|Locked|Draft|Approved|Older portrait|No image yet/);
  // the filters speak the producer's words
  await expect(page.getByLabel('Usage').locator('option')).toContainText(['Unused', 'In videos', 'History not on record']);
  await expect(page.getByLabel('Identity').locator('option')).toContainText(['Draft', 'Approved', 'Locked', 'No image yet']);
});
