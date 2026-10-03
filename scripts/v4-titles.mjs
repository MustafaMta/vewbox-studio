// Every route has its own English title (docs/DESIGN-SYSTEM-V4.md §7.3, §8.4 gate 5; WCAG 2.4.2; V5 §9: English only).
//
//   node scripts/v4-titles.mjs [--base http://localhost:4200] [--fixture states] [--set <pkg>[,<pkg>]] [--out file.json]
//
// Opens each route of the given sets (default: every set) in a headless browser on the fixture studio (nothing is
// written; scripts/lib/capture.mjs) and reads document.title. Fails when a route keeps the bare studio name, when two
// routes share a title, when the interface part of a title is not English, or when the document carries more than one
// <title>.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { DEVICES, SETS, loadFixture, withPage } from './lib/capture.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); if (i === -1) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
const base = opt('base', 'http://localhost:4200');
const fixtureOpt = opt('fixture', 'states');
const sets = opt('set', Object.keys(SETS).join(',')).split(',');
const outFile = opt('out', '');

const browser = await chromium.launch();
const rows = [];
let failed = 0;
{
  const fixture = await loadFixture(fixtureOpt, 'reduce');
  const seen = new Map();
  const paths = [...new Set(sets.flatMap((s) => (SETS[s] ?? []).map(([, p]) => (typeof p === 'function' ? p(fixture) : p))))];
  for (const p of paths) {
    let r;
    try {
      r = await withPage(browser, { size: DEVICES.desktop, url: `${base}${p}`, fixture, motion: 'reduce', settle: false }, async (page) => {
        // department and agent names arrive from the organisation a moment after the page
        if (p.startsWith('/studio/')) await page.waitForFunction(() => !/·\s*[A-Za-z-]+\s·\s*Studio Company/.test(document.title), null, { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(300);
        return page.evaluate(() => ({ title: document.title, titles: document.head.querySelectorAll('title').length, landed: location.pathname + location.search }));
      });
    } catch (e) { r = { title: `(failed: ${e.message.split('\n')[0]})`, titles: 0 }; }
    const problems = [];
    // one page is its path, its tab and the cut on screen; other parameters (?start=, ?show=) open the same page; a
    // redirect (/library, /projects, /jobs) is the page it lands on, so it shares that page's title
    const u = new URL(r.landed ?? p, 'http://x'); const pageKey = `${u.pathname}?${['tab', 'cut'].map((k) => u.searchParams.get(k) ?? '').join('&')}`;
    if (!r.title.includes(' · ')) problems.push('only the studio name');
    if (seen.has(r.title) && seen.get(r.title).key !== pageKey) problems.push(`same as ${seen.get(r.title).path}`);
    // the fixture studio's records are named in English, so every letter of a title is Latin
    if (/[^\p{Script=Latin}\P{L}]/u.test(r.title)) problems.push('not English');
    if (r.titles > 1) problems.push(`${r.titles} <title> elements`);
    if (!seen.has(r.title)) seen.set(r.title, { key: pageKey, path: p });
    if (problems.length) failed++;
    rows.push({ path: p, title: r.title, ok: problems.length === 0, problems });
    console.log(`${problems.length ? '✗' : '✓'} ${p.padEnd(58)} ${r.title}${problems.length ? `   ← ${problems.join('; ')}` : ''}`);
  }
}
await browser.close();
if (outFile) await fs.writeFile(outFile, `${JSON.stringify({ checked: new Date().toISOString(), fixture: fixtureOpt, routes: rows.length, failed, rows }, null, 2)}\n`);
console.log(failed ? `${failed} route(s) without a distinct title` : `every route (${rows.length}) has a distinct English title`);
process.exitCode = failed ? 1 : 0;
