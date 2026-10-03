import { expect, test, type Page } from '@playwright/test';
import { prepare } from '../../../scripts/lib/capture.mjs';

/** THE KIT'S BEHAVIOUR on the /kit specimen (docs/design/VISUAL-STANDARD-V5.1.md §5.4, §5.16–§5.20): the Dialog's focus
 *  trap, Esc and focus return; the Menu's keyboard (arrows, Home/End, typeahead, Esc); toasts (a stack of three, paused
 *  while hovered); the Tooltip's 400 ms delay and Esc; the Shelf's arrows. Read-only: every write the page might send is
 *  answered by the capture helper. Run against your own server:
 *    $env:STUDIO_URL='http://localhost:4250'; npx playwright test tests/e2e/v5/kit.spec.ts --project=desktop */

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

async function openKit(page: Page, hash = '') {
  await page.setViewportSize({ width: 1440, height: 900 });
  await (prepare as (p: Page, o: { motion?: string }) => Promise<void>)(page, { motion: 'reduce' });
  await page.goto(`/kit${hash}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Interface kit' })).toBeVisible({ timeout: 90_000 });
}

test('Dialog: the first field takes focus, Tab stays inside, Esc closes and focus returns to the opener', async ({ page }) => {
  await openKit(page);
  const opener = page.getByTestId('open-dialog');
  await opener.scrollIntoViewIfNeeded();
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Rename the show' });
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('dialog-title')).toBeFocused();
  // the description is tied to the dialog
  await expect(dialog).toHaveAttribute('aria-describedby', /.+/);
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('Dialog: Cancel and a click on the overlay close it', async ({ page }) => {
  await openKit(page);
  await page.getByTestId('open-dialog').click();
  const dialog = page.getByRole('dialog', { name: 'Rename the show' });
  await page.getByTestId('dialog-cancel').click();
  await expect(dialog).toBeHidden();
  await page.getByTestId('open-dialog').click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(8, 450); // the overlay, outside the dialog's box
  await expect(dialog).toBeHidden();
});

test('Menu: ↓ opens on the first item, arrows and Home/End move, a letter jumps, Esc closes and refocuses the button', async ({ page }) => {
  await openKit(page);
  const button = page.locator('#overlays').getByRole('button', { name: 'More', exact: true });
  await button.scrollIntoViewIfNeeded();
  await button.focus();
  await page.keyboard.press('ArrowDown');
  const menu = page.locator('#overlays').getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /^Edit/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Duplicate' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(menu.getByRole('menuitem', { name: /^Edit/ })).toBeFocused();
  await page.keyboard.press('o');
  await expect(menu.getByRole('menuitem', { name: 'Open the film' })).toBeFocused();
  // the disabled item is skipped by the arrows
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(button).toBeFocused();
});

test('Toast: one line with its status; at most three stack; the clock stops while one is hovered', async ({ page }) => {
  await openKit(page, '#feedback');
  await page.getByTestId('toast-four').click();
  await expect(page.locator('.toast-region .toast')).toHaveCount(3);
  await expect(page.locator('.toast-region').getByText('Saved draft 4')).toBeVisible();
  await expect(page.locator('.toast-region').getByText('Saved draft 1')).toHaveCount(0);
  await expect(page.locator('.toast-region .toast')).toHaveCount(0, { timeout: 8_000 });
  await page.getByTestId('toast-ok').click();
  const toast = page.locator('.toast-region .toast', { hasText: 'Saved' });
  await expect(toast).toHaveAttribute('role', 'status');
  await toast.hover();
  await page.waitForTimeout(5_600);
  await expect(toast).toBeVisible();
  await page.mouse.move(700, 100);
  // the clock resumes where it stopped (about 5 s were left)
  await expect(toast).toHaveCount(0, { timeout: 7_500 });
});

test('Tooltip: appears after 400 ms on hover, describes its target, Esc hides it', async ({ page }) => {
  await openKit(page, '#feedback');
  const target = page.getByTestId('tip-edit');
  await target.scrollIntoViewIfNeeded();
  await target.hover();
  await page.waitForTimeout(150);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(page.getByRole('tooltip')).toHaveText('Edit', { timeout: 1_000 });
  const id = await page.getByRole('tooltip').getAttribute('id');
  await expect(target).toHaveAttribute('aria-describedby', id!);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});

test('Shelf: the arrows page an overflowing row and disable at its ends; a row that fits has none', async ({ page }) => {
  await openKit(page, '#cards');
  const shelf = page.locator('section.shelf', { has: page.locator('#kit-shelf-shows-h') });
  await shelf.scrollIntoViewIfNeeded();
  const prev = shelf.getByRole('button', { name: 'Previous shows' });
  const next = shelf.getByRole('button', { name: 'Next shows' });
  await expect(prev).toBeDisabled();
  await expect(next).toBeEnabled();
  const track = shelf.locator('.shelf-track');
  await next.click();
  await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expect(prev).toBeEnabled();
  await track.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  await expect(next).toBeDisabled();
  // the music shelf fits the column: no arrows
  const fits = page.locator('section.shelf', { has: page.locator('#kit-shelf-music-h') });
  await expect(fits.getByRole('button', { name: /^(Previous|Next) / })).toHaveCount(0);
  // the row runs to the viewport's end edge
  const right = await track.evaluate((el) => el.getBoundingClientRect().right);
  expect(Math.round(right)).toBe(1440);
});
