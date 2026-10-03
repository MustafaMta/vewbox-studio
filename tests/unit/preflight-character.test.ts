import { describe, expect, it } from 'vitest';
import { seed } from '@/domain/sample';
import { addAsset, addVoiceRecording, addVoiceSample, confirmVoiceConsent, setPendingReference } from '@/domain/actions';
import { preflightCharacter, referenceAudioProblem, referenceImageProblem } from '@/server/org/preflight';
import type { StudioState } from '@/domain/types';

/** Character jobs are refused before they are queued when their reference is unusable: MISSING_REFERENCE names what
 *  to upload (the enqueue path and the CREATE_CHARACTER orchestrator both call this). */

const ch = (s: StudioState, id: string) => s.characters.find((c) => c.id === id)!;
const upload = (s: StudioState, id: string, kind: 'IMAGE' | 'AUDIO', extra: Record<string, unknown> = {}) => addAsset(s, { id, kind, src: `/api/media/${id}`, label: id, tags: [], sample: false, origin: 'UPLOAD', ...extra }).state;

describe('referenceImageProblem', () => {
  it('needs an uploaded picture of at least 512 px that exists and passed validation', () => {
    let s = seed();
    expect(referenceImageProblem(s, undefined)).toMatch(/no reference/);
    expect(referenceImageProblem(s, 'nope')).toMatch(/no longer exists/);
    expect(referenceImageProblem(s, 'ref-nour-side')).toMatch(/sample/);
    s = upload(s, 'up-small', 'IMAGE', { width: 300, height: 400 });
    expect(referenceImageProblem(s, 'up-small')).toMatch(/512/);
    s = upload(s, 'up-ok', 'IMAGE', { width: 1024, height: 1280 });
    expect(referenceImageProblem(s, 'up-ok')).toBeNull();
    expect(referenceImageProblem(s, 'up-ok', { ok: false, reasons: ['no face found'] })).toMatch(/no face found/);
    s = upload(s, 'up-gone', 'IMAGE', { width: 1024, height: 1280, unavailable: true });
    expect(referenceImageProblem(s, 'up-gone')).toMatch(/missing/);
  });
});

describe('preflightCharacter', () => {
  it('CHARACTER_APPEARANCE with an unusable pending reference fails MISSING_REFERENCE; a usable one passes', () => {
    let s = upload(seed(), 'up-ok', 'IMAGE', { width: 1024, height: 1280 });
    s = setPendingReference(s, 'nour', 'up-ok');
    expect(preflightCharacter(s, ch(s, 'nour'), 'CHARACTER_APPEARANCE').ok).toBe(true);
    // the file went away after it was chosen
    const gone: StudioState = { ...s, assets: s.assets.map((a) => (a.id === 'up-ok' ? { ...a, unavailable: true } : a)) };
    const r = preflightCharacter(gone, ch(gone, 'nour'), 'CHARACTER_APPEARANCE');
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.name === 'reference-picture-usable')).toMatchObject({ ok: false, failureClass: 'MISSING_REFERENCE' });
    // a bundled sample smuggled in as the pending reference
    const sample: StudioState = { ...s, characters: s.characters.map((c) => (c.id === 'nour' ? { ...c, pendingReference: { assetId: 'ref-nour-side', addedAt: 'x' } } : c)) };
    expect(preflightCharacter(sample, ch(sample, 'nour'), 'CHARACTER_APPEARANCE').checks.find((c) => c.name === 'reference-picture-usable')!.ok).toBe(false);
    // a used character cannot be redrawn at all
    expect(preflightCharacter(s, ch(s, 'layla'), 'CHARACTER_APPEARANCE').checks.find((c) => c.name === 'appearance-unlocked')!.ok).toBe(false);
  });
  it('VOICE_BUILD AUTOMATIC: a consented recording, else a design (EN/MSA), else the Iraqi refusal; REFERENCE needs that very consented upload; GENERATED and SAMPLE never count', () => {
    let s = seed();
    // nour speaks MSA and has no recording: AUTOMATIC designs her voice (contract v2 §2)
    const none = preflightCharacter(s, ch(s, 'nour'), 'VOICE_BUILD', { mode: 'AUTOMATIC' });
    expect(none.ok).toBe(true);
    expect(none.checks.find((c) => c.name === 'automatic-voice-source')!.detail).toMatch(/designing a voice from Nour’s profile/);
    // an Iraqi character without an Iraqi recording: refused with the contract's sentence (unless the experiment is on)
    const iraqi = ch(s, 'layla');
    expect(iraqi.dialect).toBe('IRAQI_BAGHDADI');
    const voiceless: StudioState = { ...s, characters: s.characters.map((c) => (c.id === 'layla' ? { ...c, usage: { known: true, videos: [] }, voice: { ...c.voice, samples: [], selectedSampleId: undefined, identity: undefined } } : c)) };
    const refused = preflightCharacter(voiceless, ch(voiceless, 'layla'), 'VOICE_BUILD', { mode: 'AUTOMATIC' });
    expect(refused.checks.find((c) => c.name === 'automatic-voice-source')).toMatchObject({ ok: false, failureClass: 'MISSING_REFERENCE', detail: 'Iraqi voices are cloned from a real Iraqi recording — record or upload 5–12 seconds of the voice.' });
    const experiment: StudioState = { ...voiceless, settings: { ...voiceless.settings, generation: { allowDesignedIraqi: true } } };
    expect(preflightCharacter(experiment, ch(experiment, 'layla'), 'VOICE_BUILD', { mode: 'AUTOMATIC' }).checks.find((c) => c.name === 'automatic-voice-source')).toMatchObject({ ok: true, detail: expect.stringMatching(/experiment/) });
    s = upload(s, 'up-rec', 'AUDIO');
    s = addVoiceRecording(s, 'nour', 'up-rec', 'take');
    const rec = ch(s, 'nour').voice.samples.at(-1)!;
    s = upload(s, 'gen-x', 'AUDIO', { origin: 'GENERATED' });
    s = addVoiceSample(s, 'nour', { id: 'gen-s', label: 'proof', assetId: 'gen-x', source: 'GENERATED' }).state;
    // a recording uploaded before consent existed is not cloned silently, nor designed over: CONSENT_REQUIRED
    expect(preflightCharacter(s, ch(s, 'nour'), 'VOICE_BUILD', { mode: 'AUTOMATIC' }).checks.find((c) => c.name === 'automatic-voice-source')).toMatchObject({ ok: false, failureClass: 'INVALID_INPUT' });
    expect(preflightCharacter(s, ch(s, 'nour'), 'VOICE_BUILD', { mode: 'REFERENCE', referenceSampleId: rec.id }).checks.find((c) => c.name === 'reference-recording-consented')).toMatchObject({ ok: false, failureClass: 'INVALID_INPUT' });
    s = confirmVoiceConsent(s, 'nour', rec.id, 'MY_VOICE');
    expect(preflightCharacter(s, ch(s, 'nour'), 'VOICE_BUILD', { mode: 'AUTOMATIC' }).checks.find((c) => c.name === 'automatic-voice-source')!.detail).toMatch(/consented recording “take”/);
    expect(preflightCharacter(s, ch(s, 'nour'), 'VOICE_BUILD', { mode: 'REFERENCE', referenceSampleId: rec.id }).ok).toBe(true);
    expect(preflightCharacter(s, ch(s, 'nour'), 'VOICE_BUILD', { mode: 'REFERENCE', referenceSampleId: 'gen-s' }).checks.find((c) => c.name === 'reference-recording-usable')).toMatchObject({ ok: false, failureClass: 'MISSING_REFERENCE' });
    expect(preflightCharacter(s, ch(s, 'nour'), 'VOICE_BUILD', { mode: 'REFERENCE', referenceSampleId: 'v-low' }).ok).toBe(false);
    expect(referenceAudioProblem(s, ch(s, 'nour').voice.samples.find((x) => x.id === 'v-low'))).toMatch(/bundled sample/);
    expect(referenceAudioProblem(s, ch(s, 'nour').voice.samples.find((x) => x.id === 'gen-s'))).toMatch(/generated line/);
    expect(preflightCharacter(s, ch(s, 'nour'), 'VOICE_BUILD', { mode: 'MANUAL' }).checks.find((c) => c.name === 'catalogue-voice-named')!.ok).toBe(false);
    expect(preflightCharacter(s, ch(s, 'nour'), 'VOICE_BUILD', { mode: 'MANUAL', providerVoiceId: 'voice-1' }).ok).toBe(true);
  });
});
