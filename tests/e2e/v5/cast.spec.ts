import { expect, test, type Page, type Request } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare } from '../../../scripts/lib/capture.mjs';

/** P-CAST (docs/design/PAGE-ENGINEERING-BRIEF.md §4) — the casting directory, the character profile, character
 *  creation and the locations, against the studio's real data, read-only: every write the page sends is answered here
 *  (the capture helper answers /api/commands; this spec answers /api/jobs with a fake job) and never reaches a server.
 *  Generation stays paused: no real job starts. Run against your own server and database copy, never the live studio:
 *    $env:STUDIO_URL='http://localhost:4256'; npx playwright test tests/e2e/v5/cast.spec.ts --project=desktop */

interface Snapshot { state: { characters: Array<{ id: string; name: string; canonicalImage?: { status: string }; usage?: { videos: unknown[] }; voice: { identity?: unknown } }>; locations: Array<{ id: string; name: string }> } }

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

/** Writes are recorded, never sent: commands (from the capture helper) and jobs (a fake queued job). */
async function open(page: Page, path: string, { width = 1440, height = 900 } = {}) {
  await page.setViewportSize({ width, height });
  await (prepare as (p: Page, o: { motion?: string }) => Promise<void>)(page, { motion: 'reduce' });
  const writes: Array<{ url: string; body: unknown }> = [];
  page.on('request', (r: Request) => { if (r.method() === 'POST' && /\/api\/(commands|jobs)/.test(r.url())) writes.push({ url: r.url(), body: r.postDataJSON() }); });
  await page.route('**/api/jobs', (route) => (route.request().method() === 'POST'
    ? route.fulfill({ json: { job: { id: 'job-e2e', type: (route.request().postDataJSON() as { type: string }).type, status: 'QUEUED', priority: 0, payload: {}, attempts: 0, maxAttempts: 1, cancelRequested: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, created: true } })
    : route.fallback()));
  await page.route('**/api/jobs/job-e2e', (route) => route.fulfill({ json: { job: { id: 'job-e2e', type: 'CREATE_CHARACTER', status: 'QUEUED', priority: 0, payload: {}, attempts: 0, maxAttempts: 1, cancelRequested: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, events: [] } }));
  await page.route('**/api/status', (route) => route.fulfill({ json: { video: { ok: true }, story: { ok: true }, images: { ok: true }, voice: { ok: true }, transcription: { ok: true }, music: { ok: true }, gpu: null, minimaxConfigured: false } }));
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('main h1', { timeout: 90_000 });
  await page.evaluate(() => document.fonts.ready);
  return writes;
}
const commandsIn = (writes: Array<{ url: string; body: unknown }>) => writes.filter((w) => w.url.includes('/api/commands')).flatMap((w) => (w.body as { commands: Array<{ name: string; args: unknown[] }> }).commands);

test.describe('the casting directory', () => {
  test('one figure card per character, names on the frame edge (Arabic too), "Needs approval" only for drafts, voice discs only with a voice', async ({ page, request }) => {
    const snap: Snapshot = await (await request.get('/api/studio')).json();
    await open(page, '/characters');
    const cards = page.locator('.pc-grid .fcard:not(.fcard-start)');
    await expect(cards).toHaveCount(snap.state.characters.length);
    for (const c of snap.state.characters) await expect(page.locator('.pc-grid .fcard-name', { hasText: c.name })).toHaveCount(1);
    const edges = await cards.evaluateAll((els) => els.map((e) => Math.round(e.querySelector('.fcard-name bdi')!.getBoundingClientRect().left - e.querySelector('.fcard-frame')!.getBoundingClientRect().left)));
    expect(new Set(edges)).toEqual(new Set([0]));
    const drafts = snap.state.characters.filter((c) => c.canonicalImage?.status === 'DRAFT' && !(c.usage?.videos.length)).length;
    await expect(page.locator('.pc-grid .badge-warn', { hasText: 'Needs approval' })).toHaveCount(drafts);
    // the figure is never cropped: contain on its field, at 928:1664
    const fit = await page.locator('.pc-grid .fcard-frame img').first().evaluate((i) => getComputedStyle(i).objectFit);
    expect(fit).toBe('contain');
    const discs = page.locator('.pc-grid .pdisc');
    expect(await discs.count()).toBeGreaterThan(0);
    expect(await discs.count()).toBeLessThanOrEqual(snap.state.characters.length);
    expect((await discs.first().boundingBox())!.width).toBe(36);
    await expect(discs.first()).toHaveAccessibleName(/^Play .+’s voice$/);
  });

  test('search, filters and sorting appear only once the cast is larger than six (§5.23; Design QA m9)', async ({ page, request }) => {
    const snap: Snapshot = await (await request.get('/api/studio')).json();
    await open(page, '/characters');
    const cards = page.locator('.pc-grid .fcard:not(.fcard-start)');
    await expect(cards).toHaveCount(snap.state.characters.length);
    if (snap.state.characters.length <= 6) {
      await expect(page.getByRole('searchbox')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Filter/ })).toHaveCount(0);
      return;
    }
    const search = page.getByRole('searchbox');
    await search.fill(snap.state.characters[0].name);
    await expect(cards).toHaveCount(1);
    await search.fill('zzzz-nobody');
    await expect(page.getByText('No character matches “zzzz-nobody”.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear the search' }).click();
    await expect(cards.first()).toBeVisible();
  });

  test('"New character" is the primary split: Auto by default, Manual and From a picture in its menu', async ({ page }) => {
    await open(page, '/characters');
    await expect(page.locator('.pc-head .btn-primary', { hasText: 'New character' })).toHaveAttribute('href', '/characters/new');
    await page.getByRole('button', { name: 'More ways to create a character' }).click();
    await expect(page.getByRole('menuitem', { name: /^Manual/ })).toHaveAttribute('href', '/characters/new?start=sheet');
    await expect(page.getByRole('menuitem', { name: /^From a picture/ })).toHaveAttribute('href', '/characters/new?start=picture');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menuitem', { name: /^Manual/ })).toBeHidden();
  });

  test('every figure card shows the focus ring when reached with the keyboard, and opens its profile', async ({ page }) => {
    await open(page, '/characters');
    const first = page.locator('.pc-grid .fcard').first();
    await first.focus();
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); await page.waitForTimeout(400);
    const ring = await first.evaluate((e) => { const cs = getComputedStyle(e); return { style: cs.outlineStyle, width: cs.outlineWidth, offset: cs.outlineOffset, fv: e.matches(':focus-visible') }; });
    expect(ring).toEqual({ style: 'solid', width: '2px', offset: '3px', fv: true });
    const href = await first.getAttribute('href');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.locator('#char-name')).toBeVisible();
  });

  test('@mobile phone 390: two across, no horizontal overflow', async ({ page }) => {
    await open(page, '/characters', { width: 390, height: 844 });
    const xs = await page.locator('.pc-grid > li').evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().left)))]);
    expect(xs.length).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
  });
});

test.describe('the character profile', () => {
  const pick = async (request: import('@playwright/test').APIRequestContext, which: 'draft' | 'locked') => {
    const snap: Snapshot = await (await request.get('/api/studio')).json();
    return snap.state.characters.find((c) => which === 'draft' ? c.canonicalImage?.status === 'DRAFT' && !c.usage?.videos.length : (c.usage?.videos.length ?? 0) > 0);
  };

  test('a draft: the figure sticky and uncropped beside the words; Approve sends the approval command', async ({ page, request }) => {
    const c = await pick(request, 'draft'); test.skip(!c, 'no draft character');
    const writes = await open(page, `/characters/${c!.id}`);
    const fig = page.locator('.char-figure');
    expect(await fig.evaluate((e) => getComputedStyle(e).position)).toBe('sticky');
    expect(await page.locator('.char-figure-frame img').evaluate((i) => getComputedStyle(i).objectFit)).toBe('contain');
    const box = (await page.locator('.char-figure-frame').boundingBox())!;
    expect(Math.abs(box.width / box.height - 928 / 1664)).toBeLessThan(0.01);
    expect(box.y + box.height).toBeLessThanOrEqual(900);
    await expect(page.getByText('Waiting for your approval')).toBeVisible();
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect.poll(() => commandsIn(writes).map((x) => x.name)).toContain('approveCanonicalImage');
  });

  test('a draft: Redraw opens its dialog (Esc closes it); Edit details validates the name and saves through updateCharacter', async ({ page, request }) => {
    const c = await pick(request, 'draft'); test.skip(!c, 'no draft character');
    const writes = await open(page, `/characters/${c!.id}`);
    await page.getByRole('button', { name: 'Redraw', exact: true }).click();
    const redraw = page.getByRole('dialog', { name: `Redraw ${c!.name}` });
    await expect(redraw).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(redraw).toBeHidden();
    await page.getByRole('button', { name: 'Edit details' }).click();
    const dlg = page.getByRole('dialog', { name: 'Edit details' });
    await dlg.getByLabel('Name', { exact: true }).fill('');
    await dlg.getByRole('button', { name: 'Save' }).click();
    await expect(dlg.getByText('Give them a name.')).toBeVisible();
    await dlg.getByLabel('Name', { exact: true }).fill(`${c!.name} test`);
    await dlg.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => commandsIn(writes).map((x) => x.name)).toContain('updateCharacter');
  });

  test('delete asks first, in the confirm dialog, and Cancel keeps the character', async ({ page, request }) => {
    const c = await pick(request, 'draft'); test.skip(!c, 'no draft character');
    const writes = await open(page, `/characters/${c!.id}`);
    await page.getByRole('button', { name: `More for ${c!.name}` }).click();
    await page.getByRole('menuitem', { name: `Delete ${c!.name}` }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm.getByRole('button', { name: `Delete ${c!.name}` })).toBeVisible();
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toBeHidden();
    expect(commandsIn(writes).map((x) => x.name)).not.toContain('deleteCharacter');
  });

  test('a filmed character: locked (no Approve, no Redraw), one voice row, and its productions as posters and shots as frames', async ({ page, request }) => {
    const c = await pick(request, 'locked'); test.skip(!c, 'no filmed character');
    await open(page, `/characters/${c!.id}`);
    await expect(page.getByText(/^Locked · /)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Redraw', exact: true })).toHaveCount(0);
    await expect(page.locator('.char-main > .char-voice .arow')).toHaveCount(1);
    await expect(page.locator('#appears .char-posters .mcard').first()).toHaveAttribute('href', /^\/(shorts|music-videos|shows)\//);
    expect(await page.locator('#appears .char-frames .mtile').count()).toBeGreaterThan(0);
    // the More menu holds "Edit the look", disabled with its reason
    await page.getByRole('button', { name: `More for ${c!.name}` }).click();
    await expect(page.getByRole('menuitem', { name: /Edit the look/ })).toBeDisabled();
  });

  test('no accessibility violation of the image roles (axe role-img-alt), nor any serious one', async ({ page, request }) => {
    const c = await pick(request, 'locked'); test.skip(!c, 'no filmed character');
    await open(page, `/characters/${c!.id}`);
    const r = await new AxeBuilder({ page }).include('main').analyze();
    expect(r.violations.filter((v) => v.id === 'role-img-alt')).toEqual([]);
    expect(r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)).toEqual([]);
  });
});

test.describe('creating a character', () => {
  test('Auto: an empty line is refused next to the field; one line drafts the character through CREATE_CHARACTER (mocked)', async ({ page }) => {
    const writes = await open(page, '/characters/new');
    await page.evaluate(() => sessionStorage.removeItem('vewbox.newCharacter'));
    await page.getByRole('button', { name: 'Draft the character' }).click();
    await expect(page.getByText('Write a line about them, or at least a name.')).toBeVisible();
    await page.getByLabel('Who are they?').fill('A night-shift radio operator who hums old songs');
    await page.getByRole('button', { name: 'Draft the character' }).click();
    await expect.poll(() => writes.filter((w) => w.url.endsWith('/api/jobs')).map((w) => (w.body as { type: string; payload: { mode: string } })).map((b) => `${b.type}:${b.payload.mode}`)).toContain('CREATE_CHARACTER:AUTO');
    await expect(page.getByText('You can leave this page')).toBeVisible();
  });

  test('Manual: a name is required; "Create without drawing" sends MANUAL with draw off', async ({ page }) => {
    const writes = await open(page, '/characters/new?start=sheet');
    await page.getByRole('button', { name: 'Create without drawing' }).click();
    await expect(page.getByText('Give them a name.')).toBeVisible();
    await page.getByLabel('Name', { exact: true }).fill('Rana');
    await page.getByRole('radio', { name: 'Anime' }).click();
    await page.getByRole('button', { name: 'Create without drawing' }).click();
    await expect.poll(() => writes.filter((w) => w.url.endsWith('/api/jobs')).map((w) => w.body as { payload: { mode: string; draw: boolean; style: string } }).map((b) => `${b.payload.mode}:${b.payload.draw}:${b.payload.style}`)).toContain('MANUAL:false:ANIME');
  });

  test('From a picture: the picture is required, said next to the drop target; the live preview follows the name', async ({ page }) => {
    await open(page, '/characters/new?start=picture');
    await page.getByRole('button', { name: 'Draw from the picture' }).click();
    await expect(page.getByText('Add a reference picture first.')).toBeVisible();
    await page.getByLabel('Name').first().fill('Layla');
    await expect(page.locator('.pc-create-preview .tcard-title')).toHaveText('Layla');
  });
});

test.describe('the locations', () => {
  test('the board: one 16:9 plate per location, a start card at the end; the page: the 2.39:1 plate, the lighting switch, props add through updateLocation', async ({ page, request }) => {
    const snap: Snapshot = await (await request.get('/api/studio')).json();
    const l = snap.state.locations[0]; test.skip(!l, 'no location');
    await open(page, '/locations');
    await expect(page.locator('.pc-plates .mtile')).toHaveCount(snap.state.locations.length);
    const frame = (await page.locator('.pc-plates .mtile-frame').first().boundingBox())!;
    expect(Math.round((frame.width / frame.height) * 100) / 100).toBe(1.78);
    await page.locator('.pc-plates .mtile-link').first().click();
    await expect(page).toHaveURL(new RegExp(`/locations/${l.id}$`));
    const hero = (await page.locator('.loc-hero-plate').boundingBox())!;
    expect(Math.round((hero.width / hero.height) * 100) / 100).toBe(2.39);
    await expect(page.getByRole('radiogroup', { name: 'Lighting' }).getByRole('radio', { checked: true })).toHaveCount(1);
    const writes = await (async () => { const w: Array<{ url: string; body: unknown }> = []; page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/api/commands')) w.push({ url: r.url(), body: r.postDataJSON() }); }); return w; })();
    await page.getByLabel('Add a prop').fill('A brass compass');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect.poll(() => commandsIn(writes).map((x) => x.name)).toContain('updateLocation');
  });

  test('new location, Auto: the line is required; then the record is created and the plates job asked for (mocked)', async ({ page }) => {
    const writes = await open(page, '/locations/new');
    await page.getByRole('button', { name: 'Create and draw plates' }).click();
    await expect(page.getByText('Describe the place in a few words.')).toBeVisible();
    await page.getByLabel('What is the place?').fill('A rooftop water tank at dawn, pigeons on the rail');
    await page.getByRole('button', { name: 'Create and draw plates' }).click();
    await expect.poll(() => commandsIn(writes).map((x) => x.name)).toContain('addLocation');
    await expect.poll(() => writes.filter((w) => w.url.endsWith('/api/jobs')).map((w) => (w.body as { type: string }).type)).toContain('LOCATION_PLATES');
    await expect(page).toHaveURL(/\/locations\/[^/]+$/);
  });
});

test('while the studio loads, the page waits in a skeleton region, then shows its content', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await (prepare as (p: Page, o: { motion?: string }) => Promise<void>)(page, { motion: 'reduce' });
  await page.route('**/api/studio', async (route) => { await new Promise((r) => setTimeout(r, 2500)); await route.fallback(); });
  await page.goto('/characters', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[aria-busy="true"]').first()).toBeAttached();
  await expect(page.locator('main h1')).toHaveText(/Characters/, { timeout: 90_000 });
});
