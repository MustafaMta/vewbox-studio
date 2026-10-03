import { expect, test } from '@playwright/test';
import { openKit } from './f3-helpers';

/** DESIGN-SYSTEM-V4 §4.8, §5.12, §8.5 F3: the hero preview never starts under reduced motion; without it, it starts
 *  muted after 2 s and offers Pause and Watch with sound from the moment it starts. Read-only. */

test.describe('under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the PreviewPlayer never starts', async ({ page }) => {
    await openKit(page, 'en', '#players');
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

test.describe('with motion allowed', () => {
  test.use({ reducedMotion: 'no-preference' });
  test('it starts muted after 2 s, with Pause and Watch with sound visible', async ({ page }) => {
    await openKit(page, 'en', '#players');
    const p = page.locator('#players .preview').first();
    await p.scrollIntoViewIfNeeded();
    await expect(p).toHaveAttribute('data-state', 'still');
    await expect(p).not.toHaveAttribute('data-state', 'still', { timeout: 8000 });
    expect(await p.locator('video').evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
    await expect(p.getByRole('button', { name: 'Pause preview' })).toBeVisible();
    await expect(p.getByRole('button', { name: 'Watch with sound' })).toBeVisible();
  });
});
