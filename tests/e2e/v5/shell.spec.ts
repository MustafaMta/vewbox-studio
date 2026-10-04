import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { open, PHONE } from './shell-helpers';

/** THE SHELL: what holds for any shell (WCAG 2.4.1, 2.4.3; docs/DESIGN-SYSTEM-V5.md §5.0), on the fixture studio,
 *  read-only. The v4 shell suites (tests/e2e/v4/f4-shell, f4-keyboard) described the sidebar, rail, phone bar, palette
 *  and status row of the v4 shell, which the Krea-reference shell replaced on 2026-10-03/04; they were deleted
 *  (docs/TESTING.md), and these two checks are what survives. A spec of the new shell's own keyboard order, palette and
 *  phone menu is owed by the shell's owner once its design is approved. */

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

const seriousOrCritical = async (page: import('@playwright/test').Page) => {
  const r = await new AxeBuilder({ page }).analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
};

test('the skip link is the first focusable element and leads to the content', async ({ page }) => {
  await open(page, '/shows');
  await page.keyboard.press('Tab');
  const skip = page.locator('a.skip-link');
  await expect(skip).toBeFocused();
  await expect(skip).toHaveText('Skip to content');
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
  await page.keyboard.press('Tab');
  // the next stop is inside the page, not the navigation
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('main')))).toBe(true);
});

test('axe: no serious or critical issue in the shell at 1440', async ({ page }) => {
  await open(page, '/shows');
  expect(await seriousOrCritical(page)).toEqual([]);
});

test.describe('on a phone', () => {
  test.use(PHONE);
  test('@mobile axe: no serious or critical issue in the shell on a phone', async ({ page }) => {
    await open(page, '/characters');
    expect(await seriousOrCritical(page)).toEqual([]);
  });
});
