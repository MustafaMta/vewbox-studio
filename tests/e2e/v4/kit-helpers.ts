import { expect, type Page } from '@playwright/test';

/** Opens the dev-only /kit specimen (docs/DESIGN-SYSTEM-V4.md §8.5 F2) WITHOUT writing anything: every non-GET
 *  request to /api is answered here and never reaches the studio. These specs never reset the studio and never call a
 *  write API — they only read /api/studio. */
export async function openKit(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => { try { localStorage.setItem('vewbox.ui', JSON.stringify({ motion: true })); } catch { /* fine */ } });
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      if (new URL(req.url()).pathname === '/api/commands') return route.fulfill({ json: { ok: true, version: 1, hash: 'kit-spec', results: [] } });
      return route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'kit spec: writes are not sent' } } });
    }
    if (new URL(req.url()).pathname === '/api/studio') {
      const res = await route.fetch();
      if (!res.ok()) return route.fulfill({ response: res });
      const body = await res.json();
      if (body?.state?.settings) body.state.settings.reducedMotion = true;
      return route.fulfill({ response: res, json: body });
    }
    return route.continue();
  });
  await page.goto('/kit');
  await expect(page.getByRole('heading', { level: 1, name: /Interface kit/ })).toBeVisible({ timeout: 60_000 });
}

/** The element that has focus, as "role:name" for readable assertions. */
export async function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return '';
    return `${el.getAttribute('role') ?? el.tagName.toLowerCase()}:${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim()}`;
  });
}
