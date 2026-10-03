import type { TimeOfDay } from './vocabulary';

/** A SCENE'S SETUP FROM A PROPOSAL (D22) — the proposal's structure is prose ("The meteor shower outside casts
 *  dramatic shadows…"), and its scenes were created with no place, no one present and a morning for a night story.
 *  What the prose states is taken; nothing is invented: the one place when the story has one, a place or a person
 *  named in the scene, and a time of day only when a word says it (else the default). Pure. */

const TIMES: Array<[TimeOfDay, RegExp]> = [
  ['GOLDEN_HOUR', /\bgolden hour\b|الساعة الذهبية/i],
  ['DAWN', /\b(dawn|daybreak|sunrise|first light)\b|فجر|الفجر|شروق/i],
  ['DUSK', /\b(dusk|sunset|twilight|nightfall)\b|غروب|الغروب|المغرب/i],
  ['NIGHT', /\b(night|midnight|moonlight|moonlit|starlight|starry|meteors?|meteor shower)\b|ليل|الليل|ليلة|منتصف الليل|نجوم/i],
  ['MIDDAY', /\b(noon|midday)\b|الظهر|ظهراً|ظهرا/i],
  ['AFTERNOON', /\bafternoon\b|العصر|عصراً|عصرا/i],
  ['MORNING', /\bmorning\b|الصباح|صباحاً|صباحا/i],
];

/** The time of day a text states, the first that matches in this order (a "golden hour" or "sunset" beats "night"). */
export function timeOfDayIn(text: string): TimeOfDay | undefined {
  return TIMES.find(([, re]) => re.test(text))?.[0];
}

const STOP = new Set(['the', 'and', 'of', 'old', 'new', 'little', 'big', 'room', 'house', 'street']);
/** The name, or a distinctive part of it, as a whole word: articles and generic words never match on their own. */
const named = (text: string, name: string, minPart = 3): boolean => {
  const parts = [name, ...name.split(/\s+/).filter((p) => { const w = p.replace(/[^\p{L}]/gu, ''); return w.length >= minPart && !STOP.has(w.toLowerCase()); })];
  return parts.some((n) => new RegExp(`(^|[^\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}])`, 'iu').test(text));
};

export interface SceneSetup { locationId?: string; timeOfDay: TimeOfDay; characterIds: string[] }

/** The setup of one scene from its summary: the scene's own words first, then the premise's for the time of day. */
export function sceneSetupFrom(summary: string, opts: { premise?: string; locations: Array<{ id: string; name: string }>; cast: Array<{ id: string; name: string }>; fallback?: TimeOfDay }): SceneSetup {
  const place = opts.locations.length === 1 ? opts.locations[0] : opts.locations.find((l) => named(summary, l.name, 4));
  const timeOfDay = timeOfDayIn(summary) ?? (opts.premise ? timeOfDayIn(opts.premise) : undefined) ?? opts.fallback ?? 'MORNING';
  return { locationId: place?.id, timeOfDay, characterIds: opts.cast.filter((c) => named(summary, c.name)).map((c) => c.id) };
}
