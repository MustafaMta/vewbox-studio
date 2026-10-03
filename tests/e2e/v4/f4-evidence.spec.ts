import { expect, test, type Page } from '@playwright/test';
import { open, palette, sheet } from './f4-helpers';

/** F4's screenshot evidence for the states a page capture cannot reach (docs/DESIGN-SYSTEM-V4.md §8.5 F4): the
 *  sidebar at 1440, the rail at 834, the phone bar and its open menu at 390, the palette open, the shortcut sheet
 *  and the ServerBar — on the sample and the empty fixture studio (the interface is English-only). Written to
 *  docs/evidence/v4-f4-<state>-<fixture>-<width>.png. Nothing is written to the studio.
 *
 *    $env:F4_EVIDENCE='1'; $env:STUDIO_URL='http://localhost:4223'; pnpm exec playwright test tests/e2e/v4/f4-evidence --project=desktop */

test.skip(process.env.F4_EVIDENCE !== '1', 'evidence captures run on request (F4_EVIDENCE=1)');
test.describe.configure({ timeout: 180_000 });

const SIZES = { 1440: { width: 1440, height: 900 }, 834: { width: 834, height: 1112 }, 390: { width: 390, height: 844 } } as const;
const file = (state: string, kind: string, width: number) => `docs/evidence/v4-f4-${state}-${kind}-${width}.png`;
const settle = async (page: Page) => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400); };

for (const kind of ['sample', 'empty'] as const) {
  {
    test(`shell ${kind}: sidebar, rail, phone bar and menu, palette`, async ({ browser }) => {
      for (const width of [1440, 834, 390] as const) {
        const phone = width === 390;
        const context = await browser.newContext({ viewport: SIZES[width], colorScheme: 'dark', ...(width < 1440 ? { isMobile: true, hasTouch: true } : {}) });
        const page = await context.newPage();
        await open(page, '/shows', { kind });
        await settle(page);
        await page.screenshot({ path: file(phone ? 'bar' : width === 834 ? 'rail' : 'sidebar', kind, width) });
        if (phone) {
          await page.locator('header.mobile-bar button[aria-controls="mobile-menu"]').click();
          await expect(page.locator('dialog#mobile-menu')).toBeVisible();
          await settle(page);
          await page.screenshot({ path: file('menu', kind, width) });
          await page.keyboard.press('Escape');
        }
        if (width === 1440 || width === 390) {
          await page.keyboard.press('Control+k');
          await expect(palette(page)).toBeVisible();
          await settle(page);
          await page.screenshot({ path: file('palette', kind, width) });
          await page.keyboard.press('Escape');
        }
        await context.close();
      }
    });
  }
}

{
  test('shell states: palette with a query and decisions, shortcut sheet, ServerBar, rail tooltip', async ({ browser }) => {
    const context = await browser.newContext({ viewport: SIZES[1440], colorScheme: 'dark' });
    const page = await context.newPage();
    await open(page, '/production', { kind: 'states', before: (p) => p.addInitScript(() => {
      // the stream drops on request (window.__drop) and stays down
      const w = window as unknown as { __es: Array<{ onerror: (() => void) | null }>; __down: boolean; __drop: () => void; EventSource: unknown };
      w.__es = []; w.__down = false;
      w.EventSource = class { onerror: (() => void) | null = null; l: Record<string, Array<(e: MessageEvent) => void>> = {}; readyState = 0;
        constructor() { w.__es.push(this); setTimeout(() => { if (!w.__down) { this.readyState = 1; for (const f of this.l.hello ?? []) f(new MessageEvent('hello', { data: '{}' })); } }, 30); }
        addEventListener(t: string, f: (e: MessageEvent) => void) { (this.l[t] ??= []).push(f); } removeEventListener() {} close() { this.readyState = 2; } };
      w.__drop = () => { w.__down = true; w.__es[w.__es.length - 1]?.onerror?.(); };
    }) });
    await settle(page);
    await page.keyboard.press('Control+k');
    await expect(palette(page)).toBeVisible();
    await settle(page);
    await page.screenshot({ path: file('palette-decide', 'states', 1440) });
    await palette(page).getByRole('combobox').fill('new');
    await settle(page);
    await page.screenshot({ path: file('palette-query', 'states', 1440) });
    await page.keyboard.press('Escape');
    await page.locator('main h1').first().click();
    await page.keyboard.press('Shift+Slash');
    await expect(sheet(page)).toBeVisible();
    await settle(page);
    await page.screenshot({ path: file('shortcuts', 'states', 1440) });
    await page.keyboard.press('Escape');
    await page.evaluate(() => (window as unknown as { __drop: () => void }).__drop());
    await expect(page.locator('.server-bar')).toBeVisible({ timeout: 8000 });
    await settle(page);
    await page.screenshot({ path: file('serverbar', 'states', 1440) });
    await context.close();

    const tablet = await browser.newContext({ viewport: SIZES[834], colorScheme: 'dark', isMobile: true, hasTouch: true });
    const t = await tablet.newPage();
    await open(t, '/production', { kind: 'states' });
    await t.locator('.shell > nav button[aria-keyshortcuts="Shift+?"]').focus();
    await expect(t.locator('.rail-tip')).toBeVisible();
    await settle(t);
    await t.screenshot({ path: file('rail-tooltip', 'states', 834) });
    await tablet.close();
  });
}
