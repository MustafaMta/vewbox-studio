// Capture full-page screenshots of the studio's pages as evidence (headless Chromium via Playwright).
//
//   node scripts/capture-evidence.mjs [--base http://localhost:4200] [--out docs/evidence] [--prefix studio]
//        [--width 1440 | --device desktop,tablet,phone] [--lang en,ar] [--suffix -ar-desktop]
//        [--fixture sample|empty|states|<file.json>] [--set <pkg>] [--motion reduce] [--axe] [path ...]
//
// Pages:   the paths given, or with --set <pkg> that package's page list (SETS below; docs/DESIGN-SYSTEM-V4.md §8.5).
// Sizes:   --width <px> (a phone below 768), or --device: desktop 1440×900 · tablet 834×1112 touch · phone 390×844 touch.
//          Several devices and languages may be listed (comma-separated): every page is captured in each combination.
// Files:   <out>/<prefix>-<slug><suffix>.png. With several devices or languages and no --suffix, the suffix is
//          -<lang>-<width>. With --set: <out>/v4-<pkg>-<page>-<state>-<lang>-<width>.png (state = the fixture, or live).
// Data:    by default the live studio, read-only. --lang answers the studio snapshot with settings.uiLanguage = <lang>
//          for this browser only. --fixture answers the browser's own GET /api/studio, /api/jobs[/:id] and
//          /api/studio/org/pipeline from scripts/v4-fixture.ts (or a JSON file of the same shape) and replaces the
//          event stream in the page; media and the organisation are read from the server as they are.
// Writes:  NEVER sent, in every mode: a POST/PUT/PATCH/DELETE to /api/* is answered here (commands "accepted",
//          anything else refused) and navigator.sendBeacon is a no-op. A capture cannot change a record.
// --motion reduce  renders with reduced motion (deterministic: no live-dot loop, no fades mid-way) — use it for
//                  before/after comparisons.
// --axe     runs axe-core on each page when @axe-core/playwright is installed (a devDependency to approve, §8.4) and
//           writes <file>.axe.json; without it the run says so and captures anyway.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); if (i === -1) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (name) => { const i = args.indexOf(`--${name}`); if (i === -1) return false; args.splice(i, 1); return true; };
// localhost, not 127.0.0.1: the dev server's event stream only settles for the origin the app was opened on
const base = opt('base', 'http://localhost:4200');
const out = opt('out', 'docs/evidence');
const setName = opt('set', '');
const prefix = opt('prefix', setName ? 'v4' : 'studio');
const widthOpt = opt('width', '');
const deviceOpt = opt('device', '');
const langOpt = opt('lang', '');
const suffixOpt = opt('suffix', null);
const fixtureOpt = opt('fixture', '');
const motion = opt('motion', '');
const axe = flag('axe');

const DEVICES = {
  desktop: { width: 1440, height: 900, touch: false },
  tablet: { width: 834, height: 1112, touch: true },
  phone: { width: 390, height: 844, touch: true },
};
const sizes = deviceOpt
  ? deviceOpt.split(',').map((d) => { const s = DEVICES[d.trim()]; if (!s) throw new Error(`unknown device "${d}" (desktop, tablet, phone)`); return s; })
  : (widthOpt || '1440').split(',').map((w) => { const width = Number(w); const phone = width < 768; return { width, height: phone ? 844 : 900, touch: phone }; });
const langs = langOpt ? langOpt.split(',').map((l) => l.trim()) : [''];
const matrix = sizes.length > 1 || langs.length > 1;

// ---- the fixture ---------------------------------------------------------------------------------------------------
const fixtures = {};
async function loadFixture(lang) {
  if (!fixtureOpt) return null;
  const key = lang || 'en';
  if (fixtures[key]) return fixtures[key];
  let f;
  if (/\.json$/i.test(fixtureOpt)) f = JSON.parse(await fs.readFile(fixtureOpt, 'utf8'));
  else f = JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', 'scripts/v4-fixture.ts', fixtureOpt, '--lang', key], { encoding: 'utf8', maxBuffer: 64 << 20 }));
  if (lang) f.state.settings.uiLanguage = lang;
  if (motion) f.state.settings.reducedMotion = motion === 'reduce';
  return (fixtures[key] = f);
}
const stateName = fixtureOpt ? (/\.json$/i.test(fixtureOpt) ? path.basename(fixtureOpt, '.json') : fixtureOpt) : 'live';

// ---- page sets (§8.5): a page name and its path; a function receives the fixture to find ids ------------------------
const prodOf = (f, id) => f?.state.productions.find((p) => p.id === id);
const firstShot = (f, id, fallback) => prodOf(f, id)?.shots[0]?.id ?? fallback;
const SETS = {
  // the 18 routes of the v4 audit (§9.1), on the sample studio's ids
  audit: [['shows', '/shows'], ['shorts', '/shorts'], ['music-videos', '/music-videos'], ['characters', '/characters'], ['character', '/characters/abu-samir'], ['characters-new', '/characters/new'], ['locations', '/locations'], ['locations-new', '/locations/new'], ['studio', '/studio'], ['department', '/studio/departments/CASTING'], ['agent', '/studio/agents/casting-director'], ['production', '/production'], ['screening', '/screening'], ['settings', '/settings'], ['new', '/new'], ['new-show', '/new/show'], ['assets', '/assets'], ['jobs', '/jobs']],
  // F1's before/after set: the shell, a lobby hero, tiles, a profile, the company and a form
  f1: [['shows', '/shows'], ['show', '/shows/last-sip'], ['characters', '/characters'], ['character', '/characters/layla'], ['studio', '/studio'], ['new-show', '/new/show']],
  p1a: [['shows', '/shows'], ['show', '/shows/last-sip'], ['show-seasons', '/shows/last-sip?tab=seasons'], ['show-episodes', '/shows/last-sip?tab=episodes'], ['show-cast', '/shows/last-sip?tab=characters'], ['show-world', '/shows/last-sip?tab=locations'], ['show-settings', '/shows/last-sip?tab=settings'], ['new', '/new'], ['new-show', '/new/show'], ['new-season', '/new/season?show=last-sip'], ['new-episode', '/new/episode?show=last-sip&season=last-sip-s1']],
  p1b: [['shorts', '/shorts'], ['short', '/shorts/night-tray'], ...['story', 'characters', 'locations', 'storyboard', 'produce', 'final'].map((t) => [`short-${t}`, `/shorts/night-tray?tab=${t}`]), ['episode', '/shows/last-sip/seasons/last-sip-s1/episodes/s1e1'], ['shot', (f) => `/shorts/night-tray/shots/${firstShot(f, 'night-tray', 'shot-1')}`]],
  p1c: [['music-videos', '/music-videos'], ['music-video', '/music-videos/river-lights'], ...['song', 'performers', 'visual', 'storyboard', 'produce', 'final'].map((t) => [`music-video-${t}`, `/music-videos/river-lights?tab=${t}`])],
  p2: [['characters', '/characters'], ['character', '/characters/abu-samir'], ['character-draft', '/characters/layla'], ['characters-new', '/characters/new?start=describe'], ['characters-new-sheet', '/characters/new?start=sheet'], ['characters-new-picture', '/characters/new?start=picture'], ['locations', '/locations'], ['location', '/locations/cafe'], ['locations-new', '/locations/new']],
  p3: [['studio', '/studio'], ['department', '/studio/departments/CASTING'], ['agent', '/studio/agents/casting-director'], ['production', '/production'], ['screening', '/screening'], ['settings', '/settings'], ['assets', '/assets']],
};

let pages;
if (setName) {
  const set = SETS[setName];
  if (!set) throw new Error(`unknown set "${setName}" (${Object.keys(SETS).join(', ')})`);
  pages = set.map(([name, p]) => ({ name, path: p }));
} else {
  pages = (args.length ? args : ['/studio']).map((p) => ({ name: p.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home', path: p }));
}

// ---- axe (optional) ------------------------------------------------------------------------------------------------
let AxeBuilder = null;
if (axe) {
  try { AxeBuilder = (await import('@axe-core/playwright')).default; }
  catch { console.log('--axe: @axe-core/playwright is not installed (devDependency to approve, DESIGN-SYSTEM-V4 §8.4); capturing without it'); }
}

// ---- one page ------------------------------------------------------------------------------------------------------
async function prepare(page, lang, fixture) {
  page.on('pageerror', (e) => console.log(`  page error: ${e.message.slice(0, 300)}`));
  await page.addInitScript(({ l, reduce, stubEvents }) => {
    try { if (l) localStorage.setItem('vewbox.ui', JSON.stringify({ locale: l, motion: reduce })); } catch { /* fine */ }
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
  }, { l: lang, reduce: motion === 'reduce', stubEvents: Boolean(fixture) });
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
      else {
        if (lang && body?.state?.settings) body.state.settings.uiLanguage = lang;
        if (motion && body?.state?.settings) body.state.settings.reducedMotion = motion === 'reduce';
      }
      return route.fulfill({ response: res, json: body });
    }
    if (fixture && p === '/api/jobs') return route.fulfill({ json: { jobs: fixture.jobs } });
    if (fixture && p.startsWith('/api/jobs/')) { const j = fixture.jobs.find((x) => x.id === decodeURIComponent(p.split('/')[3])); return j ? route.fulfill({ json: { job: j, events: [] } }) : route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'fixture' } } }); }
    if (fixture && p === '/api/studio/org/pipeline') return route.fulfill({ json: fixture.pipeline });
    return route.continue();
  });
}

async function ready(page) {
  // the shell renders a skeleton until the snapshot and the event stream are in; wait for the page's own heading
  await page.waitForFunction(() => document.querySelector('main h1') && !/Reconnecting/.test(document.body.innerText), null, { timeout: 90_000 });
  // pages draw a skeleton (aria-busy) until their live data is in; wait for it to go
  await page.waitForFunction(() => !document.querySelector('main [aria-busy="true"]'), null, { timeout: 30_000 }).catch(() => {});
  // lazy pictures below the fold load only when scrolled to: walk the page once, then back to the top
  await page.evaluate(async () => {
    const step = Math.max(400, window.innerHeight - 100);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
    window.scrollTo(0, 0);
    await Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); setTimeout(r, 4000); })));
    await document.fonts.ready;
  });
  await page.waitForTimeout(motion === 'reduce' ? 1200 : 2500);
}

await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch();
for (const size of sizes) {
  for (const lang of langs) {
    const fixture = await loadFixture(lang);
    for (const pg of pages) {
      const target = typeof pg.path === 'function' ? pg.path(fixture) : pg.path;
      const file = setName
        ? path.join(out, `${prefix}-${setName}-${pg.name}-${stateName}-${lang || 'en'}-${size.width}.png`)
        : path.join(out, `${prefix}-${pg.name}${suffixOpt ?? (matrix ? `-${lang || 'en'}-${size.width}` : '')}.png`);
      // a fresh browser context per page: the previous page's event stream never holds a connection the next one
      // needs; the dev server can hand out a chunk mid-compile, so a page that never becomes ready is opened again
      for (let attempt = 1; ; attempt++) {
        const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, colorScheme: 'dark', ...(size.touch ? { isMobile: true, hasTouch: true } : {}) });
        const page = await context.newPage();
        try {
          await prepare(page, lang, fixture);
          await page.goto(`${base}${target}`, { waitUntil: 'domcontentloaded' });
          await ready(page);
          await page.screenshot({ path: file, fullPage: true });
          const info = await page.evaluate(() => ({ title: document.title, overflow: document.documentElement.scrollWidth - window.innerWidth }));
          let axeNote = '';
          if (AxeBuilder) {
            const r = await new AxeBuilder({ page }).analyze();
            const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
            await fs.writeFile(file.replace(/\.png$/, '.axe.json'), JSON.stringify(r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length })), null, 2));
            axeNote = `  axe: ${bad.length} serious/critical`;
          }
          console.log(`${target} → ${file}  «${info.title}»${info.overflow > 0 ? `  (horizontal overflow ${info.overflow}px)` : ''}${axeNote}`);
          await context.close();
          break;
        } catch (e) {
          await context.close();
          if (attempt >= 3) { console.log(`${target} FAILED: ${e.message.split('\n')[0]}`); break; }
          console.log(`  retrying ${target}`);
        }
      }
    }
  }
}
await browser.close();
