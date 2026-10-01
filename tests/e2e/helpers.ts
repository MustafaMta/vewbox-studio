import { expect, type Page, test as base } from '@playwright/test';

/** Every test starts from the untouched sample data, watches the console for errors, and fails on any network
 *  request that is not the app itself (there is no API; nothing should be called). */
export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    const foreign: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', (r) => { const u = new URL(r.url()); if (u.protocol === 'blob:' || u.protocol === 'data:') return; if (u.hostname !== 'localhost' && !u.hostname.endsWith('gstatic.com') && !u.hostname.endsWith('googleapis.com')) foreign.push(r.url()); });
    // start from the untouched sample data once per test; later navigations in the same test keep what was saved
    await page.addInitScript(() => { try { if (!sessionStorage.getItem('e2e-fresh')) { localStorage.removeItem('vewbox.studio.v1'); localStorage.removeItem('vewbox.ui'); sessionStorage.setItem('e2e-fresh', '1'); } } catch { /* ignore */ } });
    await use(page);
    expect(errors, 'console errors').toEqual([]);
    expect(foreign, 'unexpected network calls').toEqual([]);
  },
});

export { expect };

export const EP1 = '/shows/last-sip/seasons/last-sip-s1/episodes/s1e1';

/** A workspace tab by its name; the name may carry a count ("Story 2"), and "Story" must not match "Storyboard". */
export const tab = (page: Page, name: string) => page.getByRole('tab', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( \\d+)?$`) });
