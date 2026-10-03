// Per-page network, media and web-vitals baseline against the dev server. Headless Playwright + CDP.
// Usage: node measure.mjs <repoRoot> <baseUrl> <outDir>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2]);
const base = process.argv[3];
const outDir = path.resolve(process.argv[4]);
fs.mkdirSync(outDir, { recursive: true });
const require = createRequire(path.join(root, 'package.json'));
const { chromium } = require('@playwright/test');

const PAGES = [
  ['home', '/'],
  ['shows', '/shows'],
  ['shorts', '/shorts'],
  ['short', '/shorts/short-28bdb3342b'],
  ['short-storyboard', '/shorts/short-28bdb3342b?tab=storyboard'],
  ['short-produce', '/shorts/short-28bdb3342b?tab=produce'],
  ['short-final', '/shorts/short-28bdb3342b?tab=final'],
  ['shot', '/shorts/short-28bdb3342b/shots/shot-24bf719d21'],
  ['characters', '/characters'],
  ['character', '/characters/char-56c47abc59'],
  ['character-new', '/characters/new'],
  ['locations', '/locations'],
  ['location', '/locations/loc-cde19129ca'],
  ['studio', '/studio'],
  ['production', '/production'],
  ['screening', '/screening'],
  ['assets', '/assets'],
  ['settings', '/settings'],
  ['new', '/new'],
  ['music-videos', '/music-videos'],
];
const VIEWPORTS = [{ name: '1440', width: 1440, height: 900, dpr: 1 }, { name: '390', width: 390, height: 844, dpr: 2, mobile: true }];

const VITALS = `(() => { const v = window.__vitals = { fcp: null, lcp: null, lcpEl: null, cls: 0, shifts: [], longTasks: 0 };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') v.fcp = e.startTime; }).observe({ type: 'paint', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { v.lcp = e.startTime; v.lcpSize = e.size; v.lcpEl = e.element ? (e.element.tagName + (e.element.className ? '.' + String(e.element.className).split(' ').slice(0,2).join('.') : '') + (e.url ? ' ' + e.url.slice(-60) : '')) : null; } }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { v.cls += e.value; if (e.value > 0.005) v.shifts.push({ t: Math.round(e.startTime), v: +e.value.toFixed(4), src: (e.sources || []).slice(0,2).map((s) => s.node ? s.node.tagName + '.' + String(s.node.className || '').split(' ')[0] : '?') }); } }).observe({ type: 'layout-shift', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { v.longTasks += l.getEntries().length; }).observe({ type: 'longtask', buffered: true }); } catch {}
})();`;

const kindOf = (url, mime, type) => {
  if (url.includes('/api/studio/org')) return 'api-org';
  if (/\/api\/studio(\?|$)/.test(url)) return 'api-studio';
  if (url.includes('/api/jobs')) return 'api-jobs';
  if (url.includes('/api/events')) return 'api-events';
  if (url.includes('/api/media/')) return (mime || '').startsWith('video') || type === 'Media' ? 'media-video' : (mime || '').startsWith('audio') ? 'media-audio' : 'media-image';
  if (url.includes('/api/')) return 'api-other';
  if (type === 'Script' || url.endsWith('.js')) return 'js';
  if (type === 'Stylesheet' || url.endsWith('.css')) return 'css';
  if (type === 'Font') return 'font';
  if (type === 'Image') return 'image';
  if (type === 'Document') return 'document';
  return type?.toLowerCase() || 'other';
};

async function measure(browser, vp, name, urlPath, warm) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, isMobile: Boolean(vp.mobile), hasTouch: Boolean(vp.mobile), locale: 'en-GB' });
  const page = await context.newPage();
  await page.addInitScript(VITALS);
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  const reqs = new Map();
  client.on('Network.requestWillBeSent', (e) => { reqs.set(e.requestId, { url: e.request.url, type: e.type, start: e.timestamp, encoded: 0, decoded: 0, mime: null, status: null, done: false }); });
  client.on('Network.responseReceived', (e) => { const r = reqs.get(e.requestId); if (r) { r.mime = e.response.mimeType; r.status = e.response.status; r.type = e.type; r.fromCache = e.response.fromDiskCache || e.response.fromServiceWorker; } });
  client.on('Network.dataReceived', (e) => { const r = reqs.get(e.requestId); if (r) r.decoded += e.dataLength; });
  client.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) { r.encoded = e.encodedDataLength; r.done = true; r.end = e.timestamp; } });
  client.on('Network.loadingFailed', (e) => { const r = reqs.get(e.requestId); if (r) { r.failed = e.errorText; r.done = true; } });
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(m.type() + ': ' + m.text().slice(0, 160)); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e).slice(0, 160)));
  const t0 = Date.now();
  await page.goto(base + urlPath, { waitUntil: 'load', timeout: 180_000 });
  // the shell gates on the first snapshot: wait for the skeleton to go, then for the network to settle
  try { await page.waitForFunction(() => !document.querySelector('.shell-skeleton'), null, { timeout: 60_000 }); } catch {}
  const readyAt = Date.now() - t0;
  try { await page.waitForLoadState('networkidle', { timeout: 30_000 }); } catch {}
  await page.waitForTimeout(warm ? 500 : 3000);
  const settledAt = Date.now() - t0;
  if (warm) { await context.close(); return null; }
  const vitals = await page.evaluate(() => window.__vitals);
  const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return n ? { ttfb: n.responseStart, domContentLoaded: n.domContentLoadedEventEnd, load: n.loadEventEnd, transfer: n.transferSize, decoded: n.decodedBodySize } : null; });
  const dom = await page.evaluate(() => {
    const vw = innerWidth, vh = innerHeight;
    const imgs = [...document.querySelectorAll('img')].map((i) => { const r = i.getBoundingClientRect(); return { src: i.currentSrc || i.src, nw: i.naturalWidth, nh: i.naturalHeight, cw: Math.round(r.width), ch: Math.round(r.height), inView: r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw, loading: i.loading, alt: i.alt?.slice(0, 40) }; });
    const videos = [...document.querySelectorAll('video')].map((v) => { const r = v.getBoundingClientRect(); return { src: v.currentSrc || v.src, poster: v.poster, preload: v.preload, readyState: v.readyState, vw: v.videoWidth, vh: v.videoHeight, cw: Math.round(r.width), ch: Math.round(r.height), autoplay: v.autoplay }; });
    const audios = document.querySelectorAll('audio').length;
    const classes = new Set(); document.querySelectorAll('[class]').forEach((el) => String(el.className.baseVal ?? el.className).split(/\s+/).forEach((c) => c && classes.add(c)));
    const bgImgs = [...document.querySelectorAll('*')].map((el) => getComputedStyle(el).backgroundImage).filter((b) => b && b.includes('url(') && b.includes('/api/media/')).length;
    return { nodes: document.querySelectorAll('*').length, imgs, videos, audios, classes: [...classes], bgImgs, overflow: document.documentElement.scrollWidth > vw, scrollWidth: document.documentElement.scrollWidth, title: document.title, main: document.querySelector('main')?.innerText?.length ?? 0, room: document.querySelector('[data-room]')?.getAttribute('data-room'), nav: document.querySelector('.shell')?.getAttribute('data-nav'), lang: document.documentElement.lang, buttons: document.querySelectorAll('button').length, dialogs: document.querySelectorAll('dialog').length };
  });
  // network summary
  const list = [...reqs.values()].filter((r) => !r.url.startsWith('data:'));
  const byKind = {};
  for (const r of list) { const k = kindOf(r.url, r.mime, r.type); byKind[k] ??= { n: 0, encoded: 0, decoded: 0 }; byKind[k].n++; byKind[k].encoded += r.encoded; byKind[k].decoded += r.decoded; }
  const studio = list.filter((r) => /\/api\/studio(\?|$)/.test(r.url));
  const media = list.filter((r) => r.url.includes('/api/media/')).map((r) => ({ url: r.url.replace(base, ''), mime: r.mime, encoded: r.encoded, decoded: r.decoded, status: r.status, ms: r.end && r.start ? Math.round((r.end - r.start) * 1000) : null }));
  // image bytes vs displayed size: match media requests to <img> by url
  const imgRows = dom.imgs.filter((i) => i.src.includes('/api/media/')).map((i) => { const m = media.find((x) => i.src.endsWith(x.url) || i.src.includes(x.url.split('?')[0])); return { ...i, bytes: m?.decoded ?? null, oversize: i.nw && i.cw ? +(i.nw / (i.cw * vp.dpr)).toFixed(1) : null }; });
  const slow = list.filter((r) => r.end && r.start && (r.end - r.start) > 1).map((r) => ({ url: r.url.replace(base, '').slice(0, 90), ms: Math.round((r.end - r.start) * 1000) })).sort((a, b) => b.ms - a.ms).slice(0, 8);
  const total = list.reduce((a, r) => ({ n: a.n + 1, encoded: a.encoded + r.encoded, decoded: a.decoded + r.decoded }), { n: 0, encoded: 0, decoded: 0 });
  const result = { name, urlPath, viewport: vp.name, readyAt, settledAt, vitals, nav, total, byKind, studio: { count: studio.length, bytes: studio.map((s) => s.decoded), ms: studio.map((s) => (s.end && s.start ? Math.round((s.end - s.start) * 1000) : null)) }, jobs: { count: list.filter((r) => r.url.includes('/api/jobs')).length, bytes: list.filter((r) => r.url.includes('/api/jobs')).map((r) => r.decoded) }, org: list.filter((r) => r.url.includes('/api/studio/org')).map((r) => ({ url: r.url.replace(base, ''), bytes: r.decoded, ms: r.end && r.start ? Math.round((r.end - r.start) * 1000) : null })), media, imgRows, videos: dom.videos, audios: dom.audios, bgImgs: dom.bgImgs, slow, dom: { nodes: dom.nodes, overflow: dom.overflow, scrollWidth: dom.scrollWidth, title: dom.title, mainChars: dom.main, room: dom.room, nav: dom.nav, buttons: dom.buttons, dialogs: dom.dialogs }, classes: dom.classes, consoleErrors: consoleErrors.slice(0, 12), consoleErrorCount: consoleErrors.length, failed: list.filter((r) => r.failed || (r.status && r.status >= 400)).map((r) => ({ url: r.url.replace(base, '').slice(0, 100), status: r.status, failed: r.failed })) };
  await page.screenshot({ path: path.join(outDir, `${name}-${vp.name}.png`), fullPage: false }).catch(() => {});
  await context.close();
  return result;
}

async function idleTraffic(browser, urlPath, seconds) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  const hits = [];
  let t0 = null;
  client.on('Network.requestWillBeSent', (e) => { if (t0 && e.request.url.includes('/api/')) hits.push({ url: e.request.url.replace(base, ''), t: Math.round((Date.now() - t0) / 100) / 10 }); });
  await page.goto(base + urlPath, { waitUntil: 'load' });
  try { await page.waitForLoadState('networkidle', { timeout: 30_000 }); } catch {}
  await page.waitForTimeout(2000);
  t0 = Date.now();
  await page.waitForTimeout(seconds * 1000);
  await context.close();
  return hits;
}

async function navigation(browser, from, clicks) {
  // client-side route changes: what each navigation costs after the app is loaded
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  let bucket = null;
  const reqs = new Map();
  client.on('Network.requestWillBeSent', (e) => { if (bucket) reqs.set(e.requestId, { url: e.request.url, type: e.type, decoded: 0, bucket }); });
  client.on('Network.dataReceived', (e) => { const r = reqs.get(e.requestId); if (r) r.decoded += e.dataLength; });
  await page.goto(base + from, { waitUntil: 'load' });
  try { await page.waitForFunction(() => !document.querySelector('.shell-skeleton'), null, { timeout: 60_000 }); } catch {}
  try { await page.waitForLoadState('networkidle', { timeout: 30_000 }); } catch {}
  await page.waitForTimeout(1500);
  const rows = [];
  for (const [label, href] of clicks) {
    bucket = label; const t0 = Date.now();
    const link = page.locator(`a[href="${href}"]`).first();
    if (await link.count() === 0) { rows.push({ label, href, error: 'no link in the page' }); continue; }
    await link.click();
    try { await page.waitForURL((u) => u.pathname === href.split('?')[0], { timeout: 30_000 }); } catch {}
    try { await page.waitForLoadState('networkidle', { timeout: 30_000 }); } catch {}
    const ms = Date.now() - t0;
    await page.waitForTimeout(800);
    const mine = [...reqs.values()].filter((r) => r.bucket === label);
    const by = {};
    for (const r of mine) { const k = kindOf(r.url, null, r.type); by[k] ??= { n: 0, decoded: 0 }; by[k].n++; by[k].decoded += r.decoded; }
    rows.push({ label, href, ms, requests: mine.length, bytes: mine.reduce((a, r) => a + r.decoded, 0), by });
    bucket = null;
  }
  await context.close();
  return rows;
}

const browser = await chromium.launch({ headless: true });
const results = [];
const allClasses = new Set();
for (const vp of VIEWPORTS) {
  for (const [name, urlPath] of PAGES) {
    try {
      await measure(browser, vp, name, urlPath, true); // warm: compile the route and the media cache on the server side
      const r = await measure(browser, vp, name, urlPath, false);
      r.classes.forEach((c) => allClasses.add(c)); delete r.classes;
      results.push(r);
      console.log(`${name}@${vp.name}: ready ${r.readyAt} ms, req ${r.total.n}, ${(r.total.decoded / 1024).toFixed(0)} KB, studio x${r.studio.count} ${r.studio.bytes.map((b) => (b / 1024).toFixed(0)).join('/')} KB, media ${(Object.entries(r.byKind).filter(([k]) => k.startsWith('media')).reduce((a, [, v]) => a + v.decoded, 0) / 1024 / 1024).toFixed(1)} MB, FCP ${r.vitals.fcp?.toFixed(0)}, LCP ${r.vitals.lcp?.toFixed(0)}, CLS ${r.vitals.cls.toFixed(3)}, overflow ${r.dom.overflow}`);
    } catch (e) { console.log(`${name}@${vp.name}: FAILED ${String(e).slice(0, 200)}`); results.push({ name, viewport: vp.name, urlPath, error: String(e).slice(0, 300) }); }
  }
}
fs.writeFileSync(path.join(outDir, 'pages.json'), JSON.stringify(results, null, 1));
fs.writeFileSync(path.join(outDir, 'dom-classes.json'), JSON.stringify([...allClasses].sort()));
console.log('--- idle traffic 65 s on /shows');
const idleShows = await idleTraffic(browser, '/shows', 65);
console.log(JSON.stringify(idleShows));
console.log('--- idle traffic 65 s on /production');
const idleProd = await idleTraffic(browser, '/production', 65);
console.log(JSON.stringify(idleProd));
console.log('--- client-side navigation from /shows');
const navRows = await navigation(browser, '/shows', [['shorts', '/shorts'], ['characters', '/characters'], ['production', '/production'], ['studio', '/studio'], ['screening', '/screening'], ['settings', '/settings']]);
console.log(JSON.stringify(navRows, null, 0));
fs.writeFileSync(path.join(outDir, 'extra.json'), JSON.stringify({ idleShows, idleProd, navRows }, null, 1));
await browser.close();
