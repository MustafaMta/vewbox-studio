// Renders the v5 prototypes with headless Chromium (Playwright) into docs/evidence/redesign-proto/.
//
//   node docs/design/prototypes/render.mjs                 every page × en/ar × 1440/1920/834/390
//   node docs/design/prototypes/render.mjs home shows      only these pages (--lang ar, --width 390 narrow it)
//   node docs/design/prototypes/render.mjs --file spike/type-spike.html --out x.png --width 1440
//
// Each prototype is one HTML file; `?lang=ar` switches it to Arabic (see v5.js). Widths below 1024 render with touch
// (coarse pointer), so touch-only affordances and the 44 px targets are shown as on a phone or tablet. The prototypes
// size by the frozen var(--vh) (v5.js), so a full-page capture keeps the device width (QA §7.1); the script checks
// both the page's scrollWidth and the PNG's width and exits non-zero on either failure.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../../evidence/redesign-proto');
export const PAGES = ['system', 'home', 'shows', 'show', 'short', 'music-video', 'characters', 'character', 'studio', 'production', 'shot', 'screening'];
const WIDTHS = [1440, 390, 834, 1920];
const LANGS = ['en', 'ar'];

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const pngWidth = (buf) => buf.readUInt32BE(16);

const browser = await chromium.launch();
async function shoot(file, out, width, { lang = 'en', full = true, height } = {}) {
  const touch = width < 1024;
  const ctx = await browser.newContext({ viewport: { width, height: height ?? (width < 768 ? 844 : width < 1024 ? 1112 : width >= 1800 ? 1080 : 900) }, deviceScaleFactor: 1, hasTouch: touch, isMobile: false, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { process.exitCode = 1; console.log(`  page error (${path.basename(file)}): ${e.message}`); });
  const url = pathToFileURL(path.resolve(here, file)).href + (lang === 'ar' ? '?lang=ar' : '');
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  if (sw > width) {
    process.exitCode = 1;
    console.log(`  WARNING ${file} ${lang} ${width}: page is ${sw}px wide (horizontal overflow)`);
    const culprits = await page.evaluate((w) => [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return (r.right > w + 1 || r.left < -1) && !e.closest('.rail, .strip, .contact, .tabs, .decisions, .chips, .end, .tk-row, .videos, .scrolls') && getComputedStyle(e).position !== 'fixed'; }).slice(0, 6).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')} ${Math.round(e.getBoundingClientRect().right)}`), width);
    console.log('    ', culprits.join(' | '));
  }
  // in a full-page capture, fixed bars sit at the end of the document (where the reader meets them), not mid-page
  if (full) await page.addStyleTag({ content: 'body{position:relative} .tabbar,.nowbar{position:absolute!important}' });
  await fs.mkdir(path.dirname(out), { recursive: true });
  const buf = await page.screenshot({ path: out, fullPage: full });
  if (pngWidth(buf) !== width) { process.exitCode = 1; console.log(`  WARNING ${file} ${lang} ${width}: the capture is ${pngWidth(buf)} px wide`); }
  await ctx.close();
  console.log('  ', path.relative(process.cwd(), out));
}

if (opt('--file')) {
  await shoot(opt('--file'), path.resolve(opt('--out')), +(opt('--width') ?? 1440), { lang: opt('--lang') ?? 'en', full: opt('--full') !== '0', height: opt('--height') ? +opt('--height') : undefined });
} else {
  const pages = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
  const langs = opt('--lang') ? [opt('--lang')] : LANGS;
  const widths = opt('--width') ? [+opt('--width')] : WIDTHS;
  for (const p of pages.length ? pages : PAGES) {
    for (const lang of langs) for (const w of widths) await shoot(`${p}.html`, path.join(outDir, `${p}-${lang}-${w}.png`), w, { lang });
  }
}
await browser.close();
