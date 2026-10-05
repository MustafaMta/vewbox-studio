import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/** THE ALIGNMENT AND PICTURE-QA CLIENT against a faked asr service: requests carry the right fields, answers are
 *  camel-cased, every offline / refused / malformed answer becomes { available: false, reason } (never a throw), bad
 *  arguments throw, and the judges map measurements to PASS / REVIEW / FAIL / NOT_MEASURED with the START thresholds.
 *  The real service (docker/asr/align.py, qa.py) needs the workstation; see docs/MODELS.md. */

process.env.ASR_URL = 'http://asr.test:8030/';
const qa = await import('@/server/providers/qa-service');
const { runInJobScope } = await import('@/server/jobs/context');

let dir: string; let wav: string; let mp4: string; let png: string; let png2: string;
beforeAll(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'qa-service-'));
  wav = path.join(dir, 'line.wav'); mp4 = path.join(dir, 'take.mp4'); png = path.join(dir, 'ana.png'); png2 = path.join(dir, 'omar.png');
  for (const f of [wav, mp4, png, png2]) await fsp.writeFile(f, Buffer.from(`bytes of ${path.basename(f)}`));
});
afterAll(async () => { await fsp.rm(dir, { recursive: true, force: true }); });
afterEach(() => { vi.unstubAllGlobals(); });

const respond = (body: unknown, status = 200) => vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

const alignBody = {
  language: 'en', model: 'facebook/wav2vec2-base-960h', device: 'cpu', vocab_mode: 'upper', duration: 2.1,
  words: [
    { text: 'Hi,', norm: 'hi', start: 0.1, end: 0.24, score: 0.91, aligned: true },
    { text: '007', norm: '007', start: 0.24, end: 0.5, score: null, aligned: false },
    { text: 'you!', norm: 'you', start: 0.5, end: 0.64, score: 0.2, aligned: true },
  ],
  coverage: 0.6667, char_coverage: 0.625, mean_score: 0.55, unaligned_words: ['007'], score_floor: 0.3, frame_seconds: 0.02, frames: 105, tokens: 6, ms: 40,
};

function track(id: number, o: Record<string, unknown> = {}) {
  return { id, frames: 100, first_frame: 0, last_frame: 99, mean_box: [10, 10, 60, 70], face_height_px: 60, scored: true, activity_inside: 1.2, activity_outside: 0.3, activity_ratio: 4, inside_frames: 50, outside_frames: 49, corr_lag0: 0.6, corr_best: 0.62, best_lag_frames: 0, best_lag_ms: 0, lag_at_search_edge: false, is_speaker: false, flags: [], ...o };
}
function mouthBody(tracks: unknown[], o: Record<string, unknown> = {}) {
  return { fps: 24, frames: 100, duration: 4.17, size: [960, 552], audio_source: 'upload', audio_offset: 0, windows_source: 'windows', speech_frames: 50, faces_per_frame_max: 2, max_lag_frames: 5, mode: 'speech', tracks, speaker_tracks: [0], thresholds: {}, syncnet: { available: false, reason: 'disabled' }, model: 'MediaPipe Face Landmarker', ms: 900, ...o };
}

describe('alignScript', () => {
  it('posts the file, text and language and camel-cases the answer', async () => {
    const f = respond(alignBody);
    vi.stubGlobal('fetch', f);
    const r = await qa.alignScript(wav, 'Hi, 007 you!', 'en', { start: 1.5, end: 4 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://asr.test:8030/align');
    const fd = init.body as FormData;
    expect(fd.get('text')).toBe('Hi, 007 you!'); expect(fd.get('language')).toBe('en'); expect(fd.get('start')).toBe('1.5'); expect(fd.get('end')).toBe('4'); expect(fd.get('chars')).toBe('1');
    expect((fd.get('file') as File).name).toBe('line.wav');
    expect(r).toMatchObject({ available: true, charCoverage: 0.625, meanScore: 0.55, unalignedWords: ['007'], scoreFloor: 0.3, vocabMode: 'upper' });
  });

  it('answers unavailable — never throws — when the service is down, refuses, is old or answers garbage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); }));
    expect(await qa.alignScript(wav, 'hi', 'en')).toEqual({ available: false, reason: '/align: the asr service is not reachable (ECONNREFUSED)' });
    vi.stubGlobal('fetch', respond({ detail: 'alignment (ar) unavailable: weights not on the models volume' }, 503));
    expect(await qa.alignScript(wav, 'سلام', 'ar')).toEqual({ available: false, reason: '/align: alignment (ar) unavailable: weights not on the models volume', status: 503 });
    vi.stubGlobal('fetch', respond({ detail: 'Not Found' }, 404));
    expect(await qa.alignScript(wav, 'hi', 'en')).toMatchObject({ available: false, status: 404, reason: expect.stringContaining('older image') });
    vi.stubGlobal('fetch', respond({ detail: 'the audio is too short for the text' }, 422));
    expect(await qa.alignScript(wav, 'hi', 'en')).toMatchObject({ available: false, status: 422 });
    vi.stubGlobal('fetch', respond('<html>proxy</html>', 200));
    expect(await qa.alignScript(wav, 'hi', 'en')).toMatchObject({ available: false, reason: '/align: the answer is not JSON' });
  });

  it('times out into unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => new Promise((_, reject) => { init.signal!.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))); })));
    const r = await qa.alignScript(wav, 'hi', 'en', { timeoutMs: 20 });
    expect(r).toMatchObject({ available: false, reason: expect.stringContaining('did not answer within') });
  });

  it('rethrows a stopped job instead of calling it offline', async () => {
    const stop = new Error('job cancelled');
    const ctrl = new AbortController();
    vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => new Promise((_, reject) => { init.signal!.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))); setTimeout(() => ctrl.abort(stop), 5); })));
    await expect(runInJobScope({ jobId: 'j1', signal: ctrl.signal }, () => qa.alignScript(wav, 'hi', 'en'))).rejects.toBe(stop);
  });

  it('throws for programmer errors', async () => {
    const f = respond(alignBody); vi.stubGlobal('fetch', f);
    await expect(qa.alignScript(wav, '  ', 'en')).rejects.toMatchObject({ code: 'INVALID' });
    await expect(qa.alignScript(wav, 'hi', 'fr' as 'en')).rejects.toMatchObject({ code: 'INVALID' });
    await expect(qa.alignScript(wav, 'hi', 'en', { start: 3, end: 2 })).rejects.toMatchObject({ code: 'INVALID' });
    await expect(qa.alignScript(path.join(dir, 'missing.wav'), 'hi', 'en')).rejects.toMatchObject({ code: 'INVALID', message: expect.stringContaining('ENOENT') });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('mouthActivity and faceIdentity requests', () => {
  it('sends the video, the authoritative audio and the word windows', async () => {
    const f = respond(mouthBody([track(0, { is_speaker: true })]));
    vi.stubGlobal('fetch', f);
    const r = await qa.mouthActivity(mp4, { audio: wav, audioOffset: 0.5, windows: [{ start: 0.1, end: 0.6 }], fps: 24, mode: 'singing', speakers: 2 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://asr.test:8030/qa/mouth');
    const fd = init.body as FormData;
    expect((fd.get('video') as File).name).toBe('take.mp4'); expect((fd.get('audio') as File).name).toBe('line.wav');
    expect(JSON.parse(fd.get('windows') as string)).toEqual([{ start: 0.1, end: 0.6 }]);
    expect(fd.get('audio_offset')).toBe('0.5'); expect(fd.get('fps')).toBe('24'); expect(fd.get('mode')).toBe('singing'); expect(fd.get('speakers')).toBe('2'); expect(fd.get('max_lag_ms')).toBe('200');
    expect(r).toMatchObject({ available: true, speakerTracks: [0], audioSource: 'upload', tracks: [{ id: 0, isSpeaker: true, corrBest: 0.62, bestLagFrames: 0 }] });
    await expect(qa.mouthActivity(mp4, { windows: [{ start: 2, end: 1 }] })).rejects.toMatchObject({ code: 'INVALID' });
    await expect(qa.mouthActivity(mp4, { fps: 0 })).rejects.toMatchObject({ code: 'INVALID' });
    await expect(qa.mouthActivity(mp4, { audioOffset: 1 })).rejects.toMatchObject({ code: 'INVALID' }); // an offset without the audio it places
  });

  it('sends one reference per character in order and keeps character ids as keys', async () => {
    const body = { sample_fps: 2, frames: 8, faces_per_frame_max: 2, size: [1280, 736], threshold: 0.363, review_below: 0.5, drift_review: 0.15, model: 'YuNet + SFace', ms: 300,
      characters: { char_ana_1: { reference: { available: true, faces_in_reference: 1, face_box: [1, 2, 3, 4], score: 0.9 }, series: [{ t: 0, cosine: 0.7, box: [0, 0, 10, 10] }], summary: { frames: 8, frames_with_face: 8, min: 0.6, median: 0.7, mean: 0.7, p10: 0.62, below_threshold: 0, share_below: 0, drift: 0.05, threshold: 0.363 } } } };
    const f = respond(body); vi.stubGlobal('fetch', f);
    const r = await qa.faceIdentity(mp4, [{ characterId: 'char_ana_1', image: png }, { characterId: 'char_omar_2', image: png2 }], { sampleFps: 3 });
    const fd = (f.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    expect((fd.getAll('references') as File[]).map((x) => x.name)).toEqual(['ana.png', 'omar.png']);
    expect(JSON.parse(fd.get('characters') as string)).toEqual(['char_ana_1', 'char_omar_2']);
    expect(fd.get('sample_fps')).toBe('3');
    expect(r).toMatchObject({ available: true, reviewBelow: 0.5, characters: { char_ana_1: { reference: { facesInReference: 1 }, summary: { framesWithFace: 8, belowThreshold: 0 } } } });
    await expect(qa.faceIdentity(mp4, [])).rejects.toMatchObject({ code: 'INVALID' });
    await expect(qa.faceIdentity(mp4, [{ characterId: 'a', image: png }, { characterId: 'a', image: png2 }])).rejects.toMatchObject({ code: 'INVALID' });
  });
});

const mouth = (tracks: unknown[], o: Record<string, unknown> = {}) => qa.camelize({ ...mouthBody(tracks, o), available: true }) as import('@/server/providers/qa-service').MouthResult;

describe('judgeLipSync', () => {
  it('passes a speaker whose mouth follows the line in sync', () => {
    const j = qa.judgeLipSync(mouth([track(0, { is_speaker: true }), track(1, { corr_best: 0.05, activity_inside: 0.1 })]));
    expect(j).toMatchObject({ ok: true, verdict: 'PASS', lagFrames: 0, speakerTrack: 0, offsetRepair: false, detail: [] });
  });
  it('a 3-frame offset is REVIEW with an offset repair; beyond 6 frames FAIL', () => {
    const j = qa.judgeLipSync(mouth([track(0, { best_lag_frames: 3, best_lag_ms: 125 })]));
    expect(j).toMatchObject({ verdict: 'REVIEW', lagFrames: 3, offsetRepair: true });
    expect(j.detail[0]).toMatch(/shift the audio by 3 frames/);
    expect(qa.judgeLipSync(mouth([track(0, { best_lag_frames: -8 })]))).toMatchObject({ verdict: 'FAIL', offsetRepair: false });
  });
  it('a still mouth or no following FAILs', () => {
    expect(qa.judgeLipSync(mouth([track(0, { flags: ['MOUTH_STILL_WHILE_SPEAKING'], activity_inside: 0.1 })])).verdict).toBe('FAIL');
    expect(qa.judgeLipSync(mouth([track(0, { corr_best: 0.02, activity_ratio: 0.9 })])).verdict).toBe('FAIL');
  });
  it('an extra singer or a better-following face is REVIEW', () => {
    const j = qa.judgeLipSync(mouth([track(0), track(1, { flags: ['EXTRA_SINGER'] })], { mode: 'singing' }));
    expect(j.verdict).toBe('REVIEW'); expect(j.flags).toEqual([{ track: 1, flag: 'EXTRA_SINGER' }]); expect(j.detail.join()).toMatch(/extra singer/);
    const k = qa.judgeLipSync(mouth([track(0), track(1)]), qa.LIPSYNC_THRESHOLDS_START, { speakerTrack: 1 });
    expect(k).toMatchObject({ verdict: 'REVIEW', speakerTrack: 1 }); expect(k.detail.join()).toMatch(/follows the audio better/);
  });
  it('weak correlation, low activity ratio and a poorly visible speaker are REVIEW', () => {
    expect(qa.judgeLipSync(mouth([track(0, { corr_best: 0.2 })])).verdict).toBe('REVIEW');
    expect(qa.judgeLipSync(mouth([track(0, { activity_ratio: 1.1 })])).verdict).toBe('REVIEW');
    expect(qa.judgeLipSync(mouth([track(0, { inside_frames: 10 })])).verdict).toBe('REVIEW');
  });
  it('NOT_MEASURED when offline, without speech, without faces or with only short tracks', () => {
    expect(qa.judgeLipSync({ available: false, reason: 'down' })).toMatchObject({ ok: false, verdict: 'NOT_MEASURED', detail: ['not measured: down'] });
    expect(qa.judgeLipSync(mouth([track(0)], { speech_frames: 3 })).verdict).toBe('NOT_MEASURED');
    expect(qa.judgeLipSync(mouth([], { speaker_tracks: [] })).verdict).toBe('NOT_MEASURED');
    expect(qa.judgeLipSync(mouth([track(0, { scored: false, reason: 'track shorter than 12 frames' })], { speaker_tracks: [] })).verdict).toBe('NOT_MEASURED');
  });
});

const identity = (chars: Record<string, unknown>) => ({ available: true as const, sampleFps: 2, frames: 8, facesPerFrameMax: 1, size: [1280, 736], threshold: 0.363, reviewBelow: 0.5, driftReview: 0.15, model: 'x', ms: 1, characters: chars as Record<string, import('@/server/providers/qa-service').IdentityCharacter> });
const sum = (o: Record<string, unknown> = {}) => ({ reference: { available: true }, series: [], summary: { frames: 8, framesWithFace: 8, min: 0.55, median: 0.68, mean: 0.67, p10: 0.6, belowThreshold: 0, shareBelow: 0, drift: 0.05, threshold: 0.363, ...o } });

describe('judgeIdentity', () => {
  it('PASS / REVIEW / FAIL on the median against 0.363 and 0.50', () => {
    expect(qa.judgeIdentity(identity({ a: sum() }))).toMatchObject({ ok: true, verdict: 'PASS' });
    expect(qa.judgeIdentity(identity({ a: sum({ median: 0.45 }) })).verdict).toBe('REVIEW');
    expect(qa.judgeIdentity(identity({ a: sum({ median: 0.3, min: 0.2 }) })).verdict).toBe('FAIL');
    expect(qa.judgeIdentity(identity({ a: sum({ min: 0.3, belowThreshold: 1 }) })).verdict).toBe('REVIEW');
    expect(qa.judgeIdentity(identity({ a: sum({ drift: 0.2 }) })).verdict).toBe('REVIEW');
    expect(qa.judgeIdentity(identity({ a: sum({ median: 0.45 }) }), 0.4, { review: 0.44 }).verdict).toBe('PASS');
  });
  it('the clip takes the worst character; an unseen or reference-less character is not a pass', () => {
    const j = qa.judgeIdentity(identity({ a: sum(), b: sum({ median: 0.2, min: 0.1 }) }));
    expect(j.verdict).toBe('FAIL'); expect(j.characters.a.verdict).toBe('PASS'); expect(j.characters.b.verdict).toBe('FAIL');
    expect(qa.judgeIdentity(identity({ a: sum({ framesWithFace: 0, median: null, min: null }) })).verdict).toBe('REVIEW');
    expect(qa.judgeIdentity(identity({ a: sum(), b: { reference: { available: false, reason: 'no face found in the reference image' }, series: [], summary: null } })).verdict).toBe('NOT_MEASURED');
    expect(qa.judgeIdentity({ available: false, reason: 'down' }).verdict).toBe('NOT_MEASURED');
    expect(qa.judgeIdentity(identity({})).verdict).toBe('NOT_MEASURED');
  });
});

describe('judgeAlignment', () => {
  const res = (o: Record<string, unknown> = {}) => ({ ...(qa.camelize(alignBody) as object), available: true, ...o }) as import('@/server/providers/qa-service').AlignResult;
  it('reports coverage and per-word timings against the script', () => {
    const j = qa.judgeAlignment(res(), 'Hi, 007 you!');
    expect(j.coverage).toBeCloseTo(2 / 3); expect(j.verdict).toBe('FAIL');
    expect(j.words).toEqual([{ text: 'Hi,', start: 0.1, end: 0.24, score: 0.91, aligned: true }, { text: '007', start: 0.24, end: 0.5, score: null, aligned: false }, { text: 'you!', start: 0.5, end: 0.64, score: 0.2, aligned: true }]);
    expect(j.unaligned).toEqual(['007']); expect(j.lowScore).toEqual(['you!']);
  });
  it('PASS on full coverage above the floor; REVIEW below the floor or on a word-count mismatch', () => {
    const words = [{ text: 'Hi,', norm: 'hi', start: 0.1, end: 0.24, score: 0.9, aligned: true }, { text: 'you!', norm: 'you', start: 0.5, end: 0.64, score: 0.8, aligned: true }];
    expect(qa.judgeAlignment(res({ words, meanScore: 0.85, unalignedWords: [] }), 'Hi, — you!')).toMatchObject({ ok: true, verdict: 'PASS', coverage: 1 });
    expect(qa.judgeAlignment(res({ words, meanScore: 0.2, unalignedWords: [] }), 'Hi, you!').verdict).toBe('REVIEW');
    expect(qa.judgeAlignment(res({ words, meanScore: 0.85, unalignedWords: [] }), 'Hi, you there!').verdict).toBe('FAIL'); // 2 of 3
    expect(qa.judgeAlignment(res({ words, meanScore: 0.85, unalignedWords: [] }), 'Hello, you!').verdict).toBe('REVIEW');
    expect(qa.judgeAlignment({ available: false, reason: 'down' }, 'x').verdict).toBe('NOT_MEASURED');
  });
  it('counts script words the way the service does', () => {
    expect(qa.scriptWords('  Wait — what?  … شلونك؟ 32 ')).toEqual(['Wait', 'what?', 'شلونك؟', '32']);
  });
});
