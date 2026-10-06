import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stubComfy, stubSpeech, type StubComfy } from './fixtures/stub-engines';

/** ENGINE FAULTS (directive 2026-10-06 §26): container restart mid-job, GPU out of memory, corrupted output — against
 *  FIXTURE engines (tests/worker/fixtures/stub-engines.ts; never the shared ComfyUI/TTS/ASR containers) with the
 *  studio's real clients (providers/comfy.ts, providers/video.ts, providers/speech.ts) inside a real job scope on the
 *  test database. What is checked is the classification (what the worker will retry, what it will not), what is
 *  resubmitted or adopted, and that a broken output is kept as evidence and never adopted again. */

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-engines-'));
const clipFile = path.join(work, 'good.mp4');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clipFile]);
const wavFile = path.join(work, 'good.wav');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=24000', '-t', '1', '-c:a', 'pcm_s16le', wavFile]);

// the graph a plain request builds names these nodes and models; the stub has them (readiness passes)
const { minimaxH3Video } = await import('@/server/workflows/minimax-h3');
const { graphRequirements } = await import('@/server/production/readiness');
const req0 = graphRequirements(minimaxH3Video({ prompt: 'x', width: 320, height: 180, seconds: 2, filenamePrefix: 'vewbox/h3' }) as never);
const models: Record<string, string[]> = {};
for (const m of req0.models) (models[m.folder] ??= []).push(m.file);
const comfyStub: StubComfy = await stubComfy({ nodes: req0.nodes, models, goodClip: fs.readFileSync(clipFile), runMs: 600 });
const speechStub = await stubSpeech(fs.readFileSync(wavFile));
// the clients read their URLs once, on first use: point them at the fixtures before anything asks
Object.assign(process.env, { COMFYUI_URL: comfyStub.url, TTS_URL: speechStub.url, ASR_URL: speechStub.url, VIDEO_BACKEND: 'local', MINIMAX_API_KEY: '' });

const { eq, inArray } = await import('drizzle-orm');
const { db, schema } = await import('@/server/db/client');
const { enqueue, listEvents } = await import('@/server/jobs/queue');
const { runInJobScope } = await import('@/server/jobs/context');
const { generateVideo } = await import('@/server/providers/video');
const { synthesize, transcribe, wavProblem } = await import('@/server/providers/speech');
const { classifyFailure, RETRYABLE_CLASSES } = await import('@/server/org/runs');
const { libraryRoot } = await import('@/server/media');

const made: string[] = [];
/** A GENERATE_TAKE job held by this test as attempt `n` (the job scope's lease), never claimable by a worker. */
async function heldJob() {
  const { job } = await enqueue({ type: 'GENERATE_TAKE', payload: { productionId: 'p-engine-faults', shotId: `s-${made.length}` }, runAfter: new Date(Date.now() + 365 * 86400_000).toISOString() });
  made.push(job.id);
  return job.id;
}
async function asAttempt<T>(jobId: string, attempt: number, fn: () => Promise<T>): Promise<T> {
  const lease = { workerId: 'engine-faults', attempt };
  await db().update(schema.jobs).set({ status: 'GENERATING', lockedBy: lease.workerId, attempts: attempt, heartbeatAt: new Date().toISOString() }).where(eq(schema.jobs.id, jobId));
  return runInJobScope({ jobId, signal: new AbortController().signal, lease }, fn);
}
const request = () => ({ prompt: 'a lighthouse at dusk', seconds: 2, width: 320, height: 180, aspect: 'WIDE_16_9', seed: 7 });
/** How the worker decides after a failure (src/worker/index.ts retryPolicy). */
const verdict = (e: unknown) => { const c = classifyFailure(e); const code = (e as { code?: string }).code; return { failureClass: c, autoRetry: RETRYABLE_CLASSES.includes(c) && (code === 'PROVIDER' || code === 'UNAVAILABLE') && (e as { retryable?: boolean }).retryable !== false }; };

beforeAll(() => { comfyStub.modes.length = 0; });
afterAll(async () => {
  if (made.length) { await db().delete(schema.jobEvents).where(inArray(schema.jobEvents.jobId, made)); await db().update(schema.jobs).set({ status: 'CANCELLED', lockedBy: null }).where(inArray(schema.jobs.id, made)); }
  await comfyStub.close(); await speechStub.close();
});

describe('ComfyUI container restarted mid-prompt', () => {
  it('the lost prompt is reported (not waited out), classified as a retryable INFRASTRUCTURE failure; the next attempt submits the SAME recorded id again and its run is not claimed as adopted', async () => {
    const jobId = await heldJob();
    comfyStub.modes.push('restart', 'ok');
    let recorded = '';
    const e = await asAttempt(jobId, 1, () => generateVideo({ ...request(), onTaskCreated: (id) => { recorded = id; } })).catch((x) => x);
    expect(e.kind).toBe('LOST');
    expect(verdict(e)).toEqual({ failureClass: 'INFRASTRUCTURE', autoRetry: true });
    expect(comfyStub.submitted.filter((x) => x === recorded)).toHaveLength(1);
    const r = await asAttempt(jobId, 2, () => generateVideo({ ...request(), resumeTaskId: recorded }));
    expect(r.requestId).toBe(recorded);
    expect(comfyStub.submitted.filter((x) => x === recorded)).toHaveLength(2); // resubmitted: ComfyUI had forgotten it
    expect(r.resumed).toBe(false); // the take's generation time is this run's, not an "adopted" one
  }, 60_000);
});

describe('ComfyUI container down for a while (docker restart)', () => {
  it('mid-prompt: the refused polls are waited out, then the forgotten prompt is reported LOST (retryable) — not UNAVAILABLE on the first refusal', async () => {
    const jobId = await heldJob();
    comfyStub.modes.push('ok');
    let restarting: Promise<void> | undefined;
    const e = await asAttempt(jobId, 1, () => generateVideo({ ...request(), onTaskCreated: () => { setTimeout(() => { restarting = comfyStub.restart(3000); }, 100); } })).catch((x) => x);
    await restarting;
    expect(e.kind).toBe('LOST');
    expect(e.message).toMatch(/no longer knows prompt/);
    expect(verdict(e)).toEqual({ failureClass: 'INFRASTRUCTURE', autoRetry: true });
  }, 60_000);
  it('an attempt that starts while the engine is still coming up waits for it instead of failing', async () => {
    const jobId = await heldJob();
    comfyStub.modes.push('ok');
    const down = comfyStub.restart(4000);
    const r = await asAttempt(jobId, 1, () => generateVideo(request()));
    await down;
    expect(fs.statSync(r.file).size).toBe(fs.statSync(clipFile).size);
  }, 60_000);
});

describe('ComfyUI busy when the card leaves it (incident 2026-10-06 12:41Z)', () => {
  it('the ComfyUI unload of the lease waits for prompts still running there (a foreign or abandoned prompt), then frees', async () => {
    const { enginesToUnload } = await import('@/server/gpu/unloaders');
    const comfyEngine = enginesToUnload('IMAGE', 'LLM').find((e) => e.name === 'comfyui')!;
    comfyStub.queueBusy = 3;
    const frees = comfyStub.frees;
    const t0 = Date.now();
    process.env.GPU_COMFY_DRAIN_MS = '60000';
    await comfyEngine.unload();
    expect(comfyStub.queueBusy).toBe(0);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(3_500); // waited through the busy polls (2 s apart)
    expect(comfyStub.frees).toBe(frees + 1);
  }, 60_000);
  it('waitIdle gives up after its bound and says so', async () => {
    const { waitIdle } = await import('@/server/providers/comfy');
    comfyStub.queueBusy = 1000;
    const w = await waitIdle(1_500, 300);
    comfyStub.queueBusy = 0;
    expect(w).toMatchObject({ idle: false, promptIds: ['foreign-prompt-1'] });
  }, 30_000);
});

describe('GPU out of memory', () => {
  it('an execution_error OutOfMemory is RESOURCE_EXHAUSTION, retryable, and the engine is told to free its memory', async () => {
    const jobId = await heldJob();
    comfyStub.modes.push('oom');
    const frees = comfyStub.frees;
    const e = await asAttempt(jobId, 1, () => generateVideo(request())).catch((x) => x);
    expect(e.kind).toBe('OUT_OF_MEMORY');
    expect(e.message).toMatch(/ran out of GPU memory in MiniMaxH3Sampler #12/);
    expect(verdict(e)).toEqual({ failureClass: 'RESOURCE_EXHAUSTION', autoRetry: true });
    expect(comfyStub.frees).toBe(frees + 1);
  }, 60_000);
});

describe('corrupted output from the engine', () => {
  for (const mode of ['zero', 'truncated'] as const) {
    it(`a ${mode === 'zero' ? 'zero-byte' : 'truncated'} clip: fetched once more, then kept as evidence and rejected (OUTPUT_CORRUPTION, no blind retry); the next attempt generates again instead of adopting it`, async () => {
      const jobId = await heldJob();
      comfyStub.modes.push(mode, 'ok');
      const views = comfyStub.views;
      let first = '';
      const e = await asAttempt(jobId, 1, () => generateVideo({ ...request(), onTaskCreated: (id) => { first = id; } })).catch((x) => x);
      expect(e.message).toMatch(/output for task .* is unusable/);
      expect(verdict(e)).toEqual({ failureClass: 'OUTPUT_CORRUPTION', autoRetry: false });
      expect(comfyStub.views).toBe(views + 2); // fetched again once (a transfer cut short) before rejecting
      const ev = (await listEvents(jobId)).find((x) => (x.data as { rejectedTaskId?: string } | undefined)?.rejectedTaskId === first)!;
      expect(ev.level).toBe('error');
      const evidence = (ev.data as { evidence: string }).evidence;
      expect(evidence).toMatch(new RegExp(`^evidence/${jobId}/a1-`));
      expect(fs.statSync(path.join(libraryRoot(), evidence)).size).toBe(mode === 'zero' ? 0 : Math.floor(fs.statSync(clipFile).size / 3));
      // the producer's retry (or any later attempt) — with the corrupt prompt still recorded on the job — makes a new one
      const r = await asAttempt(jobId, 2, () => generateVideo({ ...request(), resumeTaskId: first }));
      expect(r.requestId).not.toBe(first);
      expect(comfyStub.submitted.filter((x) => x === first)).toHaveLength(1);
      expect(fs.statSync(r.file).size).toBe(fs.statSync(clipFile).size);
    }, 60_000);
  }
});

describe('voice and transcription services', () => {
  it('a voice container that dies mid-answer is UNAVAILABLE (retryable infrastructure), not an unclassified "terminated"', async () => {
    speechStub.modes.push('reset-mid-body');
    const e = await synthesize({ text: 'Hello', language: 'EN', referenceWav: wavFile }, work).catch((x) => x);
    expect(e.code).toBe('UNAVAILABLE');
    expect(verdict(e)).toEqual({ failureClass: 'INFRASTRUCTURE', autoRetry: true });
  });
  it('inside a job, a voice container that is restarting (connections refused) is waited for: the line is spoken, no attempt lost', async () => {
    const jobId = await heldJob();
    const down = speechStub.restart(4000);
    const r = await asAttempt(jobId, 1, () => synthesize({ text: 'Hello', language: 'EN', referenceWav: wavFile }, work));
    await down;
    expect(fs.statSync(r.file).size).toBe(fs.statSync(wavFile).size);
  }, 60_000);
  it('a zero-byte or truncated WAV is OUTPUT_CORRUPTION, named as the service’s failure', async () => {
    for (const mode of ['zero', 'truncated'] as const) {
      speechStub.modes.push(mode);
      const e = await synthesize({ text: 'Hello', language: 'EN', referenceWav: wavFile }, work).catch((x) => x);
      expect(e.message).toMatch(/returned an unusable recording: (empty|truncated)/);
      expect(verdict(e).failureClass).toBe('OUTPUT_CORRUPTION');
    }
    const ok = await synthesize({ text: 'Hello', language: 'EN', referenceWav: wavFile }, work);
    expect(fs.statSync(ok.file).size).toBe(fs.statSync(wavFile).size);
  });
  it('transcription: a reset mid-answer is UNAVAILABLE; a malformed answer is OUTPUT_CORRUPTION', async () => {
    speechStub.modes.push('reset-mid-body');
    expect(verdict(await transcribe(wavFile).catch((x) => x))).toEqual({ failureClass: 'INFRASTRUCTURE', autoRetry: true });
    speechStub.modes.push('malformed-json');
    expect(verdict(await transcribe(wavFile).catch((x) => x)).failureClass).toBe('OUTPUT_CORRUPTION');
    expect((await transcribe(wavFile)).text).toBe('hello');
  });
  it('wavProblem reads the header', () => {
    const good = fs.readFileSync(wavFile);
    expect(wavProblem(good)).toBeNull();
    expect(wavProblem(Buffer.alloc(0))).toMatch(/empty/);
    expect(wavProblem(good.subarray(0, 100))).toMatch(/truncated/);
    expect(wavProblem(Buffer.from('<html>502 Bad Gateway</html>'.padEnd(60)))).toMatch(/not a WAV/);
  });
});
