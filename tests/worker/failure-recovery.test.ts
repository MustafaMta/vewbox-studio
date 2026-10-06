import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { asc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/server/db/client';
import { enqueue, getJob, listEvents, requestCancel } from '@/server/jobs/queue';
import { command, commands, readState } from '@/server/studio/engine';
import { jobFiles } from '@/server/jobs/outputs';
import { regenerate } from '@/server/jobs/regenerate';
import { takeIdOf } from '@/worker/handlers/take-commit';

/** FAILURE AND RECOVERY (directive 2026-10-06 §26) — a deterministic failure-injection harness on the TEST database.
 *  Real worker processes (tests/worker/fixtures/fault-worker.ts = src/worker/index.ts) are killed (TerminateProcess /
 *  SIGKILL, no cleanup at all) or stopped (IPC "shutdown", the graceful path) in the middle of a job; the test then
 *  reads the database and the library: the job's state, its attempt rows, its events, its takes and its files.
 *  GENERATE_TAKE runs a FIXTURE PROVIDER (labelled as such; state/recovery logic only — never generation evidence).
 *  A short lease (WORKER_LEASE_SECONDS=4) makes a killed worker's job stale in seconds instead of 90. */

const REPO = process.cwd();
const LEASE = 4;
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-fault-'));
const logDir = path.join(fixtureDir, 'logs');
fs.mkdirSync(logDir, { recursive: true });
const made: string[] = [];
const children: ChildProcess[] = [];
let productionId = '';
const shots: string[] = [];

interface Worker { name: string; child: ChildProcess; exited: Promise<number | null> }

function startWorker(name: string, env: Record<string, string> = {}): Worker {
  const out = fs.openSync(path.join(logDir, `${name}.log`), 'a');
  const child = spawn(process.execPath, ['--import', 'tsx', 'tests/worker/fixtures/fault-worker.ts'], {
    cwd: REPO, stdio: ['ignore', out, out, 'ipc'], windowsHide: true,
    env: { ...process.env, WORKER_ID: name, WORKER_LEASE_SECONDS: String(LEASE), WORKER_SHUTDOWN_GRACE_MS: '300', FIXTURE_DIR: fixtureDir, FIXTURE_TAKE: '1', FIXTURE_RENDER_MS: '4000', LOG_LEVEL: 'info', LOG_PRETTY: '0', WORKER_ONLY_PRODUCTIONS: productionId, ...env },
  });
  children.push(child);
  const exited = new Promise<number | null>((r) => child.once('exit', (code) => r(code)));
  return { name, child, exited };
}
/** A hard kill: no signal handler runs, nothing is cleaned up (Windows: TerminateProcess). */
async function kill(w: Worker) { w.child.kill('SIGKILL'); await w.exited; }
/** The graceful path a supervisor uses (Ctrl+C / SIGTERM on the host; IPC here, since Windows cannot signal a child). */
async function stop(w: Worker) { if (w.child.exitCode !== null) return; w.child.send('shutdown'); await w.exited; }

async function until<T>(what: string, fn: () => Promise<T | undefined | false | null>, timeoutMs = 60_000, everyMs = 150): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v as T;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, everyMs));
  }
}
const row = async (id: string) => (await db().select().from(schema.jobs).where(eq(schema.jobs.id, id)))[0];
const attempts = (id: string) => db().select().from(schema.jobAttempts).where(eq(schema.jobAttempts.jobId, id)).orderBy(asc(schema.jobAttempts.attempt));
const submissions = (jobId: string) => { try { return fs.readFileSync(path.join(fixtureDir, `fixture-task-${jobId}.submits`), 'utf8').trim().split('\n').filter(Boolean).length; } catch { return 0; } };
const takesOf = async (shotId: string) => (await readState()).state.productions.find((p) => p.id === productionId)!.shots.find((s) => s.id === shotId)!.takes;
async function takeJob(shotId: string) { const { job } = await enqueue({ type: 'GENERATE_TAKE', payload: { productionId, shotId } }); made.push(job.id); return job; }
const rendering = (id: string, minPercent = 10) => until(`job ${id} rendering`, async () => { const r = await row(id); return r.status === 'GENERATING' && r.providerTaskId && ((r.progress as { percent?: number } | null)?.percent ?? 0) >= minPercent ? r : undefined; });
/** Every library file of the job is referenced by an asset row (no orphan, no partial). */
async function orphansOf(jobId: string) {
  const files = await jobFiles(jobId);
  const assets = await db().select({ path: schema.assets.path, provenance: schema.assets.provenance, thumb: schema.assets.thumb }).from(schema.assets);
  const refs = new Set(assets.flatMap((a) => [a.path, a.provenance?.path, a.thumb?.path]).filter((p): p is string => typeof p === 'string').map((p) => p.replace(/\\/g, '/')));
  return files.filter((f) => !refs.has(f.rel));
}

beforeAll(async () => {
  // the workers this file starts serve ONLY its production (WORKER_ONLY_PRODUCTIONS): no other test's job is touched
  const [prod] = await commands([{ name: 'addProduction', args: [{ kind: 'SHORT', title: 'Failure harness', style: 'ANIME', language: 'EN', aspect: 'WIDE_16_9', targetSeconds: 20, brief: { mode: 'MANUAL', text: 'fixture' }, castIds: [], locationIds: [] }] }]) as [{ production: { id: string } }];
  productionId = prod.production.id;
  const { scene } = await command('addScene', [productionId, { title: 'S', timeOfDay: 'NIGHT' }]);
  for (let i = 0; i < 8; i++) shots.push((await command('addShot', [productionId, { sceneId: scene.id, purpose: '', action: `shot ${i}`, framing: 'WIDE', cameraMove: 'STATIC', durationSeconds: 2, characterIds: [], dialogue: [], transition: 'CUT' }])).shot.id);
}, 60_000);

afterEach(async () => { for (const c of children.splice(0)) if (c.exitCode === null && !c.killed) { c.kill('SIGKILL'); } });

afterAll(async () => {
  if (made.length) {
    await db().delete(schema.jobAttempts).where(inArray(schema.jobAttempts.jobId, made));
    await db().delete(schema.qaReports).where(inArray(schema.qaReports.jobId, made));
    await db().delete(schema.jobEvents).where(inArray(schema.jobEvents.jobId, made));
    await db().update(schema.jobs).set({ status: 'CANCELLED', lockedBy: null }).where(inArray(schema.jobs.id, made));
  }
  if (productionId) await commands([{ name: 'deleteProduction', args: [productionId] }]).catch(() => undefined);
}, 60_000);

describe('worker killed during production (§26)', () => {
  it('a hard-killed worker’s take job is taken over: the provider task is adopted (one submission), attempt 1 stays in the history as WORKER_LOST, one take', async () => {
    const a = startWorker('fault-a1');
    const job = await takeJob(shots[0]);
    await rendering(job.id);
    await kill(a);
    const b = startWorker('fault-b1');
    const done = await until('completed', async () => { const r = await row(job.id); return r.status === 'COMPLETED' ? r : undefined; }, 90_000);
    await stop(b);
    expect(done.attempts).toBe(2);
    expect(submissions(job.id)).toBe(1); // the render was adopted, never submitted twice
    const at = await attempts(job.id);
    expect(at.map((x) => [x.attempt, x.outcome, x.failureClass])).toEqual([[1, 'FAILED', 'INFRASTRUCTURE'], [2, 'COMPLETED', null]]);
    expect(at[0].workerId).toBe('fault-a1');
    expect(at[0].failureMessage).toMatch(/WORKER_LOST/);
    expect((await listEvents(job.id)).some((e) => /attempt 1 lost/.test(e.message))).toBe(true);
    const takes = await takesOf(shots[0]);
    expect(takes.map((t) => t.id)).toEqual([takeIdOf(job.id)]);
    expect(await orphansOf(job.id)).toEqual([]);
  }, 150_000);

  it('killed between storing the files and committing the take: the next attempt removes the orphans and commits ONE take', async () => {
    const a = startWorker('fault-a2', { FIXTURE_PAUSE_BEFORE_COMMIT_MS: '60000', FIXTURE_RENDER_MS: '500' });
    const job = await takeJob(shots[1]);
    await until('files stored, commit pending', async () => fs.existsSync(path.join(fixtureDir, `${job.id}.before-commit`)));
    expect((await jobFiles(job.id)).length).toBeGreaterThan(0);
    await kill(a);
    const b = startWorker('fault-b2', { FIXTURE_RENDER_MS: '500' });
    await until('completed', async () => (await row(job.id)).status === 'COMPLETED', 90_000);
    await stop(b);
    expect((await takesOf(shots[1])).map((t) => t.id)).toEqual([takeIdOf(job.id)]);
    expect(await orphansOf(job.id)).toEqual([]);
    expect((await jobFiles(job.id)).every((f) => f.attempt === 2)).toBe(true);
    expect(submissions(job.id)).toBe(1);
  }, 150_000);

  it('a job that kills its worker on every attempt is failed (INFRASTRUCTURE, WORKER_LOST) — not retried forever — and every lost attempt is in the history', async () => {
    const job = await takeJob(shots[2]);
    for (let n = 1; n <= 3; n++) {
      const w = startWorker(`fault-poison-${n}`, { FIXTURE_RENDER_MS: '600000' });
      await until(`attempt ${n} running`, async () => { const r = await row(job.id); return r.attempts === n && r.status === 'GENERATING' ? r : undefined; }, 60_000);
      await kill(w);
    }
    const reaper = startWorker('fault-reaper');
    const failed = await until('failed by the reaper', async () => { const r = await row(job.id); return r.status === 'FAILED' ? r : undefined; }, 60_000);
    await stop(reaper);
    expect(failed.attempts).toBe(3);
    expect((failed.error as { details?: { reason?: string } }).details?.reason).toBe('WORKER_LOST');
    const at = await attempts(job.id);
    expect(at.map((x) => [x.attempt, x.outcome, x.failureClass])).toEqual([[1, 'FAILED', 'INFRASTRUCTURE'], [2, 'FAILED', 'INFRASTRUCTURE'], [3, 'FAILED', 'INFRASTRUCTURE']]);
    expect(await takesOf(shots[2])).toEqual([]);
  }, 240_000);
});

describe('worker restart (§26)', () => {
  it('a stopping worker hands its running job back at once: no attempt burnt, nothing cancelled, the next worker adopts the provider task', async () => {
    const a = startWorker('fault-a3', { FIXTURE_RENDER_MS: '6000' });
    const job = await takeJob(shots[3]);
    await rendering(job.id);
    const t0 = Date.now();
    await stop(a);
    const after = await row(job.id);
    expect(after.status).toBe('QUEUED');
    expect(after.lockedBy).toBeNull();
    expect(after.maxAttempts).toBe(4); // the interrupted attempt does not count
    expect(after.cancelRequested).toBe(false);
    expect((await attempts(job.id)).map((x) => [x.attempt, x.outcome])).toEqual([[1, 'INTERRUPTED']]);
    expect(await db().select().from(schema.resourceLeases).where(eq(schema.resourceLeases.process, 'fault-a3'))).toEqual([]);
    const b = startWorker('fault-b3', { FIXTURE_RENDER_MS: '6000' });
    const resumedAt = await until('picked up again', async () => { const r = await row(job.id); return r.attempts === 2 ? Date.now() : undefined; });
    expect(resumedAt - t0).toBeLessThan(LEASE * 1000 + 15_000); // no wait for a stale lease beyond the new worker's start
    await until('completed', async () => (await row(job.id)).status === 'COMPLETED', 90_000);
    await stop(b);
    expect(submissions(job.id)).toBe(1);
    expect((await attempts(job.id)).map((x) => [x.attempt, x.outcome])).toEqual([[1, 'INTERRUPTED'], [2, 'COMPLETED']]);
    expect((await takesOf(shots[3])).map((t) => t.id)).toEqual([takeIdOf(job.id)]);
  }, 150_000);
});

describe('cancelled job (§26)', () => {
  it('cancelled mid-render: CANCELLED at the next checkpoint, no take, no file, not retried', async () => {
    const a = startWorker('fault-a4', { FIXTURE_RENDER_MS: '600000' });
    const job = await takeJob(shots[4]);
    await rendering(job.id, 0);
    await requestCancel(job.id);
    await until('cancelled', async () => (await row(job.id)).status === 'CANCELLED', 30_000);
    await new Promise((r) => setTimeout(r, 1500));
    await stop(a);
    const r = await row(job.id);
    expect(r.status).toBe('CANCELLED');
    expect(r.attempts).toBe(1);
    expect((await attempts(job.id)).map((x) => x.outcome)).toEqual(['CANCELLED']);
    expect(await takesOf(shots[4])).toEqual([]);
    expect(await jobFiles(job.id)).toEqual([]);
  }, 120_000);

  it('cancelled while its worker is dead: the reaper settles it CANCELLED (not "running" forever), attempt closed', async () => {
    const a = startWorker('fault-a5', { FIXTURE_RENDER_MS: '600000' });
    const job = await takeJob(shots[5]);
    await rendering(job.id, 0);
    await kill(a);
    await requestCancel(job.id);
    expect((await row(job.id)).status).toBe('GENERATING');
    const b = startWorker('fault-b5');
    await until('reaped as cancelled', async () => (await row(job.id)).status === 'CANCELLED', 60_000);
    await stop(b);
    expect((await row(job.id)).attempts).toBe(1);
    expect((await attempts(job.id)).map((x) => x.outcome)).toEqual(['CANCELLED']);
    expect(await takesOf(shots[5])).toEqual([]);
  }, 120_000);
});

describe('invalid input and missing reference (§26) — the REAL take handler, refused before any engine', () => {
  const settled = (id: string) => until('settled', async () => { const r = await row(id); return ['COMPLETED', 'FAILED', 'CANCELLED'].includes(r.status) ? r : undefined; }, 90_000);

  it('a take for a shot that does not exist fails once as INVALID_INPUT — no retry, no engine call', async () => {
    const w = startWorker('fault-invalid', { FIXTURE_TAKE: '0' });
    const job = await takeJob('shot-that-does-not-exist');
    const r = await settled(job.id);
    await stop(w);
    expect(r.status).toBe('FAILED');
    expect(r.attempts).toBe(1);
    expect((await attempts(job.id)).map((x) => [x.outcome, x.failureClass])).toEqual([['FAILED', 'INVALID_INPUT']]);
    expect((r.error as { message: string }).message).toMatch(/Shot not found/);
  }, 120_000);

  it('a job queued before the terms of use changed fails at claim as INVALID_INPUT naming /terms — no retry, no engine call', async () => {
    const { TERMS_VERSION } = await import('@/domain/terms');
    const job = await takeJob('shot-that-does-not-exist-either');
    await command('updateSettings', [{ terms: { version: '2000-01-01', acceptedAt: new Date().toISOString(), by: 'worker test' } }]);
    try {
      const w = startWorker('fault-terms', { FIXTURE_TAKE: '0' });
      const r = await settled(job.id);
      await stop(w);
      expect(r.status).toBe('FAILED');
      expect(r.attempts).toBe(1);
      expect((await attempts(job.id)).map((x) => [x.outcome, x.failureClass])).toEqual([['FAILED', 'INVALID_INPUT']]);
      expect(r.error as { code: string; message: string }).toMatchObject({ code: 'CONSENT_REQUIRED' });
      expect((r.error as { message: string }).message).toMatch(/\/terms/);
      expect(submissions(job.id)).toBe(0);
    } finally {
      await command('updateSettings', [{ terms: { version: TERMS_VERSION, acceptedAt: new Date().toISOString(), by: 'worker test' } }]);
    }
  }, 120_000);

  it('a character whose canonical picture file is gone: refused as MISSING_REFERENCE naming the picture — once, before any voice or video inference', async () => {
    const { character: c } = await command('addCharacter', [{ name: `Ref Missing ${Date.now().toString(36)}`, style: 'ANIME', sex: 'FEMALE', ageYears: 30, language: 'EN', role: '', build: '', face: '', hair: '', skin: '', eyes: '', wardrobe: '', personality: '', distinguishing: [] }]);
    const png = execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=256x256', '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-']);
    const { storeBuffer, assetFromStored } = await import('@/server/media');
    const stamp = Date.now().toString(16).padStart(20, '0').slice(-20);
    const assetId = `gen-${stamp}`; const plateId = `gen-${stamp.slice(0, 19)}f`;
    const stored = await storeBuffer(assetId, png, { expectKind: 'IMAGE' });
    const plate = await storeBuffer(plateId, png, { expectKind: 'IMAGE' });
    await commands([{ name: 'addAsset', args: [assetFromStored(assetId, stored, { label: 'FIXTURE canonical', tags: ['fixture'], origin: 'GENERATED' })] }, { name: 'addAsset', args: [assetFromStored(plateId, plate, { label: 'FIXTURE plate', tags: ['fixture'], origin: 'GENERATED' })] }, { name: 'setCanonicalImage', args: [c.id, { assetId, jobId: 'job-fixture', check: { ok: true } }] }]);
    const version = (await readState()).state.characters.find((x) => x.id === c.id)!.canonicalImage!.version;
    await command('approveCanonicalImage', [c.id, version]);
    // a place with its plate (on disk), so the preflight passes and the file check is what refuses
    const { location } = await command('addLocation', [{ name: `Pier ${stamp.slice(-4)}`, kind: 'EXTERIOR', description: 'a pier', style: 'ANIME', lighting: [], landmarks: [], props: [] }]);
    await command('addLocationRefs', [location.id, [{ id: `ref-${stamp}`, role: 'MASTER', assetId: plateId, label: 'master' }]]);
    let p = (await readState()).state.productions.find((x) => x.id === productionId)!;
    await command('updateProduction', [productionId, { castIds: [c.id], locationIds: [location.id] }]);
    await command('updateScene', [productionId, p.scenes[0].id, { locationId: location.id }]);
    p = (await readState()).state.productions.find((x) => x.id === productionId)!;
    const shotId = (await command('addShot', [productionId, { sceneId: p.scenes[0].id, purpose: '', action: 'she looks up', framing: 'MEDIUM', cameraMove: 'STATIC', durationSeconds: 5, characterIds: [c.id], dialogue: [], transition: 'CUT' }])).shot.id;
    fs.rmSync(stored.absPath, { force: true }); // the file is gone; the record stays
    const w = startWorker('fault-missing-ref', { FIXTURE_TAKE: '0' });
    const job = await takeJob(shotId);
    const r = await settled(job.id);
    await stop(w);
    expect(r.status).toBe('FAILED');
    expect(r.attempts).toBe(1);
    const at = await attempts(job.id);
    expect(at.map((x) => [x.outcome, x.failureClass])).toEqual([['FAILED', 'MISSING_REFERENCE']]);
    expect((r.error as { message: string }).message).toMatch(new RegExp(`missing reference file: reference picture 1 \\(subject\\) \\(asset ${assetId}\\)`));
    expect(await takesOf(shotId)).toEqual([]);
  }, 120_000);
});

describe('duplicate submission (§26)', () => {
  it('the same request sent five times at once is ONE job; once it has ended, the same request is new', async () => {
    const payload = { productionId, shotId: shots[6] };
    const rs = await Promise.all(Array.from({ length: 5 }, () => enqueue({ type: 'GENERATE_TAKE', payload, dedupeActive: true, runAfter: new Date(Date.now() + 3600_000).toISOString() })));
    made.push(...rs.map((r) => r.job.id));
    expect(new Set(rs.map((r) => r.job.id)).size).toBe(1);
    expect(rs.filter((r) => r.created).length).toBe(1);
    // key order does not make it another request
    const again = await enqueue({ type: 'GENERATE_TAKE', payload: { shotId: shots[6], productionId }, dedupeActive: true });
    expect(again).toMatchObject({ created: false, job: { id: rs[0].job.id } });
    // a different request (another shot) is not a duplicate
    const other = await enqueue({ type: 'GENERATE_TAKE', payload: { productionId, shotId: shots[7] }, dedupeActive: true, runAfter: new Date(Date.now() + 3600_000).toISOString() });
    made.push(other.job.id);
    expect(other.created).toBe(true);
    await requestCancel(rs[0].job.id);
    const fresh = await enqueue({ type: 'GENERATE_TAKE', payload, dedupeActive: true, runAfter: new Date(Date.now() + 3600_000).toISOString() });
    made.push(fresh.job.id);
    expect(fresh.created).toBe(true);
    await requestCancel(fresh.job.id); await requestCancel(other.job.id);
  });

  it('regenerate pressed twice (two clicks, two keys) while the first is still queued: one job', async () => {
    const r1 = await regenerate(productionId, { shotId: shots[7], idempotencyKey: `regen-${shots[7]}-1` });
    const r2 = await regenerate(productionId, { shotId: shots[7], idempotencyKey: `regen-${shots[7]}-2` });
    made.push(r1.job.id, r2.job.id);
    expect(r2.job.id).toBe(r1.job.id);
    expect(r2.created).toBe(false);
    await requestCancel(r1.job.id);
    expect((await getJob(r1.job.id))?.status).toBe('CANCELLED');
  });
});
