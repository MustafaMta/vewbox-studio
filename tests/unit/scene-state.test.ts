import { describe, expect, it } from 'vitest';
import type { Production, Shot, StudioState } from '@/domain/types';
import { carriedPropState, lastStateAt, relationOf, sceneStateFor, sceneStateLine, wardrobeOfTheDay } from '@/domain/scene-state';
import { deriveWorld, worldScopeOf } from '@/domain/world';
import { resolveShotPack, bindingOf } from '@/server/production/shot-pack';
import { h3ReferencePrompt, lintH3Prompt, takePrompt } from '@/server/story/prompts';
import { fixture, shotOf } from './continuity-fixture';

/** THE SCENE STATE carried shot to shot (src/domain/scene-state.ts), on a two-scene fixture with a return: scene 1 at
 *  the pharmacy at dusk (rain, a parcel on the counter, Ada in a green coat), scene 2 on the street at night, scene 3
 *  back at the pharmacy at night. A cut keeps the state; a transition resets to what the new scene declares — and a
 *  return to the pharmacy starts from what scene 1 left there, never from the street. Structured state, written into
 *  the prompt; never the previous frame. */

const NOW = '2026-10-03T00:00:00.000Z';

function returnFixture() {
  const { state, p: p0 } = fixture();
  const [a, b] = p0.castIds;
  const env = (over: Partial<NonNullable<Shot['continuity']>['environment']> = {}) => ({ timeOfDay: 'DUSK' as const, ...over });
  const shots = p0.shots.map((s): Shot => {
    if (s.id === 's11') return { ...s, boundary: 'transition', continuity: { version: 1, characters: [{ characterId: a, wardrobe: 'green coat, red scarf', position: 'behind the counter', holding: ['a pen'] }, { characterId: b, wardrobe: 'grey hoodie', position: 'at the door' }], props: [{ name: 'a parcel', state: 'taped', position: 'on the counter', ownerCharacterId: a }], environment: env({ weather: 'rain', lighting: 'cool fluorescent light', state: 'the shutters half down' }), camera: {} } };
    if (s.id === 's12') return { ...s, boundary: 'cut', continuity: { version: 1, characters: [{ characterId: a, position: 'at the till' }], props: [], environment: {}, camera: {} } };
    if (s.id === 's13') return { ...s, boundary: 'cut', continuity: { version: 1, characters: [], props: [{ name: 'a parcel', state: 'opened' }], environment: {}, camera: {} } };
    if (s.id === 's21') return { ...s, boundary: 'transition', continuity: { version: 1, characters: [{ characterId: a, position: 'under a lamp post' }], props: [{ name: 'a bicycle', position: 'against the wall' }], environment: { timeOfDay: 'NIGHT', weather: 'dry', lighting: 'sodium street light' }, camera: {} } };
    return s;
  });
  const s31: Shot = { id: 's31', sceneId: 'sc3', number: 1, purpose: 'back', action: 'She comes back in', framing: 'MEDIUM', cameraMove: 'STATIC', durationSeconds: 5, characterIds: [a], dialogue: [], transition: 'CUT', takes: [], boundary: 'transition' };
  const s32: Shot = { ...s31, id: 's32', number: 2, boundary: 'cut', continuity: { version: 1, characters: [{ characterId: a, holding: ['the parcel'] }], props: [], environment: {}, camera: {} } };
  const p: Production = { ...p0, scenes: [...p0.scenes, { id: 'sc3', number: 3, title: 'Back', locationId: 'loc-pharmacy', timeOfDay: 'NIGHT', characterIds: [a], beats: [] }], shots: [...shots, s31, s32] };
  const s: StudioState = { ...state, productions: state.productions.map((x) => (x.id === p.id ? p : x)) };
  return { state: s, p, a, b };
}

describe('the scene state, shot to shot', () => {
  it('relations: an explicit boundary, a cut inside a scene, a transition at a scene start', () => {
    const { p } = returnFixture();
    expect(['s11', 's12', 's13', 's21', 's31', 's32'].map((id) => relationOf(p, shotOf(p, id)).boundary)).toEqual(['transition', 'cut', 'cut', 'transition', 'transition', 'cut']);
  });

  it('a cut keeps the state (light, weather, the place, props, who holds what, wardrobe) and lays the shot’s own continuity over it', () => {
    const { p, a, b } = returnFixture();
    const first = sceneStateFor(p, shotOf(p, 's11'));
    expect(first).toMatchObject({ boundary: 'transition', timeOfDay: 'DUSK', weather: 'rain', lighting: 'cool fluorescent light', placeState: 'the shutters half down', sources: { environment: { kind: 'SCENE', sceneId: 'sc1' } } });
    const cut = sceneStateFor(p, shotOf(p, 's12'));
    expect(cut).toMatchObject({ boundary: 'cut', timeOfDay: 'DUSK', weather: 'rain', lighting: 'cool fluorescent light', placeState: 'the shutters half down', sources: { environment: { kind: 'PREVIOUS_SHOT', shotId: 's11' } } });
    expect(cut.present).toEqual([{ characterId: a, wardrobe: 'green coat, red scarf', holding: ['a pen'], position: 'at the till', screenDirection: undefined }, { characterId: b, wardrobe: 'grey hoodie', holding: undefined, position: 'at the door', screenDirection: undefined }]);
    expect(cut.props).toEqual([{ name: 'a parcel', state: 'taped', position: 'on the counter', ownerCharacterId: a }]);
    // the next cut changes only what it says: the parcel is opened, still on the counter
    const third = sceneStateFor(p, shotOf(p, 's13'));
    expect(third.props).toEqual([{ name: 'a parcel', state: 'opened', position: 'on the counter', ownerCharacterId: a }]);
    expect(third.present.map((x) => x.characterId)).toEqual([a]); // exactly the shot's people
  });

  it('a transition resets to what the new scene declares: the street at night carries nothing of the pharmacy', () => {
    const { p, a } = returnFixture();
    const street = sceneStateFor(p, shotOf(p, 's21'));
    expect(street).toMatchObject({ boundary: 'transition', locationId: 'loc-street', timeOfDay: 'NIGHT', weather: 'dry', lighting: 'sodium street light', placeState: undefined, sources: { environment: { kind: 'SCENE', sceneId: 'sc2' } } });
    expect(street.props).toEqual([{ name: 'a bicycle', state: undefined, position: 'against the wall', ownerCharacterId: undefined }]);
    // positions and held things do not cross a transition; the wardrobe of the day does
    expect(street.present).toEqual([{ characterId: a, wardrobe: 'green coat, red scarf', holding: undefined, position: 'under a lamp post', screenDirection: undefined }]);
    expect(street.sources.wardrobe[a]).toEqual({ kind: 'WARDROBE_OF_THE_DAY', shotId: 's11' });
  });

  it('the return to the pharmacy starts from what scene 1 left there (not from the street), at the new scene’s time of day; the next cut keeps it', () => {
    const { p, a } = returnFixture();
    const back = sceneStateFor(p, shotOf(p, 's31'));
    expect(back).toMatchObject({ boundary: 'transition', locationId: 'loc-pharmacy', timeOfDay: 'NIGHT', weather: 'rain', lighting: 'cool fluorescent light', placeState: 'the shutters half down', sources: { environment: { kind: 'SCENE', sceneId: 'sc1' } } });
    expect(back.props).toEqual([{ name: 'a parcel', state: 'opened', position: 'on the counter', ownerCharacterId: a }]);
    expect(back.props.some((x) => x.name === 'a bicycle')).toBe(false);
    expect(back.present[0]).toMatchObject({ characterId: a, wardrobe: 'green coat, red scarf', position: undefined });
    const next = sceneStateFor(p, shotOf(p, 's32'), { previous: back });
    expect(next).toMatchObject({ boundary: 'cut', timeOfDay: 'NIGHT', weather: 'rain', props: [{ name: 'a parcel', state: 'opened' }] });
    expect(next.present[0]).toMatchObject({ holding: ['the parcel'], wardrobe: 'green coat, red scarf' });
  });

  it('with a World Bible, the return reads the bible’s state of the place (an earlier episode’s too)', () => {
    const { state, p } = returnFixture();
    const bible = deriveWorld(state, worldScopeOf(p), undefined, NOW);
    const at = lastStateAt(p, p.scenes[2], bible)!;
    expect(at.source).toEqual({ kind: 'WORLD', productionId: p.id, sceneId: 'sc1' });
    expect(at.state.props.map((x) => x.name)).toEqual(['a parcel']);
    const back = sceneStateFor(p, shotOf(p, 's31'), { bible });
    expect(back).toMatchObject({ weather: 'rain', sources: { environment: { kind: 'WORLD', sceneId: 'sc1' } } });
    // a second episode opening at the pharmacy reads what episode 1 left there, and the wardrobe of the day
    const ep2: Production = { ...p, id: 'prod-ep2', scenes: [{ id: 'e2sc1', number: 1, title: 'Morning', locationId: 'loc-pharmacy', timeOfDay: 'MORNING', characterIds: [p.castIds[0]], beats: [] }], shots: [{ ...shotOf(p, 's31'), id: 'e2s1', sceneId: 'e2sc1', continuity: undefined }] };
    const showBible = { ...bible, scope: { kind: 'SHOW' as const, showId: 'x' }, timeline: [...bible.timeline, { id: 'ev-e2', order: 1001, text: 'ep2', productionId: 'prod-ep2', sceneId: 'e2sc1', locationId: 'loc-pharmacy', source: 'SCENE' as const }] };
    const opening = sceneStateFor(ep2, ep2.shots[0], { bible: showBible });
    expect(opening).toMatchObject({ timeOfDay: 'MORNING', placeState: 'the shutters half down', sources: { environment: { kind: 'WORLD', productionId: p.id } } });
    expect(wardrobeOfTheDay(ep2, ep2.shots[0], p.castIds[0], showBible)).toMatchObject({ wardrobe: 'green coat, red scarf', source: { kind: 'WARDROBE_OF_THE_DAY', productionId: p.id } });
  });

  it('the pack carries the state and the prompt writes it: the return names the rain and the opened parcel, the street names neither; people by subject, never by name', () => {
    const { state, p } = returnFixture();
    const cast = state.characters.filter((c) => p.castIds.includes(c.id));
    const pharmacy = state.locations.find((l) => l.id === 'loc-pharmacy')!;
    const street = state.locations.find((l) => l.id === 'loc-street')!;
    const pack = resolveShotPack(state, p, shotOf(p, 's31'), { backend: 'local' });
    expect(pack.sceneState).toMatchObject({ shotId: 's31', weather: 'rain' });
    const prompt = h3ReferencePrompt(p, shotOf(p, 's31'), cast, pharmacy, p.scenes[2], bindingOf(pack), { relation: 'STORY_TRANSITION', sceneState: pack.sceneState });
    expect(prompt).toContain('Scene state (a new scene): night, weather: rain, light: cool fluorescent light, the place: the shutters half down. props: a parcel (opened) on the counter.');
    expect(lintH3Prompt(prompt, { labels: 'LOCAL', pictures: pack.pictures.length, audios: 0, lines: [], names: cast.map((c) => c.name) }).checks.find((c) => c.rule === 'no-names')!.ok).toBe(true);
    const sPack = resolveShotPack(state, p, shotOf(p, 's21'), { backend: 'local' });
    const sPrompt = h3ReferencePrompt(p, shotOf(p, 's21'), cast, street, p.scenes[1], bindingOf(sPack), { relation: 'STORY_TRANSITION', sceneState: sPack.sceneState });
    expect(sPrompt).not.toMatch(/rain|parcel/);
    // the cut carries who holds what (by subject)
    const cPack = resolveShotPack(state, p, shotOf(p, 's32'), { backend: 'local' });
    expect(sceneStateLine(cPack.sceneState, () => '<Subject 1>')).toMatch(/carried across the cut.*<Subject 1> holds the parcel/);
    // the plain prompt carries it too
    expect(takePrompt(p, shotOf(p, 's31'), cast, pharmacy, p.scenes[2], { sceneState: pack.sceneState })).toContain('weather: rain');
  });
});

describe('a prop state carried to the next shot (Tea 1.3: the samovar poured by itself)', () => {
  it('keeps a lasting state, drops an action in progress', () => {
    expect(carriedPropState('half-full')).toBe('half-full');
    expect(carriedPropState('broken')).toBe('broken');
    expect(carriedPropState('pouring')).toBeUndefined();
    expect(carriedPropState('filling with amber liquid')).toBeUndefined();
    expect(carriedPropState(undefined)).toBeUndefined();
  });
});