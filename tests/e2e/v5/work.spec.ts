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
  // a client navigation to a route the dev server has not compiled for the browser yet can take its compile time
  await expect(page).toHaveURL(new RegExp(`/shorts/${FILM}/shots/${SHOT}$`), { timeout: 60_000 });
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

test('the decisions on the map: a bound approval refused as changed, the stale cut, and what was removed comes back', async ({ page }) => {
  let posted: Record<string, unknown> | null = null; let restored: Record<string, unknown> | null = null;
  await (prepare as Prep)(page, { motion: 'reduce' });
  // the story is not approved yet; the cut is out of date; one shot was removed by a re-run story step
  await page.route(`**/api/studio/org/productions/${FILM}`, async (r) => {
    if (r.request().method() === 'POST') { posted = r.request().postDataJSON(); return r.fulfill({ status: 409, json: { error: { code: 'CONFLICT', message: 'The story changed while you were looking at it.' } } }); }
    const res = await r.fetch(); const body = await res.json();
    body.stages = body.stages.map((s: { id: string }) => (s.id === 'STORY' ? { ...s, status: 'AWAITING_APPROVAL', approval: null } : s));
    return r.fulfill({ response: res, json: body });
  });
  await page.route('**/api/studio', async (r) => { const res = await r.fetch(); const body = await res.json(); body.state.productions = body.state.productions.map((p: { id: string }) => (p.id === FILM ? { ...p, cutStale: true } : p)); return r.fulfill({ response: res, json: body }); });
  await page.route('**/api/studio/deleted?*', (r) => r.fulfill({ json: { items: [{ kind: 'shot', id: 'shot-gone', productionId: FILM, label: 'Shot 1.5 · The radio hums', deletedAt: '2026-10-03T10:00:00Z', deletedBy: 'story-developer', takes: 2 }] } }));
  await page.route('**/api/studio/restore', (r) => { restored = r.request().postDataJSON(); return r.fulfill({ json: { restored: { shows: [], seasons: [], productions: [], scenes: [], shots: ['shot-gone'], takes: [] }, skipped: [], version: 2 } }); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(MAP, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ws:not(.ws-skeleton) .ws-map', { timeout: 90_000 });
  const story = page.locator('#story');
  await story.getByRole('button', { name: 'Approve' }).click();
  await expect(story).toContainText('The story changed while you were looking at it');
  expect(posted).toMatchObject({ stage: 'STORY', decision: 'APPROVED', subjectHash: expect.any(String) });
  await expect(page.locator('#cut')).toContainText('The cut is out of date');
  await expect(page.locator('#cut').getByRole('button', { name: 'Assemble the cut again' })).toBeVisible();
  const removed = page.locator('#removed');
  await expect(removed).toContainText('Shot 1.5 · The radio hums');
  await removed.getByRole('button', { name: 'Restore' }).click();
  await expect.poll(() => restored).toEqual({ kind: 'shot', id: 'shot-gone' });
});

test('failed shots: the real error class, and "Regenerate this shot" (held while paused, routed when ready)', async ({ page }) => {
  const later = new Date(Date.now() - 60_000).toISOString();
  const failedChild = running({ id: 'job-test-fail', status: 'FAILED', error: { code: 'PROVIDER', message: 'engine stopped' }, finishedAt: later, updatedAt: later, createdAt: later });
  const pass = running({ id: 'job-test-pass', type: 'PRODUCE', shotId: undefined, status: 'COMPLETED', payload: { productionId: FILM }, result: { failedShots: [{ shotId: SHOT, jobId: 'job-test-fail', reason: 'engine stopped' }] }, finishedAt: later });
  await open(page, MAP, { health: PAUSED, jobs: [pass, failedChild] });
  const failed = page.locator('#failed');
  await expect(failed).toContainText('Shot 2.3');
  await expect(failed.getByRole('button', { name: 'Regenerate this shot' })).toBeDisabled();
  await expect(failed.getByRole('button', { name: 'Regenerate this shot' })).toHaveAttribute('title', /Intake is paused/);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  let body: Record<string, unknown> | null = null; let url = '';
  await open(page, `/shorts/${FILM}/shots/${SHOT}`, { health: READY, status: { video: { ok: true }, images: { ok: true }, voice: { ok: true } }, jobs: [pass, failedChild] });
  await page.route('**/api/productions/*/regenerate', (r) => { url = r.request().url(); body = r.request().postDataJSON(); return r.fulfill({ status: 201, json: { job: running({ id: 'job-test-regen' }), created: true, scope: 'shot' } }); });
  const notice = page.locator('.ws-failure');
  await expect(notice).toBeVisible();
  await expect(notice.locator('.t-title')).not.toHaveText('');
  await notice.getByRole('button', { name: 'Regenerate this shot' }).click();
  await expect.poll(() => url).toContain(`/api/productions/${FILM}/regenerate`);
  expect(body).toMatchObject({ shotId: SHOT });
});

test('a waiting orchestrator reads "Waiting for its shots (3 of 8 done)" from its real children', async ({ page }) => {
  const parent = running({ id: 'job-test-pass', type: 'PRODUCE', shotId: undefined, payload: { productionId: FILM }, waiting: true, progress: { phase: 'GENERATING' } });
  const kids = Array.from({ length: 8 }, (_, i) => running({ id: `job-test-kid-${i}`, parentId: 'job-test-pass', shotId: `none-${i}`, status: i < 3 ? 'COMPLETED' : 'QUEUED' }));
  await open(page, MAP, { health: READY, jobs: [parent, ...kids] });
  const row = page.locator('#on-the-floor .ws-run[data-waiting]');
  await expect(row).toContainText('Waiting for its shots (3 of 8 done)');
  await expect(row).not.toContainText('making');
  await expect(row.getByRole('progressbar').last()).toHaveAttribute('aria-valuenow', '38');
});

/** The film as the continuity batches would leave it: 2.3's chosen take continues a take of 2.2 no longer chosen
 *  (stale), with drift checks (the place drifted) and its recorded scene state; 2.3 has staging and no boundary. */
async function continuityFilm(page: Page) {
  await page.route('**/api/studio', async (r) => {
    const res = await r.fetch(); const body = await res.json();
    body.state.productions = body.state.productions.map((p: { id: string; shots: Array<Record<string, unknown> & { id: string; selectedTakeId?: string; takes: Array<Record<string, unknown> & { id: string }> }> }) => p.id !== FILM ? p : { ...p, shots: p.shots.map((sh) => sh.id !== SHOT ? sh : {
      ...sh, boundary: undefined,
      staging: { pace: 'NORMAL', pov: undefined, beats: [{ at: 0, action: 'Najm leans in to the radio.' }, { at: 3.5, action: 'The photograph flickers.', cut: { camera: 'Close-up on the photo' } }], extras: [{ description: 'gulls outside the window', count: 3 }] },
      takes: sh.takes.map((t) => t.id !== sh.selectedTakeId ? t : { ...t, relation: 'CONTINUATION', continuesTakeId: 'take-gone', stale: { since: '2026-10-05T10:00:00Z', because: 'PREDECESSOR_RESELECTED', previousShotId: SPEAKING, detail: 'test' },
        qa: { ok: true, checks: [{ name: 'location-matches-plate', ok: false, value: 0.31, threshold: 0.18, detail: 'drifted' }, { name: 'identity-references-applied', ok: true, value: 2, threshold: 2 }] },
        params: { sceneState: { shotId: SHOT, sceneId: 'x', boundary: 'continuous', relation: 'CONTINUATION', timeOfDay: 'NIGHT', weather: 'a storm at sea', lighting: 'one desk lamp', present: [{ characterId: 'char-56c47abc59', wardrobe: 'striped sweater' }], props: [{ name: 'the radio', state: 'humming' }], sources: {} } } }),
    }) });
    return r.fulfill({ response: res, json: body });
  });
}

test('continuity on the map and the cut: the out-of-step take, Regenerate, and "Assemble anyway" (routed)', async ({ page }) => {
  let job: Record<string, unknown> | null = null;
  await (prepare as Prep)(page, { motion: 'reduce' });
  await continuityFilm(page);
  await page.route('**/api/health', (r) => r.fulfill({ json: READY }));
  await page.route('**/api/status', (r) => r.fulfill({ json: { video: { ok: true }, images: { ok: true }, voice: { ok: true } } }));
  await page.route(/\/api\/jobs$/, (r) => { if (r.request().method() === 'POST') { job = r.request().postDataJSON(); return r.fulfill({ status: 201, json: { job: running({ id: 'job-test-asm', type: 'ASSEMBLE', status: 'QUEUED', shotId: undefined }) } }); } return r.continue(); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(MAP, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ws:not(.ws-skeleton) .ws-map', { timeout: 90_000 });
  await expect(page.locator('#stale')).toContainText('Shot 2.3');
  await expect(page.locator('#stale').getByRole('button', { name: 'Regenerate this shot' })).toBeEnabled();
  await expect(page.locator('#scenes .ws-shot').nth(6)).toContainText('Out of step');
  const joins = page.locator('#ws-stale-joins');
  await expect(joins).toContainText('One join is out of step');
  await joins.getByRole('button', { name: 'Assemble anyway' }).click();
  await expect.poll(() => job).toMatchObject({ type: 'ASSEMBLE', payload: { productionId: FILM, allowStaleJoins: true } });
});

test('the shot inspector: the boundary edited, the staging, the drift checks with Review, the scene state', async ({ page }) => {
  await (prepare as Prep)(page, { motion: 'reduce' });
  await continuityFilm(page);
  await page.route('**/api/commands', async (route: Route) => { try { commands.push(...(route.request().postDataJSON()?.commands ?? [])); } catch { /* beacon */ } await route.fulfill({ json: { ok: true, version: 1, hash: 'test', results: [] } }); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/shorts/${FILM}/shots/${SHOT}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ws:not(.ws-skeleton) .ws-stage .ws-take', { timeout: 90_000 });
  await expect(page.locator('#ws-stale')).toContainText('out of step');
  const join = page.getByRole('radiogroup', { name: 'Join with the shot before' }).or(page.getByRole('group', { name: 'Join with the shot before' }));
  await expect(page.getByText('(planned from the scene order; choose to set it)')).toBeVisible();
  await join.getByText('Transition', { exact: true }).click();
  await expect(page.getByText('A new place or time: the shot starts fresh')).toBeVisible();
  await page.getByRole('button', { name: 'Save the shot' }).click();
  await expect.poll(() => commands.filter((c) => c.name === 'updateShot').map((c) => (c.args[2] as { boundary?: string }).boundary)).toContain('transition');
  await expect(page.locator('.ws-staging')).toContainText('The photograph flickers.');
  await expect(page.locator('.ws-staging')).toContainText('cut to close-up on the photo');
  const selected = page.locator('.ws-take[data-selected]');
  await expect(selected.locator('.badge', { hasText: 'Review' })).toBeVisible();
  await page.locator('.ws-disc-sum', { hasText: /^Details/ }).click();
  await expect(page.locator('.ws-drift').first()).toContainText('difference 0.310, limit 0.180');
  await expect(page.locator('.ws-drift').nth(1)).toContainText('striped sweater');
  await expect(page.locator('.ws-drift').nth(1)).toContainText('a storm at sea');
});

test('an unestablished place: the refusal names both fixes, and the scene can establish it (routed)', async ({ page }) => {
  const refused = running({ id: 'job-test-refused', shotId: SPEAKING, status: 'FAILED', error: { code: 'MISSING_REFERENCE', message: 'no plate', details: { rule: 'location-identity', locationId: 'loc-cde19129ca', locationName: 'Elias’s Workshop' } }, finishedAt: new Date().toISOString() });
  await open(page, `/shorts/${FILM}/shots/${SPEAKING}`, { jobs: [refused] });
  const notice = page.locator('#ws-unestablished');
  await expect(notice).toContainText('Refused: Elias’s Workshop has no plate yet');
  await expect(notice.getByRole('link', { name: 'Draw the location’s plates' })).toHaveAttribute('href', '/locations/loc-cde19129ca');
  await notice.getByRole('button', { name: 'Mark this scene as establishing it' }).click();
  await expect.poll(() => commands.filter((c) => c.name === 'updateScene').map((c) => c.args[2])).toContainEqual({ establishLocation: true });
  // the scene editor's own toggle
  commands.length = 0;
  await page.goto(`${MAP}?tab=story`);
  await page.waitForSelector('.ws-scene-card', { timeout: 90_000 });
  await page.locator('.ws-scene-card').first().getByLabel('Establish this place here').check();
  await expect.poll(() => commands.filter((c) => c.name === 'updateScene').map((c) => c.args[2])).toContainEqual({ establishLocation: true });
});

test('the location page shows the place’s identity version and line', async ({ page }) => {
  await (prepare as Prep)(page, { motion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/locations/loc-cde19129ca', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#loc-name', { timeout: 90_000 });
  await expect(page.locator('.loc-identity')).toContainText(/Version \d+/);
  await expect(page.locator('.loc-identity .content-para')).not.toHaveText('');
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

test('people and story state: a person’s condition and end pose saved as continuity, the context the next take is made from', async ({ page }) => {
  await open(page, `/shorts/${FILM}/shots/${SHOT}`);
  await page.locator('.ws-disc-sum', { hasText: 'People and story state' }).click();
  const person = page.locator('.ws-context-person').first();
  await expect(person).toBeVisible();
  await person.getByLabel('Condition').fill('soaked from the rain');
  await person.getByLabel('Ends').fill('sitting at the counter');
  await person.getByRole('combobox').first().selectOption('LEFT_TO_RIGHT');
  await page.getByRole('button', { name: 'Save the people’s state' }).click();
  await expect.poll(() => commands.filter((c) => c.name === 'setShotContinuity').length).toBe(1);
  const sent = commands.find((c) => c.name === 'setShotContinuity')!.args[2] as { characters: Array<{ condition?: string; endPose?: string; motion?: { direction?: string } }> };
  expect(sent.characters).toContainEqual(expect.objectContaining({ condition: 'soaked from the rain', endPose: 'sitting at the counter', motion: { direction: 'LEFT_TO_RIGHT' } }));
  await expect(page.locator('.ws-context')).toContainText('What the next take is made from');
});

test('people and story state: unsaved edits are guarded like the shot’s own (QA Q2, m1)', async ({ page }) => {
  await open(page, `/shorts/${FILM}/shots/${SHOT}`);
  await page.locator('.ws-disc-sum', { hasText: 'People and story state' }).click();
  const person = page.locator('.ws-context-person').first();
  // opening it changes nothing: no phantom unsaved state
  await expect(page.getByRole('button', { name: 'Save the people’s state' })).toBeDisabled();
  await person.getByLabel('Condition').fill('out of breath');
  await expect(page.locator('.ws-insp-foot')).toContainText('The people’s state is not saved');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press(']');
  await expect(page.getByRole('alertdialog').or(page.getByRole('dialog'))).toContainText('unsaved changes');
  await expect(page).toHaveURL(new RegExp(`${SHOT}$`));
});

test('Repair lip-sync: off with the reason on a cartoon take; on a realistic take the dialog asks why and queues CORRECT_LIPSYNC', async ({ page }) => {
  await open(page, `/shorts/${FILM}/shots/${SHOT}`, { health: READY });
  const first = page.locator('.ws-take').first();
  const off = first.getByRole('button', { name: /^Repair lip-sync/ });
  await expect(off).toBeDisabled();
  await expect(first.locator('.ws-repair-why')).toContainText('not enabled for cartoon faces');
  // the same film as a realistic production (the snapshot answered here; nothing is written)
  const jobs: Array<Record<string, unknown>> = [];
  await page.route('**/api/studio', async (route: Route) => { const res = await route.fetch(); const body = await res.json(); body.state.productions = body.state.productions.map((x: { id: string }) => (x.id === FILM ? { ...x, style: 'REALISTIC' } : x)); await route.fulfill({ response: res, json: body }); });
  await page.route('**/api/jobs', async (route: Route) => { if (route.request().method() !== 'POST') return route.continue(); const b = route.request().postDataJSON(); jobs.push(b); await route.fulfill({ status: 201, json: { job: { id: 'job-e2e-repair', type: b.type, status: 'QUEUED', priority: 0, payload: b.payload, attempts: 0, maxAttempts: 1, cancelRequested: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, created: true } }); });
  await page.goto(`/shorts/${FILM}/shots/${SHOT}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ws:not(.ws-skeleton) .ws-stage .ws-take', { timeout: 90_000 });
  const on = page.locator('.ws-take').first().getByRole('button', { name: /^Repair lip-sync/ });
  await expect(on).toBeEnabled();
  await on.click();
  const dlg = page.getByRole('dialog', { name: /Repair the lip-sync of take 1/ });
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('original take is kept');
  const go = dlg.getByRole('button', { name: 'Repair the lip-sync' });
  await expect(go).toBeDisabled();
  await dlg.getByLabel(/What’s wrong with the lip-sync/).fill('ab');
  await expect(go).toBeDisabled();
  await dlg.getByLabel(/What’s wrong with the lip-sync/).fill('the mouth opens a beat late');
  await dlg.getByRole('checkbox', { name: /Use the repaired take if it passes/ }).check();
  await go.click();
  await expect.poll(() => jobs.length).toBe(1);
  expect(jobs[0]).toMatchObject({ type: 'CORRECT_LIPSYNC', payload: { productionId: FILM, shotId: SHOT, takeId: 'take-a3740bd0a6', confirm: true, reason: 'the mouth opens a beat late', select: true } });
  await expect(dlg).toBeHidden();
});

test('what a scene changes: a persistent change and what someone learns, saved on the scene (routed)', async ({ page }) => {
  await open(page, `${MAP}?tab=story`);
  await page.waitForSelector('.ws-scene-card', { timeout: 90_000 });
  const card = page.locator('.ws-scene-card').first();
  const sentScene = () => commands.filter((c) => c.name === 'updateScene').map((c) => JSON.stringify(c.args[2]));
  // a new fact is a draft on the page until it has words (the studio refuses a fact without them; QA m5)
  await card.getByRole('button', { name: 'Add a change' }).click();
  await expect(card.getByText('Not saved until it has words.')).toBeVisible();
  expect(sentScene().some((s) => s.includes('"changes"'))).toBe(false);
  await card.getByPlaceholder('The change, as it should look').last().fill('a bandaged left arm');
  await expect.poll(sentScene).toContainEqual(expect.stringContaining('a bandaged left arm'));
  await card.getByRole('button', { name: 'Add an event' }).click();
  await card.getByPlaceholder('What has happened').last().fill('the tea is poured');
  await expect.poll(sentScene).toContainEqual(expect.stringContaining('"events"'));
  // the change rows have their own layout: no control is squeezed under 120 px at 1440 (QA Q5)
  const widths = await card.locator('.ws-fact-change').last().locator('input, select').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
  expect(Math.min(...widths)).toBeGreaterThan(120);
});
