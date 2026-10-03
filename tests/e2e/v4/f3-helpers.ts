import type { Page } from '@playwright/test';
// the capture harness's page preparation: writes answered locally (a POST/PUT/PATCH/DELETE to /api/* never reaches the
// studio) — these specs must not change any record
import { prepare } from '../../../scripts/lib/capture.mjs';

export const KIT = '/kit';

/** Open the specimen route with every write refused locally, and wait for the specimens to be drawn. The
 *  dev server sometimes hands out the first snapshot late; like the capture harness, the page is opened again then. */
export async function openKit(page: Page, hash = '') {
  await (prepare as (p: Page, o?: object) => Promise<void>)(page, {});
  // the specimens need no live studio events: a quiet stand-in keeps the dev server's event streams free
  await page.addInitScript(() => {
    window.EventSource = class { readyState = 1; onerror = null; onmessage = null; onopen = null; url: string; constructor(u: string | URL) { this.url = String(u); } addEventListener() {} removeEventListener() {} close() { this.readyState = 2; } } as unknown as typeof EventSource;
  });
  for (let attempt = 1; ; attempt++) {
    await page.goto(`${KIT}${hash}`, { waitUntil: 'domcontentloaded' });
    try { await page.waitForSelector('#media .mhero', { timeout: 40_000 }); break; } catch (e) { if (attempt >= 3) throw e; }
  }
}
