import { chromium, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** Screenshots of states that need a few clicks first: the Auto Idea review, a pending reference, players mid-play,
 *  the compact player, dialogs. Usage: tsx tools/capture-states.mts <base> <outDir> [--rtl] */
const [base = 'http://localhost:4200', out = 'var/design/states', ...flags] = process.argv.slice(2);
const rtl = flags.includes('--rtl');
mkdirSync(out, { recursive: true });
const png = { name: 'reference.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') };

type Shot = [string, (p: Page) => Promise<void>, boolean?];
const shots: Shot[] = [
  ['auto-review', async (p) => { await p.goto(`${base}/new/short`); await p.getByRole('button', { name: rtl ? 'اصنع لي فكرة' : 'Create an idea for me' }).click(); await p.waitForTimeout(300); }, true],
  ['auto-preferences', async (p) => { await p.goto(`${base}/new/music-video`); await p.locator('details summary').first().click(); await p.waitForTimeout(200); }, true],
  ['auto-episode', async (p) => { await p.goto(`${base}/new/episode?show=last-sip&season=last-sip-s2`); await p.getByRole('button', { name: rtl ? 'اصنع لي فكرة' : 'Create an idea for me' }).click(); await p.waitForTimeout(300); }, true],
  ['manual-brief', async (p) => { await p.goto(`${base}/new/short`); await p.getByRole('button', { name: rtl ? 'اكتب موجزي' : 'Write my brief' }).click(); await p.getByRole('button', { name: rtl ? 'التالي' : 'Next', exact: true }).click(); await p.waitForTimeout(200); }],
  ['character-pending-ref', async (p) => { await p.goto(`${base}/characters/nour`); await p.locator('input[type=file]').first().setInputFiles(png); await p.waitForTimeout(600); }, true],
  ['character-locked', async (p) => { await p.goto(`${base}/characters/layla`); await p.waitForTimeout(300); }, true],
  ['character-unknown', async (p) => { await p.goto(`${base}/characters/um-hassan`); await p.waitForTimeout(300); }],
  ['character-voice-playing', async (p) => { await p.goto(`${base}/characters/abu-samir?tab=voice`); await p.getByRole('radiogroup').getByRole('button').first().click(); await p.waitForTimeout(1200); }, true],
  ['character-used-in', async (p) => { await p.goto(`${base}/characters/layla?tab=used`); await p.waitForTimeout(300); }],
  ['character-profile', async (p) => { await p.goto(`${base}/characters/karim?tab=profile`); await p.waitForTimeout(300); }],
  ['character-edit-locked', async (p) => { await p.goto(`${base}/characters/layla`); await p.getByRole('button', { name: rtl ? 'عدّل الملف' : 'Edit profile' }).click(); await p.waitForTimeout(300); }],
  ['song-playing', async (p) => { await p.goto(`${base}/music-videos/river-lights?tab=song`); await p.locator('[role=group] .transport-primary').first().click(); await p.waitForTimeout(1500); await p.getByRole('button', { name: rtl ? /تشغيل/ : /Play Chorus/ }).first().click(); await p.waitForTimeout(800); }, true],
  ['song-mini-player', async (p) => { await p.goto(`${base}/music-videos/river-lights?tab=song`); await p.locator('[role=group] .transport-primary').first().click(); await p.waitForTimeout(800); await p.mouse.wheel(0, 1500); await p.waitForTimeout(600); }],
  ['video-paused', async (p) => { await p.goto(`${base}/shows/last-sip/seasons/last-sip-s1/episodes/s1e1/shots/s1e1-1`); await p.waitForTimeout(600); }, true],
  ['video-no-take', async (p) => { await p.goto(`${base}/shows/last-sip/seasons/last-sip-s1/episodes/s1e2/shots/s1e2-4`); await p.getByRole('radio').first().click(); await p.waitForTimeout(300); }],
  ['final-cut', async (p) => { await p.goto(`${base}/shows/last-sip/seasons/last-sip-s1/episodes/s1e1?tab=final`); await p.waitForTimeout(600); }],
  ['characters', async (p) => { await p.goto(`${base}/characters`); await p.waitForTimeout(400); }, true],
];

const browser = await chromium.launch();
for (const w of [1440, 768, 390]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript((loc) => { try { if (!sessionStorage.getItem('states-fresh')) { localStorage.removeItem('vewbox.studio.v1'); localStorage.setItem('vewbox.ui', JSON.stringify({ locale: loc })); sessionStorage.setItem('states-fresh', '1'); } } catch { /* ignore */ } }, rtl ? 'ar' : 'en');
  const page = await ctx.newPage();
  if (rtl) { await page.goto(`${base}/settings`); await page.getByRole('radio', { name: 'العربية' }).click(); await page.waitForTimeout(300); }
  for (const [name, go, allWidths] of shots) {
    if (w !== 1440 && !allWidths) continue;
    try { await go(page); await page.screenshot({ path: join(out, `${rtl ? 'ar-' : ''}${name}-${w}.png`), fullPage: true }); process.stdout.write(`${w} ${name} ok\n`); }
    catch (e) { process.stdout.write(`${w} ${name} FAILED ${(e as Error).message.split('\n')[0]}\n`); }
  }
  await ctx.close();
}
await browser.close();
