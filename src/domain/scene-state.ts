import { BOUNDARY_RELATION, RELATION_BOUNDARY, type Production, type Scene, type ScreenDirection, type Shot, type ShotBoundary, type ShotRelation, type WorldBible, type WorldSceneState } from './types';
import type { TimeOfDay } from './vocabulary';

/** Shots in cut order (as src/domain/timeline.ts orderedShots; repeated here so the World Bible can import this
 *  module without a cycle through the timeline). */
const orderedShots = (p: Production): Shot[] => { const n = new Map(p.scenes.map((sc) => [sc.id, sc.number])); return [...p.shots].sort((a, b) => (n.get(a.sceneId) ?? 0) - (n.get(b.sceneId) ?? 0) || a.number - b.number); };

/** THE SCENE STATE, PURE (the directive: "structured state rather than the previous frame or an LLM's conversation
 *  history"). A small structured record of what is true when a shot is filmed — who is present and what they wear
 *  and hold, the props and where they are, the time of day, the weather, the light, the state of the place — carried
 *  shot to shot and written into every prompt:
 *  - an editorial CUT (and a CONTINUATION) keeps the previous shot's state and lays this shot's own continuity over it;
 *  - a TRANSITION resets to what the new scene declares: the scene's time of day, the place as the story last left it
 *    (the World Bible's state of the last scene there — an earlier episode's too — else this production's own earlier
 *    scene there), this shot's own continuity on top; nothing of the previous shot's place carries over;
 *  - wardrobe is the wardrobe of the day: what a person last wore in story order, unless this shot says otherwise.
 *  Every fact says where it came from. Pure: the production (and the bible) in, the state out. */

export interface ScenePerson { characterId: string; wardrobe?: string; holding?: string[]; position?: string; screenDirection?: ScreenDirection }
export interface SceneProp { name: string; state?: string; position?: string; ownerCharacterId?: string }
export type SceneStateSource = { kind: 'SHOT'; shotId: string } | { kind: 'PREVIOUS_SHOT'; shotId: string } | { kind: 'SCENE'; sceneId: string } | { kind: 'WORLD'; productionId: string; sceneId: string } | { kind: 'WARDROBE_OF_THE_DAY'; shotId?: string; productionId?: string; sceneId?: string };

export interface SceneState {
  shotId: string;
  sceneId: string;
  locationId?: string;
  boundary: ShotBoundary;
  relation: ShotRelation;
  timeOfDay?: TimeOfDay;
  weather?: string;
  lighting?: string;
  /** the state of the place in words ("the shutters are down, rain on the glass") */
  placeState?: string;
  present: ScenePerson[];
  props: SceneProp[];
  /** where the carried facts came from (the shot's own continuity is always on top) */
  sources: { environment: SceneStateSource; props: SceneStateSource; wardrobe: Record<string, SceneStateSource> };
}

const norm = (s?: string) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const clean = (s?: string) => (s ?? '').replace(/\s+/g, ' ').trim() || undefined;

/** The relation a shot is filmed for, by the same rules as the shot pack (src/server/production/shot-pack.ts
 *  effectiveRelation): an explicit boundary, else the older plan's relation; a continuation only inside a scene; an
 *  unstated relation is a cut inside a scene and a transition at its start. */
export function relationOf(p: Production, sh: Shot): { relation: ShotRelation; boundary: ShotBoundary; previous?: Shot } {
  const ordered = orderedShots(p);
  const i = ordered.findIndex((x) => x.id === sh.id);
  const previous = i > 0 ? ordered[i - 1] : undefined;
  const sameScene = Boolean(previous && previous.sceneId === sh.sceneId);
  const boundary = sh.boundary ?? (sh.continuity?.relationToPrevious ? RELATION_BOUNDARY[sh.continuity.relationToPrevious] : undefined);
  const planned = boundary ? BOUNDARY_RELATION[boundary] : undefined;
  const relation: ShotRelation = planned === 'CONTINUATION' ? (sameScene ? 'CONTINUATION' : 'CUT') : planned ?? (sameScene ? 'CUT' : 'STORY_TRANSITION');
  return { relation, boundary: RELATION_BOUNDARY[relation], previous };
}

/** The last state the story left at a place before `scene` of `p`: the World Bible's scene states (every episode of
 *  the show, in story order) before this scene at this place; without a bible, this production's own earlier scene
 *  there (its last shot's continuity, else the scene's exit state). */
export function lastStateAt(p: Production, scene: Scene, bible?: WorldBible): { state: WorldSceneState; source: SceneStateSource } | undefined {
  if (!scene.locationId) return undefined;
  if (bible) {
    const own = bible.timeline.find((e) => e.source === 'SCENE' && e.productionId === p.id) ?? bible.states.find((s) => s.productionId === p.id);
    const myOrder = (own ? Math.floor(own.order / 1000) : 0) * 1000 + scene.number;
    const here = bible.states.filter((s) => s.locationId === scene.locationId && s.sceneId !== scene.id && (s.order < myOrder || (s.productionId === p.id && (p.scenes.find((sc) => sc.id === s.sceneId)?.number ?? 1e9) < scene.number))).at(-1);
    if (here) return { state: here, source: { kind: 'WORLD', productionId: here.productionId, sceneId: here.sceneId } };
  }
  const earlier = [...p.scenes].filter((sc) => sc.number < scene.number && sc.locationId === scene.locationId).sort((a, b) => a.number - b.number).at(-1);
  if (!earlier) return undefined;
  const state = sceneEndState(p, earlier, 0);
  return state ? { state, source: { kind: 'SCENE', sceneId: earlier.id } } : undefined;
}

/** What a scene leaves behind (the World Bible's scene state): the accumulated scene state of its last shot — what
 *  every cut carried, not only what the last shot said — plus the scene's exit state. None when the scene's shots
 *  carry no continuity record and it declares no exit state (nothing is known). */
export function sceneEndState(p: Production, sc: Scene, productionIndex: number): WorldSceneState | undefined {
  const shots = orderedShots(p).filter((sh) => sh.sceneId === sc.id);
  if (!shots.some((sh) => sh.continuity) && !sc.exitState) return undefined;
  const last = shots.at(-1);
  const st = last ? sceneStateFor(p, last) : undefined;
  return {
    id: `state-${sc.id}`, productionId: p.id, sceneId: sc.id, order: productionIndex * 1000 + sc.number, locationId: sc.locationId,
    environment: { timeOfDay: st?.timeOfDay ?? sc.timeOfDay, weather: st?.weather, lighting: st?.lighting, state: st?.placeState },
    characters: (st?.present ?? []).map((x) => ({ characterId: x.characterId, wardrobe: x.wardrobe, position: x.position, holding: x.holding })),
    props: (st?.props ?? []).map((x) => ({ name: x.name, state: x.state, position: x.position, ownerCharacterId: x.ownerCharacterId })),
    exitState: sc.exitState,
  };
}

/** What a person last wore before this shot, in story order: this production's earlier shots (cut order), else the
 *  bible's scene states before this production. */
export function wardrobeOfTheDay(p: Production, sh: Shot, characterId: string, bible?: WorldBible): { wardrobe: string; source: SceneStateSource } | undefined {
  const ordered = orderedShots(p);
  const i = ordered.findIndex((x) => x.id === sh.id);
  for (let k = i - 1; k >= 0; k--) {
    const worn = ordered[k].continuity?.characters?.find((x) => x.characterId === characterId)?.wardrobe;
    if (clean(worn)) return { wardrobe: clean(worn)!, source: { kind: 'WARDROBE_OF_THE_DAY', shotId: ordered[k].id } };
  }
  if (bible) {
    const own = bible.timeline.find((e) => e.source === 'SCENE' && e.productionId === p.id) ?? bible.states.find((s) => s.productionId === p.id);
    const myProduction = own ? Math.floor(own.order / 1000) : 0;
    const before = bible.states.filter((s) => s.productionId !== p.id && Math.floor(s.order / 1000) < myProduction);
    for (const s of [...before].reverse()) {
      const worn = s.characters.find((x) => x.characterId === characterId)?.wardrobe;
      if (clean(worn)) return { wardrobe: clean(worn)!, source: { kind: 'WARDROBE_OF_THE_DAY', productionId: s.productionId, sceneId: s.sceneId } };
    }
  }
  return undefined;
}

function mergeProps(base: SceneProp[], own: SceneProp[]): SceneProp[] {
  const out = base.map((x) => ({ ...x }));
  for (const pr of own) {
    if (!clean(pr.name)) continue;
    const i = out.findIndex((x) => norm(x.name) === norm(pr.name));
    const next: SceneProp = { name: clean(pr.name)!, state: clean(pr.state) ?? (i >= 0 ? out[i].state : undefined), position: clean(pr.position) ?? (i >= 0 ? out[i].position : undefined), ownerCharacterId: pr.ownerCharacterId ?? (i >= 0 ? out[i].ownerCharacterId : undefined) };
    if (i >= 0) out[i] = next; else out.push(next);
  }
  return out;
}

/** The scene state a shot is filmed in (see the module note). `previous` (the state computed for the previous shot)
 *  may be given to avoid recomputing the chain. */
/** A prop's state carried into a later shot: a lasting state ("half-full", "broken", "on its side") is kept; an action
 *  in progress ("pouring", "filling with amber liquid") is not — it was someone's action in that shot, and carried on
 *  it made the next shot repeat it with nobody doing it (acceptance 2026-10-06, Tea 1.3: the samovar poured by itself
 *  for seconds after the vendor's pouring shot). The shot's own props still say what happens in it. */
export function carriedPropState(state: string | undefined): string | undefined {
  return state && /^\s*\w+ing\b/i.test(state) ? undefined : state;
}

export function sceneStateFor(p: Production, sh: Shot, opts: { bible?: WorldBible; previous?: SceneState } = {}): SceneState {
  const scene = p.scenes.find((sc) => sc.id === sh.sceneId);
  const { relation, boundary, previous } = relationOf(p, sh);
  const own = sh.continuity;
  const keep = relation !== 'STORY_TRANSITION' && previous && previous.sceneId === sh.sceneId;
  const prevState = keep ? (opts.previous?.shotId === previous!.id ? opts.previous : sceneStateFor(p, previous!, { bible: opts.bible })) : undefined;
  // the environment: carried from the previous shot on a cut or continuation; on a transition, what the scene
  // declares and what the story last left at the place
  let timeOfDay: TimeOfDay | undefined; let weather: string | undefined; let lighting: string | undefined; let placeState: string | undefined;
  let props: SceneProp[] = [];
  let envSource: SceneStateSource; let propsSource: SceneStateSource;
  if (prevState) {
    ({ timeOfDay, weather, lighting, placeState } = prevState);
    props = prevState.props.map((x) => ({ ...x, state: carriedPropState(x.state) }));
    envSource = { kind: 'PREVIOUS_SHOT', shotId: prevState.shotId }; propsSource = { kind: 'PREVIOUS_SHOT', shotId: prevState.shotId };
  } else {
    timeOfDay = scene?.timeOfDay;
    envSource = scene ? { kind: 'SCENE', sceneId: scene.id } : { kind: 'SHOT', shotId: sh.id };
    propsSource = envSource;
    const last = scene ? lastStateAt(p, scene, opts.bible) : undefined;
    if (last) {
      weather = clean(last.state.environment.weather); lighting = clean(last.state.environment.lighting); placeState = clean(last.state.environment.state) ?? clean(last.state.exitState);
      props = last.state.props.filter((x) => clean(x.name)).map((x) => ({ name: clean(x.name)!, state: carriedPropState(clean(x.state)), position: clean(x.position), ownerCharacterId: x.ownerCharacterId }));
      envSource = last.source; propsSource = last.source;
    }
  }
  // an older or partial continuity record may lack any of its parts
  const ownEnv = own?.environment ?? {};
  if (ownEnv.timeOfDay) timeOfDay = ownEnv.timeOfDay;
  if (clean(ownEnv.weather)) weather = clean(ownEnv.weather);
  if (clean(ownEnv.lighting)) lighting = clean(ownEnv.lighting);
  if (clean(ownEnv.state)) placeState = clean(ownEnv.state);
  props = mergeProps(props, (own?.props ?? []).map((x) => ({ name: x.name, state: x.state, position: x.position, ownerCharacterId: x.ownerCharacterId })));
  // the people: exactly the shot's, with the wardrobe of the day and, on a cut or continuation, their last position
  // and what they held (positions never carry across a transition)
  const wardrobeSources: Record<string, SceneStateSource> = {};
  const present: ScenePerson[] = sh.characterIds.map((characterId) => {
    const mine = own?.characters?.find((x) => x.characterId === characterId);
    const before = prevState?.present.find((x) => x.characterId === characterId);
    let wardrobe = clean(mine?.wardrobe);
    if (wardrobe) wardrobeSources[characterId] = { kind: 'SHOT', shotId: sh.id };
    else if (before?.wardrobe) { wardrobe = before.wardrobe; wardrobeSources[characterId] = prevState!.sources.wardrobe[characterId] ?? { kind: 'PREVIOUS_SHOT', shotId: prevState!.shotId }; }
    else { const day = wardrobeOfTheDay(p, sh, characterId, opts.bible); if (day) { wardrobe = day.wardrobe; wardrobeSources[characterId] = day.source; } }
    const holding = mine?.holding?.map((h) => clean(h)!).filter(Boolean) ?? before?.holding;
    return { characterId, wardrobe, holding: holding?.length ? holding : undefined, position: clean(mine?.position) ?? before?.position, screenDirection: mine?.screenDirection ?? before?.screenDirection };
  });
  return { shotId: sh.id, sceneId: sh.sceneId, locationId: scene?.locationId, boundary, relation, timeOfDay, weather, lighting, placeState, present, props, sources: { environment: envSource, props: propsSource, wardrobe: wardrobeSources } };
}

const tod = (t?: string) => (t ?? '').toLowerCase().replace(/_/g, ' ');

/** The scene state as one prompt sentence, with people named by `who` (a bound subject, a described person) — never
 *  by name. Wardrobe is not written (a character's wardrobe is its canonical image; words for it drew a third person,
 *  D30): it is carried in the record for the planner and the inspectors. */
/** `environmentOnly`: the take starts from an opening frame that already shows who is where and what they hold — the
 *  carried people and props are left to the frame and only the time, weather, light and place are said (a take told
 *  the previous shot's props "in his left hand or on the floor" beside a frame showing him reach for a knob cut inside
 *  itself to show them, 2026-10-08, "The Last Crossing" 2.4). */
export function sceneStateLine(s: SceneState, who: (characterId: string) => string | undefined, opts: { environmentOnly?: boolean } = {}): string {
  const env = [s.timeOfDay && tod(s.timeOfDay), s.weather && `weather: ${s.weather}`, s.lighting && `light: ${s.lighting}`, s.placeState && `the place: ${s.placeState.replace(/\.$/, '')}`].filter(Boolean);
  if (opts.environmentOnly) return env.length ? `Scene state (${s.boundary === 'transition' ? 'a new scene' : s.boundary === 'cut' ? 'carried across the cut' : 'carried on'}): ${env.join(', ')}.` : '';
  const people = s.present.map((x) => { const w = who(x.characterId); if (!w) return ''; const bits = [x.position && `is ${x.position}`, x.holding?.length && `holds ${x.holding.join(' and ')}`].filter(Boolean); return bits.length ? `${w} ${bits.join(', ')}` : ''; }).filter(Boolean);
  const props = s.props.filter((x) => x.state || x.position).map((x) => `${x.name}${x.state ? ` (${x.state})` : ''}${x.position ? ` ${x.position}` : ''}`);
  const parts = [env.length ? env.join(', ') : '', people.join('; '), props.length ? `props: ${props.join('; ')}` : ''].filter(Boolean);
  return parts.length ? `Scene state (${s.boundary === 'transition' ? 'a new scene' : s.boundary === 'cut' ? 'carried across the cut' : 'carried on'}): ${parts.join('. ')}.` : '';
}
