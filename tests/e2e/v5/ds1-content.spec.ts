import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { prepare } from '../../../scripts/lib/capture.mjs';

/** CONTENT IN ANOTHER SCRIPT INSIDE THE ENGLISH INTERFACE (DS-1; the website is English-only and LTR since
 *  2026-10-03, the work is not). An Arabic character name from the studio (أبو سلام on /characters) and an Iraqi
 *  dialogue line set with the one content rule (`class="content-text" dir="auto"`, base.css) must render legibly:
 *  drawn by a real Arabic face from the system fallback chain (Chromium's own record of the platform fonts used,
 *  never a last-resort font), right to left, aligned to their own start edge, isolated from the LTR interface around
 *  them; the page itself stays lang="en" dir="ltr". Read-only. Crops: docs/evidence/v5-ds1/content-arabic-*.png. */

const OUT = path.join('docs', 'evidence', 'v5-ds1');
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

async function open(page: Page, url: string) {
  await (prepare as (p: Page, o: { lang?: string; motion?: string }) => Promise<void>)(page, { lang: 'en', motion: 'reduce' });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('main h1'), null, { timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
}

/** The platform fonts Chromium used to draw a node's text (CDP CSS.getPlatformFontsForNode). */
async function platformFonts(page: Page, selector: string): Promise<Array<{ familyName: string; glyphCount: number }>> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  // the text node under the element carries the fonts
  const { node } = await cdp.send('DOM.describeNode', { nodeId, depth: 1 });
  const text = node.children?.find((c) => c.nodeType === 3);
  const target = text ? (await cdp.send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [text.backendNodeId] })).nodeIds[0] : nodeId;
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId: target });
  await cdp.detach();
  return fonts as Array<{ familyName: string; glyphCount: number }>;
}

test('an Arabic character name and an Arabic dialogue line render legibly inside the English interface', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, '/characters');
  expect(await page.evaluate(() => [document.documentElement.lang, document.documentElement.dir])).toEqual(['en', 'ltr']);

  // 1. the studio's own Arabic name, as the page sets it
  const name = page.getByText('أبو سلام', { exact: true }).first();
  await expect(name).toBeVisible();
  await name.evaluate((el) => el.setAttribute('data-probe', 'name'));
  const nameFonts = await platformFonts(page, '[data-probe="name"]');
  expect(nameFonts.length, JSON.stringify(nameFonts)).toBeGreaterThan(0);
  expect(nameFonts.some((f) => /segoe ui|tahoma|arial|geeza|sf arabic|noto (sans|naskh|kufi) arabic|times new roman|dejavu|droid/i.test(f.familyName) && f.glyphCount > 0), JSON.stringify(nameFonts)).toBe(true);
  expect(nameFonts.some((f) => /last ?resort/i.test(f.familyName))).toBe(false);
  fs.mkdirSync(OUT, { recursive: true });
  await name.locator('xpath=ancestor::li[1]').screenshot({ path: path.join(OUT, 'content-arabic-name-1440.png') }).catch(() => name.screenshot({ path: path.join(OUT, 'content-arabic-name-1440.png') }));

  // 2. a line of Iraqi dialogue set with the content rule, between two English sentences of the interface
  await page.evaluate(() => {
    const box = document.createElement('div');
    box.setAttribute('data-probe', 'box');
    box.style.cssText = 'inline-size: 640px; padding: 16px; background: var(--surface)';
    box.innerHTML = '<p class="small">Line 4 · Najm</p><p class="content-text t-quote" dir="auto" data-probe="line">شنو صار بالراديو؟ ما أعرف شلون اشتغل وحده، يا إلياس.</p><p class="small">Recorded 3 Oct, 09:29 · 0:04</p>';
    document.querySelector('main h1')!.after(box);
  });
  const line = page.locator('[data-probe="line"]');
  const geo = await line.evaluate((el) => {
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    const range = document.createRange(); range.selectNodeContents(el); const t = range.getBoundingClientRect();
    return { direction: cs.direction, bidi: cs.unicodeBidi, align: cs.textAlign, right: r.right, textRight: t.right, left: r.left, textLeft: t.left };
  });
  expect(geo.direction).toBe('rtl');           // its own direction, from its first strong letter
  expect(geo.bidi).toBe('isolate');            // isolated from the interface around it
  expect(Math.abs(geo.right - geo.textRight)).toBeLessThanOrEqual(2); // aligned to its own start edge (the right)
  expect(geo.textLeft - geo.left).toBeGreaterThan(20);                  // ragged on the other side
  const lineFonts = await platformFonts(page, '[data-probe="line"]');
  expect(lineFonts.some((f) => !/last ?resort/i.test(f.familyName) && f.glyphCount > 10), JSON.stringify(lineFonts)).toBe(true);
  // the interface lines around it stay left to right
  expect(await page.locator('[data-probe="box"] .small').first().evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
  await page.locator('[data-probe="box"]').screenshot({ path: path.join(OUT, 'content-arabic-line-1440.png') });
  fs.writeFileSync(path.join(OUT, 'content-arabic.json'), `${JSON.stringify({ name: nameFonts, line: lineFonts, lineGeometry: geo }, null, 2)}\n`);
});
