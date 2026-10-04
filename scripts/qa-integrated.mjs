// Integrated design QA of the whole studio in a real browser (docs/design/DESIGN-QA-INTEGRATED-2026-10-04.md;
// the standard is docs/design/VISUAL-STANDARD-V5.1.md §8 and docs/design/PAGE-ENGINEERING-BRIEF.md §4):
//
//   node scripts/qa-integrated.mjs [--base http://localhost:4261] [--out docs/evidence/design-qa-integrated]
//        [--widths 1440,1920,390] [--only home,short,...] [--resume] [--pages | --interactions | --krea | --annotate <file.json>]
//
// Pages (default --pages + --interactions): every route of the studio, live where the studio has the object and on
// the `states` fixture (scripts/v4-fixture.ts, answering the browser's own reads) where it has none — shows, a show, a
// season, an episode lobby, the music videos and a music video. For each page and width it:
//   1. opens the page on a throttled network (CDP, 1.5 Mbps / 150 ms) and screenshots the skeleton the moment one is
//      drawn (<name>-<w>-skeleton.png), then the loaded first screen (<name>-<w>-first.png) and the full page
//      (<name>-<w>.png), and composes skeleton | loaded | overlay (<name>-<w>-skeleton-vs-loaded.png);
//   2. records every layout shift after the first paint (CLS) and the skeleton's height against the loaded page's;
//   3. measures: the shared start edge (page title, section heads, cards, grids), equal heights in every grid/flex
//      row, the font family of every visible text node (Geist / Geist Mono; system sans only for Arabic content),
//      text under 12 px, uppercase text, horizontal overflow, broken or unavailable pictures, WCAG AA contrast of
//      every text node on its own ground (text on art is skipped), the radius family, borders and shadows on cards,
//      outlined buttons, Arabic glyphs outside content containers (English-only interface), content names on their
//      frame's start edge, progress bars and the first 40 Tab stops (a visible focus ring on each); at 390 every
//      control's hit area (≥ 44 px).
// Interactions (--interactions): the sidebar collapse (button and Ctrl+\), the command palette (Ctrl+K, typing, Esc,
//   focus return), the New menus, dialogs (Esc, focus return), shelf arrows, the phone bottom bar and More sheet, the
//   player transports, the Screening Room notes composer (the write goes to THIS server's database), search and
//   filters, the creation flows' validation. Results in interactions.json with screenshots.
// --krea captures the producer's reference (https://www.krea.ai, app view) with a desktop Chrome user agent.
// --annotate draws red boxes on a capture (a JSON list of { src, out, clip:[x,y,w,h], boxes:[[x,y,w,h,label]] }).
// Read only against the studio: every write to /api/* is refused in the page (scripts/lib/capture.mjs) except, in the
// interactions, the Screening Room note, which is sent to the server under --base (never the live studio on :4200).
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadFixture, prepare } from './lib/capture.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i === -1 ? dflt : args[i + 1]; };
const flag = (name) => args.includes(`--${name}`);
const base = opt('base', 'http://localhost:4261');
const out = opt('out', 'docs/evidence/design-qa-integrated');
const widths = opt('widths', '1440,1920,390').split(',').map(Number);
const only = opt('only', '') ? opt('only', '').split(',') : null;
const doPages = flag('pages') || (!flag('interactions') && !flag('krea') && !flag('annotate'));
const doInteractions = flag('interactions') || (!flag('pages') && !flag('krea') && !flag('annotate'));
await fs.mkdir(out, { recursive: true });

const SHORT = 'short-28bdb3342b';
const SHOT = 'shot-24bf719d21';
const CHAR_EN = 'char-56c47abc59';   // Elias Moore
const CHAR_AR = 'char-bc112248bf';   // أبو سلام
const CHAR_DRAFT = 'char-9b904cf79c'; // Hana Mori, awaiting approval
const LOC = 'loc-cde19129ca';

/** Every page of the review. `fixture` pages answer the browser's reads from the `states` fixture. */
export const PAGES = [
  { name: 'home', path: '/' },
  { name: 'shows-live', path: '/shows' },
  { name: 'shows', path: '/shows', fixture: true },
  { name: 'show', path: '/shows/last-sip', fixture: true },
  { name: 'season', path: '/shows/last-sip/seasons/last-sip-s1', fixture: true },
  { name: 'episode', path: '/shows/last-sip/seasons/last-sip-s1/episodes/s1e1', fixture: true },
  { name: 'shorts', path: '/shorts' },
  { name: 'short', path: `/shorts/${SHORT}` },
  { name: 'music-videos-live', path: '/music-videos' },
  { name: 'music-videos', path: '/music-videos', fixture: true },
  { name: 'music-video', path: '/music-videos/river-lights', fixture: true },
  { name: 'characters', path: '/characters' },
  { name: 'character-en', path: `/characters/${CHAR_EN}` },
  { name: 'character-ar', path: `/characters/${CHAR_AR}` },
  { name: 'character-draft', path: `/characters/${CHAR_DRAFT}` },
  { name: 'character-new-auto', path: '/characters/new' },
  { name: 'character-new-manual', path: '/characters/new?start=sheet' },
  { name: 'character-new-picture', path: '/characters/new?start=picture' },
  { name: 'locations', path: '/locations' },
  { name: 'location', path: `/locations/${LOC}` },
  { name: 'location-new', path: '/locations/new' },
  { name: 'new', path: '/new' },
  { name: 'new-short-auto', path: '/new/short?mode=auto' },
  { name: 'new-short-manual', path: '/new/short?mode=manual' },
  { name: 'new-show', path: '/new/show' },
  { name: 'new-music-video', path: '/new/music-video' },
  { name: 'workspace', path: `/shorts/${SHORT}/production` },
  { name: 'shot', path: `/shorts/${SHORT}/shots/${SHOT}` },
  { name: 'screening-film', path: `/screening?p=${SHORT}` },
  { name: 'screening', path: '/screening' },
  { name: 'studio', path: '/studio' },
  { name: 'department', path: '/studio/departments/CASTING' },
  { name: 'agent', path: '/studio/agents/casting-director' },
  { name: 'production', path: '/production' },
  { name: 'engine-room', path: '/production#engine-room' },
  { name: 'settings', path: '/settings' },
  { name: 'assets', path: '/assets' },
  { name: 'kit', path: '/kit' },
];

const SIZE = { 1440: { w: 1440, h: 900, touch: false }, 1920: { w: 1920, h: 1080, touch: false }, 390: { w: 390, h: 844, touch: true } };
const THROTTLE = { offline: false, latency: 150, downloadThroughput: (1.5 * 1024 * 1024) / 8, uploadThroughput: (0.75 * 1024 * 1024) / 8 };
// loaded = the page's own content, held for 800 ms: no busy region, no skeleton primitive, no skeleton class in main
// (the kit page keeps specimen skeletons on purpose: its own readiness is its title)
const LOADED = () => {
  const main = document.querySelector('main');
  if (!main) return false;
  // hydrated: React has attached its fiber to the DOM. Before that the server-rendered page is a picture that React
  // replaces when the bundle arrives (on a slow network the swap comes 40 s later and redraws the skeleton).
  if (!Object.keys(main).some((k) => k.startsWith('__reactFiber'))) { window.__loadedSince = 0; return false; }
  const kit = /^\/kit/.test(location.pathname);
  const bare = () => !/Reconnecting/.test(document.body.innerText) && (kit ? Boolean(main.querySelector('h1')) : !main.querySelector('[aria-busy="true"], .sk, .shell-skeleton, [class*="skeleton"]') && main.innerText.trim().length > 20);
  if (!bare()) { window.__loadedSince = 0; return false; }
  const now = performance.now();
  if (!window.__loadedSince) { window.__loadedSince = now; return false; }
  return now - window.__loadedSince > 800;
};
// after the scroll, a lazy picture may still show its own placeholder (.sk inside a .frame): that is the image state,
// not the page's skeleton, so only a busy region or a page skeleton counts as "came back"
const STILL_LOADED = () => { const main = document.querySelector('main'); return Boolean(main) && (/^\/kit/.test(location.pathname) || !main.querySelector('[aria-busy="true"], .shell-skeleton, [class*="-skeleton"]')); };

// ---- the measurements, run inside the loaded page -------------------------------------------------------------------
const MEASURE = (touch) => {
  const main = document.querySelector('main');
  const vis = (e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('.sr-only, [hidden], [aria-hidden="true"] .sr-only'); };
  const R = (n) => Math.round(n);
  const name = (e) => (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 48);
  const sig = (e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`;

  // --- the start edge: the page's title, every section head, card, tile and grid in main
  const mainBox = main.getBoundingClientRect();
  const mainPad = parseFloat(getComputedStyle(main).paddingLeft);
  const contentLeft = R(mainBox.left + mainPad);
  const container = main.querySelector('[class*="page"], .home, .shows, .create, .theatre, .co, .cast, .pc, .studio') ?? main;
  const edgeSel = 'h1, h2, .shead, .section-head, .page-head, .card, .mtile, .fcard, .mcard, .pcard, .shelf, .shelf-track, .grid, [class*="-grid"], [class*="-head"], form, .notice, .panel';
  const edges = {};
  for (const e of main.querySelectorAll(edgeSel)) {
    if (!vis(e)) continue;
    if (e.closest('.card, .mtile, .fcard, .mcard, .pcard, .shelf-track, dialog, .ptransport')) continue; // inside a box: its own inset
    const l = R(e.getBoundingClientRect().left);
    (edges[l] ??= []).push(sig(e) + (e.matches('h1,h2') ? ` "${name(e).slice(0, 24)}"` : ''));
  }
  const edgeKeys = Object.keys(edges).map(Number).sort((a, b) => a - b);
  const headLefts = [...new Set([...main.querySelectorAll('h1, h2, .shead')].filter(vis).filter((e) => !e.closest('.card, dialog, .mtile, .fcard')).map((e) => R(e.getBoundingClientRect().left)))];

  // --- equal heights in rows: every grid or wrapping flex container with ≥ 2 visible children
  const rows = [];
  for (const g of main.querySelectorAll('*')) {
    const cs = getComputedStyle(g);
    if (!(cs.display === 'grid' || (cs.display === 'flex' && cs.flexWrap === 'wrap') || g.classList.contains('shelf-track'))) continue;
    const kids = [...g.children].filter(vis);
    if (kids.length < 2) continue;
    // a row of like things (tiles, cards, steps): the children share a class; a stage of different panels is not a row
    const first = (k) => (k.querySelector('.card, .mtile, .fcard, .mcard, .pcard, .tool-card, [class*="-tile"], [class*="-card"]') ?? k).className?.toString().split(/\s+/)[0] ?? '';
    if (new Set(kids.map(first)).size !== 1) continue;
    const byTop = new Map();
    for (const k of kids) { const b = k.getBoundingClientRect(); const t = R(b.top); byTop.set(t, [...(byTop.get(t) ?? []), R(b.height)]); }
    for (const [top, hs] of byTop) if (hs.length > 1 && new Set(hs).size > 1) rows.push({ grid: sig(g), top, heights: hs });
  }

  // --- text: fonts, floors, uppercase, contrast, Arabic outside content containers
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const ground = (el) => {
    // the ground under a text node: ancestors' backgrounds composited from the nearest opaque one; null when a picture lies under it
    const layers = []; let e = el;
    while (e && e !== document.documentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage !== 'none' && !/gradient/.test(cs.backgroundImage)) return null;
      if (e.matches('.frame, [class*="frame"], figure, .iplayer-box, .theatre-stage, .poster, [class*="poster"], .fcard-frame, .mcard-media') && e.querySelector('img, video, canvas')) return null;
      const bg = parse(cs.backgroundColor);
      if (bg && bg.a > 0) { layers.push(bg); if (bg.a >= 1) break; }
      if (/gradient/.test(cs.backgroundImage)) return null;
      e = e.parentElement;
    }
    let g = { r: 16, g: 16, b: 16, a: 1 }; // --bg-page
    const bodyBg = parse(getComputedStyle(document.body).backgroundColor); if (bodyBg && bodyBg.a >= 1) g = bodyBg;
    for (const l of layers.reverse()) g = over(l, g);
    return g;
  };
  const fonts = {}; const small = []; const upper = []; const contrast = []; const arabicUi = []; let textNodes = 0; const onArt = [];
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  const seenC = new Set();
  while (walker.nextNode()) {
    const n = walker.currentNode; const txt = n.textContent.trim(); if (!txt) continue;
    const el = n.parentElement; if (!el || !vis(el)) continue;
    if (el.closest('script, style, noscript, .sr-only')) continue;
    textNodes++;
    const cs = getComputedStyle(el);
    const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    fonts[fam] = (fonts[fam] ?? 0) + 1;
    const fs = parseFloat(cs.fontSize);
    if (fs < 12) small.push(`${fs}px ${sig(el)} "${txt.slice(0, 30)}"`);
    if (cs.textTransform === 'uppercase') upper.push(`${sig(el)} "${txt.slice(0, 30)}"`);
    if (/[؀-ۿ]/.test(txt) && !el.closest('bdi, [dir="auto"], [lang="ar"], .name, .content-para, [class*="lyric"], [class*="dialogue"], [class*="line-text"], blockquote, input, textarea')) arabicUi.push(`${sig(el)} "${txt.slice(0, 30)}"`);
    const fg = parse(cs.color); const bg = ground(el);
    if (fg && bg) {
      const fgc = fg.a < 1 ? over(fg, bg) : fg;
      const r = ratio(fgc, bg);
      const bold = parseInt(cs.fontWeight, 10) >= 600;
      const large = fs >= 24 || (fs >= 18.66 && bold);
      const need = large ? 3 : 4.5;
      const key = `${cs.color}|${sig(el)}`;
      if (r < need && !seenC.has(key)) { seenC.add(key); contrast.push({ el: sig(el), text: txt.slice(0, 36), fg: cs.color, bg: `rgb(${R(bg.r)}, ${R(bg.g)}, ${R(bg.b)})`, ratio: Math.round(r * 100) / 100, need, size: fs, disabled: cs.color === 'rgb(90, 90, 88)' || el.closest('[disabled], [aria-disabled="true"]') != null }); }
    } else if (fg && !bg) onArt.push(`${sig(el)} "${txt.slice(0, 24)}"`);
  }

  // --- pictures
  const imgs = [...main.querySelectorAll('img')];
  const broken = imgs.filter((i) => vis(i) && i.complete && i.naturalWidth === 0).map((i) => (i.getAttribute('src') ?? '').slice(0, 80));
  const unavailable = [...main.querySelectorAll('[data-failed]')].map((e) => e.getAttribute('aria-label') ?? sig(e));
  const notDecoded = imgs.filter((i) => vis(i) && !i.complete).length;
  const faded = imgs.filter((i) => vis(i) && parseFloat(getComputedStyle(i).opacity) < 0.99).length;

  // --- radii, cards, buttons
  const allowed = (px, h, w) => px === 0 || px === 6 || px === 8 || px === 10 || px === 14 || px === 20 || px >= 999 || Math.abs(px - Math.min(h, w) / 2) <= 1 || px === 1 || px === 2 || px === 3 || px === 4;
  const radii = {}; const cardBorders = []; const cardShadows = []; const outlined = [];
  for (const e of main.querySelectorAll('*')) {
    if (!vis(e) || e.closest('svg')) continue;
    const cs = getComputedStyle(e);
    const bg = parse(cs.backgroundColor);
    const boxed = (bg && bg.a > 0) || parseFloat(cs.borderTopWidth) > 0 || cs.overflow === 'hidden';
    if (boxed) {
      const px = parseFloat(cs.borderTopLeftRadius); const b = e.getBoundingClientRect();
      if (!Number.isNaN(px) && !allowed(px, b.height, b.width) && !/%/.test(cs.borderTopLeftRadius)) { const k = `${px}px`; (radii[k] ??= []).length < 4 && radii[k].push(sig(e)); }
    }
    if (e.classList.contains('card')) {
      if (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none') cardBorders.push(sig(e));
      if (cs.boxShadow !== 'none') cardShadows.push(sig(e));
    }
    if (e.classList.contains('btn') && parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none') outlined.push(`${sig(e)} "${name(e).slice(0, 20)}"`);
  }

  // --- names on their frame's start edge (§4.4, §8.7)
  const nameMis = [];
  for (const nm of main.querySelectorAll('.name, .fcard-name, .mtile-name, .mcard-name')) {
    if (!vis(nm)) continue;
    const box = nm.closest('a, li, article, .card, .mtile, .fcard, .mcard'); if (!box) continue;
    const frame = box.querySelector('.frame, [class*="-frame"], .mcard-media, img'); if (!frame || !vis(frame)) continue;
    if (frame.contains(nm) || nm.closest('.scrim, [class*="scrim"], [class*="overlay"]')) continue; // words over the poster scrim sit inside the frame by design
    const fb = frame.getBoundingClientRect(); const nb = nm.getBoundingClientRect();
    if (nb.top < fb.bottom - 2) continue; // the words lie on the picture (poster and sleeve cards): inset by design, not a misalignment
    const dl = R(nm.getBoundingClientRect().left) - R(frame.getBoundingClientRect().left);
    if (dl !== 0) nameMis.push({ name: name(nm).slice(0, 24), dx: dl });
  }

  // --- things that may pretend
  const progress = [...main.querySelectorAll('[role="progressbar"], progress, .progress, [class*="progress"]')].filter(vis).map((e) => `${sig(e)} ${e.getAttribute('aria-valuenow') ?? ''} ${name(e).slice(0, 30)}`);
  const truncated = [...main.querySelectorAll('*')].filter((e) => vis(e) && getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1).map((e) => `${sig(e)} "${name(e).slice(0, 40)}"`).slice(0, 10);
  const clamped = [...main.querySelectorAll('*')].filter((e) => vis(e) && getComputedStyle(e).webkitLineClamp !== 'none' && e.scrollHeight > e.clientHeight + 2).map((e) => `${sig(e)} "${name(e).slice(0, 40)}"`).slice(0, 10);
  const disabledNoReason = [...main.querySelectorAll('button[disabled], a[aria-disabled="true"], [role="button"][aria-disabled="true"]')].filter(vis).filter((e) => !e.getAttribute('title') && !e.getAttribute('aria-describedby') && !e.closest('[title]')).map((e) => `${sig(e)} "${name(e).slice(0, 30)}"`).slice(0, 10);

  // --- touch targets (coarse pointer)
  const targets = [];
  if (touch) {
    for (const e of main.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [role="tab"], [role="radio"], [role="slider"], [role="option"], [role="menuitem"]')) {
      if (!vis(e)) continue; if (e.type === 'hidden') continue;
      const b = e.getBoundingClientRect();
      // an inline link inside prose is exempt (its line box is the target); everything else must be 44
      if (e.matches('p a, .t-body a, .t-meta a, li.t-meta a, .t-prose a')) continue;
      if (b.width < 44 || b.height < 44) targets.push({ el: sig(e), name: name(e).slice(0, 30), w: R(b.width), h: R(b.height) });
    }
    for (const e of document.querySelectorAll('.bottom-nav a, .bottom-nav button, .phone-bar a, .phone-bar button')) { if (!vis(e)) continue; const b = e.getBoundingClientRect(); if (b.width < 44 || b.height < 44) targets.push({ el: sig(e), name: name(e).slice(0, 30), w: R(b.width), h: R(b.height), bar: true }); }
  }

  // --- the frame
  const nav = document.querySelector('.shell-nav'); const bottom = document.querySelector('.bottom-nav'); const top = document.querySelector('.phone-bar');
  return {
    title: document.title, h1: name(main.querySelector('h1') ?? main).slice(0, 60),
    contentLeft, contentWidth: R(mainBox.width - 2 * mainPad), mainHeight: R(main.scrollHeight), pageHeight: document.documentElement.scrollHeight,
    sidebar: nav && vis(nav) ? R(nav.getBoundingClientRect().width) : 0, bottomBar: bottom && vis(bottom) ? R(bottom.getBoundingClientRect().height) : 0, topBar: top && vis(top) ? R(top.getBoundingClientRect().height) : 0,
    edges, edgeKeys, headLefts, rows: rows.slice(0, 12), container: sig(container),
    textNodes, fonts, small: small.slice(0, 12), upper: upper.slice(0, 8), contrast: contrast.slice(0, 16), onArt: onArt.length, arabicUi: arabicUi.slice(0, 8),
    images: imgs.filter(vis).length, broken: broken.slice(0, 6), unavailable: unavailable.slice(0, 6), notDecoded, faded,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    radii, cardBorders: cardBorders.slice(0, 6), cardShadows: cardShadows.slice(0, 6), outlined: outlined.slice(0, 6),
    nameMis: nameMis.slice(0, 8), progress, truncated, clamped, disabledNoReason, targets: targets.slice(0, 40), targetsTotal: targets.length,
    cls: (window.__shifts ?? []).reduce((a, s) => a + s.value, 0), shifts: (window.__shifts ?? []).filter((s) => s.value > 0.001).slice(0, 6),
  };
};

/** Tab through the first 40 stops and record each one's focus indicator. */
async function tabStops(page, n = 40) {
  await page.evaluate(() => { window.scrollTo(0, 0); document.body.focus?.(); if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); });
  const stops = []; let firstMain = -1;
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab');
    const s = await page.evaluate(() => {
      const e = document.activeElement; if (!e || e === document.body) return { tag: 'body' };
      const cs = getComputedStyle(e); const b = e.getBoundingClientRect();
      const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow !== 'none' && /px/.test(cs.boxShadow));
      // a ring drawn by a wrapper that carries the focus (data-focus-inset) counts
      const wrap = e.closest('[data-focus-inset]'); const wcs = wrap ? getComputedStyle(wrap) : null;
      const wrapRing = wcs ? (wcs.outlineStyle !== 'none' && parseFloat(wcs.outlineWidth) > 0) || (wcs.boxShadow !== 'none') : false;
      const sig = `${e.tagName.toLowerCase()}${typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`;
      return { tag: sig, name: (e.getAttribute('aria-label') || e.textContent || e.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 40), ring: ring || wrapRing, outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, offset: cs.outlineOffset, visible: b.width > 0 && b.height > 0, inMain: Boolean(e.closest('main')), w: Math.round(b.width), h: Math.round(b.height) };
    });
    stops.push(s);
    if (s.inMain && firstMain === -1) firstMain = i;
    if (s.tag === 'body' && i > 0) break;
  }
  return { stops, firstMain };
}

/** Compose two viewport captures (skeleton | loaded | 50 % overlay) into one picture. */
async function compose(browser, left, right, file, w, h, labels) {
  const [a, b] = await Promise.all([fs.readFile(left).catch(() => null), fs.readFile(right).catch(() => null)]);
  if (!a || !b) return;
  const gap = 24; const W = w * 3 + gap * 4; const H = h + 48 + gap * 2;
  const ctx = await browser.newContext({ viewport: { width: Math.min(W, 6000), height: Math.min(H, 4000) }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const img = (buf) => `data:image/png;base64,${buf.toString('base64')}`;
  await page.setContent(`<html><body style="margin:0;background:#2a2a2a;font:500 14px system-ui;color:#fff">
    <div style="display:flex;gap:${gap}px;padding:${gap}px">
      ${[[labels[0], img(a)], [labels[1], img(b)]].map(([l, s]) => `<figure style="margin:0"><figcaption style="height:40px;line-height:40px">${l}</figcaption><img src="${s}" style="width:${w}px;height:${h}px;display:block;outline:1px solid #555"></figure>`).join('')}
      <figure style="margin:0"><figcaption style="height:40px;line-height:40px">overlay (skeleton at 50 % over loaded)</figcaption><div style="position:relative;width:${w}px;height:${h}px;outline:1px solid #555"><img src="${img(b)}" style="position:absolute;inset:0;width:${w}px;height:${h}px"><img src="${img(a)}" style="position:absolute;inset:0;width:${w}px;height:${h}px;opacity:.5;mix-blend-mode:screen"></div></figure>
    </div></body></html>`);
  await page.screenshot({ path: file, fullPage: true });
  await ctx.close();
}

/** Red boxes on a capture (the annotated crops of the defect list). */
async function annotate(browser, jobs) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const j of jobs) {
    const buf = await fs.readFile(j.src);
    const [cx, cy, cw, ch] = j.clip ?? [0, 0, 1600, 1200];
    await page.setViewportSize({ width: cw, height: ch });
    await page.setContent(`<html><body style="margin:0;background:#000"><div style="position:relative;width:${cw}px;height:${ch}px;overflow:hidden">
      <img src="data:image/png;base64,${buf.toString('base64')}" style="position:absolute;left:${-cx}px;top:${-cy}px;display:block">
      ${(j.boxes ?? []).map(([x, y, w, h, label]) => `<div style="position:absolute;left:${x - cx}px;top:${y - cy}px;width:${w}px;height:${h}px;outline:3px solid #ff2d2d;box-shadow:0 0 0 2px #000"></div><div style="position:absolute;left:${x - cx}px;top:${Math.max(0, y - cy - 26)}px;background:#ff2d2d;color:#fff;font:600 13px system-ui;padding:3px 8px;border-radius:4px;white-space:nowrap">${label}</div>`).join('')}
    </div></body></html>`);
    await page.screenshot({ path: j.out, fullPage: false });
    console.log(`annotated → ${j.out}`);
  }
  await ctx.close();
}

// ---- pages ----------------------------------------------------------------------------------------------------------
async function runPages(browser) {
  const fixture = await loadFixture('states');
  const pages = PAGES.filter((p) => !only || only.includes(p.name));
  // warm the dev server (each route compiles once) so the throttled loads measure the page, not the compiler
  {
    const ctx = await browser.newContext(); const page = await ctx.newPage(); await prepare(page, { fixture: null });
    for (const pg of pages) { await page.goto(`${base}${pg.path}`, { waitUntil: 'domcontentloaded' }).catch(() => {}); await page.waitForFunction(LOADED, null, { timeout: 180_000 }).catch(() => console.log(`  warm-up: ${pg.name} never loaded`)); }
    await page.unrouteAll({ behavior: 'ignoreErrors' }); await ctx.close();
  }
  // one report per run; a single-width run names it by the width so three widths can run side by side. The report is
  // written after every page, and --resume skips the pages it already holds (a run that dies loses one page, not all).
  const file = path.join(out, widths.length === 1 ? `report-${widths[0]}.json` : 'report.json');
  const report = flag('resume') ? await fs.readFile(file, 'utf8').then((t) => JSON.parse(t).report.filter((r) => !r.error)).catch(() => []) : [];
  const save = () => fs.writeFile(file, `${JSON.stringify({ checked: new Date().toISOString(), base, report }, null, 2)}\n`);
  for (const width of widths) {
    const size = SIZE[width];
    for (const pg of pages) {
      const tag = `${pg.name}-${width}`;
      if (report.some((r) => r.page === pg.name && r.width === width)) { console.log(`${tag}: kept from the earlier run`); continue; }
      for (let attempt = 1; attempt <= 3; attempt++) {
        const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, colorScheme: 'dark', hasTouch: size.touch, isMobile: size.touch, deviceScaleFactor: 1 });
        const page = await ctx.newPage();
        try {
          await prepare(page, { fixture: pg.fixture ? fixture : null });
          const cdp = await ctx.newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', THROTTLE);
          await page.addInitScript(() => {
            window.__shifts = [];
            new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shifts.push({ value: Math.round(e.value * 10000) / 10000, t: Math.round(e.startTime), nodes: (e.sources || []).map((s) => (typeof s.node?.className === 'string' ? s.node.className : s.node?.nodeName)?.toString().slice(0, 50)) }); }).observe({ type: 'layout-shift', buffered: true });
            window.__skel = null; window.__seq = [];
            const look = () => {
              const m = document.querySelector('main'); if (!m) return;
              const sk = m.querySelectorAll('.sk, .shell-skeleton, [aria-busy="true"]');
              if (sk.length && !window.__skel) window.__skel = { at: Math.round(performance.now()), parts: sk.length, height: m.scrollHeight, generic: Boolean(m.querySelector('.shell-skeleton')), label: m.querySelector('[aria-busy="true"]')?.getAttribute('aria-label') ?? '' };
              // the sequence of loading pictures: generic shell skeleton · the page's own skeleton · content
              const state = m.querySelector('.shell-skeleton') ? 'shell' : m.querySelector('[aria-busy="true"], .sk') ? 'page' : m.innerText.trim().length > 20 ? 'content' : 'empty';
              if (window.__seq[window.__seq.length - 1]?.state !== state) window.__seq.push({ t: Math.round(performance.now()), state, height: m.scrollHeight });
            };
            new MutationObserver(look).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-busy', 'class'] });
          });
          const t0 = Date.now();
          await page.goto(`${base}${pg.path}`, { waitUntil: 'commit' });
          await page.waitForSelector('main', { timeout: 120_000 });
          // the skeleton: the first moment one is drawn (up to 4 s), else the first paint of main
          await page.waitForFunction(() => document.querySelector('main .sk, main .shell-skeleton, main [aria-busy="true"]'), null, { timeout: 4000 }).catch(() => {});
          await page.screenshot({ path: path.join(out, `${tag}-skeleton.png`) });
          const skel = await page.evaluate(() => window.__skel);
          await page.waitForFunction(LOADED, null, { timeout: 240_000 });
          const loadedMs = Date.now() - t0;
          await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 100)); } window.scrollTo(0, 0); });
          await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 120_000 }).catch(() => {});
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(1200);
          if (!(await page.evaluate(STILL_LOADED))) throw new Error('the skeleton came back after the page had loaded (stream reconnect?)');
          await page.screenshot({ path: path.join(out, `${tag}-first.png`) });
          await page.screenshot({ path: path.join(out, `${tag}.png`), fullPage: true });
          const m = await page.evaluate(MEASURE, size.touch);
          const seq = await page.evaluate(() => window.__seq);
          const focus = width === 390 ? { stops: [], firstMain: -1 } : await tabStops(page, 40);
          if (width === 1440 && focus.firstMain >= 0) {
            // the ring on the first stop inside the page, as evidence
            await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
            for (let i = 0; i <= focus.firstMain + 2 && i < 40; i++) await page.keyboard.press('Tab');
            await page.evaluate(() => document.activeElement?.scrollIntoView?.({ block: 'center' }));
            await page.screenshot({ path: path.join(out, `${tag}-focus.png`) });
          }
          await page.unrouteAll({ behavior: 'ignoreErrors' }); await ctx.close();
          await compose(browser, path.join(out, `${tag}-skeleton.png`), path.join(out, `${tag}-first.png`), path.join(out, `${tag}-skeleton-vs-loaded.png`), size.w, size.h, [`skeleton (${skel ? `${skel.parts} parts${skel.generic ? ', generic shell skeleton' : ''}` : 'none seen'})`, `loaded (${loadedMs} ms on 1.5 Mbps)`]);
          const fontOk = Object.keys(m.fonts).every((f) => /^(Geist|Geist Mono|__Geist|geist)/i.test(f) || /Segoe UI|Tahoma|Geeza|Arabic|system-ui/i.test(f));
          const noRing = focus.stops.filter((s) => s.tag !== 'body' && !s.ring);
          const hiddenStops = focus.stops.filter((s) => s.tag !== 'body' && !s.visible);
          const contrastBad = m.contrast.filter((c) => !c.disabled);
          const checks = {
            'skeleton seen': Boolean(skel),
            'page skeleton (not the generic shell)': Boolean(skel) && !skel.generic,
            'one loading picture, then content': seq.filter((s) => s.state !== 'empty').map((s) => s.state).join('>') === 'page>content',
            'CLS < 0.02': m.cls < 0.02,
            'one start edge for heads': m.headLefts.length <= 1,
            'equal heights in rows': m.rows.length === 0,
            'fonts Geist': fontOk,
            'no text < 12 px': m.small.length === 0,
            'no uppercase': m.upper.length === 0,
            'no horizontal overflow': m.overflow <= 0,
            'no broken pictures': m.broken.length === 0 && m.unavailable.length === 0,
            'contrast AA': contrastBad.length === 0,
            'radius family': Object.keys(m.radii).length === 0,
            'cards: no border, no shadow': m.cardBorders.length === 0 && m.cardShadows.length === 0,
            'no outlined buttons': m.outlined.length === 0,
            'English-only interface': m.arabicUi.length === 0,
            'names on the frame edge': m.nameMis.length === 0,
            ...(width !== 390 ? { 'focus ring on every stop': noRing.length === 0 && hiddenStops.length === 0 } : { 'touch targets ≥ 44': m.targetsTotal === 0 }),
          };
          const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
          report.push({ page: pg.name, path: pg.path, fixture: Boolean(pg.fixture), width, loadedMs, skeleton: skel, sequence: seq, ...m, focus: { firstMain: focus.firstMain, count: focus.stops.filter((s) => s.tag !== 'body').length, noRing: noRing.slice(0, 10), hidden: hiddenStops.slice(0, 6), stops: focus.stops }, checks, bad });
          await save();
          console.log(`${tag}: ${bad.length ? `✗ ${bad.join(' · ')}` : '✓'} · ${loadedMs} ms · ${seq.map((s) => `${s.state}@${s.t}`).join('>')} · CLS ${m.cls.toFixed(4)} · edge ${m.contentLeft} (heads ${m.headLefts.join('/')}) · content ${m.contentWidth} · images ${m.images}${m.broken.length || m.unavailable.length ? ` · broken ${[...m.broken, ...m.unavailable].slice(0, 2).join(', ')}` : ''}${m.small.length ? ` · small ${m.small.slice(0, 2).join('; ')}` : ''}${contrastBad.length ? ` · contrast ${contrastBad.slice(0, 2).map((c) => `${c.ratio}:1 ${c.el} "${c.text}"`).join('; ')}` : ''}${noRing.length ? ` · no ring ${noRing.slice(0, 3).map((s) => s.tag).join(', ')}` : ''}${m.targetsTotal ? ` · small targets ${m.targetsTotal}` : ''}${m.rows.length ? ` · rows ${JSON.stringify(m.rows.slice(0, 2))}` : ''}${m.shifts.length ? ` · shifts ${JSON.stringify(m.shifts.slice(0, 2))}` : ''}`);
          break;
        } catch (e) {
          await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {}); await ctx.close().catch(() => {});
          if (attempt === 3) { report.push({ page: pg.name, path: pg.path, width, error: e.message.split('\n')[0] }); await save(); console.log(`${tag}: ✗ never ready (${e.message.split('\n')[0]})`); }
          else console.log(`  retrying ${tag}`);
        }
      }
    }
  }
  await save();
  const failed = report.filter((r) => r.error || r.bad?.length).length;
  console.log(`\n${report.length} page captures, ${failed} with a failed check → ${file}`);
}

// ---- interactions ---------------------------------------------------------------------------------------------------
async function runInteractions(browser) {
  const results = [];
  const shot = (page, name) => page.screenshot({ path: path.join(out, `ix-${name}.png`) });
  const step = async (name, fn) => { try { const note = await fn(); results.push({ step: name, ok: true, note }); console.log(`  ✓ ${name}${note ? ` — ${note}` : ''}`); } catch (e) { results.push({ step: name, ok: false, note: e.message.split('\n')[0].slice(0, 200) }); console.log(`  ✗ ${name} — ${e.message.split('\n')[0].slice(0, 200)}`); } };
  const open = async (page, p) => { await page.goto(`${base}${p}`, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(LOADED, null, { timeout: 180_000 }); await page.waitForTimeout(600); };
  const focusSig = (page) => page.evaluate(() => { const e = document.activeElement; return e ? `${e.tagName.toLowerCase()}${typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/)[0] : ''} "${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30)}"` : 'none'; });
  const width = (page, sel) => page.evaluate((s) => Math.round(document.querySelector(s)?.getBoundingClientRect().width ?? 0), sel);

  // desktop, live, writes refused except the Screening Room note (sent to THIS base)
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => results.push({ step: 'page error', ok: false, note: e.message.slice(0, 160) }));
    await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'nextjs-portal{display:none!important}'; document.head.append(s); }); });
    let allowNote = false;
    await page.route('**/api/**', (route) => {
      const r = route.request();
      if (r.method() === 'GET' || r.method() === 'HEAD') return route.continue();
      if (allowNote && /\/api\/(screening|notes|studio\/org|commands)/.test(r.url())) return route.continue();
      return route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'qa: writes are not sent' } } });
    });
    console.log('interactions · 1440');
    await open(page, '/');
    await step('sidebar: expanded by default at 1440', async () => { const w = await width(page, '.shell-nav'); if (w !== 240) throw new Error(`sidebar ${w}px`); return '240 px'; });
    await step('sidebar: Collapse button → 64', async () => { await page.click('.nav-collapse'); await page.waitForTimeout(500); const w = await width(page, '.shell-nav'); await shot(page, 'sidebar-collapsed'); if (w !== 64) throw new Error(`sidebar ${w}px`); return `64 px · stored ${await page.evaluate(() => localStorage.getItem('vb.sidebar'))}`; });
    await step('sidebar: collapsed items are 40×40 with tooltips', async () => page.evaluate(() => { const items = [...document.querySelectorAll('.shell-nav .nav-item')]; const sizes = items.map((e) => { const b = e.getBoundingClientRect(); return `${Math.round(b.width)}×${Math.round(b.height)}`; }); return `${[...new Set(sizes)].join('/')} · ${items.filter((e) => e.dataset.tip).length}/${items.length} have a tip`; }));
    await step('sidebar: hover shows the tooltip after 400 ms', async () => { await page.hover('.shell-nav .nav-item >> nth=1'); await page.waitForTimeout(600); const t = await page.evaluate(() => document.querySelector('.rail-tip')?.textContent ?? ''); await shot(page, 'sidebar-tooltip'); if (!t) throw new Error('no tooltip'); return `"${t}"`; });
    await step('sidebar: Ctrl+\\ → 240', async () => { await page.mouse.move(700, 450); await page.keyboard.press('Control+\\'); await page.waitForTimeout(500); const w = await width(page, '.shell-nav'); if (w !== 240) throw new Error(`sidebar ${w}px`); return '240 px'; });
    await step('palette: Ctrl+K opens, input focused', async () => { await page.keyboard.press('Control+k'); await page.waitForSelector('dialog[open] .palette-input', { timeout: 3000 }); const f = await focusSig(page); if (!/palette-input/.test(f)) throw new Error(`focus on ${f}`); const n = await page.locator('dialog[open] [role="option"]').count(); await shot(page, 'palette-empty'); return `${n} options before typing`; });
    await step('palette: typing "static" finds the film', async () => { await page.keyboard.type('static'); await page.waitForTimeout(400); const names = await page.locator('dialog[open] [role="option"] .palette-name').allTextContents(); await shot(page, 'palette-typed'); if (!names.some((n) => /static sky/i.test(n))) throw new Error(`options: ${names.join(' | ')}`); return names.slice(0, 4).join(' | '); });
    await step('palette: Esc closes and returns focus', async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(300); const openStill = await page.locator('dialog[open]').count(); const f = await focusSig(page); if (openStill) throw new Error('still open'); return `focus → ${f}`; });
    await step('palette: opened from the sidebar Search, Esc returns focus to it', async () => { await page.click('.nav-search'); await page.waitForSelector('dialog[open] .palette-input'); await page.keyboard.press('Escape'); await page.waitForTimeout(300); const f = await focusSig(page); if (!/nav-search/.test(f)) throw new Error(`focus → ${f}`); return 'focus back on Search'; });
    await step('palette: Enter opens the first result', async () => { await page.keyboard.press('Control+k'); await page.waitForSelector('dialog[open] .palette-input'); await page.keyboard.type('static'); await page.waitForTimeout(400); await page.keyboard.press('Enter'); await page.waitForTimeout(1500); const u = new URL(page.url()).pathname; if (!/shorts\//.test(u)) throw new Error(`went to ${u}`); await open(page, '/'); return u; });
    await step('shortcut sheet: ? opens, Esc closes', async () => { await page.keyboard.press('Shift+?'); await page.waitForSelector('dialog[open]', { timeout: 3000 }); await shot(page, 'shortcut-sheet'); await page.keyboard.press('Escape'); await page.waitForTimeout(300); if (await page.locator('dialog[open]').count()) throw new Error('still open'); return 'ok'; });
    await step('home shelves: arrows present only when the row overflows', async () => page.evaluate(() => [...document.querySelectorAll('main .shelf')].map((s) => { const t = s.querySelector('.shelf-track'); const over = t ? t.scrollWidth > t.clientWidth + 2 : false; const arrows = s.querySelectorAll('.shead button, [class*="head"] button').length; return `${s.getAttribute('aria-labelledby') ?? s.getAttribute('aria-label')}: ${over ? 'overflows' : 'fits'}, ${arrows} arrows`; }).join(' · ')));
    await step('home shelves: Next scrolls the row', async () => { const btn = page.locator('main .shelf button:not([disabled])').filter({ has: page.locator('svg') }).first(); if (!(await btn.count())) return 'no enabled arrow on Home (rows fit)'; const track = page.locator('main .shelf:has(button:not([disabled])) .shelf-track').first(); const before = await track.evaluate((t) => t.scrollLeft); await btn.click(); await page.waitForTimeout(800); const after = await track.evaluate((t) => t.scrollLeft); if (after <= before) throw new Error('did not scroll'); return `${before} → ${after}`; });
    await step('home: every button does something (has a handler, a href or a type=submit)', async () => page.evaluate(() => { const dead = [...document.querySelectorAll('main button')].filter((b) => !b.onclick && !b.getAttribute('aria-haspopup') && b.type !== 'submit' && !b.closest('form') && !b.disabled && !Object.keys(b).some((k) => k.startsWith('__reactProps') && b[k].onClick)); return dead.length ? `${dead.length} without a click handler: ${dead.map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 24)).join(' | ')}` : 'all buttons handled'; }));

    for (const p of ['/shows', '/shorts', '/music-videos', '/characters', '/locations']) {
      await open(page, p);
      await step(`${p}: New menu opens, Esc closes and returns focus`, async () => {
        const trig = page.locator('main [aria-haspopup="menu"]').first(); if (!(await trig.count())) return 'no menu trigger on this page';
        await trig.click(); await page.waitForTimeout(300);
        const items = await page.locator('[role="menu"] [role="menuitem"]').allTextContents(); await shot(page, `menu${p.replace(/\//g, '-')}`);
        await page.keyboard.press('Escape'); await page.waitForTimeout(300);
        const stillOpen = await page.locator('[role="menu"]:visible').count(); const f = await focusSig(page);
        if (!items.length) throw new Error('menu had no items'); if (stillOpen) throw new Error('menu still open'); if (!/button/.test(f)) throw new Error(`focus → ${f}`);
        return `${items.map((t) => t.trim().replace(/\s+/g, ' ').slice(0, 28)).join(' | ')} · focus → ${f}`;
      });
      await step(`${p}: search / filters`, async () => { const s = page.getByRole('searchbox'); const chips = await page.locator('main .chip, main [role="radiogroup"] [role="radio"], main .seg-option').count(); const filters = await page.getByRole('button', { name: /^Filter/ }).count(); if (!(await s.count())) return `no search box · ${chips} chips · ${filters} Filters button`; await s.first().fill('zzzz-nothing'); await page.waitForTimeout(400); const txt = (await page.locator('main').innerText()).replace(/\s+/g, ' '); const empty = /no .* match|nothing|none|no results|0 /i.test(txt); await s.first().fill(''); return `search box present · ${chips} chips · ${filters} Filters button · empty result wording ${empty ? 'present' : 'NOT found'}`; });
    }

    await open(page, '/characters');
    await step('/characters: search "Hana" narrows to one', async () => { const s = page.getByRole('searchbox').first(); await s.fill('Hana'); await page.waitForTimeout(500); const n = await page.locator('.pc-grid .fcard:not(.fcard-start)').count(); await shot(page, 'characters-search'); const clear = page.getByRole('button', { name: 'Clear the search' }); if (await clear.count()) await clear.click(); if (n !== 1) throw new Error(`${n} cards`); return '1 card'; });
    await open(page, `/characters/${CHAR_EN}`);
    await step('/characters/[id]: Edit details dialog opens, Esc closes, focus returns', async () => { const b = page.getByRole('button', { name: 'Edit details' }); await b.click(); await page.waitForSelector('dialog[open]', { timeout: 3000 }); await shot(page, 'dialog-edit-details'); const inside = await focusSig(page); await page.keyboard.press('Escape'); await page.waitForTimeout(300); if (await page.locator('dialog[open]').count()) throw new Error('still open'); const f = await focusSig(page); if (!/Edit details/.test(f)) throw new Error(`focus → ${f}`); return `focus inside: ${inside}; after Esc: ${f}`; });
    await step('/characters/[id]: More menu → Delete asks for confirmation; Cancel', async () => { const m = page.getByRole('button', { name: /^More for / }); await m.click(); await page.getByRole('menuitem', { name: /^Delete/ }).click(); const dlg = page.getByRole('alertdialog'); await dlg.waitFor({ timeout: 3000 }); await shot(page, 'dialog-delete'); const txt = (await dlg.innerText()).replace(/\s+/g, ' ').slice(0, 120); await dlg.getByRole('button', { name: 'Cancel' }).click(); await page.waitForTimeout(300); return txt; });

    await open(page, '/new');
    await step('/new: Auto and Manual links per kind', async () => page.evaluate(() => [...document.querySelectorAll('main a[href*="mode="]')].map((a) => a.getAttribute('href')).join(' · ')));
    await open(page, '/new/short?mode=manual');
    await step('/new/short?mode=manual: submitting an empty brief shows a validation message', async () => { const submit = page.locator('main form button[type="submit"], main .btn-primary').last(); const label = (await submit.textContent())?.trim(); await submit.click(); await page.waitForTimeout(500); const invalid = await page.locator('main [aria-invalid="true"]').count(); const msgs = await page.locator('main [role="alert"], main .field-error, main .t-bad, main [id$="-error"]').allTextContents(); await shot(page, 'create-validation'); const f = await focusSig(page); if (!invalid && !msgs.length) throw new Error(`no validation after "${label}" (focus ${f})`); return `"${label}" → ${invalid} invalid fields · ${msgs.map((m) => m.trim()).filter(Boolean).slice(0, 2).join(' | ')} · focus ${f}`; });
    await step('/new/short: Auto|Manual segmented switches ?mode=', async () => { await page.getByRole('radio', { name: /^Auto/ }).click(); await page.waitForTimeout(400); const u = page.url(); if (!/mode=auto/.test(u)) throw new Error(u); return 'mode=auto'; });

    await open(page, `/shorts/${SHORT}`);
    await step('/shorts/[id]: player transports (play, seek, captions, fullscreen)', async () => { const play = page.getByRole('button', { name: 'Play', exact: true }).first(); if (!(await play.count())) throw new Error('no Play button'); await play.scrollIntoViewIfNeeded(); await play.click(); await page.waitForTimeout(1500); const pause = await page.getByRole('button', { name: 'Pause', exact: true }).count(); const playing = await page.evaluate(() => [...document.querySelectorAll('video')].some((v) => !v.paused)); await shot(page, 'player-playing'); const seek = page.getByRole('slider', { name: 'Seek' }).first(); await seek.fill('10'); await page.waitForTimeout(500); const t = await page.locator('.pt-time').first().textContent().catch(() => ''); const cc = page.getByRole('button', { name: 'Captions' }).first(); const ccN = await cc.count(); if (ccN) { await cc.click(); await page.waitForTimeout(300); } const ccState = ccN ? await cc.getAttribute('aria-pressed') : 'absent'; const fs = await page.getByRole('button', { name: /full ?screen/i }).count(); if (pause) await page.getByRole('button', { name: 'Pause', exact: true }).first().click(); return `pause button ${pause ? 'shown' : 'MISSING'} · video ${playing ? 'playing' : 'NOT playing'} · after seek 10: "${(t ?? '').trim()}" · captions ${ccState} · fullscreen ${fs ? 'present' : 'absent'}`; });
    await step('/shorts/[id]: keyboard on the seek slider', async () => { const seek = page.getByRole('slider', { name: 'Seek' }).first(); await seek.focus(); const before = await seek.inputValue(); await page.keyboard.press('ArrowRight'); const after = await seek.inputValue(); if (after === before) throw new Error('ArrowRight did nothing'); return `${before} → ${after}`; });

    await open(page, `/screening?p=${SHORT}`);
    await step('/screening?p: notes composer posts a note (to this server only)', async () => { allowNote = true; const composer = page.getByRole('form', { name: 'New note' }); await composer.waitFor({ timeout: 10_000 }); const ta = composer.locator('textarea, input[type="text"]').first(); const text = `Design QA note ${Date.now()}`; await ta.fill(text); await shot(page, 'screening-composer'); await composer.locator('button[type="submit"]').click(); await page.locator('.theatre-note', { hasText: text }).waitFor({ timeout: 15_000 }); allowNote = false; await shot(page, 'screening-note-posted'); const st = await page.getByRole('status').allTextContents(); return `note listed · status: ${st.map((s) => s.trim()).filter(Boolean).join(' | ').slice(0, 80)}`; });
    await step('/screening?p: Play puts the lights down, Esc / Pause restores', async () => { const play = page.getByRole('button', { name: 'Play', exact: true }).first(); await play.scrollIntoViewIfNeeded(); const under = await play.evaluate((b) => { const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return e && !b.contains(e) && e !== b ? `${e.tagName.toLowerCase()}.${e.className}` : ''; }); if (under) throw new Error(`Play is covered by ${under}`); await play.click({ timeout: 10_000 }); await page.waitForTimeout(2500); const lights = await page.locator('.shell').getAttribute('data-lights'); await shot(page, 'screening-playing'); await page.getByRole('button', { name: 'Pause', exact: true }).first().click(); await page.waitForTimeout(500); const after = await page.locator('.shell').getAttribute('data-lights'); return `playing: data-lights=${lights} · paused: ${after}`; });
    await step('/screening?p: tabs (Notes / Shots / Export) reachable', async () => { const tabs = await page.getByRole('tab').allTextContents(); await page.getByRole('tab', { name: /^Shots/ }).click(); await page.waitForTimeout(300); const sel = await page.getByRole('tab', { selected: true }).textContent(); return `${tabs.map((t) => t.trim()).join(' | ')} → selected "${sel?.trim()}"`; });

    await open(page, '/production');
    await step('/production#engine-room: the anchor scrolls to the engine room', async () => { await page.goto(`${base}/production#engine-room`, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(LOADED, null, { timeout: 60_000 }); await page.waitForTimeout(1200); const y = await page.evaluate(() => window.scrollY); const el = await page.evaluate(() => { const e = document.getElementById('engine-room'); return e ? Math.round(e.getBoundingClientRect().top) : null; }); await shot(page, 'engine-room'); if (el == null) throw new Error('no #engine-room element'); return `scrollY ${y}, #engine-room top ${el}`; });

    await open(page, `/shorts/${SHORT}/production`);
    await step('/shorts/[id]/production: the workspace has no fabricated progress', async () => page.evaluate(() => { const bars = [...document.querySelectorAll('main [role="progressbar"], main .progress')].map((e) => `${e.className} ${e.getAttribute('aria-valuenow') ?? ''}`); const running = [...document.querySelectorAll('main [data-tone="running"], main .running')].length; return `${bars.length} progress bars (${bars.join('; ').slice(0, 80)}) · ${running} running marks · paused banner: ${/paused/i.test(document.querySelector('main').innerText)}`; }));
    await step('/shorts/[id]/production: disabled regenerate carries its reason', async () => page.evaluate(() => { const d = [...document.querySelectorAll('main button[disabled]')]; return d.length ? d.map((b) => `"${(b.textContent || '').trim().slice(0, 22)}" → ${b.getAttribute('title') || b.getAttribute('aria-describedby') ? 'has reason' : 'NO reason'}`).slice(0, 6).join(' · ') : 'no disabled buttons'; }));
    await ctx.close();
  }

  // phone
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.route('**/api/**', (route) => (['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'qa' } } })));
    await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'nextjs-portal{display:none!important}'; document.head.append(s); }); });
    console.log('interactions · 390');
    await open(page, '/');
    await step('390: top bar and bottom bar', async () => page.evaluate(() => { const t = document.querySelector('.phone-bar')?.getBoundingClientRect(); const b = document.querySelector('.bottom-nav')?.getBoundingClientRect(); const tabs = [...document.querySelectorAll('.bottom-tab')].map((e) => `${e.querySelector('.bottom-tab-label')?.textContent} ${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`); return `top ${Math.round(t?.height ?? 0)} · bottom ${Math.round(b?.height ?? 0)} at y ${Math.round(b?.top ?? 0)} · ${tabs.join(' | ')}`; }));
    await step('390: More opens the sheet; Esc closes it', async () => { await page.getByRole('button', { name: /^More/ }).click(); await page.waitForSelector('dialog[open]', { timeout: 3000 }); await page.waitForTimeout(500); const items = await page.locator('dialog[open] .sheet-item').allTextContents(); await shot(page, 'phone-more-sheet'); const sizes = await page.evaluate(() => [...document.querySelectorAll('dialog[open] .sheet-item')].map((e) => Math.round(e.getBoundingClientRect().height))); await page.keyboard.press('Escape'); await page.waitForTimeout(400); if (await page.locator('dialog[open]').count()) throw new Error('sheet still open'); return `${items.map((t) => t.trim().replace(/\s+/g, ' ')).join(' | ')} · item heights ${[...new Set(sizes)].join('/')}`; });
    await step('390: top-bar Search opens the palette', async () => { await page.getByRole('button', { name: 'Search the studio' }).click(); await page.waitForSelector('dialog[open] .palette-input', { timeout: 3000 }); await shot(page, 'phone-palette'); await page.keyboard.press('Escape'); await page.waitForTimeout(300); return 'ok'; });
    await step('390: Productions tab → /shows with the segmented control', async () => { await page.getByRole('link', { name: /^Productions/ }).click(); await page.waitForURL(/\/shows/, { timeout: 30_000 }); await page.waitForFunction(LOADED, null, { timeout: 60_000 }); await page.waitForTimeout(600); const seg = await page.locator('main [role="radiogroup"] [role="radio"], main .seg button, main [role="tablist"] [role="tab"]').allTextContents(); await shot(page, 'phone-productions'); if (!seg.length) throw new Error(`${new URL(page.url()).pathname}: no Shows | Shorts | Music Videos control at the top (nav-model.ts promises one; Shorts and Music Videos are unreachable from the phone bar)`); return `${new URL(page.url()).pathname} · ${seg.map((t) => t.trim()).join(' | ')}`; });
    await open(page, `/shorts/${SHORT}`);
    await step('390: player transport hit areas', async () => page.evaluate(() => [...document.querySelectorAll('main .ptransport button, main .ptransport input')].map((e) => { const b = e.getBoundingClientRect(); return `${e.getAttribute('aria-label')} ${Math.round(b.width)}×${Math.round(b.height)}`; }).join(' · ')));
    await open(page, '/characters');
    await step('390: character rail / grid and the New split', async () => page.evaluate(() => { const g = document.querySelector('.pc-grid'); const cs = g ? getComputedStyle(g) : null; const w = g?.firstElementChild?.getBoundingClientRect().width; return `grid display ${cs?.display} · columns ${cs?.gridTemplateColumns?.split(' ').length} · first card ${Math.round(w ?? 0)} wide · menu trigger ${document.querySelector('main [aria-haspopup="menu"]') ? 'present' : 'absent'}`; }));
    await ctx.close();
  }
  await fs.writeFile(path.join(out, 'interactions.json'), `${JSON.stringify({ checked: new Date().toISOString(), base, results }, null, 2)}\n`);
  console.log(`interactions: ${results.filter((r) => !r.ok).length} failed of ${results.length} → ${path.join(out, 'interactions.json')}`);
}

// ---- the reference ----------------------------------------------------------------------------------------------------
async function runKrea(browser) {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
  for (const [w, h] of [[1440, 900], [1920, 1080]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, userAgent: UA, colorScheme: 'dark', deviceScaleFactor: 1, locale: 'en-US' });
    const page = await ctx.newPage();
    try {
      await page.goto('https://www.krea.ai/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(4000);
      await page.evaluate(async () => { for (let y = 0; y < Math.min(document.documentElement.scrollHeight, 6000); y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); } window.scrollTo(0, 0); });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(out, `krea-${w}.png`), fullPage: true });
      await page.screenshot({ path: path.join(out, `krea-${w}-first.png`) });
      const m = await page.evaluate(() => {
        const R = Math.round; const body = getComputedStyle(document.body);
        const nav = [...document.querySelectorAll('nav, aside, [class*="sidebar"]')].map((e) => e.getBoundingClientRect()).filter((b) => b.height > 400 && b.width < 400).sort((a, b) => a.width - b.width)[0];
        const cards = [...document.querySelectorAll('a, [role="button"], div')].map((e) => e.getBoundingClientRect()).filter((b) => b.width > 120 && b.width < 480 && b.height > 80 && b.height < 480 && b.top < 1600);
        const widths = {}; for (const b of cards) { const k = `${R(b.width)}×${R(b.height)}`; widths[k] = (widths[k] ?? 0) + 1; }
        const fonts = {}; const sizes = {};
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) { const n = walker.currentNode; if (!n.textContent.trim()) continue; const cs = getComputedStyle(n.parentElement); const f = cs.fontFamily.split(',')[0].replace(/["']/g, ''); fonts[f] = (fonts[f] ?? 0) + 1; sizes[cs.fontSize] = (sizes[cs.fontSize] ?? 0) + 1; }
        const radii = {}; for (const e of document.querySelectorAll('img, video, [class*="card"], a')) { const r = getComputedStyle(e).borderTopLeftRadius; const b = e.getBoundingClientRect(); if (b.width > 100) radii[r] = (radii[r] ?? 0) + 1; }
        return { title: document.title, bodyBg: body.backgroundColor, nav: nav ? `${R(nav.width)}×${R(nav.height)}` : 'none', cardSizes: Object.entries(widths).sort((a, b) => b[1] - a[1]).slice(0, 8), fonts, sizes: Object.entries(sizes).sort((a, b) => b[1] - a[1]).slice(0, 8), radii: Object.entries(radii).sort((a, b) => b[1] - a[1]).slice(0, 6), scrollHeight: document.documentElement.scrollHeight };
      });
      await fs.writeFile(path.join(out, `krea-${w}.json`), `${JSON.stringify(m, null, 2)}\n`);
      console.log(`krea ${w}: «${m.title}» bg ${m.bodyBg} nav ${m.nav} · cards ${m.cardSizes.slice(0, 4).map((c) => `${c[0]}×${c[1]}`).join(', ')} · fonts ${Object.keys(m.fonts).slice(0, 3).join(', ')} · sizes ${m.sizes.slice(0, 5).map((s) => s[0]).join(', ')} · radii ${m.radii.slice(0, 4).map((r) => r[0]).join(', ')}`);
    } catch (e) { console.log(`krea ${w}: FAILED ${e.message.split('\n')[0]}`); }
    await ctx.close();
  }
}

// the dev server can reset a connection under several browsers; the page retries its own reads, the pass goes on
process.on('unhandledRejection', (e) => console.log(`  unhandled: ${String(e?.message ?? e).split('\n')[0].slice(0, 120)}`));
const isMain = process.argv[1] && /qa-integrated\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const browser = await chromium.launch();
  try {
    if (flag('annotate')) await annotate(browser, JSON.parse(await fs.readFile(opt('annotate', ''), 'utf8')));
    if (flag('krea')) await runKrea(browser);
    if (doPages) await runPages(browser);
    if (doInteractions) await runInteractions(browser);
  } finally { await browser.close(); }
}
