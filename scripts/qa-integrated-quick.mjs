// One plain full-page capture per page at one width (no throttle, no measurement), for the pages the full pass did
// not reach:  node scripts/qa-integrated-quick.mjs --width 1920 [--base http://localhost:4261] [--out docs/evidence/design-qa-integrated]
// Skips a page whose capture already exists. Read only (scripts/lib/capture.mjs answers every write in the page).
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadFixture, withPage } from './lib/capture.mjs';
import { PAGES } from './qa-integrated.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i === -1 ? dflt : args[i + 1]; };
const base = opt('base', 'http://localhost:4261');
const out = opt('out', 'docs/evidence/design-qa-integrated');
const width = Number(opt('width', '1920'));
const size = width < 768 ? { width, height: 844, touch: true } : { width, height: width === 1920 ? 1080 : 900, touch: false };
const fixture = await loadFixture('states');
const browser = await chromium.launch();
for (const pg of PAGES) {
  const file = path.join(out, `${pg.name}-${width}.png`);
  if (await fs.stat(file).then(() => true, () => false)) { console.log(`${pg.name}-${width}: exists`); continue; }
  try {
    await withPage(browser, { size, url: `${base}${pg.path}`, fixture: pg.fixture ? fixture : null }, async (page) => {
      await page.screenshot({ path: file, fullPage: true });
      const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      console.log(`${pg.name}-${width}: captured${o > 0 ? ` (horizontal overflow ${o}px)` : ''}`);
    });
  } catch (e) { console.log(`${pg.name}-${width}: FAILED ${e.message.split('\n')[0]}`); }
}
await browser.close();
