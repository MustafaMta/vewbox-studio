// Independent QA of the cloud session's new production surfaces (2026-10-06): the shot's "People and story state"
// (ShotContext), the scene's "What the scene changes" (SceneStory), the boundary modes, the Final cut summary.
// WRITES go to the server under --base, which must be a test server on a COPY database (checked through /api/health).
//
//   node scripts/qa-cloud-surfaces.mjs --base http://localhost:4252 --out docs/evidence/qa-2026-10-06/surfaces
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const base = opt('base', 'http://localhost:4252');
const out = opt('out', 'docs/evidence/qa-2026-10-06/surfaces');
await fs.mkdir(out, { recursive: true });
const health = await (await fetch(`${base}/api/health`)).json();
if (!health.testServer || !health.testDatabase || health.testDatabase === 'vewbox') throw new Error(`refusing: ${base} is not a test server on a copy database`);

const P = 'short-efe98843f0';
const SHOT1 = 'shot-cb4a02d3cc', SHOT2 = 'shot-6ad9db5269', SHOT3 = 'shot-050ff6f102';
const CLARA = 'char-0556d14a04';
const studio = async () => (await (await fetch(`${base}/api/studio`)).json()).state;
const prod = async () => (await studio()).productions.find((p) => p.id === P);
const results = [];
const step = async (name, fn) => { try { const note = await fn(); results.push({ step: name, ok: true, note }); console.log(`  ✓ ${name}${note ? ` — ${typeof note === 'string' ? note : JSON.stringify(note)}` : ''}`); } catch (e) { results.push({ step: name, ok: false, note: e.message.split('\n')[0].slice(0, 300) }); console.log(`  ✗ ${name} — ${e.message.split('\n')[0].slice(0, 300)}`); } };
const ready = (page) => page.waitForFunction(() => { const m = document.querySelector('main'); return m && Object.keys(m).some((k) => k.startsWith('__reactFiber')) && !m.querySelector('[aria-busy="true"], .sk, [class*="-skeleton"]') && m.innerText.trim().length > 40; }, null, { timeout: 180_000 });

const browser = await chromium.launch();
for (const [w, h, touch] of [[1440, 900, false], [390, 844, true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: 'dark', hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200))); page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });
  const posts = []; page.on('request', (r) => { if (r.method() !== 'GET' && /\/api\//.test(r.url())) posts.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'nextjs-portal{display:none!important}'; document.head.append(s); }); });
  const snap = (n, full = false) => page.screenshot({ path: path.join(out, `${n}-${w}.png`), fullPage: full });
  console.log(`· ${w}`);

  // ---- the shot page: people and story state
  await page.goto(`${base}/shorts/${P}/shots/${SHOT2}`, { waitUntil: 'domcontentloaded' }); await ready(page); await page.waitForTimeout(800);
  await step(`${w} shot 2: "People and story state" opens`, async () => {
    const sum = page.locator('summary', { hasText: 'People and story state' }); await sum.scrollIntoViewIfNeeded(); await sum.click(); await page.waitForTimeout(400);
    const box = page.locator('.ws-context'); await box.scrollIntoViewIfNeeded(); await box.screenshot({ path: path.join(out, `shot2-context-${w}.png`) });
    const legends = await page.locator('.ws-context-person legend').allTextContents();
    const dl = (await page.locator('.ws-context-next').innerText()).replace(/\s+/g, ' ');
    const overflow = await page.evaluate(() => [...document.querySelectorAll('.ws-context *')].filter((e) => { const b = e.getBoundingClientRect(); return b.right > window.innerWidth + 1; }).map((e) => `${e.tagName.toLowerCase()}.${e.className}`).slice(0, 5));
    return { legends, next: dl.slice(0, 400), overflow };
  });
  await step(`${w} shot 2: fields, labels and hit areas`, async () => page.evaluate(() => [...document.querySelectorAll('.ws-context input, .ws-context select, .ws-context button')].map((e) => { const b = e.getBoundingClientRect(); const id = e.id; const lab = id ? document.querySelector(`label[for="${id}"]`)?.textContent : e.closest('label')?.textContent; return `${e.tagName.toLowerCase()} "${(e.getAttribute('aria-label') || lab || e.textContent || e.getAttribute('placeholder') || '').trim().slice(0, 28)}" ${Math.round(b.width)}×${Math.round(b.height)}`; })));
  if (w === 1440) {
    await step('shot 2: save Clara\'s condition → stored on the shot', async () => {
      const fs1 = page.locator('.ws-context-person').filter({ hasText: 'Clara' });
      const cond = fs1.getByRole('textbox').first(); await cond.fill('QA: out of breath');
      const save = page.getByRole('button', { name: 'Save the people’s state' });
      const en = await save.isEnabled(); await save.click(); await page.waitForTimeout(1500);
      const sh = (await prod()).shots.find((s) => s.id === SHOT2);
      const c = sh.continuity?.characters.find((x) => x.characterId === CLARA);
      const after = await page.getByRole('button', { name: 'Save the people’s state' }).isEnabled();
      await snap('shot2-context-saved');
      if (c?.condition !== 'QA: out of breath') throw new Error(`stored: ${JSON.stringify(c)}`);
      return `enabled before ${en}; stored ${JSON.stringify(c)}; Save enabled after save: ${after}; continuity v${sh.continuity.version}`;
    });
    await step('shot 2: type then erase (no real change) → is Save still offered?', async () => {
      const fs1 = page.locator('.ws-context-person').filter({ hasText: 'Clara' });
      const emo = fs1.getByRole('textbox').nth(1); await emo.fill('x'); await emo.fill('');
      const dirty = await page.getByRole('button', { name: 'Save the people’s state' }).isEnabled();
      const discard = await page.getByRole('button', { name: 'Discard' }).count();
      await page.locator('.ws-context').screenshot({ path: path.join(out, 'shot2-phantom-dirty-1440.png') });
      if (dirty) throw new Error(`Save the people’s state is enabled and Discard shown (${discard}) although nothing changed (empty string vs absent field)`);
      return 'not dirty';
    });
    await step('shot 2: Moves → Left to right → Not set (no real change) → is Save still offered?', async () => {
      const d = page.getByRole('button', { name: 'Discard' }); if (await d.count()) await d.first().click();
      const sel = page.getByRole('combobox', { name: /Clara Hughes moves/ });
      await sel.selectOption('LEFT_TO_RIGHT'); await sel.selectOption('');
      const dirty = await page.getByRole('button', { name: 'Save the people’s state' }).isEnabled();
      if (dirty) {
        // what does saving it do?
        await page.getByRole('button', { name: 'Save the people’s state' }).click(); await page.waitForTimeout(1200);
        const c = (await prod()).shots.find((s) => s.id === SHOT2).continuity?.characters.find((x) => x.characterId === CLARA);
        throw new Error(`Save offered for a no-op; after saving, stored: ${JSON.stringify(c)}`);
      }
      return 'not dirty';
    });
    await step('shot 2: "With" chips toggle aria-pressed', async () => {
      const chip = page.locator('.ws-context-person').filter({ hasText: 'Clara' }).locator('.chip').first();
      if (!(await chip.count())) return 'no With chips';
      const a = await chip.getAttribute('aria-pressed'); await chip.click(); const b = await chip.getAttribute('aria-pressed'); await chip.click();
      return `${a} → ${b}`;
    });
    await step('shot 2: keyboard reaches the context fields with a visible ring', async () => {
      const first = page.locator('.ws-context input').first(); await first.focus(); const rings = [];
      for (let i = 0; i < 8; i++) { rings.push(await page.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e); return `${e.tagName.toLowerCase()}${e.getAttribute('aria-label') ? `[${e.getAttribute('aria-label').slice(0, 20)}]` : ''} ${cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 ? 'ring' : cs.boxShadow !== 'none' ? 'shadow' : 'NO RING'}`; })); await page.keyboard.press('Tab'); }
      return rings.join(' · ');
    });
    // boundary
    await step('shot 2: boundary control and editorial transition (contradiction allowed?)', async () => {
      const det = page.locator('summary', { hasText: /^Camera|Framing and camera|Camera and framing/ });
      const sums = await page.locator('summary.ws-disc-sum').allTextContents();
      for (const s of sums) if (/camera/i.test(s)) await page.locator('summary.ws-disc-sum', { hasText: s }).first().click();
      await page.waitForTimeout(300);
      const b = page.getByRole('radiogroup', { name: 'Join with the shot before' }); await b.scrollIntoViewIfNeeded();
      const bv = await b.locator('[aria-checked="true"]').textContent();
      const t = page.getByRole('radiogroup', { name: 'Editorial transition' });
      const tv = await t.locator('[aria-checked="true"]').textContent();
      const topts = await t.getByRole('radio').allTextContents();
      await t.getByRole('radio', { name: 'Fade' }).click().catch(() => {});
      await page.waitForTimeout(200);
      const field = page.locator('.field', { has: b });
      await page.locator('.ws-disc-body', { has: b }).screenshot({ path: path.join(out, 'shot2-boundary-fade-1440.png') });
      const warn = (await page.locator('.ws-disc-body', { has: b }).innerText()).replace(/\s+/g, ' ');
      const disc = page.getByRole('button', { name: 'Discard' }); if (await disc.count()) await disc.first().click();
      return { summaries: sums, boundary: bv, transition: tv, options: topts, textAfterChoosingFade: warn.slice(0, 400) };
    });
  }

  // ---- shot 1 (first in the film): what does "Join with the shot before" say?
  await page.goto(`${base}/shorts/${P}/shots/${SHOT1}`, { waitUntil: 'domcontentloaded' }); await ready(page); await page.waitForTimeout(800);
  await step(`${w} shot 1 (the film's first): boundary and context wording`, async () => {
    for (const s of await page.locator('summary.ws-disc-sum').allTextContents()) if (/camera|people/i.test(s)) await page.locator('summary.ws-disc-sum', { hasText: s }).first().click();
    await page.waitForTimeout(400);
    const b = page.getByRole('radiogroup', { name: 'Join with the shot before' });
    const has = await b.count(); const bv = has ? await b.locator('[aria-checked="true"]').textContent() : null;
    const help = has ? (await page.locator('.field', { has: b }).innerText()).replace(/\s+/g, ' ') : '';
    const join = (await page.locator('.ws-context-next').innerText().catch(() => '')).replace(/\s+/g, ' ');
    await snap('shot1-first-shot', true);
    return { boundaryShown: Boolean(has), value: bv, help: help.slice(0, 200), next: join.slice(0, 300) };
  });
  // ---- shot 3 (a Cut)
  await page.goto(`${base}/shorts/${P}/shots/${SHOT3}`, { waitUntil: 'domcontentloaded' }); await ready(page); await page.waitForTimeout(800);
  await step(`${w} shot 3: take cards (verdicts, drift line, "made in")`, async () => {
    const cards = await page.locator('.ws-take, [class*="ws-take-card"], li:has(.ws-take-name)').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').slice(0, 140)));
    await snap('shot3', true);
    return cards.slice(0, 10);
  });
  await step(`${w} shot 3: people/story context`, async () => {
    for (const s of await page.locator('summary.ws-disc-sum').allTextContents()) if (/people/i.test(s)) await page.locator('summary.ws-disc-sum', { hasText: s }).first().click();
    await page.waitForTimeout(300);
    return (await page.locator('.ws-context').innerText()).replace(/\s+/g, ' ').slice(0, 500);
  });

  // ---- the story tab: what the scene changes
  await page.goto(`${base}/shorts/${P}/production?tab=story`, { waitUntil: 'domcontentloaded' }); await ready(page); await page.waitForTimeout(1000);
  await step(`${w} story: "What the scene changes" present`, async () => {
    const fsx = page.locator('.ws-scene-story').first(); await fsx.scrollIntoViewIfNeeded(); await fsx.screenshot({ path: path.join(out, `scene-story-empty-${w}.png`) });
    return (await fsx.innerText()).replace(/\s+/g, ' ').slice(0, 300);
  });
  if (w === 1440) {
    await step('story: Add an event → stored at once (empty)?', async () => {
      const n0 = posts.length;
      await page.getByRole('button', { name: 'Add an event' }).first().click(); await page.waitForTimeout(1200);
      const sc = (await prod()).scenes[0];
      return `commands sent ${posts.length - n0}; stored events ${JSON.stringify(sc.story?.events)}`;
    });
    await step('story: typing 20 characters into the event → commands sent', async () => {
      const n0 = posts.length;
      const inp = page.getByRole('textbox', { name: 'Event' }).first(); await inp.click(); await inp.pressSequentially('Clara pours the tea.', { delay: 30 }); await page.waitForTimeout(1500);
      const sc = (await prod()).scenes[0];
      const v = await inp.inputValue();
      return `${posts.length - n0} write requests for 20 keystrokes; field "${v}"; stored ${JSON.stringify(sc.story?.events)}`;
    });
    await step('story: Add a change → a row of controls (layout)', async () => {
      await page.getByRole('button', { name: 'Add a change' }).first().click(); await page.waitForTimeout(800);
      const row = page.locator('.ws-story-change').first(); await row.scrollIntoViewIfNeeded();
      await page.locator('.ws-scene-story').first().screenshot({ path: path.join(out, 'scene-story-rows-1440.png') });
      const boxes = await row.evaluate((r) => [...r.children].map((c) => { const b = c.getBoundingClientRect(); return `${c.tagName.toLowerCase()}${c.getAttribute('aria-label') ? `[${c.getAttribute('aria-label')}]` : ''} ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}×${Math.round(b.height)}`; }));
      const ev = await page.locator('.ws-scene-story .ws-line').first().evaluate((r) => [...r.children].map((c) => { const b = c.getBoundingClientRect(); return `${c.tagName.toLowerCase()} ${Math.round(b.width)}×${Math.round(b.height)}`; }));
      return { changeRow: boxes, eventRow: ev };
    });
    await step('story: change subject → A prop shows the prop field; "Ends an earlier change" switches the placeholder', async () => {
      const row = page.locator('.ws-story-change').first();
      await row.getByRole('combobox', { name: 'Who or what changes' }).selectOption('prop'); await page.waitForTimeout(500);
      const prop = await row.getByRole('textbox', { name: 'Which prop' }).count();
      await row.getByRole('textbox', { name: 'Which prop' }).fill('teapot').catch(() => {});
      await row.getByRole('textbox', { name: 'The change' }).fill('lid cracked');
      const ph1 = await row.getByRole('textbox', { name: 'The change' }).getAttribute('placeholder');
      await row.getByRole('checkbox').check(); await page.waitForTimeout(500);
      const ph2 = await row.getByRole('textbox', { name: 'The change' }).getAttribute('placeholder');
      const whenOpts = await row.getByRole('combobox', { name: 'From when' }).locator('option').allTextContents();
      await page.waitForTimeout(800);
      const sc = (await prod()).scenes[0];
      await page.locator('.ws-scene-story').first().screenshot({ path: path.join(out, 'scene-story-change-filled-1440.png') });
      return { propField: prop, placeholders: [ph1, ph2], whenOpts, stored: sc.story?.changes };
    });
    await step('story: Add what someone learns; remove buttons work', async () => {
      await page.getByRole('button', { name: 'Add what someone learns' }).first().click(); await page.waitForTimeout(600);
      const k = (await prod()).scenes[0].story?.knowledge;
      // clean up: remove everything added
      for (const name of ['Remove the event', 'Remove the change', 'Remove']) { const b = page.locator('.ws-scene-story').getByRole('button', { name, exact: true }); while (await b.count()) { await b.first().click(); await page.waitForTimeout(400); } }
      await page.waitForTimeout(800);
      const st = (await prod()).scenes[0].story;
      return { knowledgeAdded: k, after: st };
    });
    await step('story: does the shot context show the scene\'s events / changes? (round trip)', async () => {
      await page.getByRole('button', { name: 'Add an event' }).first().click(); await page.waitForTimeout(400);
      await page.getByRole('textbox', { name: 'Event' }).first().fill('QA event: the tea was poured');
      await page.waitForTimeout(1000);
      await page.goto(`${base}/shorts/${P}/shots/${SHOT3}`, { waitUntil: 'domcontentloaded' }); await ready(page); await page.waitForTimeout(800);
      for (const s of await page.locator('summary.ws-disc-sum').allTextContents()) if (/people/i.test(s)) await page.locator('summary.ws-disc-sum', { hasText: s }).first().click();
      const txt = (await page.locator('.ws-context-next').innerText()).replace(/\s+/g, ' ');
      await page.locator('.ws-context-next').screenshot({ path: path.join(out, 'shot3-context-after-event-1440.png') });
      // clean up
      await page.goto(`${base}/shorts/${P}/production?tab=story`, { waitUntil: 'domcontentloaded' }); await ready(page); await page.waitForTimeout(600);
      const b = page.locator('.ws-scene-story').getByRole('button', { name: 'Remove the event', exact: true }); while (await b.count()) { await b.first().click(); await page.waitForTimeout(400); }
      return txt.slice(0, 400);
    });
  }
  if (w === 390) {
    await step('390 story: Add a change → row layout at 390', async () => {
      await page.getByRole('button', { name: 'Add a change' }).first().click(); await page.waitForTimeout(800);
      await page.getByRole('button', { name: 'Add an event' }).first().click(); await page.waitForTimeout(800);
      const fsx = page.locator('.ws-scene-story').first(); await fsx.scrollIntoViewIfNeeded(); await fsx.screenshot({ path: path.join(out, 'scene-story-rows-390.png') });
      const r = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, small: [...document.querySelectorAll('.ws-scene-story button, .ws-scene-story input, .ws-scene-story select')].map((e) => { const b = e.getBoundingClientRect(); return `${e.tagName.toLowerCase()}[${e.getAttribute('aria-label') ?? e.type}] ${Math.round(b.width)}×${Math.round(b.height)}`; }) }));
      for (const name of ['Remove the event', 'Remove the change']) { const b = page.locator('.ws-scene-story').getByRole('button', { name, exact: true }); while (await b.count()) { await b.first().click(); await page.waitForTimeout(400); } }
      return r;
    });
  }

  // ---- the final cut tab
  await page.goto(`${base}/shorts/${P}/production?tab=final`, { waitUntil: 'domcontentloaded' }); await ready(page); await page.waitForTimeout(1000);
  await step(`${w} final cut: summary and export controls`, async () => {
    await snap('final', true);
    const txt = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    const disabled = await page.evaluate(() => [...document.querySelectorAll('main button[disabled]')].map((b) => `"${b.textContent.trim().slice(0, 30)}" ${b.getAttribute('title') || b.getAttribute('aria-describedby') ? 'reason' : 'NO REASON'}`));
    return { text: txt.slice(0, 900), disabled };
  });

  await step(`${w} page errors`, async () => { if (errors.length) throw new Error(errors.slice(0, 5).join(' | ')); return 'none'; });
  await ctx.close();
}
await browser.close();
await fs.writeFile(path.join(out, 'surfaces.json'), `${JSON.stringify({ checked: new Date().toISOString(), base, results }, null, 2)}\n`);
console.log(`${results.filter((r) => !r.ok).length} failed of ${results.length}`);
