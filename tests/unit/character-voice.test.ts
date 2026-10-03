import { describe, expect, it } from 'vitest';
import { seed } from '@/domain/sample';
import { addAsset, addVoiceRecording, addVoiceSample, deleteAsset, removeVoiceSample, selectVoiceSample, setVoiceIdentity, updateCharacter, updateVoiceSample, type CharacterInput, type VoiceIdentityInput } from '@/domain/actions';
import { runCommand, validateCommandArgs, type Command } from '@/domain/commands';
import { StudioError } from '@/domain/errors';
import { protectedVoiceAssetOwner, voiceLock } from '@/domain/rules';
import { normalizeVoice } from '@/server/studio/snapshot';
import type { Character, StudioState, Voice } from '@/domain/types';

/** THE VOICE IDENTITY CONTRACT (docs/CONTRACTS-CHARACTER-VOICE.md §1.4, diagnosis §4): what the domain refuses and
 *  what it writes, exercised on the sample studio with real uploads added. */

const ch = (s: StudioState, id: string): Character => s.characters.find((c) => c.id === id)!;
const codeOf = (fn: () => unknown) => { try { fn(); return null; } catch (e) { return e instanceof StudioError ? e.code : 'OTHER'; } };
const cmd = <K extends Command['name']>(name: K, args: Command<K>['args']): Command<K> => ({ name, args, seed: 'test-seed', at: '2026-10-02T12:00:00.000Z' });

/** An unused character (nour) with one real uploaded recording and, optionally, a generated proof line. */
function withUpload(s: StudioState = seed(), id = 'nour') {
  let st = addAsset(s, { id: 'up-ref', kind: 'AUDIO', src: '/api/media/up-ref', label: 'ref.wav', tags: [], sample: false, origin: 'UPLOAD', durationSeconds: 6.8 }).state;
  st = addAsset(st, { id: 'gen-proof', kind: 'AUDIO', src: '/api/media/gen-proof', label: 'proof', tags: [], sample: false, origin: 'GENERATED', durationSeconds: 3.3 }).state;
  st = addVoiceRecording(st, id, 'up-ref', 'Studio take', { text: 'hello there, this is my voice', consent: { statement: 'MY_VOICE', by: 'PRODUCER', at: '2026-10-03T00:00:00.000Z' } });
  const uploaded = ch(st, id).voice.samples.at(-1)!;
  st = addVoiceSample(st, id, { id: 'proof-1', label: 'proof', assetId: 'gen-proof', source: 'GENERATED', text: 'Hello. My name is Nour.' }).state;
  return { state: st, uploaded };
}
const identityInput = (uploadedId: string): VoiceIdentityInput => ({ provider: 'LOCAL_TTS', model: 'indextts', mode: 'REFERENCE', origin: 'UPLOAD_CONSENTED', referenceSampleId: uploadedId, referenceAssetId: 'up-ref', language: 'EN', params: { speed: 1, emotionAlpha: 1, seed: 7 }, proof: { sampleId: 'proof-1', assetId: 'gen-proof', text: 'Hello. My name is Nour.', coverage: 1 }, jobId: 'job-1' });

describe('addCharacter (validated by the command schema)', () => {
  const base: CharacterInput = { name: 'Zeina', role: 'x', style: 'CARTOON', sex: 'FEMALE', ageYears: 20, build: '', face: '', hair: '', skin: '', eyes: '', distinguishing: [], wardrobe: '', personality: '', language: 'EN' };
  it('rejects an empty name, bad enums, an age outside 1–120 and a dialect on English with INVALID', () => {
    for (const bad of [{ ...base, name: '  ' }, { ...base, sex: 'OTHER' }, { ...base, style: 'OIL' }, { ...base, ageYears: 0 }, { ...base, ageYears: 121 }, { ...base, ageYears: 20.5 }, { ...base, dialect: 'MSA' }, { ...base, language: 'FR' }, { ...base, ageYears: 'twenty' }]) {
      expect(codeOf(() => runCommand(seed(), cmd('addCharacter', [bad as never]))), JSON.stringify(bad)).toBe('INVALID');
    }
    expect(codeOf(() => runCommand(seed(), cmd('addCharacter', [{} as never])))).toBe('INVALID');
    expect(codeOf(() => runCommand(seed(), cmd('addCharacter', ['nope' as never])))).toBe('INVALID');
  });
  it('accepts a valid profile, defaults the dialect of an Arabic character, and never takes samples or an identity', () => {
    const r = runCommand(seed(), cmd('addCharacter', [{ ...base, language: 'AR', voice: { pitch: 'LOW', pace: 'SLOW', timbre: 'x', notes: 'y', samples: [{ id: 'smuggled' }], identity: { model: 'x' } } as never }]));
    const c = r.result.character;
    expect(c.dialect).toBe(seed().settings.defaults.dialect);
    expect(c.voice).toEqual({ pitch: 'LOW', pace: 'SLOW', timbre: 'x', notes: 'y', samples: [] });
    expect(c.usage).toEqual({ known: true, videos: [] });
    const en = runCommand(seed(), cmd('addCharacter', [{ ...base }]));
    expect(en.result.character.dialect).toBeUndefined();
  });
  it('validateCommandArgs names the field and leaves commands without a schema alone', () => {
    expect(() => validateCommandArgs('addCharacter', [{ ...base, ageYears: 'x' }])).toThrow(/ageYears/);
    expect(() => validateCommandArgs('updateCharacter', ['nour', { voice: 'loud' }])).toThrow(/voice/);
    expect(() => validateCommandArgs('selectVoiceSample', ['nour'])).not.toThrow();
    expect(() => validateCommandArgs('addShow', ['anything'])).not.toThrow();
    expect(() => validateCommandArgs('setVoiceIdentity', ['nour', { provider: 'LOCAL_TTS', model: 'indextts' }])).toThrow(/mode|params|proof/);
  });
});

describe('updateCharacter', () => {
  it('strips voice.identity, voice.samples and voice.selectedSampleId from any patch; the profile part is kept', () => {
    const { state, uploaded } = withUpload();
    const s = setVoiceIdentity(state, 'nour', identityInput(uploaded.id));
    const before = ch(s, 'nour').voice;
    const after = ch(updateCharacter(s, 'nour', { voice: { pitch: 'HIGH', pace: 'QUICK', timbre: 'bright', notes: 'n', samples: [], selectedSampleId: 'proof-1', identity: undefined } }), 'nour').voice;
    expect(after.identity).toEqual(before.identity);
    expect(after.samples).toEqual(before.samples);
    expect(after.selectedSampleId).toBe(before.selectedSampleId);
    expect(after.pitch).toBe('HIGH'); expect(after.timbre).toBe('bright');
    // through the command path with a whole-form voice object (what the form sends)
    const viaCmd = runCommand(s, cmd('updateCharacter', ['nour', { voice: { ...before, identity: { ...before.identity!, model: 'habibi' }, samples: [] } }])).state;
    expect(ch(viaCmd, 'nour').voice.identity!.model).toBe('indextts');
  });
  it('a language or dialect change makes an unused character’s identity STALE and is refused VOICE_LOCKED for a used one', () => {
    const { state, uploaded } = withUpload();
    const s = setVoiceIdentity(state, 'nour', { ...identityInput(uploaded.id), language: ch(state, 'nour').language, dialect: ch(state, 'nour').dialect });
    const own = ch(s, 'nour');
    const other = own.language === 'AR' ? 'EN' : 'AR';
    expect(own.voice.identity!.status).toBe('ACTIVE');
    const changed = updateCharacter(s, 'nour', { language: other });
    expect(ch(changed, 'nour').voice.identity!.status).toBe('STALE');
    expect(ch(changed, 'nour').dialect).toBe(other === 'AR' ? seed().settings.defaults.dialect : undefined);
    // the same language again is not a change; neither is a profile edit
    expect(ch(updateCharacter(s, 'nour', { language: own.language, dialect: own.dialect }), 'nour').voice.identity!.status).toBe('ACTIVE');
    expect(ch(updateCharacter(s, 'nour', { role: 'lead' }), 'nour').voice.identity!.status).toBe('ACTIVE');
    // a dialect change alone (Arabic) stales it too
    if (own.language === 'AR') expect(ch(updateCharacter(s, 'nour', { dialect: own.dialect === 'MSA' ? 'GULF' : 'MSA' }), 'nour').voice.identity!.status).toBe('STALE');
    // a used character: the identity is preserved, so the language cannot move from under it
    const used: StudioState = { ...s, characters: s.characters.map((c) => (c.id === 'nour' ? { ...c, usage: { known: true, videos: [{ productionId: 'p', productionTitle: 'P', shotId: 'sh', shotLabel: '1.1', takeId: 't', takeLabel: 'Take 1', recordedAt: 'x', status: 'IN_TAKE' }] } } : c)) };
    expect(voiceLock(ch(used, 'nour')).locked).toBe(true);
    expect(codeOf(() => updateCharacter(used, 'nour', { language: other }))).toBe('VOICE_LOCKED');
    expect(codeOf(() => updateCharacter(used, 'nour', { role: 'still fine' }))).toBeNull();
  });
});

describe('setVoiceIdentity', () => {
  it('requires the proof (a stored GENERATED sample), refuses GENERATED/SAMPLE references, increments the revision once per success and never on failure', () => {
    const { state, uploaded } = withUpload();
    const noProof = { ...identityInput(uploaded.id), proof: undefined };
    expect(codeOf(() => setVoiceIdentity(state, 'nour', noProof))).toBe('INVALID');
    expect(codeOf(() => setVoiceIdentity(state, 'nour', { ...identityInput(uploaded.id), proof: { sampleId: 'missing', assetId: 'gen-proof', text: 'x' } }))).toBe('INVALID');
    expect(codeOf(() => setVoiceIdentity(state, 'nour', { ...identityInput(uploaded.id), referenceSampleId: 'proof-1', referenceAssetId: 'gen-proof' }))).toBe('INVALID');
    expect(codeOf(() => setVoiceIdentity(state, 'nour', { ...identityInput(uploaded.id), referenceSampleId: 'v-low', referenceAssetId: 'voice-low' }))).toBe('INVALID');
    expect(codeOf(() => setVoiceIdentity(state, 'nour', { ...identityInput(uploaded.id), mode: 'MANUAL', providerVoiceId: undefined }))).toBe('INVALID');
    expect(ch(state, 'nour').voice.identity).toBeUndefined();
    const s1 = setVoiceIdentity(state, 'nour', identityInput(uploaded.id));
    const id1 = ch(s1, 'nour').voice.identity!;
    expect(id1).toMatchObject({ revision: 1, status: 'ACTIVE', mode: 'REFERENCE', referenceAssetId: 'up-ref', referenceSampleId: uploaded.id, proof: { sampleId: 'proof-1', assetId: 'gen-proof' }, params: { speed: 1, seed: 7 }, jobId: 'job-1' });
    expect(id1.createdAt).toBeTruthy();
    const s2 = setVoiceIdentity(s1, 'nour', { ...identityInput(uploaded.id), status: 'REVIEW' });
    expect(ch(s2, 'nour').voice.identity).toMatchObject({ revision: 2, status: 'REVIEW' });
  });
  it('the proof line is never the chosen recording: a selected proof is unselected when the identity is pinned', () => {
    const { state, uploaded } = withUpload();
    const chosenProof: StudioState = { ...state, characters: state.characters.map((c) => (c.id === 'nour' ? { ...c, voice: { ...c.voice, selectedSampleId: 'proof-1' } } : c)) };
    const s = setVoiceIdentity(chosenProof, 'nour', identityInput(uploaded.id));
    expect(ch(s, 'nour').voice.selectedSampleId).toBeUndefined();
  });
});

describe('selectVoiceSample, addVoiceSample(select), removeVoiceSample', () => {
  it('refuses a GENERATED line and a bundled SAMPLE as the voice; accepts the upload', () => {
    const { state, uploaded } = withUpload();
    expect(codeOf(() => selectVoiceSample(state, 'nour', 'proof-1'))).toBe('INVALID');
    expect(codeOf(() => selectVoiceSample(state, 'nour', 'v-low'))).toBe('INVALID');
    expect(ch(selectVoiceSample(state, 'nour', uploaded.id), 'nour').voice.selectedSampleId).toBe(uploaded.id);
    expect(ch(selectVoiceSample(state, 'nour', undefined), 'nour').voice.selectedSampleId).toBeUndefined();
    expect(codeOf(() => addVoiceSample(state, 'nour', { label: 'g', assetId: 'gen-proof', source: 'GENERATED' }, true))).toBe('INVALID');
    expect(codeOf(() => addVoiceSample(state, 'nour', { label: 'g', assetId: 'gen-proof', source: 'GENERATED' }, false))).toBeNull();
  });
  it('removing the identity’s reference sample stales the identity of an unused character', () => {
    const { state, uploaded } = withUpload();
    const s = setVoiceIdentity(state, 'nour', identityInput(uploaded.id));
    const after = removeVoiceSample(s, 'nour', uploaded.id);
    expect(ch(after, 'nour').voice.identity!.status).toBe('STALE');
  });
  it('updateVoiceSample stores the transcript once', () => {
    const { state, uploaded } = withUpload();
    const s = updateVoiceSample(state, 'nour', uploaded.id, { text: 'what it says', language: 'EN' });
    expect(ch(s, 'nour').voice.samples.find((x) => x.id === uploaded.id)).toMatchObject({ text: 'what it says', language: 'EN' });
  });
});

describe('deleteAsset and the voice', () => {
  it('refuses the identity reference of a used character (ASSET_PROTECTED, reason VOICE) and stales it for an unused one', () => {
    const { state, uploaded } = withUpload();
    const s = setVoiceIdentity(state, 'nour', identityInput(uploaded.id));
    const after = deleteAsset(s, 'up-ref');
    expect(after.assets.some((a) => a.id === 'up-ref')).toBe(false);
    expect(ch(after, 'nour').voice.identity).toMatchObject({ status: 'STALE', referenceAssetId: undefined });
    expect(ch(after, 'nour').voice.samples.some((x) => x.id === uploaded.id)).toBe(false);
    const used: StudioState = { ...s, characters: s.characters.map((c) => (c.id === 'nour' ? { ...c, usage: { known: true, videos: [{ productionId: 'p', productionTitle: 'P', shotId: 'sh', shotLabel: '1.1', takeId: 't', takeLabel: 'Take 1', recordedAt: 'x', status: 'IN_TAKE' }] } } : c)) };
    expect(protectedVoiceAssetOwner(used, 'up-ref')?.id).toBe('nour');
    try { deleteAsset(used, 'up-ref'); throw new Error('not refused'); } catch (e) { expect(e).toBeInstanceOf(StudioError); expect((e as StudioError).code).toBe('ASSET_PROTECTED'); expect((e as StudioError).details?.reason).toBe('VOICE'); }
    // deleting the proof line's file leaves the identity speaking but unproven
    expect(ch(deleteAsset(s, 'gen-proof'), 'nour').voice.identity!.status).toBe('REVIEW');
  });
});

describe('normalizeVoice (rows written before the contract)', () => {
  it('fills mode, params and status for a legacy identity, derives the proof from the generated line, and leaves a current identity alone', () => {
    const legacy = { pitch: 'MID', pace: 'MEASURED', timbre: '', notes: '', samples: [{ id: 'gen-1', label: 'Studio voice', assetId: 'gen-a', source: 'GENERATED', text: 'hello', jobId: 'j' }], selectedSampleId: 'gen-1', identity: { provider: 'LOCAL_TTS', model: 'habibi', referenceAssetId: 'up-1', revision: 1, language: 'AR', dialect: 'IRAQI_BAGHDADI', createdAt: 'x' } } as unknown as Voice;
    const v = normalizeVoice(legacy);
    expect(v.identity).toMatchObject({ mode: 'REFERENCE', status: 'ACTIVE', params: { speed: 1, emotionAlpha: 1 }, proof: { sampleId: 'gen-1', assetId: 'gen-a', text: 'hello' }, revision: 1 });
    const noProof = normalizeVoice({ ...legacy, samples: [] });
    expect(noProof.identity!.status).toBe('REVIEW');
    expect(noProof.identity!.proof).toBeUndefined();
    const current = { ...legacy, identity: { ...legacy.identity!, mode: 'AUTOMATIC', params: { speed: 0.9, emotionAlpha: 1 }, status: 'STALE' } } as Voice;
    expect(normalizeVoice(current).identity).toBe(current.identity);
    expect(normalizeVoice(null).samples).toEqual([]);
    expect(normalizeVoice({ pitch: 'LOW' } as Voice)).toMatchObject({ pitch: 'LOW', pace: 'MEASURED', samples: [] });
  });
});
