import type { Character, ContinuityState, KnowledgeFact, Location, PersistentChange, Production, RelationshipFact, ScreenDirection, Shot, ShotBoundary, ShotMotion, ShotRelation, StoryFact, StudioState, Take, WorldBible } from './types';
import { blockingFor, blockingLine, blockingRecord, type BlockingState } from './blocking';
import type { CameraMove, Framing, TimeOfDay } from './vocabulary';
import { canonical, hashString } from './hash';
import { orderedShots } from './timeline';
import { relationOf, sceneStateFor, type SceneState } from './scene-state';
import { primaryImageOf, primaryImageSourceOf } from './identity';
import { lightRuleAt, locationIdentity } from './location';

/** THE PRODUCTION CONTEXT OF ONE SHOT (cloud directive 2026-10-05 §4: "Each generated shot must be created from
 *  structured production state … stored by the application, not information that exists only inside an LLM prompt").
 *
 *  One pure function assembles, from the studio's stored records only, everything a take of a shot is made from:
 *  - CHARACTER STATE per present person: the canonical image (asset, version, approval) and the persistent voice
 *    identity (revision, engine), the wardrobe of the day, physical condition (the shot's own, else the persistent
 *    changes the story made to them), emotion, position, pose at the start and end, motion, who they interact with;
 *  - LOCATION STATE: the canonical identity (version, hash, line), architecture, layout, permanent furniture and
 *    landmarks, important objects with their current state and position, light, weather, time of day, the place's
 *    persistent changes;
 *  - SHOT STATE: the boundary (continuous / cut / transition), the previous shot's chosen take and whether it is
 *    approved, the action, the camera (framing, move, lens, angle), screen direction, dialogue timing (recorded
 *    durations are authoritative), required props and continuity constraints — including the previous shot's END
 *    pose as this shot's start on a continuous boundary;
 *  - STORY STATE: the events already completed (World Bible timeline + earlier scenes), relationships, the scene's
 *    objective, what each present character knows, the persistent changes in force;
 *  - ANCHORING: how long the chain of continuous shots is and whether this shot re-anchors (see `REANCHOR`).
 *
 *  Every fact names its source. The context is hashed: the take records the hash and a compact copy, so the
 *  production history says exactly what state a take was made from, and a later change of state is detectable.
 *  The prompt builders, the preflight and the pages read this one function — never their own partial copies. */

export const PRODUCTION_CONTEXT_VERSION = 2;

/** RE-ANCHORING (directive §9: "Long sequences must periodically re-anchor to canonical references so identity drift
 *  does not accumulate"). Every shot already carries the canonical images and the plate (the shot pack's identity
 *  rule); what accumulates along a chain of continuous shots is the TAIL — each guide is generated pixels inheriting
 *  the previous take's drift. After `after` consecutive continuous shots, the next continuous shot anchors only the
 *  shortest guide the engine keeps (motion, not appearance: 5 frames on local H3), so the canonical references
 *  dominate again; the chain count restarts at every cut or transition. A STARTING value, to be measured on the GPU
 *  (acceptance gate 5, a 4–8 shot continuous scene; 4 per docs/research/FILM-PIPELINE-RESEARCH-2026-10-05.md §A, where
 *  the stronger alternative — a forced cut back to the canonical image — is the GPU comparison G-test). The studio can change `after` (settings.generation.continuation
 *  .reanchorAfter); a shot's own explicit guide length always wins. */
export const REANCHOR = { after: 4, identityDrop: 0.10 } as const;

/** DRIFT-TRIGGERED RE-ANCHORING (docs/research/FILM-PIPELINE-RESEARCH-2026-10-05.md T5(b); continuity gaps 2026-10-06
 *  item 4). Chain length is a proxy; the measurement is better. The take a continuation would inherit its tail from
 *  carries its face check against the canonical images (`params.identityCheck`, take.ts): when a person present in
 *  this shot was REVIEW or FAIL there, or their median similarity fell by more than `REANCHOR.identityDrop` (START)
 *  since the take the chain started from, the tail carries drift — this shot re-anchors at once, whatever the chain
 *  length. A take with no measurement (offline QA, a stylised face) never triggers it. Pure. */
export interface IdentityMeasure { verdict?: string; median?: number | null }
export const identityOfTake = (t: Pick<Take, 'params'> | undefined): Record<string, IdentityMeasure> | undefined => {
  const ic = t?.params?.identityCheck as { characters?: Record<string, IdentityMeasure> } | undefined;
  return ic?.characters && typeof ic.characters === 'object' ? ic.characters : undefined;
};
export function identityDrift(p: Production, sh: Shot, chainLength: number, drop: number = REANCHOR.identityDrop): Array<{ characterId: string; detail: string }> {
  if (chainLength < 1) return [];
  const ordered = orderedShots(p);
  const i = ordered.findIndex((x) => x.id === sh.id);
  const prev = i > 0 ? ordered[i - 1] : undefined;
  const chosen = (s?: Shot) => s?.takes.find((t) => t.id === s.selectedTakeId);
  const now = identityOfTake(chosen(prev));
  if (!prev || !now) return [];
  // the take the chain started from: the shot before the first continuous one
  const start = ordered[i - chainLength];
  const then = start && start.id !== prev.id ? identityOfTake(chosen(start)) : undefined;
  const out: Array<{ characterId: string; detail: string }> = [];
  for (const id of sh.characterIds) {
    const m = now[id];
    if (!m) continue;
    const t0 = then?.[id]?.median;
    if (m.verdict === 'REVIEW' || m.verdict === 'FAIL') out.push({ characterId: id, detail: `face check ${m.verdict} on shot ${prev.number}'s take` });
    else if (typeof m.median === 'number' && typeof t0 === 'number' && t0 - m.median > drop) out.push({ characterId: id, detail: `face similarity ${t0.toFixed(2)} → ${m.median.toFixed(2)} along the chain (a drop over ${drop})` });
  }
  return out;
}

export type FactSource =
  | { kind: 'SHOT'; shotId: string } | { kind: 'PREVIOUS_SHOT'; shotId: string } | { kind: 'PREVIOUS_TAKE'; shotId: string; takeId: string } | { kind: 'SCENE'; sceneId: string }
  | { kind: 'STORY'; sceneId: string; factId: string } | { kind: 'CHARACTER' } | { kind: 'LOCATION' } | { kind: 'WORLD'; productionId?: string; sceneId?: string }
  | { kind: 'UNKNOWN' };

export interface CharacterContext {
  characterId: string;
  name: string;
  canonical?: { assetId: string; version?: number; status: 'DRAFT' | 'APPROVED' | 'PORTRAIT' };
  voice?: { revision: number; model: string; status: string; language: string; dialect?: string };
  wardrobe?: { text: string; source: FactSource };
  /** A WARDROBE CHANGE THE STORY MADE (a persistent change keyed wardrobe/outfit/costume/clothes…): the clothes are then
   *  NOT those of the canonical image, and the prompt says so (src/server/story/prompts.ts retention) — the canonical
   *  image stays the face and body. Never inferred from the planner's wardrobe words (D30). */
  wardrobeChange?: { text: string; source: FactSource };
  condition: Array<{ text: string; source: FactSource }>;
  emotion?: string;
  position?: string;
  screenDirection?: ScreenDirection;
  eyeline?: string;
  holding?: string[];
  startPose?: { text: string; source: FactSource };
  endPose?: string;
  motion?: ShotMotion;
  interactingWith: string[];
  speaks: boolean;
}

export interface LocationContext {
  locationId: string;
  name: string;
  kind: 'INTERIOR' | 'EXTERIOR';
  identity: { version: number; hash: string; line: string };
  architecture?: string;
  layout?: string;
  permanent: string[];
  objects: Array<{ name: string; state?: string; position?: string; ownerCharacterId?: string }>;
  timeOfDay?: TimeOfDay;
  weather?: string;
  lighting?: string;
  /** where the light came from: the scene state (carried or stated), or the place's own rule for the time of day */
  lightingFrom?: 'SCENE' | 'LOCATION_RULE';
  placeState?: string;
  changes: Array<{ text: string; source: FactSource }>;
  hasPlate: boolean;
}

export interface DialogueTiming { lineId: string; characterId: string; text: string; durationSeconds?: number; source: 'RECORDED' | 'ESTIMATE'; from?: number; to?: number }

export interface ShotContext {
  shotId: string;
  sceneId: string;
  number: number;
  boundary: ShotBoundary;
  relation: ShotRelation;
  previous?: { shotId: string; takeId?: string; assetId?: string; approved: boolean; rating?: string; sameScene: boolean };
  action: string;
  camera: { framing: Framing; move: CameraMove; lens?: string; angle?: string };
  durationSeconds: number;
  dialogue: DialogueTiming[];
  requiredProps: string[];
  constraints: string[];
}

export interface StoryContext {
  sceneObjective?: string;
  emotionalObjective?: string;
  entryState?: string;
  eventsCompleted: Array<{ text: string; source: FactSource }>;
  relationships: Array<{ text: string; characterIds: string[]; source: FactSource }>;
  knowledge: Record<string, Array<{ text: string; source: FactSource }>>;
  changes: Array<{ text: string; subject: PersistentChange['subject']; source: FactSource }>;
}

export interface AnchoringContext { chainLength: number; reanchor: boolean; after: number; why?: string; /** what decided it: the chain's length, or the measured identity of the take the tail comes from */ trigger?: 'CHAIN_LENGTH' | 'IDENTITY_DRIFT' }

export interface ProductionContext {
  version: typeof PRODUCTION_CONTEXT_VERSION;
  productionId: string;
  characters: CharacterContext[];
  location?: LocationContext;
  shot: ShotContext;
  story: StoryContext;
  anchoring: AnchoringContext;
  /** BLOCKING (src/domain/blocking.ts): the scene's 180° line, each person's carried side, facing and travel, and the
   *  staging this shot contradicts */
  blocking: BlockingState;
  /** the carried scene state the context was built on (src/domain/scene-state.ts) */
  sceneState: SceneState;
  /** facts the context lacks that the shot needs (read by the preflight; never invented) */
  gaps: string[];
  hash: string;
}

const clean = (s?: string) => (s ?? '').replace(/\s+/g, ' ').trim() || undefined;
const norm = (s?: string) => (clean(s) ?? '').toLowerCase();

/** Every story fact of the production that is in force at a shot, in story order: facts of earlier scenes, and facts
 *  of this scene placed at an earlier shot (`atShotId`). A fact without a shot takes effect at the END of its scene
 *  (what the scene changes is true after it) — so it is in force for later scenes only. */
export function storyFactsBefore<T extends StoryFact>(p: Production, sh: Shot, pick: (s: NonNullable<Production['scenes'][number]['story']>) => T[] | undefined): Array<{ fact: T; sceneId: string }> {
  const ordered = orderedShots(p);
  const at = ordered.findIndex((x) => x.id === sh.id);
  const myScene = p.scenes.find((sc) => sc.id === sh.sceneId);
  const out: Array<{ fact: T; sceneId: string }> = [];
  for (const sc of [...p.scenes].sort((a, b) => a.number - b.number)) {
    if (!sc.story || (myScene && sc.number > myScene.number)) continue;
    for (const fact of pick(sc.story) ?? []) {
      // a fact with no words is never carried (QA Q1: an empty row stored by the page reached every later prompt and
      // crashed it); a wordless `cleared` change still ends one by its key
      if (!fact || (!clean(fact.text) && !(fact as Partial<PersistentChange>).cleared)) continue;
      if (sc.id !== sh.sceneId) { out.push({ fact, sceneId: sc.id }); continue; }
      if (!fact.atShotId) continue;
      const i = ordered.findIndex((x) => x.id === fact.atShotId);
      if (i >= 0 && i < at) out.push({ fact, sceneId: sc.id });
    }
  }
  return out;
}

/** The persistent changes in force at a shot: later facts with the same key (or the same subject and text key)
 *  replace earlier ones; a `cleared` fact ends one. */
export function changesInForce(p: Production, sh: Shot): Array<{ change: PersistentChange; sceneId: string }> {
  const out = new Map<string, { change: PersistentChange; sceneId: string }>();
  for (const { fact, sceneId } of storyFactsBefore(p, sh, (s) => s.changes)) {
    const subj = fact.subject.kind === 'CHARACTER' ? `c:${fact.subject.characterId}` : fact.subject.kind === 'PROP' ? `p:${norm(fact.subject.name)}` : `l:${fact.subject.locationId}`;
    const key = `${subj}|${norm(fact.key) || norm(fact.text)}`;
    if (fact.cleared) out.delete(key); else out.set(key, { change: fact, sceneId });
  }
  return [...out.values()];
}

/** A persistent change to a person that changes their clothes: keyed so (wardrobe, outfit, costume, clothes, dress,
 *  uniform…), or, without a key, worded so ("changes into", "now wears", "puts on"). */
const WARDROBE_KEY = /\b(wardrobe|outfit|costume|clothes|clothing|dress|uniform|attire)\b/i;
const WARDROBE_TEXT = /\b(changes? into|changed into|now wears|is now wearing|puts? on (?:a|an|the|his|her|their)\b|dressed in)\b/i;
export const isWardrobeChange = (c: Pick<PersistentChange, 'key' | 'text' | 'subject'>): boolean => c.subject.kind === 'CHARACTER' && (c.key ? WARDROBE_KEY.test(c.key) : WARDROBE_TEXT.test(c.text ?? ''));

/** How many consecutive continuous shots end at this one (this one included; 0 when it is not continuous). */
export function continuousChainLength(p: Production, sh: Shot, relationOf: (s: Shot) => ShotRelation): number {
  const ordered = orderedShots(p);
  let i = ordered.findIndex((x) => x.id === sh.id);
  let n = 0;
  while (i > 0 && relationOf(ordered[i]) === 'CONTINUATION' && ordered[i - 1].sceneId === ordered[i].sceneId) { n++; i--; }
  return n;
}

const WORDS_PER_SECOND = 2.6;

export function productionContextFor(state: Pick<StudioState, 'characters' | 'locations' | 'assets' | 'settings'>, p: Production, sh: Shot, opts: { bible?: WorldBible } = {}): ProductionContext {
  const scene = p.scenes.find((sc) => sc.id === sh.sceneId);
  const sceneState = sceneStateFor(p, sh, { bible: opts.bible });
  const { relation, boundary } = sceneState;
  const ordered = orderedShots(p);
  const idx = ordered.findIndex((x) => x.id === sh.id);
  const prevShot = idx > 0 ? ordered[idx - 1] : undefined;
  const own: ContinuityState | undefined = sh.continuity;
  const prevOwn = prevShot?.continuity;
  const gaps: string[] = [];
  const changes = changesInForce(p, sh);
  // PLANNED vs ACTUAL END STATE (types.ts TakeEndState): what the previous shot's chosen take actually ended with, as
  // the producer approved it, is where a same-moment shot starts — the plan's end pose only when nobody approved one
  const chosenPrev = prevShot?.takes.find((t) => t.id === prevShot.selectedTakeId);
  const actualEnd = chosenPrev?.endState?.approved;
  const changeSource = (c: { change: PersistentChange; sceneId: string }): FactSource => ({ kind: 'STORY', sceneId: c.sceneId, factId: c.change.id });

  // ---- characters
  const speakers = new Set(sh.dialogue.map((d) => d.characterId));
  const characters: CharacterContext[] = sh.characterIds.map((characterId) => {
    const c: Character | undefined = state.characters.find((x) => x.id === characterId);
    const mine = own?.characters?.find((x) => x.characterId === characterId);
    const carried = sceneState.present.find((x) => x.characterId === characterId);
    const before = prevOwn?.characters?.find((x) => x.characterId === characterId);
    const image = c ? primaryImageOf(c) : undefined;
    const source = c ? primaryImageSourceOf(c) : null;
    const v = c?.voice.identity;
    const condition: CharacterContext['condition'] = [];
    const ended = relation !== 'STORY_TRANSITION' ? actualEnd?.characters.find((x) => x.characterId === characterId) : undefined;
    const endedSource: FactSource | undefined = ended && chosenPrev && prevShot ? { kind: 'PREVIOUS_TAKE', shotId: prevShot.id, takeId: chosenPrev.id } : undefined;
    if (clean(mine?.condition)) condition.push({ text: clean(mine!.condition)!, source: { kind: 'SHOT', shotId: sh.id } });
    else if (clean(ended?.condition)) condition.push({ text: clean(ended!.condition)!, source: endedSource! });
    else if (relation !== 'STORY_TRANSITION' && clean(before?.condition)) condition.push({ text: clean(before!.condition)!, source: { kind: 'PREVIOUS_SHOT', shotId: prevShot!.id } });
    let wardrobeChange: CharacterContext['wardrobeChange'];
    for (const ch of changes) {
      if (ch.change.subject.kind !== 'CHARACTER' || ch.change.subject.characterId !== characterId) continue;
      if (isWardrobeChange(ch.change)) { wardrobeChange = { text: clean(ch.change.text)!, source: changeSource(ch) }; continue; }
      if (!condition.some((x) => norm(x.text) === norm(ch.change.text))) condition.push({ text: clean(ch.change.text)!, source: changeSource(ch) });
    }
    // a continuous shot starts where the previous one ended — and so does a cut on the same moment (MATCH ON ACTION:
    // the new angle picks the action up where the old one left it; continuity gaps 2026-10-06 item 3)
    const sameMoment = relation === 'CONTINUATION' || (relation === 'CUT' && prevShot?.sceneId === sh.sceneId);
    let startPose: CharacterContext['startPose'];
    if (clean(mine?.startPose)) startPose = { text: clean(mine!.startPose)!, source: { kind: 'SHOT', shotId: sh.id } };
    else if (sameMoment && clean(ended?.pose)) startPose = { text: clean(ended!.pose)!, source: endedSource! };
    else if (sameMoment && clean(before?.endPose)) {
      startPose = { text: clean(before!.endPose)!, source: { kind: 'PREVIOUS_SHOT', shotId: prevShot!.id } };
      if (chosenPrev && c) gaps.push(`shot ${prevShot!.number}'s chosen take has no approved end state for ${c.name}: this shot starts from the PLANNED end pose, not what the take shows`);
    }
    else if (relation === 'CONTINUATION' && c && prevShot && sh.characterIds.length && prevShot.characterIds.includes(characterId)) gaps.push(`shot list: shot ${prevShot.number} gives no end pose for ${c.name}, so where this continuous shot starts is unknown`);
    const interactingWith = (mine?.interactingWith ?? []).filter((id) => id !== characterId && sh.characterIds.includes(id));
    if (!c) gaps.push(`character ${characterId} is not in the studio`);
    else if (!image) gaps.push(`${c.name} has no canonical image`);
    if (speakers.has(characterId) && (!v || v.status === 'STALE')) gaps.push(`${c?.name ?? characterId} speaks but has no ${v ? 'current' : ''} voice identity`.replace('no  voice', 'no voice'));
    return {
      characterId, name: c?.name ?? characterId,
      canonical: image ? { assetId: image, version: c?.canonicalImage?.version, status: source === 'PORTRAIT' ? 'PORTRAIT' : (c?.canonicalImage?.status ?? 'DRAFT') } : undefined,
      voice: v ? { revision: v.revision, model: v.model, status: v.status, language: v.language, dialect: v.dialect } : undefined,
      wardrobe: carried?.wardrobe ? { text: carried.wardrobe, source: sceneState.sources.wardrobe[characterId] ? { kind: 'SCENE', sceneId: sh.sceneId } : { kind: 'CHARACTER' } } : clean(c?.wardrobe) ? { text: clean(c!.wardrobe)!, source: { kind: 'CHARACTER' } } : undefined,
      ...(wardrobeChange ? { wardrobeChange } : {}),
      condition,
      emotion: clean(mine?.emotion) ?? (sameMoment ? clean(before?.emotion) : undefined),
      position: carried?.position, screenDirection: carried?.screenDirection, eyeline: clean(mine?.eyeline), holding: sameMoment && ended?.holding ? ended.holding : carried?.holding,
      startPose, endPose: clean(mine?.endPose), motion: mine?.motion ?? (relation === 'CONTINUATION' ? before?.motion : undefined),
      interactingWith, speaks: speakers.has(characterId),
    };
  });

  // ---- location
  const loc: Location | undefined = scene?.locationId ? state.locations.find((l) => l.id === scene.locationId) : undefined;
  let location: LocationContext | undefined;
  if (loc) {
    const id = locationIdentity(loc);
    const plate = Boolean(loc.masterAssetId || loc.refs.length);
    location = {
      locationId: loc.id, name: loc.name, kind: loc.kind, identity: { version: id.version, hash: id.hash, line: id.line },
      architecture: clean(loc.layout?.architecture), layout: clean(loc.layout?.spatial ?? loc.layout?.geography),
      permanent: [...loc.landmarks, ...loc.props].map((x) => clean(x)!).filter(Boolean),
      objects: sceneState.props.map((x) => ({ name: x.name, state: x.state, position: x.position, ownerCharacterId: x.ownerCharacterId })),
      timeOfDay: sceneState.timeOfDay, weather: sceneState.weather,
      // THE PLACE'S LIGHTING RULE (types.ts LocationLight): the scene's stated or carried light wins; the rule fills in
      ...(sceneState.lighting ? { lighting: sceneState.lighting, lightingFrom: 'SCENE' as const } : lightRuleAt(loc, sceneState.timeOfDay) ? { lighting: lightRuleAt(loc, sceneState.timeOfDay), lightingFrom: 'LOCATION_RULE' as const } : {}),
      placeState: sceneState.placeState,
      changes: changes.filter((c) => (c.change.subject.kind === 'LOCATION' && c.change.subject.locationId === loc.id) || (c.change.subject.kind === 'PROP' && sceneState.props.some((x) => norm(x.name) === norm((c.change.subject as { name: string }).name)))).map((c) => ({ text: clean(c.change.text)!, source: changeSource(c) })),
      hasPlate: plate,
    };
    if (!plate && !scene?.establishLocation) gaps.push(`${loc.name} has no plate and the scene does not establish it`);
  } else if (scene?.locationId) gaps.push(`the scene's location ${scene.locationId} is not in the studio`);
  else gaps.push('the scene has no location');

  // ---- shot
  const prevTake = prevShot?.takes.find((t) => t.id === prevShot.selectedTakeId);
  const lines = sh.dialogue.map<DialogueTiming>((d) => {
    const placed = sh.takes.find((t) => t.id === sh.selectedTakeId)?.soundtrack?.lines.find((l) => l.lineId === d.id);
    const text = clean(p.language === 'AR' ? d.textAr || d.text : d.text) ?? '';
    return d.durationSeconds ? { lineId: d.id, characterId: d.characterId, text, durationSeconds: d.durationSeconds, source: 'RECORDED', from: placed?.from, to: placed?.to } : { lineId: d.id, characterId: d.characterId, text, durationSeconds: Number((Math.max(1, text.split(/\s+/).filter(Boolean).length) / WORDS_PER_SECOND).toFixed(2)), source: 'ESTIMATE' };
  });
  const required = new Set<string>();
  for (const x of own?.props ?? []) if (clean(x.name)) required.add(clean(x.name)!);
  for (const x of characters) for (const h of x.holding ?? []) required.add(h);
  const constraints = [...(own?.constraints ?? []).map((x) => clean(x)!).filter(Boolean)];
  for (const x of characters) {
    if (x.startPose?.source.kind === 'PREVIOUS_SHOT' || x.startPose?.source.kind === 'PREVIOUS_TAKE') constraints.push(`${x.name} starts as the previous shot ended: ${x.startPose.text}`);
    if (relation !== 'STORY_TRANSITION' && x.motion?.direction && x.motion.direction !== 'STILL') constraints.push(`${x.name} keeps moving ${x.motion.direction.toLowerCase().replace(/_/g, ' ')}`);
  }
  const shot: ShotContext = {
    shotId: sh.id, sceneId: sh.sceneId, number: sh.number, boundary, relation,
    previous: prevShot ? { shotId: prevShot.id, takeId: prevTake?.id, assetId: prevTake?.assetId, approved: Boolean(prevTake && prevTake.status === 'READY' && prevTake.rating !== 'REJECTED'), rating: prevTake?.rating, sameScene: prevShot.sceneId === sh.sceneId } : undefined,
    action: clean(sh.action) ?? '',
    camera: { framing: sh.framing, move: sh.cameraMove, lens: clean(own?.camera?.lensIntent), angle: clean(own?.camera?.angle) },
    durationSeconds: sh.durationSeconds,
    dialogue: lines, requiredProps: [...required], constraints,
  };
  if (relation === 'CONTINUATION' && !prevTake) gaps.push(`the shot continues shot ${prevShot?.number ?? '?'}, which has no chosen take`);
  // (QA m3) recorded lines longer than the PLANNED shot are not a gap: sound comes first and the take is made as long
  // as its words need (take.ts); only words that no clip can hold are a problem — the preflight's `dialogue-fits-clip`

  // ---- story
  const knowledge: StoryContext['knowledge'] = {};
  for (const { fact, sceneId } of storyFactsBefore<KnowledgeFact>(p, sh, (s) => s.knowledge)) if (sh.characterIds.includes(fact.characterId)) (knowledge[fact.characterId] ??= []).push({ text: clean(fact.text)!, source: { kind: 'STORY', sceneId, factId: fact.id } });
  const events: StoryContext['eventsCompleted'] = [];
  if (opts.bible) {
    const mine = opts.bible.timeline.filter((e) => e.productionId === p.id);
    const myOrder = mine.length ? Math.min(...mine.map((e) => e.order)) : Number.POSITIVE_INFINITY;
    for (const e of opts.bible.timeline) if (e.productionId !== p.id && e.order < myOrder && clean(e.text)) events.push({ text: clean(e.text)!, source: { kind: 'WORLD', productionId: e.productionId, sceneId: e.sceneId } });
  }
  for (const sc of [...p.scenes].sort((a, b) => a.number - b.number)) if (scene && sc.number < scene.number && clean(sc.exitState)) events.push({ text: clean(sc.exitState)!, source: { kind: 'SCENE', sceneId: sc.id } });
  for (const { fact, sceneId } of storyFactsBefore<StoryFact>(p, sh, (s) => s.events)) events.push({ text: clean(fact.text)!, source: { kind: 'STORY', sceneId, factId: fact.id } });
  const relationships: StoryContext['relationships'] = [];
  for (const r of opts.bible?.relationships ?? []) if (clean(r.text)) relationships.push({ text: clean(r.text)!, characterIds: r.characterIds, source: { kind: 'WORLD' } });
  for (const { fact, sceneId } of storyFactsBefore<RelationshipFact>(p, sh, (s) => s.relationships)) relationships.push({ text: clean(fact.text)!, characterIds: fact.characterIds, source: { kind: 'STORY', sceneId, factId: fact.id } });
  const story: StoryContext = {
    sceneObjective: clean(scene?.purpose), emotionalObjective: clean(scene?.emotionalObjective), entryState: clean(scene?.entryState),
    eventsCompleted: events, relationships: relationships.filter((r) => !r.characterIds.length || r.characterIds.some((id) => sh.characterIds.includes(id))), knowledge,
    changes: changes.map((c) => ({ text: clean(c.change.text)!, subject: c.change.subject, source: changeSource(c) })),
  };

  // ---- anchoring: by chain length, or at once when the take the tail comes from measured identity drift
  const after = Math.max(1, Math.round(state.settings?.generation?.continuation?.reanchorAfter ?? REANCHOR.after));
  const chainLength = continuousChainLength(p, sh, (s) => relationOf(p, s).relation);
  const byLength = relation === 'CONTINUATION' && chainLength > after;
  const drift = relation === 'CONTINUATION' ? identityDrift(p, sh, chainLength) : [];
  const reanchor = byLength || drift.length > 0;
  const nameOf = (id: string) => characters.find((x) => x.characterId === id)?.name ?? id;
  const anchoring: AnchoringContext = {
    chainLength, after, reanchor,
    trigger: byLength ? 'CHAIN_LENGTH' : drift.length ? 'IDENTITY_DRIFT' : undefined,
    why: byLength ? `the ${chainLength}th continuous shot in a row (re-anchor after ${after}): the shortest guide carries the motion and the canonical references the look`
      : drift.length ? `identity drift in the tail (${drift.map((d) => `${nameOf(d.characterId)}: ${d.detail}`).join('; ')}): the shortest guide carries the motion and the canonical references the look` : undefined,
  };

  // ---- blocking: the scene's 180° line, carried sides, facing and travel
  const blocking = blockingFor(p, sh);

  const body = { version: PRODUCTION_CONTEXT_VERSION, productionId: p.id, characters, location, shot, story, anchoring, blocking, gaps };
  return { ...body, sceneState, hash: hashString(canonical(body)).slice(0, 16) } as ProductionContext;
}

/** What the take records of its context: the hash and the facts that decided the request, compactly (the full
 *  context is recomputed from the records; this copy is the history). */
export function contextRecord(c: ProductionContext): Record<string, unknown> {
  return {
    version: c.version, hash: c.hash, boundary: c.shot.boundary, relation: c.shot.relation,
    previous: c.shot.previous ? { shotId: c.shot.previous.shotId, takeId: c.shot.previous.takeId, approved: c.shot.previous.approved } : undefined,
    characters: c.characters.map((x) => ({ characterId: x.characterId, canonical: x.canonical ? { assetId: x.canonical.assetId, version: x.canonical.version, status: x.canonical.status } : undefined, voiceRevision: x.voice?.revision, condition: x.condition.map((k) => k.text), wardrobeChange: x.wardrobeChange?.text, emotion: x.emotion, startPose: x.startPose?.text, endPose: x.endPose, motion: x.motion, interactingWith: x.interactingWith.length ? x.interactingWith : undefined })),
    location: c.location ? { locationId: c.location.locationId, identityVersion: c.location.identity.version, identityHash: c.location.identity.hash, timeOfDay: c.location.timeOfDay, changes: c.location.changes.map((k) => k.text) } : undefined,
    dialogue: c.shot.dialogue.map((d) => ({ lineId: d.lineId, durationSeconds: d.durationSeconds, source: d.source })),
    constraints: c.shot.constraints, changes: c.story.changes.map((k) => k.text), anchoring: c.anchoring, blocking: blockingRecord(c.blocking), gaps: c.gaps,
  };
}

/** A pose without speech for a person who has no line in the shot (pure, tested): the planner carries the end of the
 *  previous shot into the start pose ("standing upright, cloth in hand, speaking"), and a silent take was told both
 *  that and "nobody speaks in this shot" (2026-10-08, "The Last Crossing" 2.4). */
export function poseWithoutSpeech(text: string, speaks: boolean): string {
  if (speaks) return text;
  return text.split(/,\s*/).filter((part) => !/\b(speak\w*|talk\w*|say(s|ing)?|mid-sentence|mouth(s)? open(ed)? to speak|whisper\w*|shout\w*|calling out)\b/i.test(part)).join(', ').trim();
}

/** The context as prompt sentences about the people and the place, with people named by `who` (a bound subject or
 *  a description — never a name). Only what the shot's own continuity sentence does not already say: the persistent
 *  condition, emotion, interaction, start → end pose, motion, the place's persistent changes, the constraints. */
export interface ContextLineOptions {
  /** the take starts from a drawn opening frame (or a tail): it shows where everyone stands and how — the start pose
   *  and the blocking are left to it */
  fromFrame?: boolean;
  /** an INSERT shows hands and an object: only the people's condition is said; their feelings, moves, poses, company
   *  and the room's state would describe a wider shot ("The Relief" 1.6, 2026-10-08: the start pose, the blocking —
   *  "left, facing right", the lens "center room", the stair door "right edge" — and a constraint naming the woman
   *  who hands over the thermos made H3 cut from the insert to a wide of the room, twice, with and without pictures) */
  insert?: boolean;
  /** the name forms of the production's people who are NOT in this shot: a constraint naming one of them is about
   *  another shot (the dependency contract, src/domain/shot-dependencies.ts) and is never written into this one */
  absentNames?: string[];
}

export function contextLines(c: ProductionContext, who: (characterId: string) => string | undefined, opts: ContextLineOptions = {}): string {
  const out: string[] = [];
  for (const x of c.characters) {
    const w = who(x.characterId);
    if (!w) continue;
    // a context built from older records may still hold a wordless fact: it is skipped, never written (QA Q1)
    const condition = x.condition.filter((k) => typeof k.text === 'string' && k.text.trim());
    const bits = [
      condition.length && `is ${condition.map((k) => k.text.replace(/\.$/, '')).join(' and ')}`,
      !opts.insert && x.wardrobeChange?.text && `has changed clothes since the reference: ${x.wardrobeChange.text.replace(/\.$/, '')}`,
      !opts.insert && x.emotion && `feels ${x.emotion.replace(/\.$/, '')}`,
      !opts.insert && x.interactingWith.length && `is with ${x.interactingWith.map((id) => who(id) ?? 'the other person').join(' and ')}`,
      !opts.insert && !opts.fromFrame && x.startPose && poseWithoutSpeech(x.startPose.text.replace(/\.$/, ''), x.speaks) && `starts ${poseWithoutSpeech(x.startPose.text.replace(/\.$/, ''), x.speaks)}`,
      !opts.insert && x.endPose && poseWithoutSpeech(x.endPose.replace(/\.$/, ''), x.speaks) && `ends ${poseWithoutSpeech(x.endPose.replace(/\.$/, ''), x.speaks)}`,
      !opts.insert && x.motion?.direction && x.motion.direction !== 'STILL' && `moves ${x.motion.direction.toLowerCase().replace(/_/g, ' ')}${x.motion.path ? ` (${x.motion.path.replace(/\.$/, '')})` : ''}`,
    ].filter(Boolean);
    if (bits.length) out.push(`${w} ${bits.join(', ')}.`);
  }
  const staging = c.blocking && !opts.fromFrame && !opts.insert ? blockingLine(c.blocking, who, { relation: c.shot.relation }) : '';
  if (staging) out.push(staging);
  // the place's own light for the time of day, when the scene states none (the scene state line says a stated one)
  if (c.location?.lightingFrom === 'LOCATION_RULE' && c.location.lighting) out.push(`Light, as this place always has it${c.location.timeOfDay ? ` at ${c.location.timeOfDay.toLowerCase().replace(/_/g, ' ')}` : ''}: ${c.location.lighting.replace(/\.$/, '')}.`);
  const placeChanges = opts.insert ? [] : (c.location?.changes ?? []).filter((k) => typeof k.text === 'string' && k.text.trim());
  if (placeChanges.length) out.push(`The place as the story left it: ${placeChanges.map((k) => k.text.replace(/\.$/, '')).join('; ')}.`);
  const names = (opts.absentNames ?? []).filter((n) => n.trim().length > 1).map((n) => new RegExp(`(^|[^\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}])`, 'iu'));
  const own = c.shot.constraints.filter((k) => !c.characters.some((x) => k.startsWith(x.name)) && !names.some((re) => re.test(k)));
  if (own.length) out.push(`Must hold: ${own.map((k) => k.replace(/\.$/, '')).join('; ')}.`);
  return out.join(' ');
}
