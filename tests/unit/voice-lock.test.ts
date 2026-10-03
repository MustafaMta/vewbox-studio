import { describe, expect, it } from 'vitest';
import { seed } from '@/domain/sample';
import { addAsset, addVoiceSample, selectVoiceSample, setVoiceIdentity, acceptProposal, removeVoiceSample } from '@/domain/actions';
import { voiceBuildLockProblem, voiceLock } from '@/domain/rules';
import { preflightCharacter } from '@/server/org/preflight';
import { sampleProposal } from '@/domain/proposals';
import type { Character, StudioState } from '@/domain/types';

/** The voice rule: a character who has spoken in a video keeps the voice; one who has not can still be given one. */

const base = (): StudioState => seed();
const CONSENT = { statement: 'MY_VOICE' as const, by: 'PRODUCER' as const, at: '2026-10-03T00:00:00.000Z' };
const used = (s: StudioState): Character => s.characters.find((c) => c.usage?.known && c.usage.videos.length > 0 && c.voice.selectedSampleId)!;
const unused = (s: StudioState): Character => s.characters.find((c) => c.usage?.known && c.usage.videos.length === 0)!;

describe('voice lock', () => {
  it('a used character with a chosen voice is locked; an unused one is not', () => {
    const s = base();
    expect(voiceLock(used(s)).locked).toBe(true);
    expect(voiceLock(unused(s)).locked).toBe(false);
  });
  it('refuses to change the chosen recording, rebuild the identity or remove the chosen sample of a used character', () => {
    const s = base(); const c = used(s);
    const other = c.voice.samples.find((x) => x.id !== c.voice.selectedSampleId && x.assetId);
    if (other) expect(() => selectVoiceSample(s, c.id, other.id)).toThrow(/voice is preserved/);
    expect(() => addVoiceSample(s, c.id, { label: 'new', assetId: 'up-x', source: 'UPLOADED' }, true)).toThrow(/VOICE|preserved/);
    expect(() => removeVoiceSample(s, c.id, c.voice.selectedSampleId!)).toThrow(/preserved/);
    const withIdentity: StudioState = { ...s, characters: s.characters.map((x) => (x.id === c.id ? { ...x, voice: { ...x.voice, identity: { provider: 'LOCAL_TTS', model: 'indextts', mode: 'REFERENCE', params: { speed: 1, emotionAlpha: 1 }, status: 'ACTIVE', revision: 1, language: 'EN', createdAt: '2026-01-01T00:00:00Z' } } } : x)) };
    expect(() => setVoiceIdentity(withIdentity, c.id, { provider: 'LOCAL_TTS', model: 'habibi', mode: 'REFERENCE', language: 'EN', params: { speed: 1, emotionAlpha: 1 }, proof: { sampleId: 'x', assetId: 'y', text: 'z' } })).toThrow(/preserved/);
    // listening lines can still be added, just not chosen
    expect(addVoiceSample(s, c.id, { label: 'preview', assetId: 'up-y', source: 'GENERATED' }).sample.id).toBeTruthy();
  });
  it('a used character without any voice can still be given one (no continuity to break)', () => {
    const s0 = base(); const c = used(s0);
    const s = addAsset(s0, { id: 'up-z', kind: 'AUDIO', src: '/api/media/up-z', label: 'rec', tags: [], sample: false, origin: 'UPLOAD' }).state;
    const voiceless: StudioState = { ...s, characters: s.characters.map((x) => (x.id === c.id ? { ...x, voice: { ...x.voice, samples: [], selectedSampleId: undefined, identity: undefined } } : x)) };
    const r = addVoiceSample(voiceless, c.id, { label: 'first', assetId: 'up-z', source: 'UPLOADED', consent: CONSENT }, true);
    expect(r.state.characters.find((x) => x.id === c.id)!.voice.selectedSampleId).toBe(r.sample.id);
    const withProof = addVoiceSample(r.state, c.id, { id: 'proof-1', label: 'proof', assetId: 'gen-proof', source: 'GENERATED', text: 'hello' }).state;
    expect(() => setVoiceIdentity(withProof, c.id, { provider: 'LOCAL_TTS', model: 'indextts', mode: 'REFERENCE', origin: 'UPLOAD_CONSENTED', referenceSampleId: r.sample.id, referenceAssetId: 'up-z', language: 'EN', params: { speed: 1, emotionAlpha: 1 }, proof: { sampleId: 'proof-1', assetId: 'gen-proof', text: 'hello' } })).not.toThrow();
  });
});

describe('voice lock by the chosen recording alone (finding 8)', () => {
  /** A character who spoke in a video with recording A chosen and no identity yet, with a second upload B. */
  const lockedToA = () => {
    let s = base();
    const c = used(s);
    s = addAsset(s, { id: 'up-a', kind: 'AUDIO', src: '/api/media/up-a', label: 'A', tags: [], sample: false, origin: 'UPLOAD' }).state;
    s = addAsset(s, { id: 'up-b', kind: 'AUDIO', src: '/api/media/up-b', label: 'B', tags: [], sample: false, origin: 'UPLOAD' }).state;
    s = addAsset(s, { id: 'gen-proof', kind: 'AUDIO', src: '/api/media/gen-proof', label: 'proof', tags: [], sample: false, origin: 'GENERATED' }).state;
    s = { ...s, characters: s.characters.map((x) => (x.id === c.id ? { ...x, voice: { ...x.voice, identity: undefined, selectedSampleId: 's-a', samples: [{ id: 's-a', label: 'A', assetId: 'up-a', source: 'UPLOADED' as const, consent: CONSENT }, { id: 's-b', label: 'B', assetId: 'up-b', source: 'UPLOADED' as const, consent: CONSENT }, { id: 'proof-1', label: 'proof', assetId: 'gen-proof', source: 'GENERATED' as const }] } } : x)) };
    return { s, id: c.id };
  };
  const identity = (referenceSampleId: string | undefined, referenceAssetId: string | undefined) => ({ provider: 'LOCAL_TTS' as const, model: 'indextts', mode: 'REFERENCE' as const, origin: 'UPLOAD_CONSENTED' as const, referenceSampleId, referenceAssetId, language: 'EN' as const, params: { speed: 1, emotionAlpha: 1 }, proof: { sampleId: 'proof-1', assetId: 'gen-proof', text: 'hello' } });

  it('the rule: only the chosen recording may be pinned; any other upload, or a catalogue voice, is VOICE_LOCKED', () => {
    const { s, id } = lockedToA();
    const c = s.characters.find((x) => x.id === id)!;
    expect(voiceLock(c).locked).toBe(true);
    expect(voiceBuildLockProblem(c, 's-a')).toBeNull();
    expect(voiceBuildLockProblem(c, 's-b')).toMatch(/only be built from that recording/);
    expect(voiceBuildLockProblem(c, undefined)).toMatch(/only be built from that recording/);
  });
  it('setVoiceIdentity refuses an identity built from another upload, accepts the chosen one', () => {
    const { s, id } = lockedToA();
    expect(() => setVoiceIdentity(s, id, identity('s-b', 'up-b'))).toThrow(expect.objectContaining({ code: 'VOICE_LOCKED' }));
    expect(() => setVoiceIdentity(s, id, { ...identity(undefined, undefined), provider: 'MINIMAX', origin: 'HOSTED', mode: 'MANUAL', providerVoiceId: 'cat-1' })).toThrow(expect.objectContaining({ code: 'VOICE_LOCKED' }));
    const ok = setVoiceIdentity(s, id, identity('s-a', 'up-a'));
    expect(ok.characters.find((x) => x.id === id)!.voice.identity).toMatchObject({ referenceSampleId: 's-a', revision: 1 });
  });
  it('the enqueue preflight holds REFERENCE to the chosen recording and AUTOMATIC to it alone', () => {
    const { s, id } = lockedToA();
    const c = s.characters.find((x) => x.id === id)!;
    expect(preflightCharacter(s, c, 'VOICE_BUILD', { mode: 'REFERENCE', referenceSampleId: 's-b' }).checks.find((x) => x.name === 'voice-unlocked')!.ok).toBe(false);
    expect(preflightCharacter(s, c, 'VOICE_BUILD', { mode: 'REFERENCE', referenceSampleId: 's-a' }).ok).toBe(true);
    expect(preflightCharacter(s, c, 'VOICE_BUILD', { mode: 'AUTOMATIC' }).ok).toBe(true);
    expect(preflightCharacter(s, c, 'VOICE_BUILD', { mode: 'MANUAL', providerVoiceId: 'cat-1' }).checks.find((x) => x.name === 'voice-unlocked')!.ok).toBe(false);
    // chosen recording is a bundled sample: nothing may be built at all
    const bundled: StudioState = { ...s, characters: s.characters.map((x) => (x.id === id ? { ...x, voice: { ...x.voice, selectedSampleId: 'v-bundled', samples: [...x.voice.samples, { id: 'v-bundled', label: 'bundled', assetId: 'up-a', source: 'SAMPLE' as const }] } } : x)) };
    const pre = preflightCharacter(bundled, bundled.characters.find((x) => x.id === id)!, 'VOICE_BUILD', { mode: 'AUTOMATIC' });
    expect(pre.ok).toBe(false);
    expect(pre.checks.find((x) => x.name === 'automatic-voice-source')!.detail).toMatch(/chosen recording/);
    // the chosen recording without a consent statement: AUTOMATIC is not silently designed instead — CONSENT_REQUIRED
    const unconsented: StudioState = { ...s, characters: s.characters.map((x) => (x.id === id ? { ...x, voice: { ...x.voice, samples: x.voice.samples.map((v) => ({ ...v, consent: undefined })) } } : x)) };
    const pre2 = preflightCharacter(unconsented, unconsented.characters.find((x) => x.id === id)!, 'VOICE_BUILD', { mode: 'AUTOMATIC' });
    expect(pre2.checks.find((x) => x.name === 'automatic-voice-source')).toMatchObject({ ok: false, failureClass: 'INVALID_INPUT', detail: expect.stringMatching(/consent statement/) });
    // a design cannot re-voice a character locked by its chosen recording
    expect(preflightCharacter(s, c, 'VOICE_DESIGN', {}).checks.find((x) => x.name === 'voice-unlocked')!.ok).toBe(false);
  });
});

describe('accepting a SEASON proposal', () => {
  it('adds the next season with its arc, its first episode, and grows the show cast by the newcomers kept', () => {
    const s = base();
    const show = s.shows[0];
    const before = s.seasons.filter((x) => x.showId === show.id).length;
    const proposal = sampleProposal(s, { kind: 'SEASON', showId: show.id, preferences: {} });
    const keepCast = proposal.cast.map((c) => c.key);
    const r = acceptProposal(s, { kind: 'SEASON', showId: show.id, aspect: show.aspect, proposal, keepCast, keepLocations: proposal.locations.map((l) => l.key), preferences: {} });
    const seasons = r.state.seasons.filter((x) => x.showId === show.id);
    expect(seasons).toHaveLength(before + 1);
    const season = seasons[seasons.length - 1];
    expect(season.number).toBe(before + 1);
    expect(season.title).toBe(proposal.title);
    expect(season.arc).toBe(proposal.premise);
    expect(r.production.kind).toBe('EPISODE');
    expect(r.production.seasonId).toBe(season.id);
    expect(r.production.episodeNumber).toBe(1);
    expect(r.production.language).toBe(show.language);
    const grown = r.state.shows.find((x) => x.id === show.id)!;
    expect(grown.castIds.length).toBeGreaterThanOrEqual(show.castIds.length);
  });
});
