// Cast acceptance in a real browser (docs/design/PAGE-ENGINEERING-BRIEF.md §4; VISUAL-STANDARD-V5.1 §8), for P-Cast's pages:
//
//   node scripts/cast-acceptance.mjs [--base http://localhost:4256] [--out docs/evidence/cast-v1]
//
// For 1440×900, 1920×1080 and 390×844 it loads each page once on a throttled network (CDP: 1.5 Mbps, 150 ms latency),
// records every layout shift after the first paint (CLS), scrolls through so lazy pictures load, captures the full page,
// and measures: the shared start edge (every block of the page's column on one x), equal heights of the cards in a row,
// Geist/Geist Mono on every visible text node (Arabic content in the system sans), no text under 12 px, no horizontal
// overflow, no frame marked unavailable, and that a content name's left edge equals its frame's (Arabic included).
// Read only: every mutating request is refused here and never reaches the studio. Exit code 1 when a check fails.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i === -1 ? dflt : args[i + 1]; };
const base = opt('base', 'http://localhost:4256');
const out = opt('out', 'docs/evidence/cast-v1');
await fs.mkdir(out, { recursive: true });

const studio = await (await fetch(`${base}/api/studio`)).json();
const firstLocked = studio.state.characters.find((c) => (c.usage?.videos ?? []).length > 0) ?? studio.state.characters[0];
const arabic = studio.state.characters.find((c) => /[؀-ۿ]/.test(c.name));
const loc = studio.state.locations[0];
/** name · path · the column whose children share the start edge · the cards whose heights must match */
const PAGES = [
  { name: 'characters', path: '/characters', starts: '.pc-page > :is(.pc-head, .pc-bar, .pc-grid)', equal: '.pc-grid .fcard', names: '.pc-grid .fcard' },
  firstLocked && { name: 'character', path: `/characters/${firstLocked.id}`, starts: '.char-main > :is(.pc-back, .char-slate, .char-name, .char-role, .char-identity, .char-voice, .pc-section)', equal: '.char-posters .mcard' },
  arabic && { name: 'character-ar', path: `/characters/${arabic.id}`, starts: '.char-main > :is(.pc-back, .char-slate, .char-name, .char-role, .char-identity, .char-voice, .pc-section)' },
  { name: 'characters-new', path: '/characters/new', starts: '.pc-page > :is(.pc-head, .pc-methods, .pc-create-body)' },
  { name: 'characters-new-manual', path: '/characters/new?start=sheet', starts: '.pc-page > :is(.pc-head, .pc-methods, .pc-create-body)' },
  { name: 'characters-new-picture', path: '/characters/new?start=picture', starts: '.pc-page > :is(.pc-head, .pc-methods, .pc-create-body)' },
  { name: 'locations', path: '/locations', starts: '.pc-page > :is(.pc-head, .pc-plates)', equal: '.pc-plates .mtile', names: '.pc-plates .mtile' },
  loc && { name: 'location', path: `/locations/${loc.id}`, starts: '.pc-page > :is(.pc-back, .loc-hero, .pc-section), .loc-hero > *', equal: '.loc-plates .mtile' },
  { name: 'locations-new', path: '/locations/new', starts: '.pc-page > :is(.pc-head, .pc-methods, .pc-create-body)' },
].filter(Boolean);
const SIZES = [{ w: 1440, h: 900, touch: false }, { w: 1920, h: 1080, touch: false }, { w: 390, h: 844, touch: true }];

const browser = await chromium.launch();
let failed = 0;
const report = [];
for (const size of SIZES) {
  for (const pg of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, colorScheme: 'dark', hasTouch: size.touch, isMobile: size.touch, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.route('**/api/**', (route) => (['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.fulfill({ status: 403, body: '{"error":"read-only acceptance"}' })));
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.5 * 1024 * 1024) / 8, uploadThroughput: (0.75 * 1024 * 1024) / 8 });
    await page.addInitScript(() => {
      window.__shifts = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shifts.push({ value: e.value, t: Math.round(e.startTime), nodes: (e.sources || []).map((s) => s.node?.className?.toString?.().slice(0, 60) ?? s.node?.nodeName) }); }).observe({ type: 'layout-shift', buffered: true });
      document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'nextjs-portal{display:none!important}'; document.head.append(s); });
    });
    const t0 = Date.now();
    await page.goto(`${base}${pg.path}`, { waitUntil: 'commit' });
    let skeleton = false;
    const has = async (sel) => { try { return Boolean(await page.$(sel)); } catch { return false; } };
    for (let i = 0; i < 3000 && !(await has('main h1')); i++) { if (!skeleton) skeleton = await has('main [aria-busy="true"]'); await page.waitForTimeout(100); }
    await page.waitForSelector('main h1', { timeout: 300000 });
    const firstMs = Date.now() - t0;
    await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
    await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 120000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/${pg.name}-${size.w}.png`, fullPage: true });
    const m = await page.evaluate(({ starts, equal, names }) => {
      const xs = [...document.querySelectorAll(starts)].filter((e) => e.getBoundingClientRect().width > 0).map((e) => Math.round(e.getBoundingClientRect().left));
      const rows = new Map();
      for (const e of equal ? document.querySelectorAll(equal) : []) { const b = e.getBoundingClientRect(); const k = Math.round(b.top); rows.set(k, [...(rows.get(k) ?? []), Math.round(b.height)]); }
      const unequal = [...rows.values()].filter((hs) => new Set(hs).size > 1);
      const nameEdges = names ? [...document.querySelectorAll(names)].map((card) => { const f = card.querySelector('.frame, .tcard'); const n = card.querySelector('.name, .fcard-name, .mtile-title'); const bdi = n?.querySelector('bdi'); return f && n ? Math.round((bdi ?? n).getBoundingClientRect().left - f.getBoundingClientRect().left) : 0; }) : [];
      const fonts = new Set(); const small = [];
      const walker = document.createTreeWalker(document.querySelector('main') ?? document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const n = walker.currentNode; if (!n.textContent.trim()) continue;
        const el = n.parentElement; const cs = getComputedStyle(el); const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0 || cs.visibility === 'hidden' || el.closest('[hidden], [aria-hidden="true"]')) continue;
        fonts.add(cs.fontFamily.split(',')[0].replace(/["']/g, '').trim());
        if (parseFloat(cs.fontSize) < 12) small.push(`${parseFloat(cs.fontSize)}px "${n.textContent.trim().slice(0, 30)}"`);
      }
      const imgs = [...document.querySelectorAll('main img')];
      return {
        starts: [...new Set(xs)], startOk: xs.length > 0 && new Set(xs).size === 1,
        unequal, nameEdges: [...new Set(nameEdges)],
        fonts: [...fonts], small: small.slice(0, 6),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        images: imgs.length, broken: [...imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')), ...[...document.querySelectorAll('main [data-failed]')].map((e) => e.getAttribute('aria-label') ?? 'a frame marked unavailable')],
        cls: window.__shifts.reduce((a, s) => a + s.value, 0), shifts: window.__shifts.filter((s) => s.value > 0.001).slice(0, 4),
        figure: (() => { const f = document.querySelector('.char-figure-frame'); return f ? { w: Math.round(f.getBoundingClientRect().width), h: Math.round(f.getBoundingClientRect().height), sticky: getComputedStyle(f.parentElement).position } : null; })(),
      };
    }, { starts: pg.starts, equal: pg.equal, names: pg.names });
    const fontOk = m.fonts.every((f) => /^(Geist|Geist Mono|__Geist)/i.test(f) || /Segoe UI|Tahoma|Geeza|Arabic/i.test(f));
    const checks = {
      'shared start edge': m.startOk,
      'equal heights in a row': m.unequal.length === 0,
      'names on the frame edge': m.nameEdges.every((d) => d === 0),
      'fonts Geist': fontOk,
      'no text < 12 px': m.small.length === 0,
      'no horizontal overflow': m.overflow <= 0,
      'no broken images': m.broken.length === 0,
      'CLS < 0.02': m.cls < 0.02,
    };
    const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    failed += bad.length;
    report.push({ page: pg.name, size: `${size.w}×${size.h}`, firstContentMs: firstMs, skeletonSeen: skeleton, ...m, checks });
    console.log(`${pg.name} ${size.w}: ${bad.length ? `✗ ${bad.join(', ')}` : '✓'} · start x ${m.starts.join('/')} · CLS ${m.cls.toFixed(4)} · ${firstMs} ms${skeleton ? ' · skeleton' : ''}${m.figure ? ` · figure ${m.figure.w}×${m.figure.h} ${m.figure.sticky}` : ''}${m.small.length ? ` · small: ${m.small.join('; ')}` : ''}${m.broken.length ? ` · broken: ${m.broken.join(', ')}` : ''}${m.shifts.length ? ` · shifts ${JSON.stringify(m.shifts)}` : ''}`);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await ctx.close();
  }
}
await browser.close();
await fs.writeFile(`${out}/acceptance.json`, `${JSON.stringify({ checked: new Date().toISOString(), base, report }, null, 2)}\n`);
process.exitCode = failed ? 1 : 0;
