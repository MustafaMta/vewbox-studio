import { expect, test, type Page, type Route } from '@playwright/test';
import { prepare } from '../../../scripts/lib/capture.mjs';

/** P-STUDIO (docs/design/PAGE-ENGINEERING-BRIEF.md §4): the Studio Company, a department, an agent, the Production control
 *  room, Settings and Files against the studio's real data, with every write answered in the browser and never sent.
 *  Run against your own server and database copy, never the live studio:
 *    $env:STUDIO_URL='http://localhost:4260'; npx playwright test tests/e2e/v5/studio.spec.ts --project=desktop */

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });
test.setTimeout(150_000);

async function open(page: Page, path: string, ready: string, width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
  await (prepare as (p: Page, o: { motion?: string }) => Promise<void>)(page, { motion: 'reduce' });
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(ready, { timeout: 120_000 });
}
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

// ------------------------------------------------------------------------------------------------ Studio Company

test('Studio Company: the counts come from the API, a department opens in the inspector and then on its page', async ({ page, request }) => {
  const org = await (await request.get('/api/studio/org')).json();
  await open(page, '/studio', '.company:not(.sk-region) .co-grid');
  await expect(page.getByRole('heading', { level: 1, name: 'Studio Company' })).toBeVisible();
  await expect(page.locator('.cp-lead')).toContainText(`${org.agents.length} agents`);
  await expect(page.locator('.co-node')).toHaveCount(org.departments.length);
  // the edge counts are the recorded handoffs (each count sits on its line)
  const total = await page.locator('.co-count').evaluateAll((els) => els.reduce((n, e) => n + parseInt(e.textContent ?? '0', 10), 0));
  expect(total).toBeLessThanOrEqual(org.handoffs.length);
  const casting = org.departments.find((d: { id: string }) => d.id === 'CASTING');
  await page.locator('.co-node', { hasText: casting.name }).click();
  await expect(page.locator('.co-inspector .co-insp-title')).toHaveText(casting.name);
  await expect(page.locator('.co-inspector')).toContainText(casting.responsibility);
  await page.locator('.co-inspector').getByRole('link', { name: 'Open the department' }).click();
  await expect(page).toHaveURL(/\/studio\/departments\/CASTING$/);
  await expect(page.getByRole('heading', { level: 1, name: casting.name })).toBeVisible();
});

test('Studio Company: the ring is one tab stop and the arrow keys walk it; focus is visible', async ({ page }) => {
  await open(page, '/studio', '.company:not(.sk-region) .co-grid');
  await page.locator('.co-orch').focus();
  await page.keyboard.press('ArrowRight');
  const first = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
  expect(first).toMatch(/^Executive Office\./);
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')).toMatch(/^Story Development\./);
  await page.keyboard.press('Enter');
  await expect(page.locator('.co-inspector .co-insp-title')).toHaveText('Story Development');
  const ring = await page.evaluate(() => { const cs = getComputedStyle(document.activeElement!); return `${cs.outlineStyle} ${cs.outlineWidth}`; });
  expect(ring).toBe('solid 2px');
});

test('Studio Company: the record tabs switch between handoffs, approvals and activity', async ({ page, request }) => {
  const org = await (await request.get('/api/studio/org')).json();
  await open(page, '/studio', '.company:not(.sk-region) #record');
  const record = page.locator('#record');
  await expect(record.getByRole('tab', { name: /Handoffs/ })).toHaveAttribute('aria-selected', 'true');
  await expect(record.locator('[role="tabpanel"] .cp-row')).toHaveCount(Math.min(8, org.handoffs.length));
  await record.getByRole('tab', { name: /Your approvals/ }).click();
  await expect(record.locator('[role="tabpanel"] .cp-row')).toHaveCount(org.approvals.length);
  await record.getByRole('tab', { name: /Activity/ }).click();
  await expect(record.locator('[role="tabpanel"] .cp-row')).toHaveCount(Math.min(8, org.events.length));
});

test('Studio Company on a phone: the spine instead of the ring, no horizontal overflow', async ({ page, request }) => {
  const org = await (await request.get('/api/studio/org')).json();
  await open(page, '/studio', '.company:not(.sk-region) .co-spine', 390, 844);
  await expect(page.locator('.co-grid')).toBeHidden();
  await expect(page.locator('.co-spine-list > li')).toHaveCount(org.departments.length);
  expect(await noOverflow(page)).toBe(0);
});

test('Studio Company: its skeleton holds the page while the record loads', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await (prepare as (p: Page, o: { motion?: string }) => Promise<void>)(page, { motion: 'reduce' });
  let release = () => {};
  const held = new Promise<void>((r) => { release = r; });
  await page.route('**/api/studio/org', async (route: Route) => { await held; await route.continue(); });
  await page.goto('/studio', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.company.sk-region')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('.company.sk-region .co-stage')).toBeVisible();
  release();
  await expect(page.locator('.company:not(.sk-region) .co-grid')).toBeVisible({ timeout: 60_000 });
});

// ------------------------------------------------------------------------------------------ a department, an agent

test('A department: its agents from the API, its work tabs, and an agent page one click away', async ({ page, request }) => {
  const d = await (await request.get('/api/studio/org/departments/CASTING')).json();
  await open(page, '/studio/departments/CASTING', '.dept:not(.sk-region) .dp-place');
  await expect(page.locator('.dp-agent')).toHaveCount(d.agents.length);
  const work = page.locator('#work');
  await work.getByRole('tab', { name: /^Runs/ }).click();
  await expect(work.locator('[role="tabpanel"] .cp-row')).toHaveCount(Math.min(12, d.recentRuns.length));
  await work.getByRole('tab', { name: /Activity/ }).click();
  await expect(work.locator('[role="tabpanel"]')).toBeVisible();
  const director = d.agents.find((a: { id: string }) => a.id === d.department.directorId);
  await page.locator('.dp-agent', { hasText: director.name }).click();
  await expect(page).toHaveURL(new RegExp(`/studio/agents/${director.id}$`));
  await expect(page.getByRole('heading', { level: 1, name: director.name })).toBeVisible();
  await expect(page.locator('.cp-kicker')).toHaveText(`Director · ${d.department.name}`);
  await page.getByRole('link', { name: d.department.name }).first().click();
  await expect(page).toHaveURL(/\/studio\/departments\/CASTING$/);
});

test('An agent: its runs and failures from its record; the instructions open on request', async ({ page, request }) => {
  const a = await (await request.get('/api/studio/org/agents/character-designer')).json();
  await open(page, '/studio/agents/character-designer', '.agent:not(.sk-region) #runs');
  await expect(page.locator('#runs .shead-count')).toHaveText(String(a.runs.length));
  await expect(page.locator('#failures .shead-count')).toHaveText(String(a.failures.length));
  const details = page.locator('#instructions details');
  await expect(details).not.toHaveAttribute('open', '');
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
});

test('An unknown department says so, with the way back', async ({ page }) => {
  await open(page, '/studio/departments/NOPE', '.dept:not(.sk-region) h1');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This department isn’t in the studio');
  await expect(page.getByRole('link', { name: 'Studio Company' }).first()).toHaveAttribute('href', '/studio');
});

// --------------------------------------------------------------------------------------------------- Production

test('Production: the decisions are the sidebar’s count, each card links to where it is decided', async ({ page, request }) => {
  const d = await (await request.get('/api/decisions')).json();
  await open(page, '/production', '.control:not(.sk-region) #engine-room');
  const needs = page.locator('#needs-you');
  if (d.count === 0) { await expect(needs).toContainText('Nothing waits for you.'); return; }
  await expect(needs.locator('.shead-count')).toHaveText(String(d.count));
  await expect(page.locator('.nav-count').first()).toHaveText(String(d.count));
  await expect(needs.locator('.ctl-decisions > li')).toHaveCount(d.count);
  const links = needs.locator('a.dcard');
  for (let i = 0; i < await links.count(); i++) expect(d.items.map((x: { href: string }) => x.href)).toContain(await links.nth(i).getAttribute('href'));
  const geo = await needs.locator('.dcard').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  expect(new Set(geo).size).toBe(1);
});

test('Production: a running job shows its phase and elapsed time, and Cancel asks the server (answered here)', async ({ page }) => {
  const now = new Date(Date.now() - 42_000).toISOString();
  const job = { id: 'job-e2e-running', type: 'GENERATE_TAKE', status: 'GENERATING', priority: 0, payload: {}, attempts: 1, maxAttempts: 3, progress: { phase: 'generating', message: 'Drawing frame 13 of 20', step: 13, total: 20, percent: null }, createdAt: now, startedAt: now, updatedAt: now };
  const cancels: string[] = [];
  await page.setViewportSize({ width: 1440, height: 900 });
  await (prepare as (p: Page, o: { motion?: string }) => Promise<void>)(page, { motion: 'reduce' });
  await page.route('**/api/jobs?**', async (route) => { const res = await route.fetch(); const body = await res.json(); body.jobs = [job, ...body.jobs]; await route.fulfill({ response: res, json: body }); });
  await page.route('**/api/jobs/job-e2e-running/cancel', (route) => { cancels.push(route.request().method()); return route.fulfill({ json: { job: { ...job, cancelRequested: true } } }); });
  await page.goto('/production', { waitUntil: 'domcontentloaded' });
  const row = page.locator('#running .cp-row').first();
  await expect(row).toContainText('Generate video', { timeout: 120_000 });
  await expect(row.locator('.job-run-phase')).toContainText('Drawing frame 13 of 20');
  // the elapsed clock counts from the job's start (42 s before the page opened), however long the page took to load
  const started = Date.parse(now);
  await expect.poll(async () => {
    const m = /^(\d+):(\d\d)$/.exec(((await row.locator('.job-run-time').textContent()) ?? '').trim());
    if (!m) return false;
    const shown = Number(m[1]) * 60 + Number(m[2]);
    return shown >= 42 && Math.abs(shown - (Date.now() - started) / 1000) <= 3;
  }).toBe(true);
  await expect(row.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '65');
  await row.getByRole('button', { name: 'Cancel' }).click();
  await expect(row.getByRole('button', { name: 'Cancelling…' })).toBeDisabled();
  expect(cancels).toEqual(['POST']);
});

test('Production: the history filter, a job’s log in a drawer, and ?job= opening it', async ({ page, request }) => {
  const { jobs } = await (await request.get('/api/jobs?limit=300')).json();
  const failed = jobs.filter((j: { status: string }) => j.status === 'FAILED');
  await open(page, '/production', '.control:not(.sk-region) #history');
  const history = page.locator('#history');
  await history.getByRole('button', { name: /^Failed/ }).click();
  await expect(history.locator('.cp-rows .cp-row')).toHaveCount(Math.min(12, failed.length));
  await history.getByRole('button', { name: /^Failed/ }).click(); // choosing it again clears the filter
  await history.locator('.cp-row').first().getByRole('button', { name: 'Details' }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText('Log', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\?job=/);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(page).not.toHaveURL(/\?job=/);
  const id = jobs.find((j: { status: string }) => j.status === 'COMPLETED')?.id;
  test.skip(!id, 'no finished job in the record');
  await page.goto(`/production?job=${id}`);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 60_000 });
});

test('Production: the engine room says each engine’s state and the reliability record behind tabs', async ({ page, request }) => {
  const status = await (await request.get('/api/status')).json();
  await open(page, '/production#engine-room', '.control:not(.sk-region) .ctl-engine[data-ok]');
  for (const [key, name] of [['video', 'Video'], ['images', 'Pictures'], ['story', 'Story'], ['voice', 'Voices']] as const) {
    await expect(page.locator('.ctl-engine', { hasText: name }).first()).toContainText(status[key].ok ? 'Ready' : 'Offline');
  }
  const er = page.locator('#engine-room');
  await er.getByRole('tab', { name: /Failure classes/ }).click();
  await expect(er.locator('[role="tabpanel"]')).toBeVisible();
  await er.getByRole('tab', { name: /Models/ }).click();
  await expect(er.locator('[role="tabpanel"] .cp-row').first()).toBeVisible();
});

test('The old addresses land on their new homes', async ({ page }) => {
  await (prepare as (p: Page, o: { motion?: string }) => Promise<void>)(page, { motion: 'reduce' });
  await page.goto('/jobs');
  await expect(page).toHaveURL(/\/production#activity$/);
  await page.goto('/jobs?job=job-x');
  await expect(page).toHaveURL(/\/production\?job=job-x#activity$/);
  await page.goto('/library');
  await expect(page).toHaveURL(/\/characters$/);
  await page.goto('/library?tab=assets');
  await expect(page).toHaveURL(/\/assets$/);
  await page.goto('/projects?tab=shorts');
  await expect(page).toHaveURL(/\/shorts$/);
});

// ------------------------------------------------------------------------------------------------------ Settings

test('Engine room: the GPU queue as recorded (idle today), and the command log with refused batches marked', async ({ page, request }) => {
  const gpu = await (await request.get('/api/studio/gpu')).json();
  const at = new Date().toISOString();
  await page.setViewportSize({ width: 1440, height: 900 });
  await (prepare as (p: Page, o: { motion?: string }) => Promise<void>)(page, { motion: 'reduce' });
  await page.route('**/api/studio/commands?**', (route) => route.fulfill({ json: { entries: [
    { id: 2, at, sender: 'page:abc123', jobId: null, ok: false, studioVersion: 7, commands: [{ name: 'claimAsset', touches: ['studio'] }], refused: { failedAt: 0, code: 'FORBIDDEN', message: 'worker-only command' } },
    { id: 1, at, sender: 'worker', jobId: 'job-1', ok: true, studioVersion: 6, commands: [{ name: 'updateShot', touches: ['production:p1'] }] },
  ] } }));
  await page.goto('/production#engine-room', { waitUntil: 'domcontentloaded' });
  const panel = page.locator('.ctl-gpu-panel');
  await expect(panel).toContainText('Graphics card', { timeout: 120_000 });
  if (gpu.holders.length === 0 && gpu.waiting.length === 0) {
    await expect(panel).toContainText('Idle');
    await expect(panel.locator('.ctl-gpu-rows')).toHaveCount(0);
  } else await expect(panel.locator('.ctl-gpu-rows .cp-row')).toHaveCount(gpu.holders.length + gpu.waiting.length);
  if (!gpu.loaded.family) await expect(panel).toContainText('Nothing loaded');
  const er = page.locator('#engine-room');
  await er.getByRole('tab', { name: /GPU unloads/ }).click();
  if (gpu.unloads.length === 0) await expect(er.locator('[role="tabpanel"]')).toContainText('No engine has been unloaded');
  await er.getByRole('tab', { name: /Recent commands/ }).click();
  const rows = er.locator('[role="tabpanel"] .cp-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Refused');
  await expect(rows.first()).toContainText('FORBIDDEN: worker-only command');
  await expect(rows.nth(1)).toContainText('Applied');
});

test('An agent run waiting for its jobs reads so, neither running nor failed', async ({ page, request }) => {
  const a = await (await request.get('/api/studio/org/agents/casting-director')).json();
  test.skip(!a.runs.length, 'the agent has no runs');
  await page.setViewportSize({ width: 1440, height: 900 });
  await (prepare as (p: Page, o: { motion?: string }) => Promise<void>)(page, { motion: 'reduce' });
  await page.route('**/api/studio/org/agents/casting-director', async (route) => { const res = await route.fetch(); const body = await res.json(); body.runs[0] = { ...body.runs[0], outcome: 'WAITING', failureClass: null }; body.current = body.runs[0]; await route.fulfill({ response: res, json: body }); });
  await page.goto('/studio/agents/casting-director', { waitUntil: 'domcontentloaded' });
  const row = page.locator('#runs .cp-row').first();
  await expect(row).toContainText('Waiting for its jobs', { timeout: 120_000 });
  await expect(row).not.toContainText('Failed');
  await expect(page.locator('.cp-facts')).toContainText('Waiting for its jobs');
});

test('Settings: the engines are said, not offered; no control that changes nothing; the Iraqi experiment is visible and explained', async ({ page, request }) => {
  const h = await (await request.get('/api/studio/settings')).json();
  const caps = (await (await request.get('/api/health')).json()).capabilities as { minimax?: boolean };
  await open(page, '/settings', '.settings:not(.sk-region) #generation');
  const engines = page.locator('#generation');
  await expect(engines).toContainText('MiniMax H3, on this machine');
  // the video model, its resolution and the story engine are read by nothing: no picker is offered for them
  await expect(engines.getByRole('combobox')).toHaveCount(0);
  if (!caps.minimax) await expect(engines.getByRole('radiogroup')).toHaveCount(0);
  const row = (label: string) => page.locator('.st-row', { has: page.getByText(label, { exact: true }) });
  const note = row('Style').locator('.st-unused');
  if (h.honoured.defaultStyle === false) await expect(note).toHaveCount(1); else await expect(note).toHaveCount(0);
  const iraqi = page.locator('#voices');
  await expect(iraqi.getByRole('switch', { name: /Design Iraqi voices without a recording/ })).toBeVisible();
  await expect(iraqi).toContainText('Experiment');
  await expect(iraqi).toContainText('native listener');
});

test('Settings: each change goes through the updateSettings command (answered here); no interface language', async ({ page }) => {
  const sent: string[] = [];
  await open(page, '/settings', '.settings:not(.sk-region) #generation');
  await page.route('**/api/commands', async (route) => { sent.push(route.request().postData() ?? ''); await route.fulfill({ json: { ok: true, version: 1, hash: 'e2e', results: [] } }); });
  await page.locator('#continuity').getByRole('radio', { name: '39', exact: true }).click();
  await expect(page.locator('#continuity').getByRole('radio', { name: '39', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.locator('#motion').getByRole('switch').click({ force: true });
  await expect.poll(() => sent.join('\n')).toContain('updateSettings');
  expect(sent.join('\n')).toContain('"guideFrames":39');
  expect(sent.join('\n')).toContain('reducedMotion');
  await expect(page.locator('main')).not.toContainText(/interface language|language of the interface/i);
  await expect(page.getByRole('link', { name: 'Open the engine room' })).toHaveAttribute('href', '/production#engine-room');
});

// --------------------------------------------------------------------------------------------------------- Files

test('Files: grouped by owner, search and filters narrow it, a file opens in place', async ({ page, request }) => {
  const snap = await (await request.get('/api/studio')).json();
  await open(page, '/assets', '.files:not(.sk-region) .fl-bar');
  await expect(page.locator('.fl-count')).toHaveText(`${snap.state.assets.length} files`);
  if (snap.state.characters.length) await expect(page.locator('#files-character')).toBeVisible();
  const kind = page.getByRole('group', { name: 'Kind' });
  await kind.getByRole('button', { name: /^Subtitles/ }).click();
  await expect(page.locator('.fl-grid')).toHaveCount(0);
  await kind.getByRole('button', { name: /^Subtitles/ }).click();
  const owner = page.getByRole('group', { name: 'Owner' });
  await owner.getByRole('button', { name: /^Characters/ }).click();
  await expect(page.locator('#files-production')).toHaveCount(0);
  await owner.getByRole('button', { name: /^Characters/ }).click();
  await page.getByLabel('Search files').fill('zzzz-no-such-file');
  await expect(page.locator('main')).toContainText('No file matches.');
  await page.getByRole('button', { name: 'Clear the search and filters' }).click();
  const tile = page.locator('.fl-grid .mtile-link').first();
  await tile.click();
  await expect(page).toHaveURL(/\?asset=/);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(await noOverflow(page)).toBe(0);
});
