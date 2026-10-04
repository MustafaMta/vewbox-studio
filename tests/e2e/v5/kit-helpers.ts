import { expect, type Page } from '@playwright/test';
import { prepare } from '../../../scripts/lib/capture.mjs';

/** Opens the development-only /kit specimen WITHOUT writing anything: the capture harness answers every write in the
 *  browser (scripts/lib/capture.mjs `prepare`) and sets reduced motion; the event stream is replaced in the page (the
 *  specimens need no live studio events). The kit specs never reset the studio. */
export async function openKit(page: Page, hash = '') {
  await page.setViewportSize({ width: 1440, height: 900 });
  await (prepare as (p: Page, o: { motion?: string }) => Promise<void>)(page, { motion: 'reduce' });
  await page.addInitScript(() => {
    window.EventSource = class { readyState = 1; onerror = null; onmessage = null; onopen = null; url: string; constructor(u: string | URL) { this.url = String(u); } addEventListener() {} removeEventListener() {} close() { this.readyState = 2; } } as unknown as typeof EventSource;
  });
  await page.goto(`/kit${hash}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Interface kit' })).toBeVisible({ timeout: 90_000 });
}

/** The element that has focus, as "role:name" for readable assertions. */
export async function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return '';
    return `${el.getAttribute('role') ?? el.tagName.toLowerCase()}:${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim()}`;
  });
}
