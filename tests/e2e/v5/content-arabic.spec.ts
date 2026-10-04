import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { loadFixture, prepare } from '../../../scripts/lib/capture.mjs';

/** ARABIC FILM CONTENT INSIDE THE ENGLISH INTERFACE, on the fixture studio (docs/DESIGN-SYSTEM-V5.md §9): the website
 *  is English-only and left to right, but a character's Arabic name and an Arabic dialogue line are production
 *  content — they render intact (byte for byte), in their own direction, isolated from the English around them, and
 *  nothing in the chrome mirrors. Read-only: the fixture studio answers the page's GETs and every write is refused in
 *  the browser (scripts/lib/capture.mjs). The studio's own Arabic name on /characters is checked by ds1-content.spec.ts.
 *  Migrated from tests/e2e/v4/content-arabic.spec.ts. */

const NAME = 'أبو سلام';
const LINE = 'تكدر تنام ببيتك مثل الناس.';
// the crop goes to test-results by default; E2E_EVIDENCE_DIR=docs/evidence/en1 refreshes the committed evidence
const OUT = process.env.E2E_EVIDENCE_DIR ?? path.join('test-results', 'evidence', 'en1');

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

async function openOn(page: Page, path: string) {
  const fx = structuredClone(await loadFixture('states', 'reduce'));
  // an Iraqi character whose own name is Arabic (as the studio's أبو سلام is)
  const base = fx.state.characters.find((c: { id: string }) => c.id === 'abu-samir');
  fx.state.characters.push({ ...base, id: 'abu-salam', name: NAME, nameAr: undefined, language: 'AR', dialect: 'IRAQI_BAGHDADI', usage: { known: true, videos: [] }, canonicalImage: undefined });
  await prepare(page, { fixture: fx, motion: 'reduce' });
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main h1').first()).toBeVisible({ timeout: 90_000 });
}

const interfaceIsEnglish = async (page: Page) => {
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  expect(await page.evaluate(() => getComputedStyle(document.body).direction)).toBe('ltr');
  // the navigation never mirrors
  expect(await page.locator('nav').first().evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
};

test('an Arabic character name renders intact and isolated in the English profile and title', async ({ page }) => {
  await openOn(page, '/characters/abu-salam');
  await interfaceIsEnglish(page);
  const h1 = page.locator('main h1').first();
  await expect(h1).toHaveText(NAME);
  // the name sits in its own isolate (a <bdi> or an element with dir="auto") inside the English heading: that element
  // reads right to left, and the isolate keeps the English around it in order
  const r = await h1.evaluate((el) => {
    const isolate = (x: Element) => /isolate|plaintext/.test(getComputedStyle(x).unicodeBidi);
    const holders = [el, ...Array.from(el.querySelectorAll('*'))].filter((x) => x.textContent?.trim() === el.textContent?.trim());
    const rtl = holders.find((x) => getComputedStyle(x).direction === 'rtl') ?? null;
    let isolated = holders.some(isolate);
    for (let x: Element | null = el; x && x !== document.body && !isolated; x = x.parentElement) isolated = isolate(x);
    return { text: el.textContent?.trim(), rtl: rtl ? rtl.tagName.toLowerCase() : null, isolated };
  });
  expect(r.text).toBe(NAME);
  expect(r.rtl, 'the Arabic name reads right to left (the element that holds it)').not.toBeNull();
  expect(r.isolated, 'the name is a bidi isolate, so the English around it keeps its order').toBe(true);
  // the title: the English interface parts, the name as written
  await expect(page).toHaveTitle(`${NAME} · Characters · Vewbox Studio`);
  // the English chrome around it is still English and LTR
  await expect(page.locator('nav').first().getByRole('link', { name: 'Characters' }).first()).toBeVisible();
});

test('an Arabic dialogue line renders intact and right to left inside the English script view', async ({ page }) => {
  // the episode's workspace (P-Work): the Arabic line fields carry lang="ar" and their own direction
  await openOn(page, '/shows/last-sip/seasons/last-sip-s1/episodes/s1e1/production?tab=story');
  await interfaceIsEnglish(page);
  const arabicLines = page.locator('main input[lang="ar"], main textarea[lang="ar"]');
  await expect(arabicLines.first()).toBeVisible({ timeout: 30_000 });
  const values = await arabicLines.evaluateAll((xs) => xs.map((x) => (x as HTMLInputElement).value));
  const i = values.indexOf(LINE);
  expect(i, `the line is shown as written (found: ${JSON.stringify(values)})`).toBeGreaterThanOrEqual(0);
  const field = arabicLines.nth(i);
  await expect(field).toHaveValue(LINE);
  expect(await field.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
  // its label is English: the interface names the content's language, in English, and never mirrors
  const label = await field.evaluate((el) => (el.getAttribute('aria-label') ?? ((el as HTMLInputElement).labels?.[0]?.textContent ?? '')).trim());
  expect(label).toMatch(/Arabic|Iraqi/);
  expect(/[؀-ۿ]/.test(label), 'the label is in English').toBe(false);
  await field.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, 'content-arabic-dialogue-line.png') });
});
