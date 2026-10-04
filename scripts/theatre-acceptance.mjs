// Screening Room acceptance in a real browser (docs/DESIGN-SYSTEM-V5.md §8.12, docs/design/VISUAL-STANDARD-V5.1.md §8):
//
//   node scripts/theatre-acceptance.mjs --base http://localhost:4259 [--p <productionId>] [--out dir]
//
// For 1440×900, 1920×1080 and 390×844 it loads the theatre (`/screening?p=…`) once on a throttled network (CDP:
// 1.5 Mbps, 150 ms latency), screenshots it while it loads and again when it has settled (full page), records every
// layout shift after the first paint (CLS), and measures: the picture at the cut's native ratio; the transport docked
// under the picture (it starts at the picture's bottom edge and nothing but a note pin overlaps the picture); the whole
// stage inside the first screen on desktop; the stage, the programme and its title on one start edge; the review pane
// level with the stage (same top, same height) at ≥ 1280; Geist/Geist Mono on every visible text node; no text under
// 12 px; no horizontal overflow; every picture decoded. It then loads the poster list (`/screening`) and measures its
// cards (equal size, 2:3, on the start edge). Read only: every mutating request is refused. Exit code 1 on a failure.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i === -1 ? dflt : args[i + 1]; };
const base = opt('base', 'http://localhost:4259');
const out = opt('out', 'docs/evidence/theatre-v1');
let pid = opt('p', null);
if (/:4200\b/.test(base)) { console.error('Refusing the live studio on :4200; run against your own server and database copy.'); process.exit(2); }
await fs.mkdir(out, { recursive: true });
if (!pid) {
  const snap = await (await fetch(`${base}/api/studio`)).json();
  pid = snap.state.productions.filter((p) => p.cutAssetId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id;
  if (!pid) { console.error('No production with a cut.'); process.exit(2); }
}

const SIZES = [{ w: 1440, h: 900, touch: false }, { w: 1920, h: 1080, touch: false }, { w: 390, h: 844, touch: true }];
const browser = await chromium.launch();
let failed = 0;
const report = [];

const textChecks = () => {
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
    fonts: [...fonts], small: small.slice(0, 8),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    broken: [...imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')), ...[...document.querySelectorAll('main [data-failed]')].map((e) => e.getAttribute('aria-label') ?? 'a frame marked unavailable')],
  };
};
const fontOk = (fonts) => fonts.every((f) => /^(Geist|Geist Mono|__Geist)/i.test(f) || /Segoe UI|Tahoma|Geeza|Arabic/i.test(f));

async function open(size, path, ready) {
  const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, colorScheme: 'dark', hasTouch: size.touch, isMobile: size.touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route('**/api/**', (route) => (['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.fulfill({ status: 403, body: '{"error":{"message":"read-only acceptance"}}' })));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.5 * 1024 * 1024) / 8, uploadThroughput: (0.75 * 1024 * 1024) / 8 });
  await page.addInitScript(() => {
    window.__shifts = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shifts.push({ value: e.value, t: Math.round(e.startTime), nodes: (e.sources || []).map((s) => s.node?.className?.toString?.().slice(0, 60) ?? s.node?.nodeName) }); }).observe({ type: 'layout-shift', buffered: true });
    const s = document.createElement('style'); s.textContent = 'nextjs-portal{display:none!important}'; document.addEventListener('DOMContentLoaded', () => document.head.append(s));
  });
  const t0 = Date.now();
  await page.goto(`${base}${path}`, { waitUntil: 'commit' });
  await page.waitForSelector('main .theatre-room, main .theatre-lobby', { timeout: 300000 });
  const skeleton = await page.evaluate(() => Boolean(document.querySelector('.theatre-skeleton')));
  const firstMs = Date.now() - t0;
  return { ctx, page, skeleton, firstMs, shot: async (name) => page.screenshot({ path: `${out}/${name}` }), settle: async () => {
    await page.waitForSelector(ready, { timeout: 300000 });
    await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
    await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 300000 }).catch(() => {});
    await page.waitForTimeout(1000);
  } };
}

for (const size of SIZES) {
  // ---- the theatre
  const t = await open(size, `/screening?p=${encodeURIComponent(pid)}`, '.theatre-room:not(.theatre-skeleton) .theatre-stage video');
  await t.shot(`theatre-loading-${size.w}.png`);
  await t.settle();
  await t.page.waitForFunction(() => { const v = document.querySelector('.theatre-stage video'); return v && v.readyState >= 1; }, null, { timeout: 300000 }).catch(() => {});
  await t.page.waitForTimeout(600);
  await t.page.screenshot({ path: `${out}/theatre-${size.w}.png`, fullPage: true });
  const m = await t.page.evaluate(({ textChecks }) => {
    const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) }; };
    const pic = box('.theatre-stage .iplayer-box'), tr = box('.theatre-stage .ptransport'), stage = box('.theatre-stage .iplayer'), pane = box('.theatre-pane'), prog = box('.theatre-prog'), title = box('.theatre-title');
    const v = document.querySelector('.theatre-stage video');
    const picEl = document.querySelector('.theatre-stage .iplayer-box');
    const over = [...document.querySelectorAll('main *')].filter((e) => !picEl.contains(e) && !e.contains(picEl)).filter((e) => { const b = e.getBoundingClientRect(); const p = picEl.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.left < p.right - 1 && b.right > p.left + 1 && b.top < p.bottom - 1 && b.bottom > p.top + 1; }).map((e) => e.className?.toString?.().slice(0, 40) ?? e.nodeName);
    const insidePic = [...picEl.querySelectorAll('*')].filter((e) => !e.matches('video, track, .iplayer-overlay, .theatre-pins, .theatre-pin, .theatre-pin *, .pfail, .pfail *')).map((e) => e.className?.toString?.() ?? e.nodeName);
    const tracks = v ? [...v.textTracks].map((x) => `${x.language}:${x.mode}`) : [];
    // eslint-disable-next-line no-new-func
    const tc = new Function(`return (${textChecks})()`)();
    return { pic, tr, stage, pane, prog, title, over, insidePic, tracks, natural: v ? [v.videoWidth, v.videoHeight] : null, cls: window.__shifts.reduce((a, s) => a + s.value, 0), shifts: window.__shifts.filter((s) => s.value > 0.001).slice(0, 6), ...tc, vh: innerHeight };
  }, { textChecks: textChecks.toString() });
  const ratio = m.natural && m.natural[1] ? m.natural[0] / m.natural[1] : 16 / 9;
  const desktop = size.w >= 1280;
  const checks = {
    'native ratio': Math.abs(m.pic.w / m.pic.h - ratio) < 0.01,
    'transport docked under the picture': m.tr.y === m.pic.b && m.tr.x === m.stage.x && m.tr.w === m.stage.w,
    'nothing over the picture but pins': m.over.length === 0 && m.insidePic.length === 0,
    'stage in the first screen': !desktop || m.tr.b <= m.vh,
    'shared start edge': m.stage.x === m.prog.x && m.prog.x === m.title.x || (!desktop && m.prog.x === m.title.x),
    'pane level with the stage': !desktop || (m.pane.y === m.stage.y && m.pane.h === m.stage.h),
    'English track present': m.tracks.some((x) => x.startsWith('en:')),
    'fonts Geist': fontOk(m.fonts),
    'no text < 12 px': m.small.length === 0,
    'no horizontal overflow': m.overflow <= 0,
    'no broken images': m.broken.length === 0,
    'CLS < 0.02': m.cls < 0.02,
    'skeleton shown while loading': t.skeleton,
  };
  const bad = Object.entries(checks).filter(([, x]) => !x).map(([k]) => k);
  failed += bad.length;
  report.push({ view: 'theatre', size: `${size.w}×${size.h}`, firstMs: t.firstMs, ...m, checks });
  console.log(`theatre ${size.w}×${size.h}: ${bad.length ? `✗ ${bad.join(', ')}` : '✓ all checks'} · picture ${m.pic.w}×${m.pic.h} @${m.pic.x},${m.pic.y} · transport y ${m.tr.y} h ${m.tr.h} · pane ${m.pane.w}×${m.pane.h} @${m.pane.x},${m.pane.y} · start x ${m.stage.x}/${m.prog.x}/${m.title.x} · tracks ${m.tracks.join(' ')} · CLS ${m.cls.toFixed(4)} · fonts ${m.fonts.join(', ')}${m.small.length ? ` · small: ${m.small.join('; ')}` : ''}${m.over.length ? ` · over: ${m.over.join(', ')}` : ''}${m.shifts.length ? ` · shifts: ${JSON.stringify(m.shifts)}` : ''}`);
  await t.ctx.close();

  // ---- the poster list
  const l = await open(size, '/screening', '.theatre-lobby:not(.theatre-skeleton) .mcard');
  await l.shot(`list-loading-${size.w}.png`);
  await l.settle();
  await l.page.screenshot({ path: `${out}/list-${size.w}.png`, fullPage: true });
  const n = await l.page.evaluate(({ textChecks }) => {
    const cards = [...document.querySelectorAll('.theatre-grid .mcard')].map((e) => e.getBoundingClientRect());
    const head = document.querySelector('.theatre-lobby-head').getBoundingClientRect();
    // eslint-disable-next-line no-new-func
    const tc = new Function(`return (${textChecks})()`)();
    return { sizes: [...new Set(cards.map((b) => `${Math.round(b.width)}×${Math.round(b.height)}`))], ratio: cards[0] ? cards[0].width / cards[0].height : 0, startCard: cards[0] ? Math.round(cards[0].left) : null, startHead: Math.round(head.left), cls: window.__shifts.reduce((a, s) => a + s.value, 0), ...tc };
  }, { textChecks: textChecks.toString() });
  const lc = {
    'cards equal': n.sizes.length === 1, 'cards 2:3': Math.abs(n.ratio - 2 / 3) < 0.01, 'shared start edge': n.startCard === n.startHead,
    'fonts Geist': fontOk(n.fonts), 'no text < 12 px': n.small.length === 0, 'no horizontal overflow': n.overflow <= 0, 'no broken images': n.broken.length === 0, 'CLS < 0.02': n.cls < 0.02, 'skeleton shown while loading': l.skeleton,
  };
  const lbad = Object.entries(lc).filter(([, x]) => !x).map(([k]) => k);
  failed += lbad.length;
  report.push({ view: 'list', size: `${size.w}×${size.h}`, firstMs: l.firstMs, ...n, checks: lc });
  console.log(`list    ${size.w}×${size.h}: ${lbad.length ? `✗ ${lbad.join(', ')}` : '✓ all checks'} · cards ${n.sizes.join('/')} · start x ${n.startHead}/${n.startCard} · CLS ${n.cls.toFixed(4)}${n.small.length ? ` · small: ${n.small.join('; ')}` : ''}`);
  await l.ctx.close();
}
// ---- evidence only (not checks): a populated notes pane answered from a fixture (reads only), and the lights down
{
  const snap = await (await fetch(`${base}/api/studio`)).json();
  const prod = snap.state.productions.find((x) => x.id === pid);
  const now = new Date().toISOString();
  const fixture = [
    { timecode: 9.4, pin: { x: 0.38, y: 0.3 }, text: 'Fixture note (evidence only): hold on his face a beat longer before the line.' },
    { timecode: 31.2, text: 'Fixture note (evidence only): the static under the music is too loud here.' },
    { timecode: 51.2, pin: { x: 0.74, y: 0.24 }, text: 'Fixture note (evidence only): the portrait should flicker here, not a second earlier.', status: 'resolved' },
  ].map((n, i) => ({ id: `fixture-${i}`, productionId: pid, cutAssetId: prod.cutAssetId, cutVersion: 3, author: 'producer', status: 'open', createdAt: now, updatedAt: now, ...n }));
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route('**/api/**', (route) => {
    const r = route.request(); const u = new URL(r.url());
    if (!['GET', 'HEAD'].includes(r.method())) return route.fulfill({ status: 403, body: '{}' });
    if (u.pathname === '/api/notes') return route.fulfill({ json: { notes: fixture } });
    return route.continue();
  });
  await page.goto(`${base}/screening?p=${encodeURIComponent(pid)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.theatre-room:not(.theatre-skeleton) .theatre-note', { timeout: 300000 });
  await page.waitForFunction(() => document.querySelector('.theatre-stage video')?.readyState >= 2, null, { timeout: 60000 });
  await page.getByRole('button', { name: /^Jump to 0:09/ }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/theatre-notes-fixture-1440.png` });
  await page.evaluate(() => { const v = document.querySelector('.theatre-stage video'); v.muted = true; });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.mouse.move(700, 820);
  await page.waitForTimeout(3200);
  await page.screenshot({ path: `${out}/theatre-lights-down-1440.png` });
  await ctx.close();
}
await browser.close();
await fs.writeFile(`${out}/acceptance.json`, `${JSON.stringify({ checked: new Date().toISOString(), base, production: pid, report }, null, 2)}\n`);
process.exitCode = failed ? 1 : 0;
