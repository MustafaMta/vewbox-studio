// Shows acceptance in a real browser (docs/design/PAGE-ENGINEERING-BRIEF.md §4; VISUAL-STANDARD-V5.1 §8):
//
//   node scripts/shows-acceptance.mjs [--base http://localhost:4253] [--out docs/evidence/shows-v1] [--fixture states]
//
// For 1440×900, 1920×1080 and 390×844 it opens each Shows page once on a throttled network (CDP: 1.5 Mbps, 150 ms
// latency), screenshots it while it loads and again when every picture has decoded, records every layout shift after
// the first paint (CLS) and measures: one shared start edge (page head, backdrop, caption, section heads, grids); equal
// heights in each row of tiles; Geist / Geist Mono on every visible text node; no text under 12 px; no horizontal
// overflow; no frame marked unavailable. The populated pages answer the browser's reads from the fixture studio
// (scripts/v4-fixture.ts; the live studio has no show); /shows is also measured live (its empty state). Read only:
// every write is answered in the page and never sent. Exit code 1 when a check fails.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { loadFixture, prepare } from './lib/capture.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i === -1 ? dflt : args[i + 1]; };
const base = opt('base', 'http://localhost:4253');
const out = opt('out', 'docs/evidence/shows-v1');
const fixture = await loadFixture(opt('fixture', 'states'));
await fs.mkdir(out, { recursive: true });

const PAGES = [
  { name: 'shows-empty', path: '/shows', live: true, ready: '.shows[data-state="empty"]:not(.shows-skeleton)' },
  { name: 'shows', path: '/shows', ready: '.shows:not(.shows-skeleton) .shows-grid .mtile' },
  { name: 'show', path: '/shows/last-sip', ready: '.show-page:not(.shows-skeleton) .show-hero' },
  { name: 'show-no-episodes', path: '/shows/paper-kites', ready: '.show-page:not(.shows-skeleton) .show-hero' },
  { name: 'season', path: '/shows/last-sip/seasons/last-sip-s1', ready: '.season-page:not(.shows-skeleton) .shows-grid' },
  { name: 'episode', path: '/shows/last-sip/seasons/last-sip-s1/episodes/s1e2', ready: '.episode-page:not(.shows-skeleton) .ep-steps' },
];
const SIZES = [{ w: 1440, h: 900, touch: false }, { w: 1920, h: 1080, touch: false }, { w: 390, h: 844, touch: true }];
const browser = await chromium.launch();
let failed = 0;
const report = [];

for (const size of SIZES) {
  for (const pg of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, colorScheme: 'dark', hasTouch: size.touch, isMobile: size.touch, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await prepare(page, { fixture: pg.live ? null : fixture });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.5 * 1024 * 1024) / 8, uploadThroughput: (0.75 * 1024 * 1024) / 8 });
    await page.addInitScript(() => {
      window.__shifts = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shifts.push({ value: e.value, t: Math.round(e.startTime), nodes: (e.sources || []).map((s) => s.node?.className?.toString?.().slice(0, 60) ?? s.node?.nodeName) }); }).observe({ type: 'layout-shift', buffered: true });
      window.__skeleton = false;
      new MutationObserver(() => { if (document.querySelector('.shows-skeleton')) window.__skeleton = true; }).observe(document, { childList: true, subtree: true });
    });
    const t0 = Date.now();
    await page.goto(`${base}${pg.path}`, { waitUntil: 'commit' });
    await page.waitForSelector('main', { timeout: 120000 });
    await page.screenshot({ path: `${out}/${pg.name}-loading-${size.w}.png` });
    await page.waitForSelector(pg.ready, { timeout: 120000 });
    const firstMs = Date.now() - t0;
    await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
    await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 120000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/${pg.name}-${size.w}.png`, fullPage: true });

    const m = await page.evaluate(() => {
      const main = document.querySelector('main');
      const x = (sel) => [...main.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0).map((e) => Math.round(e.getBoundingClientRect().left));
      const starts = [...x('.shows-page-head'), ...x('.page-back'), ...x('.show-hero-frame'), ...x('.show-caption'), ...x('.shead'), ...x('.shows-grid'), ...x('.show-figures > li:first-child'), ...x('.show-plates'), ...x('.show-bible'), ...x('.ep-steps'), ...x('.pcard'), ...x('.shows-empty')];
      // equal heights: tiles that share a row in a grid
      const rows = [];
      for (const grid of main.querySelectorAll('.shows-grid, .ep-steps, .show-bible, .show-plates, .show-figures')) {
        const byTop = new Map();
        for (const li of grid.children) {
          const card = li.querySelector('.mtile, .ep-tile, .ep-step, .show-bible-card, .fcard') ?? li;
          if (card.classList.contains('start-card')) continue;
          const b = card.getBoundingClientRect(); if (!b.width) continue;
          const k = Math.round(b.top); byTop.set(k, [...(byTop.get(k) ?? []), Math.round(b.height)]);
        }
        for (const hs of byTop.values()) if (hs.length > 1) rows.push(hs);
      }
      const fonts = new Set(); const small = [];
      const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const n = walker.currentNode; if (!n.textContent.trim()) continue;
        const el = n.parentElement; const cs = getComputedStyle(el); const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0 || cs.visibility === 'hidden' || el.closest('.sr-only, [hidden]')) continue;
        fonts.add(cs.fontFamily.split(',')[0].replace(/["']/g, '').trim());
        if (parseFloat(cs.fontSize) < 12) small.push(`${parseFloat(cs.fontSize)}px "${n.textContent.trim().slice(0, 30)}"`);
      }
      const imgs = [...main.querySelectorAll('img')];
      return {
        starts: [...new Set(starts)], rows: rows.filter((r) => new Set(r).size > 1),
        fonts: [...fonts], small: small.slice(0, 8),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        images: imgs.length, broken: [...imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')), ...[...main.querySelectorAll('[data-failed]')].map((e) => e.getAttribute('aria-label') ?? 'a frame marked unavailable')],
        cls: window.__shifts.reduce((a, s) => a + s.value, 0), shifts: window.__shifts.filter((s) => s.value > 0.001).slice(0, 6),
        skeleton: window.__skeleton,
        hero: (() => { const h = main.querySelector('.show-hero-frame'); if (!h) return null; const b = h.getBoundingClientRect(); return `${Math.round(b.width)}×${Math.round(b.height)}`; })(),
      };
    });
    const fontOk = m.fonts.every((f) => /^(Geist|Geist Mono|__Geist)/i.test(f) || /Segoe UI|Tahoma|Geeza|Arabic/i.test(f));
    const checks = {
      'shared start edge': m.starts.length === 1,
      'equal heights in rows': m.rows.length === 0,
      'fonts Geist': fontOk,
      'no text < 12 px': m.small.length === 0,
      'no horizontal overflow': m.overflow <= 0,
      'no broken images': m.broken.length === 0,
      'CLS < 0.02': m.cls < 0.02,
    };
    const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    failed += bad.length;
    report.push({ page: pg.name, size: `${size.w}×${size.h}`, firstMs, ...m, checks });
    console.log(`${pg.name} ${size.w}: ${bad.length ? `✗ ${bad.join(', ')}` : '✓'} · start x ${m.starts.join('/')} · CLS ${m.cls.toFixed(4)} · skeleton ${m.skeleton ? 'seen' : 'not seen'}${m.hero ? ` · backdrop ${m.hero}` : ''} · images ${m.images} · fonts ${m.fonts.join(', ')}${m.rows.length ? ` · unequal rows ${JSON.stringify(m.rows)}` : ''}${m.small.length ? ` · small: ${m.small.join('; ')}` : ''}${m.broken.length ? ` · broken: ${m.broken.slice(0, 3).join(', ')}` : ''}${m.shifts.length ? ` · shifts: ${JSON.stringify(m.shifts)}` : ''}`);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await ctx.close();
  }
}
await browser.close();
await fs.writeFile(`${out}/acceptance.json`, `${JSON.stringify({ checked: new Date().toISOString(), base, report }, null, 2)}\n`);
process.exitCode = failed ? 1 : 0;
