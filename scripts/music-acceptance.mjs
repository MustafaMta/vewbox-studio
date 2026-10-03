// Music videos acceptance in a real browser (docs/design/PAGE-ENGINEERING-BRIEF.md §4; VISUAL-STANDARD-V5.1 §8):
//
//   node scripts/music-acceptance.mjs [--base http://localhost:4255] [--out dir] [--fixture sample|states|empty|live]
//
// For 1440×900, 1920×1080 and 390×844 it opens the catalogue (/music-videos) and the title page of the most recent
// music video on a throttled network (CDP: 1.5 Mbps, 150 ms latency), screenshots the page while it loads (the
// skeleton) and again when everything has decoded, records every layout shift after the first paint (CLS), and
// measures: the shared start edge; equal tile sizes in a row; the sleeve, the audio row (64) and the lyric column;
// Geist / Geist Mono on every visible text node; no text under 12 px; no horizontal overflow; no picture or frame
// marked unavailable. The live studio has no music videos, so populated layouts come from the capture fixture
// (scripts/lib/capture.mjs answers the browser's own reads and never sends a write). Exit code 1 when a check fails.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { loadFixture, prepare } from './lib/capture.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i === -1 ? dflt : args[i + 1]; };
const base = opt('base', 'http://localhost:4255');
const out = opt('out', 'docs/evidence/music-v1');
const fixtureName = opt('fixture', 'sample');
const fixture = fixtureName === 'live' ? null : await loadFixture(fixtureName);
await fs.mkdir(out, { recursive: true });

const newest = fixture ? [...fixture.state.productions].filter((p) => p.kind === 'MUSIC_VIDEO').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] : null;
const PAGES = [{ name: 'catalogue', path: '/music-videos', root: '.mv-cat:not(.mv-sk)' }, ...(newest ? [{ name: newest.id, path: `/music-videos/${newest.id}`, root: '.mv-page:not(.mv-sk) .mv-head' }] : [])];
const SIZES = [{ w: 1440, h: 900, touch: false }, { w: 1920, h: 1080, touch: false }, { w: 390, h: 844, touch: true }];
const browser = await chromium.launch();
let failed = 0;
const report = [];

for (const size of SIZES) {
  for (const pg of PAGES) {
    // a dev server sometimes leaves the first snapshot hanging: open the page again (three times at most)
    let ctx, page, firstMs;
    for (let attempt = 1; ; attempt++) {
      try {
        ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, colorScheme: 'dark', hasTouch: size.touch, isMobile: size.touch, deviceScaleFactor: 1 });
        page = await ctx.newPage();
        await prepare(page, { fixture });
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.5 * 1024 * 1024) / 8, uploadThroughput: (0.75 * 1024 * 1024) / 8 });
        await page.addInitScript(() => {
          window.__shifts = []; window.__skeleton = false;
          new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shifts.push({ value: e.value, t: Math.round(e.startTime), nodes: (e.sources || []).map((s) => s.node?.className?.toString?.().slice(0, 60) ?? s.node?.nodeName) }); }).observe({ type: 'layout-shift', buffered: true });
          new MutationObserver(() => { if (document.querySelector('.mv-sk')) window.__skeleton = true; }).observe(document, { childList: true, subtree: true });
        });
        const t0 = Date.now();
        await page.goto(`${base}${pg.path}`, { waitUntil: 'commit' });
        await page.waitForSelector('.mv-sk, .mv-cat, .mv-page', { timeout: 120000 });
        await page.screenshot({ path: `${out}/${pg.name}-loading-${size.w}.png` });
        await page.waitForSelector(pg.root, { timeout: 150000 });
        firstMs = Date.now() - t0;
        break;
      } catch (e) {
        await ctx?.close();
        if (attempt >= 3) throw e;
        console.log(`  retrying ${pg.path} at ${size.w}`);
      }
    }
    await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
    await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 120000 }).catch(() => {});
    await page.waitForFunction(() => !document.querySelector('.wave:not([data-ready])') || document.querySelector('.wave-failed'), null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/${pg.name}-${size.w}.png`, fullPage: true });

    const m = await page.evaluate(() => {
      const box = (el) => el.getBoundingClientRect();
      const all = (sel) => [...document.querySelectorAll(sel)];
      const x = (sel) => all(sel).map((e) => Math.round(box(e).left));
      const catalogue = Boolean(document.querySelector('.mv-cat'));
      const starts = catalogue
        ? [...x('.mv-cat-title'), ...x('.mv-cat-desc'), ...all('.mv-grid').map((g) => Math.round(box(g).left)), ...x('.mv-steps')]
        : [...x('.mv-back'), ...x('.mv-sleeve'), ...x('.mv-lyrics .mv-shead'), ...x('.mv-sec-head')];
      // tiles in a row: same top → same width and height
      const tiles = all('.mv-grid > li').map((li) => { const b = box(li); return { top: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; });
      const rows = new Map(); for (const t of tiles) rows.set(t.top, [...(rows.get(t.top) ?? []), t]);
      const rowsEqual = [...rows.values()].every((r) => new Set(r.map((t) => `${t.w}x${t.h}`)).size === 1);
      const fonts = new Set(); const small = [];
      const walker = document.createTreeWalker(document.querySelector('main') ?? document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const n = walker.currentNode; if (!n.textContent.trim()) continue;
        const el = n.parentElement; const cs = getComputedStyle(el); const b = box(el);
        if (b.width === 0 || b.height === 0 || cs.visibility === 'hidden' || el.closest('.sr-only')) continue;
        fonts.add(cs.fontFamily.split(',')[0].replace(/["']/g, '').trim());
        if (parseFloat(cs.fontSize) < 12) small.push(`${parseFloat(cs.fontSize)}px "${n.textContent.trim().slice(0, 30)}"`);
      }
      const imgs = all('main img');
      const sleeve = document.querySelector('.mv-sleeve'); const audio = document.querySelector('.mv-audio'); const lyr = document.querySelector('.mv-lyrics');
      const arabic = all('.mv-line[lang="ar"]').map((p) => getComputedStyle(p).direction);
      return {
        catalogue, starts, startOk: new Set(starts).size === 1,
        tiles: tiles.length, tileSize: tiles[0] ? `${tiles[0].w}×${tiles[0].h}` : null, columns: tiles.length ? [...rows.values()][0].length : 0, rowsEqual,
        fonts: [...fonts], small: small.slice(0, 8),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        images: imgs.length, broken: [...imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')), ...all('main [data-failed]').map((e) => e.getAttribute('aria-label') ?? 'a frame marked unavailable')],
        cls: window.__shifts.reduce((a, s) => a + s.value, 0), shifts: window.__shifts.filter((s) => s.value > 0.001).slice(0, 6), skeleton: window.__skeleton,
        sleeve: sleeve ? `${Math.round(box(sleeve).width)}×${Math.round(box(sleeve).height)}` : null,
        audioH: audio ? Math.round(box(audio).height) : null,
        lyricsW: lyr ? Math.round(box(lyr).width) : null,
        arabicRtl: arabic.length === 0 || arabic.every((d) => d === 'rtl'),
        arabicLines: arabic.length,
      };
    });
    const fontOk = m.fonts.every((f) => /^(Geist|Geist Mono|__Geist)/i.test(f) || /Segoe UI|Tahoma|Geeza|Arabic/i.test(f));
    const checks = {
      'shared start edge': m.startOk,
      'equal tiles in a row': m.rowsEqual,
      'fonts Geist': fontOk,
      'no text < 12 px': m.small.length === 0,
      'no horizontal overflow': m.overflow <= 0,
      'no broken images': m.broken.length === 0,
      'CLS < 0.02': m.cls < 0.02,
      'skeleton shown while loading': m.skeleton,
      ...(m.catalogue ? {} : { 'audio row 64 high': m.audioH === null || m.audioH === 64, 'Arabic lyrics right to left': m.arabicRtl }),
    };
    const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    failed += bad.length;
    report.push({ page: pg.path, size: `${size.w}×${size.h}`, firstMs, ...m, checks });
    console.log(`${pg.path} ${size.w}×${size.h}: ${bad.length ? `✗ ${bad.join(', ')}` : '✓ all checks'} · CLS ${m.cls.toFixed(4)} · start x ${[...new Set(m.starts)].join('/')}${m.catalogue ? ` · ${m.tiles} tiles ${m.tileSize} in ${m.columns} columns` : ` · sleeve ${m.sleeve} · audio ${m.audioH} · lyrics ${m.lyricsW} · Arabic lines ${m.arabicLines}`} · fonts ${m.fonts.join(', ')}${m.small.length ? ` · small: ${m.small.join('; ')}` : ''}${m.shifts.length ? ` · shifts: ${JSON.stringify(m.shifts)}` : ''}`);
    await ctx.close();
  }
}
await browser.close();
await fs.writeFile(`${out}/acceptance-${fixtureName}.json`, `${JSON.stringify({ checked: new Date().toISOString(), base, fixture: fixtureName, report }, null, 2)}\n`);
process.exitCode = failed ? 1 : 0;
