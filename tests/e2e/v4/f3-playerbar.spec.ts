import { expect, test } from '@playwright/test';
import { openKit } from './f3-helpers';

/** DESIGN-SYSTEM-V4 §5.12, §8.5 F3, WCAG 2.4.11: while the fixed PlayerBar is shown it sets --bottom-bars (76 px), and
 *  an element that receives keyboard focus below its top edge scrolls clear of it. Read-only. */

test('the PlayerBar sets --bottom-bars and a focused element below it scrolls clear', async ({ page }) => {
  await openKit(page, '#players');
  const bottomBars = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bottom-bars').trim());
  expect(await bottomBars()).toBe('0px');

  const toggle = page.getByTestId('toggle-playerbar');
  await toggle.click();
  const bar = page.locator('.playerbar[data-placement="fixed"]');
  await expect(bar).toBeVisible();
  expect(await bottomBars()).toBe('76px');
  const barTop = (await bar.boundingBox())!.y;

  // a pair of focusable controls further down: the first stays above the bar, the second sits under it
  const pair = await page.evaluate(() => {
    const xs = Array.from(document.querySelectorAll<HTMLElement>('#edit .ebtn:not([disabled]), #edit button:not([disabled])')).filter((e) => e.offsetParent && e.tabIndex >= 0);
    for (let i = 0; i + 1 < xs.length; i++) { const a = xs[i].getBoundingClientRect(), b = xs[i + 1].getBoundingClientRect(); if (b.top - a.bottom > 40 && b.top - a.top < 400) { xs[i].setAttribute('data-f3-a', ''); xs[i + 1].setAttribute('data-f3-b', ''); return true; } }
    return false;
  });
  expect(pair).toBe(true);
  const a = page.locator('[data-f3-a]'), b = page.locator('[data-f3-b]');
  // scroll so that B's top is 30 px above the window's bottom edge: behind the bar
  await b.evaluate((el) => { const r = el.getBoundingClientRect(); window.scrollBy(0, r.top - (window.innerHeight - 30)); });
  const before = (await b.boundingBox())!;
  expect(before.y + before.height).toBeGreaterThan(barTop);
  await a.focus();
  await page.keyboard.press('Tab');
  await expect(b).toBeFocused();
  const after = (await b.boundingBox())!;
  const top = (await bar.boundingBox())!.y;
  expect(after.y + after.height, 'the focused element ends above the player bar').toBeLessThanOrEqual(top);

  // closing the bar gives the room back
  await bar.getByRole('button', { name: 'Close the player' }).click();
  await expect(bar).toHaveCount(0);
  expect(await bottomBars()).toBe('0px');
});
