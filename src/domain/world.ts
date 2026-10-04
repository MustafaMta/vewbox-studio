import type { Asset, Character, Location, Production, Scene, Shot, StudioState, Take, WorldAudioPolicy, WorldBible, WorldChange, WorldCharacter, WorldEvent, WorldLocation, WorldPlate, WorldProp, WorldRead, WorldRelationship, WorldRule, WorldSceneState, WorldScope, WorldSong, WorldWardrobe } from './types';
import type { Framing, TimeOfDay } from './vocabulary';
import { canonical, hashString } from './hash';
import { usableImage } from './identity';
import { locationIdentity } from './location';

/** THE WORLD BIBLE, PURE (docs/research/MINIMAX-CONTINUITY.md §4; directive Part 7). Everything here is state in,
 *  value out, so the worker, the tests and any page compute the same thing:
 *  - `deriveWorld` builds the bible of a scope (a show, or one production) from the studio records, on top of the
 *    previous revision: what only the bible knows (ESTABLISHED frames, the lock of a place used in an approved cut,
 *    the producer's own rules and events, the audio policy) is carried forward, never re-derived away;
 *  - `diffWorld` says what changed between two revisions, `repinSafety` whether a production may follow the change
 *    without a new story approval (nothing it already filmed changes underneath it);
 *  - `choosePlate` picks a shot's location reference — an established frame of the place before a drawn plate, a
 *    returning location is never redrawn from a similar description;
 *  - `overlayWorld` lays the pinned revision over the studio state for one shot, so the shot pack (which reads the
 *    studio state) conditions the take on the pinned plate and the pinned canonical images, and says what it read;
 *  - `worldForPlanner` is the text the shot planner gets; `establishCandidates` picks the frames an approved cut
 *    establishes. */

export const DEFAULT_AUDIO_POLICY: WorldAudioPolicy = { dialogue: 'AUTO', songBed: 'INSTRUMENTAL_WHEN_AVAILABLE' };

/** A show's episodes share the show's world; a short, a music video or a standalone episode has its own. */
export function worldScopeOf(p: Pick<Production, 'id' | 'showId'>): WorldScope {
  return p.showId ? { kind: 'SHOW', showId: p.showId } : { kind: 'PRODUCTION', productionId: p.id };
}
export const scopeKey = (s: WorldScope): string => (s.kind === 'SHOW' ? `show:${s.showId}` : `production:${s.productionId}`);

const uniq = <T>(xs: T[]) => Array.from(new Set(xs));
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const short = (s: string) => hashString(norm(s)).slice(0, 10);

/** The productions a scope covers, in story order (seasons by number, episodes by number). */
export function productionsInScope(state: Pick<StudioState, 'productions' | 'seasons'>, scope: WorldScope): Production[] {
  if (scope.kind === 'PRODUCTION') return state.productions.filter((p) => p.id === scope.productionId);
  const seasons = state.seasons.filter((s) => s.showId === scope.showId).sort((a, b) => a.number - b.number).map((s) => s.id);
  const si = (p: Production) => { const i = seasons.indexOf(p.seasonId ?? ''); return i < 0 ? 1e6 : i; };
  return state.productions.filter((p) => p.showId === scope.showId).sort((a, b) => si(a) - si(b) || (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0) || a.createdAt.localeCompare(b.createdAt));
}

const scenesInOrder = (p: Production): Scene[] => [...p.scenes].sort((a, b) => a.number - b.number);
const shotsOfScene = (p: Production, sceneId: string): Shot[] => p.shots.filter((s) => s.sceneId === sceneId).sort((a, b) => a.number - b.number);

function wardrobeOf(prev: WorldWardrobe[], c: Character, prods: Production[]): WorldWardrobe[] {
  const out: WorldWardrobe[] = [];
  const add = (w: WorldWardrobe) => { if (!out.some((x) => x.id === w.id)) out.push(w); };
  if (c.wardrobe?.trim()) add({ id: 'default', label: 'Default', description: c.wardrobe.trim() });
  for (const w of prev) add(w);
  for (const p of prods) for (const sc of scenesInOrder(p)) for (const sh of shotsOfScene(p, sc.id)) {
    const worn = sh.continuity?.characters.find((x) => x.characterId === c.id)?.wardrobe?.trim();
    if (!worn || norm(worn) === norm(c.wardrobe ?? '')) continue;
    add({ id: `w-${short(worn)}`, label: worn.length > 48 ? `${worn.slice(0, 47)}…` : worn, description: worn, firstSeen: { productionId: p.id, sceneId: sc.id } });
  }
  return out;
}

function characterOf(c: Character, prev: WorldCharacter | undefined, prods: Production[]): WorldCharacter {
  const img = c.canonicalImage;
  const v = c.voice.identity;
  const wardrobe = wardrobeOf(prev?.wardrobe ?? [], c, prods);
  return {
    characterId: c.id, name: c.name,
    canonical: img ? { assetId: img.assetId, version: img.version, status: img.status } : undefined,
    voice: v ? { revision: v.revision, provider: v.provider, model: v.model, status: v.status, language: v.language, dialect: v.dialect } : undefined,
    identityLine: img?.identityLine ?? c.canon?.identityLine,
    wardrobe, defaultWardrobeId: wardrobe.some((w) => w.id === 'default') ? 'default' : undefined,
  };
}

function locationOf(l: StudioState['locations'][number], prev: WorldLocation | undefined, now: string): WorldLocation {
  const drawn: Array<Omit<WorldPlate, 'addedAt'>> = [];
  if (l.masterAssetId && !l.refs.some((r) => r.assetId === l.masterAssetId)) drawn.push({ assetId: l.masterAssetId, role: 'MASTER', label: 'Master plate', source: { kind: 'DRAWN' } });
  for (const r of l.refs) drawn.push({ assetId: r.assetId, role: r.role, label: r.label, timeOfDay: r.timeOfDay, source: { kind: 'DRAWN', refId: r.id } });
  const locked = Boolean(prev?.locked) || Boolean(prev?.plates.some((p) => p.role === 'ESTABLISHED'));
  // a locked place keeps every plate it had (a redraw adds, never replaces); an unlocked one follows its drawn plates;
  // an established frame is never dropped
  const plates: WorldPlate[] = (prev?.plates ?? []).filter((p) => locked || p.role === 'ESTABLISHED');
  for (const d of drawn) if (!plates.some((p) => p.assetId === d.assetId)) plates.push({ ...d, addedAt: prev?.plates.find((p) => p.assetId === d.assetId)?.addedAt ?? now });
  const lay = l.layout ?? {};
  const identity = locationIdentity(l);
  return {
    locationId: l.id, name: l.name, kind: l.kind,
    identity: { version: identity.version, hash: identity.hash, line: identity.line },
    canon: { description: l.description, architecture: lay.architecture, materials: lay.materials ?? [], fixedFeatures: l.landmarks, geography: lay.geography, spatial: lay.spatial, entrances: lay.entrances ?? [], zones: lay.cameraZones ?? [] },
    lighting: l.lighting, plates, ambience: prev?.ambience, locked,
  };
}

function propsOf(prev: WorldProp[], locations: StudioState['locations'], prods: Production[]): WorldProp[] {
  const out = new Map<string, WorldProp>(prev.map((p) => [p.id, { ...p }]));
  for (const l of locations) for (const name of l.props) { const id = `prop-${short(`${l.id}:${name}`)}`; if (!out.has(id)) out.set(id, { id, name, fixedAtLocationId: l.id }); }
  // props the shots carry or move: keyed by name; the last shot that mentions one (story order) is where it was last seen
  for (const p of prods) for (const sc of scenesInOrder(p)) for (const sh of shotsOfScene(p, sc.id)) for (const pr of sh.continuity?.props ?? []) {
    if (!pr.name?.trim()) continue;
    const fixed = [...out.values()].find((x) => x.fixedAtLocationId === sc.locationId && norm(x.name) === norm(pr.name));
    const id = fixed?.id ?? `prop-${short(pr.name)}`;
    const was = out.get(id);
    out.set(id, { ...(was ?? { id, name: pr.name.trim() }), ownerCharacterId: pr.ownerCharacterId ?? was?.ownerCharacterId, last: { state: pr.state, position: pr.position, productionId: p.id, sceneId: sc.id, shotId: sh.id } });
  }
  return [...out.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function statesOf(prev: WorldSceneState[], prods: Production[]): WorldSceneState[] {
  const out = new Map(prev.map((s) => [s.id, s]));
  prods.forEach((p, pi) => {
    for (const sc of scenesInOrder(p)) {
      const last = shotsOfScene(p, sc.id).filter((s) => s.continuity).at(-1);
      if (!last && !sc.exitState) continue;
      const c = last?.continuity;
      out.set(`state-${sc.id}`, {
        id: `state-${sc.id}`, productionId: p.id, sceneId: sc.id, order: pi * 1000 + sc.number, locationId: sc.locationId,
        environment: { timeOfDay: c?.environment.timeOfDay ?? sc.timeOfDay, weather: c?.environment.weather, lighting: c?.environment.lighting, state: c?.environment.state },
        characters: (c?.characters ?? []).map((x) => ({ characterId: x.characterId, wardrobe: x.wardrobe, position: x.position, holding: x.holding })),
        props: (c?.props ?? []).map((x) => ({ name: x.name, state: x.state, position: x.position, ownerCharacterId: x.ownerCharacterId })),
        exitState: sc.exitState,
      });
    }
  });
  return [...out.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

function timelineOf(prev: WorldEvent[], state: Pick<StudioState, 'seasons' | 'locations'>, showTimeline: string[], prods: Production[]): WorldEvent[] {
  const events: WorldEvent[] = [];
  prods.forEach((p, pi) => {
    for (const sc of scenesInOrder(p)) {
      const where = state.locations.find((l) => l.id === sc.locationId)?.name;
      const what = sc.exitState || sc.purpose || sc.title;
      events.push({ id: `ev-${sc.id}`, order: pi * 1000 + sc.number, productionId: p.id, sceneId: sc.id, locationId: sc.locationId, timeOfDay: sc.timeOfDay, text: `${p.title} — scene ${sc.number} “${sc.title}”${where ? ` at ${where}` : ''} (${sc.timeOfDay.toLowerCase().replace('_', ' ')}): ${what}`, source: 'SCENE' });
    }
  });
  // the show bible's entries ("S1E2: …") sit after their episode's scenes; untagged ones at the end
  showTimeline.forEach((t, i) => {
    const m = /^S(\d+)E(\d+)\s*:/i.exec(t.trim());
    const pi = m ? prods.findIndex((p) => p.episodeNumber === Number(m[2]) && state.seasons.find((s) => s.id === p.seasonId)?.number === Number(m[1])) : -1;
    events.push({ id: `ev-${short(t)}`, order: pi >= 0 ? pi * 1000 + 999 : 1e6 + i, text: t, source: 'SHOW_BIBLE' });
  });
  for (const e of prev) if (e.source === 'PRODUCER' && !events.some((x) => x.id === e.id)) events.push(e);
  const seen = new Set<string>();
  return events.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true))).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** The bible of a scope from the studio records, on top of the previous revision (see the module note). */
export function deriveWorld(state: StudioState, scope: WorldScope, previous: WorldBible | undefined, now: string): WorldBible {
  const show = scope.kind === 'SHOW' ? state.shows.find((s) => s.id === scope.showId) : undefined;
  const prods = productionsInScope(state, scope);
  const single = scope.kind === 'PRODUCTION' ? prods[0] : undefined;
  const castIds = uniq([...(show?.castIds ?? []), ...prods.flatMap((p) => p.castIds), ...prods.flatMap((p) => p.scenes.flatMap((sc) => sc.characterIds))]);
  const locIds = uniq([...(show?.locationIds ?? []), ...prods.flatMap((p) => p.locationIds), ...prods.flatMap((p) => p.scenes.map((sc) => sc.locationId).filter((x): x is string => Boolean(x)))]);
  const cast = castIds.map((id) => state.characters.find((c) => c.id === id)).filter((c): c is Character => Boolean(c));
  const places = locIds.map((id) => state.locations.find((l) => l.id === id)).filter((l): l is StudioState['locations'][number] => Boolean(l));
  const style = show?.style ?? single?.style;
  const language = show?.language ?? single?.language;
  const dialect = show?.dialect ?? single?.dialect;
  const rules: WorldRule[] = [
    ...(show?.bible?.worldRules ?? []).filter((t) => t.trim()).map((t): WorldRule => ({ id: `rule-${short(t)}`, text: t.trim(), scope: 'WORLD', source: 'SHOW_BIBLE' })),
    ...(style ? [{ id: 'rule-style', text: `Production direction: ${style.toLowerCase()}; every picture in it, plates and frames included.`, scope: 'VISUAL' as const, source: 'STYLE' as const }] : []),
    ...(language ? [{ id: 'rule-language', text: `Dialogue in ${language === 'AR' ? `Arabic${dialect ? ` (${dialect.toLowerCase().replace(/_/g, ' ')})` : ''}` : 'English'}.`, scope: 'LANGUAGE' as const, source: 'STYLE' as const }] : []),
    ...(previous?.rules.filter((r) => r.source === 'PRODUCER') ?? []),
  ];
  const named = (text: string) => cast.filter((c) => text.toLowerCase().includes(c.name.toLowerCase()) || (c.nameAr ? text.includes(c.nameAr) : false)).map((c) => c.id);
  const relationships: WorldRelationship[] = [
    ...(show?.bible?.relationships ?? []).filter((t) => t.trim()).map((t): WorldRelationship => ({ id: `rel-${short(t)}`, text: t.trim(), characterIds: named(t), source: 'SHOW_BIBLE' })),
    ...(previous?.relationships.filter((r) => r.source === 'PRODUCER') ?? []),
  ];
  const songs: WorldSong[] = prods.filter((p) => p.song).map((p) => ({ productionId: p.id, songId: p.song!.id, title: p.song!.title, assetId: p.song!.assetId, stems: p.song!.stems }));
  return {
    scope,
    title: show?.title ?? single?.title ?? '',
    rules, styleNotes: show?.bible?.styleNotes,
    characters: cast.map((c) => characterOf(c, previous?.characters.find((x) => x.characterId === c.id), prods)),
    relationships,
    locations: places.map((l) => locationOf(l, previous?.locations.find((x) => x.locationId === l.id), now)),
    props: propsOf(previous?.props ?? [], places, prods),
    timeline: timelineOf(previous?.timeline ?? [], state, show?.bible?.timeline ?? [], prods),
    states: statesOf(previous?.states ?? [], prods),
    songs,
    openStorylines: show?.bible?.unresolved ?? [],
    audio: previous?.audio ?? DEFAULT_AUDIO_POLICY,
  };
}

/** The content hash of a bible: two derivations with nothing new hash the same, so no empty revision is written. */
export const hashWorld = (b: WorldBible): string => hashString(canonical(b));

// -------------------------------------------------------------------------------------------------------- diff

function diffList<T>(path: string, a: T[], b: T[], key: (x: T) => string, label: (x: T) => string): WorldChange[] {
  const out: WorldChange[] = [];
  const am = new Map(a.map((x) => [key(x), x])); const bm = new Map(b.map((x) => [key(x), x]));
  for (const [k, x] of bm) { const was = am.get(k); if (!was) out.push({ op: 'ADD', path: `${path}/${k}`, detail: label(x) }); else if (canonical(was) !== canonical(x)) out.push({ op: 'UPDATE', path: `${path}/${k}`, detail: label(x) }); }
  for (const [k, x] of am) if (!bm.has(k)) out.push({ op: 'REMOVE', path: `${path}/${k}`, detail: label(x) });
  return out;
}

/** What changed from `a` to `b`, entity by entity (`a` undefined: everything is new). */
export function diffWorld(a: WorldBible | undefined, b: WorldBible): WorldChange[] {
  if (!a) return [{ op: 'ADD', path: 'bible', detail: `${b.characters.length} character(s), ${b.locations.length} location(s), ${b.rules.length} rule(s), ${b.timeline.length} event(s)` }];
  const out: WorldChange[] = [];
  const ac = new Map(a.characters.map((c) => [c.characterId, c]));
  for (const c of b.characters) {
    const was = ac.get(c.characterId);
    if (!was) { out.push({ op: 'ADD', path: `characters/${c.characterId}`, detail: c.name }); continue; }
    if (canonical(was.canonical) !== canonical(c.canonical)) out.push({ op: was.canonical ? (c.canonical ? 'UPDATE' : 'REMOVE') : 'ADD', path: `characters/${c.characterId}/canonical`, detail: `${c.name}: ${was.canonical ? `v${was.canonical.version} ${was.canonical.status}` : 'none'} → ${c.canonical ? `v${c.canonical.version} ${c.canonical.status}` : 'none'}` });
    if (canonical(was.voice) !== canonical(c.voice)) out.push({ op: was.voice ? (c.voice ? 'UPDATE' : 'REMOVE') : 'ADD', path: `characters/${c.characterId}/voice`, detail: `${c.name}: ${was.voice ? `revision ${was.voice.revision} ${was.voice.status}` : 'none'} → ${c.voice ? `revision ${c.voice.revision} ${c.voice.status}` : 'none'}` });
    out.push(...diffList(`characters/${c.characterId}/wardrobe`, was.wardrobe, c.wardrobe, (w) => w.id, (w) => `${c.name}: ${w.label}`));
  }
  for (const c of a.characters) if (!b.characters.some((x) => x.characterId === c.characterId)) out.push({ op: 'REMOVE', path: `characters/${c.characterId}`, detail: c.name });
  const al = new Map(a.locations.map((l) => [l.locationId, l]));
  for (const l of b.locations) {
    const was = al.get(l.locationId);
    if (!was) { out.push({ op: 'ADD', path: `locations/${l.locationId}`, detail: l.name }); continue; }
    if (canonical(was.canon) !== canonical(l.canon) || was.kind !== l.kind) out.push({ op: 'UPDATE', path: `locations/${l.locationId}/canon`, detail: `${l.name}: architecture, layout or fixed features changed` });
    if (was.identity.hash !== l.identity.hash) out.push({ op: 'UPDATE', path: `locations/${l.locationId}/identity`, detail: `${l.name}: identity v${was.identity.version} → v${l.identity.version}` });
    if (was.locked !== l.locked) out.push({ op: 'UPDATE', path: `locations/${l.locationId}/locked`, detail: `${l.name}: ${l.locked ? 'locked (used in an approved cut)' : 'unlocked'}` });
    if (canonical(was.ambience) !== canonical(l.ambience)) out.push({ op: 'UPDATE', path: `locations/${l.locationId}/ambience`, detail: l.name });
    if (canonical(was.lighting) !== canonical(l.lighting)) out.push({ op: 'UPDATE', path: `locations/${l.locationId}/lighting`, detail: `${l.name}: ${l.lighting.join(', ')}` });
    out.push(...diffList(`locations/${l.locationId}/plates`, was.plates, l.plates, (p) => p.assetId, (p) => `${l.name}: ${p.role.toLowerCase()} ${p.label}${p.timeOfDay ? ` (${p.timeOfDay.toLowerCase()})` : ''}`));
  }
  for (const l of a.locations) if (!b.locations.some((x) => x.locationId === l.locationId)) out.push({ op: 'REMOVE', path: `locations/${l.locationId}`, detail: l.name });
  out.push(...diffList('rules', a.rules, b.rules, (r) => r.id, (r) => r.text.slice(0, 80)));
  out.push(...diffList('relationships', a.relationships, b.relationships, (r) => r.id, (r) => r.text.slice(0, 80)));
  out.push(...diffList('props', a.props, b.props, (p) => p.id, (p) => p.name));
  out.push(...diffList('timeline', a.timeline, b.timeline, (e) => e.id, (e) => e.text.slice(0, 80)));
  out.push(...diffList('states', a.states, b.states, (s) => s.id, (s) => `scene ${s.sceneId}`));
  out.push(...diffList('songs', a.songs, b.songs, (s) => `${s.productionId}:${s.songId}`, (s) => s.title));
  if (canonical(a.audio) !== canonical(b.audio)) out.push({ op: 'UPDATE', path: 'audio', detail: `dialogue ${b.audio.dialogue}, song bed ${b.audio.songBed}` });
  if (canonical(a.openStorylines) !== canonical(b.openStorylines)) out.push({ op: 'UPDATE', path: 'openStorylines', detail: `${b.openStorylines.length} open` });
  if ((a.styleNotes ?? '') !== (b.styleNotes ?? '')) out.push({ op: 'UPDATE', path: 'styleNotes' });
  if (a.title !== b.title) out.push({ op: 'UPDATE', path: 'title', detail: b.title });
  return out;
}

// ------------------------------------------------------------------------------------------------------ re-pin

/** What a production has already filmed: the characters and places of its shots that have a real take. */
export function usageOf(p: Production): { characterIds: Set<string>; locationIds: Set<string> } {
  const characterIds = new Set<string>(); const locationIds = new Set<string>();
  for (const sh of p.shots) {
    if (!sh.takes.some((t) => t.provider !== 'SAMPLE')) continue;
    for (const id of sh.characterIds) characterIds.add(id);
    const loc = p.scenes.find((sc) => sc.id === sh.sceneId)?.locationId;
    if (loc) locationIds.add(loc);
  }
  return { characterIds, locationIds };
}

/** Whether a production pinned to an older revision may follow `diff` without a new story approval: additions
 *  (a new plate, an established frame, a new character or place, timeline facts) and changes to what it has not
 *  filmed yet are safe; a changed canonical image or voice of a character it already filmed, or a changed or removed
 *  plate or canon of a place it already filmed, is not — those would change its world underneath shots already made. */
export function repinSafety(diff: WorldChange[], usage: { characterIds: Set<string>; locationIds: Set<string> }): { safe: boolean; blocking: WorldChange[] } {
  const blocking = diff.filter((c) => {
    const m = /^(characters|locations)\/([^/]+)(?:\/([^/]+))?/.exec(c.path);
    if (!m) return false;
    const [, kind, id, part] = m;
    if (kind === 'characters') return usage.characterIds.has(id) && ((part === 'canonical' || part === 'voice') ? c.op !== 'ADD' : !part && c.op === 'REMOVE');
    return usage.locationIds.has(id) && ((part === 'plates' && c.op === 'REMOVE') || part === 'canon' || part === 'identity' || (!part && c.op === 'REMOVE'));
  });
  return { safe: blocking.length === 0, blocking };
}

// ------------------------------------------------------------------------------------------------------ plates

const FRAMING_RANK: Record<Framing, number> = { EXTREME_WIDE: 0, WIDE: 1, MEDIUM_WIDE: 2, TWO_SHOT: 3, MEDIUM: 4, OVER_THE_SHOULDER: 5, MEDIUM_CLOSE_UP: 6, CLOSE_UP: 7, EXTREME_CLOSE_UP: 8, INSERT: 9 };
/** wide (the place reads) or close (the place is background) */
export const framingClass = (f?: Framing): 'WIDE' | 'CLOSE' => (f && FRAMING_RANK[f] <= 3 ? 'WIDE' : 'CLOSE');

const plateUsable = (pl: WorldPlate, assets: Asset[]) => { const a = assets.find((x) => x.id === pl.assetId); return usableImage(a) && !a.unavailable; };

/** The plate a shot at this place is conditioned on, and why. Order: an ESTABLISHED frame at the scene's time of
 *  day (what the audience already saw, by id); the drawn STATE plate for that time of day; an ESTABLISHED frame at
 *  another time of day (the prompt carries the light); the MASTER plate; a VIEW. Among equals, the same framing
 *  class as the shot, then the oldest (a locked place's canon). E9 (MINIMAX-CONTINUITY §3.10) may change the order. */
export function choosePlate(loc: WorldLocation, want: { timeOfDay?: TimeOfDay; framing?: Framing }, assets: Asset[]): { plate: WorldPlate; why: string; alternates: string[] } | undefined {
  const live = loc.plates.filter((p) => plateUsable(p, assets));
  const pick = (xs: WorldPlate[]) => xs.find((p) => p.framing && framingClass(p.framing) === framingClass(want.framing)) ?? xs[0];
  const tod = (want.timeOfDay ?? '').toLowerCase().replace('_', ' ');
  const tiers: Array<[WorldPlate[], string]> = [
    [live.filter((p) => p.role === 'ESTABLISHED' && p.timeOfDay === want.timeOfDay), `established frame of ${loc.name} at ${tod || 'this time of day'} (from an approved take)`],
    [live.filter((p) => p.role === 'STATE' && p.timeOfDay === want.timeOfDay), `drawn plate of ${loc.name} for ${tod}`],
    [live.filter((p) => p.role === 'ESTABLISHED'), `established frame of ${loc.name} (from an approved take; the light is set by the prompt)`],
    [live.filter((p) => p.role === 'MASTER'), `master plate of ${loc.name}`],
    [live.filter((p) => p.role === 'VIEW'), `view plate of ${loc.name}`],
  ];
  for (const [xs, why] of tiers) {
    const plate = xs.length ? pick(xs) : undefined;
    if (plate) return { plate, why, alternates: live.filter((p) => p.assetId !== plate.assetId).map((p) => p.assetId) };
  }
  return undefined;
}

/** The place's identity as pinned: the stored one when it is the revision's, else the revision's version and line
 *  (a conflict is named when the studio's place moved on since the pin). */
function pinnedIdentity(l: StudioState['locations'][number], wl: WorldLocation, conflicts: string[]): Location['identity'] {
  const live = locationIdentity(l);
  if (live.hash === wl.identity.hash) return live;
  conflicts.push(`${wl.name}: the place's identity is v${live.version} now, the production is pinned to v${wl.identity.version}; the pinned identity line is used`);
  // the overlaid place (never persisted) carries the pinned version and line under the hash of what it holds now, so
  // every reader of the overlay (`locationIdentity`) answers with the pin instead of re-deriving the later edit
  return { version: wl.identity.version, hash: live.hash, line: wl.identity.line, updatedAt: l.identity?.updatedAt ?? l.updatedAt };
}

/** The pinned revision laid over the studio state for one shot: the scene's place offers the chosen plate first (so
 *  the shot pack conditions the take on it), each character in the shot carries its pinned canonical image when the
 *  current one is a different version (a redraw after the pin does not reach a pinned production); the place carries
 *  its pinned identity (the version and line the revision holds, so a layout edit after the pin does not reach the
 *  prompt). Returns the state to resolve the shot pack from and the record of what was read. */
export function overlayWorld(state: StudioState, bible: WorldBible, p: Production, sh: Shot, rev: { id: string; number: number; pinned: boolean }): { state: StudioState; read: WorldRead } {
  const conflicts: string[] = [];
  const scene = p.scenes.find((sc) => sc.id === sh.sceneId);
  let locations = state.locations;
  let location: WorldRead['location'];
  const wl = scene?.locationId ? bible.locations.find((l) => l.locationId === scene.locationId) : undefined;
  if (scene?.locationId && !wl) conflicts.push(`the scene's place ${scene.locationId} is not in the World Bible revision ${rev.number}; its current plates are used`);
  if (wl && scene) {
    const live = state.locations.find((l) => l.id === wl.locationId);
    const choice = choosePlate(wl, { timeOfDay: scene.timeOfDay, framing: sh.framing }, state.assets);
    if (!live) conflicts.push(`${wl.name} is no longer in the studio`);
    else if (choice) {
      const master = wl.plates.find((x) => x.role === 'MASTER' && plateUsable(x, state.assets))?.assetId;
      locations = state.locations.map((l) => (l.id !== wl.locationId ? l : { ...l, masterAssetId: master ?? l.masterAssetId, refs: [{ id: `world-${choice.plate.assetId}`, role: 'STATE' as const, assetId: choice.plate.assetId, label: choice.plate.label, timeOfDay: scene.timeOfDay }, ...l.refs.filter((r) => r.assetId !== choice.plate.assetId)], identity: pinnedIdentity(l, wl, conflicts) }));
      location = { locationId: wl.locationId, assetId: choice.plate.assetId, role: choice.plate.role, label: choice.plate.label, why: choice.why, source: choice.plate.source, alternates: choice.alternates, identityVersion: wl.identity.version };
    } else {
      conflicts.push(`${wl.name} has no usable plate in the World Bible revision ${rev.number}`);
      locations = state.locations.map((l) => (l.id !== wl.locationId ? l : { ...l, identity: pinnedIdentity(l, wl, conflicts) }));
      location = { locationId: wl.locationId, why: 'no usable plate in the revision', alternates: [], identityVersion: wl.identity.version };
    }
  }
  const reads: WorldRead['characters'] = [];
  const characters = state.characters.map((c) => {
    if (!sh.characterIds.includes(c.id)) return c;
    const wc = bible.characters.find((x) => x.characterId === c.id);
    const current = c.canonicalImage;
    if (!wc?.canonical) { reads.push({ characterId: c.id, currentVersion: current?.version, usedPinned: false }); return c; }
    const same = current && current.version === wc.canonical.version && current.assetId === wc.canonical.assetId;
    if (same) { reads.push({ characterId: c.id, pinnedVersion: wc.canonical.version, assetId: wc.canonical.assetId, currentVersion: current!.version, usedPinned: true }); return c; }
    const pinnedAsset = state.assets.find((a) => a.id === wc.canonical!.assetId);
    if (!usableImage(pinnedAsset) || pinnedAsset.unavailable) {
      conflicts.push(`${c.name}: the pinned canonical image v${wc.canonical.version} is not available; the current ${current ? `v${current.version}` : 'image'} is used`);
      reads.push({ characterId: c.id, pinnedVersion: wc.canonical.version, assetId: current?.assetId, currentVersion: current?.version, usedPinned: false });
      return c;
    }
    conflicts.push(`${c.name}: the canonical image is v${current?.version ?? '—'} now, the production is pinned to v${wc.canonical.version}; the pinned image is used`);
    reads.push({ characterId: c.id, pinnedVersion: wc.canonical.version, assetId: wc.canonical.assetId, currentVersion: current?.version, usedPinned: true });
    return { ...c, canonicalImage: { ...(current ?? { generatedAt: '' }), assetId: wc.canonical.assetId, version: wc.canonical.version, status: wc.canonical.status } };
  });
  return { state: { ...state, locations, characters }, read: { revisionId: rev.id, revisionNumber: rev.number, pinned: rev.pinned, location, characters: reads, conflicts } };
}

// ----------------------------------------------------------------------------------------------------- planner

const tod = (t?: string) => (t ?? '').toLowerCase().replace('_', ' ');

/** What the shot planner is told from the bible for one scene: the world's rules, the place's canon and the plates
 *  that will be reused by id, what an earlier scene (in this production or an earlier episode) left there, the props
 *  last seen, and what the people present last wore. Empty when the bible says nothing about the scene. */
export function worldForPlanner(bible: WorldBible, p: Production, scene: Scene): string {
  const parts: string[] = [];
  const rules = bible.rules.filter((r) => r.scope === 'WORLD' || r.source === 'PRODUCER').map((r) => r.text);
  if (rules.length) parts.push(`World rules: ${rules.join(' ')}`);
  const wl = scene.locationId ? bible.locations.find((l) => l.locationId === scene.locationId) : undefined;
  // the scene's own place in story order (the production's index in the scope, from its own timeline events or
  // states): states of scenes before this one (earlier productions, earlier scenes)
  const own = bible.timeline.find((e) => e.source === 'SCENE' && e.productionId === p.id) ?? bible.states.find((s) => s.productionId === p.id);
  const myOrder = (own ? Math.floor(own.order / 1000) : 0) * 1000 + scene.number;
  const before = bible.states.filter((s) => s.order < myOrder && s.sceneId !== scene.id);
  if (wl) {
    const est = wl.plates.filter((x) => x.role === 'ESTABLISHED');
    const canon = [wl.canon.architecture, wl.canon.fixedFeatures.length ? `fixed features: ${wl.canon.fixedFeatures.join(', ')}` : '', wl.canon.spatial].filter(Boolean).join('; ');
    const here = before.filter((s) => s.locationId === wl.locationId).at(-1);
    // a scene at this place earlier in the story (this production or an earlier episode), even one whose shots carry
    // no continuity record yet: the place is a return by id, never a redesign
    const earlier = bible.timeline.filter((e) => e.source === 'SCENE' && e.locationId === wl.locationId && e.order < myOrder && e.sceneId !== scene.id);
    if (here || est.length || earlier.length) {
      parts.push(`RETURNING LOCATION (World Bible): ${wl.name} was already shown${est.length ? ` in an approved cut — its established frames are reused by id (${est.map((x) => `${x.label}${x.timeOfDay ? `, ${tod(x.timeOfDay)}` : ''}`).join('; ')})` : earlier.length ? ` in ${earlier.length} earlier scene${earlier.length > 1 ? 's' : ''} (its plates are reused by id)` : ''}. Same architecture, layout and fixed features; do not redesign it${canon ? ` (${canon})` : ''}.${here ? ` Left at the end of an earlier scene: ${JSON.stringify({ light: here.environment.lighting, weather: here.environment.weather, state: here.environment.state, props: here.props.map((x) => `${x.name}${x.position ? ` (${x.position})` : ''}${x.state ? ` ${x.state}` : ''}`) })}.` : ''} Only light, weather, time of day and movable things may differ now, and the shots should say how.`);
    } else if (canon) parts.push(`The place's canon (World Bible): ${canon}.`);
  }
  const present = new Set(scene.characterIds);
  const carried = bible.props.filter((x) => x.last && x.ownerCharacterId && present.has(x.ownerCharacterId) && x.last.sceneId !== scene.id);
  if (carried.length) parts.push(`Props last seen with the people in this scene: ${carried.map((x) => `${x.name}${x.last?.state ? ` (${x.last.state})` : ''}`).join('; ')}.`);
  const worn = bible.characters.filter((c) => present.has(c.characterId)).map((c) => {
    const last = before.flatMap((s) => s.characters.filter((x) => x.characterId === c.characterId && x.wardrobe)).at(-1)?.wardrobe;
    return last ? `${c.name}: ${last}` : '';
  }).filter(Boolean);
  if (worn.length) parts.push(`Last worn (keep unless the story changes the day): ${worn.join('; ')}.`);
  return parts.join('\n');
}

/** What story development is told from the bible: the rules, relationships, the latest timeline facts, the open
 *  storylines and the places with what is fixed about them (and whether the audience has already seen them). */
export function worldForStory(bible: WorldBible) {
  return {
    rules: bible.rules.filter((r) => r.scope === 'WORLD' || r.source === 'PRODUCER').map((r) => r.text),
    relationships: bible.relationships.map((r) => r.text),
    timeline: bible.timeline.slice(-16).map((e) => e.text),
    openStorylines: bible.openStorylines,
    places: bible.locations.map((l) => ({ name: l.name, fixedFeatures: l.canon.fixedFeatures, architecture: l.canon.architecture, established: l.plates.some((x) => x.role === 'ESTABLISHED') })),
    styleNotes: bible.styleNotes,
  };
}

// --------------------------------------------------------------------------------------------- establishing

export interface EstablishCandidate { locationId: string; sceneId: string; shotId: string; takeId: string; videoAssetId: string; frame: number; timeOfDay: TimeOfDay; framing: Framing }

const takeAcceptedForWorld = (t: Take | undefined): t is Take => Boolean(t && t.provider !== 'SAMPLE' && t.status === 'READY' && t.qa?.ok !== false);

/** The frames an approved cut establishes: per place and time of day (and framing class), the widest chosen take of
 *  the first scene there, a quarter second after its first kept frame (the opening of a wide shot — the clean view of
 *  the place the audience saw first). */
export function establishCandidates(p: Production, assets: Asset[]): EstablishCandidate[] {
  const out: EstablishCandidate[] = [];
  for (const sc of scenesInOrder(p)) {
    if (!sc.locationId) continue;
    const shots = shotsOfScene(p, sc.id).map((sh) => ({ sh, t: sh.takes.find((x) => x.id === sh.selectedTakeId) })).filter((x): x is { sh: Shot; t: Take } => takeAcceptedForWorld(x.t) && Boolean(assets.find((a) => a.id === x.t!.assetId && a.kind === 'VIDEO' && !a.sample && !a.unavailable)));
    if (!shots.length) continue;
    const best = [...shots].sort((a, b) => FRAMING_RANK[a.sh.framing] - FRAMING_RANK[b.sh.framing] || a.sh.number - b.sh.number)[0];
    if (out.some((c) => c.locationId === sc.locationId && c.timeOfDay === sc.timeOfDay && framingClass(c.framing) === framingClass(best.sh.framing))) continue;
    const trim = best.t.trimStartFrames ?? 0;
    const total = Math.round((best.t.durationSeconds ?? assets.find((a) => a.id === best.t.assetId)?.durationSeconds ?? 0) * 24);
    const frame = Math.max(trim, Math.min(trim + 6, total - 1));
    out.push({ locationId: sc.locationId, sceneId: sc.id, shotId: best.sh.id, takeId: best.t.id, videoAssetId: best.t.assetId, frame, timeOfDay: sc.timeOfDay, framing: best.sh.framing });
  }
  return out;
}

/** Whether a take's frame is already an established plate of the bible. */
export const isEstablished = (bible: WorldBible, c: Pick<EstablishCandidate, 'takeId' | 'frame'>): boolean => bible.locations.some((l) => l.plates.some((x) => x.source.kind === 'FROM_TAKE' && x.source.takeId === c.takeId && x.source.frame === c.frame));

/** The bible with the established frames added (by id) and their places locked. A frame already there is skipped. */
export function withEstablished(bible: WorldBible, frames: Array<{ candidate: EstablishCandidate; imageAssetId: string; productionId: string; label?: string; approvalId?: string; approvedAt?: string }>, now: string): WorldBible {
  const locations = bible.locations.map((l) => {
    const mine = frames.filter((f) => f.candidate.locationId === l.locationId);
    if (!mine.length) return l;
    const plates = [...l.plates];
    for (const f of mine) {
      if (plates.some((x) => x.source.kind === 'FROM_TAKE' && x.source.takeId === f.candidate.takeId && x.source.frame === f.candidate.frame)) continue;
      plates.push({ assetId: f.imageAssetId, role: 'ESTABLISHED', label: f.label ?? `Established (${f.candidate.framing.toLowerCase().replace(/_/g, ' ')})`, timeOfDay: f.candidate.timeOfDay, framing: f.candidate.framing, source: { kind: 'FROM_TAKE', productionId: f.productionId, sceneId: f.candidate.sceneId, shotId: f.candidate.shotId, takeId: f.candidate.takeId, frame: f.candidate.frame, approvalId: f.approvalId, approvedAt: f.approvedAt }, addedAt: now });
    }
    return { ...l, plates, locked: true };
  });
  return { ...bible, locations };
}

/** One line for an event or a job record. */
export const summarizeChanges = (changes: WorldChange[], max = 6): string => (changes.length ? `${changes.slice(0, max).map((c) => `${c.op.toLowerCase()} ${c.path}${c.detail ? ` (${c.detail})` : ''}`).join('; ')}${changes.length > max ? `; and ${changes.length - max} more` : ''}` : 'no change');
