import { expect, type Page, test as base } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Asset, Character, StudioState } from '../../src/domain/types';
import type { Job, JobEvent, JobType } from '../../src/domain/jobs';

/** Every test starts from the untouched sample studio on the server (one reset per test), watches the console for
 *  errors, and fails on any network request that is not the studio itself (fonts excepted). The database is shared,
 *  so the suite runs with one worker (see playwright.config.ts). */

export const BASE = process.env.STUDIO_URL || 'http://localhost:4200';

/** The sample studio is a test fixture: the server loads it only when it runs with STUDIO_SAMPLE_FIXTURE=1
 *  (playwright.config.ts starts its server that way; a reused server must have been started with it). */
export async function resetStudio(kind: 'sample' | 'empty' = 'sample') {
  const r = await fetch(`${BASE}/api/studio/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, keepSettings: false }) });
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    const hint = body?.error?.code === 'NOT_CONFIGURED' ? ' — start the studio server with STUDIO_SAMPLE_FIXTURE=1 to run the browser tests' : '';
    throw new Error(`reset failed: ${r.status} ${body?.error?.message ?? ''}${hint}`);
  }
}

/** The authoritative state, straight from the server. */
export async function snapshot<T = Record<string, unknown>>(): Promise<T> {
  const r = await fetch(`${BASE}/api/studio`);
  return (await r.json()).state as T;
}

export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    const foreign: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    // a failed resource load is reported with its URL, so a console error names the request behind it
    page.on('requestfailed', (r) => { const f = r.failure()?.errorText ?? ''; if (f && f !== 'net::ERR_ABORTED') errors.push(`request failed: ${r.url()} (${f})`); });
    page.on('request', (r) => { const u = new URL(r.url()); if (u.protocol === 'blob:' || u.protocol === 'data:') return; if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1' && !u.hostname.endsWith('gstatic.com') && !u.hostname.endsWith('googleapis.com')) foreign.push(r.url()); });
    await resetStudio('sample');
    await page.addInitScript(() => { try { localStorage.removeItem('vewbox.ui'); } catch { /* ignore */ } });
    await use(page);
    expect(errors, 'console errors').toEqual([]);
    expect(foreign, 'unexpected network calls').toEqual([]);
  },
});

export { expect };

export const EP1 = '/shows/last-sip/seasons/last-sip-s1/episodes/s1e1';

/** A workspace tab by its name; the name may carry a count ("Story 2"), and "Story" must not match "Storyboard". */
export const tab = (page: Page, name: string) => page.getByRole('tab', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( \\d+)?$`) });

/** Wait until the browser's pending commands have reached the server (the version catches up). */
export async function settled(page: Page) {
  await page.waitForTimeout(400);
  await expect.poll(async () => (await fetch(`${BASE}/api/health`)).ok, { timeout: 10_000 }).toBe(true);
}

// =============================================================================================== journeys (wave 2)
// Additive helpers for tests/e2e/journeys/*.spec.ts: the command and jobs API from the test runner, uploads, real
// engines, the operator-driven restart of Test 9, the database rows, and the Arabic fold used to judge a preview.

export type Snap = StudioState;
export type { Asset, Character, Job };

/** Generous ceilings for real generation (the canonical image ~1 min, a voice ~1 min, a take 2–8 min). */
export const WAIT = { design: 3 * 60_000, image: 6 * 60_000, voice: 6 * 60_000, preview: 4 * 60_000, take: 12 * 60_000, create: 16 * 60_000 } as const;

export const GPU = process.env.QA_GPU === '1';
export const EVIDENCE_DIR = path.join('docs', 'evidence', 'qa');
export const FIXTURES = path.join('tests', 'fixtures');

const JSON_HEADERS = { 'content-type': 'application/json' };
const seed = () => `qa-${Math.random().toString(36).slice(2, 12)}`;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface CommandBody { ok: boolean; version: number; hash: string; results: unknown[]; failedAt?: number; error?: { code: string; message: string; details?: Record<string, unknown> } }

/** A batch of commands exactly as the browser sends them. Returns the HTTP status and the body; never throws. */
export async function send(commands: Array<{ name: string; args: unknown[] }>, clientId = 'qa-journeys'): Promise<{ status: number; body: CommandBody }> {
  const at = new Date().toISOString();
  const r = await fetch(`${BASE}/api/commands`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ clientId, commands: commands.map((c) => ({ ...c, seed: seed(), at })) }) });
  return { status: r.status, body: (await r.json()) as CommandBody };
}

/** One command that must succeed; the command's own result (for addCharacter: `{ character }`). */
export async function act<T = unknown>(name: string, ...args: unknown[]): Promise<T> {
  const r = await send([{ name, args }]);
  if (!r.body.ok) throw new Error(`${name} failed: ${r.status} ${r.body.error?.code ?? ''} ${r.body.error?.message ?? ''}`);
  return r.body.results[0] as T;
}

export const characterByName = (s: Snap, name: string) => s.characters.find((c) => c.name === name);
export const characterById = (s: Snap, id: string) => s.characters.find((c) => c.id === id);
export const assetOf = (s: Snap, id: string | undefined) => (id ? s.assets.find((a) => a.id === id) : undefined);

/** A minimal, valid character record through the command API (the Manual shape of contract §1.1). */
export async function createCharacter(input: Partial<Character> & { name: string; language: 'EN' | 'AR' }): Promise<Character> {
  const profile = { role: 'QA stand-in', style: 'REALISTIC', sex: 'FEMALE', ageYears: 34, build: 'Average', face: 'Oval, calm', hair: 'Short dark hair', skin: 'Olive', eyes: 'Brown', distinguishing: [], wardrobe: 'A grey coat', personality: 'Quiet, exact.', ...input };
  await act('addCharacter', profile);
  const s = await snapshot<Snap>();
  const c = characterByName(s, input.name);
  if (!c) throw new Error(`addCharacter did not persist ${input.name}`);
  return c;
}

// ------------------------------------------------------------------------------------------------------- jobs

export async function startJob(type: JobType, payload: Record<string, unknown>, idempotencyKey?: string): Promise<{ status: number; job: Job; created: boolean }> {
  const r = await fetch(`${BASE}/api/jobs`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ type, payload, idempotencyKey }) });
  const j = (await r.json()) as { job: Job; created: boolean; error?: { code: string; message: string } };
  if (!r.ok) throw new Error(`POST /api/jobs ${type}: ${r.status} ${j.error?.code ?? ''} ${j.error?.message ?? ''}`);
  return { status: r.status, job: j.job, created: j.created };
}

export async function getJob(id: string): Promise<{ job: Job; events: JobEvent[] }> {
  const r = await fetch(`${BASE}/api/jobs/${id}`);
  if (!r.ok) throw new Error(`GET /api/jobs/${id}: ${r.status}`);
  return (await r.json()) as { job: Job; events: JobEvent[] };
}

export async function listJobs(limit = 200): Promise<Job[]> {
  const r = await fetch(`${BASE}/api/jobs?limit=${limit}`);
  return ((await r.json()) as { jobs: Job[] }).jobs;
}

/** The newest job matching the predicate, polling until one exists. */
export async function findJob(pred: (j: Job) => boolean, timeoutMs = 60_000): Promise<Job> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const jobs = (await listJobs()).filter(pred).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (jobs[0]) return jobs[0];
    if (Date.now() > until) throw new Error('no job matched within the time allowed');
    await sleep(1500);
  }
}

export const childrenOf = async (parentId: string) => (await listJobs()).filter((j) => j.parentId === parentId);

/** Job types the Backend agent is adding (contract §1.1) are compared by name so these specs compile before the
 *  union in src/domain/jobs.ts carries them. */
export const isType = (j: Job, type: string) => String(j.type) === type;
export const payloadOf = <T extends Record<string, unknown>>(j: Job) => j.payload as T;

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

/** Poll a job until it ends; the terminal record is returned (status asserted by the caller so the message is
 *  the job's own). The last progress message is echoed so a hanging run says what it was doing. */
export async function waitForJob(id: string, timeoutMs: number): Promise<Job> {
  const until = Date.now() + timeoutMs;
  let last = '';
  for (;;) {
    const { job } = await getJob(id);
    if (TERMINAL.has(job.status)) return job;
    const msg = `${job.status} ${job.progress?.phase ?? ''} ${job.progress?.message ?? ''}${job.progress?.step ? ` ${job.progress.step}/${job.progress.total ?? '?'}` : ''}`.trim();
    if (msg !== last) { last = msg; console.log(`  job ${job.type} ${job.id}: ${msg}`); }
    if (Date.now() > until) throw new Error(`job ${job.type} ${id} still ${job.status} after ${Math.round(timeoutMs / 1000)} s (${last})`);
    await sleep(2500);
  }
}

/** A readable reason when a job did not complete. */
export const jobOutcome = (j: Job) => `${j.type} ${j.id} ${j.status}${j.error ? ` — ${j.error.code}: ${j.error.message}` : ''}`;

// ----------------------------------------------------------------------------------------------------- uploads

export interface UploadResult { status: number; asset?: Asset; validation?: Record<string, unknown>; error?: { code: string; message: string; details?: Record<string, unknown> }; raw: Record<string, unknown> }

/** POST /api/assets with the optional `expect` / `purpose` fields of contract §1.2; never throws. */
export async function uploadAsset(file: { name: string; mimeType: string; buffer: Buffer }, fields: Record<string, string> = {}): Promise<UploadResult> {
  const fd = new FormData();
  fd.set('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }), file.name);
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  const r = await fetch(`${BASE}/api/assets`, { method: 'POST', body: fd });
  const raw = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: r.status, asset: raw.asset as Asset | undefined, validation: raw.validation as Record<string, unknown> | undefined, error: raw.error as UploadResult['error'], raw };
}

export const fixture = (name: string) => ({ name, mimeType: name.endsWith('.wav') ? 'audio/wav' : name.endsWith('.png') ? 'image/png' : 'application/octet-stream', buffer: fs.readFileSync(path.join(FIXTURES, name)) });

/** tests/fixtures/plate.png scaled with ffmpeg to the size a journey needs (a stand-in for a real reference photo). */
export function scaledPlate(width: number, height: number, outDir: string): { name: string; mimeType: string; buffer: Buffer } {
  const out = path.join(outDir, `plate-${width}x${height}.png`);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', path.join(FIXTURES, 'plate.png'), '-vf', `scale=${width}:${height}:flags=lanczos`, '-frames:v', '1', out]);
  return { name: `reference-${width}x${height}.png`, mimeType: 'image/png', buffer: fs.readFileSync(out) };
}

/** A second, different recording made from an existing clip (tempo changed), so a "replace the reference" journey
 *  has a file with another hash. */
export function audioVariant(src: string, atempo: number, outDir: string, name = 'variant.wav'): { name: string; mimeType: string; buffer: Buffer } {
  const out = path.join(outDir, name);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-af', `atempo=${atempo}`, '-ar', '24000', '-ac', '1', out]);
  return { name, mimeType: 'audio/wav', buffer: fs.readFileSync(out) };
}

/** GET a media source: status, content type and byte length (a placeholder or a missing file shows here). */
export async function media(src: string): Promise<{ status: number; type: string; bytes: number }> {
  const r = await fetch(src.startsWith('http') ? src : `${BASE}${src}`);
  const buf = await r.arrayBuffer();
  return { status: r.status, type: r.headers.get('content-type') ?? '', bytes: buf.byteLength };
}

/** A generated (never sample, never empty) picture or clip whose file is really served. */
export async function expectRealAsset(a: Asset | undefined, what: string) {
  expect(a, `${what}: asset record`).toBeTruthy();
  expect(a!.sample, `${what}: sample`).toBe(false);
  expect(a!.bytes ?? 0, `${what}: bytes`).toBeGreaterThan(0);
  expect(a!.unavailable ?? false, `${what}: unavailable`).toBe(false);
  const m = await media(a!.src);
  expect(m.status, `${what}: GET ${a!.src}`).toBe(200);
  expect(m.bytes, `${what}: served bytes`).toBeGreaterThan(0);
}

// ----------------------------------------------------------------------------------------------------- engines

export type EngineName = 'video' | 'story' | 'images' | 'voice' | 'transcription' | 'music';
export async function engineStatus(): Promise<Record<EngineName, { ok: boolean; detail: string }> & { gpu: { vramFree?: number } | null }> {
  const r = await fetch(`${BASE}/api/status`);
  return (await r.json()) as Record<EngineName, { ok: boolean; detail: string }> & { gpu: { vramFree?: number } | null };
}

/** `@gpu` journeys run only with QA_GPU=1 and the named engines reachable; otherwise the test is skipped with the
 *  reason, never silently passed. */
export async function requireEngines(names: EngineName[]) {
  base.skip(!GPU, 'real generation: run with QA_GPU=1 (scripts/qa-journeys.mjs --gpu) when the GPU is free');
  const s = await engineStatus();
  const down = names.filter((n) => !s[n]?.ok).map((n) => `${n}: ${s[n]?.detail ?? 'no status'}`);
  base.skip(down.length > 0, `engine not ready — ${down.join('; ')}`);
}

// ------------------------------------------------------------------------------------------- operator restart

const VAR = 'var';
export const RESTART_REQUEST_FLAG = path.join(VAR, 'qa-restart-requested.flag');
export const RESTARTED_FLAG = path.join(VAR, 'qa-restarted.flag');

/** Test 9 cannot restart the server. It writes `var/qa-restart-requested.flag`, then waits for the operator to
 *  restart web + worker and create `var/qa-restarted.flag` (any content; it must be newer than the request). The
 *  wait is bounded by QA_RESTART_WAIT_MS (default 30 min) and the health endpoint must answer again afterwards. */
export async function requireRestart(): Promise<{ requestedAt: string; restartedAt: string }> {
  base.skip(process.env.QA_RESTART !== '1', 'needs an operator restart: run with QA_RESTART=1 (scripts/qa-journeys.mjs --restart)');
  fs.mkdirSync(VAR, { recursive: true });
  if (fs.existsSync(RESTARTED_FLAG)) fs.rmSync(RESTARTED_FLAG);
  const requestedAt = new Date().toISOString();
  fs.writeFileSync(RESTART_REQUEST_FLAG, `${requestedAt}\nRestart the web server and the worker, then create ${RESTARTED_FLAG}\n`);
  console.log(`\n  >>> OPERATOR: restart web + worker now, then create ${RESTARTED_FLAG} (e.g. New-Item ${RESTARTED_FLAG})`);
  const waitMs = Number(process.env.QA_RESTART_WAIT_MS ?? 30 * 60_000);
  const until = Date.now() + waitMs;
  const t0 = fs.statSync(RESTART_REQUEST_FLAG).mtimeMs;
  for (;;) {
    if (fs.existsSync(RESTARTED_FLAG) && fs.statSync(RESTARTED_FLAG).mtimeMs >= t0) break;
    if (Date.now() > until) throw new Error(`no ${RESTARTED_FLAG} within ${Math.round(waitMs / 60_000)} min`);
    await sleep(2000);
  }
  const restartedAt = new Date().toISOString();
  await expect.poll(async () => { try { return (await fetch(`${BASE}/api/health`)).ok; } catch { return false; } }, { timeout: 180_000, message: 'the web server answers again after the restart' }).toBe(true);
  fs.rmSync(RESTART_REQUEST_FLAG, { force: true }); fs.rmSync(RESTARTED_FLAG, { force: true });
  return { requestedAt, restartedAt };
}

// --------------------------------------------------------------------------------------------------- database

/** Read-only SQL against the live database container (`docker exec vewbox-db-1 psql …`), tab-separated rows.
 *  Returns null when docker or the container is not reachable from the runner. */
export function psql(sql: string): string[][] | null {
  const container = process.env.QA_DB_CONTAINER ?? 'vewbox-db-1';
  try {
    const out = execFileSync('docker', ['exec', container, 'psql', '-U', 'vewbox', '-d', 'vewbox', '-At', '-F', '\t', '-c', sql], { encoding: 'utf8', timeout: 30_000 });
    return out.split(/\r?\n/).filter(Boolean).map((l) => l.split('\t'));
  } catch { return null; }
}

// ------------------------------------------------------------------------------------------- Arabic measures

/** The dialect fold of contract §1.4 (diacritics, alef/hamza forms, taa marbuta, yaa, گ→ق, چ→ك, a few Iraqi
 *  spellings) so a transcript is judged on the words, not the orthography. Independent of the server's own metric. */
export function arabicFold(s: string): string {
  return s
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[إأآٱ]/g, 'ا').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ء/g, '')
    .replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/گ/g, 'ق').replace(/چ/g, 'ك').replace(/ک/g, 'ك').replace(/ی/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
    .split(' ').map((w) => ({ اني: 'انا', شلونچ: 'شلونك', شخبارچ: 'شخبارك' } as Record<string, string>)[w] ?? w).join(' ');
}

/** Share of the intended words heard, in order (longest common subsequence over folded words). */
export function coverage(reference: string, hypothesis: string): number {
  const r = arabicFold(reference).split(' ').filter(Boolean); const h = arabicFold(hypothesis).split(' ').filter(Boolean);
  if (r.length === 0) return 1;
  const dp: number[][] = Array.from({ length: r.length + 1 }, () => Array<number>(h.length + 1).fill(0));
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) dp[i][j] = r[i - 1] === h[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[r.length][h.length] / r.length;
}

/** Character error rate after the fold (Levenshtein over characters, spaces kept). */
export function characterErrorRate(reference: string, hypothesis: string): number {
  const a = arabicFold(reference); const b = arabicFold(hypothesis);
  if (!a.length) return b.length ? 1 : 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[b.length] / a.length;
}

// --------------------------------------------------------------------------------------------------- browser

/** The shell renders a skeleton until the snapshot and the event stream are in: wait for the page's own heading. */
export async function waitForApp(page: Page, timeout = 60_000) {
  await page.waitForFunction(() => Boolean(document.querySelector('main h1')) && !/Reconnecting/.test(document.body.innerText), null, { timeout });
}

/** Pixels of horizontal overflow (0 means none). */
export const overflowPx = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/** The shared <audio> element has loaded a real file: a finite duration above zero (polled, since metadata arrives
 *  after play is pressed). */
export async function expectAudioLoaded(page: Page, srcPart?: string) {
  await expect.poll(async () => page.locator('audio').first().evaluate((a: HTMLAudioElement) => ({ src: a.currentSrc || a.src, duration: a.duration, error: a.error?.code ?? 0 })), { timeout: 30_000, message: 'audio metadata' })
    .toEqual(expect.objectContaining({ error: 0 }));
  const info = await page.locator('audio').first().evaluate((a: HTMLAudioElement) => ({ src: a.currentSrc || a.src, duration: a.duration }));
  expect(Number.isFinite(info.duration) && info.duration > 0, `audio duration (${info.duration}) for ${info.src}`).toBe(true);
  if (srcPart) expect(info.src, 'the audio element plays the expected file').toContain(srcPart);
}

export function evidencePath(name: string) { fs.mkdirSync(EVIDENCE_DIR, { recursive: true }); return path.join(EVIDENCE_DIR, name); }

/** A loose locator for a control whose final copy is not settled: matched by role and an accessible-name regex,
 *  across the roles a design-system control may take. The first visible match wins. */
export function control(page: Page, name: RegExp, roles: Array<'button' | 'radio' | 'tab' | 'link' | 'checkbox'> = ['button', 'radio', 'tab', 'link']) {
  let loc = page.getByRole(roles[0], { name });
  for (const r of roles.slice(1)) loc = loc.or(page.getByRole(r, { name }));
  return loc.first();
}
