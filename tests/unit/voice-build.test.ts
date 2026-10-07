import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Command, CommandName } from '@/domain/commands';
import type { Asset, Character, StudioState } from '@/domain/types';
import type { Job } from '@/domain/jobs';

/** VOICE_BUILD AND THE LINE HANDLERS with the engines mocked and the studio in memory (the real reducers run under
 *  the fake engine, so the batch semantics are the real ones). Nothing here touches the database, ffmpeg or the GPU. */

const fake = vi.hoisted(() => ({ state: null as unknown as StudioState, events: [] as Array<{ level: string; message: string; data?: Record<string, unknown> }>, removed: [] as string[], synth: [] as Array<Record<string, unknown>>, asr: [] as Array<{ file: string; language?: string }>, asrFails: false, asrHears: null as string | null, asrAppend: '', engineFiles: new Set<string>(), minimaxKey: '', cloned: [] as string[] }));

vi.mock('@/server/studio/engine', async () => {
  const { runCommand } = await import('@/domain/commands');
  type Spec = { name: CommandName; args: unknown[] };
  const stamp = (list: Spec[], opts: { seed?: string; at?: string } = {}) => { const s = opts.seed ?? `b-${Math.random().toString(36).slice(2)}`; const at = opts.at ?? new Date().toISOString(); return list.map((c, i) => ({ ...c, seed: `${s}-${i}`, at }) as Command); };
  const apply = async (cmds: Command[]) => { let s = fake.state; const results: unknown[] = []; for (const c of cmds) { const r = runCommand(s, c); s = r.state; results.push(r.result ?? null); } fake.state = s; return results; };
  return { readState: async () => ({ state: fake.state, version: 1, hash: 'h' }), command: async (name: CommandName, args: unknown[]) => (await apply(stamp([{ name, args }])))[0], commands: async (list: Spec[], _o?: string, opts?: { seed?: string; at?: string }) => apply(stamp(list, opts)), stampCommands: stamp, applyCommands: async () => { throw new Error('unused'); }, notifyJobs: async () => {}, notifyChange: async () => {}, currentVersion: async () => 1 };
});
vi.mock('@/server/media', () => ({
  adoptFile: async (id: string) => ({ relPath: `audio/${id}.wav`, absPath: `/lib/audio/${id}.wav`, bytes: 1000, mime: 'audio/wav', kind: 'AUDIO', ext: 'wav', sha256: 'x', probe: { hasAudio: true, hasVideo: false, durationSeconds: 2.5, sampleRate: 24000, channels: 1 } }),
  assetFromStored: (id: string, stored: { kind: Asset['kind']; mime: string; bytes: number; sha256: string; relPath: string; probe?: { durationSeconds?: number } }, meta: { label: string; tags: string[]; origin: Asset['origin']; jobId?: string; provenance?: Record<string, unknown> }) => ({ id, kind: stored.kind, src: `/api/media/${id}`, label: meta.label, tags: meta.tags, sample: false, origin: meta.origin, mimeType: stored.mime, bytes: stored.bytes, sha256: stored.sha256, durationSeconds: stored.probe?.durationSeconds, provenance: { ...(meta.provenance ?? {}), path: stored.relPath }, jobId: meta.jobId }),
  fileFor: (a: { path: string }) => `/lib/${a.path}`, assetFile: (a: { sample?: boolean; src: string; provenance?: Record<string, unknown> }) => `/lib/${a.sample ? a.src.replace(/^\/+/, '') : String(a.provenance?.path ?? '')}`, removeFile: async (rel: string) => { fake.removed.push(rel); }, ffprobe: async () => ({ hasAudio: true, hasVideo: false, durationSeconds: 2 }), libraryRoot: () => '/lib', assertSafeId: (x: string) => x, storeBuffer: async () => { throw new Error('unused'); },
  sha256File: async () => 'x',
}));
vi.mock('@/server/media/ffmpeg', () => ({ tmpDir: async () => '/tmp/fake', ffmpeg: async () => { throw new Error('ffmpeg must not run in this test'); }, measureLoudness: async () => null }));
// the provenance tag of a file: the files a test marks as engine output carry docker/tts's synthetic-speech tag; the
// level of every line is a fixed measurement (no ffmpeg here)
vi.mock('@/server/media/voice-check', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/media/voice-check')>()),
  engineOutputTag: async (file: string) => (fake.engineFiles.has(file) ? 'vewbox-tts indextts · synthetic speech; engine=indextts; seed=1; not a voice reference' : null),
  formatTags: async () => ({}),
  loudness: async () => ({ integratedLufs: -20.1, truePeakDbtp: -1.5, loudnessRange: 3, threshold: -30 }),
  clipping: async () => ({ clippedSamples: 0, totalSamples: 1000, ratio: 0, flatFactor: 0, peakDbfs: -1.5 }),
}));
// no design engine and no speaker encoder in this file (TTS_DESIGN_URL is not set): a design is NOT_CONFIGURED
vi.mock('@/server/providers/voice-design', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/server/providers/voice-design')>()), unloadDesign: async () => {} }));
vi.mock('@/server/providers/speech', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/providers/speech')>()),
  synthesize: async (i: Record<string, unknown>) => { fake.synth.push(i); return { file: `/tmp/fake/line-${fake.synth.length}.wav`, sampleRate: 24000, durationSeconds: 2.5, engine: i.engine as string, model: `${i.engine}-v1`, ms: 10 }; },
  // the fake listener hears exactly what was last synthesised, unless a test says otherwise (drift) or takes it away (outage)
  transcribe: async (file: string, opts: { language?: string } = {}) => { fake.asr.push({ file, language: opts.language }); if (fake.asrFails) throw new Error('asr is not reachable'); const text = (fake.asrHears ?? String(fake.synth.at(-1)?.text ?? '')) + fake.asrAppend; return { language: opts.language === 'ar' ? 'ar' : 'en', languageProbability: 0.99, duration: 2.5, text, segments: [{ start: 0, end: 2.5, text, words: text.split(' ').map((w, k) => ({ start: k * 0.3, end: k * 0.3 + 0.25, word: w, probability: 0.9 })) }], ms: 5, model: 'fake' }; },
  unloadTts: async () => {}, unloadAsr: async () => {},
}));
vi.mock('@/server/providers/minimax', () => ({ speak: async () => { throw new Error('unused'); }, cloneVoice: async (i: { file: string }) => { fake.cloned.push(i.file); throw new Error('stop after the clone request'); } }));
vi.mock('@/server/env', () => ({ env: () => ({ MINIMAX_API_KEY: fake.minimaxKey, MINIMAX_SPEECH_MODEL: 'speech-2.8-hd', TTS_URL: 'http://tts', TTS_HABIBI_URL: 'http://habibi', ASR_URL: 'http://asr', CODE_VERSION: 'test' }) }));
vi.mock('@/server/jobs/queue', () => ({ recordMetric: async () => {}, enqueue: async () => { throw new Error('unused'); }, getJob: async () => undefined, listJobs: async () => [] }));
vi.mock('@/server/org/runs', () => ({ recordQaReport: async () => 'qa', recordHandoff: async () => 'h', studioEvent: async () => {} }));
vi.mock('@/worker/gpu', () => ({ registerUnloader: () => {}, gpuLease: async (_f: string, _mb: number, fn: () => Promise<unknown>) => fn() }));

import { seed } from '@/domain/sample';
import { addAsset, addVoiceRecording, addVoiceSample, selectVoiceSample, updateCharacter } from '@/domain/actions';
import { judgeHeard, lineLanguage, lineRecordingCurrent, lineScript, minimaxCloneProblem, pickReference, routeLine, shouldRegenerate, speakLine, speedForPace, voiceBuild, dialogueAudio } from '@/worker/handlers/voice';
import { lineScript as suiteLineScript, routeLine as suiteRoute } from '@/server/providers/speech';
import type { HandlerContext } from '@/worker/handlers';

const ch = (id: string): Character => fake.state.characters.find((c) => c.id === id)!;
const CONSENT = { statement: 'MY_VOICE' as const, by: 'PRODUCER' as const, at: '2026-10-03T00:00:00.000Z' };
const ctxFor = (job: Partial<Job> & { payload: Record<string, unknown> }): HandlerContext => ({
  job: { id: 'job-vb', type: 'VOICE_BUILD', status: 'PREPARING', priority: 0, attempts: 1, maxAttempts: 1, cancelRequested: false, createdAt: 'x', updatedAt: 'x', ...job } as Job,
  log: { info() {}, warn() {}, error() {}, debug() {}, child() { return this; } } as unknown as HandlerContext['log'], workerId: 'w', agent: { id: 'voice-casting', name: 'Voice', department: 'CASTING', tools: [] } as unknown as HandlerContext['agent'], runId: 'run',
  tool: (_id, fn) => fn(), activity: async () => {}, checkpoint: async () => {}, progress: async () => {}, event: async (level, message, data) => { fake.events.push({ level, message, data }); }, gpu: async (_f, _mb, fn) => fn(),
});

/** nour with one real upload (and its stored 24 kHz window, so no ffmpeg runs), optionally with the transcript. */
function prepare(opts: { language?: 'EN' | 'AR'; dialect?: 'IRAQI_BAGHDADI' | 'MSA'; text?: string; windowStored?: boolean } = {}) {
  let s = seed();
  s = addAsset(s, { id: 'up-ref', kind: 'AUDIO', src: '/api/media/up-ref', label: 'ref.wav', tags: [], sample: false, origin: 'UPLOAD', durationSeconds: 6.8, provenance: { path: 'audio/up-ref.wav' } }).state;
  if (opts.windowStored !== false) s = addAsset(s, { id: 'gen-win', kind: 'AUDIO', src: '/api/media/gen-win', label: 'window', tags: [], sample: false, origin: 'DERIVED', durationSeconds: 5.2, provenance: { path: 'audio/gen-win.wav' } }).state;
  s = addVoiceRecording(s, 'nour', 'up-ref', 'Studio take', { text: opts.text, consent: CONSENT, provenance: opts.windowStored !== false ? { trimmedAssetId: 'gen-win', window: { from: 0.3, to: 5.5 } } : undefined });
  if (opts.language) s = updateCharacter(s, 'nour', { language: opts.language, dialect: opts.dialect });
  fake.state = s;
  return ch('nour').voice.samples.at(-1)!;
}

beforeEach(() => { fake.events = []; fake.removed = []; fake.synth = []; fake.asr = []; fake.asrFails = false; fake.asrHears = null; fake.asrAppend = ''; fake.engineFiles = new Set(); fake.minimaxKey = ''; fake.cloned = []; });

describe('routing parity (pure): the worker routes with THE rule the Iraqi suite uses', () => {
  const iraqi = { language: 'AR', dialect: 'IRAQI_BAGHDADI', voice: { pitch: 'MID', pace: 'MEASURED', timbre: '', notes: '', samples: [], identity: { provider: 'LOCAL_TTS', model: 'habibi', mode: 'REFERENCE', language: 'AR', dialect: 'IRAQI_BAGHDADI', params: { speed: 1, emotionAlpha: 1 }, status: 'ACTIVE', revision: 1, createdAt: 'x' } } } as unknown as Character;
  const en = { ...iraqi, language: 'EN', dialect: undefined, voice: { ...iraqi.voice, identity: { ...iraqi.voice.identity!, model: 'indextts', language: 'EN', dialect: undefined } } } as unknown as Character;
  const none = { ...iraqi, voice: { ...iraqi.voice, identity: undefined } } as unknown as Character;
  const LINES = ['هلا بيك', 'Hello friend', 'هلا بيك Google', 'شغّل الـ wifi وافتح الـ app', 'I said مرحبا to her twice', 'Hello، world', 'Hello, my friend، see you at ٢٥ past', '…', '12:30', 'A سمير', ''];

  it('worker routeLine (adapter) == speech.routeLine (the suite’s) for every line and every character: same engine, same heard language', () => {
    for (const c of [iraqi, en, none]) for (const text of LINES) {
      const pinned = c.voice.identity?.model as 'habibi' | 'indextts' | undefined;
      const rule = suiteRoute(text, c.language, c.dialect, pinned);
      const worker = routeLine(c, text);
      expect({ text, engine: worker.engine, language: worker.language, script: worker.script }).toEqual({ text, engine: rule.engine, language: rule.asrLanguage === 'ar' ? 'AR' : 'EN', script: rule.script });
      expect(Boolean(worker.fallback)).toBe(Boolean(rule.fallback));
      expect(lineLanguage(text, c.language)).toBe(suiteRoute(text, c.language).asrLanguage === 'ar' ? 'AR' : 'EN');
    }
    expect(lineScript).toBe(suiteLineScript); // one implementation, re-exported
  });
  it('an Arabic comma or Arabic digits do not flip an English line; a mixed line is heard in the language most of it is in', () => {
    expect(routeLine(iraqi, 'Hello، world')).toMatchObject({ script: 'LATIN', engine: 'indextts', language: 'EN' });
    expect(routeLine(en, 'Hello, my friend، see you at ٢٥ past')).toMatchObject({ script: 'LATIN', language: 'EN' });
    expect(lineLanguage('Hello، world', 'AR')).toBe('EN');
    expect(routeLine(iraqi, 'شغّل الـ wifi وافتح الـ app')).toMatchObject({ engine: 'indextts', language: 'AR' });
    expect(routeLine(en, 'I said مرحبا to her twice')).toMatchObject({ script: 'MIXED', engine: 'indextts', language: 'EN' });
  });
  it('an Arabic line goes to the pinned Arabic engine, Latin-only and mixed to IndexTTS with the fallback named; the pinned model is untouched', () => {
    expect(routeLine(iraqi, 'هلا بيك')).toMatchObject({ engine: 'habibi', language: 'AR' }); expect(routeLine(iraqi, 'هلا بيك').fallback).toBeUndefined();
    expect(routeLine(iraqi, 'Hello friend')).toMatchObject({ engine: 'indextts', language: 'EN' }); expect(routeLine(iraqi, 'Hello friend').fallback).toMatch(/indextts/);
    expect(routeLine(iraqi, 'هلا بيك Google').fallback).toMatch(/mixed/);
    expect(routeLine(iraqi, '…')).toMatchObject({ engine: 'habibi', language: 'AR' });
    expect(iraqi.voice.identity!.model).toBe('habibi');
    // an English character (indextts pinned) given an Arabic line: its own engine, heard in Arabic
    expect(routeLine(en, 'شلونك')).toMatchObject({ engine: 'indextts', language: 'AR' });
    // no identity yet: the dialect decides (and a Latin line names its switch away from the Iraqi engine)
    expect(routeLine(none, 'هلا')).toMatchObject({ engine: 'habibi' }); expect(routeLine(none, 'hi there')).toMatchObject({ engine: 'indextts' });
    // a STALE identity of another language does not decide
    const switched = { ...en, language: 'AR', dialect: 'IRAQI_BAGHDADI' } as unknown as Character;
    expect(routeLine(switched, 'هلا')).toMatchObject({ engine: 'habibi' });
    expect(speedForPace('SLOW')).toBe(0.9); expect(speedForPace('MEASURED')).toBe(1); expect(speedForPace('QUICK')).toBe(1.12);
  });
});

describe('the CER gate (contract §1.4)', () => {
  it('a line heard with every word but far off in characters is not passed; a dialect spelling is', () => {
    const padded = judgeHeard('Hello. My name is Nour, and this is my voice.', 'Hello. My name is Nour, and this is my voice. thank you so much for watching', 'EN');
    expect(padded.coverage).toBe(1); expect(padded.cer).toBeGreaterThan(0.15);
    expect(padded).toMatchObject({ ok: false }); expect(padded.status).not.toBe('PASS'); expect(padded.reasons.join(' ')).toMatch(/CER/);
    const iraqiSpelling = judgeHeard('ليش ما گلتلي من البداية؟', 'ليش ماقلتلي من البداية؟', 'AR');
    expect(iraqiSpelling).toMatchObject({ ok: true, status: 'PASS', cer: 0, coverage: 1 });
    expect(judgeHeard('هسه وين نروح؟', 'شي ثاني تماما', 'AR')).toMatchObject({ ok: false, status: 'FAIL' });
    expect(shouldRegenerate(judgeHeard('هسه وين نروح؟', 'شي ثاني تماما', 'AR'))).toBe(true);
    expect(shouldRegenerate(padded)).toBe(padded.status === 'FAIL');
    expect(shouldRegenerate(null)).toBe(false);
    // a take's clip passes at a lower coverage than a recorded line
    expect(judgeHeard('one two three four five six seven eight nine ten', 'one two three four five six seven eight nina tin', 'EN', 'take').status).toBe('PASS');
    expect(judgeHeard('one two three four five six seven eight nine ten', 'one two three four five six seven eight nina tin', 'EN', 'line').status).toBe('REVIEW');
  });
});

describe('pickReference (pure): identity reference → selected upload → any upload; never GENERATED or SAMPLE', () => {
  it('follows the candidate order and refuses when only generated lines and bundled samples exist', () => {
    prepare();
    const nour = ch('nour');
    expect(pickReference(nour, fake.state.assets)).toMatchObject({ asset: { id: 'up-ref' }, via: 'UPLOADED' });
    // the proof line is selected (the old defect): still the upload
    fake.state = addVoiceSample(fake.state, 'nour', { id: 'proof', label: 'proof', assetId: 'gen-win', source: 'GENERATED' }).state;
    const withProofSelected = { ...ch('nour'), voice: { ...ch('nour').voice, selectedSampleId: 'proof' } };
    expect(pickReference(withProofSelected, fake.state.assets)).toMatchObject({ asset: { id: 'up-ref' }, via: 'UPLOADED' });
    // the identity's reference wins over the selection
    fake.state = addAsset(fake.state, { id: 'up-2', kind: 'AUDIO', src: '/api/media/up-2', label: 'second', tags: [], sample: false, origin: 'UPLOAD' }).state;
    fake.state = addVoiceRecording(fake.state, 'nour', 'up-2', 'second', { consent: CONSENT });
    const second = ch('nour').voice.samples.at(-1)!;
    fake.state = selectVoiceSample(fake.state, 'nour', second.id);
    expect(pickReference(ch('nour'), fake.state.assets)).toMatchObject({ asset: { id: 'up-2' }, via: 'SELECTED', kind: 'CONSENTED' });
    const pinned = { ...ch('nour'), voice: { ...ch('nour').voice, identity: { provider: 'LOCAL_TTS', model: 'indextts', mode: 'REFERENCE', referenceAssetId: 'up-ref', language: 'EN', params: { speed: 1, emotionAlpha: 1 }, status: 'ACTIVE', revision: 1, createdAt: 'x' } } } as Character;
    expect(pickReference(pinned, fake.state.assets)).toMatchObject({ asset: { id: 'up-ref' }, via: 'IDENTITY' });
    expect(pickReference(ch('nour'), fake.state.assets, { sampleId: 'proof' })).toBeNull();
    expect(pickReference(ch('nour'), fake.state.assets, { sampleId: 'v-low' })).toBeNull();
    expect(pickReference(ch('nour'), fake.state.assets, { sampleId: second.id })).toMatchObject({ asset: { id: 'up-2' }, via: 'REQUESTED' });
    // only samples and a generated line → nothing to clone from
    const onlyGenerated = { ...ch('nour'), voice: { ...ch('nour').voice, selectedSampleId: 'proof', samples: ch('nour').voice.samples.filter((x) => x.source !== 'UPLOADED') } } as Character;
    expect(pickReference(onlyGenerated, fake.state.assets)).toBeNull();
    // the upload's file is gone
    expect(pickReference(ch('nour'), fake.state.assets.map((a) => (a.kind === 'AUDIO' ? { ...a, unavailable: true } : a)))).toBeNull();
  });
});

describe('VOICE_BUILD', () => {
  it('writes the identity and the proof in one batch after the audio exists; the proof is a GENERATED sample and never selected; the reference is the upload', async () => {
    const uploaded = prepare({ language: 'EN', text: 'hello there this is my voice' });
    const before = ch('nour');
    const r = await voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } }));
    const after = ch('nour');
    expect(r?.awaitingReview).toBe(false);
    expect(after.voice.identity).toMatchObject({ provider: 'LOCAL_TTS', model: 'indextts', mode: 'AUTOMATIC', status: 'ACTIVE', revision: 1, referenceSampleId: uploaded.id, referenceAssetId: 'up-ref', referenceWindow: { from: 0.3, to: 5.5, assetId: 'gen-win' }, referenceText: 'hello there this is my voice', jobId: 'job-vb', params: { speed: 1, emotionAlpha: 1 } });
    expect(after.voice.identity!.params.seed).toBeTypeOf('number');
    const proof = after.voice.samples.find((x) => x.id === after.voice.identity!.proof!.sampleId)!;
    expect(proof).toMatchObject({ source: 'GENERATED', assetId: after.voice.identity!.proof!.assetId, jobId: 'job-vb' });
    expect(after.voice.selectedSampleId).toBe(before.voice.selectedSampleId); // not the proof
    expect(after.voice.selectedSampleId).not.toBe(proof.id);
    expect(fake.state.assets.some((a) => a.id === proof.assetId && a.origin === 'GENERATED')).toBe(true);
    expect(pickReference(after, fake.state.assets)).toMatchObject({ asset: { id: 'up-ref' }, via: 'IDENTITY' });
    // the engine was given the stored window, the pinned speed and seed; the line was verified in its own language
    expect(fake.synth).toHaveLength(1);
    expect(fake.synth[0]).toMatchObject({ engine: 'indextts', language: 'EN', referenceWav: '/lib/audio/gen-win.wav', speed: 1, seed: after.voice.identity!.params.seed });
    expect(fake.asr).toEqual([{ file: '/tmp/fake/line-1.wav', language: 'en' }]);
  });
  it('a failed synthesis leaves the character byte-identical: no identity, no sample, no asset', async () => {
    prepare();
    const before = JSON.stringify(fake.state);
    const { synthesize } = await import('@/server/providers/speech');
    const spy = vi.spyOn(await import('@/server/providers/speech'), 'synthesize').mockRejectedValueOnce(Object.assign(new Error('tts is away'), { code: 'UNAVAILABLE' }));
    await expect(voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } }))).rejects.toThrow(/tts is away/);
    spy.mockRestore(); void synthesize;
    expect(JSON.stringify(fake.state)).toBe(before);
  });
  it('a refused batch (the identity command fails) removes the stored proof file and leaves the character unchanged', async () => {
    prepare();
    // make nour voice-locked with an identity after the audio exists: setVoiceIdentity refuses, the batch rolls back
    const before = JSON.stringify(fake.state);
    const { commands } = await import('@/server/studio/engine');
    const spy = vi.spyOn(await import('@/server/studio/engine'), 'commands').mockImplementationOnce(async (list, origin, opts) => { throw Object.assign(new Error('refused in batch'), { code: 'VOICE_LOCKED', list, origin, opts }); });
    await expect(voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } }))).rejects.toThrow(/refused in batch/);
    spy.mockRestore(); void commands;
    expect(fake.removed.length).toBe(1);
    expect(JSON.stringify(fake.state)).toBe(before);
  });
  it('AUTOMATIC with no recording designs the voice (here: no design engine → NOT_CONFIGURED, nothing written); an Iraqi one is refused with the contract’s sentence; REFERENCE to a non-upload is MISSING_REFERENCE', async () => {
    fake.state = seed();
    const before = JSON.stringify(fake.state);
    await expect(voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } }))).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    expect(JSON.stringify(fake.state)).toBe(before);
    fake.state = updateCharacter(seed(), 'nour', { dialect: 'IRAQI_BAGHDADI' });
    await expect(voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } }))).rejects.toMatchObject({ code: 'MISSING_REFERENCE', message: 'Iraqi voices are cloned from a real Iraqi recording — record or upload 5–12 seconds of the voice.' });
    expect(fake.synth).toHaveLength(0);
    prepare();
    await expect(voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'REFERENCE', referenceSampleId: 'v-low' } }))).rejects.toMatchObject({ failureClass: 'MISSING_REFERENCE' });
    expect(ch('nour').voice.identity).toBeUndefined();
    expect(fake.synth).toHaveLength(0);
  });
  it('a character that spoke in a video with its chosen recording is re-voiced from nothing else (finding 8): REFERENCE to another upload is VOICE_LOCKED, AUTOMATIC clones the chosen one', async () => {
    const first = prepare({ text: 'hello there this is my voice' });
    fake.state = addAsset(fake.state, { id: 'up-2', kind: 'AUDIO', src: '/api/media/up-2', label: 'second', tags: [], sample: false, origin: 'UPLOAD', provenance: { path: 'audio/up-2.wav' } }).state;
    fake.state = addVoiceRecording(fake.state, 'nour', 'up-2', 'second take', { text: 'another take of my voice here' });
    const second = ch('nour').voice.samples.at(-1)!;
    fake.state = selectVoiceSample(fake.state, 'nour', first.id);
    fake.state = { ...fake.state, characters: fake.state.characters.map((x) => (x.id === 'nour' ? { ...x, usage: { known: true, videos: [{ productionId: 'p', productionTitle: 'P', shotId: 's', shotLabel: '1.1', takeId: 't', takeLabel: 'A', recordedAt: 'x', status: 'IN_TAKE' as const }] } } : x)) };
    const before = JSON.stringify(fake.state);
    await expect(voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'REFERENCE', referenceSampleId: second.id } }))).rejects.toMatchObject({ code: 'VOICE_LOCKED' });
    expect(fake.synth).toHaveLength(0);
    expect(JSON.stringify(fake.state)).toBe(before);
    await voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } }));
    expect(ch('nour').voice.identity).toMatchObject({ referenceSampleId: first.id, referenceAssetId: 'up-ref' });
  });
  it('an "upload" that is the studio’s own engine output (tagged by docker/tts) is never cloned from, whatever path brought it in', async () => {
    prepare({ text: 'hello there this is my voice' });
    fake.engineFiles.add('/lib/audio/up-ref.wav');
    const before = JSON.stringify(fake.state);
    await expect(voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } }))).rejects.toMatchObject({ code: 'MISSING_REFERENCE', message: expect.stringMatching(/engine output/) });
    expect(fake.synth).toHaveLength(0);
    expect(JSON.stringify(fake.state)).toBe(before);
  });
  it('Habibi path: the reference text comes from the stored sample transcript and the reference is never transcribed', async () => {
    prepare({ language: 'AR', dialect: 'IRAQI_BAGHDADI', text: 'هلا شلونكم اليوم' });
    await voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } }));
    expect(fake.synth[0]).toMatchObject({ engine: 'habibi', language: 'AR', referenceText: 'هلا شلونكم اليوم' });
    expect(ch('nour').voice.identity!.status).toBe('ACTIVE');
    expect(fake.asr.filter((a) => a.language === 'auto')).toHaveLength(0);
    expect(fake.asr).toHaveLength(1); // the proof line only, in Arabic
    expect(fake.asr[0].language).toBe('ar');
    expect(ch('nour').voice.identity).toMatchObject({ model: 'habibi', fallbackModel: 'indextts', referenceText: 'هلا شلونكم اليوم' });
  });
  it('Habibi path without a stored transcript: transcribed once and stored back on the sample', async () => {
    const uploaded = prepare({ language: 'AR', dialect: 'IRAQI_BAGHDADI' });
    fake.asrHears = 'هلا شلونكم اليوم هاي عينة صوتي';
    await voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } }));
    expect(fake.asr.filter((a) => a.language === 'auto')).toHaveLength(1);
    expect(ch('nour').voice.samples.find((x) => x.id === uploaded.id)!.text).toBe('هلا شلونكم اليوم هاي عينة صوتي');
    expect(fake.synth[0]).toMatchObject({ engine: 'habibi', referenceText: 'هلا شلونكم اليوم هاي عينة صوتي' });
  });
  it('Habibi path with the transcription service away: no line is spoken with a guessed reference transcript and nothing is pinned (finding 17)', async () => {
    prepare({ language: 'AR', dialect: 'IRAQI_BAGHDADI' }); // no stored transcript
    fake.asrFails = true;
    const before = JSON.stringify(fake.state);
    await expect(voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } }))).rejects.toMatchObject({ code: 'UNAVAILABLE', failureClass: 'INFRASTRUCTURE' });
    expect(fake.synth).toHaveLength(0);
    expect(JSON.stringify(fake.state)).toBe(before);
    // the service answers but hears nothing: a reference without words is not cloned from either
    fake.asrFails = false; fake.asrHears = '';
    await expect(voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } }))).rejects.toMatchObject({ code: 'MISSING_REFERENCE' });
    expect(fake.synth).toHaveLength(0);
  });
  it('an ASR outage pins the identity in REVIEW and the job awaits review; nothing is passed silently', async () => {
    prepare({ text: 'x y z' });
    fake.asrFails = true;
    const r = await voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } }));
    expect(r?.awaitingReview).toBe(true);
    expect(ch('nour').voice.identity).toMatchObject({ status: 'REVIEW' });
    expect(ch('nour').voice.identity!.proof!.coverage).toBeUndefined();
  });
  it('the proof is gated on CER too: every word heard but far off in characters is REVIEW, and proof.cer is recorded', async () => {
    prepare({ text: 'x y z' });
    fake.asrAppend = ' thank you so much for watching and see you next time';
    const r = await voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } }));
    const proof = ch('nour').voice.identity!.proof!;
    expect(proof.coverage).toBe(1);
    expect(proof.cer).toBeGreaterThan(0.15);
    expect(ch('nour').voice.identity!.status).toBe('REVIEW');
    expect(r?.awaitingReview).toBe(true);
    // a clean proof records its CER as well
    prepare({ text: 'x y z' });
    fake.asrAppend = '';
    await voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' }, id: 'job-vb-clean' }));
    expect(ch('nour').voice.identity!.proof).toMatchObject({ cer: 0, coverage: 1 });
    expect(ch('nour').voice.identity!.status).toBe('ACTIVE');
  });
  it('a drifted proof line (low coverage) is REVIEW too', async () => {
    prepare({ text: 'x y z' });
    fake.asrHears = 'something else entirely';
    const r = await voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } }));
    expect(r?.awaitingReview).toBe(true);
    expect(ch('nour').voice.identity!.status).toBe('REVIEW');
    expect(ch('nour').voice.identity!.proof!.coverage).toBeLessThan(0.85);
  });
  it('the hosted clone hears the ORIGINAL upload (10 s – 5 min), never the trimmed window; a shorter original is refused before anything is sent (finding 11)', async () => {
    fake.minimaxKey = 'test-key';
    prepare({ text: 'hello there this is my voice' }); // the upload is 6.8 s
    await expect(voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC', provider: 'MINIMAX' } }))).rejects.toMatchObject({ code: 'INVALID', failureClass: 'INVALID_INPUT', message: expect.stringMatching(/10 s – 5 min/) });
    expect(fake.cloned).toHaveLength(0);
    // a 14 s original: the clone request carries the original file, not the stored 24 kHz window
    fake.state = { ...fake.state, assets: fake.state.assets.map((a) => (a.id === 'up-ref' ? { ...a, durationSeconds: 14, mimeType: 'audio/wav', bytes: 1_400_000 } : a)) };
    await expect(voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC', provider: 'MINIMAX' } }))).rejects.toThrow(/stop after the clone request/);
    expect(fake.cloned).toEqual(['/lib/audio/up-ref.wav']);
    expect(minimaxCloneProblem({ durationSeconds: 400 })).toMatch(/at most 5 min/);
    expect(minimaxCloneProblem({ durationSeconds: 20, bytes: 30 * 1024 * 1024 })).toMatch(/20 MB/);
    expect(minimaxCloneProblem({ durationSeconds: 20, bytes: 1000 })).toBeNull();
  });
  it('MANUAL without a hosted key is NOT_CONFIGURED; a second build of an unused character bumps the revision', async () => {
    prepare({ text: 'x y z' });
    await expect(voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'MANUAL', providerVoiceId: 'v1' } }))).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    await voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } }));
    await voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' }, id: 'job-vb-2' }));
    expect(ch('nour').voice.identity).toMatchObject({ revision: 2, jobId: 'job-vb-2' });
    expect(ch('nour').voice.samples.filter((x) => x.source === 'GENERATED' && x.assetId)).toHaveLength(2);
  });
});

describe('speakLine on a built voice', () => {
  it('a mixed-script line on a habibi identity falls back to IndexTTS with a job event; the identity model is unchanged; Habibi never gets Latin-only text', async () => {
    prepare({ language: 'AR', dialect: 'IRAQI_BAGHDADI', text: 'هلا شلونكم' });
    await voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } }));
    fake.synth = []; fake.events = [];
    const c = ch('nour');
    const { referenceWav } = await import('@/worker/handlers/voice');
    const ref = (await referenceWav(c, fake.state.assets, '/tmp/fake'))!;
    expect(ref.window?.assetId).toBe('gen-win');
    const mixed = await speakLine(ctxFor({ payload: {} }), c, 'اني اروح لل Google هسه', ref, '/tmp/fake');
    expect(mixed.engine).toBe('indextts'); expect(mixed.fallback).toMatch(/mixed/);
    expect(fake.events.some((e) => /engine fallback/.test(e.message) && e.data?.pinned === 'habibi')).toBe(true);
    const latin = await speakLine(ctxFor({ payload: {} }), c, 'See you at the office', ref, '/tmp/fake');
    expect(latin).toMatchObject({ engine: 'indextts', language: 'EN' });
    const arabic = await speakLine(ctxFor({ payload: {} }), c, 'شلونك اليوم', ref, '/tmp/fake');
    expect(arabic).toMatchObject({ engine: 'habibi', language: 'AR' });
    expect(fake.synth.filter((s) => s.engine === 'habibi').every((s) => !/[A-Za-z]{2,}/.test(String(s.text)))).toBe(true);
    expect(ch('nour').voice.identity!.model).toBe('habibi');
    // every line carries the pinned parameters
    expect(fake.synth.every((s) => s.speed === 1 && s.seed === ch('nour').voice.identity!.params.seed)).toBe(true);
  });
});

describe('DIALOGUE_AUDIO and the gate', () => {
  it('a line that FAILS is kept and flagged (one recording, no automatic re-take); one just below the gate (REVIEW) is kept and flagged for a person', async () => {
    prepare({ text: 'x y z' });
    await voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } }));
    const p = fake.state.productions.find((x) => x.id === 'river-lights')!;
    fake.state = { ...fake.state, productions: fake.state.productions.map((x) => (x.id === p.id ? { ...x, kind: 'SHORT', castIds: ['nour'], shots: x.shots.slice(0, 1).map((sh) => ({ ...sh, characterIds: ['nour'], dialogue: [{ id: 'l1', characterId: 'nour', text: 'one two three four five six seven' }] })) } : x)) };
    fake.synth = [];
    fake.asrHears = 'one two three four five six'; // coverage 0.86, CER 0.18: REVIEW
    const review = await dialogueAudio(ctxFor({ payload: { productionId: p.id }, type: 'DIALOGUE_AUDIO' }));
    expect(fake.synth).toHaveLength(1);
    expect(review).toMatchObject({ lines: 1, flagged: 1, awaitingReview: true });
    fake.synth = [];
    fake.asrHears = 'nothing like it at all'; // FAIL: kept and flagged, never re-spoken automatically (first-attempt policy)
    const failed = await dialogueAudio(ctxFor({ payload: { productionId: p.id, force: true }, type: 'DIALOGUE_AUDIO' }));
    expect(fake.synth).toHaveLength(1);
    expect(failed).toMatchObject({ lines: 1, flagged: 1 });
    expect(fake.events.some((e) => /failed the gate/.test(e.message))).toBe(true);
  });
});

describe('DIALOGUE_AUDIO reuse', () => {
  it('records only the lines without a current recording, writes them back with the voice revision, and flags lines that could not be heard back', async () => {
    prepare({ text: 'x y z' });
    await voiceBuild(ctxFor({ payload: { characterId: 'nour', mode: 'AUTOMATIC' } }));
    const rev = ch('nour').voice.identity!.revision;
    // a short production with nour speaking two lines, one already recorded by this revision
    const p = fake.state.productions.find((x) => x.id === 'river-lights')!;
    fake.state = { ...fake.state, assets: [...fake.state.assets, { id: 'gen-old', kind: 'AUDIO', src: '/api/media/gen-old', label: 'old', tags: [], sample: false, origin: 'GENERATED', durationSeconds: 1.5, createdAt: 'x', provenance: { path: 'audio/gen-old.wav' } }], productions: fake.state.productions.map((x) => (x.id === p.id ? { ...x, kind: 'SHORT', castIds: ['nour'], shots: x.shots.slice(0, 1).map((sh) => ({ ...sh, characterIds: ['nour'], dialogue: [{ id: 'l1', characterId: 'nour', text: 'First line here', audioAssetId: 'gen-old', durationSeconds: 1.5, voiceRevision: rev }, { id: 'l2', characterId: 'nour', text: 'Second line here' }, { id: 'l3', characterId: 'nour', text: 'Third line stale', audioAssetId: 'gen-old', durationSeconds: 1.5, voiceRevision: rev - 1 }] })) } : x)) };
    expect(lineRecordingCurrent({ audioAssetId: 'gen-old', voiceRevision: rev }, ch('nour'), fake.state.assets)).toBe(true);
    expect(lineRecordingCurrent({ audioAssetId: 'gen-old', voiceRevision: rev - 1 }, ch('nour'), fake.state.assets)).toBe(false);
    expect(lineRecordingCurrent({ audioAssetId: 'missing', voiceRevision: rev }, ch('nour'), fake.state.assets)).toBe(false);
    // acceptance 2026-10-05: a recording that says other words than the line as written now is stale
    const said = [...fake.state.assets, { id: 'gen-said', kind: 'AUDIO', src: '/api/media/gen-said', label: 'said', tags: [], sample: false, origin: 'GENERATED', durationSeconds: 2.8, createdAt: 'x', provenance: { path: 'audio/gen-said.wav', text: 'Oh, that is wonderful. Thank you!' } }] as typeof fake.state.assets;
    expect(lineRecordingCurrent({ audioAssetId: 'gen-said', voiceRevision: rev, text: 'Oh, that is wonderful.  Thank you!' }, ch('nour'), said)).toBe(true);
    expect(lineRecordingCurrent({ audioAssetId: 'gen-said', voiceRevision: rev, text: 'Oh, that is wonderful. Thank you so much, it really is the best tea in Baghdad.' }, ch('nour'), said)).toBe(false);
    expect(lineRecordingCurrent({ audioAssetId: 'gen-said', voiceRevision: rev, text: 'English words', textAr: 'Oh, that is wonderful. Thank you!' }, ch('nour'), said)).toBe(true);
    fake.synth = []; fake.asrHears = null;
    const r = await dialogueAudio(ctxFor({ payload: { productionId: p.id }, type: 'DIALOGUE_AUDIO' }));
    expect(r).toMatchObject({ lines: 2, flagged: 0, unverified: 0 });
    const shot = fake.state.productions.find((x) => x.id === p.id)!.shots[0];
    expect(shot.dialogue[0].audioAssetId).toBe('gen-old');
    expect(shot.dialogue[1]).toMatchObject({ voiceRevision: rev }); expect(shot.dialogue[1].audioAssetId).toMatch(/^gen-/); expect(shot.dialogue[1].audioAssetId).not.toBe('gen-old');
    expect(shot.dialogue[2].audioAssetId).not.toBe('gen-old'); expect(shot.dialogue[2].voiceRevision).toBe(rev);
    // nothing left to do
    expect(await dialogueAudio(ctxFor({ payload: { productionId: p.id }, type: 'DIALOGUE_AUDIO' }))).toMatchObject({ lines: 0 });
    // an outage while recording: the line is kept but the job awaits review
    fake.asrFails = true;
    const again = await dialogueAudio(ctxFor({ payload: { productionId: p.id, force: true }, type: 'DIALOGUE_AUDIO' }));
    expect(again).toMatchObject({ unverified: 3, awaitingReview: true });
  });
});
