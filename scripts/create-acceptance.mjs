// Create acceptance in a real browser (docs/design/PAGE-ENGINEERING-BRIEF.md §4; VISUAL-STANDARD-V5.1.md §8):
//
//   node scripts/create-acceptance.mjs [--base http://localhost:4257] [--out docs/evidence/create-v1] [--only name,name]
//
// For 1440×900, 1920×1080 and 390×844 it captures every step and state of the /new hub and the creation flows —
// Auto (start, preferences, engine checking, engine offline, studio paused, developing, failed, the proposal to pick),
// Manual (brief, more control, validation errors), the music video's song (write, upload refused), seasons and
// episodes without a show, an empty studio and the loading skeletons — and measures each: the shared start edge,
// equal heights in the hub grid and in every picker row, Geist only, no text under 12 px, no horizontal overflow, no
// frame marked unavailable, and (hub and flow, a first load throttled to 4 Mbps with 150 ms latency — the dev server's uncompressed chunks time out at 1.5 Mbps) the layout shift.
//
// Read only: every write is answered in the browser (scripts/lib/capture.mjs) and never reaches the server. States
// the studio lacks are derived from its own records: the engines' answers are replaced (ready / offline / checking),
// and "developing" and "failed" are the real Auto Idea of this database (its GET /api/development answer) shown as it
// was mid-way. The proposal to pick is the real one, read live. Exit code 1 when a check fails.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { prepare } from './lib/capture.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i === -1 ? dflt : args[i + 1]; };
const base = opt('base', 'http://localhost:4257');
const out = opt('out', 'docs/evidence/create-v1');
const only = opt('only', '') ? opt('only', '').split(',') : null;
await fs.mkdir(out, { recursive: true });

const SIZES = [{ w: 1440, h: 900, touch: false }, { w: 1920, h: 1080, touch: false }, { w: 390, h: 844, touch: true }];

// the studio's own Auto Idea (read once, live) — the review shows it as it is; developing and failed are its stages cut
const jobs = await (await fetch(`${base}/api/jobs?limit=200`)).json();
const idea = jobs.jobs.filter((j) => j.type === 'AUTO_IDEA' && j.status === 'COMPLETED' && j.result?.proposalId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
const ideaKind = idea ? ({ SHORT: 'short', SHOW: 'show', MUSIC_VIDEO: 'music-video' })[idea.payload.kind] ?? 'short' : 'short';
const dev = idea ? await (await fetch(`${base}/api/development/${idea.id}`)).json() : null;
const midway = (failed) => {
  if (!dev) return null;
  const order = ['RESEARCH', 'AUDIENCE', 'CONCEPTS'];
  const stages = dev.stages.filter((s) => order.includes(s.stage)).map((s) => (s.stage === 'CONCEPTS' ? { ...s, status: failed ? 'FAILED' : 'GENERATING', finishedAt: null, error: failed ? { code: 'PROVIDER', message: 'The story engine stopped answering while the concepts were written.' } : null, progress: { phase: 'concepts', message: 'Writing three concepts from the audience patterns' } } : s));
  return { ...dev, ideaJobId: 'job-capture-idea', proposal: null, job: { ...dev.job, id: 'job-capture-idea', status: failed ? 'FAILED' : 'GENERATING', result: null, finishedAt: null, error: failed ? { code: 'PROVIDER', message: 'The story engine stopped answering while the concepts were written.' } : null, progress: { phase: 'concepts', step: 3, total: 8, message: 'Writing three concepts from the audience patterns' } }, stages };
};

const ENGINES = {
  ready: { status: { story: { ok: true, detail: 'ready', where: 'local' } }, health: { ok: true, intake: { paused: false } } },
  storyOffline: { status: { story: { ok: false, detail: 'unreachable', where: 'local' } }, health: { ok: true, intake: { paused: false } } },
  checking: { status: 'hang', health: { ok: true, intake: { paused: false } } },
};

/** name, path, engines, extra routes, what to do before the capture */
const STATES = [
  { name: 'hub', path: '/new', cls: true },
  { name: 'hub-loading', path: '/new', loading: true },
  { name: 'hub-empty', path: '/new', empty: true },
  { name: 'short-auto-paused', path: '/new/short', cls: true },
  { name: 'short-auto-ready', path: '/new/short', engines: 'ready' },
  { name: 'short-auto-preferences', path: '/new/short', engines: 'ready', act: async (p) => { await p.click('.create-prefs-summary'); } },
  { name: 'short-auto-checking', path: '/new/short', engines: 'checking' },
  { name: 'short-auto-story-offline', path: '/new/short', engines: 'storyOffline' },
  { name: 'auto-developing', path: `/new/${ideaKind}?mode=auto&idea=job-capture-idea`, engines: 'ready', dev: midway(false) },
  { name: 'auto-failed', path: `/new/${ideaKind}?mode=auto&idea=job-capture-idea`, engines: 'ready', dev: midway(true) },
  ...(idea ? [{ name: 'auto-pick', path: `/new/${ideaKind}?mode=auto&idea=${idea.id}`, engines: 'ready', wait: '#create-review-title' },
    { name: 'auto-pick-developed', path: `/new/${ideaKind}?mode=auto&idea=${idea.id}`, engines: 'ready', wait: '#create-review-title', act: async (p) => { await p.click('.create-more-summary'); } },
    { name: 'auto-pick-error', path: `/new/${ideaKind}?mode=auto&idea=${idea.id}`, engines: 'ready', wait: '#create-review-title', act: async (p) => { await p.fill('#create-review-title', ''); await p.click('button[type=submit]'); } }] : []),
  { name: 'short-manual', path: '/new/short?mode=manual' },
  { name: 'short-manual-errors', path: '/new/short?mode=manual', act: async (p) => { await p.click('button[type=submit]'); } },
  { name: 'short-manual-more', path: '/new/short?mode=manual', act: async (p) => { await p.click('.create-more-summary'); } },
  { name: 'short-manual-empty-studio', path: '/new/short?mode=manual', empty: true, act: async (p) => { await p.click('.create-more-summary'); } },
  { name: 'short-loading', path: '/new/short', loading: true },
  { name: 'show-auto', path: '/new/show', engines: 'ready' },
  { name: 'show-manual', path: '/new/show?mode=manual' },
  { name: 'mv-auto', path: '/new/music-video', engines: 'ready' },
  { name: 'mv-manual', path: '/new/music-video?mode=manual' },
  { name: 'mv-upload-error', path: '/new/music-video?mode=manual', act: async (p) => { await p.getByRole('radio', { name: /Upload a song/ }).click(); await p.fill('#create-title', 'River Lights'); await p.click('button[type=submit]'); } },
  { name: 'episode-no-show', path: '/new/episode?show=missing' },
].filter((s) => !only || only.includes(s.name));

process.on('unhandledRejection', () => {}); // a route still in flight when its context closes
const browser = await chromium.launch();
let failed = 0;
const report = [];

async function measure(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main') ?? document.body;
    const r = (sel) => [...main.querySelectorAll(sel)].map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0);
    const startEls = [...main.querySelectorAll('.create-head > *:not(.create-mode), .create-mode, .create-flow > *:not(.form-footer, .sr-only), .create-hub-head, .create-hub-shead, .create-hub-grid, .create-hub-tools, .create-missing')].filter((e) => e.getBoundingClientRect().width > 0);
    const starts = startEls.map((e) => Math.round(e.getBoundingClientRect().left));
    const mode = starts.sort((a, b) => starts.filter((v) => v === b).length - starts.filter((v) => v === a).length)[0];
    const offenders = startEls.filter((e) => Math.round(e.getBoundingClientRect().left) !== mode).map((e) => `${e.className.toString().slice(0, 40)}@${e.getBoundingClientRect().left}`);
    const rows = (sel) => { const m = new Map(); for (const b of r(sel)) { const k = Math.round(b.top); m.set(k, [...(m.get(k) ?? []), Math.round(b.height)]); } return [...m.values()].every((hs) => new Set(hs).size === 1); };
    const fonts = new Set(); const small = [];
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode; if (!n.textContent.trim()) continue;
      const el = n.parentElement; const cs = getComputedStyle(el); const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0 || cs.visibility === 'hidden' || el.closest('.sr-only, [hidden]')) continue;
      fonts.add(cs.fontFamily.split(',')[0].replace(/["']/g, '').trim());
      if (parseFloat(cs.fontSize) < 12) small.push(`${parseFloat(cs.fontSize)}px "${n.textContent.trim().slice(0, 30)}"`);
    }
    return {
      starts: [...new Set(starts)], startOk: new Set(starts).size <= 1, offenders,
      cardsEqual: rows('.create-start'), picksEqual: rows('.create-pick'),
      fonts: [...fonts], small: small.slice(0, 6),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      unavailable: [...main.querySelectorAll('[data-failed]')].length + [...main.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth === 0).length,
      cls: (window.__shifts ?? []).reduce((a, s) => a + s.value, 0), shifts: (window.__shifts ?? []).filter((s) => s.value > 0.001).slice(0, 5),
    };
  });
}

for (const size of SIZES) {
  for (const st of STATES) {
   // the dev server can hand out a chunk mid-compile: a page that never becomes ready is opened again (three times at most)
   for (let attempt = 1; attempt <= 3; attempt++) {
    const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, colorScheme: 'dark', hasTouch: size.touch, isMobile: size.touch, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await prepare(page, { motion: 'reduce' });
    if (process.env.DEBUG_ERRORS) { page.on('pageerror', (e) => console.log('   stack:', (e.stack || '').split('\n').slice(0, 3).join(' | '))); page.on('requestfailed', (r) => console.log('   failed:', r.url(), r.failure()?.errorText)); }
    await page.addInitScript(() => { window.__shifts = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shifts.push({ value: e.value, t: Math.round(e.startTime), nodes: (e.sources || []).map((s) => s.node?.className?.toString?.().slice(0, 50) ?? s.node?.nodeName) }); }).observe({ type: 'layout-shift', buffered: true }); });
    const eng = st.engines ? ENGINES[st.engines] : null;
    if (eng) {
      await page.route('**/api/status', (route) => (eng.status === 'hang' ? new Promise(() => {}) : route.fulfill({ json: { video: { ok: false }, images: { ok: false }, voice: { ok: false }, transcription: { ok: false }, music: { ok: false }, gpu: null, minimaxConfigured: false, ...eng.status } })));
      await page.route('**/api/health', (route) => route.fulfill({ json: eng.health }));
    }
    if (st.dev) await page.route('**/api/development/job-capture-idea', (route) => route.fulfill({ json: st.dev }));
    if (st.empty || st.loading) {
      await page.route('**/api/studio', async (route) => {
        const res = await route.fetch(); const body = await res.json();
        body.state.settings.reducedMotion = true;
        if (st.empty) { body.state.characters = []; body.state.locations = []; body.state.productions = []; body.state.shows = []; body.state.seasons = []; }
        if (st.loading) await new Promise((r) => setTimeout(r, 6000));
        return route.fulfill({ response: res, json: body });
      });
      if (st.empty) await page.route((u) => u.pathname === '/api/jobs', (route) => route.fulfill({ json: { jobs: [] } }));
    }
    let cdp = null;
    if (st.cls) { cdp = await ctx.newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (1 * 1024 * 1024) / 8 }); }
    const file = `${out}/${st.name}-${size.w}.png`;
    try {
      await page.goto(`${base}${st.path}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      if (st.loading) {
        await page.waitForSelector('.create-skeleton', { timeout: 60000 });
        await page.waitForTimeout(400);
        await page.screenshot({ path: file, fullPage: true });
      } else {
        await page.waitForSelector(st.wait ?? 'main h1', { timeout: st.cls ? 240000 : 60000 });
        await page.waitForFunction(() => !document.querySelector('.create-skeleton, .sk-region'), null, { timeout: 60000 }).catch(() => {});
        if (st.dev) await page.waitForSelector('.create-step', { timeout: 30000 });
        if (st.act) await st.act(page);
        await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); await document.fonts.ready; });
        await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(700);
        if (cdp) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
        await page.screenshot({ path: file, fullPage: true });
        // phones: the sticky action bar as the producer sees it, at the end of the page
        if (size.touch) { await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(300); await page.screenshot({ path: file.replace(/\.png$/, '-end.png') }); await page.evaluate(() => window.scrollTo(0, 0)); }
      }
      const m = st.loading ? null : await measure(page);
      const fontOk = !m || m.fonts.every((f) => /^(Geist|Geist Mono|__Geist)/i.test(f) || /Segoe UI|Tahoma|Geeza|Arabic/i.test(f));
      const checks = m ? { 'shared start edge': m.startOk, 'hub cards equal': m.cardsEqual, 'picker rows equal': m.picksEqual, 'fonts Geist': fontOk, 'no text < 12 px': m.small.length === 0, 'no horizontal overflow': m.overflow <= 0, 'no frame unavailable': m.unavailable === 0, ...(st.cls ? { 'CLS < 0.02': m.cls < 0.02 } : {}) } : { 'skeleton shown': true };
      const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
      failed += bad.length;
      report.push({ state: st.name, size: `${size.w}×${size.h}`, file, ...(m ?? {}), checks });
      console.log(`${size.w} ${st.name}: ${bad.length ? `✗ ${bad.join(', ')}` : '✓'}${m ? ` · start x ${m.starts.join('/')}${m.offenders.length ? ` (${m.offenders.join(', ')})` : ''}${st.cls ? ` · CLS ${m.cls.toFixed(4)}${m.shifts.length ? ` ${JSON.stringify(m.shifts)}` : ''}` : ''}${m.small.length ? ` · small ${m.small.join('; ')}` : ''}${m.overflow > 0 ? ` · overflow ${m.overflow}` : ''} · fonts ${m.fonts.join(', ')}` : ''}`);
    } catch (e) {
      if (attempt < 3) { console.log(`  ${size.w} ${st.name}: not ready (${e.message.split('\n')[0].slice(0, 80)}), opening again`); await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {}); await ctx.close(); continue; }
      failed += 1;
      console.log(`${size.w} ${st.name}: ✗ ${e.message.split('\n')[0]}`);
      report.push({ state: st.name, size: `${size.w}×${size.h}`, error: e.message.split('\n')[0] });
    }
    await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
    await ctx.close();
    break;
   }
  }
}
await browser.close();
await fs.writeFile(`${out}/acceptance.json`, `${JSON.stringify({ checked: new Date().toISOString(), base, idea: idea?.id ?? null, report }, null, 2)}\n`);
process.exitCode = failed ? 1 : 0;
