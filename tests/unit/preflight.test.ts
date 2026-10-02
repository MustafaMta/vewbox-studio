import { describe, expect, it } from 'vitest';
import { preflightPlan, preflightTake } from '@/server/org/preflight';
import { seed } from '@/domain/sample';
import type { Production, Shot, StudioState } from '@/domain/types';

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
