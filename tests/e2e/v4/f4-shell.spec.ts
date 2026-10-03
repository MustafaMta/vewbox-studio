import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { nav, open, palette, sheet, waitForPage, writes } from './f4-helpers';

/** F4 · the shell and navigation (docs/DESIGN-SYSTEM-V4.md §5.1, §7, §8.5 F4), on the fixture studio. Nothing here
 *  writes to the studio: the SaveState test intercepts the command route in the browser and answers it there.
 *
 *    $env:STUDIO_URL='http://localhost:4223'; pnpm exec playwright test tests/e2e/v4/f4- --project=desktop
 *    … --project=mobile   (the @mobile tests) */

const seriousOrCritical = async (page: import('@playwright/test').Page, include?: string) => {
  const b = new AxeBuilder({ page }); if (include) b.include(include);
  const r = await b.analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
};

test.describe('the sidebar at 1440', () => {
  test('the groups in order, the Screening Room among them, the current item marked', async ({ page }) => {
    const sent = writes(page);
    await open(page, '/characters');
    const links = nav(page).locator('a.shell-link');
    await expect(links).toHaveText(['Shows', 'Shorts', 'Music Videos', 'Characters', 'Locations', 'Files', 'Studio Company', 'Production', 'Screening Room', 'Settings']);
    await expect(nav(page).locator('.shell-group-label')).toHaveText(['Productions', 'Cast & world', 'Studio']);
    await expect(nav(page).getByRole('link', { name: 'Screening Room' })).toHaveAttribute('href', '/screening');
    await expect(nav(page).locator('[aria-current="page"]')).toHaveText('Characters');
    expect((await nav(page).boundingBox())?.width).toBe(240);
    await expect(nav(page).getByRole('button', { name: 'Help & shortcuts' })).toBeVisible();
    await expect(page.locator('.shell [role="status"][data-save]')).toHaveText('Saved');
    await expect(nav(page).locator('[data-stream]')).toHaveText('Connected');
    expect(sent).toEqual([]);
  });

  test('the skip link is the first focusable element and leads to the content', async ({ page }) => {
    await open(page, '/shows');
    await page.keyboard.press('Tab');
    const skip = page.locator('a.skip-link');
    await expect(skip).toBeFocused();
    await expect(skip).toHaveText('Skip to content');
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
    await page.keyboard.press('Tab');
    // the next stop is inside the page, not the navigation
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('main')))).toBe(true);
  });

  test('the brand glyph is monochrome ivory; the violet mark is only the favicon', async ({ page }) => {
    await open(page, '/shows');
    const tile = nav(page).locator('.brand-tile');
    const look = await tile.evaluate((el) => { const s = getComputedStyle(el); const svg = el.querySelector('svg')!; return { color: s.color, bg: s.backgroundColor, stroke: svg.getAttribute('stroke'), gradients: el.querySelectorAll('linearGradient, radialGradient').length, fills: [...svg.querySelectorAll('[fill]')].map((n) => n.getAttribute('fill')) }; });
    expect(look).toEqual({ color: 'rgb(243, 238, 230)', bg: 'rgb(34, 32, 30)', stroke: 'currentColor', gradients: 0, fills: [] });
    expect(await page.locator('main').evaluate(() => document.querySelectorAll('body linearGradient[id], body radialGradient').length)).toBe(0);
    const icon = await page.locator('link[rel="icon"]').getAttribute('href');
    expect(icon).toMatch(/^data:image\/svg\+xml,/);
    expect(decodeURIComponent(icon!)).toContain('#6A57EE');
  });

  test('Ctrl+\\ folds the sidebar to the rail and back, and the choice is kept for the next page', async ({ page }) => {
    await open(page, '/shows');
    await page.keyboard.press('Control+Backslash');
    await expect(page.locator('.shell')).toHaveAttribute('data-nav', 'rail');
    await expect.poll(async () => (await nav(page).boundingBox())?.width).toBe(80);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vewbox.ui') || '{}').nav)).toEqual({ lobby: 'rail' });
    await expect(nav(page).getByRole('button', { name: 'Expand the navigation' })).toBeVisible();
    await page.keyboard.press('Control+Backslash');
    await expect(page.locator('.shell')).toHaveAttribute('data-nav', 'sidebar');
    await nav(page).getByRole('button', { name: 'Collapse the navigation' }).click();
    await expect(page.locator('.shell')).toHaveAttribute('data-nav', 'rail');
  });

  test('a collapsed rail is drawn from the first paint (the boot), not after', async ({ page }) => {
    await open(page, '/shows', { prefs: { nav: { lobby: 'rail' } } });
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-nav-boot'))).toBe('rail');
    await expect.poll(async () => (await nav(page).boundingBox())?.width).toBe(80);
    // before the shell mounts it has no data-nav: the boot's attribute alone must draw the rail
    await page.evaluate(() => document.querySelector('.shell')!.removeAttribute('data-nav'));
    expect((await nav(page).boundingBox())?.width).toBe(80);
  });

  test('axe: no serious or critical issue in the shell', async ({ page }) => {
    await open(page, '/shows');
    expect(await seriousOrCritical(page)).toEqual([]);
  });
});

test.describe('the rail at 834', () => {
  test.use({ viewport: { width: 834, height: 1112 } });
  test('icon over label, the labels kept, tooltips on focus for the footer', async ({ page }) => {
    await open(page, '/shows');
    await expect.poll(async () => (await nav(page).boundingBox())?.width).toBe(80);
    await expect(nav(page).locator('a.shell-link .shell-label').first()).toBeVisible();
    // labels break between words only: no label wider than its line
    const clipped = await nav(page).locator('a.shell-link .shell-label').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
    expect(clipped).toEqual([]);
    await nav(page).getByRole('button', { name: 'Help & shortcuts' }).focus();
    await expect(page.locator('.rail-tip')).toHaveText('Help & shortcuts');
    await page.keyboard.press('Escape');
    await expect(page.locator('.rail-tip')).toHaveCount(0);
    await nav(page).locator('[role="status"][data-save]').focus();
    await expect(page.locator('.rail-tip')).toHaveText('Saved');
    // the sticky rows sit under nothing at this width: the old top bar is gone
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sticky-top').trim())).toBe('0px');
    expect(await seriousOrCritical(page)).toEqual([]);
  });
});

test.describe('the command palette (Ctrl/⌘K)', () => {
  test('opens at 15vh with the field focused, finds a page by name, and goes there', async ({ page }) => {
    const sent = writes(page);
    await open(page, '/shows');
    await page.keyboard.press('Control+k');
    await expect(palette(page)).toBeVisible();
    const input = palette(page).getByRole('combobox', { name: 'Search the studio' });
    await expect(input).toBeFocused();
    const box = await palette(page).locator('.shell-dialog-panel').boundingBox();
    expect(box?.width).toBe(640);
    expect(Math.round(box!.y)).toBe(Math.round(900 * 0.15));
    await input.fill('screening');
    await expect(palette(page).getByRole('option', { selected: true })).toHaveText(/Page\s*·\s*Screening Room/);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/screening$/);
    await expect(palette(page)).toBeHidden();
    expect(sent).toEqual([]);
  });

  test('groups Go to · Create · Decide · Settings, kind first; matches a show’s Arabic title (content) too', async ({ page }) => {
    await open(page, '/shows', { kind: 'states' });
    await page.keyboard.press('Control+k');
    const input = palette(page).getByRole('combobox');
    await input.fill('paper');
    await expect(palette(page).locator('.palette-group-label')).toHaveText(['Go to', 'Decide']);
    await expect(palette(page).getByRole('option', { name: /^Short\s*Paper Boats$/ })).toHaveCount(1);
    await expect(palette(page).getByRole('option', { name: /^Approve\s*Story of Paper Boats$/ })).toHaveCount(1);
    await input.fill('رشفة');
    await expect(palette(page).getByRole('option').first()).toHaveText(/Show\s*·\s*The Last Sip/);
    await input.fill('new show');
    await expect(palette(page).getByRole('option')).toHaveText([/New show\s*·\s*Let the studio propose/, /New show\s*·\s*Write it yourself/]);
    await input.fill('contrast');
    await expect(palette(page).locator('.palette-group-label')).toHaveText(['Settings']);
  });

  test('Decide opens the card; it never approves', async ({ page }) => {
    const sent = writes(page);
    await open(page, '/shows', { kind: 'states' });
    await expect(nav(page).getByRole('link', { name: /^Production, 1 decision waiting for you$/ })).toBeVisible();
    await page.keyboard.press('Control+k');
    await expect(palette(page).locator('.palette-group-label').first()).toHaveText('Decide');
    const option = palette(page).getByRole('option', { name: /Approve.*Story of Paper Boats/ });
    await expect(option).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/production#needs-you$/);
    await waitForPage(page);
    expect(sent).toEqual([]);
  });

  test('↑/↓ move, Esc closes and gives focus back; recent items when empty', async ({ page }) => {
    await open(page, '/shows');
    const help = nav(page).getByRole('button', { name: 'Help & shortcuts' });
    await page.keyboard.press('Control+k');
    const options = palette(page).getByRole('option');
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(options.last()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Escape');
    await expect(palette(page)).toBeHidden();
    // opened from a control, closed with Esc: focus returns there
    await help.focus();
    await page.keyboard.press('Control+k');
    await expect(palette(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(help).toBeFocused();
    // something opened from the palette comes back as a recent item
    await page.keyboard.press('Control+k');
    await palette(page).getByRole('combobox').fill('locations');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/locations$/);
    await page.keyboard.press('Control+k');
    await expect(palette(page).locator('.palette-group-label').first()).toHaveText('Recent');
    await expect(palette(page).getByRole('option').first()).toHaveText(/Page\s*·\s*Locations/);
  });

  test('axe: the open palette has no serious or critical issue', async ({ page }) => {
    await open(page, '/shows', { kind: 'states' });
    await page.keyboard.press('Control+k');
    await expect(palette(page)).toBeVisible();
    expect(await seriousOrCritical(page, 'dialog.palette-dialog')).toEqual([]);
  });
});

test.describe('the global shortcuts (§7.5)', () => {
  test('? opens the shortcut sheet by scope; never while typing in a field', async ({ page }) => {
    await open(page, '/characters');
    await page.keyboard.press('Shift+Slash');
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page).getByRole('heading', { name: 'Keyboard shortcuts' })).toBeVisible();
    await expect(sheet(page).locator('.keys-scope')).toHaveText(['Global', 'Player', 'Storyboard', 'Timeline']);
    expect(await seriousOrCritical(page, 'dialog.keys-dialog')).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toBeHidden();
    // in a text field the keys type
    const field = page.locator('main input[type="search"], main input[type="text"]').first();
    await field.focus();
    await page.keyboard.press('Shift+Slash');
    await page.keyboard.press('Control+k');
    await expect(field).toHaveValue('?');
    await expect(sheet(page)).toBeHidden();
    await expect(palette(page)).toBeHidden();
  });

  test('single-key shortcuts can be turned off; Ctrl/⌘K still works', async ({ page }) => {
    await open(page, '/shows');
    await page.keyboard.press('Shift+Slash');
    const toggle = sheet(page).getByRole('switch', { name: /Single-key shortcuts/ });
    await expect(toggle).toBeChecked();
    await sheet(page).getByText('Single-key shortcuts', { exact: true }).click();
    await expect(toggle).not.toBeChecked();
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).toHaveAttribute('data-keys', 'off');
    await page.locator('main h1').click();
    await page.keyboard.press('Shift+Slash');
    await expect(sheet(page)).toBeHidden();
    await page.keyboard.press('Control+k');
    await expect(palette(page)).toBeVisible();
    // and back on from the palette
    await palette(page).getByRole('combobox').fill('single-key');
    await expect(palette(page).getByRole('option').first()).toHaveText(/Single-key shortcuts: On/);
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).not.toHaveAttribute('data-keys', 'off');
  });

  test('Help & shortcuts opens the same sheet from the navigation', async ({ page }) => {
    await open(page, '/shows');
    await nav(page).getByRole('button', { name: 'Help & shortcuts' }).click();
    await expect(sheet(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(nav(page).getByRole('button', { name: 'Help & shortcuts' })).toBeFocused();
  });
});

test.describe('routes and redirects (§7.2)', () => {
  for (const [from, to] of [['/', /\/shows$/], ['/library', /\/characters$/], ['/library?tab=locations', /\/locations$/], ['/projects', /\/shows$/], ['/projects?tab=shorts', /\/shorts$/], ['/jobs', /\/production#activity$/]] as const) {
    test(`${from} lands on its target`, async ({ page }) => {
      await open(page, from);
      await expect(page).toHaveURL(to);
      await waitForPage(page);
    });
  }
  test('the Production page still carries the activity list (#activity)', async ({ page }) => {
    await open(page, '/jobs', { kind: 'states' });
    await expect(page).toHaveURL(/\/production#activity$/);
    await expect(page.locator('section#activity h1')).toBeVisible();
  });
});

test.describe('SaveState reads the store (AUDIT D1)', () => {
  test('"Saving…" while a command is in flight, "Saved" once it lands, "Not saved — retrying" when a send fails', async ({ page }) => {
    await open(page, '/shows');
    const state = page.locator('.shell [role="status"][data-save]');
    await expect(state).toHaveText('Saved');
    // the command route is held in the browser and answered there: nothing reaches the studio
    let release: () => void = () => {};
    const held = new Promise<void>((r) => { release = r; });
    let mode: 'hold' | 'fail' | 'pass' = 'hold';
    const seen: string[] = [];
    await page.route('**/api/commands', async (route) => {
      seen.push(mode);
      if (mode === 'hold') { await held; return route.fulfill({ json: { ok: true, version: 2, hash: 'held', results: [] } }); }
      if (mode === 'fail') return route.abort('failed');
      return route.fulfill({ json: { ok: true, version: 3, hash: 'passed', results: [] } });
    });
    await page.keyboard.press('Control+k');
    await palette(page).getByRole('combobox').fill('reduce motion');
    await page.keyboard.press('Enter');
    await expect(state).toHaveText('Saving…');
    await expect(state).toHaveAttribute('data-save', 'saving');
    await page.waitForTimeout(600);
    await expect(state).toHaveText('Saving…'); // still in flight
    release();
    await expect(state).toHaveText('Saved');
    // a send that fails: the change is kept and retried
    mode = 'fail';
    await page.keyboard.press('Control+k');
    await palette(page).getByRole('combobox').fill('reduce motion');
    await page.keyboard.press('Enter');
    await expect(state).toHaveText('Not saved — retrying');
    await expect(state).toHaveAttribute('data-tone', 'warn');
    mode = 'pass';
    await expect(state).toHaveText('Saved', { timeout: 15_000 });
    expect(seen).toEqual(expect.arrayContaining(['hold', 'fail', 'pass']));
  });
});

test.describe('the ServerBar (§5.1)', () => {
  test('only once the event stream has really dropped; dims the page, says how old the data is; Try now reconnects', async ({ page }) => {
    // a stream the test controls: it can drop, and it says hello again only when allowed (installed after the
    // harness's own stand-in, so it replaces it)
    const controlledStream = (p: import('@playwright/test').Page) => p.addInitScript(() => {
      const w = window as unknown as { __es: Array<{ fire: (t: string) => void; onerror: (() => void) | null }>; __hello: boolean; __drop: () => void; EventSource: unknown };
      w.__es = []; w.__hello = true;
      class TestEvents {
        url: string; readyState = 0; onerror: (() => void) | null = null; l: Record<string, Array<(e: MessageEvent) => void>> = {};
        constructor(url: string) { this.url = String(url); w.__es.push(this); setTimeout(() => { if (w.__hello) { this.readyState = 1; this.fire('hello'); } }, 30); }
        addEventListener(t: string, f: (e: MessageEvent) => void) { (this.l[t] ??= []).push(f); }
        removeEventListener() {}
        fire(t: string) { for (const f of this.l[t] ?? []) f(new MessageEvent(t, { data: JSON.stringify({ type: t, version: 1 }) })); }
        close() { this.readyState = 2; }
      }
      w.EventSource = TestEvents;
      w.__drop = () => { w.__hello = false; const last = w.__es[w.__es.length - 1]; last.onerror?.(); };
    });
    await open(page, '/shows', { before: controlledStream });
    const bar = page.locator('.server-bar');
    await expect(nav(page).locator('[data-stream]')).toHaveText('Connected');
    await page.evaluate(() => (window as unknown as { __drop: () => void }).__drop());
    await expect(nav(page).locator('[data-stream]')).toHaveText('Not connected');
    // a quick reconnect is not a drop worth a bar
    await page.waitForTimeout(1500);
    await expect(bar).toHaveCount(0);
    await expect(bar).toBeVisible({ timeout: 5000 });
    await expect(bar).toContainText('Can’t reach the studio server.');
    await expect(bar).toContainText('Showing what was there a moment ago.');
    expect(Math.round((await bar.boundingBox())!.height)).toBe(40);
    expect(await page.locator('main').evaluate((m) => getComputedStyle(m).opacity)).toBe('0.7');
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--sticky-extra'))).toBe('40px');
    await page.evaluate(() => { (window as unknown as { __hello: boolean }).__hello = true; });
    await bar.getByRole('button', { name: 'Try now' }).click();
    await expect(bar).toHaveCount(0);
    await expect(nav(page).locator('[data-stream]')).toHaveText('Connected');
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--sticky-extra'))).toBe('');
  });
});

test.describe('the room (§2.3)', () => {
  test('a page that names no room is a lobby; the column carries it', async ({ page }) => {
    await open(page, '/shows');
    await expect(page.locator('.shell-column')).toHaveAttribute('data-room', 'lobby');
    await expect(page.locator('.shell-column > main#main')).toHaveCount(1);
    expect(await page.locator('.shell-column').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(13, 12, 11)');
  });
});

test.describe('the phone (< 768)', () => {
  test('@mobile the bar names the area; the menu is a full-height sheet with the same order', async ({ page }) => {
    await open(page, '/characters');
    const bar = page.locator('header.mobile-bar');
    await expect(bar).toBeVisible();
    await expect(bar.locator('.mobile-area')).toHaveText('Characters');
    expect(Math.round((await bar.boundingBox())!.height)).toBe(56);
    await expect(nav(page)).toBeHidden();
    // the bar is the page's banner landmark: its brand link, New… and the menu are inside a landmark
    await expect(page.getByRole('banner')).toHaveCount(1);
    await expect(page.getByRole('banner').getByRole('link', { name: 'Vewbox Studio, go to Shows' })).toBeVisible();
    await expect(page.getByRole('banner').getByRole('link', { name: 'New…' })).toBeVisible();
    const region = (await new AxeBuilder({ page }).withRules(['region']).analyze()).violations.flatMap((v) => v.nodes.map((n) => n.target.join(' ')));
    expect(region.filter((t) => /mobile-bar|mobile-brand|mobile-action/.test(t))).toEqual([]);
    expect(await seriousOrCritical(page)).toEqual([]);
    const menu = bar.getByRole('button', { name: 'Open menu' });
    await menu.click();
    const sheetDialog = page.locator('dialog#mobile-menu');
    await expect(sheetDialog).toBeVisible();
    const vp = page.viewportSize()!;
    const box = (await sheetDialog.boundingBox())!;
    expect(Math.round(box.height)).toBe(vp.height);
    await expect(sheetDialog.locator('a.shell-link')).toHaveText(['Shows', 'Shorts', 'Music Videos', 'Characters', 'Locations', 'Files', 'Studio Company', 'Production', 'Screening Room', 'Settings']);
    await expect(sheetDialog.getByRole('button', { name: 'Help & shortcuts' })).toBeVisible();
    await expect(sheetDialog.locator('[role="status"][data-save]')).toHaveText('Saved');
    expect(await seriousOrCritical(page, 'dialog#mobile-menu')).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(sheetDialog).toBeHidden();
    await expect(menu).toBeFocused();
    await menu.click();
    await sheetDialog.getByRole('link', { name: 'Locations' }).click();
    await expect(page).toHaveURL(/\/locations$/);
    await expect(sheetDialog).toBeHidden();
    await expect(bar.locator('.mobile-area')).toHaveText('Locations');
  });
});
