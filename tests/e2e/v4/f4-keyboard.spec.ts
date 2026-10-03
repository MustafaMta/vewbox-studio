import { expect, test, type Page } from '@playwright/test';
import { open, palette, sheet } from './f4-helpers';

/** F4 · the keyboard-only pass (docs/DESIGN-SYSTEM-V4.md §8.4 gate 4): every control of the
 *  shell is reached by Tab in navigation order, shows a visible focus ring, and works from the keyboard; the
 *  palette, the sheet and the menu trap focus and give it back on Esc. Also reflow at 320 px and 200 % zoom. */

const focused = (page: Page) => page.evaluate(() => {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return null;
  const s = getComputedStyle(el);
  return { name: el.getAttribute('aria-label') || el.textContent?.trim() || '', tag: el.tagName, ring: s.outlineStyle !== 'none' && s.outlineWidth !== '0px' };
});

const ORDER = ['Skip to content', 'Vewbox Studio, go to Shows', 'New…', 'Shows', 'Shorts', 'Music Videos', 'Characters', 'Locations', 'Files', 'Studio Company', 'Production', 'Screening Room', 'Settings', 'Help & shortcuts', 'Connected. Open the engine room in Production', 'Collapse the navigation'] as const;

{
  test('keyboard only: Tab walks the shell in order with a visible ring; palette, sheet and collapse by keys', async ({ page }) => {
    await open(page, '/characters');
    const seen: string[] = [];
    for (let i = 0; i < ORDER.length; i++) {
      await page.keyboard.press('Tab');
      const f = await focused(page);
      seen.push(f?.name ?? '');
      if (i > 0) expect(f?.ring, `focus ring on ${f?.name}`).toBe(true);
    }
    expect(seen.map((s) => s.replace(/\s+/g, ' '))).toEqual(ORDER);
    // the next Tab leaves the navigation for the page
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('main')))).toBe(true);

    // Collapse from the keyboard (Enter on the button), then expand with Ctrl+\
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    await expect(page.locator('.shell')).toHaveAttribute('data-nav', 'rail');
    await page.keyboard.press('Control+Backslash');
    await expect(page.locator('.shell')).toHaveAttribute('data-nav', 'sidebar');

    // the palette: open, type, move, open the result
    await page.keyboard.press('Control+k');
    await expect(palette(page)).toBeVisible();
    await expect(palette(page).getByRole('combobox')).toBeFocused();
    await page.keyboard.type('locations');
    await expect(palette(page).getByRole('option', { selected: true })).toContainText('Locations');
    await page.keyboard.press('Enter');
    // (a dev server compiles a route on its first visit)
    await expect(page).toHaveURL(/\/locations$/, { timeout: 45_000 });

    // the sheet: ? opens it, Tab reaches the single-key switch, Space flips it, Esc closes
    await page.locator('main h1').first().click();
    await page.keyboard.press('Shift+Slash');
    await expect(sheet(page)).toBeVisible();
    const sw = sheet(page).getByRole('switch');
    for (let i = 0; i < 3 && !(await sw.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(sw).toBeFocused();
    await page.keyboard.press('Space');
    await expect(sw).not.toBeChecked();
    await page.keyboard.press('Space');
    await expect(sw).toBeChecked();
    // focus never reaches the page behind (a native modal dialog lets Tab pass through the browser's own controls,
    // where the document has no focused element, and back)
    for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => { const a = document.activeElement; return !a || a === document.body || Boolean(a.closest('dialog[open]')); })).toBe(true); }
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toBeHidden();
  });
}

test('the rail by keyboard (834): every footer control names itself in a tooltip on focus', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1112 });
  await open(page, '/shows');
  const tips: string[] = [];
  for (let i = 0; i < 18; i++) {
    await page.keyboard.press('Tab');
    const tip = page.locator('.rail-tip');
    if (await tip.count()) tips.push((await tip.textContent()) ?? '');
  }
  expect(tips).toEqual(expect.arrayContaining(['Vewbox Studio', 'New…', 'Help & shortcuts', 'Saved', 'Connected']));
  expect(tips.some((t) => t.startsWith('Expand the navigation'))).toBe(true);
});

test('@mobile the phone menu by keyboard: opens from the bar, traps focus, Esc returns to the button', async ({ page }) => {
  await open(page, '/shows');
  const menu = page.locator('header.mobile-bar').getByRole('button', { name: 'Open menu' });
  await menu.focus();
  await page.keyboard.press('Enter');
  const dlg = page.locator('dialog#mobile-menu');
  await expect(dlg).toBeVisible();
  for (let i = 0; i < 20; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => { const a = document.activeElement; return !a || a === document.body || Boolean(a.closest('dialog#mobile-menu')); })).toBe(true); }
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
});

test('reflow at 320 px and 200 % zoom: no page-level horizontal scroll from the shell', async ({ page }) => {
  for (const vp of [{ width: 320, height: 640 }, { width: 720, height: 450 }]) { // 720×450 is 1440×900 at 200 %
    await page.setViewportSize(vp);
    await open(page, '/shows');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${vp.width}px`).toBeLessThanOrEqual(0);
    await expect(page.locator('header.mobile-bar')).toBeVisible();
    await page.locator('header.mobile-bar').getByRole('button', { name: 'Open menu' }).click();
    await expect(page.locator('dialog#mobile-menu a.shell-link').last()).toBeAttached();
    expect(await page.locator('dialog#mobile-menu').evaluate((d) => d.scrollWidth <= d.clientWidth + 1)).toBe(true);
    await page.keyboard.press('Escape');
  }
});
