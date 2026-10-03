// The headless-browser side of the v4 evidence tools (scripts/capture-evidence.mjs, scripts/v4-titles.mjs): sizes,
// the page sets of each package (docs/DESIGN-SYSTEM-V4.md §8.5), the fixture studio, and a page prepared so that it
// can never write. See capture-evidence.mjs for the command line.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

export const DEVICES = {
  desktop: { width: 1440, height: 900, touch: false },
  tablet: { width: 834, height: 1112, touch: true },
  phone: { width: 390, height: 844, touch: true },
};

/** The fixture studio (scripts/v4-fixture.ts) for a kind, or a JSON file of the same shape. */
export async function loadFixture(kindOrFile, motion = '') {
  if (!kindOrFile) return null;
  const f = /\.json$/i.test(kindOrFile)
    ? JSON.parse(await fs.readFile(kindOrFile, 'utf8'))
    : JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', 'scripts/v4-fixture.ts', kindOrFile], { encoding: 'utf8', maxBuffer: 64 << 20 }));
  if (motion) f.state.settings.reducedMotion = motion === 'reduce';
  return f;
}
export const fixtureName = (kindOrFile) => (kindOrFile ? (/\.json$/i.test(kindOrFile) ? path.basename(kindOrFile, '.json') : kindOrFile) : 'live');

// ---- page sets (§8.5): a page name and its path; a function receives the fixture to find ids -----------------------
const firstShot = (f, id, fallback) => f?.state.productions.find((p) => p.id === id)?.shots[0]?.id ?? fallback;
export const SETS = {
  // the 18 routes of the v4 audit (§9.1), on the sample studio's ids
  audit: [['shows', '/shows'], ['shorts', '/shorts'], ['music-videos', '/music-videos'], ['characters', '/characters'], ['character', '/characters/abu-samir'], ['characters-new', '/characters/new'], ['locations', '/locations'], ['locations-new', '/locations/new'], ['studio', '/studio'], ['department', '/studio/departments/CASTING'], ['agent', '/studio/agents/casting-director'], ['production', '/production'], ['screening', '/screening'], ['settings', '/settings'], ['new', '/new'], ['new-show', '/new/show'], ['assets', '/assets'], ['jobs', '/jobs']],
  // F1's before/after set: the shell, a lobby hero, tiles, a profile, the company and a form
  f1: [['shows', '/shows'], ['show', '/shows/last-sip'], ['characters', '/characters'], ['character', '/characters/layla'], ['studio', '/studio'], ['new-show', '/new/show']],
  p1a: [['shows', '/shows'], ['show', '/shows/last-sip'], ['show-seasons', '/shows/last-sip?tab=seasons'], ['show-episodes', '/shows/last-sip?tab=episodes'], ['show-cast', '/shows/last-sip?tab=characters'], ['show-world', '/shows/last-sip?tab=locations'], ['show-settings', '/shows/last-sip?tab=settings'], ['new', '/new'], ['new-show', '/new/show'], ['new-season', '/new/season?show=last-sip'], ['new-episode', '/new/episode?show=last-sip&season=last-sip-s1']],
  p1b: [['shorts', '/shorts'], ['short', '/shorts/night-tray'], ...['story', 'characters', 'locations', 'storyboard', 'produce', 'final'].map((t) => [`short-${t}`, `/shorts/night-tray?tab=${t}`]), ['episode', '/shows/last-sip/seasons/last-sip-s1/episodes/s1e1'], ['episode-storyboard', '/shows/last-sip/seasons/last-sip-s1/episodes/s1e1?tab=storyboard'], ['episode-shot', (f) => `/shows/last-sip/seasons/last-sip-s1/episodes/s1e1/shots/${firstShot(f, 's1e1', 'shot-1')}`], ['shot', (f) => `/shorts/night-tray/shots/${firstShot(f, 'night-tray', 'shot-1')}`]],
  p1c: [['music-videos', '/music-videos'], ['music-video', '/music-videos/river-lights'], ...['song', 'performers', 'visual', 'storyboard', 'produce', 'final'].map((t) => [`music-video-${t}`, `/music-videos/river-lights?tab=${t}`])],
  p2: [['characters', '/characters'], ['character', '/characters/abu-samir'], ['character-draft', '/characters/layla'], ['characters-new', '/characters/new?start=describe'], ['characters-new-sheet', '/characters/new?start=sheet'], ['characters-new-picture', '/characters/new?start=picture'], ['locations', '/locations'], ['location', '/locations/cafe'], ['locations-new', '/locations/new']],
  f4: [['shows', '/shows'], ['library', '/library'], ['projects', '/projects'], ['jobs', '/jobs'], ['new', '/new']],
  p3: [['studio', '/studio'], ['department', '/studio/departments/CASTING'], ['agent', '/studio/agents/casting-director'], ['production', '/production'], ['screening', '/screening'], ['settings', '/settings'], ['assets', '/assets']],
};

/** Route the page's own requests: writes are answered here and never sent; with a fixture, the studio's GETs are
 *  answered from it and the event stream is replaced in the page. */
export async function prepare(page, { fixture = null, motion = '' } = {}) {
  page.on('pageerror', (e) => console.log(`  page error: ${e.message.slice(0, 300)}`));
  await page.addInitScript(({ reduce, stubEvents }) => {
    try { if (reduce) localStorage.setItem('vewbox.ui', JSON.stringify({ motion: true })); } catch { /* fine */ }
    // writes never leave the capture
    try { Object.defineProperty(navigator, 'sendBeacon', { value: () => true, configurable: true }); } catch { /* fine */ }
    // the dev server's own badge is not part of the page
    document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'nextjs-portal{display:none!important}'; document.head.append(s); });
    if (stubEvents) {
      // the fixture's studio does not change: the event stream says hello once and stays open
      window.EventSource = class FixtureEvents {
        constructor(url) { this.url = String(url); this.readyState = 0; this.onerror = null; this.onmessage = null; this.onopen = null; this.l = {}; setTimeout(() => { this.readyState = 1; this.emit('hello', JSON.stringify({ type: 'hello', version: 1, at: new Date().toISOString() })); }, 30); }
        addEventListener(t, f) { (this.l[t] ??= []).push(f); }
        removeEventListener(t, f) { this.l[t] = (this.l[t] ?? []).filter((x) => x !== f); }
        emit(t, data) { const ev = new MessageEvent(t, { data }); for (const f of this.l[t] ?? []) f(ev); }
        close() { this.readyState = 2; }
      };
    }
  }, { reduce: motion === 'reduce', stubEvents: Boolean(fixture) });
  await page.route('**/api/**', async (route) => {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname;
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      if (p === '/api/commands') return route.fulfill({ json: { ok: true, version: 1, hash: 'capture', results: [] } });
      return route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'capture: writes are not sent' } } });
    }
    if (p === '/api/studio') {
      const res = await route.fetch();
      if (!res.ok()) return route.fulfill({ response: res }); // a dev server hiccup: the page retries on its own
      const body = await res.json();
      if (fixture) { body.state = structuredClone(fixture.state); body.version = 1; body.hash = 'fixture'; }
      else if (motion && body?.state?.settings) body.state.settings.reducedMotion = motion === 'reduce';
      return route.fulfill({ response: res, json: body });
    }
    if (fixture && p === '/api/jobs') return route.fulfill({ json: { jobs: fixture.jobs } });
    if (fixture && p.startsWith('/api/jobs/')) { const j = fixture.jobs.find((x) => x.id === decodeURIComponent(p.split('/')[3])); return j ? route.fulfill({ json: { job: j, events: [] } }) : route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'fixture' } } }); }
    if (fixture && p === '/api/studio/org/pipeline') return route.fulfill({ json: fixture.pipeline });
    return route.continue();
  });
}

/** Wait until the page has drawn its own content (not the shell's skeleton), its lazy pictures and its fonts. */
export async function ready(page, { motion = '', settle = true } = {}) {
  await page.waitForFunction(() => document.querySelector('main h1') && !/Reconnecting/.test(document.body.innerText), null, { timeout: 90_000 });
  await page.waitForFunction(() => !document.querySelector('main [aria-busy="true"]'), null, { timeout: 30_000 }).catch(() => {});
  if (!settle) return;
  await page.evaluate(async () => {
    const step = Math.max(400, window.innerHeight - 100);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
    window.scrollTo(0, 0);
    await Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); setTimeout(r, 4000); })));
    await document.fonts.ready;
  });
  await page.waitForTimeout(motion === 'reduce' ? 1200 : 2500);
}

/** Open one path in a fresh context (no connection carries over) and run `fn` on the ready page; a page that never
 *  becomes ready (the dev server can hand out a chunk mid-compile) is opened again, three times at most. */
export async function withPage(browser, { size, url, fixture, motion, contrast, settle = true }, fn) {
  for (let attempt = 1; ; attempt++) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, colorScheme: 'dark', ...(contrast ? { contrast } : {}), ...(size.touch ? { isMobile: true, hasTouch: true } : {}) });
    const page = await context.newPage();
    try {
      await prepare(page, { fixture, motion });
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await ready(page, { motion, settle });
      const r = await fn(page);
      await context.close();
      return r;
    } catch (e) {
      await context.close();
      if (attempt >= 3) throw e;
      console.log(`  retrying ${url}`);
    }
  }
}
