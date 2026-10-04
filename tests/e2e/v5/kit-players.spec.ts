import { expect, test } from '@playwright/test';
import { openKit } from './kit-helpers';

/** THE PLAYERS ON THE /kit SPECIMEN (docs/DESIGN-SYSTEM-V4.md §4.8, §5.12, §8.5 F3, WCAG 2.4.11; kept under v5):
 *  the hero preview never starts under reduced motion and, with motion allowed, starts muted after 2 s with Pause and
 *  Watch with sound; the fixed PlayerBar sets --bottom-bars (76 px) and an element focused below its top edge scrolls
 *  clear of it. Read-only. Migrated from tests/e2e/v4/f3-preview.spec.ts and f3-playerbar.spec.ts. */

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

test.describe('the PreviewPlayer under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('never starts', async ({ page }) => {
    await openKit(page, '#players');
    const previews = page.locator('.preview');
    expect(await previews.count()).toBeGreaterThan(0);
    await page.waitForTimeout(4500); // more than twice the 2 s delay
    for (const p of await previews.all()) {
      await expect(p).toHaveAttribute('data-state', 'still');
      expect(await p.locator('video').count()).toBe(0);
    }
    expect(await page.locator('.preview-controls').count()).toBe(0);
  });
});

test.describe('the PreviewPlayer with motion allowed', () => {
  test.use({ reducedMotion: 'no-preference' });
  test('starts muted after 2 s, with Pause and Watch with sound visible', async ({ page }) => {
    // the harness sets reduced motion in the studio's settings and the page's preference; this test wants motion
    await page.addInitScript(() => { try { localStorage.removeItem('vewbox.ui'); } catch { /* fine */ } });
    await page.route('**/api/studio', async (route) => { const res = await route.fetch(); const body = await res.json(); if (body?.state?.settings) body.state.settings.reducedMotion = false; await route.fulfill({ response: res, json: body }); });
    await page.goto('/kit#players', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'Interface kit' })).toBeVisible({ timeout: 90_000 });
    const p = page.locator('#players .preview').first();
    await p.scrollIntoViewIfNeeded();
    await expect(p).toHaveAttribute('data-state', 'still');
    await expect(p).not.toHaveAttribute('data-state', 'still', { timeout: 8000 });
    expect(await p.locator('video').evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
    await expect(p.getByRole('button', { name: 'Pause preview' })).toBeVisible();
    await expect(p.getByRole('button', { name: 'Watch with sound' })).toBeVisible();
  });
});

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
