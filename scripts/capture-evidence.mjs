// Capture full-page screenshots of the studio's pages as evidence (headless Chromium via Playwright).
//   node scripts/capture-evidence.mjs [--base http://127.0.0.1:4200] [--out docs/evidence] [--prefix studio]
//        [--width 1440] [--lang en|ar] [--suffix -ar-desktop] path [path ...]
// Each path becomes <out>/<prefix>-<slug><suffix>.png. Pages are given a moment to load their live data.
// --lang ar renders the Arabic interface for this browser only: the studio snapshot the page reads is answered with
// settings.uiLanguage = 'ar' (nothing is written to the database; other browsers keep their language).
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); if (i === -1) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
// localhost, not 127.0.0.1: the dev server's event stream only settles for the origin the app was opened on
const base = opt('base', 'http://localhost:4200');
const out = opt('out', 'docs/evidence');
const prefix = opt('prefix', 'studio');
const width = Number(opt('width', '1440'));
const lang = opt('lang', '');
const suffix = opt('suffix', '');
const paths = args.length ? args : ['/studio'];
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch();
const isPhone = width < 768;
const page = await browser.newPage({ viewport: { width, height: isPhone ? 844 : 900 }, colorScheme: 'dark', ...(isPhone ? { isMobile: true, hasTouch: true } : {}) });
if (lang === 'ar' || lang === 'en') {
  await page.addInitScript((l) => { try { localStorage.setItem('vewbox.ui', JSON.stringify({ locale: l, motion: false })); } catch { /* fine */ } }, lang);
  await page.route('**/api/studio', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    if (body?.state?.settings) body.state.settings.uiLanguage = lang;
    await route.fulfill({ response: res, json: body });
  });
}
for (const p of paths) {
  const slug = p.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
  await page.goto(`${base}${p}`, { waitUntil: 'domcontentloaded' });
  // the shell renders a skeleton until the snapshot and the event stream are in; wait for the page's own heading
  await page.waitForFunction(() => document.querySelector('main h1') && !/Reconnecting/.test(document.body.innerText), null, { timeout: 90_000 });
  await page.waitForTimeout(2500);
  const file = path.join(out, `${prefix}-${slug}${suffix}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`${p} → ${file}`);
}
await browser.close();
