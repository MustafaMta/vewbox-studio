import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/** R4 — typed tool contracts. Every contract must accept what the real call returns (a contract that rejects a
 *  working call is a bug): the CPU tools are CALLED here on media made with ffmpeg; the GPU, hosted and service tools
 *  are checked against outputs shaped exactly as their provider functions build them (the ASR service's JSON mapping,
 *  the TTS service's answer headers through the real parser, ComfyUI's history, the job row through rowToJob). The
 *  inputs are the objects the call sites build. Then the runner: a wrong input is refused before the call
 *  (WRONG_PARAMETERS), a wrong output after it (OUTPUT_CORRUPTION), both recorded on the tool call. */

const recorded = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>>, runs: [] as Array<Record<string, unknown>> }));
vi.mock('@/server/org/runs', async (orig) => ({
  ...(await orig<typeof import('@/server/org/runs')>()),
  recordToolCall: vi.fn(async (_runId: string, call: Record<string, unknown>) => { recorded.calls.push(call); }),
  startDelegatedRun: vi.fn(async (input: Record<string, unknown>) => { recorded.runs.push(input); return 'run-child'; }),
  finishRun: vi.fn(async () => undefined),
  studioEvent: vi.fn(async () => undefined),
}));

const { CONTRACTS, contractJsonSchema } = await import('@/server/org/contracts');
const { TOOLS, AGENTS } = await import('@/server/org/model');
const { makeToolRunner, makeDelegator, parsePurpose } = await import('@/server/org/tools');
const { ffprobe, decodeCheck } = await import('@/server/media');
const { qaTake } = await import('@/server/media/ffmpeg');
const { validateExport } = await import('@/server/media/assembly');
const { takeLagAgainstMaster } = await import('@/server/media/sync');
const { alignLyrics } = await import('@/server/media/lyrics');
const { parseSynthesisHeaders } = await import('@/server/providers/speech');
const { rowToJob } = await import('@/server/jobs/queue');
const { qwenTextToImage } = await import('@/server/workflows');
const { seed } = await import('@/domain/sample');

const run = promisify(execFile);
let dir = '';
let clip = '';
let silent = '';
const accepts = (toolId: string, which: 'input' | 'output', value: unknown) => {
  const r = CONTRACTS[toolId][which].safeParse(value);
  expect(r.success, r.success ? '' : `${toolId} ${which}: ${JSON.stringify(r.error.issues.slice(0, 3))}`).toBe(true);
};

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contracts-'));
  clip = path.join(dir, 'clip.mp4'); silent = path.join(dir, 'silent.mp4');
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=24:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip]);
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=24:duration=2', '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', silent]);
}, 60_000);
afterAll(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

describe('contracts accept what the real calls return (CPU tools, called here)', () => {
  it('media.probe: ffprobe and the decode pass', async () => {
    accepts('media.probe', 'input', { file: clip });
    accepts('media.probe', 'output', await ffprobe(clip));
    accepts('media.probe', 'output', await decodeCheck(clip));
    accepts('media.probe', 'output', await decodeCheck(path.join(dir, 'missing.mp4')));
  });
  it('media.qa_take: a clip with sound and a silent one (whose true peak measures as NaN)', async () => {
    const input = { file: clip, expect: { durationSeconds: 2, width: 160, height: 120, expectAudio: true, speechExpected: false } };
    accepts('media.qa_take', 'input', input);
    accepts('media.qa_take', 'output', await qaTake(input.file, input.expect));
    accepts('media.qa_take', 'output', await qaTake(silent, { durationSeconds: 2, expectAudio: true, speechExpected: true }));
  }, 60_000);
  it('media.validate_export and media.align_lag', async () => {
    const check = { file: clip, expect: { width: 320, height: 240, fps: 24, durationSeconds: 2, subtitlesBurned: false } };
    accepts('media.validate_export', 'input', check);
    accepts('media.validate_export', 'output', await validateExport(check.file, check.expect));
    const lag = { takeFile: clip, masterFile: silent, from: 0, seconds: 1.5 };
    accepts('media.align_lag', 'input', lag);
    accepts('media.align_lag', 'output', await takeLagAgainstMaster(lag.takeFile, lag.masterFile, lag.from, lag.seconds));
    accepts('media.align_lag', 'output', await takeLagAgainstMaster(clip, clip, 0, 1.5));
  }, 60_000);
  it('lyrics.align on the sample song, with the sections as the call site passes them', () => {
    const song = seed().productions.find((p) => p.kind === 'MUSIC_VIDEO')!.song!;
    const words = [{ start: 0.5, end: 0.9, word: 'river' }, { start: 1.0, end: 1.4, word: 'lights' }];
    accepts('lyrics.align', 'input', { sections: song.sections, words, language: 'EN' });
    accepts('lyrics.align', 'output', alignLyrics(song.sections, words, 'EN'));
  });
});

describe('contracts accept the provider shapes of the GPU, hosted and service tools', () => {
  it('speech.transcribe: the ASR service JSON as transcribe() maps it', () => {
    accepts('speech.transcribe', 'input', { file: '/tmp/a.wav', language: 'ar' });
    accepts('speech.transcribe', 'input', { file: '/tmp/a.wav', language: 'auto' });
    accepts('speech.transcribe', 'output', { language: 'ar', languageProbability: 0.98, duration: 2.4, text: 'هسه وين نروح', segments: [{ start: 0, end: 2.1, text: 'هسه وين نروح', avg_logprob: -0.2, no_speech_prob: 0.01, words: [{ start: 0, end: 0.4, word: 'هسه', probability: 0.9 }] }], ms: 812, model: 'large-v3' });
    accepts('speech.transcribe', 'output', { language: 'en', languageProbability: 1, duration: 0, text: '', segments: [], ms: 40, model: 'large-v3' });
  });
  it('speech.synthesize: the local engines through the real header parser, and the hosted bytes', () => {
    accepts('speech.synthesize', 'input', { text: 'هلا بيك', language: 'AR', dialect: 'IRAQI_BAGHDADI', referenceWav: '/tmp/ref.wav', referenceText: 'هلا', emotion: undefined, emotionAlpha: 1, speed: 1, seed: 7, engine: 'habibi' });
    accepts('speech.synthesize', 'input', { text: 'Hello', voiceId: 'vb_x', languageBoost: 'English', emotion: undefined });
    const h = new Headers({ 'x-sample-rate': '24000', 'x-duration': '2.5', 'x-engine': 'habibi', 'x-model': 'Habibi-TTS IRQ', 'x-engine-version': 'habibi-tts 0.1.1', 'x-seed': '7', 'x-params': JSON.stringify({ seed: 7, speed: 1 }), 'x-true-peak': '-1.00' });
    accepts('speech.synthesize', 'output', { file: '/tmp/line.wav', ...parseSynthesisHeaders(h, 'habibi'), ms: 900 });
    accepts('speech.synthesize', 'output', { file: '/tmp/line.wav', ...parseSynthesisHeaders(new Headers({ 'x-engine': 'indextts' }), 'indextts'), ms: 900 });
    accepts('speech.synthesize', 'output', { bytes: Buffer.from([1, 2]), format: 'wav', durationMs: 2100, traceId: 't' });
  });
  it('speech.clone_voice, audio.separate_stems, music.generate', () => {
    accepts('speech.clone_voice', 'input', { file: '/tmp/orig.wav', voiceId: 'vb_x', languageBoost: 'Arabic' });
    accepts('speech.clone_voice', 'output', { voiceId: 'vb_x', demoUrl: undefined });
    accepts('audio.separate_stems', 'input', { file: '/tmp/song.mp3', outDir: '/tmp/stems' });
    accepts('audio.separate_stems', 'output', { files: { vocals: '/tmp/stems/vocals.wav', no_vocals: '/tmp/stems/no_vocals.wav' }, ms: 0, model: 'htdemucs' });
    accepts('music.generate', 'input', { engine: 'ace-step', caption: 'slow oud', lyrics: '[verse]\nla la', seconds: 48, instrumental: false });
    accepts('music.generate', 'input', { engine: 'minimax-api', caption: 'slow oud', lyrics: '', instrumental: undefined });
    accepts('music.generate', 'output', { bytes: Buffer.from([1]), format: 'mp3', traceId: undefined });
    accepts('music.generate', 'output', { promptId: 'p1', outputs: { '18': { audio: [{ filename: 'song_00001_.flac', subfolder: 'vewbox', type: 'output' }] } }, ms: 61000, engineMs: 58000, workflowVersion: 'wf:abc' });
  });
  it('image.* and video.minimax_generate: a real graph in, ComfyUI history and both video backends out', () => {
    const graph = qwenTextToImage({ prompt: 'a café at dawn', width: 1024, height: 1280 });
    accepts('image.generate', 'input', { graph, label: 'portrait' });
    accepts('image.edit_with_references', 'output', { promptId: 'p2', outputs: { '11': { images: [{ filename: 'vewbox_00001_.png', subfolder: '', type: 'output' }] }, '20': { text: ['note'] } }, ms: 12000, workflowVersion: 'wf:def' });
    const request = { prompt: 'A man wipes a counter. <d>[English] Morning.</d>', seconds: 6, width: 1280, height: 720, aspect: 'WIDE_16_9', firstFrame: undefined, lastFrame: undefined, referenceImages: [{ file: '/lib/a.png', mime: 'image/png' }], referenceAudio: undefined, guides: [{ frameIdx: 0, audioFile: '/tmp/dialogue.wav' }], seed: 1234, model: undefined, resolution: undefined, resumeTaskId: undefined };
    accepts('video.minimax_generate', 'input', request);
    accepts('video.minimax_generate', 'output', { file: '/tmp/h3/clip.mp4', backend: 'local', model: 'MiniMax-H3 (local, pruned int8)', requestId: 'prompt-1', resolution: '1280x720', seconds: 6, ms: 120000, engineMs: 98000, workflowVersion: 'wf:h3', params: { graphNodes: 30, first: false, last: false, refs: 1, guides: [{ frameIdx: 0, image: false, video: false, audio: true }], engineMs: 98000 } });
    accepts('video.minimax_generate', 'output', { file: '/tmp/mmx/t.mp4', backend: 'api', model: 'MiniMax-H3', requestId: 'task-1', resolution: '768P', seconds: 6, costUsd: 0.48, ms: 200000, params: { ratio: '16:9', content: [{ type: 'text' }] } });
    // more than nine pictures is outside the engine: the contract refuses it
    expect(CONTRACTS['video.minimax_generate'].input.safeParse({ ...request, referenceImages: Array.from({ length: 10 }, () => ({ file: '/a.png', mime: 'image/png' })) }).success).toBe(false);
  });
  it('media.assemble and jobs.enqueue', () => {
    const mix = { rate: 48000, targetLufs: -23, notes: [], tracks: [{ kind: 'GENERATED_VIDEO_AUDIO', sourceAssetId: 'take-1', sourceOffsetSamples: 0, startSample: 0, durationSamples: 240000, gain: 1, policy: 'native MiniMax sound', shotId: 's1', muted: false }] };
    accepts('media.assemble', 'input', { productionId: 'p1', shots: 1, width: 1920, height: 1080, fps: 24, mix, files: { 'take-1': '/lib/take.mp4' }, subtitles: { srt: undefined, burn: 'none' }, codec: 'h264', outFile: '/tmp/cut.mp4' });
    accepts('media.assemble', 'output', { file: '/tmp/cut.mp4', loudness: { integrated: -23.1, truePeak: -1.4 }, durationSeconds: 5 });
    accepts('media.assemble', 'output', { file: '/tmp/cut.mp4', loudness: null, durationSeconds: 5 });
    accepts('media.assemble', 'output', { file: '/tmp/cut.mp4', loudness: { integrated: Number.NaN, truePeak: Number.NaN }, durationSeconds: 5 });
    const req = { type: 'GENERATE_TAKE' as const, payload: { productionId: 'p1', shotId: 's1' }, parentId: 'job-1', idempotencyKey: 'produce:job-1:take:s1:1', priority: 1 };
    accepts('jobs.enqueue', 'input', req);
    const now = new Date().toISOString();
    const row = { id: 'job-2', type: 'GENERATE_TAKE', status: 'QUEUED', priority: 1, payload: req.payload, result: null, progress: null, error: null, attempts: 0, maxAttempts: 3, runAfter: null, startedAt: null, finishedAt: null, heartbeatAt: null, cancelRequested: false, providerTaskId: null, parentId: 'job-1', productionId: 'p1', sceneId: null, shotId: 's1', takeId: null, characterId: null, locationId: null, lockedBy: null, lockedAt: null, idempotencyKey: req.idempotencyKey, createdAt: now, updatedAt: now } as unknown as Parameters<typeof rowToJob>[0];
    accepts('jobs.enqueue', 'output', { job: rowToJob(row), created: true });
  });
  it('every contract exports as JSON Schema for the org API', () => {
    for (const t of TOOLS) {
      const js = contractJsonSchema(t.id)!;
      expect(js.input, t.id).toBeTypeOf('object');
      expect(js.output, t.id).toBeTypeOf('object');
    }
    expect(contractJsonSchema('studio.read')).toBeNull();
  });
});

describe('the tool runner enforces the contracts', () => {
  const log = { debug: () => undefined, warn: () => undefined, error: () => undefined, info: () => undefined } as unknown as Parameters<typeof makeToolRunner>[2];
  const inspector = AGENTS.find((a) => a.id === 'technical-media-inspector')!;
  const writer = AGENTS.find((a) => a.id === 'continuity-writer')!;

  it('a wrong input is refused before the call (WRONG_PARAMETERS), recorded on the tool call', async () => {
    recorded.calls.length = 0;
    const tool = makeToolRunner(inspector, 'run-1', log);
    const fn = vi.fn(async () => ({ hasVideo: true, hasAudio: true }));
    await expect(tool('media.probe', fn, { input: { file: '' } })).rejects.toMatchObject({ failureClass: 'WRONG_PARAMETERS' });
    expect(fn).not.toHaveBeenCalled();
    expect(recorded.calls[0]).toMatchObject({ tool: 'media.probe', ok: false, failureClass: 'WRONG_PARAMETERS', version: '1.1.0' });
  });
  it('an output outside the contract fails the call (OUTPUT_CORRUPTION); a good one is returned untouched', async () => {
    recorded.calls.length = 0;
    const tool = makeToolRunner(inspector, 'run-1', log);
    await expect(tool('media.validate_export', async () => ({ ok: 'yes' }))).rejects.toMatchObject({ failureClass: 'OUTPUT_CORRUPTION' });
    expect(recorded.calls[0]).toMatchObject({ ok: false, failureClass: 'OUTPUT_CORRUPTION' });
    const out = { ok: true, checks: [{ name: 'decodable', ok: true, value: 'h264 320x240' }], extra: 'kept' };
    expect(await tool('media.validate_export', async () => out)).toBe(out);
    expect(recorded.calls[1]).toMatchObject({ tool: 'media.validate_export', ok: true });
  });
  it('the story output is checked against the task the input names', async () => {
    const tool = makeToolRunner(writer, 'run-2', log);
    const bible = { events: ['S1E1: opened'], unresolved: [] };
    expect(await tool('story.structured_answer', async () => bible, { input: { task: 'continuity', productionId: 'p' } })).toBe(bible);
    await expect(tool('story.structured_answer', async () => bible, { input: { task: 'script', productionId: 'p' } })).rejects.toMatchObject({ failureClass: 'OUTPUT_CORRUPTION' });
    await expect(tool('story.structured_answer', async () => bible, { input: { task: 'continuity', typo: 1 } })).rejects.toMatchObject({ failureClass: 'WRONG_PARAMETERS' });
  });
  it('a tool off the allow-list is refused', async () => {
    const tool = makeToolRunner(writer, 'run-2', log);
    await expect(tool('media.probe', async () => ({}))).rejects.toThrow(/may not call media\.probe/);
  });
  it('a delegated step must be declared by its agent; the run records the step’s name and detail', async () => {
    expect(parsePurpose('take-preflight: shot 3')).toEqual({ stepId: 'take-preflight', detail: 'shot 3' });
    expect(parsePurpose('timing-fit')).toEqual({ stepId: 'timing-fit', detail: undefined });
    recorded.runs.length = 0;
    const delegate = makeDelegator({ id: 'job-1', type: 'GENERATE_TAKE', attempts: 1, productionId: 'p1', shotId: 's1' }, 'run-parent', log);
    await expect(delegate('executive-producer', 'not-a-step: x', async () => 1)).rejects.toThrow(/declares no step/);
    expect(recorded.runs).toHaveLength(0);
    expect(await delegate('executive-producer', 'take-preflight: shot 3', async (tool) => { await expect(tool('media.probe', async () => ({}))).rejects.toThrow(/may not call/); return 7; })).toBe(7);
    expect(recorded.runs[0]).toMatchObject({ agentId: 'executive-producer', parentRunId: 'run-parent', purpose: 'Feasibility preflight of a take: shot 3' });
  });
});
