import { describe, expect, it } from 'vitest';
import { describeIdentity, identityHashOf, locationIdentity, locationIdentityLine, withLocationIdentity } from '@/domain/location';
import { addLocation, addLocationRefs, updateLocation, updateScene } from '@/domain/actions';
import { runCommand, validateClientCommand } from '@/domain/commands';
import { deriveWorld, diffWorld, overlayWorld, repinSafety, usageOf, worldScopeOf } from '@/domain/world';
import { resolveShotPack, bindingOf } from '@/server/production/shot-pack';
import { identityConditioning } from '@/server/production/identity-rule';
import { LOCATION_RULE, UnestablishedLocationError, assertLocationPlate, locationPlateVerdict } from '@/server/production/location-rule';
import { preflightTake } from '@/server/org/preflight';
import { h3ReferencePrompt, lintH3Prompt, takePrompt } from '@/server/story/prompts';
import { classifyFailure } from '@/server/org/runs';
import { isStudioError } from '@/domain/errors';
import type { Location, StudioState } from '@/domain/types';
import { fixture, shotOf } from './continuity-fixture';

/** THE LOCATION BIBLE: one place = one canonical identity (its master plate and what is fixed about it), summed up in
 *  an identity line and versioned by the reducers; the World Bible pins the identity, a shot's pack and prompt carry
 *  it, a pinned production notices a change; a shot in a place that has no plate is refused as its own error class —
 *  unless the scene is marked "establish here", when the place is filmed from its identity line. */

const NOW = '2026-10-03T00:00:00.000Z';
void runCommand;

describe('the identity of a place (src/domain/location.ts)', () => {
  it('the identity line says what is fixed about the place, in a fixed order, without its name', () => {
    const { state } = fixture();
    const l = state.locations.find((x) => x.id === 'loc-pharmacy')!;
    expect(locationIdentityLine(l)).toBe('a small pharmacy with a white counter and wooden shelves; fixed features: a green cross sign; permanent props: a cash register');
    const laid: Location = { ...l, layout: { architecture: 'one long room under a pressed-tin ceiling', materials: ['white tile', 'oak'], entrances: ['glass door to the street, front left'], cameraZones: ['the counter', 'the shelves at the back'], spatial: 'the counter runs along the right wall' } };
    expect(locationIdentityLine(laid)).toBe('a small pharmacy with a white counter and wooden shelves; architecture: one long room under a pressed-tin ceiling; layout: the counter runs along the right wall; materials: white tile, oak; fixed features: a green cross sign; permanent props: a cash register; entrances: glass door to the street, front left; camera zones: the counter; the shelves at the back');
    expect(describeIdentity(laid)).toMatch(/^interior: a small pharmacy .* \(place identity v1\)$/);
    expect(locationIdentityLine(laid)).not.toContain('Corner Pharmacy');
  });

  it('a row without an identity is version 1 of what it holds; the version moves on when the canon changes, never on a plate (the World Bible’s plate list versions those) or the name', () => {
    const { state } = fixture();
    const l = state.locations.find((x) => x.id === 'loc-pharmacy')!;
    const v1 = locationIdentity(l);
    expect(v1).toMatchObject({ version: 1, hash: identityHashOf(l), line: locationIdentityLine(l), updatedAt: l.updatedAt });
    const stored = withLocationIdentity(l, NOW);
    expect(withLocationIdentity(stored, 'later')).toBe(stored); // nothing changed: the same object
    // a view, a time-of-day plate, a redrawn master (an addition under the lock), or a new name: the same identity
    expect(locationIdentity({ ...stored, refs: [...stored.refs, { id: 'r5', role: 'VIEW', assetId: 'plate-view', label: 'Reverse' }, { id: 'r6', role: 'STATE', assetId: 'plate-night', label: 'night', timeOfDay: 'NIGHT' }] } as Location)).toBe(stored.identity);
    expect(locationIdentity({ ...stored, refs: [{ id: 'r9', role: 'MASTER', assetId: 'plate-master-2', label: 'Master plate' }], masterAssetId: 'plate-master-2' } as Location)).toBe(stored.identity);
    expect(locationIdentity({ ...stored, name: 'Pharmacy on the Corner' } as Location)).toBe(stored.identity);
    // the layout or a landmark: a new version
    expect(locationIdentity({ ...stored, layout: { architecture: 'one long room' } }, 'later')).toMatchObject({ version: 2, updatedAt: 'later' });
    expect(locationIdentity({ ...stored, landmarks: ['a blue cross sign'] }).version).toBe(2);
  });

  it('the reducers write it: addLocation starts at v1, updateLocation moves it on, plates do not, and nobody sends one', () => {
    const { state } = fixture();
    const { state: s1, location } = addLocation(state, { name: 'Roof', kind: 'EXTERIOR', description: 'a flat roof', style: 'CARTOON', lighting: ['NIGHT'], landmarks: ['a water tank'], props: [], identity: { version: 9, hash: 'x', line: 'x', updatedAt: 'x' } } as never);
    expect(location.identity).toMatchObject({ version: 1, line: 'a flat roof; fixed features: a water tank' });
    const s2 = updateLocation(s1, location.id, { identity: { version: 7, hash: 'y', line: 'y', updatedAt: 'y' } } as never);
    expect(s2.locations.find((x) => x.id === location.id)!.identity).toMatchObject({ version: 1 });
    const s3 = updateLocation(s2, location.id, { layout: { spatial: 'the tank is on the right' } });
    expect(s3.locations.find((x) => x.id === location.id)!.identity).toMatchObject({ version: 2, line: 'a flat roof; layout: the tank is on the right; fixed features: a water tank' });
    const s4 = addLocationRefs(s3, location.id, [{ id: 'r1', role: 'MASTER', assetId: 'plate-roof', label: 'Master plate' }]);
    expect(s4.locations.find((x) => x.id === location.id)!.identity!.version).toBe(2);
    const s5 = addLocationRefs(s4, location.id, [{ id: 'r2', role: 'STATE', assetId: 'plate-roof-night', label: 'night', timeOfDay: 'NIGHT' }]);
    expect(s5.locations.find((x) => x.id === location.id)!.identity!.version).toBe(2);
    // a page cannot send the identity; it may mark a scene "establish here"
    expect(() => validateClientCommand('updateLocation', [location.id, { identity: { version: 1 } }])).toThrow(/identity/);
    expect(() => validateClientCommand('updateScene', ['prod-cont', 'sc1', { establishLocation: true }])).not.toThrow();
    expect(() => validateClientCommand('addScene', ['prod-cont', { title: 'x', timeOfDay: 'DUSK', establishLocation: true }])).not.toThrow();
  });
});

describe('the World Bible pins the identity', () => {
  it('the revision carries each place’s identity; a changed identity is named in the diff and blocks a re-pin of a production that filmed the place', () => {
    const { state, p } = fixture();
    const before = deriveWorld(state, worldScopeOf(p), undefined, NOW);
    expect(before.locations.find((l) => l.locationId === 'loc-pharmacy')!.identity).toMatchObject({ version: 1, line: expect.stringMatching(/^a small pharmacy/) });
    // the fixture's places were written before identities (none stored): the reducer still counts the change as v2
    const edited = updateLocation(state, 'loc-pharmacy', { layout: { architecture: 'one long room' } });
    const after = deriveWorld(edited, worldScopeOf(p), before, 'later');
    const diff = diffWorld(before, after);
    expect(diff).toEqual(expect.arrayContaining([{ op: 'UPDATE', path: 'locations/loc-pharmacy/identity', detail: 'Corner Pharmacy: identity v1 → v2' }]));
    expect(repinSafety(diff, usageOf(p)).blocking.map((c) => c.path)).toContain('locations/loc-pharmacy/identity');
    // the street, not filmed yet: its identity may change under the pin
    const street = updateLocation(state, 'loc-street', { layout: { architecture: 'cobbles' } });
    expect(repinSafety(diffWorld(before, deriveWorld(street, worldScopeOf(p), before, 'later')), usageOf(p)).safe).toBe(true);
  });

  it('the overlay gives the shot the pinned identity line, not the studio’s later edit, and says so', () => {
    const { state, p } = fixture();
    const pinned = deriveWorld(state, worldScopeOf(p), undefined, NOW);
    const edited = updateLocation(state, 'loc-pharmacy', { layout: { architecture: 'one long room' } });
    const { state: s, read } = overlayWorld(edited, pinned, p, shotOf(p, 's13'), { id: 'wrev-1', number: 1, pinned: true });
    const pack = resolveShotPack(s, p, shotOf(p, 's13'), { backend: 'local' });
    expect(pack.location).toMatchObject({ assetId: 'plate-dusk', identity: { version: 1, line: expect.not.stringContaining('one long room') } });
    expect(read.location).toMatchObject({ assetId: 'plate-dusk', identityVersion: 1 });
    expect(read.conflicts).toEqual([expect.stringMatching(/the place's identity is v2 now, the production is pinned to v1; the pinned identity line is used/)]);
  });
});

describe('every shot carries the plate and the identity line', () => {
  it('the pack conditions on the plate for the time of day (else the master) and names the identity; the prompt binds the plate to the place with its identity line', () => {
    const { state, p } = fixture();
    const cast = state.characters.filter((c) => p.castIds.includes(c.id));
    const loc = state.locations.find((l) => l.id === 'loc-pharmacy')!;
    const sh = shotOf(p, 's13');
    const pack = resolveShotPack(state, p, sh, { backend: 'local' });
    expect(pack.location).toMatchObject({ locationId: 'loc-pharmacy', assetId: 'plate-dusk', role: 'STATE', picture: 2, identity: { version: 1, line: expect.stringMatching(/^a small pharmacy/) } });
    expect(pack.establishing).toBeUndefined();
    const prompt = h3ReferencePrompt(p, sh, cast, loc, { timeOfDay: 'DUSK' }, bindingOf(pack), { relation: 'CUT' });
    expect(prompt).toContain('<Subject 2> is the interior environment in <Picture 2>, featuring a small pharmacy with a white counter and wooden shelves; fixed features: a green cross sign; permanent props: a cash register (place identity v1).');
    expect(prompt).toMatch(/<Subject 2> \(appears in \[Shot 1\]\): partially_preserved - the architecture, layout, materials and fixed props of <Picture 2> are kept/);
    expect(lintH3Prompt(prompt, { labels: 'LOCAL', pictures: 3, audios: 0, lines: [], names: cast.map((c) => c.name) }).ok).toBe(true);
    // the plain prompt (first-frame and text graphs) says the same identity
    expect(takePrompt(p, sh, cast, loc, { timeOfDay: 'DUSK' })).toContain('Setting: interior: a small pharmacy with a white counter and wooden shelves; fixed features: a green cross sign; permanent props: a cash register (place identity v1). time of day: dusk.');
    // a scene at another time of day with no plate for it: the master plate, the same identity
    const night = { ...p, scenes: p.scenes.map((sc) => (sc.id === 'sc1' ? { ...sc, timeOfDay: 'NIGHT' as const } : sc)) };
    expect(resolveShotPack(state, night, shotOf(night, 's13'), { backend: 'local' }).location).toMatchObject({ assetId: 'plate-master', role: 'MASTER', identity: { version: 1 } });
  });
});

describe('a place without a plate', () => {
  const bare = () => {
    const { state, p } = fixture();
    return { state: { ...state, locations: state.locations.map((l) => (l.id === 'loc-pharmacy' ? { ...l, refs: [], masterAssetId: undefined } : l)) }, p };
  };

  it('is refused as UnestablishedLocationError — a StudioError, code and class MISSING_REFERENCE, the rule named, the two ways out in the message; the preflight carries it as location-plate', () => {
    const { state, p } = bare();
    const sh = shotOf(p, 's13');
    const loc = state.locations.find((l) => l.id === 'loc-pharmacy')!;
    const pack = resolveShotPack(state, p, sh, { backend: 'local' });
    expect(pack.location).toBeUndefined();
    expect(locationPlateVerdict(pack, p.scenes[0], loc)).toMatchObject({ ok: false, mode: 'REFUSED', rule: LOCATION_RULE, identity: { version: 1 } });
    let caught: unknown;
    try { assertLocationPlate(pack, p, sh, p.scenes[0], loc); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(UnestablishedLocationError);
    expect(isStudioError(caught)).toBe(true);
    expect(caught).toMatchObject({ name: 'UnestablishedLocationError', code: 'MISSING_REFERENCE', failureClass: 'MISSING_REFERENCE', rule: LOCATION_RULE, message: 'Shot 3 of “prod-cont” cannot be generated: Corner Pharmacy has no plate: draw its plates first (LOCATION_PLATES), or mark the scene "establish here" so this first appearance creates the plate.'.replace('“prod-cont”', `“${p.title}”`) });
    expect(classifyFailure(caught)).toBe('MISSING_REFERENCE');
    const pre = preflightTake(state, p, sh, { backend: 'local', customPrompt: true });
    expect(pre.ok).toBe(false);
    expect(pre.checks.find((c) => c.name === 'location-plate')).toMatchObject({ ok: false, failureClass: 'MISSING_REFERENCE', detail: expect.stringMatching(/Corner Pharmacy has no plate: draw its plates first/) });
    // with a plate the check names the plate and the identity version
    const { state: s2, p: p2 } = fixture();
    expect(preflightTake(s2, p2, shotOf(p2, 's13'), { backend: 'local', customPrompt: true }).checks.find((c) => c.name === 'location-plate')).toMatchObject({ ok: true, detail: 'Corner Pharmacy: the plate for dusk (plate-dusk), identity v1' });
  });

  it('is filmed from its identity line when the scene is marked "establish here": the pack says so, the identity rule and the preflight pass, the prompt declares the place as a described subject and lints clean', () => {
    const { state, p: p0 } = bare();
    const p = { ...p0, scenes: p0.scenes.map((sc) => (sc.id === 'sc1' ? { ...sc, establishLocation: true } : sc)) };
    const sh = shotOf(p, 's13');
    const cast = state.characters.filter((c) => p.castIds.includes(c.id));
    const loc = state.locations.find((l) => l.id === 'loc-pharmacy')!;
    const pack = resolveShotPack(state, p, sh, { backend: 'local' });
    expect(pack.location).toBeUndefined();
    expect(pack.establishing).toEqual({ locationId: 'loc-pharmacy', name: 'Corner Pharmacy', identity: { version: 1, line: expect.stringMatching(/^a small pharmacy/) } });
    expect(pack.notes).toEqual(expect.arrayContaining([expect.stringMatching(/^establish here: Corner Pharmacy has no plate yet/)]));
    expect(locationPlateVerdict(pack, p.scenes[0], loc)).toMatchObject({ ok: true, mode: 'ESTABLISHING' });
    expect(() => assertLocationPlate(pack, p, sh, p.scenes[0], loc)).not.toThrow();
    const rule = identityConditioning(pack, sh, cast, loc);
    expect(rule.ok).toBe(true);
    expect(rule.location).toMatchObject({ ok: true, why: expect.stringMatching(/established here: filmed from its identity line \(v1\)/) });
    const pre = preflightTake(state, p, sh, { backend: 'local', customPrompt: true });
    expect(pre.ok).toBe(true);
    expect(pre.checks.find((c) => c.name === 'location-plate')).toMatchObject({ ok: true, detail: expect.stringMatching(/marked "establish here": filmed from its identity line/) });
    const binding = bindingOf(pack);
    expect(binding).toMatchObject({ location: undefined, describedLocation: true });
    const prompt = h3ReferencePrompt(p, sh, cast, loc, { timeOfDay: 'DUSK' }, binding, { relation: 'CUT' });
    expect(prompt).toContain('<Subject 2> is the interior environment: a small pharmacy with a white counter and wooden shelves; fixed features: a green cross sign; permanent props: a cash register (place identity v1); no reference picture: this shot establishes the place');
    expect(prompt).toMatch(/<Subject 2> \(appears in \[Shot 1\]\): weak_reference - described, no picture; the same architecture/);
    expect(prompt).toMatch(/The target video shows <Subject 1> in <Subject 2>/);
    expect(lintH3Prompt(prompt, { labels: 'LOCAL', pictures: pack.pictures.length, audios: 0, lines: [], names: cast.map((c) => c.name) }).ok).toBe(true);
    // the mark changes nothing for a place that has a plate
    const { state: s2, p: p2 } = fixture();
    const marked = { ...p2, scenes: p2.scenes.map((sc) => ({ ...sc, establishLocation: true })) };
    expect(resolveShotPack(s2, marked, shotOf(marked, 's13'), { backend: 'local' })).toMatchObject({ location: { assetId: 'plate-dusk' }, establishing: undefined });
    // the scene's flag survives the scene patch reducer
    expect(updateScene({ ...state, productions: [p] } as StudioState, p.id, 'sc2', { establishLocation: true }).productions[0].scenes[1].establishLocation).toBe(true);
  });
});
