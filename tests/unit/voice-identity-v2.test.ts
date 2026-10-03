import { describe, expect, it } from 'vitest';
import { seed } from '@/domain/sample';
import { addAsset, addVoiceDesign, addVoiceRecording, addVoiceSample, confirmVoiceConsent, recordVoiceListening, setVoiceIdentity, updateCharacter, updateVoiceDesign, updateVoiceSample, type VoiceDesignRecordInput, type VoiceIdentityInput } from '@/domain/actions';
import { runCommand, type Command } from '@/domain/commands';
import { StudioError } from '@/domain/errors';
import { CALIBRATION_TEXT, DESIGN_GATES, DESIGN_LABEL, IRAQI_NEEDS_RECORDING, PREVIEW_SENTENCES, automaticVoicePlan, candidateGate, designedIraqiOn, castNames, describeVoiceFromProfile, descriptionProblem, designedSeedProblem, rankDesignCandidates, rankingFor, tagDesignId, voiceLabels, withListening } from '@/domain/voice-identity';
import { REFERENCE_RULES } from '@/server/media/voice-check';
import type { Character, StudioState, VoiceDesignCandidate, VoiceIdentity } from '@/domain/types';

/** VOICE IDENTITY V2 (docs/CONTRACTS-VOICE-IDENTITY-V2.md) — the pure rules: origins and consent, the automatic plan,
 *  the profile description and its refusals, the candidate gates and ranking, Rule V-DESIGN on the identity, the design
 *  record's commands, and listening records. Exercised on the sample studio with the real reducers. */

const ch = (s: StudioState, id: string): Character => s.characters.find((c) => c.id === id)!;
const codeOf = (fn: () => unknown) => { try { fn(); return null; } catch (e) { return e instanceof StudioError ? e.code : 'OTHER'; } };
const CONSENT = { statement: 'MY_VOICE' as const, by: 'PRODUCER' as const, at: '2026-10-03T00:00:00.000Z' };
const sha = (n: number) => n.toString(16).padStart(64, '0');
const cmd = <K extends Command['name']>(name: K, args: Command<K>['args']): Command<K> => ({ name, args, seed: 's', at: '2026-10-03T12:00:00.000Z' });
/** an unused character with no voice at all, in a language */
const fresh = (s: StudioState, id: string, language: 'EN' | 'AR', dialect?: 'MSA' | 'IRAQI_BAGHDADI'): StudioState => ({ ...s, characters: s.characters.map((c) => (c.id === id ? { ...c, language, dialect, usage: { known: true, videos: [] }, voice: { pitch: 'LOW', pace: 'MEASURED', timbre: 'warm, slightly husky', notes: '', samples: [] } } : c)) });

/** nour (unused) with a stored three-candidate design and a stored proof line. */
function withDesign(opts: { language?: 'EN' | 'AR'; dialect?: 'MSA' | 'IRAQI_BAGHDADI'; allowIraqi?: boolean; durations?: number[] } = {}) {
  let s = fresh(seed(), 'nour', opts.language ?? 'EN', opts.dialect);
  if (opts.allowIraqi) s = { ...s, settings: { ...s.settings, voice: { allowDesignedIraqi: true } } };
  const durations = opts.durations ?? [9.6, 9.3, 8.5];
  const candidates: VoiceDesignCandidate[] = durations.map((d, k) => ({ index: k + 1, seed: 100 + k, assetId: `gen-seed-${k + 1}`, sha256: sha(k + 1), durationSeconds: d, nativeAssetId: `gen-native-${k + 1}`, nativeSha256: sha(10 + k), measured: { durationSeconds: d, lufs: -20, truePeakDbtp: -1, clippedSamples: 0 }, gate: { ok: false, reasons: ['not measured yet'] } }));
  for (const c of candidates) {
    s = addAsset(s, { id: c.assetId, kind: 'AUDIO', src: `/api/media/${c.assetId}`, label: 'seed', tags: ['voice', 'design', 'candidate'], sample: false, origin: 'GENERATED', sha256: c.sha256, tier: 'RAW', provenance: { designId: 'vd-1', path: `audio/${c.assetId}.wav` } }).state;
    s = addAsset(s, { id: c.nativeAssetId!, kind: 'AUDIO', src: `/api/media/${c.nativeAssetId}`, label: 'original', tags: ['voice', 'design', 'original'], sample: false, origin: 'GENERATED', sha256: c.nativeSha256, tier: 'RAW', provenance: { designId: 'vd-1' } }).state;
  }
  const record: VoiceDesignRecordInput = { id: 'vd-1', characterId: 'nour', mode: 'AUTOMATIC', engine: 'voxcpm2', model: 'openbmb/VoxCPM2', engineVersion: 'voxcpm 2.0.3', description: 'A warm, low female voice, about 31', descriptionSource: 'PROFILE', language: opts.language ?? 'EN', ...(opts.dialect ? { dialect: opts.dialect } : {}), ...(opts.dialect === 'IRAQI_BAGHDADI' ? { experiment: 'DESIGNED_IRAQI' as const } : {}), text: CALIBRATION_TEXT[opts.language ?? 'EN'], seed: 100, seeds: [100, 101, 102], params: { cfg_value: 2 }, lineEngine: opts.dialect === 'IRAQI_BAGHDADI' ? 'habibi' : 'indextts', lineParams: { speed: 1, emotionAlpha: 1, seed: 77 }, candidates, jobId: 'job-d' };
  s = addVoiceDesign(s, 'nour', record);
  s = addAsset(s, { id: 'gen-proof', kind: 'AUDIO', src: '/api/media/gen-proof', label: 'proof', tags: [], sample: false, origin: 'GENERATED' }).state;
  s = addVoiceSample(s, 'nour', { id: 'proof-1', label: 'proof', assetId: 'gen-proof', source: 'GENERATED', text: 'Hello.' }).state;
  return s;
}
const designed = (k: number, over: Partial<VoiceIdentityInput> = {}): VoiceIdentityInput => ({ provider: 'LOCAL_TTS', model: 'indextts', mode: 'AUTOMATIC', origin: 'DESIGNED', designId: 'vd-1', seedSha256: sha(k), referenceAssetId: `gen-seed-${k}`, language: 'EN', params: { speed: 1, emotionAlpha: 1, seed: 77 }, proof: { sampleId: 'proof-1', assetId: 'gen-proof', text: 'Hello.' }, ...over });

describe('the automatic plan (contract §2)', () => {
  it('EN and MSA without a recording are designed; Iraqi is refused with the contract’s sentence unless the experiment is on', () => {
    const s = seed();
    expect(automaticVoicePlan(ch(fresh(s, 'nour', 'EN'), 'nour'), s.assets)).toEqual({ kind: 'DESIGN', experiment: false });
    expect(automaticVoicePlan(ch(fresh(s, 'nour', 'AR', 'MSA'), 'nour'), s.assets)).toEqual({ kind: 'DESIGN', experiment: false });
    const iraqi = ch(fresh(s, 'nour', 'AR', 'IRAQI_BAGHDADI'), 'nour');
    expect(automaticVoicePlan(iraqi, s.assets)).toEqual({ kind: 'REFUSE', code: 'MISSING_REFERENCE', message: IRAQI_NEEDS_RECORDING });
    expect(IRAQI_NEEDS_RECORDING).toBe('Iraqi voices are cloned from a real Iraqi recording — record or upload 5–12 seconds of the voice.');
    expect(automaticVoicePlan(iraqi, s.assets, { voice: { allowDesignedIraqi: true } })).toEqual({ kind: 'DESIGN', experiment: true });
    // the switch lives at settings.voice.allowDesignedIraqi, off by default, set with updateSettings
    expect(designedIraqiOn(s.settings)).toBe(false);
    const on = runCommand(s, cmd('updateSettings', [{ voice: { allowDesignedIraqi: true } }])).state;
    expect(on.settings.voice).toEqual({ allowDesignedIraqi: true });
    expect(designedIraqiOn(on.settings)).toBe(true);
    expect(runCommand(on, cmd('updateSettings', [{ reducedMotion: true }])).state.settings.voice).toEqual({ allowDesignedIraqi: true });
    expect(designedIraqiOn({ voice: { allowDesignedIraqi: false } })).toBe(false);
  });
  it('a consented recording is the voice; one without consent is named (CONSENT_REQUIRED), never designed over; an English clip is not an Iraqi recording', () => {
    let s = fresh(seed(), 'nour', 'AR', 'IRAQI_BAGHDADI');
    s = addAsset(s, { id: 'up-1', kind: 'AUDIO', src: '/api/media/up-1', label: 'one', tags: [], sample: false, origin: 'UPLOAD' }).state;
    s = addVoiceRecording(s, 'nour', 'up-1', 'old take');
    const old = ch(s, 'nour').voice.samples[0];
    expect(automaticVoicePlan(ch(s, 'nour'), s.assets)).toMatchObject({ kind: 'REFUSE', code: 'CONSENT_REQUIRED', sampleId: old.id, message: expect.stringMatching(/old take.*consent statement/) });
    const consented = confirmVoiceConsent(s, 'nour', old.id, 'SPEAKER_PERMISSION');
    expect(automaticVoicePlan(ch(consented, 'nour'), consented.assets)).toEqual({ kind: 'UPLOAD', sampleId: old.id, label: 'old take' });
    // the same clip marked English (or heard as English) is no Iraqi reference
    const english = updateVoiceSample(consented, 'nour', old.id, { language: 'EN' });
    expect(automaticVoicePlan(ch(english, 'nour'), english.assets)).toMatchObject({ kind: 'REFUSE', code: 'MISSING_REFERENCE' });
    // a generated line or a missing file is never a recording
    const gone = { ...consented, assets: consented.assets.map((a) => (a.id === 'up-1' ? { ...a, unavailable: true } : a)) };
    expect(automaticVoicePlan(ch(gone, 'nour'), gone.assets)).toMatchObject({ kind: 'REFUSE' });
  });
});

describe('the description (deterministic, attributes only — Rule V-DESIGN §4)', () => {
  it('is written from sex, age, pitch, pace, timbre and the accent; never the personality or a name', () => {
    const s = fresh(seed(), 'nour', 'AR', 'MSA');
    const d = describeVoiceFromProfile(ch(s, 'nour'));
    expect(d).toBe('A warm, slightly husky, low female voice, about 31, speaking formal Modern Standard Arabic at a steady, measured pace, close-microphone studio recording');
    expect(describeVoiceFromProfile(ch(s, 'nour'))).toBe(d);
    expect(descriptionProblem(d, castNames(s))).toBeNull();
    const kid = { ...ch(s, 'nour'), ageYears: 9, sex: 'MALE' as const, language: 'EN' as const, voice: { ...ch(s, 'nour').voice, pitch: 'HIGH' as const, pace: 'QUICK' as const, timbre: 'sounds like a famous singer' } };
    expect(describeVoiceFromProfile(kid)).toBe("A clear, high young boy's voice, about 9, speaking English at a quick, lively pace, close-microphone studio recording");
  });
  it('refuses a resemblance (English and Arabic), a cast member’s name, an empty or overlong text', () => {
    const names = castNames(seed());
    expect(descriptionProblem('A voice that sounds like a famous actor', names)).toMatch(/sounds like/);
    expect(descriptionProblem('The voice of the president', names)).toMatch(/voice of/);
    expect(descriptionProblem('Imitate a newsreader', names)).toMatch(/Imitate/);
    expect(descriptionProblem('صوت يشبه صوت مذيع مشهور', names)).toMatch(/يشبه/);
    expect(descriptionProblem('A warm voice like Nour', names)).toMatch(/names “Nour”/);
    expect(descriptionProblem('صوت دافئ مثل ليلى', names)).toMatch(/ليلى/);
    expect(descriptionProblem('  ', names)).toMatch(/empty/);
    expect(descriptionProblem('x'.repeat(301), names)).toMatch(/at most 300/);
    // a word that only contains a name is fine; "traditional" is not "imitation"
    expect(descriptionProblem('A traditional storyteller voice, warm and nourishing', names)).toBeNull();
    expect(descriptionProblem('صوت تقليدي دافئ', names)).toBeNull();
  });
});

describe('candidate gates and ranking', () => {
  const m = (over: Partial<VoiceDesignCandidate['measured']> = {}) => ({ durationSeconds: 9, cer: 0.01, coverage: 1, lufs: -20, truePeakDbtp: -1, clippedSamples: 0, ...over });
  it('the gates are the contract’s: CER ≤ 0.10 EN / ≤ 0.15 AR, the upload loudness and peak gates, 0 clipped, ≤ 11.5 s; unmeasured fails', () => {
    expect(DESIGN_GATES.lufs).toEqual({ min: REFERENCE_RULES.minLufs, max: REFERENCE_RULES.maxLufs });
    expect(candidateGate(m(), 'EN')).toEqual({ ok: true, reasons: [] });
    expect(candidateGate(m({ cer: 0.12 }), 'EN').ok).toBe(false);
    expect(candidateGate(m({ cer: 0.12 }), 'AR').ok).toBe(true);
    expect(candidateGate(m({ durationSeconds: 12.16 }), 'AR').reasons[0]).toMatch(/12.16 s is over 11.5 s/);
    expect(candidateGate(m({ lufs: -31 }), 'EN').reasons).toEqual([expect.stringMatching(/loudness -31.0 LUFS/)]);
    expect(candidateGate(m({ truePeakDbtp: 0.4 }), 'EN').reasons).toEqual([expect.stringMatching(/true peak/)]);
    expect(candidateGate(m({ clippedSamples: 3 }), 'EN').reasons).toEqual(['3 clipped samples']);
    expect(candidateGate(m({ cer: undefined }), 'EN').reasons).toEqual([expect.stringMatching(/CER unmeasured/)]);
  });
  const cand = (index: number, over: Partial<VoiceDesignCandidate>): VoiceDesignCandidate => ({ index, seed: index, assetId: `a${index}`, sha256: sha(index), durationSeconds: 9, measured: m(), gate: { ok: true, reasons: [] }, ...over });
  it('EN/MSA: gates passed first, then mean ECAPA(seed, line rendering); a candidate over 11.5 s is never ranked', () => {
    const r = rankDesignCandidates([cand(1, { similarityMean: 0.66 }), cand(2, { similarityMean: 0.74 }), cand(3, { similarityMean: 0.9, gate: { ok: false, reasons: ['CER'] } })]);
    expect(r).toMatchObject({ ranking: [2, 1, 3], pick: 2, rankedBy: expect.stringMatching(/ECAPA/) });
    expect(rankDesignCandidates([cand(1, { durationSeconds: 12, similarityMean: 0.9 }), cand(2, { similarityMean: 0.5 })]).ranking).toEqual([2]);
    expect(rankDesignCandidates([cand(1, { gate: { ok: false, reasons: ['x'] } })]).pick).toBeUndefined();
  });
  it('the Iraqi experiment: the probe lines’ letter coverage, then their CER — not ECAPA (the Iraqi A/B’s recipe)', () => {
    const iraqi = { language: 'AR' as const, dialect: 'IRAQI_BAGHDADI' as const };
    expect(rankingFor(iraqi)).toBe('PROBE_LETTERS');
    expect(rankingFor({ language: 'AR', dialect: 'MSA' })).toBe('SIMILARITY');
    expect(PREVIEW_SENTENCES.IRAQI).toHaveLength(4);
    const r = rankDesignCandidates([cand(1, { similarityMean: 0.85, letterCoverageMean: 0.92, cerMean: 0.05 }), cand(2, { similarityMean: 0.7, letterCoverageMean: 0.97, cerMean: 0.03 }), cand(3, { similarityMean: 0.7, letterCoverageMean: 0.97, cerMean: 0.02 })], 'PROBE_LETTERS');
    expect(r).toMatchObject({ ranking: [3, 2, 1], pick: 3, rankedBy: expect.stringMatching(/letter coverage/) });
  });
});

describe('Rule V-DESIGN on the identity (setVoiceIdentity)', () => {
  it('a designed identity names its record and seed; the sha256 must be the record’s; the record is marked chosen and the seed becomes SECONDARY', () => {
    const s = withDesign();
    expect(designedSeedProblem(ch(s, 'nour'), { designId: 'vd-1', assetId: 'gen-seed-2', fileSha256: sha(2) })).toBeNull();
    expect(designedSeedProblem(ch(s, 'nour'), { designId: 'vd-1', assetId: 'gen-seed-2', fileSha256: sha(99) })).toMatch(/does not match design vd-1 candidate 2/);
    expect(designedSeedProblem(ch(s, 'nour'), { designId: 'vd-2', assetId: 'gen-seed-2', fileSha256: sha(2) })).toMatch(/no design record vd-2/);
    expect(designedSeedProblem(ch(s, 'nour'), { designId: 'vd-1', assetId: 'gen-seed-2', fileSha256: sha(2), tagDesignId: 'vd-other' })).toMatch(/provenance tag names design vd-other/);
    expect(tagDesignId('vewbox-tts voxcpm2 · synthetic speech; engine=voxcpm2; designId=vd-1; candidate=2; seed=101; not a voice reference')).toBe('vd-1');
    expect(codeOf(() => setVoiceIdentity(s, 'nour', designed(2, { seedSha256: sha(3) })))).toBe('INVALID');
    expect(codeOf(() => setVoiceIdentity(s, 'nour', designed(2, { designId: undefined })))).toBe('INVALID');
    expect(codeOf(() => setVoiceIdentity(s, 'nour', designed(2, { referenceAssetId: 'gen-proof', seedSha256: sha(2) })))).toBe('INVALID');
    // a file that is not the record's (the asset's sha256 was changed under it)
    const swapped = { ...s, assets: s.assets.map((a) => (a.id === 'gen-seed-2' ? { ...a, sha256: sha(42) } : a)) };
    expect(() => setVoiceIdentity(swapped, 'nour', designed(2))).toThrow(/Rule V-DESIGN/);
    const pinned = setVoiceIdentity(s, 'nour', designed(2));
    const id = ch(pinned, 'nour').voice.identity!;
    expect(id).toMatchObject({ origin: 'DESIGNED', designId: 'vd-1', seedSha256: sha(2), referenceAssetId: 'gen-seed-2', status: 'ACTIVE', dialectStatus: 'NOT_APPLICABLE', revision: 1 });
    expect(id.consent).toBeUndefined();
    expect(ch(pinned, 'nour').voice.designs![0]).toMatchObject({ chosen: 2, chosenBy: 'AUTOMATIC', label: DESIGN_LABEL });
    const tier = (st: StudioState, a: string) => st.assets.find((x) => x.id === a)!.tier;
    expect([tier(pinned, 'gen-seed-2'), tier(pinned, 'gen-native-2'), tier(pinned, 'gen-seed-1'), tier(pinned, 'gen-seed-3')]).toEqual(['SECONDARY', 'SECONDARY', 'RAW', 'RAW']);
    // a later identity from another candidate: the old seed goes back to RAW
    const again = setVoiceIdentity({ ...pinned, characters: pinned.characters.map((c) => (c.id === 'nour' ? { ...c, voice: { ...c.voice, designs: c.voice.designs!.map((d) => ({ ...d, chosen: undefined })) } } : c)) }, 'nour', designed(3, { mode: 'DESIGN' }));
    expect([tier(again, 'gen-seed-2'), tier(again, 'gen-seed-3')]).toEqual(['RAW', 'SECONDARY']);
    expect(ch(again, 'nour').voice.designs![0]).toMatchObject({ chosen: 3, chosenBy: 'PRODUCER' });
  });
  it('every identity names its origin; GENERATED never; a recording needs its consent; only a listener sets the dialect status', () => {
    let s = withDesign();
    expect(codeOf(() => setVoiceIdentity(s, 'nour', designed(2, { origin: undefined })))).toBe('INVALID');
    expect(codeOf(() => setVoiceIdentity(s, 'nour', designed(2, { origin: 'GENERATED' })))).toBe('INVALID');
    expect(codeOf(() => setVoiceIdentity(s, 'nour', designed(2, { dialectStatus: 'LISTENER_APPROVED' })))).toBe('INVALID');
    expect(codeOf(() => setVoiceIdentity(s, 'nour', designed(2, { provider: 'MINIMAX' })))).toBe('INVALID');
    s = addAsset(s, { id: 'up-1', kind: 'AUDIO', src: '/api/media/up-1', label: 'take', tags: [], sample: false, origin: 'UPLOAD' }).state;
    s = addVoiceRecording(s, 'nour', 'up-1', 'take');
    const rec = ch(s, 'nour').voice.samples.at(-1)!;
    const recorded: VoiceIdentityInput = { provider: 'LOCAL_TTS', model: 'indextts', mode: 'REFERENCE', origin: 'UPLOAD_CONSENTED', referenceSampleId: rec.id, referenceAssetId: 'up-1', language: 'EN', params: { speed: 1, emotionAlpha: 1 }, proof: { sampleId: 'proof-1', assetId: 'gen-proof', text: 'Hello.' } };
    expect(codeOf(() => setVoiceIdentity(s, 'nour', recorded))).toBe('CONSENT_REQUIRED');
    s = confirmVoiceConsent(s, 'nour', rec.id, 'MY_VOICE');
    const ok = ch(setVoiceIdentity(s, 'nour', { ...recorded, consent: { statement: 'SPEAKER_PERMISSION', by: 'PRODUCER', at: 'forged' } }), 'nour').voice.identity!;
    // the consent on the identity is the recording's, never the caller's
    expect(ok).toMatchObject({ origin: 'UPLOAD_CONSENTED', consent: { statement: 'MY_VOICE', by: 'PRODUCER' } });
    expect(codeOf(() => setVoiceIdentity(s, 'nour', { ...recorded, origin: 'DESIGNED' }))).toBe('INVALID');
  });
  it('an Arabic voice starts UNVERIFIED; the designed-Iraqi experiment is always REVIEW and only exists with the switch on', () => {
    const msa = withDesign({ language: 'AR', dialect: 'MSA' });
    expect(ch(setVoiceIdentity(msa, 'nour', designed(1, { language: 'AR', dialect: 'MSA' })), 'nour').voice.identity).toMatchObject({ dialectStatus: 'UNVERIFIED', status: 'ACTIVE' });
    const iraqi = withDesign({ language: 'AR', dialect: 'IRAQI_BAGHDADI', allowIraqi: true });
    const pinned = ch(setVoiceIdentity(iraqi, 'nour', designed(1, { language: 'AR', dialect: 'IRAQI_BAGHDADI', model: 'habibi', status: 'ACTIVE' })), 'nour').voice.identity!;
    expect(pinned).toMatchObject({ status: 'REVIEW', dialectStatus: 'UNVERIFIED' });
    expect(voiceLabels(pinned)).toEqual([DESIGN_LABEL, 'Iraqi dialect not yet verified by a native listener', 'naturalness not yet judged by a listener']);
    // switched off since the design: refused with the contract's sentence
    const off = { ...iraqi, settings: { ...iraqi.settings, voice: { allowDesignedIraqi: false } } };
    expect(() => setVoiceIdentity(off, 'nour', designed(1, { language: 'AR', dialect: 'IRAQI_BAGHDADI' }))).toThrow(IRAQI_NEEDS_RECORDING);
  });
});

describe('the design record (addVoiceDesign / updateVoiceDesign)', () => {
  it('is kept on the character with its files; a candidate whose stored file is not the record’s is refused; Iraqi needs the switch', () => {
    const s = withDesign();
    expect(ch(s, 'nour').voice.designs).toHaveLength(1);
    expect(ch(s, 'nour').voice.designs![0]).toMatchObject({ id: 'vd-1', label: DESIGN_LABEL, candidates: [{ index: 1, sha256: sha(1) }, { index: 2 }, { index: 3 }] });
    expect(ch(s, 'nour').voice.designs![0].chosen).toBeUndefined();
    const base = ch(s, 'nour').voice.designs![0];
    const again = { ...base, id: 'vd-2' } as VoiceDesignRecordInput;
    expect(() => addVoiceDesign(s, 'nour', again)).toThrow(/Rule V-DESIGN/); // the files name vd-1
    expect(codeOf(() => addVoiceDesign(s, 'nour', { ...base } as VoiceDesignRecordInput))).toBe('CONFLICT');
    // an Iraqi design without the experiment switch
    expect(() => withDesign({ language: 'AR', dialect: 'IRAQI_BAGHDADI' })).toThrow(IRAQI_NEEDS_RECORDING);
    // a whole-form save never touches the designs
    expect(ch(updateCharacter(s, 'nour', { voice: { ...ch(s, 'nour').voice, designs: [] } }), 'nour').voice.designs).toHaveLength(1);
  });
  it('the measurements are written once, before a candidate is pinned; what a candidate is never changes', () => {
    const s = withDesign();
    const m = updateVoiceDesign(s, 'nour', 'vd-1', { candidates: [{ index: 2, measured: { durationSeconds: 9.3, cer: 0.01, lufs: -20, truePeakDbtp: -1, clippedSamples: 0 }, gate: { ok: true, reasons: [] }, similarityMean: 0.71, previews: [{ text: 'x', engine: 'indextts', cosine: 0.71 }] }], ranking: [2], rankedBy: 'ECAPA' });
    const rec = ch(m, 'nour').voice.designs![0];
    expect(rec.candidates[1]).toMatchObject({ assetId: 'gen-seed-2', sha256: sha(2), gate: { ok: true }, similarityMean: 0.71 });
    expect(rec).toMatchObject({ ranking: [2], rankedBy: 'ECAPA' });
    expect(codeOf(() => updateVoiceDesign(m, 'nour', 'vd-1', { candidates: [{ index: 4, measured: { durationSeconds: 1 }, gate: { ok: true, reasons: [] } }] }))).toBe('INVALID');
    const pinned = setVoiceIdentity(m, 'nour', designed(2));
    expect(codeOf(() => updateVoiceDesign(pinned, 'nour', 'vd-1', { candidates: [] }))).toBe('CONFLICT');
  });
  it('a voice locked by its use refuses a new design', () => {
    const s = withDesign();
    const pinned = setVoiceIdentity(s, 'nour', designed(2));
    const used: StudioState = { ...pinned, characters: pinned.characters.map((c) => (c.id === 'nour' ? { ...c, usage: { known: true, videos: [{ productionId: 'p', productionTitle: 'P', shotId: 'sh', shotLabel: '1.1', takeId: 't', takeLabel: 'Take 1', recordedAt: 'x', status: 'IN_TAKE' as const }] } } : c)) };
    expect(codeOf(() => addVoiceDesign(used, 'nour', { ...ch(s, 'nour').voice.designs![0], id: 'vd-9' } as VoiceDesignRecordInput))).toBe('VOICE_LOCKED');
  });
});

describe('listening is recorded, never inferred (recordVoiceListening)', () => {
  it('appends a listener’s record; the dialect status follows a listener only; allowed on a locked voice; validated as a command', () => {
    const s = setVoiceIdentity(withDesign({ language: 'AR', dialect: 'MSA' }), 'nour', designed(1, { language: 'AR', dialect: 'MSA' }));
    expect(ch(s, 'nour').voice.identity!.dialectStatus).toBe('UNVERIFIED');
    const used: StudioState = { ...s, characters: s.characters.map((c) => (c.id === 'nour' ? { ...c, usage: { known: true, videos: [{ productionId: 'p', productionTitle: 'P', shotId: 'sh', shotLabel: '1.1', takeId: 't', takeLabel: 'Take 1', recordedAt: 'x', status: 'IN_TAKE' as const }] } } : c)) };
    const one = recordVoiceListening(used, 'nour', { natural: 4 });
    expect(ch(one, 'nour').voice.identity).toMatchObject({ dialectStatus: 'UNVERIFIED', listening: [{ by: 'PRODUCER', natural: 4 }] });
    const two = runCommand(one, cmd('recordVoiceListening', ['nour', { natural: 3, dialectAuthentic: true, note: 'clear Fusha' }])).state;
    expect(ch(two, 'nour').voice.identity).toMatchObject({ dialectStatus: 'LISTENER_APPROVED', listening: [{ natural: 4 }, { natural: 3, dialectAuthentic: true, note: 'clear Fusha', at: '2026-10-03T12:00:00.000Z' }] });
    expect(ch(recordVoiceListening(two, 'nour', { natural: 2, dialectAuthentic: false }), 'nour').voice.identity!.dialectStatus).toBe('LISTENER_REJECTED');
    expect(codeOf(() => runCommand(one, cmd('recordVoiceListening', ['nour', { natural: 6 }])))).toBe('INVALID');
    expect(codeOf(() => recordVoiceListening(one, 'nour', { natural: 2.5 }))).toBe('INVALID');
    // English has no dialect to judge; a character without a voice has nothing to listen to
    const en = setVoiceIdentity(withDesign(), 'nour', designed(1));
    expect(codeOf(() => recordVoiceListening(en, 'nour', { natural: 4, dialectAuthentic: true }))).toBe('INVALID');
    expect(codeOf(() => recordVoiceListening(fresh(seed(), 'nour', 'EN'), 'nour', { natural: 4 }))).toBe('INVALID');
    // a rebuilt voice starts without listening records
    const base: VoiceIdentity = ch(two, 'nour').voice.identity!;
    expect(withListening(base, { natural: 5 }, 'x').dialectStatus).toBe('LISTENER_APPROVED');
  });
});

describe('consent on recordings', () => {
  it('only an upload carries consent; updateVoiceSample never writes it; confirmVoiceConsent upgrades a voice pinned before consent existed', () => {
    let s = addAsset(seed(), { id: 'up-1', kind: 'AUDIO', src: '/api/media/up-1', label: 'take', tags: [], sample: false, origin: 'UPLOAD' }).state;
    s = addAsset(s, { id: 'gen-1', kind: 'AUDIO', src: '/api/media/gen-1', label: 'line', tags: [], sample: false, origin: 'GENERATED' }).state;
    s = addVoiceSample(s, 'nour', { id: 'g', label: 'line', assetId: 'gen-1', source: 'GENERATED', consent: CONSENT }).state;
    expect(ch(s, 'nour').voice.samples.find((x) => x.id === 'g')!.consent).toBeUndefined();
    s = addVoiceRecording(s, 'nour', 'up-1', 'take');
    const rec = ch(s, 'nour').voice.samples.at(-1)!;
    expect(ch(updateVoiceSample(s, 'nour', rec.id, { text: 'x', consent: CONSENT } as never), 'nour').voice.samples.at(-1)!.consent).toBeUndefined();
    expect(codeOf(() => confirmVoiceConsent(s, 'nour', 'g', 'MY_VOICE'))).toBe('INVALID');
    expect(codeOf(() => runCommand(s, cmd('confirmVoiceConsent', ['nour', rec.id, 'YES' as never])))).toBe('INVALID');
    // a legacy identity (pinned before v2, no origin) from this recording
    const legacy: StudioState = { ...s, characters: s.characters.map((c) => (c.id === 'nour' ? { ...c, voice: { ...c.voice, identity: { provider: 'LOCAL_TTS', model: 'indextts', mode: 'REFERENCE', referenceSampleId: rec.id, referenceAssetId: 'up-1', language: 'EN', params: { speed: 1, emotionAlpha: 1 }, status: 'ACTIVE', revision: 1, createdAt: 'x' } } } : c)) };
    const up = confirmVoiceConsent(legacy, 'nour', rec.id, 'MY_VOICE');
    expect(ch(up, 'nour').voice.identity).toMatchObject({ origin: 'UPLOAD_CONSENTED', consent: { statement: 'MY_VOICE', by: 'PRODUCER' }, revision: 1 });
    expect(ch(up, 'nour').voice.samples.at(-1)!.consent).toMatchObject({ statement: 'MY_VOICE' });
  });
});
