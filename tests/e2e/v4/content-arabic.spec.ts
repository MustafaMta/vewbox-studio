import { expect, test, type Page } from '@playwright/test';
import { loadFixture, prepare } from '../../../scripts/lib/capture.mjs';

/** ARABIC FILM CONTENT INSIDE THE ENGLISH INTERFACE (docs/DESIGN-SYSTEM-V5.md §9): the website is English-only and left
 *  to right, but a character's Arabic name and an Arabic dialogue line are production content — they render intact
 *  (byte for byte), in their own direction, isolated from the English around them, and nothing in the chrome mirrors.
 *  Read-only: the fixture studio answers the page's GETs and every write is refused in the browser
 *  (scripts/lib/capture.mjs). Run: $env:STUDIO_URL='http://localhost:4242'; pnpm exec playwright test tests/e2e/v4/content-arabic */

const NAME = 'أبو سلام';
const LINE = 'تكدر تنام ببيتك مثل الناس.';

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
  const r = await h1.evaluate((el) => {
    const isolate = (x: Element) => /isolate|plaintext/.test(getComputedStyle(x).unicodeBidi);
    let isolated = Array.from(el.querySelectorAll('*')).some(isolate);
    for (let x: Element | null = el; x && x !== document.body && !isolated; x = x.parentElement) isolated = isolate(x);
    return { text: el.textContent?.trim(), direction: getComputedStyle(el).direction, isolated };
  });
  expect(r.text).toBe(NAME);
  expect(r.direction, 'the Arabic name reads right to left').toBe('rtl');
  expect(r.isolated, 'the name is a bidi isolate, so the English around it keeps its order').toBe(true);
  // the title: the English interface parts, the name as written
  await expect(page).toHaveTitle(`${NAME} · Characters · Vewbox Studio`);
  // the English chrome around it is still English and LTR
  await expect(page.locator('nav').first().getByRole('link', { name: 'Characters' }).first()).toBeVisible();
});

test('an Arabic dialogue line renders intact and right to left inside the English script view', async ({ page }) => {
  await openOn(page, '/shows/last-sip/seasons/last-sip-s1/episodes/s1e1?tab=story');
  await interfaceIsEnglish(page);
  const arabicLines = page.getByRole('textbox', { name: /\(Arabic\)$/ });
  await expect(arabicLines.first()).toBeVisible();
  const values = await arabicLines.evaluateAll((xs) => xs.map((x) => (x as HTMLInputElement).value));
  const i = values.indexOf(LINE);
  expect(i, `the line is shown as written (found: ${JSON.stringify(values)})`).toBeGreaterThanOrEqual(0);
  const field = arabicLines.nth(i);
  await expect(field).toHaveValue(LINE);
  expect(await field.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
  // its label is English: the interface names the content's language, in English
  expect(await field.getAttribute('aria-label')).toMatch(/\(Arabic\)$/);
  await field.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'docs/evidence/en1/content-arabic-dialogue-line.png' });
});
