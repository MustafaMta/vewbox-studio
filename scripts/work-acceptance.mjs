// Production workspace acceptance in a real browser (docs/design/PAGE-ENGINEERING-BRIEF.md §4; VISUAL-STANDARD-V5.1 §8):
//
//   node scripts/work-acceptance.mjs [--base http://localhost:4258] [--out dir] [--film short-28bdb3342b] [--shot shot-633cd06560]
//
// For 1440×900, 1920×1080 and 390×844 it loads the production map, one shot workspace and the final cut once each on a
// throttled network (CDP: 1.5 Mbps, 150 ms latency), screenshots the page while it loads (the skeleton) and again when
// every picture has decoded, records every layout shift after the first paint (CLS) and measures: the panels at their
// real sizes (outline 280, inspector 360 at ≥ 1280), the shared start edge of the pane's section heads, equal heights of
// the shot cards in a strip row and of the take cards, Geist/Geist Mono on every visible text node, no text under 12 px,
// no horizontal overflow, and no frame marked unavailable. Read only: every write is refused. Exit code 1 on a failure.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i === -1 ? dflt : args[i + 1]; };
const base = opt('base', 'http://localhost:4258');
const out = opt('out', 'docs/evidence/work-v1');
const film = opt('film', 'short-28bdb3342b');
const shotId = opt('shot', 'shot-633cd06560');
await fs.mkdir(out, { recursive: true });

const PAGES = [
  { name: 'map', path: `/shorts/${film}/production`, ready: '.ws-map' },
  { name: 'shot', path: `/shorts/${film}/shots/${shotId}`, ready: '.ws-stage .ws-take' },
  { name: 'final', path: `/shorts/${film}/production?tab=final`, ready: '.ws-final' },
];
const ALL_SIZES = [{ w: 1440, h: 900, touch: false }, { w: 1920, h: 1080, touch: false }, { w: 390, h: 844, touch: true }];
// --widths 1920,390 measures only those sizes
const only = opt('widths', '').split(',').filter(Boolean).map(Number);
const SIZES = only.length ? ALL_SIZES.filter((s) => only.includes(s.w)) : ALL_SIZES;
// warm the dev server's compiles first, so the throttled loads measure the page and not the compiler
for (const pg of PAGES) await fetch(`${base}${pg.path}`).catch(() => {});
const browser = await chromium.launch();
let failed = 0;
const report = [];

for (const size of SIZES) {
  for (const pg of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, colorScheme: 'dark', hasTouch: size.touch, isMobile: size.touch, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.route('**/api/**', (route) => (['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.fulfill({ status: 403, body: '{"error":"read-only acceptance"}' })));
    await page.addInitScript(() => { try { Object.defineProperty(navigator, 'sendBeacon', { value: () => true }); } catch { /* fine */ } });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    // a returning producer: the app's code is in the browser's cache (the dev server's unminified bundles alone would
    // take minutes at 1.5 Mbps); the studio's data and every picture load on the throttled line
    // the dev server can hand out a chunk mid-compile (ChunkLoadError): load again, three times at most
    for (let attempt = 1; ; attempt++) {
      try { await page.goto(`${base}${pg.path}`, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('.ws:not(.ws-skeleton)', { timeout: 90000 }); break; }
      catch (e) { if (attempt >= 3) throw e; console.log(`  retrying ${pg.path}`); }
    }
    await page.goto('about:blank');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.5 * 1024 * 1024) / 8, uploadThroughput: (0.75 * 1024 * 1024) / 8 });
    await page.addInitScript(() => {
      window.__shifts = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shifts.push({ value: e.value, t: Math.round(e.startTime), nodes: (e.sources || []).map((s) => s.node?.className?.toString?.().slice(0, 60) ?? s.node?.nodeName) }); }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(`${base}${pg.path}`, { waitUntil: 'commit' });
    await page.waitForSelector('.ws', { timeout: 240000 });
    const skeletonSeen = await page.evaluate(() => Boolean(document.querySelector('.ws-skeleton')));
    await page.screenshot({ path: `${out}/${pg.name}-loading-${size.w}.png` });
    try { await page.waitForSelector(`.ws:not(.ws-skeleton) ${pg.ready}`, { timeout: 360000 }); }
    catch { failed++; report.push({ page: pg.name, size: `${size.w}×${size.h}`, error: 'not ready in 6 minutes on the throttled line' }); console.log(`${pg.name} ${size.w}×${size.h}: ✗ not ready in 6 minutes on the throttled line`); await ctx.close(); continue; }
    await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
    await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 120000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/${pg.name}-${size.w}.png`, fullPage: true });
    if (pg.name === 'shot' && size.w >= 1280) {
      // the inspector scrolls on its own: a second picture with the dialogue in view
      await page.evaluate(() => { const i = document.querySelector('.ws-inspector'); const d = [...document.querySelectorAll('.ws-disc-sum')].find((s) => s.textContent?.startsWith('Action')); if (i && d) i.scrollTop = d.getBoundingClientRect().top - i.getBoundingClientRect().top + i.scrollTop - 8; });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${out}/shot-inspector-${size.w}.png` });
    }

    const m = await page.evaluate(() => {
      const box = (sel) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
      const visible = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).display !== 'none'; };
      const pane = document.querySelector('.ws-main, .ws-stage');
      const paneX = pane ? Math.round(pane.getBoundingClientRect().left + parseFloat(getComputedStyle(pane).paddingLeft)) : null;
      const heads = [...(pane?.querySelectorAll(':scope > .ws-sec > .shead, :scope > .ws-pane-head, :scope > .ws-lead, :scope > .ws-flow, :scope .ws-split-main > section > .shead, :scope > .ws-stage-head, :scope > .ws-takes > .ws-sub-head') ?? [])].filter(visible).map((e) => Math.round(e.getBoundingClientRect().left));
      // equal heights: shot cards that share a row, take cards that share a row
      const rows = (sel) => { const by = new Map(); for (const e of [...document.querySelectorAll(sel)].filter(visible)) { const b = e.getBoundingClientRect(); const k = Math.round(b.top); by.set(k, [...(by.get(k) ?? []), Math.round(b.height)]); } return [...by.values()].filter((hs) => hs.length > 1); };
      const unequal = [...rows('.ws-strip > li .ws-shot-frame'), ...rows('.ws-take-row > li .ws-take-frame')].filter((hs) => new Set(hs).size > 1);
      const fonts = new Set(); const small = [];
      const walker = document.createTreeWalker(document.querySelector('main') ?? document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const n = walker.currentNode; if (!n.textContent.trim()) continue;
        const el = n.parentElement; const cs = getComputedStyle(el); const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0 || cs.visibility === 'hidden' || el.closest('.sr-only')) continue;
        fonts.add(cs.fontFamily.split(',')[0].replace(/["']/g, '').trim());
        if (parseFloat(cs.fontSize) < 12) small.push(`${parseFloat(cs.fontSize)}px "${n.textContent.trim().slice(0, 30)}"`);
      }
      const imgs = [...document.querySelectorAll('main img')];
      return {
        outline: Math.round(box('.ws-outline')?.width ?? 0), inspector: Math.round(box('.ws-inspector')?.width ?? 0), canvas: Math.round(box('.ws-canvas')?.width ?? 0),
        paneX, heads, startOk: heads.every((x) => x === paneX), unequal,
        fonts: [...fonts], small: small.slice(0, 8),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        images: imgs.length, broken: [...imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')), ...[...document.querySelectorAll('main [data-failed]:not(li)')].map((e) => e.getAttribute('aria-label') ?? 'a frame marked unavailable')],
        cls: window.__shifts.reduce((a, s) => a + s.value, 0), shifts: window.__shifts.filter((s) => s.value > 0.001).slice(0, 6),
      };
    });
    const wide = size.w >= 1280;
    const fontOk = m.fonts.every((f) => /^(Geist|Geist Mono|__Geist)/i.test(f) || /Segoe UI|Tahoma|Geeza|Arabic/i.test(f));
    const checks = {
      'outline 280 (≥1280) / hidden (<1280)': wide ? m.outline === 280 : m.outline === 0,
      ...(pg.name === 'shot' ? { 'inspector 360 (≥1280)': wide ? m.inspector === 360 : true } : {}),
      'shared start edge': m.startOk,
      'equal heights in a row': m.unequal.length === 0,
      'fonts Geist': fontOk,
      'no text < 12 px': m.small.length === 0,
      'no horizontal overflow': m.overflow <= 0,
      'no broken images': m.broken.length === 0,
      'CLS < 0.02': m.cls < 0.02,
      'skeleton shown while loading': skeletonSeen,
    };
    const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    failed += bad.length;
    report.push({ page: pg.name, size: `${size.w}×${size.h}`, ...m, checks });
    console.log(`${pg.name} ${size.w}×${size.h}: ${bad.length ? `✗ ${bad.join(', ')}` : '✓ all checks'} · outline ${m.outline} · inspector ${m.inspector} · canvas ${m.canvas} · start x ${[...new Set(m.heads)].join('/')} (pane ${m.paneX}) · CLS ${m.cls.toFixed(4)} · fonts ${m.fonts.join(', ')}${m.small.length ? ` · small: ${m.small.join('; ')}` : ''}${m.shifts.length ? ` · shifts: ${JSON.stringify(m.shifts)}` : ''}${m.broken.length ? ` · broken: ${m.broken.join(', ')}` : ''}`);
    await ctx.close();
  }
}
await browser.close();
await fs.writeFile(`${out}/acceptance.json`, `${JSON.stringify({ checked: new Date().toISOString(), base, report }, null, 2)}\n`);
process.exitCode = failed ? 1 : 0;
