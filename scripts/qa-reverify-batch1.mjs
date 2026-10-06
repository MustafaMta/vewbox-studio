// Re-verification of QA batch 1 (2026-10-06) on a test server (copy database): Q2, Q3, Q4-UI, Q5, Q6, m1, m2, m4, m5,
// m6, p1. Writes go only to the server under --base.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const base = opt('base', 'http://localhost:4252');
const out = opt('out', 'docs/evidence/qa-2026-10-06/reverify');
await fs.mkdir(out, { recursive: true });
const health = await (await fetch(`${base}/api/health`)).json();
if (!health.testServer || health.testDatabase === 'vewbox') throw new Error('not a test server');
const P = 'short-efe98843f0', SHOT1 = 'shot-cb4a02d3cc', SHOT2 = 'shot-6ad9db5269', SHOT3 = 'shot-050ff6f102', CLARA = 'char-0556d14a04';
const prod = async () => (await (await fetch(`${base}/api/studio`)).json()).state.productions.find((p) => p.id === P);
const ready = (page) => page.waitForFunction(() => { const m = document.querySelector('main'); return m && Object.keys(m).some((k) => k.startsWith('__reactFiber')) && !m.querySelector('[aria-busy="true"], .sk, [class*="-skeleton"]') && m.innerText.trim().length > 40; }, null, { timeout: 240_000 });
const results = [];
const step = async (name, fn) => { try { const note = await fn(); results.push({ step: name, ok: true, note }); console.log(`  ✓ ${name} — ${typeof note === 'string' ? note : JSON.stringify(note)}`); } catch (e) { results.push({ step: name, ok: false, note: e.message.split('\n')[0].slice(0, 400) }); console.log(`  ✗ ${name} — ${e.message.split('\n')[0].slice(0, 400)}`); } };
const openAll = (page) => page.evaluate(() => document.querySelectorAll('main details').forEach((d) => { d.open = true; }));
const browser = await chromium.launch();

for (const [w, h, touch] of [[1440, 900, false], [390, 844, true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: 'dark', hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  const dialogs = []; let acceptDialogs = false; page.on('dialog', (d) => { dialogs.push(d.message()); if (acceptDialogs) d.accept(); else d.dismiss(); });
  const go = async (p) => { await page.goto(`${base}${p}`, { waitUntil: 'domcontentloaded', timeout: 240_000 }); await ready(page); await page.waitForTimeout(800); };
  console.log(`· ${w}`);

  await go(`/shorts/${P}/shots/${SHOT2}`); await openAll(page); await page.waitForTimeout(300);
  const clara = page.locator('.ws-context-person').filter({ has: page.locator('legend', { hasText: 'Clara Hughes' }) });
  if (w === 1440) {
    await step('m1: type into an EMPTY field, then erase it → Save offered?', async () => {
      const cond = clara.getByRole('textbox').first(); const before = await cond.inputValue();
      await cond.fill('x'); await cond.fill('');
      const dirty = await page.getByRole('button', { name: /Save the people/ }).isEnabled().catch(() => null);
      if (dirty) throw new Error(`Condition was "${before}"; after x/erase Save is enabled`);
      return `Condition was "${before}"; not dirty after x/erase`;
    });
    await step('m1: Moves → Left to right → Not set → Save offered?', async () => {
      const sel = page.getByRole('combobox', { name: /Clara Hughes moves/ }); await sel.selectOption('LEFT_TO_RIGHT'); await sel.selectOption('');
      const dirty = await page.getByRole('button', { name: /Save the people/ }).isEnabled().catch(() => null);
      if (dirty) throw new Error('Save enabled for a no-op'); return 'not dirty';
    });
    await step('Q2: unsaved people state — footer words, guard on `]`', async () => {
      await clara.getByRole('textbox').first().fill('QA: soaked from the rain');
      const foot = (await page.locator('.ws-insp-foot').innerText()).replace(/\s+/g, ' ');
      await page.locator('.ws-insp-foot').screenshot({ path: path.join(out, 'Q2-footer-1440.png') });
      await page.locator('main').first().click({ position: { x: 600, y: 10 } }).catch(() => {});
      await page.evaluate(() => document.activeElement?.blur?.());
      await page.keyboard.press(']'); await page.waitForTimeout(2500);
      const url = new URL(page.url()).pathname;
      const stayed = url.endsWith(SHOT2);
      const stored = (await prod()).shots.find((s) => s.id === SHOT2).continuity.characters.find((c) => c.characterId === CLARA).condition;
      if (!stayed && !dialogs.length) throw new Error(`left to ${url} with no warning; footer "${foot}"; stored ${stored ?? '(none)'}`);
      return { footer: foot, dialogs: dialogs.slice(), url, stored: stored ?? '(none)' };
    });
    acceptDialogs = true; await go(`/shorts/${P}/shots/${SHOT2}`);
    await openAll(page);
    await step('Q3: editorial transition options and contradiction', async () => {
      const t = page.getByRole('radiogroup', { name: /transition/i });
      const n = await t.count();
      const opts = n ? await t.first().getByRole('radio').allTextContents() : [];
      const b = page.getByRole('radiogroup', { name: 'Join with the shot before' });
      const holder = page.locator('.ws-disc-body', { has: b });
      await holder.screenshot({ path: path.join(out, 'Q3-boundary-1440.png') });
      return { transitionGroups: n, options: opts, text: (await holder.innerText()).replace(/\s+/g, ' ').split('Join with the shot before')[1]?.slice(0, 400) };
    });
    await step('m6: Cut boundary help text', async () => {
      const b = page.getByRole('radiogroup', { name: 'Join with the shot before' });
      const radios = await b.getByRole('radio').evaluateAll((rs) => rs.map((x) => `${x.textContent.trim()}${x.disabled ? ' (disabled)' : ''}`)); await b.getByRole('radio', { name: 'Cut', exact: true }).click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(200);
      const t = (await page.locator('.field', { has: b }).innerText()).replace(/\s+/g, ' ');
      const d = page.getByRole('button', { name: 'Discard' }); if (await d.count()) await d.first().click();
      return { radios, t };
    });
    await step('Q6: Review badge on take cards (shot 1.2 takes have a failed place check)', async () => {
      const cards = await page.locator('li:has(.ws-take-name)').evaluateAll((els) => els.map((e) => ({ text: e.innerText.replace(/\s+/g, ' ').slice(0, 160), badge: Boolean(e.querySelector('.badge-wait, [class*="badge"]')) })));
      await page.locator('.ws-takes').screenshot({ path: path.join(out, 'Q6-takes-shot2-1440.png') });
      return cards;
    });
    // m2: the film's first shot
    await go(`/shorts/${P}/shots/${SHOT1}`); await openAll(page);
    await step('m2: first shot — Continuous/Cut offered?', async () => {
      const b = page.getByRole('radiogroup', { name: 'Join with the shot before' });
      if (!(await b.count())) return 'no boundary control on the first shot';
      const r = await b.getByRole('radio').evaluateAll((rs) => rs.map((x) => `${x.textContent.trim()}${x.disabled ? ' (disabled)' : ''}`));
      const t = (await page.locator('.field', { has: b }).innerText()).replace(/\s+/g, ' ');
      return { radios: r, text: t.slice(0, 300) };
    });
    // Q5 / m5: scene story rows
    await go(`/shorts/${P}/production?tab=story`);
    await step('m5: "Add a change" stores nothing until text is typed', async () => {
      const before = JSON.stringify((await prod()).scenes[0].story ?? {});
      await page.getByRole('button', { name: /Add a change/ }).first().click(); await page.waitForTimeout(1200);
      const after = JSON.stringify((await prod()).scenes[0].story ?? {});
      return { storedChanged: before !== after, after: after.slice(0, 300) };
    });
    await step('Q5: change row layout at 1440', async () => {
      await page.getByRole('button', { name: /Add an event/ }).first().click().catch(() => {});
      await page.getByRole('button', { name: /Add what someone learns/ }).first().click().catch(() => {});
      await page.waitForTimeout(600);
      const fsx = page.locator('.ws-scene-story').first(); await fsx.scrollIntoViewIfNeeded(); await fsx.screenshot({ path: path.join(out, 'Q5-scene-story-1440.png') });
      return page.evaluate(() => [...document.querySelectorAll('.ws-scene-story input, .ws-scene-story select, .ws-scene-story button')].map((e) => { const b = e.getBoundingClientRect(); return `${e.tagName.toLowerCase()}[${e.getAttribute('aria-label') ?? e.textContent.trim().slice(0, 20)}] ${Math.round(b.width)}×${Math.round(b.height)}@${Math.round(b.x)},${Math.round(b.y)}`; }));
    });
    // Q4-UI / m4: the final cut export panel
    await go(`/shorts/${P}/production?tab=final`);
    await step('Q4-UI / m4: export subtitle choices for an English film; disabled reason linked', async () => {
      const side = page.locator('aside.ws-split-side');
      const txt = (await side.innerText()).replace(/\s+/g, ' ');
      const exp = page.getByRole('button', { name: 'Export', exact: true });
      const info = await exp.evaluate((b) => ({ disabled: b.disabled, describedby: b.getAttribute('aria-describedby'), reason: b.getAttribute('aria-describedby') ? document.getElementById(b.getAttribute('aria-describedby'))?.textContent : null }));
      await side.screenshot({ path: path.join(out, 'Q4-export-1440.png') });
      return { subtitlesPart: txt.slice(txt.indexOf('Export'), txt.indexOf('Export') + 260), exportButton: info };
    });
  } else {
    await go(`/shorts/${P}/production?tab=story`);
    await step('Q5: rows at 390', async () => {
      await page.getByRole('button', { name: /Add a change/ }).first().click().catch(() => {});
      await page.getByRole('button', { name: /Add an event/ }).first().click().catch(() => {});
      await page.getByRole('button', { name: /Add what someone learns/ }).first().click().catch(() => {});
      await page.waitForTimeout(600);
      const fsx = page.locator('.ws-scene-story').first(); await fsx.scrollIntoViewIfNeeded(); await fsx.screenshot({ path: path.join(out, 'Q5-scene-story-390.png') });
      return page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, controls: [...document.querySelectorAll('.ws-scene-story input, .ws-scene-story select, .ws-scene-story button')].map((e) => { const b = e.getBoundingClientRect(); return `${e.tagName.toLowerCase()}[${e.getAttribute('aria-label') ?? e.type}] ${Math.round(b.width)}×${Math.round(b.height)}`; }) }));
    });
  }
  await ctx.close();
}
await browser.close();
await fs.writeFile(path.join(out, 'reverify.json'), `${JSON.stringify({ checked: new Date().toISOString(), base, results }, null, 2)}\n`);
