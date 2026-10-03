// P-Studio acceptance in a real browser (docs/design/PAGE-ENGINEERING-BRIEF.md §4; VISUAL-STANDARD-V5.1 §8), in the style
// of scripts/home-acceptance.mjs:
//
//   node scripts/studio-acceptance.mjs [--base http://localhost:4260] [--out docs/evidence/studio-v1] [--pages studio,production]
//
// For 1440×900, 1920×1080 and 390×844 it loads each control page (Studio Company, a department, an agent, Production,
// Settings, Files) on a throttled network (CDP: 1.5 Mbps, 150 ms latency), screenshots it while it loads (the skeleton)
// and again full-page once every picture has decoded, records every layout shift after the first paint (CLS), and
// measures: the shared start edge of the head and every section; equal heights in each card row; Geist/Geist Mono on
// every visible text node; no text under 12 px; no horizontal overflow; no frame marked unavailable. Read only: every
// write is refused before it leaves the browser. Exit code 1 when a check fails.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i === -1 ? dflt : args[i + 1]; };
const base = opt('base', 'http://localhost:4260');
const out = opt('out', 'docs/evidence/studio-v1');
await fs.mkdir(out, { recursive: true });

const PAGES = [
  { name: 'studio', path: '/studio', ready: '.company:not(.sk-region) .co-state', rows: ['.co-dept'] },
  { name: 'department', path: '/studio/departments/CASTING', ready: '.dept:not(.sk-region) .dp-place', rows: ['.dp-agent'] },
  { name: 'agent', path: '/studio/agents/casting-director', ready: '.agent:not(.sk-region) #runs', rows: [] },
  { name: 'production', path: '/production', ready: '.control:not(.sk-region) #engine-room', rows: ['.ctl-decisions .dcard', '.ctl-engine'] },
  { name: 'settings', path: '/settings', ready: '.settings:not(.sk-region) #generation', rows: [] },
  { name: 'files', path: '/assets', ready: '.files:not(.sk-region) .fl-bar', rows: [] },
].filter((p) => !opt('pages', '') || opt('pages', '').split(',').includes(p.name));
const SIZES = [{ w: 1440, h: 900, touch: false }, { w: 1920, h: 1080, touch: false }, { w: 390, h: 844, touch: true }];

const browser = await chromium.launch();
let failed = 0;
const report = [];
for (const pg of PAGES) {
  for (const size of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, colorScheme: 'dark', hasTouch: size.touch, isMobile: size.touch, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.route('**/api/**', (route) => (['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.fulfill({ status: 403, body: '{"error":"read-only acceptance"}' })));
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.5 * 1024 * 1024) / 8, uploadThroughput: (0.75 * 1024 * 1024) / 8 });
    await page.addInitScript(() => {
      window.__shifts = []; window.__sk = false;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shifts.push({ value: e.value, t: Math.round(e.startTime), nodes: (e.sources || []).map((s) => s.node?.className?.toString?.().slice(0, 60) ?? s.node?.nodeName) }); }).observe({ type: 'layout-shift', buffered: true });
      new MutationObserver(() => { if (document.querySelector('.sk-region')) window.__sk = true; }).observe(document, { subtree: true, childList: true });
      document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'nextjs-portal{display:none!important}'; document.head.append(s); });
    });
    await page.goto(`${base}${pg.path}`, { waitUntil: 'commit' });
    await page.waitForSelector('.sk-region, .cp', { timeout: 120000 }).catch(() => {});
    await page.screenshot({ path: `${out}/${pg.name}-loading-${size.w}.png` });
    const ok = await page.waitForSelector(pg.ready, { timeout: 240000 }).then(() => true, () => false);
    if (!ok) { failed += 1; console.log(`${pg.name} ${size.w}: ✗ the page did not finish loading`); await ctx.close(); continue; }
    await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
    await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/${pg.name}-${size.w}.png`, fullPage: true });
    const m = await page.evaluate((rows) => {
      const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
      const left = (sel) => [...document.querySelectorAll(sel)].filter(vis).map((e) => Math.round(e.getBoundingClientRect().left));
      const starts = [...left('.cp > .cp-head'), ...left('.cp > .cp-section > .shead'), ...left('.cp > .co-state'), ...left('.cp > .co-grid'), ...left('.cp > .co-spine'), ...left('.cp > .pcard'), ...left('.cp > .fl-bar')];
      const unequal = [];
      for (const sel of rows) {
        const byTop = new Map();
        for (const e of [...document.querySelectorAll(sel)].filter(vis)) { const b = e.getBoundingClientRect(); const k = Math.round(b.top); byTop.set(k, [...(byTop.get(k) ?? []), Math.round(b.height)]); }
        for (const [top, hs] of byTop) if (new Set(hs).size > 1) unequal.push(`${sel}@${top}: ${hs.join('/')}`);
      }
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
        starts, startOk: new Set(starts).size === 1, unequal,
        fonts: [...fonts], small: small.slice(0, 8),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        images: imgs.length, broken: [...imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')), ...[...document.querySelectorAll('main [data-failed]')].map((e) => e.getAttribute('aria-label') ?? 'a frame marked unavailable')],
        cls: window.__shifts.reduce((a, s) => a + s.value, 0), shifts: window.__shifts.filter((s) => s.value > 0.001).slice(0, 6),
        skeleton: window.__sk, height: document.documentElement.scrollHeight,
      };
    }, pg.rows);
    const fontOk = m.fonts.every((f) => /^(Geist|Geist Mono|__Geist)/i.test(f) || /Segoe UI|Tahoma|Geeza|Arabic/i.test(f));
    const checks = {
      'shared start edge': m.startOk, 'equal heights in a row': m.unequal.length === 0, 'fonts Geist': fontOk, 'no text < 12 px': m.small.length === 0,
      'no horizontal overflow': m.overflow <= 0, 'no broken images': m.broken.length === 0, 'CLS < 0.02': m.cls < 0.02, 'skeleton shown while loading': m.skeleton,
    };
    const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    failed += bad.length;
    report.push({ page: pg.name, size: `${size.w}×${size.h}`, ...m, checks });
    console.log(`${pg.name} ${size.w}: ${bad.length ? `✗ ${bad.join(', ')}` : '✓ all checks'} · start x ${[...new Set(m.starts)].join('/')} · CLS ${m.cls.toFixed(4)} · page ${m.height} · imgs ${m.images}${m.unequal.length ? ` · unequal ${m.unequal.join('; ')}` : ''}${m.small.length ? ` · small: ${m.small.join('; ')}` : ''}${m.broken.length ? ` · broken ${m.broken.slice(0, 3).join(', ')}` : ''}${m.shifts.length ? ` · shifts ${JSON.stringify(m.shifts)}` : ''} · fonts ${m.fonts.join(', ')}`);
    await ctx.close();
  }
}
await browser.close();
await fs.writeFile(`${out}/acceptance.json`, `${JSON.stringify({ checked: new Date().toISOString(), base, report }, null, 2)}\n`);
process.exitCode = failed ? 1 : 0;
