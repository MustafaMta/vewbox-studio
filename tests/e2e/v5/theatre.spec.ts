import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/** THE SCREENING ROOM (docs/DESIGN-SYSTEM-V5.md §8.12; src/components/screening) against the studio's real data.
 *  Notes are written through the real B2 routes, so this runs ONLY against your own server and database copy, never
 *  the live studio on :4200:   $env:STUDIO_URL='http://localhost:4259'; npx playwright test tests/e2e/v5/theatre.spec.ts
 *  The notes it adds are removed again at the end (reopened, then deleted); "Send to shot" is routed (answered here),
 *  so no shot's notes are changed. Nothing here resets the studio. */

const BASE = process.env.STUDIO_URL ?? '';
const RUN = `e2e ${Date.now().toString(36)}`;
const made = new Set<string>();

test.beforeAll(() => { if (!BASE || /:4200\b/.test(BASE)) throw new Error('Set STUDIO_URL to your own server (not the live studio on :4200).'); });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });
test.afterAll(async ({ request }) => {
  for (const id of made) {
    await request.post(`/api/notes/${id}/resolve`, { data: { resolved: false } }).catch(() => null);
    await request.delete(`/api/notes/${id}`).catch(() => null);
  }
});

interface Snap { state: { productions: Array<{ id: string; title: string; cutAssetId?: string; updatedAt: string; shots: Array<{ id: string }> }>; assets: Array<{ id: string; kind: string; origin: string; tags: string[]; createdAt: string; provenance?: { shots?: Array<{ shotId: string; start: number }> } }> } }
async function film(request: APIRequestContext) {
  const snap: Snap = await (await request.get('/api/studio')).json();
  const ps = snap.state.productions.filter((p) => p.cutAssetId);
  const p = ps.find((x) => x.id === 'short-28bdb3342b') ?? ps.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  test.skip(!p, 'the studio has no cut to screen');
  const mine = new Set(p.shots.map((s) => s.id));
  const cuts = snap.state.assets.filter((a) => a.id === p.cutAssetId || (a.kind === 'VIDEO' && a.origin === 'DERIVED' && a.tags.includes('cut') && !a.tags.includes('export') && (a.provenance?.shots ?? []).some((s) => mine.has(s.shotId))))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const current = cuts.find((c) => c.id === p.cutAssetId)!;
  return { p, cuts, current, timeline: current.provenance?.shots ?? [], all: ps };
}

async function open(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.theatre-room:not(.theatre-skeleton) .theatre-video', { timeout: 90_000 });
  await page.waitForFunction(() => (document.querySelector('video.theatre-video') as HTMLVideoElement | null)?.readyState! >= 1, null, { timeout: 60_000 });
}
const video = (page: Page) => page.evaluate(() => { const v = document.querySelector('video.theatre-video') as HTMLVideoElement; return { paused: v.paused, t: v.currentTime, src: v.currentSrc, tracks: [...v.textTracks].map((x) => ({ lang: x.language, mode: x.mode, cues: x.activeCues ? [...x.activeCues].map((c) => (c as VTTCue).text) : [] })) }; });
const near = (a: number, b: number, tol = 0.3) => Math.abs(a - b) <= tol;
const seekTo = async (page: Page, t: number) => { await page.getByRole('slider', { name: 'Seek' }).fill(String(t)); await expect.poll(async () => near((await video(page)).t, t, 0.15)).toBe(true); };

test('the list: every production with a cut as a poster card that opens its theatre', async ({ page, request }) => {
  const { all } = await film(request);
  await page.goto('/screening', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Screening Room', level: 1 })).toBeVisible({ timeout: 90_000 });
  const cards = page.locator('.theatre-grid .mcard');
  await expect(cards).toHaveCount(all.length);
  const first = all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  await expect(cards.first()).toHaveAttribute('href', `/screening?p=${first.id}`);
  await cards.first().click();
  await expect(page).toHaveURL(new RegExp(`/screening\\?p=${first.id}$`));
  await expect(page.locator('#theatre-title')).toHaveText(first.title);
});

test('play and pause from the transport; the lights go down while it plays and come back on movement', async ({ page, request }) => {
  const { p } = await film(request);
  await open(page, `/screening?p=${p.id}`);
  // the transport is docked under the picture and never over it
  const pic = await page.locator('.theatre-pic').boundingBox(); const tr = await page.locator('.theatre-transport').boundingBox();
  expect(Math.round(tr!.y)).toBe(Math.round(pic!.y + pic!.height));
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => (await video(page)).paused).toBe(false);
  await expect.poll(async () => (await video(page)).t, { timeout: 10_000 }).toBeGreaterThan(0.5);
  await expect(page.locator('.shell')).toHaveAttribute('data-lights', 'down', { timeout: 6_000 });
  await page.mouse.move(200, 200); await page.mouse.move(260, 240);
  await expect(page.locator('.shell')).not.toHaveAttribute('data-lights', 'down');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(async () => (await video(page)).paused).toBe(true);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

test('seek: the seek bar, ±5 s and a shot in the Shots tab move the playhead and the readout', async ({ page, request }) => {
  const { p, timeline } = await film(request);
  await open(page, `/screening?p=${p.id}`);
  await seekTo(page, 30);
  await expect(page.locator('.theatre-time')).toContainText('0:30');
  await page.getByRole('button', { name: 'Forward 5 seconds' }).click();
  await expect.poll(async () => near((await video(page)).t, 35)).toBe(true);
  await page.getByRole('button', { name: 'Back 5 seconds' }).click();
  await expect.poll(async () => near((await video(page)).t, 30)).toBe(true);
  test.skip(timeline.length < 2, 'the cut records no shots');
  await page.getByRole('tab', { name: /^Shots/ }).click();
  const target = timeline[timeline.length - 1];
  await page.locator('.theatre-shot-main').last().click();
  await expect.poll(async () => near((await video(page)).t, target.start, 0.1)).toBe(true);
  await expect(page.locator('.theatre-shot').last()).toHaveAttribute('data-current', /.*/);
  await expect(page.locator('.theatre-shot').last().getByRole('link')).toHaveAttribute('href', new RegExp(`/shots/${target.shotId}$`));
});

test('version switch: Cut 1, 2, 3 change the picture and the slate, and keep the playhead', async ({ page, request }) => {
  const { p, cuts, current } = await film(request);
  test.skip(cuts.length < 2, 'one cut only');
  await open(page, `/screening?p=${p.id}`);
  const versions = page.getByRole('radiogroup', { name: 'Cut version' });
  await expect(versions.getByRole('radio')).toHaveCount(cuts.length);
  await expect(versions.getByRole('radio', { checked: true })).toContainText(`Cut ${cuts.indexOf(current) + 1}`);
  await seekTo(page, 20);
  await versions.getByRole('radio', { name: /^Cut 1/ }).click();
  await expect(page).toHaveURL(new RegExp(`cut=1$`));
  await expect.poll(async () => (await video(page)).src).toContain(`/api/media/${cuts[0].id}`);
  await expect(page.locator('.theatre-prog .theatre-slate')).toContainText(`Cut 1 of ${cuts.length}`);
  await expect.poll(async () => near((await video(page)).t, 20, 0.5), { timeout: 20_000 }).toBe(true);
  await versions.getByRole('radio', { name: new RegExp(`^Cut ${cuts.length}`) }).click();
  await expect.poll(async () => (await video(page)).src).toContain(`/api/media/${cuts[cuts.length - 1].id}`);
});

test('notes: add one at the current time with a pin, jump to it, send it to its shot, resolve it', async ({ page, request }) => {
  const { p, timeline } = await film(request);
  await open(page, `/screening?p=${p.id}`);
  await seekTo(page, 12);
  const composer = page.getByRole('form', { name: 'New note' });
  await expect(composer).toContainText('Note at 0:12');
  // a pin on the frame: the next click lands on the picture instead of playing it
  await composer.getByRole('button', { name: 'Pin on the frame' }).click();
  const pic = (await page.locator('.theatre-pic').boundingBox())!;
  await page.mouse.click(pic.x + pic.width * 0.7, pic.y + pic.height * 0.25);
  await expect(composer.getByRole('button', { name: 'Remove the pin' })).toBeVisible();
  expect((await video(page)).paused).toBe(true);
  const text = `${RUN}: the portrait should flicker here`;
  await page.getByLabel(/^Note at/).fill(text);
  const [res] = await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/notes') && r.request().method() === 'POST'), page.getByLabel(/^Note at/).press('Enter')]);
  expect(res.status()).toBe(201);
  const note = (await res.json()).note as { id: string; timecode: number; pin?: { x: number; y: number }; cutAssetId: string };
  made.add(note.id);
  expect(near(note.timecode, 12, 0.2)).toBe(true);
  expect(note.pin && near(note.pin.x, 0.7, 0.02) && near(note.pin.y, 0.25, 0.02)).toBe(true);
  const row = page.locator('.theatre-note', { hasText: text });
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute('data-active', /.*/);
  // its pin is on the frame, numbered as the list numbers it
  await expect(page.getByRole('button', { name: new RegExp(`^Note \\d+ at 0:12: ${RUN}`) })).toBeVisible();
  // jump: from elsewhere, the timecode brings the playhead back
  await seekTo(page, 40);
  await row.getByRole('button', { name: /^Jump to 0:12/ }).click();
  await expect.poll(async () => near((await video(page)).t, note.timecode, 0.1)).toBe(true);
  // send to shot: routed here, so no shot's notes change
  const shot = timeline.find((s, i) => note.timecode >= s.start && (i === timeline.length - 1 || note.timecode < timeline[i + 1].start));
  test.skip(!shot, 'the cut records no shots');
  await page.route('**/api/notes/*/send-to-shot', async (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/')[3]);
    const body = route.request().postDataJSON() as { shotId: string };
    const cur = await (await request.get(`/api/notes/${id}`)).json();
    await route.fulfill({ json: { note: { ...cur.note, sentToShotId: body.shotId, updatedAt: new Date().toISOString() }, shot: { id: body.shotId } } });
  });
  await row.getByRole('button', { name: /^Send to shot / }).click();
  const open_ = row.getByRole('link', { name: /^Open shot / });
  await expect(open_).toHaveAttribute('href', new RegExp(`/shots/${shot!.shotId}$`));
  await expect(page.getByRole('status').filter({ hasText: /^Sent to shot/ })).toBeVisible();
  // resolve (real write), then reopen
  await row.getByRole('button', { name: 'Resolve' }).click();
  await expect(row.locator('.badge')).toHaveText('Resolved');
  await expect(row).toHaveAttribute('data-resolved', /.*/);
  expect((await (await request.get(`/api/notes/${note.id}`)).json()).note.status).toBe('resolved');
  await row.getByRole('button', { name: 'Reopen' }).click();
  await expect(row).not.toHaveAttribute('data-resolved', /.*/);
  // the note tick sits on the seek bar
  await expect(page.locator('.theatre-seek .seek-tick[data-kind="note"]')).not.toHaveCount(0);
});

test('an empty notes pane: one sentence and the composer', async ({ page, request }) => {
  const { p } = await film(request);
  await page.route('**/api/notes?*', (route) => (route.request().method() === 'GET' ? route.fulfill({ json: { notes: [] } }) : route.continue()));
  await open(page, `/screening?p=${p.id}`);
  await expect(page.locator('.theatre-pane')).toContainText(/No notes on cut \d+ yet/);
  await expect(page.getByRole('form', { name: 'New note' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /^Notes/ })).toHaveAttribute('aria-selected', 'true');
});

test('keyboard: K, J/L, arrows, S, C and [ ] while the theatre has focus; the focus ring is visible', async ({ page, request }) => {
  const { p, timeline } = await film(request);
  await open(page, `/screening?p=${p.id}`);
  await page.locator('.theatre-stage').focus();
  await expect(page.locator('.theatre-stage')).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('k');
  await expect.poll(async () => (await video(page)).paused).toBe(false);
  await page.keyboard.press('k');
  await expect.poll(async () => (await video(page)).paused).toBe(true);
  await seekTo(page, 20);
  await page.locator('.theatre-stage').focus();
  await page.keyboard.press('l');
  await expect.poll(async () => near((await video(page)).t, 25)).toBe(true);
  await page.keyboard.press('j');
  await expect.poll(async () => near((await video(page)).t, 20)).toBe(true);
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(async () => near((await video(page)).t, 21)).toBe(true);
  await page.keyboard.press('Home');
  await expect.poll(async () => near((await video(page)).t, 0, 0.05)).toBe(true);
  if (timeline.length > 1) {
    await page.keyboard.press(']');
    await expect.poll(async () => near((await video(page)).t, timeline[1].start, 0.1)).toBe(true);
    await page.keyboard.press(']');
    await page.keyboard.press('[');
    await expect.poll(async () => near((await video(page)).t, timeline[1].start, 0.1)).toBe(true);
  }
  const cc = page.getByRole('button', { name: 'English subtitles' });
  await expect(cc).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('s');
  await expect(cc).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('s');
  await expect(cc).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('c');
  await expect(page.getByLabel(/^Note at/)).toBeFocused();
  // Tab from the stage reaches the play button with a visible ring
  await page.locator('.theatre-stage').focus();
  await page.keyboard.press('Tab');
  const focused = page.locator(':focus');
  await expect(focused).toHaveAttribute('aria-label', /^(Play|Pause)$/);
  await expect(focused).toHaveCSS('outline-style', 'solid');
});

test('subtitles: the English track shows by default, its words appear at their time, and the toggle hides them', async ({ page, request }) => {
  const { p } = await film(request);
  await open(page, `/screening?p=${p.id}`);
  const cc = page.getByRole('button', { name: 'English subtitles' });
  await expect(cc).toHaveAttribute('aria-pressed', 'true');
  expect((await video(page)).tracks).toEqual([expect.objectContaining({ lang: 'en', mode: 'showing' })]);
  await seekTo(page, 9);
  await expect.poll(async () => (await video(page)).tracks[0].cues.join(' '), { timeout: 10_000 }).not.toBe('');
  await cc.click();
  await expect(cc).toHaveAttribute('aria-pressed', 'false');
  expect((await video(page)).tracks[0].mode).toBe('hidden');
  await cc.click();
  expect((await video(page)).tracks[0].mode).toBe('showing');
});

test('exports: the deliverables download the export and its subtitle files', async ({ page, request }) => {
  const { p } = await film(request);
  await open(page, `/screening?p=${p.id}`);
  await page.getByRole('tab', { name: /^Export/ }).click();
  const list = page.getByRole('list', { name: 'Deliverables' });
  const links = list.getByRole('link');
  expect(await links.count()).toBeGreaterThan(0);
  for (const href of await links.evaluateAll((els) => els.map((e) => [e.getAttribute('href'), e.getAttribute('download')]))) {
    expect(href[0]).toMatch(/^\/api\/media\//);
    expect(href[1]).toBeTruthy();
  }
  const dl = page.getByRole('link', { name: /^Download the film/ });
  const res = await request.head(String(await dl.getAttribute('href')));
  expect(res.ok()).toBe(true);
});

test('a production that is not in the studio says so', async ({ page }) => {
  await page.goto('/screening?p=not-a-film', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: "This film isn't in the studio" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole('link', { name: 'Back to the Screening Room' })).toHaveAttribute('href', '/screening');
});

test('phone 390: the picture edge to edge, the transport under it, no horizontal overflow @mobile', async ({ page, request }) => {
  const { p } = await film(request);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, `/screening?p=${p.id}`);
  const pic = (await page.locator('.theatre-pic').boundingBox())!;
  expect(Math.round(pic.x)).toBe(0); expect(Math.round(pic.width)).toBe(390);
  const tr = (await page.locator('.theatre-transport').boundingBox())!;
  expect(Math.round(tr.y)).toBe(Math.round(pic.y + pic.height));
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
});
