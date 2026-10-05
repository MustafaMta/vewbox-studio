import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { asc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/server/db/client';
import { enqueue, requestCancel } from '@/server/jobs/queue';
import { command, commands, readState } from '@/server/studio/engine';
import { jobFiles, jobOutputs } from '@/server/jobs/outputs';
import { assetFile, assetFromStored, ffprobe, sha256File } from '@/server/media';
import { recordApproval } from '@/server/org/runs';
import { approvalSubjectHash } from '@/domain/approvals';
import { commitTake } from '@/worker/handlers/take-commit';

/** INTERRUPTED EXPORT AND ASSEMBLY (directive 2026-10-06 §26) — the REAL ASSEMBLE and EXPORT handlers in a real worker
 *  process (tests/worker/fixtures/fault-worker.ts), on takes made of ffmpeg test patterns (FIXTURE media: state and
 *  file-integrity logic only, never generation evidence). The worker is hard-killed while ffmpeg is writing the
 *  export, or the job is cancelled mid-encode. A partial file must never be published as the export: the library
 *  holds only validated, referenced files; the export is recorded once. */

const REPO = process.cwd();
const LEASE = 4;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-export-'));
const logDir = path.join(work, 'logs'); fs.mkdirSync(logDir, { recursive: true });
const children: ChildProcess[] = [];
const made: string[] = [];
let productionId = '';

interface Worker { child: ChildProcess; exited: Promise<number | null> }
function startWorker(name: string, env: Record<string, string> = {}): Worker {
  const out = fs.openSync(path.join(logDir, `${name}.log`), 'a');
  const child = spawn(process.execPath, ['--import', 'tsx', 'tests/worker/fixtures/fault-worker.ts'], { cwd: REPO, stdio: ['ignore', out, out, 'ipc'], windowsHide: true, env: { ...process.env, WORKER_ID: name, WORKER_LEASE_SECONDS: String(LEASE), WORKER_SHUTDOWN_GRACE_MS: '300', FIXTURE_DIR: work, FIXTURE_TAKE: '0', ...env } });
  children.push(child);
  return { child, exited: new Promise((r) => child.once('exit', (c) => r(c))) };
}
const kill = async (w: Worker) => { w.child.kill('SIGKILL'); await w.exited; };
const stop = async (w: Worker) => { if (w.child.exitCode !== null) return; w.child.send('shutdown'); await w.exited; };
async function until<T>(what: string, fn: () => Promise<T | undefined | false | null>, timeoutMs = 120_000): Promise<T> {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v as T; if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for: ${what}`); await new Promise((r) => setTimeout(r, 150)); }
}
const row = async (id: string) => (await db().select().from(schema.jobs).where(eq(schema.jobs.id, id)))[0];
const attempts = (id: string) => db().select().from(schema.jobAttempts).where(eq(schema.jobAttempts.jobId, id)).orderBy(asc(schema.jobAttempts.attempt));
const production = async () => (await readState()).state.productions.find((p) => p.id === productionId)!;
async function approveEdit() { const p = await production(); await recordApproval({ productionId, stage: 'EDIT', subjectKind: 'STAGE', subjectId: 'EDIT', decision: 'APPROVED', by: 'test', subjectHash: approvalSubjectHash(p, 'EDIT') }); }
async function exportJob(subtitles: 'none' | 'en' | 'ar' | 'both' = 'none', extra: { credits?: boolean; resolution?: '720' | '1080' } = {}) { const { job } = await enqueue({ type: 'EXPORT', payload: { productionId, format: 'mp4-h264', resolution: extra.resolution ?? '1080', subtitles, ...(extra.credits ? { credits: true } : {}) } }); made.push(job.id); return job; }
/** The library files of the job, each referenced by an asset row whose recorded sha256 matches the file. */
async function filesOf(jobId: string) {
  const files = await jobFiles(jobId);
  const assets = await db().select().from(schema.assets);
  return Promise.all(files.map(async (f) => {
    const a = assets.find((x) => (x.provenance as { path?: string } | null)?.path?.replace(/\\/g, '/') === f.rel || x.path?.replace(/\\/g, '/') === f.rel || (x.thumb as { path?: string } | null)?.path === f.rel);
    const isThumb = f.rel.endsWith('.thumb.jpg');
    return { rel: f.rel, attempt: f.attempt, referenced: Boolean(a), shaOk: a && !isThumb ? a.sha256 === await sha256File(path.join(process.env.LIBRARY_ROOT!, f.rel)) : undefined };
  }));
}

beforeAll(async () => {
  await db().update(schema.jobs).set({ status: 'CANCELLED', finishedAt: new Date().toISOString(), lockedBy: null }).where(inArray(schema.jobs.status, ['QUEUED', 'PREPARING', 'GENERATING', 'DOWNLOADING', 'VALIDATING', 'POSTPROCESSING', 'WAITING']));
  const [prod] = await commands([{ name: 'addProduction', args: [{ kind: 'SHORT', title: 'Export harness', style: 'ANIME', language: 'EN', aspect: 'WIDE_16_9', targetSeconds: 24, brief: { mode: 'MANUAL', text: 'fixture' }, castIds: [], locationIds: [] }] }]) as [{ production: { id: string } }];
  productionId = prod.production.id;
  const { scene } = await command('addScene', [productionId, { title: 'S', timeOfDay: 'NIGHT' }]);
  for (let i = 0; i < 3; i++) {
    const shotId = (await command('addShot', [productionId, { sceneId: scene.id, purpose: '', action: `shot ${i}`, framing: 'WIDE', cameraMove: 'STATIC', durationSeconds: 8, characterIds: [], dialogue: i === 1 ? [{ id: 'line-fixture-1', characterId: 'nobody', text: 'We close in ten minutes.' }] : [], transition: 'CUT' }])).shot.id;
    // a FIXTURE take: ffmpeg's test pattern with a tone, committed as a take (no engine)
    const clip = path.join(work, `take-${i}.mp4`); const poster = path.join(work, `take-${i}.jpg`);
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=640x360:rate=24`, '-f', 'lavfi', '-i', `sine=frequency=${300 + i * 200}:sample_rate=48000`, '-t', '8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip]);
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', clip, '-frames:v', '1', poster]);
    const { job } = await enqueue({ type: 'GENERATE_TAKE', payload: { productionId, shotId }, runAfter: new Date(Date.now() + 365 * 86400_000).toISOString() });
    made.push(job.id);
    const out = jobOutputs({ id: job.id, attempts: 1 });
    const p = await out.adopt('poster', poster, { expectKind: 'IMAGE' }); const v = await out.adopt('video', clip, { expectKind: 'VIDEO' });
    await commitTake({ jobId: job.id, productionId, shotId, assets: [assetFromStored(p.id, p.stored, { label: 'FIXTURE poster', tags: ['fixture'], origin: 'DERIVED', jobId: job.id }), assetFromStored(v.id, v.stored, { label: 'FIXTURE take', tags: ['fixture'], origin: 'GENERATED', jobId: job.id, poster: `/api/media/${p.id}` })], take: { assetId: v.id, label: 'Take', provider: 'MINIMAX', model: 'FIXTURE (not a generation)', status: 'READY', jobId: job.id, thumbnailAssetId: p.id, durationSeconds: 8, select: 'ALWAYS' }, qa: [] });
    await requestCancel(job.id);
  }
  await approveEdit();
}, 120_000);

afterEach(async () => { for (const c of children.splice(0)) if (c.exitCode === null) c.kill('SIGKILL'); });
afterAll(async () => {
  if (made.length) { await db().delete(schema.jobEvents).where(inArray(schema.jobEvents.jobId, made)); await db().update(schema.jobs).set({ status: 'CANCELLED', lockedBy: null }).where(inArray(schema.jobs.id, made)); }
  if (productionId) await commands([{ name: 'deleteProduction', args: [productionId] }]).catch(() => undefined);
}, 60_000);

describe('interrupted export (§26)', () => {
  it('the worker is killed while ffmpeg writes the export: nothing partial is published; the next attempt renders, validates and records the export ONCE', async () => {
    const a = startWorker('export-a1');
    const job = await exportJob();
    await until('encoding', async () => { const r = await row(job.id); return (r.progress as { phase?: string } | null)?.phase === 'rendering' ? r : undefined; });
    await new Promise((r) => setTimeout(r, 800));
    await kill(a);
    expect((await p_exports()).filter((e) => e.jobId === job.id)).toEqual([]);
    expect((await filesOf(job.id)).filter((f) => f.rel.startsWith('video/'))).toEqual([]);
    const b = startWorker('export-b1');
    const done = await until('completed', async () => { const r = await row(job.id); return r.status === 'COMPLETED' || r.status === 'FAILED' ? r : undefined; }, 240_000);
    await stop(b);
    expect(done.status).toBe('COMPLETED');
    const exports = (await p_exports()).filter((e) => e.jobId === job.id);
    expect(exports).toHaveLength(1);
    const asset = (await readState()).state.assets.find((x) => x.id === exports[0].assetId)!;
    const probe = await ffprobe(assetFile(asset));
    expect(probe.videoCodec).toBe('h264');
    expect(probe.width).toBe(1920);
    expect(Math.abs((probe.durationSeconds ?? 0) - 24)).toBeLessThan(0.1);
    const files = await filesOf(job.id);
    expect(files.every((f) => f.referenced && f.shaOk !== false && f.attempt === 2)).toBe(true);
    expect((await attempts(job.id)).map((x) => [x.attempt, x.outcome, x.failureClass])).toEqual([[1, 'FAILED', 'INFRASTRUCTURE'], [2, 'COMPLETED', null]]);
  }, 400_000);

  it('cancelled mid-encode: ffmpeg is stopped, no export is recorded, no file is left in the library', async () => {
    const a = startWorker('export-a2');
    const job = await exportJob();
    await until('encoding', async () => (((await row(job.id)).progress as { phase?: string } | null)?.phase === 'rendering'));
    await requestCancel(job.id);
    await until('cancelled', async () => (await row(job.id)).status === 'CANCELLED', 60_000);
    await new Promise((r) => setTimeout(r, 1000));
    await stop(a);
    expect((await p_exports()).filter((e) => e.jobId === job.id)).toEqual([]);
    expect(await filesOf(job.id)).toEqual([]);
    expect((await attempts(job.id)).map((x) => x.outcome)).toEqual(['CANCELLED']);
  }, 200_000);
});

/** The format tags and stream list of a file. */
function probeTags(file: string): { tags: Record<string, string>; streams: string[]; duration: number } {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:format_tags:stream=codec_type', '-of', 'json', file], { encoding: 'utf8' })) as { format: { duration: string; tags?: Record<string, string> }; streams: Array<{ codec_type: string }> };
  return { tags: Object.fromEntries(Object.entries(j.format.tags ?? {}).map(([k, v]) => [k.toLowerCase(), v])), streams: j.streams.map((s) => s.codec_type), duration: Number(j.format.duration) };
}
/** Mean luma (0–255) and the share of bright pixels of the frame at `t` seconds. */
function frameStats(file: string, t: number): { mean: number; bright: number } {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', 'scale=320:180,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 });
  let sum = 0, bright = 0; for (const b of buf) { sum += b; if (b > 160) bright++; }
  return { mean: sum / buf.length, bright: bright / buf.length };
}
const exportAssetOf = async (jobId: string) => { const e = (await p_exports()).find((x) => x.jobId === jobId)!; return (await readState()).state.assets.find((a) => a.id === e.assetId)!; };
async function runToEnd(jobId: string, name: string) {
  const w = startWorker(name);
  const r = await until('settled', async () => { const x = await row(jobId); return ['COMPLETED', 'FAILED', 'CANCELLED'].includes(x.status) ? x : undefined; }, 240_000);
  await stop(w);
  return r;
}

describe('export: AI disclosure and end credits (licence compliance)', () => {
  it('every export carries the disclosure in its container metadata; with credits it ends on a card listing the engines; validation checks codec, container, one picture + one sound', async () => {
    const job = await exportJob('none', { credits: true, resolution: '720' });
    const done = await runToEnd(job.id, 'export-credits');
    expect(done.status, JSON.stringify(done.error)).toBe('COMPLETED');
    const asset = await exportAssetOf(job.id);
    const m = probeTags(assetFile(asset));
    expect(m.tags.comment).toBe('AI-generated with Vewbox Studio; video by MiniMax H3');
    expect(m.tags.description).toMatch(/^AI-generated with Vewbox Studio; video by MiniMax H3\. Engines: .*MiniMax H3/);
    expect(m.streams.sort()).toEqual(['audio', 'video']);
    expect(Math.abs(m.duration - 28)).toBeLessThan(0.1); // 24 s of film + the 4 s card
    const card = frameStats(assetFile(asset), 26);
    const film = frameStats(assetFile(asset), 12);
    expect(card.mean).toBeGreaterThan(25); // the card's dark grey, not black
    expect(card.mean).toBeLessThan(70);
    expect(card.bright).toBeGreaterThan(0.002); // its text
    expect(Math.abs(card.mean - film.mean)).toBeGreaterThan(10);
    const v = (asset.provenance as { validation: { ok: boolean; checks: Array<{ name: string; ok: boolean }> }; disclosure: { engines: string[] }; credits?: { seconds: number } });
    expect(v.validation.ok).toBe(true);
    for (const name of ['codec', 'container', 'stream-count', 'ai-disclosure', 'duration']) expect(v.validation.checks.find((c) => c.name === name)?.ok, name).toBe(true);
    expect(v.disclosure.engines).toContain('MiniMax H3');
    expect(v.credits?.seconds).toBe(4);
  }, 300_000);
});

describe('export: subtitle tracks for an English film (QA Q4)', () => {
  it('Arabic (or both) subtitles on an English film are refused before rendering — a clear reason, no retry, nothing recorded', async () => {
    for (const subs of ['ar', 'both'] as const) {
      const job = await exportJob(subs, { resolution: '720' });
      const done = await runToEnd(job.id, `export-subs-${subs}`);
      expect(done.status).toBe('FAILED');
      expect(done.attempts).toBe(1);
      expect((done.error as { message: string }).message).toMatch(/no Arabic subtitle text; its lines are in English/);
      expect((await attempts(job.id)).map((x) => [x.outcome, x.failureClass])).toEqual([['FAILED', 'INVALID_INPUT']]);
      expect((await p_exports()).filter((e) => e.jobId === job.id)).toEqual([]);
      expect(await filesOf(job.id)).toEqual([]);
    }
  }, 300_000);

  it('English subtitles are burned for real: cues written in English, the burn filter ran, only an English sidecar track', async () => {
    const job = await exportJob('en', { resolution: '720' });
    const done = await runToEnd(job.id, 'export-subs-en');
    expect(done.status, JSON.stringify(done.error)).toBe('COMPLETED');
    const asset = await exportAssetOf(job.id);
    const check = (asset.provenance as { validation: { checks: Array<{ name: string; ok: boolean; value?: string; detail?: string }> } }).validation.checks.find((c) => c.name === 'subtitles')!;
    expect(check).toMatchObject({ ok: true, value: '1 cue(s) burned (en)', detail: 'cues written, language matches, burn filter ran' });
    const sidecars = (await readState()).state.assets.filter((a) => a.jobId === job.id && a.tags.includes('subtitles'));
    expect(sidecars.map((a) => a.tags.filter((t) => t === 'ar' || t === 'en')).flat().sort()).toEqual(['en', 'en']); // srt + vtt, English only
  }, 300_000);
});

describe('assembly validation', () => {
  it('the cut is validated for codec, container, one picture + one sound, its length and the disclosure', async () => {
    const { job } = await enqueue({ type: 'ASSEMBLE', payload: { productionId } });
    made.push(job.id);
    const done = await runToEnd(job.id, 'assemble-1');
    expect(done.status, JSON.stringify(done.error)).toBe('COMPLETED');
    const cut = (await readState()).state.assets.find((a) => a.id === (done.result as { cutAssetId: string }).cutAssetId)!;
    const v = (cut.provenance as { validation: { ok: boolean; checks: Array<{ name: string; ok: boolean }> } }).validation;
    expect(v.ok).toBe(true);
    expect(v.checks.map((c) => c.name)).toEqual(expect.arrayContaining(['codec', 'container', 'stream-count', 'ai-disclosure', 'duration', 'audio-video-length']));
    expect(probeTags(assetFile(cut)).tags.comment).toBe('AI-generated with Vewbox Studio; video by MiniMax H3');
  }, 300_000);
});

const p_exports = async () => (await production()).exports ?? [];
