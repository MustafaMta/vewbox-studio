import { describe, expect, it } from 'vitest';
import type { Asset, CanonicalImage, Character, Production } from '@/domain/types';
import type { Job } from '@/domain/jobs';
import { approval, canRedraw, identityStatus, imageJobs, imageKindOf, initialsOf, materialByTier, primaryImage, statusWords, usageGroups, voiceListened, voiceMeasures, voiceOrigin, voiceState, voiceTrackSource } from '@/components/character/identity';
import { designResultOf, designedIraqiAllowed, jobSecondary, secondaryPayload, voiceDescriptionOf, voiceExtras } from '@/components/character/contract';
import { ageBandOf, sheetAge, sheetPayload, sheetStepProblem, EMPTY_SHEET } from '@/components/character/sheetModel';
import { primaryImageSrc } from '@/studio/selectors';
import { KEYS, t, type Key } from '@/lib/i18n';
import type { StudioState } from '@/domain/types';

/** The cast profile's view-model (docs/CONTRACTS-IDENTITY-PACK.md v2): the status of the one canonical image, which
 *  picture is primary, what is drawing, which pictures show where by tier, the usage with image versions, the voice,
 *  and the written sheet that sends only what the producer chose. Pure functions; no React. */

const at = (d: number) => `2026-10-0${d}T10:00:00.000Z`;
const character = (p: Partial<Character> = {}): Character => ({
  id: 'samir', name: 'Samir Hassan', role: 'Kite seller', style: 'CARTOON', sex: 'MALE', ageYears: 66, build: '', face: '', hair: '', skin: '', eyes: '', distinguishing: [], wardrobe: '', personality: '', language: 'EN',
  voice: { pitch: 'LOW', pace: 'SLOW', timbre: '', notes: '', samples: [] }, refs: [], usage: { known: true, videos: [] }, createdAt: at(1), updatedAt: at(1), ...p,
});
const image = (p: Partial<CanonicalImage> = {}): CanonicalImage => ({ assetId: 'img-2', status: 'DRAFT', version: 2, generatedAt: at(2), ...p });
const asset = (id: string, p: Partial<Asset> = {}): Asset => ({ id, kind: 'IMAGE', src: `/api/media/${id}`, label: id, tags: [], sample: false, origin: 'GENERATED', createdAt: at(1), ...p });
const job = (p: Partial<Job> & Pick<Job, 'id' | 'type' | 'status'>): Job => ({ priority: 0, payload: {}, attempts: 1, maxAttempts: 1, cancelRequested: false, createdAt: at(3), updatedAt: at(3), characterId: 'samir', ...p });
const usedIn = (n: number) => ({ known: true, videos: Array.from({ length: n }, (_, i) => ({ productionId: `p${i}`, productionTitle: `Film ${i}`, shotId: `s${i}`, shotLabel: '1.1', takeId: `t${i}`, takeLabel: 'Take 1', recordedAt: at(2 + i), status: 'IN_TAKE' as const, canonicalImageVersion: 2 })) });

describe('the identity status, said once', () => {
  it('no image yet; an older close-up portrait stands in but is not a canonical identity', () => {
    expect(identityStatus(character()).kind).toBe('NONE');
    const legacy = identityStatus(character({ portraitAssetId: 'old' }));
    expect(legacy).toMatchObject({ kind: 'NONE', legacyPortrait: true });
  });
  it('a drawn image is a draft awaiting approval; approved once the producer approves', () => {
    expect(identityStatus(character({ canonicalImage: image() }))).toMatchObject({ kind: 'DRAFT', version: 2, imageStatus: 'DRAFT' });
    expect(identityStatus(character({ canonicalImage: image({ status: 'APPROVED', approvedAt: at(3) }) }))).toMatchObject({ kind: 'APPROVED', approvedAt: at(3) });
  });
  it('a character used in a video is locked whatever its image says, and an unknown history locks too', () => {
    const used = identityStatus(character({ canonicalImage: image({ status: 'APPROVED' }), usage: usedIn(2) }));
    expect(used).toMatchObject({ kind: 'LOCKED', videos: 2, imageStatus: 'APPROVED' });
    expect(used.lock.reason).toBe('USED');
    const filmedDraft = identityStatus(character({ canonicalImage: image(), usage: usedIn(1) }));
    expect(filmedDraft).toMatchObject({ kind: 'LOCKED', imageStatus: 'DRAFT' });
    expect(identityStatus(character({ usage: undefined })).lock.reason).toBe('UNKNOWN');
    expect(canRedraw(used)).toBe(false);
    expect(canRedraw(identityStatus(character({ canonicalImage: image() })))).toBe(true);
  });
  it('a failed check is carried with its notes; no check is not a failure', () => {
    expect(identityStatus(character({ canonicalImage: image({ check: { ok: false, notes: ['feet cut off'] } }) }))).toMatchObject({ checkFailed: true, checkNotes: ['feet cut off'] });
    expect(identityStatus(character({ canonicalImage: image() })).checkFailed).toBe(false);
    expect(identityStatus(character({ canonicalImage: image({ check: { ok: true } }) })).checkFailed).toBe(false);
  });
  it('words and tones: draft waits (warn), approved is done (ok), locked names its videos with the right number', () => {
    expect(statusWords(identityStatus(character({ canonicalImage: image() })))).toEqual({ short: 'cast.status.draft', long: 'cast.status.draftLong', tone: 'warn' });
    expect(statusWords(identityStatus(character({ canonicalImage: image({ status: 'APPROVED' }) }))).tone).toBe('ok');
    expect(statusWords(identityStatus(character({ usage: usedIn(1) }))).long).toBe('cast.status.lockedUsedOne');
    expect(statusWords(identityStatus(character({ usage: usedIn(3) }))).long).toBe('cast.status.lockedUsed');
    expect(statusWords(identityStatus(character({ usage: undefined }))).long).toBe('cast.status.lockedUnknown');
    expect(statusWords(identityStatus(character())).short).toBe('cast.status.none');
    expect(statusWords(identityStatus(character({ portraitAssetId: 'old' }))).short).toBe('cast.status.legacy');
  });
  it('every status phrase exists in English and in Arabic', () => {
    const keys: Key[] = ['cast.status.draft', 'cast.status.approved', 'cast.status.locked', 'cast.status.none', 'cast.status.draftLong', 'cast.status.approvedLong', 'cast.status.lockedUsed', 'cast.status.lockedUsedOne', 'cast.status.lockedUnknown', 'cast.status.noneLong', 'cast.step.design', 'cast.step.image', 'cast.step.voice', 'cast.step.approval'];
    for (const k of keys) {
      expect(KEYS).toContain(k);
      expect(t('ar', k)).toMatch(/[؀-ۿ]/);
      expect(t('en', k)).not.toMatch(/[؀-ۿ]/);
    }
    expect(t('en', 'cast.status.lockedUsed').replace('{n}', '2')).toBe('Locked: used in 2 videos');
    expect(t('ar', 'cast.status.draftLong')).toBe('مسودة — بانتظار موافقتك');
  });
});

describe('the primary image', () => {
  const assets = [asset('img-2', { tier: 'CANONICAL' }), asset('old')];
  it('is the canonical image, else the older portrait, else nothing — the same answer as the shared selector', () => {
    expect(primaryImage(character({ canonicalImage: image(), portraitAssetId: 'old' }), assets)).toMatchObject({ kind: 'CANONICAL', asset: { id: 'img-2' } });
    expect(primaryImage(character({ portraitAssetId: 'old' }), assets)).toMatchObject({ kind: 'PORTRAIT', asset: { id: 'old' } });
    expect(primaryImage(character(), assets)).toEqual({ kind: 'NONE' });
    expect(imageKindOf(character())).toBe('NONE');
    const state = { assets } as unknown as StudioState;
    expect(primaryImageSrc(state, character({ canonicalImage: image(), portraitAssetId: 'old' }))).toBe('/api/media/img-2');
    expect(primaryImageSrc(state, character({ portraitAssetId: 'old' }))).toBe('/api/media/old');
  });
  it('the honest placeholder uses initials, never a stock face', () => {
    expect(initialsOf('Samir Hassan')).toBe('SH');
    expect(initialsOf('ليلى حسن')).toBe('لح');
    expect(initialsOf('  ')).toBe('·');
  });
});

describe('drawing and approving', () => {
  const c = character({ canonicalImage: image({ generatedAt: at(2) }) });
  it('a running CHARACTER_APPEARANCE job is the image drawing; a failure counts only when nothing was drawn after it', () => {
    const running = job({ id: 'j1', type: 'CHARACTER_APPEARANCE', status: 'GENERATING' });
    expect(imageJobs(c, [running]).running?.id).toBe('j1');
    const oldFailure = job({ id: 'j0', type: 'CHARACTER_APPEARANCE', status: 'FAILED', createdAt: at(1) });
    expect(imageJobs(c, [oldFailure]).failed).toBeUndefined();
    const newFailure = job({ id: 'j2', type: 'CHARACTER_APPEARANCE', status: 'FAILED', createdAt: at(4) });
    expect(imageJobs(c, [oldFailure, newFailure]).failed?.id).toBe('j2');
    expect(imageJobs(c, [job({ id: 'x', type: 'CHARACTER_APPEARANCE', status: 'FAILED', characterId: 'other', createdAt: at(5) })]).failed).toBeUndefined();
  });
  it('approve is one action on a draft; a failed check asks for a reason; a drawing, an approval or a lock blocks it', () => {
    const draft = identityStatus(c);
    expect(approval(draft, false)).toEqual({ can: true, needsOverride: false, block: null });
    expect(approval(draft, true)).toMatchObject({ can: false, block: 'DRAWING' });
    expect(approval(identityStatus(character({ canonicalImage: image({ check: { ok: false } }) })), false)).toEqual({ can: true, needsOverride: true, block: null });
    expect(approval(identityStatus(character({ canonicalImage: image({ status: 'APPROVED' }) })), false).block).toBe('APPROVED');
    expect(approval(identityStatus(character({ canonicalImage: image(), usage: usedIn(1) })), false).block).toBe('LOCKED');
    expect(approval(identityStatus(character()), false).block).toBe('NONE');
  });
});

describe('which pictures show where, by tier', () => {
  const assets = [
    asset('img-2', { tier: 'CANONICAL' }), asset('img-1', { tier: 'CANONICAL' }), asset('raw-1', { tier: 'RAW' }), asset('old-portrait'),
    asset('expr', { tier: 'SECONDARY' }), asset('outfit'), asset('side'), asset('face'),
  ];
  const refs: Character['refs'] = [
    { id: 'r1', role: 'EXPRESSION', assetId: 'expr' }, { id: 'r2', role: 'OUTFIT', assetId: 'outfit' }, { id: 'r3', role: 'SIDE', assetId: 'side' },
    { id: 'r4', role: 'FACE', assetId: 'face' }, { id: 'r5', role: 'FRONT', assetId: 'raw-1' }, { id: 'r6', role: 'FRONT', assetId: 'img-1' }, { id: 'r7', role: 'FRONT', assetId: 'img-2' },
  ];
  it('the canonical image is never repeated as secondary; raw output, earlier versions and crops never show', () => {
    const m = materialByTier(character({ canonicalImage: image(), portraitAssetId: 'old-portrait', refs }), assets);
    expect(m.secondary.portrait.map((a) => a.id)).toEqual(['old-portrait']);
    expect(m.secondary.expressions.map((a) => a.id)).toEqual(['expr']);
    expect(m.secondary.outfits.map((a) => a.id)).toEqual(['outfit']);
    expect(m.secondary.earlier.map((a) => a.id)).toEqual(['side']);
    expect(m.secondaryCount).toBe(4);
    // raw-1 (RAW), img-1 (an earlier canonical version) and the face crop are counted, never shown
    expect(m.rawCount).toBe(3);
    const shown = Object.values(m.secondary).flat().map((a) => a.id);
    for (const hidden of ['img-2', 'img-1', 'raw-1', 'face']) expect(shown).not.toContain(hidden);
  });
  it('an older portrait is the primary image while there is no canonical one, so it is not secondary then', () => {
    const m = materialByTier(character({ portraitAssetId: 'old-portrait' }), assets);
    expect(m.secondary.portrait).toEqual([]);
    expect(m.secondaryCount).toBe(0);
  });
  it('secondary material is requested as CHARACTER_REFS roles, and read back from them', () => {
    expect(secondaryPayload('samir', ['EXPRESSION'])).toEqual({ characterId: 'samir', roles: ['EXPRESSION'] });
    expect(jobSecondary({ type: 'CHARACTER_REFS', payload: { characterId: 'samir', roles: ['OUTFIT', 'SIDE'] } })).toEqual(['OUTFIT']);
    expect(jobSecondary({ type: 'CHARACTER_APPEARANCE', payload: { characterId: 'samir' } })).toEqual([]);
  });
});

describe('usage and the voice', () => {
  it('groups the videos by production, newest first, with the image version each take was made with', () => {
    const p0 = { id: 'p0', title: 'Film 0' } as Production;
    const c = character({ usage: { known: true, videos: [...usedIn(2).videos, { ...usedIn(1).videos[0], takeId: 't9', canonicalImageVersion: 3, recordedAt: at(5) }] } });
    const g = usageGroups(c, [p0]);
    expect(g.map((x) => x.productionId)).toEqual(['p1', 'p0']);
    const film0 = g.find((x) => x.productionId === 'p0')!;
    expect(film0.production).toBe(p0);
    expect(film0.rows).toHaveLength(2);
    expect(film0.imageVersions).toEqual([2, 3]);
    expect(film0.firstAt).toBe(at(2));
  });
  it('the voice heard is the proof line first, else the chosen recording; its state is said in one word', () => {
    expect(voiceTrackSource(character())).toEqual({ kind: 'NONE' });
    expect(voiceState(character())).toBe('NONE');
    const sample = { id: 'v1', label: 'take', source: 'UPLOADED' as const, assetId: 'a-v1', text: 'hello' };
    expect(voiceTrackSource(character({ voice: { ...character().voice, samples: [sample], selectedSampleId: 'v1' } }))).toMatchObject({ kind: 'SAMPLE', assetId: 'a-v1', source: 'UPLOADED' });
    const identity = { provider: 'LOCAL_TTS' as const, model: 'indextts', mode: 'REFERENCE' as const, language: 'EN' as const, params: { speed: 1, emotionAlpha: 0.6 }, status: 'ACTIVE' as const, revision: 1, createdAt: at(2), proof: { sampleId: 'p1', assetId: 'a-proof', text: 'I have been here a while', heard: 'I have been here a while', coverage: 1 } };
    const voiced = character({ voice: { ...character().voice, samples: [sample], selectedSampleId: 'v1', identity } });
    expect(voiceTrackSource(voiced)).toMatchObject({ kind: 'PROOF', assetId: 'a-proof', text: 'I have been here a while' });
    // a proof line transcribed back is measured, never "verified"
    expect(voiceState(voiced)).toBe('MEASURED');
    expect(voiceState(character({ voice: { ...voiced.voice, identity: { ...identity, status: 'STALE' } } }))).toBe('STALE');
    expect(voiceState(character({ voice: { ...voiced.voice, identity: { ...identity, status: 'REVIEW' } } }))).toBe('REVIEW');
    expect(voiceMeasures(voiced)).toEqual({ intelligible: 1, loudnessOk: undefined, lufs: undefined });
  });
});

describe('the voice identity v2: origin, measured vs listened, design', () => {
  const base = { provider: 'LOCAL_TTS' as const, model: 'voxcpm2', mode: 'AUTOMATIC' as const, language: 'AR' as const, params: { speed: 1, emotionAlpha: 0.6 }, status: 'ACTIVE' as const, revision: 1, createdAt: at(2) };
  const withIdentity = (extra: Record<string, unknown>, p: Partial<Character> = {}) => character({ language: 'AR', ...p, voice: { ...character().voice, identity: { ...base, ...extra } as unknown as NonNullable<Character['voice']['identity']> } });
  it('the origin is read from the record; an older identity is a wave-2 one', () => {
    expect(voiceOrigin(withIdentity({ origin: 'DESIGNED', designId: 'd1' }))).toBe('DESIGNED');
    expect(voiceOrigin(withIdentity({}))).toBe('LEGACY');
    expect(voiceOrigin(character())).toBe('NONE');
    expect(voiceExtras(undefined).listening).toEqual([]);
  });
  it('measured numbers come from the evaluation, loudness against the reference gates; nothing is assumed', () => {
    expect(voiceMeasures(withIdentity({ evaluation: { cer: 0.04, lufs: -20, clipped: 0 } }))).toEqual({ intelligible: 0.96, loudnessOk: true, lufs: -20 });
    expect(voiceMeasures(withIdentity({ evaluation: { coverage: 0.98, lufs: -8, clipped: 0 } })).loudnessOk).toBe(false);
    expect(voiceMeasures(withIdentity({ evaluation: { coverage: 0.98, lufs: -20, clipped: 3 } })).loudnessOk).toBe(false);
    expect(voiceMeasures(withIdentity({}))).toEqual({ intelligible: undefined, loudnessOk: undefined, lufs: undefined });
    expect(voiceState(withIdentity({ evaluation: { cer: 0.1 } }))).toBe('MEASURED');
    expect(voiceState(withIdentity({}))).toBe('UNCHECKED');
  });
  it('an Iraqi voice is never called Iraqi without a listener; the latest listening wins', () => {
    const iraqi = { dialect: 'IRAQI_BAGHDADI' as const };
    expect(voiceListened(withIdentity({}, iraqi))).toEqual({ last: undefined, dialect: 'UNVERIFIED' });
    expect(voiceListened(withIdentity({ dialectStatus: 'UNVERIFIED', evaluation: { coverage: 1 } }, iraqi)).dialect).toBe('UNVERIFIED');
    const listened = withIdentity({ listening: [{ by: 'PRODUCER', natural: 3, dialectAuthentic: false, at: at(3) }, { by: 'PRODUCER', natural: 4, dialectAuthentic: true, at: at(4) }] }, iraqi);
    expect(voiceListened(listened)).toMatchObject({ last: { natural: 4 }, dialect: 'APPROVED' });
    expect(voiceListened(withIdentity({ dialectStatus: 'LISTENER_REJECTED' }, iraqi)).dialect).toBe('REJECTED');
    expect(voiceListened(withIdentity({})).dialect).toBe('NOT_APPLICABLE');
  });
  it('a design job’s result is read defensively; the description is written from the profile without a model', () => {
    expect(designResultOf({ result: { designId: 'd1', candidates: [{ index: 1, assetId: 'a1', cer: 0.05, duration: 9.2 }, { assetId: 'a2', passed: false }] } })).toEqual({ designId: 'd1', description: undefined, candidates: [{ index: 1, assetId: 'a1', seed: undefined, durationSeconds: 9.2, cer: 0.05, coverage: undefined, lufs: undefined, passed: undefined, reasons: undefined }, { index: 2, assetId: 'a2', seed: undefined, durationSeconds: undefined, cer: undefined, coverage: undefined, lufs: undefined, passed: false, reasons: undefined }] });
    expect(designResultOf({ result: { steps: [] } })).toBeNull();
    // personality text is never part of the description: it can name people, and the server refuses such a description
    expect(voiceDescriptionOf(character({ personality: 'Patient and wry. Speaks little, like Samir.', voice: { ...character().voice, timbre: 'Gravelly, warm' } }))).toBe('A man of about 66, a low voice, slow, unhurried delivery, gravelly, warm, speaking English.');
    expect(designedIraqiAllowed({ uiLanguage: 'en' })).toBe(false);
    // the server keeps the switch at settings.voice.allowDesignedIraqi; nothing else turns it on
    expect(designedIraqiAllowed({ voice: { allowDesignedIraqi: true } })).toBe(true);
    expect(designedIraqiAllowed({ generation: { allowDesignedIraqi: true } })).toBe(false);
  });
});

describe('the written sheet sends only what the producer chose', () => {
  it('nothing preselected: unset sex, age, pitch and pace stay out of the profile', () => {
    const { profile, brief } = sheetPayload({ ...EMPTY_SHEET, name: '  Noor ' }, { style: 'ANIME', language: 'EN' });
    expect(profile).toEqual({ name: 'Noor', style: 'ANIME', language: 'EN' });
    expect(brief).toBeUndefined();
  });
  it('a band stands for an age; an exact age wins; the look description travels as the brief; dialect only for Arabic', () => {
    const { profile, brief } = sheetPayload({ ...EMPTY_SHEET, name: 'Layla', nameAr: 'ليلى', sex: 'FEMALE', band: 'older', look: 'Silver hair in a bun', marks: 'round glasses, a limp', pace: 'SLOW' }, { style: 'REALISTIC', language: 'AR', dialect: 'IRAQI_BAGHDADI' });
    expect(profile).toMatchObject({ name: 'Layla', nameAr: 'ليلى', sex: 'FEMALE', ageYears: 66, distinguishing: ['round glasses', 'a limp'], dialect: 'IRAQI_BAGHDADI', voice: { pace: 'SLOW' } });
    expect(brief).toBe('Silver hair in a bun');
    expect(sheetAge({ band: 'teen', exactAge: 17 })).toBe(17);
    expect(sheetAge({ exactAge: 0 })).toBeUndefined();
    expect(sheetPayload({ ...EMPTY_SHEET, name: 'Sam' }, { style: 'CARTOON', language: 'EN', dialect: 'IRAQI_BAGHDADI' }).profile.dialect).toBeUndefined();
    expect(ageBandOf(9)).toBe('child'); expect(ageBandOf(16)).toBe('teen'); expect(ageBandOf(40)).toBe('adult'); expect(ageBandOf(70)).toBe('older');
  });
  it('only the identity step needs something: a name', () => {
    expect(sheetStepProblem('identity', EMPTY_SHEET)).toBe('NAME');
    expect(sheetStepProblem('identity', { ...EMPTY_SHEET, name: 'Noor' })).toBeNull();
    expect(sheetStepProblem('look', EMPTY_SHEET)).toBeNull();
  });
});
