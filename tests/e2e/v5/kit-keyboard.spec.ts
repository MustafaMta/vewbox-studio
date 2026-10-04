import { expect, test } from '@playwright/test';
import { openKit } from './kit-helpers';

/** THE KIT'S KEYBOARD (docs/DESIGN-SYSTEM-V4.md §5.11, §5.17, §5.18; kept under VISUAL-STANDARD-V5.1 §5) on the /kit
 *  specimen: roving focus in Tabs, Segmented and ChoiceTiles, the ConfirmDialog behind useConfirm, useAsk, a Toast
 *  that stays while it has focus, the page's title and the contrast switch. The Dialog's focus trap and the Menu's
 *  keyboard are covered by kit.spec.ts. Read-only. Migrated from tests/e2e/v4/kit-keyboard.spec.ts. */

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

test.describe('roving focus', () => {
  test('TabBar: one Tab stop; ←/→, Home, End move and select; the disabled tab is skipped; no wrap', async ({ page }) => {
    await openKit(page, '#navigation');
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
    await openKit(page, '#choices');
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
    await openKit(page, '#choices');
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
  // the v5 specimen's openers are "Confirm" (useConfirm: Delete “The Kite”?) and "Ask" (useAsk: Reject this take?)
  test('useConfirm: a ConfirmDialog (never window.confirm) — Cancel has focus, Esc resolves false and returns focus', async ({ page }) => {
    let browserDialog = false;
    page.on('dialog', (d) => { browserDialog = true; void d.dismiss(); });
    await openKit(page, '#overlays');
    const opener = page.locator('#overlays').getByRole('button', { name: 'Confirm', exact: true });
    await opener.click();
    const confirm = page.getByRole('alertdialog', { name: 'Delete “The Kite”?' });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText('Its seasons, episodes and cuts go with it.');
    await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirm).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(page.locator('.toast-region').getByText('Deleted', { exact: true })).toHaveCount(0);
    await opener.click();
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('.toast-region').getByText('Deleted', { exact: true })).toBeVisible();
    expect(browserDialog).toBe(false);
  });

  test('useAsk: the field takes focus; the confirm waits for an answer; Enter submits', async ({ page }) => {
    await openKit(page, '#overlays');
    await page.locator('#overlays').getByRole('button', { name: 'Ask', exact: true }).click();
    const ask = page.getByRole('alertdialog', { name: 'Reject this take?' });
    const field = ask.getByRole('textbox', { name: 'Why is this take rejected?' });
    await expect(field).toBeFocused();
    await expect(ask.getByRole('button', { name: 'Reject' })).toBeDisabled();
    await field.fill('The cup changes hands');
    await page.keyboard.press('Enter');
    await expect(ask).toBeHidden();
    await expect(page.locator('#overlays').getByRole('status').filter({ hasText: 'Answer: The cup changes hands' })).toBeVisible();
  });

  // the v5 toast: 5 s for a line, 10 s with an action or a link; the clock stops while it is hovered or holds focus
  test('Toast: a toast with an action (10 s) stays while its button has focus and leaves once focus moves on', async ({ page }) => {
    await openKit(page, '#feedback');
    await page.mouse.move(2, 2);
    await page.getByTestId('toast-undo').click();
    const toast = page.locator('.toast-region .toast', { hasText: 'Archived' });
    await expect(toast).toBeVisible();
    await toast.getByRole('button', { name: 'Undo' }).focus();
    await expect(toast).toHaveAttribute('data-held', 'true');
    await page.waitForTimeout(10_500);
    await expect(toast).toBeVisible();
    await page.getByTestId('toast-undo').focus();
    await expect(toast).not.toHaveAttribute('data-held', 'true');
    await expect(toast).toBeHidden({ timeout: 11_000 });
  });

  test('Toast: without focus or hover a line leaves after about 5 s', async ({ page }) => {
    await openKit(page, '#feedback');
    await page.mouse.move(2, 2);
    await page.getByTestId('toast-ok').click();
    const toast = page.locator('.toast-region').getByRole('status').filter({ hasText: 'Saved' });
    await expect(toast).toBeVisible();
    await page.waitForTimeout(3500);
    await expect(toast).toBeVisible();
    await expect(toast).toBeHidden({ timeout: 4000 });
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
    const mutedColour = () => page.locator('.text-muted').first().evaluate((el) => getComputedStyle(el).color);
    const before = await mutedColour();
    await contrast.getByRole('radio', { name: 'More contrast' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'more');
    // --fg-muted is raised: the muted text takes the "more" value of --text-2 (tokens.css html[data-contrast='more'])
    const token = await page.evaluate(() => { const p = document.createElement('p'); p.style.color = 'var(--text-2)'; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c; });
    await expect.poll(mutedColour).toBe(token);
    expect(await mutedColour()).not.toBe(before);
    await contrast.getByRole('radio', { name: /^System/ }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-contrast', /.+/);
    await expect.poll(mutedColour).toBe(before);
  });
});
