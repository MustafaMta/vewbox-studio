import { describe, expect, it } from 'vitest';
import { seed } from '@/domain/sample';
import { recordVoiceListening, setSpokenLanguages, setVoiceIdentity, addAsset, addVoiceSample, type VoiceIdentityInput } from '@/domain/actions';
import { StudioError } from '@/domain/errors';
import { describeVoiceFromProfile, languageProfileNotes, speakingAs, spokenLanguages } from '@/domain/voice-identity';
import type { Character, StudioState } from '@/domain/types';

/** ONE VOICE, SEVERAL LANGUAGES (Phase 1, 2026-10-09): a character speaks English and Iraqi Arabic with one voice
 *  identity — one reference, one set of parameters — and each language has its own engine (Iraqi: Habibi, MOSS heard
 *  once beside it for comparison) and its own listener state. */

const ch = (s: StudioState, id: string): Character => s.characters.find((c) => c.id === id)!;
const codeOf = (fn: () => unknown) => { try { fn(); return null; } catch (e) { return e instanceof StudioError ? e.code : 'OTHER'; } };
const IRAQI = { language: 'AR' as const, dialect: 'IRAQI_BAGHDADI' as const };
const EN = { language: 'EN' as const };

/** nour as an unused English speaker with a stored proof line */
function english(): StudioState {
  let s = seed();
  s = { ...s, characters: s.characters.map((c) => (c.id === 'nour' ? { ...c, language: 'EN', dialect: undefined, usage: { known: true, videos: [] }, voice: { pitch: 'MID', pace: 'MEASURED', timbre: 'warm', notes: '', samples: [] } } : c)) };
  s = addAsset(s, { id: 'gen-proof', kind: 'AUDIO', src: '/api/media/gen-proof', label: 'proof', tags: [], sample: false, origin: 'GENERATED' }).state;
  s = addAsset(s, { id: 'up-1', kind: 'AUDIO', src: '/api/media/up-1', label: 'rec', tags: [], sample: false, origin: 'UPLOAD' }).state;
  s = addVoiceSample(s, 'nour', { id: 'up-s', label: 'rec', assetId: 'up-1', source: 'UPLOADED', consent: { statement: 'MY_VOICE', by: 'PRODUCER', at: '2026-10-09T00:00:00.000Z' } }).state;
  return addVoiceSample(s, 'nour', { id: 'proof-1', label: 'proof', assetId: 'gen-proof', source: 'GENERATED', text: 'Hello.' }).state;
}
const identity = (over: Partial<VoiceIdentityInput> = {}): VoiceIdentityInput => ({ provider: 'LOCAL_TTS', model: 'moss', mode: 'REFERENCE', origin: 'UPLOAD_CONSENTED', referenceSampleId: 'up-s', referenceAssetId: 'up-1', language: 'EN', params: { speed: 1, emotionAlpha: 1, seed: 7 }, proof: { sampleId: 'proof-1', assetId: 'gen-proof', text: 'Hello.' }, ...over });
const profiles = [{ ...EN, engine: 'moss', status: 'PRIMARY' as const }, { ...IRAQI, engine: 'habibi', comparisonEngines: ['moss'], status: 'LISTENER_APPROVED' as const }];

describe('the languages a character speaks', () => {
  it('its own first, then the others once; an Arabic one names its dialect', () => {
    const s = setSpokenLanguages(english(), 'nour', [EN, IRAQI, IRAQI]);
    expect(spokenLanguages(ch(s, 'nour'))).toEqual([EN, IRAQI]);
    expect(codeOf(() => setSpokenLanguages(english(), 'nour', [IRAQI, EN]))).toBe('INVALID');
    expect(codeOf(() => setSpokenLanguages(english(), 'nour', [EN, { language: 'AR' }]))).toBe('INVALID');
  });
  it('a whole-form save never replaces them', async () => {
    const { updateCharacter } = await import('@/domain/actions');
    const s = setSpokenLanguages(english(), 'nour', [EN, IRAQI]);
    const after = updateCharacter(s, 'nour', { voice: { ...ch(s, 'nour').voice, languages: [EN] } });
    expect(ch(after, 'nour').voice.languages).toEqual([EN, IRAQI]);
  });
  it('the design description names a bilingual speaker, never Iraqi as Modern Standard Arabic', () => {
    const c = ch(setSpokenLanguages(english(), 'nour', [EN, IRAQI]), 'nour');
    expect(describeVoiceFromProfile(c)).toMatch(/speaking English \(bilingual, also speaks Iraqi Arabic\)/);
    expect(describeVoiceFromProfile(c)).not.toMatch(/Modern Standard/);
  });
});

describe('one voice identity, a profile per language', () => {
  it('its own language is PRIMARY, another is REVIEW whatever the caller says; a language the character does not speak is refused', () => {
    const s = setSpokenLanguages(english(), 'nour', [EN, IRAQI]);
    const v = ch(setVoiceIdentity(s, 'nour', identity({ languageProfiles: profiles })), 'nour').voice.identity!;
    expect(v.languageProfiles!.map((p) => p.status)).toEqual(['PRIMARY', 'REVIEW']);
    expect(codeOf(() => setVoiceIdentity(english(), 'nour', identity({ languageProfiles: profiles })))).toBe('INVALID');
    expect(codeOf(() => setVoiceIdentity(s, 'nour', identity({ languageProfiles: [profiles[1], profiles[0]] })))).toBe('INVALID');
  });
  it('a listener judges another language: dialect AND same person approve it, a no to either rejects it', () => {
    const s = setVoiceIdentity(setSpokenLanguages(english(), 'nour', [EN, IRAQI]), 'nour', identity({ languageProfiles: profiles }));
    const status = (st: StudioState) => ch(st, 'nour').voice.identity!.languageProfiles![1].status;
    expect(status(recordVoiceListening(s, 'nour', { natural: 4, ...IRAQI, dialectAuthentic: true }))).toBe('REVIEW');
    expect(status(recordVoiceListening(s, 'nour', { natural: 4, ...IRAQI, dialectAuthentic: true, samePerson: true }))).toBe('LISTENER_APPROVED');
    expect(status(recordVoiceListening(s, 'nour', { natural: 2, ...IRAQI, dialectAuthentic: true, samePerson: false }))).toBe('LISTENER_REJECTED');
    // the identity's own language keeps its own record; same-person is asked only of another language
    expect(codeOf(() => recordVoiceListening(s, 'nour', { natural: 4, samePerson: true }))).toBe('INVALID');
    expect(codeOf(() => recordVoiceListening(s, 'nour', { natural: 4, language: 'AR', dialect: 'EGYPTIAN' }))).toBe('INVALID');
  });
  it('a language the built voice has no profile for is added to the SAME identity (same revision), REVIEW; nothing twice', async () => {
    const { addVoiceLanguageProfiles } = await import('@/domain/actions');
    const built = setVoiceIdentity(english(), 'nour', identity());
    const s = setSpokenLanguages(built, 'nour', [EN, IRAQI]);
    const after = addVoiceLanguageProfiles(s, 'nour', [{ ...IRAQI, engine: 'habibi', comparisonEngines: ['moss'], status: 'LISTENER_APPROVED' }]);
    const v = ch(after, 'nour').voice.identity!;
    expect(v.revision).toBe(ch(built, 'nour').voice.identity!.revision);
    expect(v.languageProfiles).toEqual([{ ...EN, engine: 'moss', status: 'PRIMARY' }, { ...IRAQI, engine: 'habibi', comparisonEngines: ['moss'], status: 'REVIEW' }]);
    expect(codeOf(() => addVoiceLanguageProfiles(after, 'nour', [{ ...IRAQI, engine: 'habibi', status: 'REVIEW' }]))).toBe('CONFLICT');
    expect(codeOf(() => addVoiceLanguageProfiles(built, 'nour', [{ ...IRAQI, engine: 'habibi', status: 'REVIEW' }]))).toBe('INVALID');
  });
  it('a designed seed speaking Iraqi says what no measurement can claim', () => {
    expect(languageProfileNotes('DESIGNED', IRAQI).join(' | ')).toMatch(/native listener.*validation only.*consented Baghdadi recording.*same person/);
  });
});

describe('speaking a line as the character in one of its languages', () => {
  const c = () => ch(setVoiceIdentity(setSpokenLanguages(english(), 'nour', [EN, IRAQI]), 'nour', identity({ languageProfiles: profiles })), 'nour');
  it('its own language: the character itself, the routed engine', () => {
    const r = speakingAs(c(), {});
    expect(r).toMatchObject({ role: 'PRODUCTION', engine: undefined });
    expect(r.character.language).toBe('EN');
  });
  it('Iraqi: the same character speaking Iraqi through Habibi; MOSS only when named, as a COMPARISON', () => {
    const one = c();
    const r = speakingAs(one, IRAQI);
    expect(r).toMatchObject({ engine: 'habibi', role: 'PRODUCTION' });
    expect(r.character).toMatchObject({ language: 'AR', dialect: 'IRAQI_BAGHDADI' });
    expect(r.character.voice).toBe(one.voice);
    expect(speakingAs(c(), { ...IRAQI, engine: 'moss' })).toMatchObject({ engine: 'moss', role: 'COMPARISON' });
  });
  it('an engine the profile does not name, or a language the character does not speak, is refused', () => {
    expect(codeOf(() => speakingAs(c(), { ...IRAQI, engine: 'fish-s2-pro' }))).toBe('INVALID');
    expect(codeOf(() => speakingAs(c(), { language: 'AR', dialect: 'EGYPTIAN' }))).toBe('INVALID');
  });
});
