/** SCREENSHOTS — every major page at four widths, in English and Arabic, from the sample data. Evidence for the
 *  redesign, taken from the running prototype (start `pnpm dev` first).
 *
 *  Usage: pnpm shots [--rtl] [--out var/design/after] [--only home,shows]
 *  The last pass empties the studio (Settings → Start with an empty studio) and captures the empty states. */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i === -1 ? undefined : args[i + 1]; };
const RTL = args.includes('--rtl');
const OUT = flag('--out') ?? 'var/design/after';
const ONLY = flag('--only')?.split(',');
const BASE = process.env.BASE_URL ?? 'http://localhost:4200';
const EP = '/shows/last-sip/seasons/last-sip-s1/episodes/s1e1';

const PAGES: Array<[string, string]> = [
  ['home', '/'], ['shows', '/shows'], ['show-overview', '/shows/last-sip'], ['show-seasons', '/shows/last-sip?tab=seasons&season=last-sip-s1'], ['show-characters', '/shows/last-sip?tab=characters'], ['show-gallery', '/shows/last-sip?tab=gallery'], ['show-settings', '/shows/last-sip?tab=settings'],
  ['shorts', '/shorts'], ['short-overview', '/shorts/night-tray'], ['short-story', '/shorts/night-tray?tab=story'], ['short-storyboard', '/shorts/night-tray?tab=storyboard'], ['short-final', `${EP}?tab=final`],
  ['music-videos', '/music-videos'], ['music-video-overview', '/music-videos/river-lights'], ['music-video-song', '/music-videos/river-lights?tab=song'], ['music-video-performers', '/music-videos/river-lights?tab=performers'], ['music-video-visual', '/music-videos/river-lights?tab=visual'],
  ['characters', '/characters'], ['character-appearance', '/characters/layla'], ['character-voice', '/characters/abu-samir?tab=voice'], ['character-profile', '/characters/nour?tab=profile'], ['character-used', '/characters/layla?tab=used'],
  ['locations', '/locations'], ['location-overview', '/locations/cafe'], ['location-views', '/locations/cafe?tab=views'], ['location-lighting', '/locations/cafe?tab=lighting'], ['location-props', '/locations/cafe?tab=props'],
  ['assets', '/assets'], ['settings', '/settings'], ['wizard-show', '/new/show'], ['wizard-music-video', '/new/music-video'],
  ['episode-overview', EP], ['episode-storyboard', `${EP}?tab=storyboard`], ['episode-produce', '/shows/last-sip/seasons/last-sip-s1/episodes/s1e2?tab=produce'], ['shot-editor', `${EP}/shots/s1e1-2`],
];
const WIDTHS = [1440, 1024, 768, 390];

const browser = await chromium.launch();
for (const locale of RTL ? ['en', 'ar'] : ['en']) {
  const dir = join(OUT, locale); mkdirSync(dir, { recursive: true });
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    // start from the untouched samples once per pass; later navigations keep the chosen language
    await page.addInitScript((loc) => { try { if (!sessionStorage.getItem('shots-fresh')) { localStorage.removeItem('vewbox.studio.v1'); localStorage.setItem('vewbox.ui', JSON.stringify({ locale: loc })); sessionStorage.setItem('shots-fresh', '1'); } } catch { /* ignore */ } }, locale);
    if (locale === 'ar') { await page.goto(`${BASE}/settings`); await page.getByRole('radio', { name: 'العربية' }).click(); await page.waitForTimeout(300); }
    for (const [name, path] of PAGES) {
      if (ONLY && !ONLY.includes(name)) continue;
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(dir, `${name}-${w}.png`), fullPage: true });
      process.stdout.write(`${locale} ${w} ${name}\n`);
    }
    await ctx.close();
  }
}
// the empty studio: what a producer sees on day one
if (!ONLY) {
  const dir = join(OUT, 'empty'); mkdirSync(dir, { recursive: true });
  for (const w of [1440, 390]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.addInitScript(() => { try { if (!sessionStorage.getItem('shots-fresh')) { localStorage.removeItem('vewbox.studio.v1'); localStorage.setItem('vewbox.ui', JSON.stringify({ locale: 'en' })); sessionStorage.setItem('shots-fresh', '1'); } } catch { /* ignore */ } });
    await page.goto(`${BASE}/settings`);
    await page.getByRole('button', { name: 'Start with an empty studio' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Start with an empty studio' }).click();
    await page.getByText('The studio is empty.').first().waitFor();
    for (const [name, path] of [['home', '/'], ['shows', '/shows'], ['music-videos', '/music-videos'], ['characters', '/characters'], ['wizard-show', '/new/show'], ['wizard-music-video', '/new/music-video']] as Array<[string, string]>) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(dir, `${name}-${w}.png`), fullPage: true });
      process.stdout.write(`empty ${w} ${name}\n`);
    }
    await ctx.close();
  }
}
await browser.close();
console.log(`written to ${OUT}`);
