import { expect, type Page, test as base } from '@playwright/test';

/** Every test starts from the untouched sample studio on the server (one reset per test), watches the console for
 *  errors, and fails on any network request that is not the studio itself (fonts excepted). The database is shared,
 *  so the suite runs with one worker (see playwright.config.ts). */

export const BASE = process.env.STUDIO_URL || 'http://localhost:4200';

export async function resetStudio(kind: 'sample' | 'empty' = 'sample') {
  const r = await fetch(`${BASE}/api/studio/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, keepSettings: false }) });
  if (!r.ok) throw new Error(`reset failed: ${r.status}`);
}

/** The authoritative state, straight from the server. */
export async function snapshot<T = Record<string, unknown>>(): Promise<T> {
  const r = await fetch(`${BASE}/api/studio`);
  return (await r.json()).state as T;
}

export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    const foreign: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    // a failed resource load is reported with its URL, so a console error names the request behind it
    page.on('requestfailed', (r) => { const f = r.failure()?.errorText ?? ''; if (f && f !== 'net::ERR_ABORTED') errors.push(`request failed: ${r.url()} (${f})`); });
    page.on('request', (r) => { const u = new URL(r.url()); if (u.protocol === 'blob:' || u.protocol === 'data:') return; if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1' && !u.hostname.endsWith('gstatic.com') && !u.hostname.endsWith('googleapis.com')) foreign.push(r.url()); });
    await resetStudio('sample');
    await page.addInitScript(() => { try { localStorage.removeItem('vewbox.ui'); } catch { /* ignore */ } });
    await use(page);
    expect(errors, 'console errors').toEqual([]);
    expect(foreign, 'unexpected network calls').toEqual([]);
  },
});

export { expect };

export const EP1 = '/shows/last-sip/seasons/last-sip-s1/episodes/s1e1';

/** A workspace tab by its name; the name may carry a count ("Story 2"), and "Story" must not match "Storyboard". */
export const tab = (page: Page, name: string) => page.getByRole('tab', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( \\d+)?$`) });

/** Wait until the browser's pending commands have reached the server (the version catches up). */
export async function settled(page: Page) {
  await page.waitForTimeout(400);
  await expect.poll(async () => (await fetch(`${BASE}/api/health`)).ok, { timeout: 10_000 }).toBe(true);
}
