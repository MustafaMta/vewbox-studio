import { describe, expect, it } from 'vitest';
import { cueTextIn } from '@/server/media/assembly';
import { hasVoice, speakingVoices } from '@/domain/voice-identity';
import { frameCheckOf } from '@/domain/frames';
import { preflightTake } from '@/server/org/preflight';
import { needsOpeningFrame } from '@/server/production/shot-pack';
import { takeGenerationMs } from '@/worker/handlers/take';
import type { Character, StudioState } from '@/domain/types';
import { fixture, shotOf } from './continuity-fixture';

/** The open items of the acceptance run of 2026-10-05 (docs/evidence/acceptance-v1/REPORT.md, "Still open"), each
 *  pinned by a test. Item 2 (names in prompts) is tests/unit/prompt-names.test.ts. */

describe('item 4 — a subtitle track holds only text in its own script', () => {
  it('an English line has no Arabic cue; an Arabic line with a gloss has both; Arabic without a gloss has no English cue', () => {
    expect(cueTextIn('ar', { text: 'Thank you.' })).toBeUndefined();
    expect(cueTextIn('en', { text: 'Thank you.' })).toBe('Thank you.');
    expect(cueTextIn('ar', { text: 'Thank you.', textAr: 'شكراً' })).toBe('شكراً');
    expect(cueTextIn('en', { text: 'شكراً' })).toBeUndefined();
    expect(cueTextIn('ar', { text: 'شكراً' })).toBe('شكراً');
    expect(cueTextIn('en', { text: '', textAr: 'Thank you' })).toBe('Thank you');
  });
});

describe('item 7 — the Final cut counts the speakers who have a voice', () => {
  it('a pinned identity is a voice (the legacy chosen sample was the only thing counted)', () => {
    const v = (over: Partial<Character['voice']>): Pick<Character, 'voice'> => ({ voice: { pitch: 'MID', pace: 'MEASURED', timbre: '', notes: '', samples: [], ...over } });
    const identity = { provider: 'LOCAL_TTS', model: 'indextts', mode: 'DESIGN', language: 'EN', params: { speed: 1, emotionAlpha: 0.6 }, status: 'ACTIVE', revision: 1, createdAt: '' } as const;
    expect(hasVoice(v({ identity }))).toBe(true);
    expect(hasVoice(v({ identity: { ...identity, status: 'STALE' } }))).toBe(false);
    expect(hasVoice(v({ selectedSampleId: 's1' }))).toBe(true);
    expect(hasVoice(v({}))).toBe(false);
    const cast = [{ id: 'a', ...v({ identity }) }, { id: 'b', ...v({ identity }) }, { id: 'c', ...v({}) }];
    expect(speakingVoices({ shots: [{ dialogue: [{ characterId: 'a' }] }, { dialogue: [{ characterId: 'b' }] }] }, cast)).toEqual({ speakers: 2, voiced: 2 });
  });
});

describe('item 5 — a drawn frame that fails the people count is never filmed from', () => {
  const withCheck = (state: StudioState, assetId: string, expected: number, counted: number): StudioState => ({ ...state, assets: state.assets.map((a) => (a.id === assetId ? { ...a, provenance: { ...a.provenance, peopleCheck: { expected, counted, ok: expected === counted } } } : a)) });
  it('reads the count from the frame', () => {
    expect(frameCheckOf({ provenance: { peopleCheck: { expected: 1, counted: 2, ok: false } } })).toEqual({ expected: 1, counted: 2, ok: false });
    expect(frameCheckOf({ provenance: {} })).toBeUndefined();
  });
  it('the preflight refuses an opening frame with a stranger in it and passes a right one', () => {
    const { state, p } = fixture();
    const bad = preflightTake(withCheck(state, 'open-13', 1, 2), p, shotOf(p, 's13'), { backend: 'local', customPrompt: true });
    const c = bad.checks.find((x) => x.name === 'opening-frame-people')!;
    expect(c.ok).toBe(false);
    expect(c.detail).toMatch(/holds 2 people where the shot has 1/);
    const good = preflightTake(withCheck(state, 'open-13', 1, 1), p, shotOf(p, 's13'), { backend: 'local', customPrompt: true });
    expect(good.checks.find((x) => x.name === 'opening-frame-people')!.ok).toBe(true);
  });
});

describe('item 3 — a recovered take does not claim the adoption wait as its generation time', () => {
  it('the engine time when adopted, nothing when unknown, the wall clock otherwise', () => {
    expect(takeGenerationMs({ resumed: false, engineMs: 300_000, waitedMs: 320_000 })).toBe(320_000);
    expect(takeGenerationMs({ resumed: true, engineMs: 300_000, waitedMs: 8_000 })).toBe(300_000);
    expect(takeGenerationMs({ resumed: true, waitedMs: 8_000 })).toBeUndefined();
  });
});

describe('item 6 — the plate is compared only at a framing that shows the plate', () => {
  it('wide framings are compared; a closer one is recorded as not comparable, with the reason', async () => {
    const { plateComparable } = await import('@/server/media/plate-drift');
    expect(plateComparable('WIDE').comparable).toBe(true);
    expect(plateComparable('MEDIUM_WIDE').comparable).toBe(true);
    const close = plateComparable('MEDIUM_CLOSE_UP');
    expect(close.comparable).toBe(false);
    expect(close.why).toMatch(/medium close up shows a crop of the place/);
  });
});

describe('item 1 — a frame is drawn at the shot’s framing, not the plate’s', () => {
  it('the camera distance leads the frame prompt, and a close shot is told the plate is the place, not the camera', async () => {
    const { framePrompt } = await import('@/server/story/prompts');
    const { state, p } = fixture();
    const sh = { ...shotOf(p, 's13'), framing: 'CLOSE_UP' as const };
    const close = framePrompt(p, sh, state.characters, state.locations.find((l) => l.id === 'loc-pharmacy'), { timeOfDay: 'DUSK' });
    // the subject of the moment fills a close-up (the face, or the hand, foot or object), never a second face (2026-10-08)
    expect(close).toMatch(/Camera: a close-up: what the moment is about fills the frame — the face, or the hand, foot or object/);
    expect(close).toMatch(/keep the place’s look, not its framing/);
    const wide = framePrompt(p, { ...sh, framing: 'WIDE' as const }, state.characters, undefined, undefined);
    expect(wide).toMatch(/Camera: a wide shot/);
    expect(wide).not.toMatch(/not its framing/);
  });
});

describe('a close shot without its opening frame (acceptance 2026-10-06, G13)', () => {
  it('the preflight warns: draw the frames first (it would start from the wide plate and push in)', () => {
    const { state, p } = fixture();
    const sh = { ...shotOf(p, 's13'), openingFrameAssetId: undefined, endingFrameAssetId: undefined };
    const close = preflightTake(state, p, { ...sh, framing: 'MEDIUM_CLOSE_UP' as const }, { backend: 'local', customPrompt: true });
    // a producer's own prompt: not drawn by the take, so the warning says to draw it
    expect(close.warnings.find((w) => w.name === 'opening-frame-missing')?.detail).toMatch(/medium close up with no opening frame .* draw the shot's frames first/);
    // otherwise the take draws it first (settings.generation.autoOpeningFrame, default on); off: the warning again
    const auto = preflightTake(state, p, { ...sh, framing: 'MEDIUM_CLOSE_UP' as const }, { backend: 'local' });
    expect(auto.warnings.find((w) => w.name === 'opening-frame-missing')?.detail).toMatch(/the take draws it first/);
    const off = preflightTake({ ...state, settings: { ...state.settings, generation: { ...state.settings.generation, autoOpeningFrame: false } } }, p, { ...sh, framing: 'MEDIUM_CLOSE_UP' as const }, { backend: 'local' });
    expect(off.warnings.find((w) => w.name === 'opening-frame-missing')?.detail).toMatch(/draw the shot's frames first/);
    expect(needsOpeningFrame({ backend: 'local', location: { assetId: 'x' } as never, opening: { kind: 'NONE' } }, { framing: 'CLOSE_UP' })).toBe(true);
    expect(needsOpeningFrame({ backend: 'local', location: { assetId: 'x' } as never, opening: { kind: 'NONE' } }, { framing: 'CLOSE_UP' }, { generation: { autoOpeningFrame: false } })).toBe(false);
    expect(needsOpeningFrame({ backend: 'local', location: { assetId: 'x' } as never, opening: { kind: 'NONE' } }, { framing: 'WIDE' })).toBe(false);
    expect(needsOpeningFrame({ backend: 'api', location: { assetId: 'x' } as never, opening: { kind: 'NONE' } }, { framing: 'CLOSE_UP' })).toBe(false);
    expect(preflightTake(state, p, { ...sh, framing: 'WIDE' as const }, { backend: 'local', customPrompt: true }).warnings.some((w) => w.name === 'opening-frame-missing')).toBe(false);
    expect(preflightTake(state, p, { ...shotOf(p, 's13'), framing: 'MEDIUM_CLOSE_UP' as const }, { backend: 'local', customPrompt: true }).warnings.some((w) => w.name === 'opening-frame-missing')).toBe(false);
  });
});