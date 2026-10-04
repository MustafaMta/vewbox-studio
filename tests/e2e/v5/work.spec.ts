import { expect, test, type Page, type Route } from '@playwright/test';
import { loadFixture, prepare } from '../../../scripts/lib/capture.mjs';

/** THE PRODUCTION WORKSPACE (package P-Work; docs/DESIGN-SYSTEM-V5.md §8.10–§8.11) against your own server and database
 *  copy, read-only: every write the page sends is answered here and never reaches the server (the capture helper
 *  answers /api/commands; the tests answer cancel and the rest). Never run it against the live studio:
 *    $env:STUDIO_URL='http://localhost:4258'; npx playwright test tests/e2e/v5/work.spec.ts
 *  The main subject is the real film "The Static Sky"; episodes and music videos use the `states` fixture. */

const FILM = 'short-28bdb3342b';
const MAP = `/shorts/${FILM}/production`;
const SHOT = 'shot-633cd06560';   // 2.3: four takes, take 4 selected
const SPEAKING = 'shot-c7cb1346c6'; // 2.2: one line waiting to be heard again

type Prep = (p: Page, o: { fixture?: unknown; motion?: string }) => Promise<void>;
const commands: Array<{ name: string; args: unknown[] }> = [];

async function open(page: Page, path: string, o: { width?: number; height?: number; fixture?: unknown; health?: object; status?: object; jobs?: object[] } = {}) {
  await page.setViewportSize({ width: o.width ?? 1440, height: o.height ?? 900 });
  await (prepare as Prep)(page, { motion: 'reduce', fixture: o.fixture });
  // later routes win: record the commands the page sends (still answered "accepted", never sent)
  await page.route('**/api/commands', async (route: Route) => { try { commands.push(...(route.request().postDataJSON()?.commands ?? [])); } catch { /* beacon */ } await route.fulfill({ json: { ok: true, version: 1, hash: 'test', results: [] } }); });
  if (o.health) await page.route('**/api/health', (r) => r.fulfill({ json: o.health }));
  if (o.status) await page.route('**/api/status', (r) => r.fulfill({ json: o.status }));
  if (o.jobs) await page.route(/\/api\/jobs(\?.*)?$/, (r) => r.fulfill({ json: { jobs: o.jobs } }));
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ws:not(.ws-skeleton) main h1, main .ws:not(.ws-skeleton) h1', { timeout: 90_000 }).catch(() => {});
  await page.waitForSelector('.ws:not(.ws-skeleton)', { timeout: 90_000 });
}

const PAUSED = { ok: true, intake: { paused: true, since: '2026-10-03 11:39:18+00' } };
const READY = { ok: true, intake: { paused: false } };
const running = (x: object = {}) => ({ id: 'job-test-run', type: 'GENERATE_TAKE', status: 'GENERATING', priority: 0, payload: { productionId: FILM, shotId: SHOT }, productionId: FILM, shotId: SHOT, attempts: 1, maxAttempts: 2, cancelRequested: false, progress: { phase: 'GENERATING' }, createdAt: new Date(Date.now() - 42_000).toISOString(), startedAt: new Date(Date.now() - 42_000).toISOString(), updatedAt: new Date().toISOString(), ...x });

test.beforeEach(() => { commands.length = 0; });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

test('the map: the stage pipeline as pills, the hierarchy, the decisions, the floor and the cut', async ({ page }) => {
  await open(page, MAP);
  const pills = page.getByRole('navigation', { name: 'Stages' }).getByRole('link');
  await expect(pills).toHaveText([/Map/, /Story/, /Cast & World/, /Storyboard/, /Produce/, /Final cut/]);
  await expect(pills.first()).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('navigation', { name: 'The production, from story to cut' })).toContainText('2 scenes');
  await expect(page.getByRole('heading', { name: /^Waiting for you/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'On the floor' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Breakdown review' })).toBeVisible();
  // every shot of both scenes is a frame with its state
  await expect(page.locator('#scenes .ws-shot')).toHaveCount(8);
  await expect(page.locator('#scenes .ws-shot').first()).toContainText(/selected/);
  await expect(page.locator('.ws-cutline > li')).toHaveCount(8);
  await expect(page.locator('.ws-versions > li').first()).toContainText('Cut 3');
  // the outline: two scenes, eight shots, story and cut
  await expect(page.locator('.ws-outline .ws-ol-shot')).toHaveCount(8);
  await page.locator('.ws-outline .ws-ol-shot').nth(6).click();
  await expect(page).toHaveURL(new RegExp(`/shorts/${FILM}/shots/${SHOT}$`));
});

test('the pills and the old tab names open the stage tabs', async ({ page }) => {
  await open(page, MAP);
  await page.getByRole('navigation', { name: 'Stages' }).getByRole('link', { name: /^Story( \(done\))?$/ }).click();
  await expect(page).toHaveURL(new RegExp(`${MAP}\\?tab=story$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Story' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Logline', exact: true })).toHaveValue(/lighthouse keeper/);
  await page.goto(`${MAP}?tab=characters`);
  await expect(page.getByRole('heading', { level: 1, name: 'Cast and world' })).toBeVisible();
  await page.goto(`${MAP}?tab=storyboard`);
  await expect(page.getByRole('heading', { level: 1, name: 'Storyboard' })).toBeVisible();
  await expect(page.locator('.ws-board-card')).toHaveCount(8);
});

test('the story pane saves the logline as a command, never a direct write', async ({ page }) => {
  await open(page, `${MAP}?tab=story`);
  await page.getByRole('textbox', { name: 'Logline', exact: true }).fill('A new logline.');
  await page.getByRole('button', { name: 'Save', exact: true }).first().click();
  await expect.poll(() => commands.map((c) => c.name)).toContain('updateProduction');
});

test('paused and offline: the generation controls render their real states and start nothing', async ({ page }) => {
  await open(page, `/shorts/${FILM}/shots/${SHOT}`, { health: PAUSED });
  await expect(page.getByRole('status').filter({ hasText: 'The studio is paused' })).toBeVisible();
  const newTake = page.getByRole('button', { name: 'New take' });
  await expect(newTake).toBeDisabled();
  await expect(page.locator('.ws-gen-block')).toContainText('Intake is paused');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await open(page, `/shorts/${FILM}/shots/${SHOT}`, { health: READY, status: { video: { ok: false, detail: 'down' }, images: { ok: true }, voice: { ok: true } } });
  await expect(page.locator('.ws-gen-block')).toContainText('The video engine is offline.');
  await expect(page.getByRole('button', { name: 'New take' })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Draw the frames/ })).toBeEnabled();
});

test('a running take shows its real phase and elapsed time, and Cancel reaches the server route', async ({ page }) => {
  let cancelled = '';
  await open(page, `/shorts/${FILM}/shots/${SHOT}`, { health: READY, jobs: [running()] });
  await page.route('**/api/jobs/*/cancel', (r) => { cancelled = r.request().url(); return r.fulfill({ json: { job: running({ cancelRequested: true }) } }); });
  const row = page.locator('.ws-status .ws-run');
  await expect(row).toContainText('Filming shot 2.3 · making');
  await expect(row.getByRole('progressbar')).toBeVisible();
  await expect(page.locator('.ws-take-pending')).toHaveCount(1);
  await expect(page.locator('.ws-outline .ws-ol-shot[aria-current="page"] .ws-ol-mark')).toHaveAttribute('data-kind', 'running');
  await row.getByRole('button', { name: 'Cancel' }).click();
  await expect.poll(() => cancelled).toContain('/api/jobs/job-test-run/cancel');
  // the map lists it on the floor
  await page.goto(MAP);
  await expect(page.locator('#on-the-floor .ws-run')).toContainText('Filming shot 2.3');
});

test('the takes: use, judge and compare, as commands', async ({ page }) => {
  await open(page, `/shorts/${FILM}/shots/${SHOT}`);
  const takes = page.locator('.ws-take-row > .ws-take');
  await expect(takes).toHaveCount(4);
  await expect(takes.nth(3)).toHaveAttribute('data-selected', 'true');
  await takes.nth(0).getByRole('button', { name: 'Use this take' }).click();
  await takes.nth(1).getByRole('button', { name: 'Good', exact: true }).click();
  page.once('dialog', (d) => void d.accept('soft focus'));
  await takes.nth(2).getByRole('button', { name: 'Reject' }).click();
  await expect.poll(() => commands.map((c) => c.name)).toEqual(expect.arrayContaining(['selectTake', 'rateTake']));
  await takes.nth(0).getByLabel('Compare').check();
  await takes.nth(1).getByLabel('Compare').check();
  await page.getByRole('button', { name: /Compare takes/ }).click();
  await expect(page.locator('.ws-canvas video')).toHaveCount(2);
  // showing another take puts it on the canvas
  await page.getByRole('button', { name: 'Stop comparing' }).click();
  await takes.nth(1).getByRole('button', { name: 'Show take 2 on the canvas' }).click();
  await expect(page.locator('.ws-stage-title')).toHaveText(/^Take 2/);
});

test('the inspector: framing, references, dialogue with voices and the line to hear again', async ({ page }) => {
  await open(page, `/shorts/${FILM}/shots/${SPEAKING}`);
  await expect(page.getByRole('radiogroup', { name: 'Framing' }).getByRole('radio', { checked: true })).toHaveText('Close-up');
  await page.getByRole('radiogroup', { name: 'Framing' }).getByRole('radio', { name: 'Medium', exact: true }).click();
  await expect(page.locator('.ws-insp-foot')).toContainText('Unsaved changes');
  await page.getByRole('button', { name: 'Save the shot' }).click();
  await expect.poll(() => commands.map((c) => c.name)).toContain('updateShot');
  await expect(page.locator('.ws-ref-chip')).not.toHaveCount(0);
  const line = page.locator('.ws-dlg-line').first();
  await expect(line.locator('.badge')).toHaveText('Hear it again');
  await expect(line.getByRole('button', { name: /^Hear / })).toBeVisible();
  await line.getByRole('button', { name: 'Keep this recording' }).click();
  await expect.poll(() => commands.map((c) => c.name)).toContain('keepLineRecordings');
  await expect(page.locator('.ws-exclusion')).toBeVisible();
});

test('the keyboard: [ and ] move between shots, and focus is visible', async ({ page }) => {
  await open(page, `/shorts/${FILM}/shots/${SHOT}`);
  await page.locator('.ws-stage-head').click();
  await page.keyboard.press(']');
  await expect(page).toHaveURL(/shot-598c190c5c$/);
  await page.keyboard.press('[');
  await expect(page).toHaveURL(new RegExp(`${SHOT}$`));
  const link = page.locator('.ws-outline .ws-ol-shot').first();
  await link.focus();
  const outline = await link.evaluate((e) => getComputedStyle(e).outlineStyle);
  expect(outline).not.toBe('none');
});

test('the final cut: versions on the canvas, subtitles, exports, and export held while paused', async ({ page }) => {
  await open(page, `${MAP}?tab=final`, { health: PAUSED });
  await expect(page.locator('.ws-cut-player video')).toHaveCount(1);
  const versions = page.locator('.ws-versions > li');
  await expect(versions).toHaveCount(3);
  await versions.nth(1).getByRole('button', { name: 'Show' }).click();
  await expect(versions.nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('heading', { name: 'Subtitles' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeDisabled();
  await expect(page.locator('.ws-final')).toContainText('Intake is paused');
  await expect(page.getByRole('link', { name: /Download/ }).first()).toBeVisible();
});

test('the loading state: the workspace skeleton keeps the real panels', async ({ page }) => {
  await page.route('**/api/studio', async (r) => { await new Promise((x) => setTimeout(x, 2500)); await r.continue(); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(MAP, { waitUntil: 'domcontentloaded' });
  const outline = await page.waitForFunction(() => { const o = document.querySelector('.ws-skeleton .ws-outline'); return o ? Math.round(o.getBoundingClientRect().width) : 0; }, null, { timeout: 60_000 });
  expect(await outline.jsonValue()).toBe(280);
  await page.waitForSelector('.ws:not(.ws-skeleton) .ws-map', { timeout: 90_000 });
});

test('an episode (states fixture): Iraqi Arabic lines render right to left inside the English page', async ({ page }) => {
  const fixture = await (loadFixture as (k: string, m?: string) => Promise<unknown>)('states', 'reduce');
  await open(page, '/shows/last-sip/seasons/last-sip-s1/episodes/s1e1/production?tab=story', { fixture });
  const ar = page.locator('input[lang="ar"]').first();
  await expect(ar).toHaveAttribute('dir', 'rtl');
  await expect(ar).toHaveValue(/[؀-ۿ]/);
  await page.goto('/shows/last-sip/seasons/last-sip-s1/episodes/s1e1/shots/s1e1-2');
  await expect(page.locator('.ws-insp-title')).toHaveText('Shot 1.2');
  await expect(page.locator('textarea[lang="ar"]').first()).toHaveAttribute('dir', 'rtl');
});

test('a music video (states fixture): its own tabs, the song and the empty states', async ({ page }) => {
  const fixture = await (loadFixture as (k: string, m?: string) => Promise<unknown>)('states', 'reduce');
  await open(page, '/music-videos/river-lights/production', { fixture });
  await expect(page.getByRole('navigation', { name: 'Stages' }).getByRole('link')).toHaveText([/Map/, /Song & Lyrics/, /Performers/, /Visual story/, /Storyboard/, /Produce/, /Final cut/]);
  await page.goto('/music-videos/river-lights/production?tab=song');
  await expect(page.getByRole('heading', { level: 1, name: 'Song and lyrics' })).toBeVisible();
  await page.goto('/music-videos/rooftop-radio/production');
  await expect(page.locator('.ws-lead')).toContainText(/Nothing is written yet|not planned yet/);
  await expect(page.locator('#scenes')).toContainText('No scenes yet');
});

test('phone: the outline folds into a shot switcher @mobile', async ({ page }) => {
  await open(page, `/shorts/${FILM}/shots/${SHOT}`, { width: 390, height: 844 });
  await expect(page.locator('.ws-outline')).toBeHidden();
  const sw = page.getByLabel('Go to a shot');
  await expect(sw).toBeVisible();
  await sw.selectOption('shot-24bf719d21');
  await expect(page).toHaveURL(/shot-24bf719d21$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
