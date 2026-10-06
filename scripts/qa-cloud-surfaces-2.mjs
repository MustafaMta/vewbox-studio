// Follow-ups to qa-cloud-surfaces.mjs (2026-10-06): the boundary + editorial transition pair, unsaved people state on
// navigation, and the page errors seen at 390. Writes go to the test server under --base (a copy database) only.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const base = opt('base', 'http://localhost:4252');
const out = opt('out', 'docs/evidence/qa-2026-10-06/surfaces');
const health = await (await fetch(`${base}/api/health`)).json();
if (!health.testServer || health.testDatabase === 'vewbox') throw new Error('not a test server');
const P = 'short-efe98843f0', SHOT2 = 'shot-6ad9db5269', SHOT3 = 'shot-050ff6f102';
const ready = (page) => page.waitForFunction(() => { const m = document.querySelector('main'); return m && Object.keys(m).some((k) => k.startsWith('__reactFiber')) && !m.querySelector('[aria-busy="true"], .sk, [class*="-skeleton"]') && m.innerText.trim().length > 40; }, null, { timeout: 180_000 });
const results = [];
const step = async (name, fn) => { try { const note = await fn(); results.push({ step: name, ok: true, note }); console.log(`  ✓ ${name} — ${typeof note === 'string' ? note : JSON.stringify(note)}`); } catch (e) { results.push({ step: name, ok: false, note: e.message.split('\n')[0].slice(0, 300) }); console.log(`  ✗ ${name} — ${e.message.split('\n')[0].slice(0, 300)}`); } };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
const page = await ctx.newPage();
const dialogs = []; page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
await page.goto(`${base}/shorts/${P}/shots/${SHOT2}`, { waitUntil: 'domcontentloaded' }); await ready(page); await page.waitForTimeout(800);

await step('shot 2: inspector sections', async () => page.locator('summary').allTextContents());
await step('shot 2: boundary + editorial transition can contradict (Continuous + Fade), with no word on the page', async () => {
  for (const s of await page.locator('summary').allTextContents()) if (!/people|notes|details/i.test(s)) await page.locator('summary', { hasText: s }).first().evaluate((e) => { e.parentElement.open = true; });
  await page.waitForTimeout(300);
  const b = page.getByRole('radiogroup', { name: 'Join with the shot before' });
  const t = page.getByRole('radiogroup', { name: 'Editorial transition' });
  const before = { boundary: await b.locator('[aria-checked="true"]').textContent(), transition: await t.locator('[aria-checked="true"]').textContent(), options: await t.getByRole('radio').allTextContents() };
  await t.getByRole('radio', { name: 'Fade' }).click(); await page.waitForTimeout(300);
  const holder = page.locator('.ws-disc-body', { has: t });
  await holder.scrollIntoViewIfNeeded(); await holder.screenshot({ path: path.join(out, 'shot2-continuous-plus-fade-1440.png') });
  const words = (await holder.innerText()).replace(/\s+/g, ' ');
  const d = page.getByRole('button', { name: 'Discard' }); if (await d.count()) await d.first().click();
  return { before, afterChoosingFade: words.slice(0, 500) };
});
await step('shot 2: unsaved people state — footer and leaving the page', async () => {
  await page.locator('summary', { hasText: 'People and story state' }).evaluate((e) => { e.parentElement.open = true; });
  const person = page.locator('.ws-context-person').filter({ has: page.locator('legend', { hasText: 'Clara Hughes' }) });
  await person.getByRole('textbox').first().fill('QA: soaked from the rain');
  const foot = (await page.locator('.ws-insp-foot').innerText()).replace(/\s+/g, ' ');
  await page.locator('.ws-insp-foot').screenshot({ path: path.join(out, 'shot2-people-unsaved-footer-1440.png') });
  // leave by the next-shot key and by a link
  await page.locator('main h1, main').first().click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press(']'); await page.waitForTimeout(2500);
  const url1 = new URL(page.url()).pathname;
  const stored = (await (await fetch(`${base}/api/studio`)).json()).state.productions.find((p) => p.id === P).shots.find((s) => s.id === SHOT2).continuity.characters.find((c) => c.characterId === 'char-0556d14a04');
  return { footerWhileEditing: foot, dialogsShown: dialogs.slice(), afterKey: url1, storedCondition: stored.condition ?? '(none: the edit was dropped)' };
});
await browser.close();
await fs.writeFile(path.join(out, 'surfaces-2.json'), `${JSON.stringify({ checked: new Date().toISOString(), base, results }, null, 2)}\n`);
