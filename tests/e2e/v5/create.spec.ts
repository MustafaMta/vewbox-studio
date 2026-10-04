import { expect, test, type Page, type Route } from '@playwright/test';
import { prepare } from '../../../scripts/lib/capture.mjs';

/** CREATE (P-Create): the /new hub and the creation flows — Auto and Manual for a show, a short and a music video —
 *  against your own server and database copy, never the live studio:
 *    $env:STUDIO_URL='http://localhost:4257'; npx playwright test tests/e2e/v5/create.spec.ts
 *  Every write is answered in the browser and recorded here (studio commands, the AUTO_IDEA job, the song upload);
 *  nothing reaches the server. The engines' answers are routed per test (ready, offline, paused); "developing" is
 *  routed from the job the test started; the proposal to pick is the studio's own, read live. */

interface Sent { commands: Array<{ name: string; args: unknown[] }>; jobs: Array<{ type: string; payload: Record<string, unknown> }>; uploads: number }

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

async function open(page: Page, path: string, opts: { engines?: 'ready' | 'storyOffline' | 'paused' | 'live'; width?: number } = {}): Promise<Sent> {
  if (opts.width) await page.setViewportSize({ width: opts.width, height: 900 });
  await (prepare as (p: Page, o: { motion?: string }) => Promise<void>)(page, { motion: 'reduce' });
  const sent: Sent = { commands: [], jobs: [], uploads: 0 };
  await page.route((u) => u.pathname === '/api/commands', async (route) => {
    const body = route.request().postDataJSON() as { commands: Sent['commands'] };
    sent.commands.push(...body.commands);
    await route.fulfill({ json: { ok: true, version: 1, hash: 'test', results: [] } });
  });
  const engines = opts.engines ?? 'ready';
  if (engines !== 'live') {
    await page.route((u) => u.pathname === '/api/status', (route) => route.fulfill({ json: { story: { ok: engines !== 'storyOffline', detail: '', where: 'local' }, video: { ok: false }, images: { ok: false }, voice: { ok: false }, transcription: { ok: false }, music: { ok: false }, gpu: null, minimaxConfigured: false } }));
    await page.route((u) => u.pathname === '/api/health', (route) => route.fulfill({ json: { ok: true, intake: engines === 'paused' ? { paused: true, reason: 'Generation is paused for the redesign.' } : { paused: false } } }));
  }
  await page.route((u) => u.pathname === '/api/jobs', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = route.request().postDataJSON() as Sent['jobs'][number];
    sent.jobs.push(body);
    const now = new Date().toISOString();
    await route.fulfill({ json: { created: true, job: { id: `job-e2e-${sent.jobs.length}`, type: body.type, status: 'QUEUED', priority: 0, payload: body.payload, attempts: 0, maxAttempts: 1, cancelRequested: false, createdAt: now, updatedAt: now } } });
  });
  await page.route((u) => u.pathname === '/api/assets', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    sent.uploads += 1;
    await route.fulfill({ json: { asset: { id: 'asset-e2e-song', kind: 'AUDIO', src: '/api/media/asset-e2e-song', label: 'river-lights.wav', durationSeconds: 150, tags: ['song', 'upload'], sample: false, origin: 'UPLOAD', createdAt: new Date().toISOString() } } });
  });
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('main h1', { timeout: 90_000 });
  await page.waitForFunction(() => !document.querySelector('.create-skeleton'), null, { timeout: 60_000 });
  return sent;
}

const flushed = async (_page: Page, sent: Sent, name: string) => { await expect.poll(() => sent.commands.map((c) => c.name), { timeout: 10_000 }).toContain(name); return sent.commands.find((c) => c.name === name)!; };

// ------------------------------------------------------------------------------------------------------- the hub

test('the hub: films start in Auto or Manual, the cast and the world on their own pages', async ({ page }) => {
  await open(page, '/new');
  await expect(page.getByRole('heading', { level: 1, name: 'Create' })).toBeVisible();
  for (const [title, kind] of [['New show', 'show'], ['New short', 'short'], ['New music video', 'music-video']]) {
    await expect(page.getByRole('link', { name: `${title}, Auto: the studio proposes` })).toHaveAttribute('href', `/new/${kind}?mode=auto`);
    await expect(page.getByRole('link', { name: `${title}, Manual: write the brief` })).toHaveAttribute('href', `/new/${kind}?mode=manual`);
  }
  await expect(page.locator('.tool-card', { hasText: 'New character' })).toHaveAttribute('href', '/characters/new');
  await expect(page.locator('.tool-card', { hasText: 'New location' })).toHaveAttribute('href', '/locations/new');
  // equal heights in the films row
  const heights = await page.locator('.create-start').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  expect(new Set(heights).size).toBe(1);
  await page.getByRole('link', { name: 'New short, Manual: write the brief' }).click();
  await expect(page).toHaveURL(/\/new\/short\?mode=manual$/);
  await expect(page.locator('#create-title')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('radio', { name: 'Manual' })).toHaveAttribute('aria-checked', 'true');
});

test('the hub and a flow show their skeletons while the studio loads', async ({ page }) => {
  await (prepare as (p: Page, o: { motion?: string }) => Promise<void>)(page, { motion: 'reduce' });
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  await page.route((u) => u.pathname === '/api/studio', async (route: Route) => { await gate; await route.continue().catch(() => {}); });
  await page.goto('/new/short', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.create-skeleton')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.create-skeleton[aria-busy="true"]')).toHaveCount(1);
  release();
  await expect(page.getByRole('heading', { level: 1, name: 'New short' })).toBeVisible({ timeout: 60_000 });
});

// ------------------------------------------------------------------------------------------------------- manual

test('short, Manual: the minimal brief validates, then creates a draft short through addProduction', async ({ page }) => {
  const sent = await open(page, '/new/short?mode=manual');
  await page.getByRole('button', { name: 'Create short' }).click();
  await expect(page.locator('main').getByRole('alert')).toHaveText('Give the short a title or one line about it.');
  await expect(page.locator('#create-title')).toBeFocused();
  await expect(page.locator('#create-title')).toHaveAttribute('aria-invalid', 'true');
  await page.locator('#create-title').fill('Paper Boats');
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.create-preview-title')).toHaveText('Paper Boats');
  await page.getByRole('radio', { name: /Anime/ }).click();
  await page.getByRole('radio', { name: 'English' }).click();
  await page.getByRole('radio', { name: '9:16' }).click();
  // advanced controls stay behind the kit's disclosure (DS-3: DisclosureCard — a head button with aria-expanded, a
  // region that is inert while closed; a closed region keeps a box, so its state, not visibility, is what counts)
  const more = page.locator('button.disclosure-head', { hasText: 'More control' });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.disclosure-region', { has: page.locator('.fcard') })).toHaveAttribute('inert', '');
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  const first = page.locator('.disclosure-region .fcard').first();
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Create short' }).click();
  const cmd = await flushed(page, sent, 'addProduction');
  const input = cmd.args[0] as Record<string, unknown>;
  expect(input).toMatchObject({ kind: 'SHORT', title: 'Paper Boats', style: 'ANIME', language: 'EN', aspect: 'VERTICAL_9_16', targetSeconds: 60, brief: { mode: 'MANUAL' } });
  expect((input.castIds as string[]).length).toBe(1);
  await expect(page).toHaveURL(/\/shorts\/short-/);
  expect(sent.jobs).toEqual([]);
});

test('show, Manual: creates the show with addShow and lands on the show', async ({ page }) => {
  const sent = await open(page, '/new/show?mode=manual');
  await expect(page.getByRole('radiogroup', { name: 'Length' })).toHaveCount(0);
  await page.locator('#create-title').fill('The Last Sip');
  await page.getByLabel('One line').fill('A Baghdad café keeps its last customer awake through the night.');
  await page.getByRole('button', { name: 'Create show' }).click();
  const cmd = await flushed(page, sent, 'addShow');
  expect(cmd.args[0]).toMatchObject({ title: 'The Last Sip', logline: 'A Baghdad café keeps its last customer awake through the night.' });
  await expect(page).toHaveURL(/\/shows\/show-/);
});

test('music video, Manual: the song comes first — an upload is required once chosen — then the performers', async ({ page }) => {
  const sent = await open(page, '/new/music-video?mode=manual');
  const song = page.getByRole('heading', { name: 'The song' });
  const brief = page.getByRole('heading', { name: 'The brief' });
  expect((await song.boundingBox())!.y).toBeLessThan((await brief.boundingBox())!.y);
  await page.getByRole('radio', { name: /Upload a song/ }).click();
  await page.locator('#create-title').fill('River Lights');
  await page.getByRole('button', { name: 'Create music video' }).click();
  await expect(page.locator('main').getByRole('alert')).toHaveText('Choose the song file, or let the studio write it.');
  await page.locator('#create-song input[type=file]').setInputFiles({ name: 'river-lights.wav', mimeType: 'audio/wav', buffer: Buffer.from('RIFF0000WAVEfmt ') });
  await expect(page.locator('.shaped-drop-meta')).toContainText('river-lights.wav');
  expect(sent.uploads).toBe(1);
  const performer = page.locator('section', { has: page.getByRole('heading', { name: 'Performers' }) }).locator('.fcard').first();
  await performer.click();
  await page.getByRole('button', { name: 'Create music video' }).click();
  const cmd = await flushed(page, sent, 'addProduction');
  const input = cmd.args[0] as { kind: string; song: { source: string; assetId: string; singerIds: string[] }; castIds: string[] };
  expect(input.kind).toBe('MUSIC_VIDEO');
  expect(input.song).toMatchObject({ source: 'UPLOADED', assetId: 'asset-e2e-song', durationSeconds: 150 });
  expect(input.song.singerIds).toEqual(input.castIds);
  expect(input.castIds.length).toBe(1);
});

// --------------------------------------------------------------------------------------------------------- auto

test('short, Auto: one line, then the real stages, then the proposal to pick, then acceptProposal', async ({ page, request }) => {
  const jobs = (await (await request.get('/api/jobs?limit=200')).json()).jobs as Array<{ id: string; type: string; status: string; payload: { kind: string }; result?: { proposalId?: string } }>;
  const real = jobs.find((j) => j.type === 'AUTO_IDEA' && j.status === 'COMPLETED' && j.payload.kind === 'SHORT' && j.result?.proposalId);
  test.skip(!real, 'this studio has no written short idea to pick');
  const proposal = await (await request.get(`/api/proposals/${real!.result!.proposalId}`)).json();
  const sent = await open(page, '/new/short');
  let phase: 'running' | 'done' = 'running';
  await page.route((u) => u.pathname === '/api/development/job-e2e-1', (route) => route.fulfill({ json: {
    ideaJobId: 'job-e2e-1',
    job: { id: 'job-e2e-1', status: phase === 'done' ? 'COMPLETED' : 'GENERATING', progress: { phase: 'concepts', message: 'Writing three concepts' }, result: phase === 'done' ? { proposalId: 'proposal-e2e', steps: [] } : null, createdAt: new Date().toISOString(), startedAt: new Date().toISOString() },
    stages: [{ stage: 'RESEARCH', jobId: 'c1', status: 'COMPLETED' }, { stage: 'AUDIENCE', jobId: 'c2', status: 'COMPLETED' }, { stage: 'CONCEPTS', jobId: 'c3', status: phase === 'done' ? 'COMPLETED' : 'GENERATING', progress: { message: 'Writing three concepts' } }],
    artifacts: [], proposal: phase === 'done' ? { id: 'proposal-e2e', createdAt: new Date().toISOString() } : null,
  } }));
  await page.route((u) => u.pathname === '/api/proposals/proposal-e2e', (route) => route.fulfill({ json: { ...proposal, id: 'proposal-e2e', jobId: 'job-e2e-1' } }));

  await page.getByLabel('One line or a theme').fill('A night-shift baker finds a letter in the flour');
  await page.locator('button.disclosure-head', { hasText: 'Preferences' }).click();
  await page.getByRole('radiogroup', { name: 'Length' }).getByRole('radio', { name: '1 min 30 s' }).click();
  await page.getByRole('button', { name: 'Develop an idea' }).click();
  await expect.poll(() => sent.jobs.length).toBe(1);
  expect(sent.jobs[0]).toMatchObject({ type: 'AUTO_IDEA', payload: { kind: 'SHORT', brief: 'A night-shift baker finds a letter in the flour', preferences: { durationSeconds: 90, research: 'AUTO' } } });
  await expect(page).toHaveURL(/idea=job-e2e-1/);
  // the stages are the kit's StageSteps (DS-3): one li.stage per stage with its state
  const running = page.locator('.stage[data-state="running"]');
  await expect(running).toContainText('Concepts');
  await expect(running).toContainText('Writing three concepts');
  await expect(page.locator('.stage[data-state="done"]')).toHaveCount(2);
  await expect(page.locator('.stage[data-state="waiting"]')).toHaveCount(5);

  phase = 'done';
  await expect(page.locator('#create-review-title')).toHaveValue(proposal.proposal.title, { timeout: 15_000 });
  await page.locator('#create-review-title').fill('');
  await page.getByRole('button', { name: 'Create short' }).click();
  await expect(page.locator('main').getByRole('alert')).toHaveText('The title can’t be empty.');
  await page.locator('#create-review-title').fill('The Static Sky, again');
  await page.getByRole('button', { name: 'Create short' }).click();
  const cmd = await flushed(page, sent, 'acceptProposal');
  expect(cmd.args[0]).toMatchObject({ kind: 'SHORT', proposalJobId: 'job-e2e-1', proposal: { title: 'The Static Sky, again' } });
  await expect(page).toHaveURL(/\/shorts\//);
});

test('show, Auto: develops a show idea with the producer’s preferences', async ({ page }) => {
  const sent = await open(page, '/new/show?mode=auto');
  await page.locator('button.disclosure-head', { hasText: 'Preferences' }).click();
  await page.getByRole('radiogroup', { name: 'Style' }).getByRole('radio', { name: /Realistic/ }).click();
  await page.getByRole('radiogroup', { name: 'Language' }).getByRole('radio', { name: 'Arabic' }).click();
  await expect(page.getByLabel('Dialect')).toHaveValue('IRAQI_BAGHDADI');
  await page.getByRole('radio', { name: 'Original only' }).click();
  await page.getByRole('button', { name: 'Develop an idea' }).click();
  await expect.poll(() => sent.jobs.length).toBe(1);
  expect(sent.jobs[0].payload).toMatchObject({ kind: 'SHOW', preferences: { style: 'REALISTIC', language: 'AR', dialect: 'IRAQI_BAGHDADI', research: 'OFF' } });
});

test('music video, Auto: the studio writes the song; chosen performers travel with the request', async ({ page }) => {
  const sent = await open(page, '/new/music-video?mode=auto');
  await expect(page.getByRole('radio', { name: /Let the studio write it/ })).toHaveAttribute('aria-checked', 'true');
  const performer = page.locator('section', { has: page.getByRole('heading', { name: 'Performers' }) }).locator('.fcard').first();
  await performer.click();
  await page.getByRole('button', { name: 'Develop an idea' }).click();
  await expect.poll(() => sent.jobs.length).toBe(1);
  const p = sent.jobs[0].payload as { kind: string; preferences: { castIds: string[] } };
  expect(p.kind).toBe('MUSIC_VIDEO');
  expect(p.preferences.castIds.length).toBe(1);
});

test('Auto is honest when it cannot run: the paused studio or the offline engine, with Manual one press away', async ({ page }) => {
  await open(page, '/new/short', { engines: 'paused' });
  await expect(page.getByText('The studio is not taking new work right now')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Develop an idea' })).toBeDisabled();
  await page.getByRole('button', { name: 'Write it yourself' }).first().click();
  await expect(page).toHaveURL(/mode=manual/);
  await expect(page.locator('#create-title')).toBeVisible();
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await open(page, '/new/music-video', { engines: 'storyOffline' });
  await expect(page.getByText('The story engine is offline')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Develop an idea' })).toBeDisabled();
});

test('?mode= opens the flow in that mode; a missing or unknown mode opens Auto', async ({ page }) => {
  for (const [q, mode] of [['?mode=manual', 'Manual'], ['?mode=auto', 'Auto'], ['', 'Auto'], ['?mode=bogus', 'Auto']] as const) {
    await open(page, `/new/music-video${q}`);
    await expect(page.getByRole('radiogroup', { name: 'How to start' }).getByRole('radio', { name: mode })).toHaveAttribute('aria-checked', 'true');
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
});

test('an episode without its show says so and offers the way back', async ({ page }) => {
  await open(page, '/new/episode?show=missing-show');
  await expect(page.getByRole('heading', { level: 1, name: 'This show isn’t in the studio' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to Shows' })).toHaveAttribute('href', '/shows');
});

test('keyboard: the mode switch and the pickers show the focus ring and move with the keys', async ({ page }) => {
  await open(page, '/new/short?mode=manual');
  await page.getByRole('radio', { name: 'Manual' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page).toHaveURL(/mode=auto/);
  await page.goto('/new/short?mode=manual');
  await page.waitForSelector('#create-title');
  const cartoon = page.getByRole('radiogroup', { name: 'Style' }).getByRole('radio', { name: /Cartoon/ });
  await cartoon.focus();
  await page.keyboard.press('ArrowRight');
  const anime = page.getByRole('radiogroup', { name: 'Style' }).getByRole('radio', { name: /Anime/ });
  await expect(anime).toBeFocused();
  await expect(anime).toHaveAttribute('aria-checked', 'true');
  // leave the group and come back by Tab: the roving tabindex must bring focus to the chosen tile, with the ring
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(anime).toBeFocused();
  // the ring as it settles (a first read right after the key can still see the tile mid-update); the diagnostics
  // are reported only if it never does
  const ring = () => anime.evaluate((e) => {
    const cs = getComputedStyle(e);
    return { s: cs.outlineStyle, w: cs.outlineWidth, fv: e.matches(':focus-visible'), diag: { outline: cs.outline, tabIndex: (e as HTMLElement).tabIndex, hover: e.matches(':hover'), motion: document.documentElement.getAttribute('data-motion') } };
  });
  try {
    await expect.poll(async () => { const r = await ring(); return { s: r.s, w: r.w, fv: r.fv }; }, { timeout: 5_000 }).toEqual({ s: 'solid', w: '2px', fv: true });
  } catch (e) { throw new Error(`${(e as Error).message}\nthe tile as last seen: ${JSON.stringify((await ring()).diag)}`); }
});

test('phone 390: no horizontal overflow on the hub and the flows @mobile', async ({ page }) => {
  for (const path of ['/new', '/new/short?mode=manual', '/new/music-video?mode=auto']) {
    await open(page, path, { width: 390 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
});
