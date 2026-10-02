// Capture full-page screenshots of the studio's pages as evidence (headless Chromium via Playwright).
//   node scripts/capture-evidence.mjs [--base http://127.0.0.1:4200] [--out docs/evidence] [--prefix studio] path [path ...]
// Each path becomes <out>/<prefix>-<slug>.png. Pages are given a moment to load their live data.
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
const paths = args.length ? args : ['/studio'];
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: 'dark' });
for (const p of paths) {
  const slug = p.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
  await page.goto(`${base}${p}`, { waitUntil: 'domcontentloaded' });
  // the shell renders a skeleton until the snapshot and the event stream are in; wait for the page's own heading
  await page.waitForFunction(() => document.querySelector('main h1') && !/Reconnecting/.test(document.body.innerText), null, { timeout: 90_000 });
  await page.waitForTimeout(2500);
  const file = path.join(out, `${prefix}-${slug}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`${p} → ${file}`);
}
await browser.close();
