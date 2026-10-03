// Home acceptance in a real browser (docs/design/VISUAL-STANDARD-V5.1.md §8; the producer's Krea reference):
//
//   node scripts/home-acceptance.mjs [--base http://localhost:4200] [--out dir]
//
// For 1440×900, 2000×991 and 390×844 it loads Home once on a throttled network (CDP: 1.5 Mbps, 150 ms latency),
// screenshots the page while it loads (the skeleton) and again when everything has decoded, records every layout shift
// after the first paint (CLS), and measures: the shared start edge of the banner, the featured row and every shelf head;
// equal heights in the tool grid; Geist/Geist Mono on every visible text node; no text under 12 px; no horizontal
// overflow; every picture decoded. Read only: it never writes to the studio. Exit code 1 when a check fails.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i === -1 ? dflt : args[i + 1]; };
const base = opt('base', 'http://localhost:4200');
const out = opt('out', 'docs/evidence/home-v3');
await fs.mkdir(out, { recursive: true });

const SIZES = [{ w: 1440, h: 900, touch: false }, { w: 2000, h: 991, touch: false }, { w: 390, h: 844, touch: true }];
const browser = await chromium.launch();
let failed = 0;
const report = [];

for (const size of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, colorScheme: 'dark', hasTouch: size.touch, isMobile: size.touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  // never write: refuse every mutating API call
  await page.route('**/api/**', (route) => (['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.fulfill({ status: 403, body: '{"error":"read-only acceptance"}' })));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.5 * 1024 * 1024) / 8, uploadThroughput: (0.75 * 1024 * 1024) / 8 });
  await page.addInitScript(() => {
    window.__shifts = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shifts.push({ value: e.value, t: Math.round(e.startTime), nodes: (e.sources || []).map((s) => s.node?.className?.toString?.().slice(0, 60) ?? s.node?.nodeName) }); }).observe({ type: 'layout-shift', buffered: true });
  });
  const t0 = Date.now();
  await page.goto(`${base}/`, { waitUntil: 'commit' });
  await page.waitForSelector('.home', { timeout: 120000 });
  const firstHome = Date.now() - t0;
  const skeletonSeen = await page.evaluate(() => Boolean(document.querySelector('.home-skeleton')));
  await page.screenshot({ path: `${out}/home-loading-${size.w}.png` });
  await page.waitForSelector('.home:not(.home-skeleton) .home-hero', { timeout: 120000 });
  // scroll through so lazy pictures load, then wait for every image
  await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/home-${size.w}.png`, fullPage: true });

  const m = await page.evaluate(() => {
    const r = (sel) => [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect());
    const x = (sel) => r(sel).map((b) => Math.round(b.left));
    const starts = [...x('.home-hero-frame'), ...x('.home-hero-caption'), ...x('.home-feature'), ...x('.home-shelf-head')];
    const tools = r('.home-tool').map((b) => Math.round(b.height));
    const fonts = new Set(); const small = [];
    const walker = document.createTreeWalker(document.querySelector('main') ?? document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode; if (!n.textContent.trim()) continue;
      const el = n.parentElement; const cs = getComputedStyle(el); const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0 || cs.visibility === 'hidden') continue;
      fonts.add(cs.fontFamily.split(',')[0].replace(/["']/g, '').trim());
      if (parseFloat(cs.fontSize) < 12) small.push(`${parseFloat(cs.fontSize)}px "${n.textContent.trim().slice(0, 30)}"`);
    }
    const imgs = [...document.querySelectorAll('main img')];
    return {
      starts, startOk: new Set(starts).size === 1,
      tools, toolsEqual: new Set(tools).size <= 1,
      fonts: [...fonts], small: small.slice(0, 8),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      images: imgs.length, broken: [...imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')), ...[...document.querySelectorAll('main [data-failed]')].map((e) => e.getAttribute('aria-label') ?? 'a frame marked unavailable')],
      cls: window.__shifts.reduce((a, s) => a + s.value, 0), shifts: window.__shifts.filter((s) => s.value > 0.001).slice(0, 6),
      sidebar: document.querySelector('.shell-nav')?.getBoundingClientRect().width ?? 0,
      heroH: Math.round(document.querySelector('.home-hero-frame')?.getBoundingClientRect().height ?? 0),
      heroW: Math.round(document.querySelector('.home-hero-frame')?.getBoundingClientRect().width ?? 0),
    };
  });
  const fontOk = m.fonts.every((f) => /^(Geist|Geist Mono|__Geist)/i.test(f) || /Segoe UI|Tahoma|Geeza|Arabic/i.test(f));
  const checks = {
    'shared start edge': m.startOk,
    'tool cards equal': m.toolsEqual,
    'fonts Geist': fontOk,
    'no text < 12 px': m.small.length === 0,
    'no horizontal overflow': m.overflow <= 0,
    'no broken images': m.broken.length === 0,
    'CLS < 0.02': m.cls < 0.02,
    'skeleton shown while loading': skeletonSeen,
  };
  const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  failed += bad.length;
  report.push({ size: `${size.w}×${size.h}`, firstHomeMs: firstHome, ...m, checks });
  console.log(`${size.w}×${size.h}: ${bad.length ? `✗ ${bad.join(', ')}` : '✓ all checks'} · hero ${m.heroW}×${m.heroH} · sidebar ${m.sidebar} · CLS ${m.cls.toFixed(4)} · start x ${[...new Set(m.starts)].join('/')} · tools ${[...new Set(m.tools)].join('/')} · fonts ${m.fonts.join(', ')}${m.small.length ? ` · small: ${m.small.join('; ')}` : ''}${m.shifts.length ? ` · shifts: ${JSON.stringify(m.shifts)}` : ''}`);
  await ctx.close();
}
await browser.close();
await fs.writeFile(`${out}/acceptance.json`, `${JSON.stringify({ checked: new Date().toISOString(), base, report }, null, 2)}\n`);
process.exitCode = failed ? 1 : 0;
