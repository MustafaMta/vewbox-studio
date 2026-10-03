import { expect, test } from '@playwright/test';
import { openKit } from './f3-helpers';

/** DESIGN-SYSTEM-V4 §1.2 rule 10, §5.6, §5.14, §5.20 (WCAG 2.5.7, 2.1.1): every drag has a button and a keyboard
 *  path, and a rail is one Tab stop. Read-only (the specimens keep their state in the page). */

test('a shelf pages with its prev/next buttons (the pointer alternative to dragging the row)', async ({ page }) => {
  await openKit(page, '#media');
  const shelf = page.locator('#media .shelf').first();
  const track = shelf.locator('.shelf-track');
  const next = shelf.getByRole('button', { name: /^Next/ });
  await expect(next).toBeVisible();
  await expect(shelf.getByRole('button', { name: /^Previous/ })).toBeDisabled();
  const before = await track.evaluate((el) => el.scrollLeft);
  await next.click();
  await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before);
});
test('the timeline: trim by ±1 frame buttons, the ruler and the clips by keyboard, zoom by buttons', async ({ page }) => {
  await openKit(page, '#edit');
  const tl = page.locator('#edit .tl');
  await tl.scrollIntoViewIfNeeded();
  const clip3 = tl.locator('.tl-clip[data-ci="2"]');
  const width = async () => (await clip3.boundingBox())!.width;
  const w0 = await width();
  await tl.getByRole('button', { name: 'End 1 frame later' }).click();
  await tl.getByRole('button', { name: 'End 1 frame later' }).click();
  expect(await width()).toBeGreaterThan(w0);
  // the ruler is a slider: → moves the playhead one frame
  const ruler = tl.getByRole('slider', { name: /Ruler/ });
  const v0 = await ruler.getAttribute('aria-valuetext');
  await ruler.focus(); await page.keyboard.press('Shift+ArrowRight');
  expect(await ruler.getAttribute('aria-valuetext')).not.toBe(v0);
  // clips: arrows move, Shift+Space extends the selection
  await clip3.focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+Space');
  await expect(tl.locator('.tl-clip[aria-selected="true"]')).toHaveCount(2);
  await tl.getByRole('button', { name: 'Zoom in' }).click();
  await expect(tl.getByRole('button', { name: 'Fit' })).toHaveAttribute('aria-pressed', 'false');
});

test('the dock splitter moves 16 px per arrow and collapses with Enter; Reset layout restores it', async ({ page }) => {
  await openKit(page, '#edit');
  const split = page.locator('#edit .dock-split').first();
  await split.scrollIntoViewIfNeeded();
  const v = async () => Number(await split.getAttribute('aria-valuenow'));
  const v0 = await v();
  await split.focus(); await page.keyboard.press('ArrowRight');
  expect(await v()).toBe(v0 + 16);
  await page.keyboard.press('Enter');
  await expect(page.locator('#edit .dock-rail')).toHaveCount(1);
  await page.locator('#edit .dock-bar summary').click();
  await page.getByRole('menuitem', { name: 'Reset layout' }).click();
  await expect(page.locator('#edit .dock-rail')).toHaveCount(0);
  expect(await v()).toBe(280);
});

test('the dual-scale window moves by buttons and by keyboard', async ({ page }) => {
  await openKit(page, '#edit');
  const win = page.locator('#edit .dstrip-window');
  await win.scrollIntoViewIfNeeded();
  expect(await win.getAttribute('aria-valuenow')).toBe('0');
  await page.getByRole('button', { name: 'Show a later part' }).click();
  expect(await win.getAttribute('aria-valuenow')).toBe('60');
  await win.focus(); await page.keyboard.press('End');
  expect(await win.getAttribute('aria-valuenow')).toBe('300');
});

test('lyric timing nudges by 0.1 s buttons; the singer by a menu, never by drag', async ({ page }) => {
  await openKit(page, '#players');
  const edit = page.locator('.lyrics[data-edit]').first();
  await edit.scrollIntoViewIfNeeded();
  await expect(edit.locator('select').first()).toBeVisible();
  await expect(edit.getByRole('button', { name: /Start 0\.1 s later/ }).first()).toBeVisible();
  await expect(edit.getByRole('spinbutton').first()).toHaveValue('8');
});
