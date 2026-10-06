import { describe, expect, it } from 'vitest';
import type { Asset, Production, StudioState, Take, WorldBible } from '@/domain/types';
import { seed } from '@/domain/sample';
import { choosePlate, deriveWorld, diffWorld, establishCandidates, hashWorld, isEstablished, overlayWorld, productionsInScope, repinSafety, scopeKey, usageOf, withEstablished, worldForPlanner, worldForStory, worldScopeOf } from '@/domain/world';
import { resolveShotPack } from '@/server/production/shot-pack';
import { planningWorld } from '@/server/story/engine';
import { fixture, shotOf, TAKE_A } from './continuity-fixture';

/** THE WORLD BIBLE, PURE (src/domain/world.ts): derived from the studio on top of the previous revision, diffed,
 *  pinned with a re-pin only when nothing filmed changes, read per shot (the plate chosen by id — an established frame
 *  of an approved take before a drawn plate — and the pinned canonical images), and told to the planner. */

const NOW = '2026-10-03T00:00:00.000Z';
const img = (id: string, extra: Partial<Asset> = {}): Asset => ({ id, kind: 'IMAGE', src: `/api/media/${id}`, label: id, tags: [], sample: false, origin: 'DERIVED', mimeType: 'image/png', provenance: { path: `img/${id}.png` }, createdAt: NOW, ...extra });
const scopeOf = (p: Production) => worldScopeOf(p);
const est = (bible: WorldBible, takeId: string, assetId: string, over: Partial<{ locationId: string; timeOfDay: 'DUSK' | 'MORNING' | 'NIGHT'; framing: 'WIDE' | 'CLOSE_UP' }> = {}) => withEstablished(bible, [{ candidate: { locationId: over.locationId ?? 'loc-pharmacy', sceneId: 'sc1', shotId: 's11', takeId, videoAssetId: 'vid-a', frame: 6, timeOfDay: over.timeOfDay ?? 'DUSK', framing: over.framing ?? 'WIDE' }, imageAssetId: assetId, productionId: 'prod-cont', label: `established ${assetId}`, approvalId: 'appr-1', approvedAt: NOW }], NOW);

describe('deriving the bible from the studio', () => {
  it('a short has its own world: canonical images and voices as pinned, places with canon and plates, props, scene states, timeline, rules', () => {
    const { state, p } = fixture();
    const [a, b] = p.castIds;
    const w = deriveWorld(state, scopeOf(p), undefined, NOW);
    expect(scopeKey(w.scope)).toBe('production:prod-cont');
    expect(w.characters.find((c) => c.characterId === a)).toMatchObject({ canonical: { assetId: 'canon-a', version: 2, status: 'APPROVED' }, defaultWardrobeId: 'default' });
    expect(w.characters.find((c) => c.characterId === b)?.canonical).toEqual({ assetId: 'canon-b', version: 1, status: 'DRAFT' });
    const pharmacy = w.locations.find((l) => l.locationId === 'loc-pharmacy')!;
    expect(pharmacy).toMatchObject({ locked: false, canon: { fixedFeatures: ['a green cross sign'] }, lighting: ['DUSK'] });
    expect(pharmacy.plates.map((x) => [x.assetId, x.role, x.timeOfDay])).toEqual([['plate-master', 'MASTER', 'MORNING'], ['plate-dusk', 'STATE', 'DUSK']]);
    expect(w.props).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'a cash register', fixedAtLocationId: 'loc-pharmacy' })]));
    expect(w.states.map((s) => [s.sceneId, s.environment.timeOfDay, s.environment.lighting])).toEqual([['sc1', 'DUSK', 'cool fluorescent light'], ['sc2', 'DUSK', 'cool fluorescent light']]);
    expect(w.timeline.map((e) => e.sceneId)).toEqual(['sc1', 'sc2']);
    expect(w.rules.map((r) => r.id)).toEqual(['rule-style', 'rule-language']);
    expect(w.audio).toEqual({ dialogue: 'AUTO', songBed: 'INSTRUMENTAL_WHEN_AVAILABLE' });
  });

  it('a show’s world: its rules, relationships and timeline facts, its episodes in story order, open storylines', () => {
    const s = seed();
    const show = s.shows.find((x) => x.id === 'last-sip')!;
    const state: StudioState = { ...s, shows: s.shows.map((x) => (x.id === show.id ? { ...x, bible: { worldRules: ['Nobody pays at the café.'], relationships: ['Layla is Abu Samir’s niece.'], timeline: ['S1E1: Layla opened the café an hour early.'], unresolved: ['Karim’s eleven teas'] } } : x)) };
    const w = deriveWorld(state, { kind: 'SHOW', showId: show.id }, undefined, NOW);
    expect(productionsInScope(state, w.scope).map((p) => p.id).slice(0, 3)).toEqual(['s1e1', 's1e2', 's2e1']);
    expect(w.rules[0]).toMatchObject({ text: 'Nobody pays at the café.', scope: 'WORLD', source: 'SHOW_BIBLE' });
    const layla = state.characters.find((c) => c.name === 'Layla')!;
    expect(w.relationships[0]).toMatchObject({ text: 'Layla is Abu Samir’s niece.', source: 'SHOW_BIBLE' });
    expect(w.relationships[0].characterIds).toContain(layla.id);
    // the show bible's fact sits after its own episode's scenes in story order
    const fact = w.timeline.findIndex((e) => e.source === 'SHOW_BIBLE');
    const s1e1Scenes = w.timeline.filter((e) => e.productionId === 's1e1');
    if (s1e1Scenes.length) expect(fact).toBeGreaterThan(w.timeline.indexOf(s1e1Scenes.at(-1)!));
    expect(w.openStorylines).toEqual(['Karim’s eleven teas']);
    expect(worldForStory(w)).toMatchObject({ rules: ['Nobody pays at the café.'], openStorylines: ['Karim’s eleven teas'] });
  });

  it('nothing new, nothing written: a second derivation on top of the first hashes the same', () => {
    const { state, p } = fixture();
    const first = deriveWorld(state, scopeOf(p), undefined, NOW);
    expect(hashWorld(deriveWorld(state, scopeOf(p), first, '2026-10-04T00:00:00.000Z'))).toBe(hashWorld(first));
    expect(diffWorld(first, deriveWorld(state, scopeOf(p), first, 'later'))).toEqual([]);
  });

  it('carries forward what only the bible knows: established frames, the lock (a redraw adds plates, never swaps them), the producer’s rules, the audio policy', () => {
    const { state, p } = fixture();
    let w = est(deriveWorld(state, scopeOf(p), undefined, NOW), 'take-a', 'est-1');
    w = { ...w, rules: [...w.rules, { id: 'rule-p', text: 'It always rains on Thursdays.', scope: 'WORLD', source: 'PRODUCER' }], audio: { dialogue: 'RECORDED_VOICE', songBed: 'MASTER' } };
    const pharmacy = w.locations.find((l) => l.locationId === 'loc-pharmacy')!;
    expect(pharmacy.locked).toBe(true);
    // the plates are redrawn: the locked place keeps its canon plates and gains the new ones; the unlocked street follows its redraw
    const redrawn: StudioState = { ...state, locations: state.locations.map((l) => (l.id === 'loc-pharmacy' ? { ...l, refs: [{ id: 'r9', role: 'MASTER' as const, assetId: 'plate-master-2', label: 'Master plate' }], masterAssetId: 'plate-master-2' } : l.id === 'loc-street' ? { ...l, refs: [{ id: 'r8', role: 'MASTER' as const, assetId: 'plate-street-2', label: 'Master plate' }], masterAssetId: 'plate-street-2' } : l)) };
    const next = deriveWorld(redrawn, scopeOf(p), w, 'later');
    expect(next.locations.find((l) => l.locationId === 'loc-pharmacy')!.plates.map((x) => x.assetId)).toEqual(['plate-master', 'plate-dusk', 'est-1', 'plate-master-2']);
    expect(next.locations.find((l) => l.locationId === 'loc-street')!.plates.map((x) => x.assetId)).toEqual(['plate-street-2']);
    expect(next.rules.some((r) => r.id === 'rule-p')).toBe(true);
    expect(next.audio).toEqual({ dialogue: 'RECORDED_VOICE', songBed: 'MASTER' });
    expect(isEstablished(next, { takeId: 'take-a', frame: 6 })).toBe(true);
    // registering the same frame twice adds nothing
    expect(est(next, 'take-a', 'est-1').locations.find((l) => l.locationId === 'loc-pharmacy')!.plates.filter((x) => x.role === 'ESTABLISHED')).toHaveLength(1);
  });
});

describe('diff and re-pin', () => {
  it('names what changed, entity by entity', () => {
    const { state, p } = fixture();
    const [a] = p.castIds;
    const before = deriveWorld(state, scopeOf(p), undefined, NOW);
    const after = deriveWorld({ ...state, characters: state.characters.map((c) => (c.id === a ? { ...c, canonicalImage: { ...c.canonicalImage!, assetId: 'canon-a3', version: 3, status: 'DRAFT' as const } } : c)) }, scopeOf(p), est(before, 'take-a', 'est-1'), NOW);
    const diff = diffWorld(before, after);
    expect(diff).toEqual(expect.arrayContaining([
      { op: 'UPDATE', path: `characters/${a}/canonical`, detail: expect.stringMatching(/v2 APPROVED → v3 DRAFT/) },
      { op: 'ADD', path: 'locations/loc-pharmacy/plates/est-1', detail: expect.stringMatching(/established/) },
      { op: 'UPDATE', path: 'locations/loc-pharmacy/locked', detail: expect.stringMatching(/locked/) },
    ]));
    expect(diffWorld(undefined, before)).toEqual([{ op: 'ADD', path: 'bible', detail: expect.stringMatching(/character\(s\)/) }]);
  });

  it('a production follows a new revision only when nothing it already filmed changes', () => {
    const { state, p } = fixture(); // shot 1.1 has a take: both characters and the pharmacy are filmed
    const [a, b] = p.castIds;
    const usage = usageOf(p);
    expect([...usage.characterIds].sort()).toEqual([a, b].sort());
    expect([...usage.locationIds]).toEqual(['loc-pharmacy']);
    const before = deriveWorld(state, scopeOf(p), undefined, NOW);
    // an added plate or established frame: safe
    expect(repinSafety(diffWorld(before, est(before, 'take-a', 'est-1')), usage).safe).toBe(true);
    // a filmed character's canonical image redrawn: not safe
    const redrawn = deriveWorld({ ...state, characters: state.characters.map((c) => (c.id === a ? { ...c, canonicalImage: { ...c.canonicalImage!, assetId: 'canon-a3', version: 3 } } : c)) }, scopeOf(p), before, NOW);
    expect(repinSafety(diffWorld(before, redrawn), usage)).toMatchObject({ safe: false, blocking: [{ path: `characters/${a}/canonical` }] });
    // the filmed place loses a plate: not safe; the street (not filmed yet) is redrawn: safe
    const pharmacyRedrawn = deriveWorld({ ...state, locations: state.locations.map((l) => (l.id === 'loc-pharmacy' ? { ...l, refs: l.refs.filter((r) => r.role !== 'STATE') } : l)) }, scopeOf(p), before, NOW);
    expect(repinSafety(diffWorld(before, pharmacyRedrawn), usage)).toMatchObject({ safe: false, blocking: [{ op: 'REMOVE', path: 'locations/loc-pharmacy/plates/plate-dusk' }] });
    const streetRedrawn = deriveWorld({ ...state, locations: state.locations.map((l) => (l.id === 'loc-street' ? { ...l, refs: [{ id: 'r8', role: 'MASTER' as const, assetId: 'plate-street-2', label: 'Master plate' }], masterAssetId: 'plate-street-2' } : l)) }, scopeOf(p), before, NOW);
    expect(repinSafety(diffWorld(before, streetRedrawn), usage).safe).toBe(true);
  });
});

describe('the plate a shot is filmed against', () => {
  const { state, p } = fixture();
  const assets = [...state.assets, img('est-dusk'), img('est-morning'), img('est-gone', { unavailable: true })];
  const base = deriveWorld({ ...state, assets }, scopeOf(p), undefined, NOW);
  const loc = (b: WorldBible) => b.locations.find((l) => l.locationId === 'loc-pharmacy')!;

  it('the drawn plate for the time of day, else the master', () => {
    expect(choosePlate(loc(base), { timeOfDay: 'DUSK' }, assets)).toMatchObject({ plate: { assetId: 'plate-dusk' }, why: expect.stringMatching(/drawn plate of Corner Pharmacy for dusk/), alternates: ['plate-master'] });
    expect(choosePlate(loc(base), { timeOfDay: 'NIGHT' }, assets)?.plate.assetId).toBe('plate-master');
  });

  it('an established frame is the place’s reference only for a shot that shows everyone in it (its people would be drawn again)', () => {
    const w = est(base, 'take-y', 'est-dusk');
    const people = () => ['char-a', 'char-b'];
    expect(choosePlate(loc(w), { timeOfDay: 'DUSK', characterIds: ['char-a'] }, assets, people)?.plate.assetId).toBe('plate-dusk');
    expect(choosePlate(loc(w), { timeOfDay: 'DUSK', characterIds: ['char-a', 'char-b'] }, assets, people)?.plate.assetId).toBe('est-dusk');
    expect(choosePlate(loc(w), { timeOfDay: 'DUSK', characterIds: [] }, assets, () => [])?.plate.assetId).toBe('est-dusk');
    // the source shot unknown: eligible as before
    expect(choosePlate(loc(w), { timeOfDay: 'DUSK', characterIds: ['char-a'] }, assets, () => undefined)?.plate.assetId).toBe('est-dusk');
  });

  it('an established frame of an approved take first — at this time of day before the drawn plate; at another, after it, before the master', () => {
    const w = est(est(base, 'take-x', 'est-morning', { timeOfDay: 'MORNING' }), 'take-y', 'est-dusk');
    expect(choosePlate(loc(w), { timeOfDay: 'DUSK' }, assets)?.plate.assetId).toBe('est-dusk');
    expect(choosePlate(loc(w), { timeOfDay: 'MORNING' }, assets)?.plate.assetId).toBe('est-morning');
    expect(choosePlate(loc(w), { timeOfDay: 'NIGHT' }, assets)).toMatchObject({ plate: { assetId: 'est-morning' }, why: expect.stringMatching(/the light is set by the prompt/) });
    const noState = { ...loc(w), plates: loc(w).plates.filter((x) => x.role !== 'STATE') };
    expect(choosePlate(noState, { timeOfDay: 'NIGHT' }, assets)?.plate.role).toBe('ESTABLISHED');
  });

  it('prefers the same framing class among equals and never an unavailable file', () => {
    const w = est(est(base, 'take-w', 'est-gone'), 'take-c', 'est-dusk', { framing: 'CLOSE_UP' });
    expect(choosePlate(loc(w), { timeOfDay: 'DUSK', framing: 'WIDE' }, assets)?.plate.assetId).toBe('est-dusk');
    const both = est(est(base, 'take-w2', 'est-morning', { timeOfDay: 'DUSK', framing: 'WIDE' }), 'take-c2', 'est-dusk', { framing: 'CLOSE_UP' });
    expect(choosePlate(loc(both), { timeOfDay: 'DUSK', framing: 'CLOSE_UP' }, assets)?.plate.assetId).toBe('est-dusk');
    expect(choosePlate(loc(both), { timeOfDay: 'DUSK', framing: 'MEDIUM_WIDE' }, assets)?.plate.assetId).toBe('est-morning');
  });

  it('the overlay makes the shot pack condition the take on the chosen plate and the pinned canonical image, and says so', () => {
    const [a] = p.castIds;
    const w = est(base, 'take-y', 'est-dusk');
    const pinned = { ...w, characters: w.characters.map((c) => (c.characterId === a ? { ...c, canonical: { assetId: 'open-11', version: 1, status: 'APPROVED' as const } } : c)) };
    // a shot that shows everyone the established frame shows (its source, s11, holds both)
    const sh = { ...shotOf(p, 's13'), characterIds: shotOf(p, 's11').characterIds };
    const { state: s, read } = overlayWorld({ ...state, assets }, pinned, p, sh, { id: 'wrev-1', number: 1, pinned: true });
    const pack = resolveShotPack(s, p, sh, { backend: 'local' });
    expect(pack.location?.assetId).toBe('est-dusk');
    expect(pack.subjects[0]).toMatchObject({ characterId: a, assetId: 'open-11' });
    expect(read).toMatchObject({ revisionNumber: 1, pinned: true, location: { assetId: 'est-dusk', role: 'ESTABLISHED', source: { kind: 'FROM_TAKE', takeId: 'take-y' } }, characters: expect.arrayContaining([expect.objectContaining({ characterId: a, pinnedVersion: 1, currentVersion: 2, usedPinned: true })]) });
    expect(read.conflicts.join(' ')).toMatch(/pinned to v1/);
    // the studio itself is untouched
    expect(state.locations.find((l) => l.id === 'loc-pharmacy')!.refs.some((r) => r.assetId === 'est-dusk')).toBe(false);
  });

  it('a place missing from the revision is named, and the shot keeps its current plates', () => {
    const w = { ...base, locations: base.locations.filter((l) => l.locationId !== 'loc-pharmacy') };
    const { state: s, read } = overlayWorld(state, w, p, shotOf(p, 's13'), { id: 'r', number: 2, pinned: false });
    expect(read.location).toBeUndefined();
    expect(read.conflicts[0]).toMatch(/not in the World Bible revision 2/);
    expect(resolveShotPack(s, p, shotOf(p, 's13'), { backend: 'local' }).location?.assetId).toBe('plate-dusk');
  });
});

describe('establishing and planning', () => {
  it('an approved cut establishes, per place and time of day, the widest accepted take of the first scene there, a quarter second in', () => {
    const accepted = (id: string, extra: Partial<Take> = {}): Take => ({ ...TAKE_A, id, assetId: 'vid-a', ...extra });
    const { state, p } = fixture({ shots: (shots) => shots.map((s) => (s.id === 's11' ? { ...s, framing: 'MEDIUM' as const } : s.id === 's12' ? { ...s, framing: 'WIDE' as const, takes: [accepted('take-12', { trimStartFrames: 22 })], selectedTakeId: 'take-12' } : s.id === 's21' ? { ...s, takes: [accepted('take-21', { provider: 'SAMPLE' })], selectedTakeId: 'take-21' } : s)) });
    const c = establishCandidates(p, state.assets);
    expect(c).toEqual([{ locationId: 'loc-pharmacy', sceneId: 'sc1', shotId: 's12', takeId: 'take-12', videoAssetId: 'vid-a', frame: 28, timeOfDay: 'DUSK', framing: 'WIDE' }]);
  });

  it('the planner is told the returning place, its established frames, what an earlier scene left there, and what people last wore', () => {
    const { state, p } = fixture({ shots: (shots) => shots.map((s) => (s.id === 's13' ? { ...s, continuity: { ...s.continuity!, characters: s.continuity!.characters.map((c) => ({ ...c, wardrobe: 'green apron over a grey sweater' })), props: [{ name: 'a paper bag', state: 'folded', position: 'on the counter' }] } } : s)) });
    // a third scene returns to the pharmacy
    const back: Production = { ...p, scenes: [...p.scenes, { id: 'sc3', number: 3, title: 'Back', locationId: 'loc-pharmacy', timeOfDay: 'NIGHT', characterIds: [p.castIds[0]], beats: [] }] };
    const w = est(deriveWorld({ ...state, productions: state.productions.map((x) => (x.id === p.id ? back : x)) }, scopeOf(back), undefined, NOW), 'take-a', 'est-1');
    const text = worldForPlanner(w, back, back.scenes[2]);
    expect(text).toMatch(/RETURNING LOCATION \(World Bible\): Corner Pharmacy was already shown in an approved cut — its established frames are reused by id \(established est-1, dusk\)/);
    expect(text).toMatch(/fixed features: a green cross sign/);
    expect(text).toMatch(/a paper bag \(on the counter\) folded/);
    expect(text).toMatch(/Last worn \(keep unless the story changes the day\): .*green apron over a grey sweater/);
    expect(planningWorld(back, back.scenes[2], w)).toBe(text);
    // without a bible, the production's own earlier shots still mark a return
    expect(planningWorld(back, back.scenes[2])).toMatch(/^RETURNING LOCATION: this place already appeared in scene 1/);
  });
});
