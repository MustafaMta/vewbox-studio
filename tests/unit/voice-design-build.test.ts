import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Command, CommandName } from '@/domain/commands';
import type { Asset, Character, StudioState } from '@/domain/types';
import type { Job } from '@/domain/jobs';

/** VOICE IDENTITY V2 THROUGH THE HANDLERS (docs/CONTRACTS-VOICE-IDENTITY-V2.md §2–§4): VOICE_DESIGN and the
 *  AUTOMATIC / DESIGN builds with the design service, the line engines, the transcriber and the speaker encoder faked
 *  — and the real reducers, the real ranking and the real Rule V-DESIGN check on the (fake) file hashes. The fake
 *  speaker encoder makes ECAPA(seed k, a line spoken from seed k) exactly `fake.similarity[k-1]`, so the pick is known. */

const fake = vi.hoisted(() => {
  const hex = (s: string) => { let out = ''; for (let i = 0; out.length < 64; i++) { let h = 0x811c9dc5; for (const ch of `${s}#${i}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } out += h.toString(16).padStart(8, '0'); } return out.slice(0, 64); };
  const unit = (k: number, s = 1) => { const v = new Array<number>(192).fill(0); v[k] = s; if (s < 1) v[100 + k] = Math.sqrt(1 - s * s); return v; };
  return {
    hex, unit,
    state: null as unknown as StudioState,
    events: [] as Array<{ level: string; message: string; data?: Record<string, unknown> }>,
    removed: [] as string[],
    designs: [] as Array<Record<string, unknown>>,
    synth: [] as Array<Record<string, unknown> & { file: string }>,
    asr: [] as Array<{ file: string; language?: string }>,
    durations: [9.6, 9.3, 8.5] as number[],
    similarity: [0.66, 0.74, 0.7] as number[],
    designText: '',
    srcSha: new Map<string, string>(),
    srcCandidate: new Map<string, number>(),
    libSha: new Map<string, string>(),
    candidateOf: new Map<string, number>(),
    textOf: new Map<string, string>(),
    refOf: new Map<string, string>(),
    tags: new Map<string, Record<string, string>>(),
    engineFiles: new Set<string>(),
    candidateHeard: null as null | ((k: number, text: string) => string),
    previewHeard: null as null | ((k: number, text: string) => string),
    heard: null as null | ((text: string) => string),
  };
});

vi.mock('@/server/studio/engine', async () => {
  const { runCommand } = await import('@/domain/commands');
  type Spec = { name: CommandName; args: unknown[] };
  const stamp = (list: Spec[], opts: { seed?: string; at?: string } = {}) => { const s = opts.seed ?? `b-${Math.random().toString(36).slice(2)}`; const at = opts.at ?? new Date().toISOString(); return list.map((c, i) => ({ ...c, seed: `${s}-${i}`, at }) as Command); };
  const apply = async (cmds: Command[]) => { let s = fake.state; const results: unknown[] = []; for (const c of cmds) { const r = runCommand(s, c); s = r.state; results.push(r.result ?? null); } fake.state = s; return results; };
  return { readState: async () => ({ state: fake.state, version: 1, hash: 'h' }), command: async (name: CommandName, args: unknown[]) => (await apply(stamp([{ name, args }])))[0], commands: async (list: Spec[], _o?: string, opts?: { seed?: string; at?: string }) => apply(stamp(list, opts)), stampCommands: stamp, applyCommands: async () => { throw new Error('unused'); }, notifyJobs: async () => {}, notifyChange: async () => {}, currentVersion: async () => 1 };
});
vi.mock('@/server/media', () => ({
  // a file moved into the library keeps its bytes: its sha256 is the one it had (a design file's is the service's)
  adoptFile: async (id: string, src: string) => {
    const relPath = `audio/${id}.wav`; const absPath = `/lib/${relPath}`;
    const sha256 = fake.srcSha.get(src) ?? fake.hex(src);
    fake.libSha.set(absPath, sha256);
    if (fake.srcCandidate.has(src)) fake.candidateOf.set(absPath, fake.srcCandidate.get(src)!);
    if (fake.textOf.has(src)) { fake.textOf.set(absPath, fake.textOf.get(src)!); fake.refOf.set(absPath, fake.refOf.get(src)!); }
    return { relPath, absPath, bytes: 1000, mime: 'audio/wav', kind: 'AUDIO', ext: 'wav', sha256, probe: { hasAudio: true, hasVideo: false, durationSeconds: 2.5, sampleRate: 24000, channels: 1 } };
  },
  assetFromStored: (id: string, stored: { kind: Asset['kind']; mime: string; bytes: number; sha256: string; relPath: string; probe?: { durationSeconds?: number } }, meta: { label: string; tags: string[]; origin: Asset['origin']; jobId?: string; provenance?: Record<string, unknown>; tier?: Asset['tier'] }) => ({ id, kind: stored.kind, src: `/api/media/${id}`, label: meta.label, tags: meta.tags, sample: false, origin: meta.origin, mimeType: stored.mime, bytes: stored.bytes, sha256: stored.sha256, durationSeconds: stored.probe?.durationSeconds, provenance: { ...(meta.provenance ?? {}), path: stored.relPath }, jobId: meta.jobId, ...(meta.tier ? { tier: meta.tier } : {}) }),
  fileFor: (a: { path: string }) => `/lib/${a.path}`, assetFile: (a: { sample?: boolean; src: string; provenance?: Record<string, unknown> }) => `/lib/${a.sample ? a.src.replace(/^\/+/, '') : String(a.provenance?.path ?? '')}`, removeFile: async (rel: string) => { fake.removed.push(rel); }, ffprobe: async () => ({ hasAudio: true, hasVideo: false, durationSeconds: 2 }), libraryRoot: () => '/lib', assertSafeId: (x: string) => x, storeBuffer: async () => { throw new Error('unused'); },
  // the file as it hashes NOW (a test changes it to model a swapped file)
  sha256File: async (file: string) => fake.libSha.get(file) ?? 'missing',
}));
vi.mock('@/server/media/ffmpeg', () => ({ tmpDir: async (name: string) => `/tmp/${name}`, ffmpeg: async () => { throw new Error('ffmpeg must not run in this test'); } }));
vi.mock('@/server/media/voice-check', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/media/voice-check')>()),
  engineOutputTag: async (file: string) => (fake.engineFiles.has(file) ? 'vewbox-tts indextts · synthetic speech; not a voice reference' : null),
  formatTags: async (file: string) => fake.tags.get(file) ?? {},
  loudness: async () => ({ integratedLufs: -20.1, truePeakDbtp: -1.5, loudnessRange: 3, threshold: -30 }),
  clipping: async () => ({ clippedSamples: 0, totalSamples: 1000, ratio: 0, flatFactor: 0, peakDbfs: -1.5 }),
}));
vi.mock('@/server/providers/speech', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/providers/speech')>()),
  synthesize: async (i: Record<string, unknown>, dir: string) => {
    const file = `${dir}/line-${fake.synth.length + 1}.wav`;
    fake.synth.push({ ...i, file }); fake.textOf.set(file, String(i.text)); fake.refOf.set(file, String(i.referenceWav));
    return { file, sampleRate: 24000, durationSeconds: 2.5, engine: i.engine as string, model: `${i.engine}-v1`, ms: 10, engineVersion: 'fake', params: {} };
  },
  // the fake listener: a candidate says the design text, a line what it was given — unless a test says otherwise
  transcribe: async (file: string, opts: { language?: string } = {}) => {
    fake.asr.push({ file, language: opts.language });
    const k = fake.candidateOf.get(file);
    let text = '';
    if (k !== undefined) text = fake.candidateHeard ? fake.candidateHeard(k, fake.designText) : fake.designText;
    else if (fake.textOf.has(file)) { const t = fake.textOf.get(file)!; const from = fake.candidateOf.get(fake.refOf.get(file) ?? ''); text = from !== undefined && fake.previewHeard ? fake.previewHeard(from, t) : fake.heard ? fake.heard(t) : t; }
    return { language: opts.language ?? 'en', languageProbability: 0.99, duration: 2.5, text, segments: [], ms: 5, model: 'fake-whisper' };
  },
  unloadTts: async () => {}, unloadAsr: async () => {},
}));
vi.mock('@/server/providers/voice-design', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/providers/voice-design')>()),
  designVoice: async (i: { description: string; text: string; language: 'EN' | 'AR'; seed?: number; n?: number; designId: string }, dir: string) => {
    fake.designs.push(i);
    fake.designText = i.text;
    const seed0 = i.seed ?? 500;
    const n = i.n ?? 3;
    const candidates = fake.durations.slice(0, n).map((d, k) => {
      const ref = `${dir}/${i.designId}-c${k + 1}-24k.wav`; const nat = `${dir}/${i.designId}-c${k + 1}-48k.wav`;
      fake.srcSha.set(ref, fake.hex(ref)); fake.srcSha.set(nat, fake.hex(nat)); fake.srcCandidate.set(ref, k + 1);
      const f = (file: string, rate: number) => ({ file, sampleRate: rate, durationSeconds: d, bytes: 1000, sha256: fake.hex(file), truePeakDbtp: -1, inputTruePeakDbtp: 0, gainReductionDb: -1, limitedSamples: 0, trimDb: 0, lufs: -20, ebur128TruePeakDbtp: -1, clippedSamples: 0 });
      return { index: k + 1, seed: seed0 + k, generationMs: 1000, native: f(nat, 48000), reference: f(ref, 24000), embedding: fake.unit(k + 1), staticGainDb: 1 };
    });
    return { designId: i.designId, engine: 'voxcpm2', model: 'openbmb/VoxCPM2', engineVersion: 'voxcpm 2.0.3 (fake)', language: i.language, description: i.description, text: i.text, seed: seed0, seeds: candidates.map((c) => c.seed), params: { seed: seed0, n, cfg_value: 2, inference_timesteps: 10, loudness_target: -20 }, ms: 100, candidates, similarity: candidates.map((_, a) => candidates.map((__, b) => (a === b ? 1 : 0.5))), similarityModel: 'speechbrain/spkrec-ecapa-voxceleb', label: 'Studio-designed synthetic voice — not a real person' };
  },
  // ECAPA: a seed is unit(k); a line spoken from seed k sits at cosine fake.similarity[k-1] from it
  embedVoice: async (file: string) => {
    const k = fake.candidateOf.get(file);
    const from = fake.candidateOf.get(fake.refOf.get(file) ?? '');
    const embedding = k !== undefined ? fake.unit(k) : from !== undefined ? fake.unit(from, fake.similarity[from - 1]) : fake.unit(60);
    return { embedding, model: 'speechbrain/spkrec-ecapa-voxceleb', version: 'fake', durationSeconds: 2.5 };
  },
  unloadDesign: async () => {},
}));
vi.mock('@/server/env', () => ({ env: () => ({ MINIMAX_API_KEY: '', MINIMAX_SPEECH_MODEL: 'speech-2.8-hd', TTS_URL: 'http://tts', TTS_HABIBI_URL: 'http://habibi', TTS_DESIGN_URL: 'http://design', ASR_URL: 'http://asr', CODE_VERSION: 'test' }) }));
vi.mock('@/server/jobs/queue', () => ({ recordMetric: async () => {}, enqueue: async () => { throw new Error('unused'); }, getJob: async () => undefined, listJobs: async () => [] }));
vi.mock('@/server/org/runs', () => ({ recordQaReport: async () => 'qa', recordHandoff: async () => 'h', studioEvent: async () => {} }));
vi.mock('@/worker/gpu', () => ({ registerUnloader: () => {}, gpuLease: async (_f: string, _mb: number, fn: () => Promise<unknown>) => fn() }));

import { seed } from '@/domain/sample';
import { addAsset, addVoiceRecording } from '@/domain/actions';
import { CALIBRATION_TEXT, DESIGN_LABEL, IRAQI_NEEDS_RECORDING, MSA_ACCENT_PENDING, PREVIEW_SENTENCES, describeVoiceFromProfile } from '@/domain/voice-identity';
import { judgeHeard, proofLineFor, shouldRegenerate, voiceBuild, voicePreview, voiceSeedOf } from '@/worker/handlers/voice';
import { voiceDesign } from '@/worker/handlers/voice-design';
import type { HandlerContext } from '@/worker/handlers';

const ch = (id: string): Character => fake.state.characters.find((c) => c.id === id)!;
const asset = (id: string) => fake.state.assets.find((a) => a.id === id)!;
const CONSENT = { statement: 'MY_VOICE' as const, by: 'PRODUCER' as const, at: '2026-10-03T00:00:00.000Z' };
const ctxFor = (job: Partial<Job> & { payload: Record<string, unknown> }): HandlerContext => ({
  job: { id: 'job-v2', type: 'VOICE_BUILD', status: 'PREPARING', priority: 0, attempts: 1, maxAttempts: 1, cancelRequested: false, createdAt: 'x', updatedAt: 'x', ...job } as Job,
  log: { info() {}, warn() {}, error() {}, debug() {}, child() { return this; } } as unknown as HandlerContext['log'], workerId: 'w', agent: { id: 'voice-casting', name: 'Voice', department: 'CASTING', tools: [] } as unknown as HandlerContext['agent'], runId: 'run',
  tool: (_id, fn) => fn(), activity: async () => {}, checkpoint: async () => {}, progress: async () => {}, event: async (level, message, data) => { fake.events.push({ level, message, data }); }, gpu: async (_f, _mb, fn) => fn(),
});
/** nour, unused, with no voice at all, speaking a language */
const fresh = (language: 'EN' | 'AR', dialect?: 'MSA' | 'IRAQI_BAGHDADI', allowDesignedIraqi = false) => {
  const s = seed();
  fake.state = { ...s, settings: { ...s.settings, voice: { allowDesignedIraqi } }, characters: s.characters.map((c) => (c.id === 'nour' ? { ...c, language, dialect, usage: { known: true, videos: [] }, voice: { pitch: 'LOW', pace: 'MEASURED', timbre: 'warm', notes: '', samples: [] } } : c)) };
};
const seedPath = (assetId: string) => `/lib/audio/${assetId}.wav`;

beforeEach(() => {
  Object.assign(fake, { events: [], removed: [], designs: [], synth: [], asr: [], durations: [9.6, 9.3, 8.5], similarity: [0.66, 0.74, 0.7], designText: '', candidateHeard: null, previewHeard: null, heard: null });
  for (const m of [fake.srcSha, fake.srcCandidate, fake.libSha, fake.candidateOf, fake.textOf, fake.refOf, fake.tags]) m.clear();
  fake.engineFiles.clear();
});

describe('AUTOMATIC, English, no recording: ONE designed voice → gates → line-engine previews → proof (first-attempt policy)', () => {
  it('designs ONE voice from the profile with the character\'s seed, previews it through IndexTTS, pins it — and records every number', async () => {
    fresh('EN');
    const seedOfNour = voiceSeedOf(ch('nour'));
    const r = await voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } })) as Record<string, unknown>;
    const c = ch('nour');
    const rec = c.voice.designs![0];
    // 1) the description is the profile's, the text the calibration sentence; ONE loudness-matched voice, from the seed
    //    the character's identity revision gives (never random: a retry makes the same voice)
    expect(fake.designs).toEqual([expect.objectContaining({ description: describeVoiceFromProfile(c), text: CALIBRATION_TEXT.EN, language: 'EN', n: 1, seed: seedOfNour, loudnessTarget: -20, designId: rec.id })]);
    expect(rec).toMatchObject({ mode: 'AUTOMATIC', descriptionSource: 'PROFILE', engine: 'voxcpm2', engineVersion: 'voxcpm 2.0.3 (fake)', lineEngine: 'indextts', label: DESIGN_LABEL, seeds: [seedOfNour], chosen: 1, chosenBy: 'AUTOMATIC', ranking: [1] });
    expect(rec.candidates).toHaveLength(1);
    // 2) the voice stored (24 kHz reference + 48 kHz original), hashed, measured and gated
    const x = rec.candidates[0];
    expect(asset(x.assetId)).toMatchObject({ origin: 'GENERATED', sha256: x.sha256, provenance: expect.objectContaining({ designId: rec.id, candidate: 1, label: DESIGN_LABEL }) });
    expect(asset(x.nativeAssetId!).sha256).toBe(x.nativeSha256);
    expect(x).toMatchObject({ measured: { cer: 0, coverage: 1, lufs: -20.1, truePeakDbtp: -1.5, clippedSamples: 0, asrModel: 'fake-whisper' }, gate: { ok: true, reasons: [] } });
    // 3) two preview sentences through the line engine, each heard back, ECAPA(seed, rendering) measured
    expect(x.previews!.map((p) => [p.text, p.engine, p.cosine, p.cer, p.coverage])).toEqual(PREVIEW_SENTENCES.EN.map((t) => [t, 'indextts', fake.similarity[0], 0, 1]));
    for (const p of x.previews!) expect(asset(p.assetId!)).toMatchObject({ tier: 'RAW', tags: ['voice', 'design', 'preview'] });
    // the previews and the proof were spoken with the parameters that were pinned: 2 previews + 1 proof
    const id = c.voice.identity!;
    expect(id.params.seed).toBe(seedOfNour);
    expect(rec.lineParams).toEqual({ speed: 1, emotionAlpha: 1, seed: id.params.seed });
    expect(fake.synth).toHaveLength(3);
    expect(fake.synth.every((s) => s.seed === id.params.seed && s.engine === 'indextts')).toBe(true);
    // 4) the identity: designed, its seed's sha256 pinned, the proof measured; nothing claims naturalness
    expect(id).toMatchObject({ origin: 'DESIGNED', mode: 'AUTOMATIC', designId: rec.id, seedSha256: x.sha256, referenceAssetId: x.assetId, referenceText: CALIBRATION_TEXT.EN, status: 'ACTIVE', dialectStatus: 'NOT_APPLICABLE', evaluation: { cer: 0, coverage: 1, lufs: -20.1, truePeakDbtp: -1.5, clipped: 0, seedToLineSimilarity: 0.66 } });
    expect(id.referenceSampleId).toBeUndefined();
    expect(fake.synth.at(-1)).toMatchObject({ referenceWav: seedPath(x.assetId), text: 'Hello. My name is Nour, and this is my voice.' });
    expect([asset(x.assetId).tier, asset(x.nativeAssetId!).tier]).toEqual(['SECONDARY', 'SECONDARY']);
    expect(r).toMatchObject({ awaitingReview: false, labels: [DESIGN_LABEL, 'naturalness not yet judged by a listener'], design: { designId: rec.id, chosen: 1, ranking: [1] }, evaluation: { seedToLineSimilarity: 0.66 } });
    // the designed voice speaks a requested line from its seed, measured
    const p = await voicePreview(ctxFor({ type: 'VOICE_PREVIEW', payload: { characterId: 'nour', text: 'See you at the harbour.' } })) as Record<string, unknown>;
    expect(fake.synth.at(-1)).toMatchObject({ referenceWav: seedPath(x.assetId), seed: id.params.seed });
    expect(p).toMatchObject({ measured: { seedToLineSimilarity: 0.66, clipped: 0 } });
  });
  it('a designed voice that fails its gates is kept for the producer to hear — never replaced by a second design; nothing is pinned', async () => {
    fresh('EN');
    fake.durations = [12.1];
    const err = await voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } })).catch((e: unknown) => e) as { code: string; failureClass: string; message: string };
    expect(err).toMatchObject({ code: 'PROVIDER', failureClass: 'PROVIDER', message: expect.stringMatching(/The voice designed for Nour did not pass its checks.*12.10 s is over 11.5 s.*kept on design/) });
    expect(fake.designs).toHaveLength(1);
    expect(ch('nour').voice.identity).toBeUndefined();
    const rec = ch('nour').voice.designs![0];
    expect(rec.candidates.map((x) => x.gate.ok)).toEqual([false]);
    expect(rec.candidates[0].previews).toBeUndefined();
    expect(fake.state.assets.some((a) => a.id === rec.candidates[0].assetId)).toBe(true);
    expect(fake.synth).toHaveLength(0);
    expect(fake.removed).toEqual([]);
  });
  it('an infrastructure retry of the build designs from the SAME seed (the same voice, not a second creative attempt)', async () => {
    fresh('EN');
    fake.durations = [12.1];
    await voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } })).catch(() => undefined);
    await voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' }, attempts: 2 })).catch(() => undefined);
    expect(fake.designs).toHaveLength(2);
    expect(fake.designs[1].seed).toBe(fake.designs[0].seed);
  });
});

describe('AUTOMATIC, Arabic', () => {
  it('MSA is designed and stays dialect UNVERIFIED with "Arabic accent not yet listener-verified"', async () => {
    fresh('AR', 'MSA');
    const r = await voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } })) as Record<string, unknown>;
    expect(fake.designs[0]).toMatchObject({ language: 'AR', text: CALIBRATION_TEXT.AR, description: expect.stringMatching(/Modern Standard Arabic/) });
    expect(ch('nour').voice.identity).toMatchObject({ origin: 'DESIGNED', dialectStatus: 'UNVERIFIED', model: 'indextts' });
    expect(fake.synth.filter((s) => PREVIEW_SENTENCES.MSA.includes(s.text as never))).toHaveLength(PREVIEW_SENTENCES.MSA.length);
    expect(r.labels).toEqual([DESIGN_LABEL, MSA_ACCENT_PENDING, 'naturalness not yet judged by a listener']);
  });
  it('Iraqi without an Iraqi recording is refused with the contract’s sentence; nothing is designed', async () => {
    fresh('AR', 'IRAQI_BAGHDADI');
    await expect(voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } }))).rejects.toMatchObject({ code: 'MISSING_REFERENCE', message: IRAQI_NEEDS_RECORDING });
    await expect(voiceDesign(ctxFor({ type: 'VOICE_DESIGN', payload: { characterId: 'nour' } }))).rejects.toMatchObject({ code: 'MISSING_REFERENCE', message: IRAQI_NEEDS_RECORDING });
    expect(fake.designs).toHaveLength(0);
  });
  it('Iraqi from a consented Iraqi recording clones it with Habibi (dialect UNVERIFIED until a listener)', async () => {
    fresh('AR', 'IRAQI_BAGHDADI');
    fake.state = addAsset(fake.state, { id: 'up-iq', kind: 'AUDIO', src: '/api/media/up-iq', label: 'iq.wav', tags: [], sample: false, origin: 'UPLOAD', durationSeconds: 8, provenance: { path: 'audio/up-iq.wav' } }).state;
    fake.state = addAsset(fake.state, { id: 'gen-iqwin', kind: 'AUDIO', src: '/api/media/gen-iqwin', label: 'window', tags: [], sample: false, origin: 'DERIVED', durationSeconds: 7, provenance: { path: 'audio/gen-iqwin.wav' } }).state;
    fake.state = addVoiceRecording(fake.state, 'nour', 'up-iq', 'Baghdad take', { text: 'هلا شلونكم اليوم', consent: CONSENT, provenance: { trimmedAssetId: 'gen-iqwin', window: { from: 0.2, to: 7.2 } } });
    await voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } }));
    expect(fake.designs).toHaveLength(0);
    expect(ch('nour').voice.identity).toMatchObject({ origin: 'UPLOAD_CONSENTED', consent: { statement: 'MY_VOICE' }, model: 'habibi', dialectStatus: 'UNVERIFIED', status: 'ACTIVE' });
    expect(fake.synth[0]).toMatchObject({ engine: 'habibi', referenceWav: '/lib/audio/gen-iqwin.wav', referenceText: 'هلا شلونكم اليوم' });
  });
  it('the allowDesignedIraqi experiment: ONE Arabic seed through Habibi, screened on the four Iraqi probe lines by letter coverage; always REVIEW', async () => {
    fresh('AR', 'IRAQI_BAGHDADI', true);
    const r = await voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } })) as Record<string, unknown>;
    const rec = ch('nour').voice.designs![0];
    expect(rec).toMatchObject({ experiment: 'DESIGNED_IRAQI', lineEngine: 'habibi', rankedBy: expect.stringMatching(/letter coverage/), chosen: 1 });
    const previews = fake.synth.slice(0, -1);
    expect(previews).toHaveLength(PREVIEW_SENTENCES.IRAQI.length);
    expect(previews.every((s) => s.engine === 'habibi' && s.referenceText === CALIBRATION_TEXT.AR)).toBe(true);
    expect([...new Set(previews.map((s) => s.text))]).toEqual([...PREVIEW_SENTENCES.IRAQI]);
    expect(rec.candidates[0].letterCoverageMean).toBe(1);
    expect(ch('nour').voice.identity).toMatchObject({ origin: 'DESIGNED', model: 'habibi', status: 'REVIEW', dialectStatus: 'UNVERIFIED' });
    expect(fake.synth.at(-1)).toMatchObject({ engine: 'habibi', referenceText: CALIBRATION_TEXT.AR });
    expect(r).toMatchObject({ awaitingReview: true, reviewReasons: [expect.stringMatching(/experiment/)] });
  });
});

describe('DESIGN (manual): VOICE_DESIGN → the producer chooses → VOICE_BUILD { mode: DESIGN }', () => {
  it('ONE measured voice with previews and nothing pinned; when the producer uses it, it is pinned with the seed the previews used', async () => {
    fresh('EN');
    const d = await voiceDesign(ctxFor({ type: 'VOICE_DESIGN', payload: { characterId: 'nour', description: 'A bright, quick young woman, about 25, friendly' } })) as { designId: string; recommended: number; candidates: Array<{ index: number; previews: unknown[]; gate: { ok: boolean } }>; notes: string[]; awaitingReview: boolean };
    expect(fake.designs[0]).toMatchObject({ description: 'A bright, quick young woman, about 25, friendly' });
    expect(fake.designs[0]).toMatchObject({ n: 1 });
    expect(d).toMatchObject({ recommended: 1, awaitingReview: false, notes: [DESIGN_LABEL, 'naturalness not yet judged by a listener'] });
    expect(d.candidates.map((x) => x.previews.length)).toEqual([2]);
    // the flat fields the voice panel reads (src/components/character/contract.ts designResultOf)
    expect(d.candidates[0]).toMatchObject({ index: 1, assetId: expect.stringMatching(/^gen-/), duration: 9.6, durationSeconds: 9.6, cer: 0, coverage: 1, lufs: -20.1, passed: true, reasons: [] });
    expect(ch('nour').voice.identity).toBeUndefined();
    const rec = ch('nour').voice.designs![0];
    expect(rec).toMatchObject({ mode: 'DESIGN', descriptionSource: 'PRODUCER' });
    expect(rec.chosen).toBeUndefined();
    await voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'DESIGN', designId: d.designId, candidate: 1 }, id: 'job-v2-design' }));
    const id = ch('nour').voice.identity!;
    expect(id).toMatchObject({ origin: 'DESIGNED', mode: 'DESIGN', referenceAssetId: rec.candidates[0].assetId, seedSha256: rec.candidates[0].sha256, params: { seed: rec.lineParams!.seed }, evaluation: { seedToLineSimilarity: 0.66 } });
    expect(ch('nour').voice.designs![0]).toMatchObject({ chosen: 1, chosenBy: 'PRODUCER' });
  });
  it('a description that names someone is refused before any GPU work (Rule V-DESIGN §4)', async () => {
    fresh('EN');
    await expect(voiceDesign(ctxFor({ type: 'VOICE_DESIGN', payload: { characterId: 'nour', description: 'A warm voice just like Layla' } }))).rejects.toMatchObject({ code: 'INVALID', failureClass: 'INVALID_INPUT', message: expect.stringMatching(/names “Layla”/) });
    await expect(voiceDesign(ctxFor({ type: 'VOICE_DESIGN', payload: { characterId: 'nour', description: 'It sounds like a famous presenter' } }))).rejects.toMatchObject({ message: expect.stringMatching(/sounds like/) });
    expect(fake.designs).toHaveLength(0);
  });
});

describe('Rule V-DESIGN at the clone boundary', () => {
  it('a designed seed whose file no longer hashes to its record, or whose tag names another design, is refused on every path', async () => {
    fresh('EN');
    const d = await voiceDesign(ctxFor({ type: 'VOICE_DESIGN', payload: { characterId: 'nour' } })) as { designId: string };
    const rec = ch('nour').voice.designs![0];
    const seed2 = seedPath(rec.candidates[0].assetId);
    // swapped file: the build from that candidate is refused before anything is spoken
    fake.libSha.set(seed2, 'f'.repeat(64));
    const before = fake.synth.length;
    await expect(voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'DESIGN', designId: d.designId, candidate: 1 } }))).rejects.toMatchObject({ code: 'MISSING_REFERENCE', message: expect.stringMatching(/Rule V-DESIGN.*does not match design/) });
    expect(fake.synth.length).toBe(before);
    expect(ch('nour').voice.identity).toBeUndefined();
    // the right file but a tag naming another design
    fake.libSha.set(seed2, rec.candidates[0].sha256);
    fake.tags.set(seed2, { comment: 'synthetic speech; engine=voxcpm2; designId=vd-someone-else; candidate=1; not a voice reference' });
    await expect(voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'DESIGN', designId: d.designId, candidate: 1 } }))).rejects.toMatchObject({ message: expect.stringMatching(/provenance tag names design vd-someone-else/) });
    // its own tag: accepted; then a swap after pinning stops the voice speaking from it
    fake.tags.set(seed2, { comment: `synthetic speech; engine=voxcpm2; designId=${d.designId}; candidate=1; not a voice reference` });
    await voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'DESIGN', designId: d.designId, candidate: 1 } }));
    expect(ch('nour').voice.identity).toMatchObject({ origin: 'DESIGNED', seedSha256: rec.candidates[0].sha256 });
    fake.libSha.set(seed2, 'e'.repeat(64));
    await expect(voicePreview(ctxFor({ type: 'VOICE_PREVIEW', payload: { characterId: 'nour', text: 'Hello again.' } }))).rejects.toMatchObject({ code: 'MISSING_REFERENCE', message: expect.stringMatching(/Rule V-DESIGN/) });
  });
  it('a tagged synthetic file uploaded as a recording has no design record: refused (the synthetic-tag refusal stays); a recording without consent is CONSENT_REQUIRED', async () => {
    fresh('EN');
    fake.state = addAsset(fake.state, { id: 'up-syn', kind: 'AUDIO', src: '/api/media/up-syn', label: 'syn.wav', tags: [], sample: false, origin: 'UPLOAD', provenance: { path: 'audio/up-syn.wav' } }).state;
    fake.state = addVoiceRecording(fake.state, 'nour', 'up-syn', 'a "recording"', { consent: CONSENT, text: 'hello there' });
    fake.engineFiles.add('/lib/audio/up-syn.wav');
    await expect(voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } }))).rejects.toMatchObject({ code: 'MISSING_REFERENCE', message: expect.stringMatching(/engine output/) });
    fresh('EN');
    fake.state = addAsset(fake.state, { id: 'up-old', kind: 'AUDIO', src: '/api/media/up-old', label: 'old.wav', tags: [], sample: false, origin: 'UPLOAD', provenance: { path: 'audio/up-old.wav' } }).state;
    fake.state = addAsset(fake.state, { id: 'gen-oldwin', kind: 'AUDIO', src: '/api/media/gen-oldwin', label: 'window', tags: [], sample: false, origin: 'DERIVED', durationSeconds: 6, provenance: { path: 'audio/gen-oldwin.wav' } }).state;
    fake.state = addVoiceRecording(fake.state, 'nour', 'up-old', 'old take', { text: 'hello there', provenance: { trimmedAssetId: 'gen-oldwin', window: { from: 0, to: 6 } } });
    const old = ch('nour').voice.samples.at(-1)!;
    await expect(voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } }))).rejects.toMatchObject({ code: 'CONSENT_REQUIRED', failureClass: 'INVALID_INPUT' });
    await expect(voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'REFERENCE', referenceSampleId: old.id } }))).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
    await expect(voicePreview(ctxFor({ type: 'VOICE_PREVIEW', payload: { characterId: 'nour', text: 'Hi.' } }))).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
    expect(fake.designs).toHaveLength(0);
    expect(fake.synth).toHaveLength(0);
    // a voice pinned from it before consent existed keeps speaking (it is never rebuilt from it without consent)
    fake.state = { ...fake.state, characters: fake.state.characters.map((c) => (c.id === 'nour' ? { ...c, voice: { ...c.voice, identity: { provider: 'LOCAL_TTS', model: 'indextts', mode: 'REFERENCE', referenceSampleId: old.id, referenceAssetId: 'up-old', language: 'EN', params: { speed: 1, emotionAlpha: 1, seed: 3 }, status: 'ACTIVE', revision: 1, createdAt: 'x' } } } : c)) };
    await voicePreview(ctxFor({ type: 'VOICE_PREVIEW', payload: { characterId: 'nour', text: 'Hi again.' } }));
    expect(fake.synth.at(-1)).toMatchObject({ referenceWav: '/lib/audio/gen-oldwin.wav', text: 'Hi again.' });
    // ...but a rebuild from it still needs the consent
    await expect(voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'REFERENCE', referenceSampleId: old.id } }))).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
  });
});

describe('the proof sentence', () => {
  it('an Arabic proof names the character only in Arabic — never a Latin name inside an Arabic line', () => {
    expect(proofLineFor({ language: 'EN', name: 'Rana' })).toBe('Hello. My name is Rana, and this is my voice.');
    expect(proofLineFor({ language: 'AR', dialect: 'MSA', name: 'Salim', nameAr: 'سليم' })).toBe('أهلاً بك. اسمي سليم، وهذا صوتي.');
    expect(proofLineFor({ language: 'AR', dialect: 'MSA', name: 'Salim' })).toBe('أهلاً بك. هذا صوتي، وسأقرأ لك اليوم.');
    expect(proofLineFor({ language: 'AR', dialect: 'IRAQI_BAGHDADI', name: 'زهرة' })).toBe('هلا بيك. اني اسمي زهرة، وهذا صوتي.');
    expect(proofLineFor({ language: 'AR', dialect: 'IRAQI_BAGHDADI', name: 'Zahra' })).toBe('هلا بيك. هذا صوتي، شلونك اليوم؟');
  });
});

describe('the voice check for Arabic (contract §4) and «چ» (the Iraqi A/B)', () => {
  it('spacing passes, a wrong word fails, a line failing only on چ-words is REVIEW with the reason, never FAIL', () => {
    expect(judgeHeard('گلتلك لا تتأخر.', 'قلت لك لا تتأخر.', 'AR')).toMatchObject({ status: 'PASS', coverage: 1 });
    const wrong = judgeHeard('هسه وين نروح؟', 'شي ثاني تماما', 'AR');
    expect(wrong.status).toBe('FAIL'); expect(shouldRegenerate(wrong)).toBe(true);
    const ch1 = judgeHeard('باچر نروح', 'باسر نروح', 'AR');
    expect(ch1).toMatchObject({ status: 'REVIEW', ok: false, coverage: 0.5, reasons: ['چ not confirmable by ASR: «باچر» heard «باسر» — a listener decides'] });
    expect(shouldRegenerate(ch1)).toBe(false);
    // چ and another word wrong: the other word decides
    const both = judgeHeard('الچاي حار هواية، انطيني شوية مي بارد.', 'الفاي حار هواية، اعطيني شوية ماي حار.', 'AR');
    expect(both.status).not.toBe('PASS');
    expect(judgeHeard('الچاي حار هواية', 'الفاي بارد خلاص', 'AR').status).toBe('FAIL');
    // English keeps its word coverage
    expect(judgeHeard('Hello there my friend', 'hello there friend', 'EN').coverage).toBe(0.75);
  });
});
