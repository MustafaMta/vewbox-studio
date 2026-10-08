import { describe, expect, it } from 'vitest';
import { IDENTITY_RULE, IdentityConditioningError, assertIdentityConditioning, identityConditioning } from '@/server/production/identity-rule';
import { resolveShotPack } from '@/server/production/shot-pack';
import { locationPlateVerdict } from '@/server/production/location-rule';
import { preflightTake } from '@/server/org/preflight';
import { classifyFailure } from '@/server/org/runs';
import { isStudioError } from '@/domain/errors';
import { fixture, shotOf } from './continuity-fixture';

/** THE IDENTITY RE-APPLICATION RULE: every take's conditioning carries each present character's canonical image and
 *  the place's plate, connected and bound, whatever the relation — or it fails fast as MISSING_REFERENCE with the rule
 *  named. Judged on the pack (the preflight) and on the request built from it (the worker). */

const setup = (over: Parameters<typeof fixture>[0] = {}) => {
  const { state, p } = fixture(over);
  const cast = state.characters.filter((c) => p.castIds.includes(c.id));
  const loc = state.locations.find((l) => l.id === 'loc-pharmacy')!;
  const fileOf = (id: string) => `/lib/img/${id}.png`;
  return { state, p, cast, loc, fileOf };
};

describe('identityConditioning', () => {
  it('a continuation, a cut and a transition all carry every character and the plate: ok', () => {
    const { state, p, cast, loc } = setup();
    for (const id of ['s12', 's13']) {
      const sh = shotOf(p, id);
      const r = identityConditioning(resolveShotPack(state, p, sh, { backend: 'local' }), sh, cast, loc);
      expect(r).toMatchObject({ ok: true, rule: IDENTITY_RULE, problems: [] });
      expect(r.characters.every((c) => c.ok && c.assetId && c.picture)).toBe(true);
      expect(r.location).toMatchObject({ locationId: 'loc-pharmacy', assetId: 'plate-dusk', ok: true });
    }
  });

  it('a present character without a canonical image, or a place without a usable plate, is a named problem', () => {
    const { state, p, cast, loc } = setup({ characters: (cs) => cs.map((c, i) => (i === 1 ? { ...c, canonicalImage: undefined, portraitAssetId: undefined } : c)) });
    const sh = shotOf(p, 's12');
    const r = identityConditioning(resolveShotPack(state, p, sh, { backend: 'local' }), sh, cast, loc);
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual([expect.stringMatching(/has no canonical image: draw the character first/)]);
    const bare = { ...state, locations: state.locations.map((l) => (l.id === 'loc-pharmacy' ? { ...l, refs: [], masterAssetId: undefined } : l)) };
    const noPlate = identityConditioning(resolveShotPack(bare, p, shotOf(p, 's13'), { backend: 'local' }), shotOf(p, 's13'), cast, bare.locations.find((l) => l.id === 'loc-pharmacy'));
    expect(noPlate.ok).toBe(false);
    expect(noPlate.problems).toEqual(['Corner Pharmacy has no usable plate: draw the place first']);
    // no place in the scene (a music video without a location): nothing to check for the place
    expect(identityConditioning(resolveShotPack(state, p, sh, { backend: 'local' }), sh, cast, undefined).location).toBeUndefined();
  });

  it('THE INSERT RULE: a local insert with a drawn opening frame is filmed from the frame alone (no full-body image, no plate bound) and the rule is waived, named', () => {
    // "The Relief" 1.6 (2026-10-08): with Marcus's full-body image and the wide plate bound, H3 cut insert → wide → insert
    const { state, p, cast, loc } = setup({ shots: (s) => s.map((x) => (x.id === 's13' ? { ...x, framing: 'INSERT' as const } : x)) });
    const sh = shotOf(p, 's13');
    const pack = resolveShotPack(state, p, sh, { backend: 'local' });
    expect(pack).toMatchObject({ graph: 'FL2VA', insertFromFrame: { plateAssetId: 'plate-dusk' }, subjects: [], pictures: [], opening: { kind: 'FRAME', assetId: 'open-13' } });
    expect(pack.location).toBeUndefined();
    // the location rule still requires the place's plate (the frame was drawn against it), and passes on it
    expect(locationPlateVerdict(pack, { timeOfDay: 'DUSK' }, loc)).toMatchObject({ ok: true, mode: 'PLATE' });
    expect(locationPlateVerdict({ ...pack, insertFromFrame: {} }, { timeOfDay: 'DUSK' }, loc)).toMatchObject({ ok: false, mode: 'REFUSED' });
    expect(pack.lowering).toMatch(/^insert: filmed from its drawn opening frame alone/);
    const r = identityConditioning(pack, sh, cast, loc);
    expect(r).toMatchObject({ ok: true, lowered: expect.stringMatching(/^insert/) });
    // an insert without a drawn frame keeps its references (nothing else would carry the identity); hosted is unchanged
    const bare = { ...state, productions: state.productions.map((x) => (x.id !== p.id ? x : { ...x, shots: x.shots.map((s) => (s.id === 's13' ? { ...s, openingFrameAssetId: undefined } : s)) })) };
    const unframed = resolveShotPack(bare, bare.productions.find((x) => x.id === p.id)!, { ...sh, openingFrameAssetId: undefined }, { backend: 'local' });
    expect(unframed).toMatchObject({ graph: 'REF2VA' });
    expect(unframed.insertFromFrame).toBeUndefined();
    expect(resolveShotPack(state, p, sh, { backend: 'api' }).insertFromFrame).toBeUndefined();
    // a medium shot with a frame keeps its references
    expect(resolveShotPack(state, p, shotOf(fixture().p, 's13'), { backend: 'local' }).graph).toBe('REF2VA');
  });

  it('the request must connect each picture in order and the prompt must bind it', () => {
    const { state, p, cast, loc, fileOf } = setup();
    const sh = shotOf(p, 's12');
    const pack = resolveShotPack(state, p, sh, { backend: 'local' });
    const images = pack.pictures.map((x) => ({ file: fileOf(x.assetId) }));
    const prompt = '<Picture 1> <Picture 2> <Picture 3>';
    expect(identityConditioning(pack, sh, cast, loc, { referenceImages: images, prompt, fileOf }).ok).toBe(true);
    // the second picture connected to another file
    expect(identityConditioning(pack, sh, cast, loc, { referenceImages: [images[0], { file: '/lib/img/other.png' }, images[2]], prompt, fileOf }).problems).toEqual([expect.stringMatching(/picture 2 is connected to another file than canon-b/)]);
    // the plate's picture missing from the request
    expect(identityConditioning(pack, sh, cast, loc, { referenceImages: images.slice(0, 2), prompt, fileOf }).problems).toEqual(["Corner Pharmacy's plate: picture 3 is not connected to the request"]);
    // the prompt does not bind the first picture
    expect(identityConditioning(pack, sh, cast, loc, { referenceImages: images, prompt: '<Picture 2> <Picture 3>', fileOf }).problems).toEqual([expect.stringMatching(/<Picture 1> is not bound in the prompt/)]);
  });

  it('the hosted frame mode is the documented waiver, recorded as a lowering', () => {
    const { state, p, cast, loc } = setup();
    const sh = shotOf(p, 's12');
    const r = identityConditioning(resolveShotPack(state, p, sh, { backend: 'api' }), sh, cast, loc);
    expect(r).toMatchObject({ ok: true, lowered: expect.stringMatching(/last frame as the first frame/), problems: [] });
    // hosted reference mode is held to the rule like the local graph
    expect(identityConditioning(resolveShotPack(state, p, shotOf(p, 's13'), { backend: 'api' }), shotOf(p, 's13'), cast, loc).ok).toBe(true);
  });

  it('the gate throws an IdentityConditioningError: a StudioError, code and class MISSING_REFERENCE, the rule named', () => {
    const { state, p, cast, loc } = setup({ characters: (cs) => cs.map((c, i) => (i === 0 ? { ...c, canonicalImage: undefined, portraitAssetId: undefined } : c)) });
    const sh = shotOf(p, 's13');
    let caught: unknown;
    try { assertIdentityConditioning(resolveShotPack(state, p, sh, { backend: 'local' }), sh, cast, loc); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(IdentityConditioningError);
    expect(isStudioError(caught)).toBe(true);
    expect(caught).toMatchObject({ name: 'IdentityConditioningError', code: 'MISSING_REFERENCE', failureClass: 'MISSING_REFERENCE', rule: IDENTITY_RULE, message: expect.stringMatching(/Shot 3 cannot be generated: its conditioning does not carry every identity \(.*no canonical image/) });
    expect((caught as IdentityConditioningError).details).toMatchObject({ rule: IDENTITY_RULE, report: { ok: false } });
    expect(classifyFailure(caught)).toBe('MISSING_REFERENCE');
  });

  it('the preflight carries the rule as identity-conditioning', () => {
    const { state, p } = setup();
    expect(preflightTake(state, p, shotOf(p, 's12'), { backend: 'local', customPrompt: true }).checks.find((c) => c.name === 'identity-conditioning')).toMatchObject({ ok: true, failureClass: 'MISSING_REFERENCE', detail: '2 character image(s) and the plate conditioned on' });
    const bare = { ...state, locations: state.locations.map((l) => (l.id === 'loc-pharmacy' ? { ...l, refs: [], masterAssetId: undefined } : l)) };
    const r = preflightTake(bare, p, shotOf(p, 's13'), { backend: 'local', customPrompt: true });
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.name === 'identity-conditioning')).toMatchObject({ ok: false, detail: 'Corner Pharmacy has no usable plate: draw the place first' });
  });
});
