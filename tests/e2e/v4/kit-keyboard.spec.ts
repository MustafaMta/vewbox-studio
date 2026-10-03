import { expect, test } from '@playwright/test';
import { openKit } from './kit-helpers';

/** THE KIT'S KEYBOARD (docs/DESIGN-SYSTEM-V4.md §5.11, §5.17, §5.18; §8.5 F2 acceptance) on the /kit specimen:
 *  roving focus in Tabs, Segmented and ChoiceTiles, the Dialog's focus trap and focus return,
 *  the ConfirmDialog behind useConfirm, the Menu's Esc, and a Toast that stays while it has focus.
 *  Run: $env:STUDIO_URL='http://localhost:4221'; pnpm exec playwright test tests/e2e/v4 --project=desktop
 *  Read-only: no reset, no write API (kit-helpers answers every write in the browser). */

test.describe('roving focus', () => {
  test('TabBar: one Tab stop; ←/→, Home, End move and select; the disabled tab is skipped; no wrap', async ({ page }) => {
    await openKit(page);
    const bar = page.locator('#navigation').getByRole('tablist', { name: 'Episode workspace' });
    await expect(bar.locator('[tabindex="0"]')).toHaveCount(1);
    await bar.getByRole('tab', { name: 'Story', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(bar.getByRole('tab', { name: /^Storyboard/ })).toBeFocused();
    await expect(bar.getByRole('tab', { name: /^Storyboard/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#navigation').getByRole('tabpanel')).toContainText('The Storyboard');
    await page.keyboard.press('End');
    await expect(bar.getByRole('tab', { name: 'Produce' })).toBeFocused();
    await page.keyboard.press('ArrowRight'); // Final Cut is disabled, and the bar does not wrap
    await expect(bar.getByRole('tab', { name: 'Produce' })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(bar.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(bar.getByRole('tab', { name: 'Overview' })).toBeFocused();
    await expect(bar.locator('[tabindex="0"]')).toHaveCount(1);
  });

  test('Segmented: arrows move the choice and wrap; a disabled option is skipped; Tab leaves the group', async ({ page }) => {
    await openKit(page);
    const light = page.locator('#choices').getByRole('radiogroup', { name: 'Lighting states' }).first();
    await light.getByRole('radio', { name: 'Dusk' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(light.getByRole('radio', { name: 'Night' })).toBeFocused();
    await expect(light.getByRole('radio', { name: 'Night' })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(light.getByRole('radio', { name: 'Day' })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('End');
    await expect(light.getByRole('radio', { name: 'Night' })).toBeFocused();
    const mode = page.locator('#choices').getByRole('radiogroup', { name: 'Song or video' });
    await mode.getByRole('radio', { name: 'Song' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(mode.getByRole('radio', { name: 'Song' })).toBeFocused();
    await expect(mode.getByRole('radio', { name: 'Video' })).toHaveAttribute('aria-checked', 'false');
    await expect(mode.getByRole('radio', { name: 'Video' })).toHaveAccessibleDescription('No cut yet');
    await page.keyboard.press('Tab');
    expect(await mode.evaluate((el) => el.contains(document.activeElement))).toBe(false);
  });

  test('ChoiceTiles: one Tab stop; arrows move the selection past a disabled tile', async ({ page }) => {
    await openKit(page);
    const tiles = page.locator('#choices').getByRole('radiogroup', { name: 'How do you want to start the character?' });
    await expect(tiles.locator('[tabindex="0"]')).toHaveCount(1);
    await tiles.getByRole('radio', { name: /Describe them/ }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tiles.getByRole('radio', { name: /Fill in a sheet/ })).toBeFocused();
    await expect(tiles.getByRole('radio', { name: /Fill in a sheet/ })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowDown'); // "From a picture" is disabled: back to the first
    await expect(tiles.getByRole('radio', { name: /Describe them/ })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowUp');
    await expect(tiles.getByRole('radio', { name: /Fill in a sheet/ })).toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('overlays', () => {
  test('Dialog: the first field takes focus, Tab stays inside, Esc closes and focus returns to the opener', async ({ page }) => {
    await openKit(page);
    const opener = page.getByRole('button', { name: 'Open a dialog' });
    await opener.click();
    const dlg = page.getByRole('dialog', { name: 'Rename the show' });
    await expect(dlg).toBeVisible();
    await expect(dlg.getByRole('textbox', { name: 'Title' })).toBeFocused();
    await expect(dlg).toHaveAccessibleDescription('The new title shows everywhere the show appears.');
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(await dlg.evaluate((el) => el.contains(document.activeElement)), `Tab ${i + 1} left the dialog`).toBe(true);
    }
    await dlg.getByRole('button', { name: 'Close' }).focus();
    await page.keyboard.press('Shift+Tab'); // the close button is the first stop: Shift+Tab wraps to the last
    await expect(dlg.getByRole('button', { name: 'Save' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dlg.getByRole('button', { name: 'Close' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('useConfirm: a ConfirmDialog (never window.confirm) — Cancel has focus, Esc resolves false and returns focus', async ({ page }) => {
    let browserDialog = false;
    page.on('dialog', (d) => { browserDialog = true; void d.dismiss(); });
    await openKit(page);
    const opener = page.getByRole('button', { name: 'Delete a show…' });
    await opener.click();
    const confirm = page.getByRole('alertdialog', { name: 'Delete “The Kite”?' });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText('Its seasons, episodes and shots go with it.');
    await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirm).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(page.getByRole('status').filter({ hasText: 'Deleted.' })).toHaveCount(0);
    await opener.click();
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Deleted.' })).toBeVisible();
    expect(browserDialog).toBe(false);
  });

  test('useAsk: the field takes focus; the confirm waits for an answer; Enter submits', async ({ page }) => {
    await openKit(page);
    await page.getByRole('button', { name: 'Reject a take…' }).click();
    const ask = page.getByRole('alertdialog', { name: 'Reject Take 2?' });
    const field = ask.getByRole('textbox', { name: 'Why? The next take avoids it.' });
    await expect(field).toBeFocused();
    await expect(ask.getByRole('button', { name: 'Reject' })).toBeDisabled();
    await field.fill('The cup changes hands');
    await page.keyboard.press('Enter');
    await expect(ask).toBeHidden();
    await expect(page.getByRole('status').filter({ hasText: 'The answer: The cup changes hands' })).toBeVisible();
  });

  test('MenuButton: opens on the first item, arrows move, Esc closes and returns focus to the button', async ({ page }) => {
    await openKit(page);
    const button = page.locator('#overlays').getByRole('button', { name: 'More', exact: true });
    await button.click();
    const menu = page.locator('#overlays').getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /^Edit/ })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem', { name: 'Duplicate' })).toBeFocused();
    await page.keyboard.press('ArrowDown'); // Export is disabled
    await expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(menu.getByRole('menuitem', { name: /^Edit/ })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('ArrowUp'); // ↑ on the button opens at the last item
    await expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(button).toBeFocused();
  });

  test('Toast: 4 s, but it stays while it has focus and leaves once focus moves on', async ({ page }) => {
    await openKit(page);
    await page.mouse.move(2, 2);
    await page.getByRole('button', { name: 'Show a toast', exact: true }).click();
    const toast = page.locator('.toast-region').getByRole('status').filter({ hasText: 'Saved.' });
    await expect(toast).toBeVisible();
    await toast.getByRole('button', { name: 'Dismiss' }).focus();
    await page.waitForTimeout(5500);
    await expect(toast).toBeVisible();
    await page.getByRole('button', { name: 'Show a toast', exact: true }).focus();
    await expect(toast).toBeHidden({ timeout: 6000 });
  });

  test('Toast: without focus or hover it leaves after about 4 s', async ({ page }) => {
    await openKit(page);
    await page.mouse.move(2, 2);
    await page.getByRole('button', { name: 'Show a toast', exact: true }).click();
    const toast = page.locator('.toast-region').getByRole('status').filter({ hasText: 'Saved.' });
    await expect(toast).toBeVisible();
    await page.waitForTimeout(3000);
    await expect(toast).toBeVisible();
    await expect(toast).toBeHidden({ timeout: 3000 });
  });
});

test.describe('the specimen page', () => {
  test('has its own English title', async ({ page }) => {
    await openKit(page);
    await expect(page).toHaveTitle('Interface kit · Vewbox Studio');
  });
  test('More contrast: the specimen switch sets html[data-contrast] and puts it back', async ({ page }) => {
    await openKit(page);
    const contrast = page.getByRole('radiogroup', { name: 'Contrast' });
    await contrast.getByRole('radio', { name: 'More' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'more');
    const muted = await page.locator('.text-muted').first().evaluate((el) => getComputedStyle(el).color);
    expect(muted).toBe('rgb(221, 214, 203)'); // --fg-muted is raised to --ink-200 (tokens.css)
    await contrast.getByRole('radio', { name: 'As the system' }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-contrast', /.+/);
  });
});

