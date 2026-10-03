// Measures the three QA blockers (and the overflow and top-bar majors) on every prototype, in a real browser.
//   node docs/design/prototypes/measure.mjs            → docs/evidence/redesign-proto/measurements.json + a summary
//
// B1 focus   Tab through the page with the keyboard; for every element that receives focus, read the computed outline
//            (style, width, offset) and compute the ring's contrast against the ground it sits on (the nearest opaque
//            ancestor background; on-art controls: against their black outer band) and against the control itself.
// B2 numbers In Arabic: Arabic-Indic digits inside any element set in IBM Plex Mono (must be 0); shot ids written with
//            Arabic-Indic digits (must be 0); "×" compounds outside an LTR isolate (must be 0).
// B3 floor   Visible text smaller than 12 px (Latin) / 13 px (Arabic script) anywhere; smaller than 13.5 / 14 px inside
//            a workspace page's main content; prototype annotations excluded. Touch targets under 44 px on coarse
//            pointers (widths < 1024), inline links in running text excluded.
// M9         Top bar text over a hero: contrast against the median and the 95th-percentile brightest pixel behind it.
// Overflow   document scrollWidth > viewport width.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.resolve(here, '../../evidence/redesign-proto/measurements.json');
const PAGES = ['system', 'home', 'shows', 'show', 'short', 'music-video', 'characters', 'character', 'studio', 'production', 'shot', 'screening'];
const WIDTHS = [1440, 834, 390];
const LANGS = ['en', 'ar'];
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const browser = await chromium.launch();
const results = [];

for (const p of only.length ? only : PAGES) for (const lang of LANGS) for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : width < 1024 ? 1112 : 900 }, hasTouch: width < 1024, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(path.join(here, `${p}.html`)).href + (lang === 'ar' ? '?lang=ar' : ''), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const r = { page: p, lang, width };

  r.scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);

  // ---- B3 type floor and touch targets; B2 numerals --------------------------------------------------------------
  Object.assign(r, await page.evaluate(({ width, ws }) => {
    const out = { under12: [], underWs: [], smallTargets: [], monoArabicDigits: [], arabicShotIds: [], unisolatedTimes: [] };
    const vis = (e) => { const s = getComputedStyle(e); const b = e.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && b.width > 0 && b.height > 0 && !e.closest('[hidden], .sr'); };
    const desc = (e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''} "${(e.textContent || '').trim().slice(0, 24)}"`;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = n.nodeValue.trim(); const e = n.parentElement;
      if (!t || !e || seen.has(e) || e.closest('.annot, .annot-tag, script, style, svg, .kbd + .kbd')) continue;
      seen.add(e);
      if (!vis(e)) continue;
      const fs = parseFloat(getComputedStyle(e).fontSize);
      const arabic = /[؀-ۿ]/.test(t);
      if (fs < (arabic ? 13 : 12) - 0.01) out.under12.push(`${fs}px ${desc(e)}`);
      if (ws && e.closest('main') && !e.closest('.topbar') && fs < (arabic ? 14 : 13.5) - 0.01 && !e.closest('h1, h2, .t-card, .t-card-sm')) out.underWs.push(`${fs}px ${desc(e)}`);
      const ff = getComputedStyle(e).fontFamily;
      if (/Plex Mono/.test(ff.split(',')[0]) && /[٠-٩]/.test(t)) out.monoArabicDigits.push(desc(e));
      if (/[٠-٩]\.[٠-٩]/.test(t)) out.arabicShotIds.push(desc(e));
      if (/\d\s?×\s?\d/.test(t) && !e.closest('.num-ltr, .ro, [dir="ltr"], .tc, [lang="en"]') && document.documentElement.dir === 'rtl') out.unisolatedTimes.push(desc(e));
    }
    if (width < 1024) {
      for (const e of document.querySelectorAll('a[href], button, [role="radio"], [role="tab"], [role="button"], input, select, textarea')) {
        if (!vis(e) || e.matches('.skip, .link-u') || e.closest('.annot, p, .prose')) continue;
        if (e.closest('a[href], button') !== e && (e.tagName === 'INPUT')) continue;
        const b = e.getBoundingClientRect();
        if (e.matches('.tabs a, .tabs button') && b.height >= 44) continue;   // tabs: 44 high, spaced ≥ 22 px (WCAG spacing exception)
        const target = e.matches('input') ? e.closest('label') ?? e : e;
        const tb = target.getBoundingClientRect();
        if (tb.height < 43.5 || tb.width < 43.5) out.smallTargets.push(`${Math.round(tb.width)}×${Math.round(tb.height)} ${desc(target)}`);
      }
    }
    return out;
  }, { width, ws: ['production', 'shot'].includes(p) }));

  // ---- B1 focus: tab through the page -----------------------------------------------------------------------------
  const focus = { reached: 0, ringed: 0, failures: [], minRingVsGround: 99 };
  const seenFocus = new Set();
  for (let i = 0; i < 160; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      const e = document.activeElement; if (!e || e === document.body) return null;
      const s = getComputedStyle(e);
      const lum = (c) => { const m = c.match(/[\d.]+/g); if (!m) return null; const [r, g, b, a = 1] = m.map(Number); const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return { L: 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b), a }; };
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      let g = e.parentElement; let ground = null;
      while (g) { const c = lum(getComputedStyle(g).backgroundColor); if (c && c.a > 0.9) { ground = c.L; break; } g = g.parentElement; }
      if (ground == null) ground = lum('rgb(10,10,9)').L;
      const ring = lum(s.outlineColor)?.L ?? 0;
      const offset = parseFloat(s.outlineOffset);
      const onArt = /0px 0px 0px 6px/.test(s.boxShadow);
      const vsGround = onArt ? ratio(ring, 0) : ratio(ring, ground);
      const ctl = lum(s.backgroundColor);
      const vsControl = offset >= 2 ? (onArt ? ratio(ring, 0) : vsGround) : (ctl && ctl.a > 0.5 ? ratio(ring, ctl.L) : vsGround);
      if (e.matches('input') && e.closest('.search')) { const ls = getComputedStyle(e.closest('.search')); return { key: e.outerHTML.slice(0, 80), desc: 'label.search (focus-within)', style: ls.outlineStyle, width: parseFloat(ls.outlineWidth), vsGround: ratio(lum(ls.outlineColor).L, ground), vsControl: ratio(lum(ls.outlineColor).L, ground) }; }
      return { key: e.outerHTML.slice(0, 80), desc: `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}`, style: s.outlineStyle, width: parseFloat(s.outlineWidth), vsGround, vsControl };
    });
    if (!f) continue;
    if (seenFocus.has(f.key)) { if (seenFocus.size > 3 && [...seenFocus][0] === f.key) break; continue; }
    seenFocus.add(f.key);
    focus.reached++;
    const ok = f.style !== 'none' && f.width >= 2 && f.vsGround >= 3 && f.vsControl >= 3;
    if (ok) focus.ringed++; else focus.failures.push(`${f.desc} ${f.style} ${f.width}px ground ${f.vsGround.toFixed(2)} control ${f.vsControl.toFixed(2)}`);
    focus.minRingVsGround = Math.min(focus.minRingVsGround, f.vsGround);
  }
  r.focus = focus;

  // ---- M9 top bar over a hero (pixel-sampled) ----------------------------------------------------------------------
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  if (width >= 1024 && (await page.$('.topbar--over'))) {
    const boxes = await page.evaluate(() => [...document.querySelectorAll('.topbar--over .util a.sec, .topbar--over .nav a, .topbar--over .brand b')].map((e) => { const b = e.getBoundingClientRect(); return { text: e.textContent.trim().slice(0, 16), x: b.x, y: b.y, w: b.width, h: b.height, color: getComputedStyle(e).color }; }));
    await page.addStyleTag({ content: '.topbar--over .util a.sec, .topbar--over .nav a, .topbar--over .brand b, .topbar--over .needs { color: transparent !important; background: transparent !important; } .topbar--over .nav a::after { display: none; }' });
    const shot = (await page.screenshot({ clip: { x: 0, y: 0, width, height: 80 } })).toString('base64');
    r.topbar = await page.evaluate(async ({ shot, boxes }) => {
      const img = new Image(); img.src = `data:image/png;base64,${shot}`; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const L = (r, g, b) => 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      return boxes.map((bx) => {
        const d = x.getImageData(Math.round(bx.x), Math.round(bx.y), Math.max(1, Math.round(bx.w)), Math.max(1, Math.round(bx.h))).data;
        const ls = []; for (let i = 0; i < d.length; i += 4) ls.push(L(d[i], d[i + 1], d[i + 2])); ls.sort((a, b) => a - b);
        const m = bx.color.match(/[\d.]+/g).map(Number); const tl = L(m[0], m[1], m[2]);
        return { text: bx.text, median: +ratio(tl, ls[Math.floor(ls.length / 2)]).toFixed(2), worst95: +ratio(tl, ls[Math.floor(ls.length * 0.95)]).toFixed(2) };
      });
    }, { shot, boxes });
  }
  results.push(r);
  await ctx.close();
  const bad = [r.scrollWidth > width && 'overflow', r.under12.length && `under-floor ${r.under12.length}`, r.underWs.length && `under-ws ${r.underWs.length}`, r.smallTargets.length && `targets ${r.smallTargets.length}`, r.monoArabicDigits.length && `mono-AI ${r.monoArabicDigits.length}`, r.arabicShotIds.length && `AI-ids ${r.arabicShotIds.length}`, r.unisolatedTimes.length && `×-unisolated ${r.unisolatedTimes.length}`, r.focus.failures.length && `focus ${r.focus.failures.length}/${r.focus.reached}`, r.topbar && r.topbar.some((t) => t.median < 4.5) && 'topbar<4.5'].filter(Boolean);
  console.log(`${p.padEnd(12)} ${lang} ${String(width).padEnd(4)}  focus ${r.focus.ringed}/${r.focus.reached}  ${bad.length ? 'FAIL ' + bad.join(', ') : 'ok'}${r.topbar ? '  topbar min median ' + Math.min(...r.topbar.map((t) => t.median)) : ''}`);
}
await fs.writeFile(outFile, JSON.stringify(results, null, 1));
await browser.close();
