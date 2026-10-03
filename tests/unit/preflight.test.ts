import { describe, expect, it } from 'vitest';
import { preflightPlan, preflightTake } from '@/server/org/preflight';
import { seed } from '@/domain/sample';
import type { Production, Shot, StudioState } from '@/domain/types';
import { fixture, shotOf } from './continuity-fixture';

/** Preflight refuses a generation that could not succeed, and names the failure class. Built on the sample
 *  studio: its takes are bundled samples (no usable portraits), which is exactly what preflight must notice. */

const base = (): StudioState => seed();
const firstFilm = (s: StudioState): Production => s.productions.find((p) => p.kind !== 'MUSIC_VIDEO' && p.shots.length > 0)!;

const withRealPictures = (s: StudioState, _p: Production): StudioState => {
  // pretend every portrait, plate and opening frame is a generated picture
  const assets = s.assets.map((a) => (a.kind === 'IMAGE' ? { ...a, sample: false, mimeType: 'image/png' } : a));
  return { ...s, assets };
};

describe('preflightTake', () => {
  it('refuses a shot with characters whose identity has no usable reference (MISSING_REFERENCE)', () => {
    const s = base(); const p = firstFilm(s); const sh = p.shots.find((x) => x.characterIds.length > 0)!;
    const r = preflightTake(s, p, sh, { backend: 'local', customPrompt: true });
    expect(r.ok).toBe(false);
    const c = r.checks.find((x) => x.name === 'identity-reference-present')!;
    expect(c.ok).toBe(false); expect(c.failureClass).toBe('MISSING_REFERENCE');
  });
  it('passes a well-formed shot once its pictures are real, and reports every check', () => {
    const s0 = base(); const p = firstFilm(s0); const sh = p.shots.find((x) => x.characterIds.length > 0 && x.dialogue.length === 0) ?? p.shots[0];
    const s = withRealPictures(s0, p);
    const r = preflightTake(s, p, sh, { backend: 'local', customPrompt: true });
    expect(r.checks.map((c) => c.name)).toEqual(expect.arrayContaining(['scene-exists', 'location-resolved', 'characters-in-cast', 'prompt-complete', 'duration-in-range', 'reference-pictures-within-limit', 'identity-reference-present']));
    expect(r.checks.filter((c) => !c.ok).map((c) => c.name)).toEqual([]);
  });
  it('a speaking shot needs a voice recording for every speaker (audio before video)', () => {
    const s0 = base(); const p = firstFilm(s0); const sh = p.shots.find((x) => x.dialogue.length > 0)!;
    const s = withRealPictures(s0, p);
    const r = preflightTake(s, p, sh, { backend: 'local' });
    const c = r.checks.find((x) => x.name === 'speakers-have-voices');
    expect(c).toBeDefined();
    // the sample voices are bundled placeholders, so the check fails with the missing names
    expect(c!.ok).toBe(false); expect(c!.failureClass).toBe('MISSING_REFERENCE'); expect(c!.detail).toMatch(/no voice recording for/);
  });
  it('a continuation refuses to start before the shot it continues has an accepted take', () => {
    const s0 = base(); const p0 = firstFilm(s0);
    const s = withRealPictures(s0, p0);
    const p = s.productions.find((x) => x.id === p0.id)!;
    const [a, b] = p.shots.filter((x) => x.sceneId === p.shots[0].sceneId);
    if (!b) return;
    const shot: Shot = { ...b, dialogue: [], continuity: { ...(b.continuity ?? { version: 1, characters: [], props: [] }), relationToPrevious: 'CONTINUATION' } as Shot['continuity'] };
    const prod: Production = { ...p, shots: p.shots.map((x) => (x.id === a.id ? { ...x, selectedTakeId: undefined } : x.id === b.id ? shot : x)) };
    const r = preflightTake(s, prod, shot, { backend: 'local', customPrompt: true });
    const c = r.checks.find((x) => x.name === 'continuation-source-ready')!;
    expect(c.ok).toBe(false); expect(c.failureClass).toBe('INCONSISTENT_PLAN');
  });
  it('flags an empty action and prompt as PROMPT_AMBIGUITY and an out-of-range duration as WRONG_PARAMETERS', () => {
    const s0 = base(); const p = firstFilm(s0); const s = withRealPictures(s0, p);
    const sh: Shot = { ...p.shots[0], action: '', prompt: '', dialogue: [], durationSeconds: 40 };
    const r = preflightTake(s, p, sh, { backend: 'local' });
    expect(r.checks.find((x) => x.name === 'prompt-complete')!.failureClass).toBe('PROMPT_AMBIGUITY');
    expect(r.checks.find((x) => x.name === 'prompt-complete')!.ok).toBe(false);
    expect(r.checks.find((x) => x.name === 'duration-in-range')!.ok).toBe(false);
    expect(r.checks.find((x) => x.name === 'duration-in-range')!.failureClass).toBe('WRONG_PARAMETERS');
  });
});

describe('preflightTake — the engine’s verified limits (P0.6) on the shot pack', () => {
  it('reports the frames the engine will really make, and guides that count and fit', () => {
    const { state, p } = fixture();
    const r = preflightTake(state, p, shotOf(p, 's12'), { backend: 'local' });
    expect(r.checks.find((c) => c.name === 'duration-in-range')!.detail).toMatch(/^5 s → 158 frames \(6\.58 s; engine 1–15 s, trained 124–362 frames\)/);
    expect(r.checks.find((c) => c.name === 'guides-within-limit')).toMatchObject({ ok: true, detail: '2 guide(s) (tail@0, soundtrack@22), limit 4' });
    expect(r.checks.find((c) => c.name === 'guides-fit-clip')).toMatchObject({ ok: true });
    expect(r.checks.find((c) => c.name === 'continuation-source-ready')).toMatchObject({ ok: true, detail: expect.stringMatching(/last 22 frames and their sound at frame 0/) });
    expect(r.checks.find((c) => c.name === 'reference-pictures-within-limit')).toMatchObject({ ok: true, detail: '3 picture(s) (2 character(s), the plate), limit 9' });
    const cut = preflightTake(state, p, shotOf(p, 's13'), { backend: 'local', customPrompt: true });
    expect(cut.checks.find((c) => c.name === 'guides-within-limit')!.detail).toBe('2 guide(s) (opening_frame@0, ending_frame@-1), limit 4');
    expect(cut.checks.find((c) => c.name === 'reference-pictures-within-limit')!.detail).toMatch(/2 picture|3 picture/);
  });
  it('identity comes from the characters’ own images, never from an opening frame alone', () => {
    const { state, p } = fixture({ characters: (cs) => cs.map((c, i) => (i < 2 ? { ...c, canonicalImage: undefined, portraitAssetId: undefined } : c)) });
    const r = preflightTake(state, p, shotOf(p, 's13'), { backend: 'local', customPrompt: true });
    expect(shotOf(p, 's13').openingFrameAssetId).toBeTruthy();
    expect(r.checks.find((c) => c.name === 'identity-reference-present')).toMatchObject({ ok: false, failureClass: 'MISSING_REFERENCE' });
  });
  it('warns when a continuation cannot carry the planned length after its guide, when transition and relation disagree, and when the hosted request is lowered', () => {
    const { state, p } = fixture({ shots: (shots) => shots.map((s) => (s.id === 's12' ? { ...s, durationSeconds: 15, transition: 'DISSOLVE' as const } : s)) });
    const r = preflightTake(state, p, shotOf(p, 's12'), { backend: 'local' });
    // warnings, not refusals
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.name)).toEqual(expect.arrayContaining(['continuation-length', 'transition-matches-relation']));
    expect(r.warnings.find((w) => w.name === 'continuation-length')!.detail).toMatch(/at most 340 new frames \(14\.2 s\)/);
    const hosted = preflightTake(state, p, shotOf(p, 's13'), { backend: 'api', customPrompt: true });
    expect(hosted.warnings.find((w) => w.name === 'hosted-lowering')!.detail).toMatch(/frame and reference roles cannot be mixed/);
    expect(hosted.checks.find((c) => c.name === 'guides-within-limit')!.detail).toBe('0 guide(s), limit 4');
  });
  it('names characters beyond the nine-picture budget', () => {
    const { state: s0, p: p0 } = fixture();
    const extra = Array.from({ length: 9 }, (_, i) => ({ ...s0.characters[0], id: `extra-${i}`, name: `Extra ${i}`, canonicalImage: { assetId: 'canon-a', status: 'APPROVED' as const, version: 1, generatedAt: 'x' } }));
    const state = { ...s0, characters: [...s0.characters, ...extra] };
    const p = { ...p0, castIds: [...p0.castIds, ...extra.map((c) => c.id)], shots: p0.shots.map((s) => (s.id === 's13' ? { ...s, characterIds: [...s.characterIds, ...extra.map((c) => c.id)] } : s)) };
    const r = preflightTake(state, p, shotOf(p, 's13'), { backend: 'local', customPrompt: true });
    expect(r.checks.find((c) => c.name === 'reference-pictures-within-limit')).toMatchObject({ ok: true });
    expect(r.warnings.find((w) => w.name === 'characters-over-picture-budget')!.detail).toMatch(/3 character\(s\) beyond the 9-picture budget go unreferenced: Extra 6, Extra 7, Extra 8/);
  });
});

describe('preflightPlan', () => {
  it('refuses to plan unwritten scenes', () => {
    const s = base(); const p = firstFilm(s);
    const unwritten: Production = { ...p, scenes: p.scenes.map((sc) => ({ ...sc, beats: [] })) };
    const r = preflightPlan(unwritten);
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.name === 'scenes-written')!.failureClass).toBe('INCONSISTENT_PLAN');
  });
  it('passes a written, located production', () => {
    const s = base(); const p = firstFilm(s);
    const r = preflightPlan(p);
    expect(r.checks.find((c) => c.name === 'scenes-present')!.ok).toBe(true);
  });
});
