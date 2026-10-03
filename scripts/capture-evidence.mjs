// Capture full-page screenshots of the studio's pages as evidence (headless Chromium via Playwright).
//
//   node scripts/capture-evidence.mjs [--base http://localhost:4200] [--out docs/evidence] [--prefix studio]
//        [--width 1440 | --device desktop,tablet,phone] [--lang en,ar] [--suffix -ar-desktop]
//        [--fixture sample|empty|states|<file.json>] [--set <pkg>] [--motion reduce] [--axe] [path ...]
//
// Pages:   the paths given, or with --set <pkg> that package's page list (scripts/lib/capture.mjs SETS; §8.5).
// Sizes:   --width <px> (a phone below 768), or --device: desktop 1440×900 · tablet 834×1112 touch · phone 390×844 touch.
//          Several devices and languages may be listed (comma-separated): every page is captured in each combination.
// Files:   <out>/<prefix>-<slug><suffix>.png. With several devices or languages and no --suffix, the suffix is
//          -<lang>-<width>. With --set: <out>/v4-<pkg>-<page>-<state>-<lang>-<width>.png (state = the fixture, or live).
// Data:    by default the live studio, read-only. --lang answers the studio snapshot with settings.uiLanguage = <lang>
//          for this browser only. --fixture answers the browser's own GET /api/studio, /api/jobs[/:id] and
//          /api/studio/org/pipeline from scripts/v4-fixture.ts (or a JSON file of the same shape) and replaces the
//          event stream in the page; media, the organisation and engine status are read from the server as they are.
// Writes:  NEVER sent, in every mode: a POST/PUT/PATCH/DELETE to /api/* is answered here (commands "accepted",
//          anything else refused) and navigator.sendBeacon is a no-op. A capture cannot change a record.
// --motion reduce  renders with reduced motion (deterministic: no live-dot loop, no fades mid-way) — use it for
//                  before/after comparisons.
// --axe     runs axe-core on each page when @axe-core/playwright is installed (a devDependency to approve, §8.4) and
//           writes <file>.axe.json; without it the run says so and captures anyway.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DEVICES, SETS, fixtureName, loadFixture, withPage } from './lib/capture.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); if (i === -1) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (name) => { const i = args.indexOf(`--${name}`); if (i === -1) return false; args.splice(i, 1); return true; };
// localhost, not 127.0.0.1: the dev server's event stream only settles for the origin the app was opened on
const base = opt('base', 'http://localhost:4200');
const out = opt('out', 'docs/evidence');
const setName = opt('set', '');
const prefix = opt('prefix', setName ? 'v4' : 'studio');
const widthOpt = opt('width', '');
const deviceOpt = opt('device', '');
const langOpt = opt('lang', '');
const suffixOpt = opt('suffix', null);
const fixtureOpt = opt('fixture', '');
const motion = opt('motion', '');
const axe = flag('axe');

const sizes = deviceOpt
  ? deviceOpt.split(',').map((d) => { const s = DEVICES[d.trim()]; if (!s) throw new Error(`unknown device "${d}" (desktop, tablet, phone)`); return s; })
  : (widthOpt || '1440').split(',').map((w) => { const width = Number(w); const phone = width < 768; return { width, height: phone ? 844 : 900, touch: phone }; });
const langs = langOpt ? langOpt.split(',').map((l) => l.trim()) : [''];
const matrix = sizes.length > 1 || langs.length > 1;
const state = fixtureName(fixtureOpt);

let pages;
if (setName) {
  const set = SETS[setName];
  if (!set) throw new Error(`unknown set "${setName}" (${Object.keys(SETS).join(', ')})`);
  pages = set.map(([name, p]) => ({ name, path: p }));
} else {
  pages = (args.length ? args : ['/studio']).map((p) => ({ name: p.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home', path: p }));
}

let AxeBuilder = null;
if (axe) {
  try { AxeBuilder = (await import('@axe-core/playwright')).default; }
  catch { console.log('--axe: @axe-core/playwright is not installed (devDependency to approve, DESIGN-SYSTEM-V4 §8.4); capturing without it'); }
}

await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch();
for (const size of sizes) {
  for (const lang of langs) {
    const fixture = await loadFixture(fixtureOpt, lang, motion);
    for (const pg of pages) {
      const target = typeof pg.path === 'function' ? pg.path(fixture) : pg.path;
      const file = setName
        ? path.join(out, `${prefix}-${setName}-${pg.name}-${state}-${lang || 'en'}-${size.width}.png`)
        : path.join(out, `${prefix}-${pg.name}${suffixOpt ?? (matrix ? `-${lang || 'en'}-${size.width}` : '')}.png`);
      try {
        await withPage(browser, { size, url: `${base}${target}`, lang, fixture, motion }, async (page) => {
          await page.screenshot({ path: file, fullPage: true });
          const info = await page.evaluate(() => ({ title: document.title, overflow: document.documentElement.scrollWidth - window.innerWidth }));
          let axeNote = '';
          if (AxeBuilder) {
            const r = await new AxeBuilder({ page }).analyze();
            const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
            await fs.writeFile(file.replace(/\.png$/, '.axe.json'), JSON.stringify(r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length })), null, 2));
            axeNote = `  axe: ${bad.length} serious/critical`;
          }
          console.log(`${target} → ${file}  «${info.title}»${info.overflow > 0 ? `  (horizontal overflow ${info.overflow}px)` : ''}${axeNote}`);
        });
      } catch (e) { console.log(`${target} FAILED: ${e.message.split('\n')[0]}`); process.exitCode = 1; }
    }
  }
}
await browser.close();
