import { z } from 'zod';

/** TOLERANT INPUT FOR STRICT SCHEMAS. Language models (especially local ones) return `null` for optional fields,
 *  lower-case or paraphrased enum values ("close up", "dolly in", "evening") and near-miss keys ("name" for
 *  "characterName"). Everything here maps those onto the exact vocabulary before validation, so a repair round is
 *  spent on genuine mistakes rather than on spelling. Nothing is invented: a value that cannot be mapped still fails. */

export const dropNulls = (v: unknown): unknown => {
  if (v === null) return undefined;
  if (Array.isArray(v)) return v.map(dropNulls);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, dropNulls(x)]));
  return v;
};

const slug = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** An enum that accepts case/punctuation variants, listed synonyms (also slugged), and finally a fallback. */
export function looseEnum<const T extends readonly [string, ...string[]]>(values: T, synonyms: Record<string, T[number]> = {}, fallback?: T[number]) {
  const syn = Object.fromEntries(Object.entries(synonyms).map(([k, v]) => [slug(k), v]));
  const map = (v: unknown): unknown => {
    if (v === null || v === undefined || v === '') return fallback;
    if (typeof v !== 'string') return v;
    const s = slug(v);
    if ((values as readonly string[]).includes(s)) return s;
    if (syn[s]) return syn[s];
    const partial = values.find((x) => s.includes(x) || x.includes(s));
    if (partial) return partial;
    return fallback ?? v;
  };
  return z.preprocess(map, z.enum(values));
}

/** Rename near-miss keys on an object (first alias that exists wins; an existing canonical key is kept). */
export const aliases = (table: Record<string, string[]>) => (v: unknown): unknown => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
  const o = { ...(v as Record<string, unknown>) };
  for (const [key, alts] of Object.entries(table)) {
    if (o[key] !== undefined && o[key] !== null) continue;
    const found = alts.find((a) => o[a] !== undefined && o[a] !== null);
    if (found) o[key] = o[found];
  }
  return o;
};

/** Numbers that arrive as strings ("6", "6s", "6 seconds"). */
export const looseNumber = z.preprocess((v) => {
  if (typeof v === 'string') { const m = v.match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : v; }
  return v;
}, z.number());

/** A string field that tolerates numbers and arrays of strings (joined). */
export const looseString = z.preprocess((v) => {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v.join(', ');
  return v;
}, z.string());

/** An array field that tolerates a single value, a comma list, an object keyed by index, or nothing. */
export const looseArray = <S extends z.ZodTypeAny>(item: S, bounds: { min?: number; max?: number } = {}) => {
  let arr = z.array(item);
  if (bounds.min !== undefined) arr = arr.min(bounds.min);
  if (bounds.max !== undefined) arr = arr.max(bounds.max);
  return z.preprocess((v) => {
    if (v === undefined || v === null || v === '') return [];
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') return v.split(/\s*[,;]\s*/).filter(Boolean);
    if (typeof v === 'object') { const vals = Object.values(v as Record<string, unknown>); return vals.every((x) => x && typeof x === 'object') ? vals : [v]; }
    return [v];
  }, arr);
};

export const TIME_SYNONYMS = { DAY: 'MIDDAY', DAYTIME: 'MIDDAY', NOON: 'MIDDAY', LATE_MORNING: 'MORNING', EARLY_MORNING: 'DAWN', SUNRISE: 'DAWN', SUNSET: 'DUSK', EVENING: 'DUSK', TWILIGHT: 'DUSK', LATE_AFTERNOON: 'GOLDEN_HOUR', MAGIC_HOUR: 'GOLDEN_HOUR', MIDNIGHT: 'NIGHT', LATE_NIGHT: 'NIGHT', NIGHTTIME: 'NIGHT' } as const;
export const FRAMING_SYNONYMS = { CLOSE: 'CLOSE_UP', CU: 'CLOSE_UP', ECU: 'EXTREME_CLOSE_UP', MCU: 'MEDIUM_CLOSE_UP', MS: 'MEDIUM', MID: 'MEDIUM', MID_SHOT: 'MEDIUM', MEDIUM_SHOT: 'MEDIUM', MW: 'MEDIUM_WIDE', MLS: 'MEDIUM_WIDE', WS: 'WIDE', LS: 'WIDE', LONG: 'WIDE', LONG_SHOT: 'WIDE', ESTABLISHING: 'WIDE', FULL: 'WIDE', FULL_SHOT: 'WIDE', EWS: 'EXTREME_WIDE', ELS: 'EXTREME_WIDE', EXTREME_LONG: 'EXTREME_WIDE', OTS: 'OVER_THE_SHOULDER', OVER_SHOULDER: 'OVER_THE_SHOULDER', DETAIL: 'INSERT', MACRO: 'INSERT', TWO: 'TWO_SHOT', GROUP: 'WIDE' } as const;
export const MOVE_SYNONYMS = { NONE: 'STATIC', LOCKED: 'STATIC', LOCKED_OFF: 'STATIC', FIXED: 'STATIC', STILL: 'STATIC', TRIPOD: 'STATIC', DOLLY_IN: 'PUSH_IN', ZOOM_IN: 'PUSH_IN', SLOW_PUSH: 'PUSH_IN', PUSH: 'PUSH_IN', DOLLY_OUT: 'PULL_BACK', ZOOM_OUT: 'PULL_BACK', PULL_OUT: 'PULL_BACK', PULL: 'PULL_BACK', PAN: 'PAN_RIGHT', TILT: 'TILT_UP', TRACK: 'FOLLOW', TRACKING: 'FOLLOW', TRACKING_SHOT: 'FOLLOW', STEADICAM: 'FOLLOW', DOLLY: 'TRUCK_RIGHT', TRUCK: 'TRUCK_RIGHT', ARC: 'ORBIT', CIRCLE: 'ORBIT', CRANE: 'CRANE_UP', JIB: 'CRANE_UP', BOOM_UP: 'CRANE_UP', BOOM_DOWN: 'CRANE_DOWN', FOCUS_PULL: 'RACK_FOCUS', SHAKY: 'HANDHELD' } as const;
export const TRANSITION_SYNONYMS = { HARD_CUT: 'CUT', STRAIGHT_CUT: 'CUT', MATCH_CUT: 'CUT', JUMP_CUT: 'CUT', SMASH_CUT: 'CUT', CROSSFADE: 'DISSOLVE', CROSS_DISSOLVE: 'DISSOLVE', MIX: 'DISSOLVE', FADE_IN: 'FADE', FADE_OUT: 'FADE', FADE_TO_BLACK: 'FADE', BLACK: 'FADE', CONTINUE: 'EXTEND', CONTINUATION: 'EXTEND', CONTINUOUS: 'EXTEND', EXTENSION: 'EXTEND' } as const;
export const RELATION_SYNONYMS = { CONTINUE: 'CONTINUATION', CONTINUOUS: 'CONTINUATION', CONTINUED: 'CONTINUATION', SAME: 'CONTINUATION', SAME_MOMENT: 'CONTINUATION', EXTEND: 'CONTINUATION', NEW_SCENE: 'STORY_TRANSITION', SCENE_CHANGE: 'STORY_TRANSITION', TRANSITION: 'STORY_TRANSITION', TIME_JUMP: 'STORY_TRANSITION', TIME_SKIP: 'STORY_TRANSITION', LATER: 'STORY_TRANSITION', NEW_LOCATION: 'STORY_TRANSITION', FIRST: 'CUT', FIRST_SHOT: 'CUT', START: 'CUT', NONE: 'CUT', OPENING: 'CUT', NEW_ANGLE: 'CUT', REVERSE: 'CUT' } as const;
export const DIRECTION_SYNONYMS = { CAMERA_LEFT: 'LEFT', SCREEN_LEFT: 'LEFT', FRAME_LEFT: 'LEFT', CAMERA_RIGHT: 'RIGHT', SCREEN_RIGHT: 'RIGHT', FRAME_RIGHT: 'RIGHT', TOWARDS: 'TOWARD', TOWARD_CAMERA: 'TOWARD', FACING_CAMERA: 'TOWARD', FRONT: 'TOWARD', AWAY_FROM_CAMERA: 'AWAY', BACK: 'AWAY', CENTER: 'NEUTRAL', CENTRE: 'NEUTRAL', NONE: 'NEUTRAL', STATIC: 'NEUTRAL' } as const;
export const KIND_SYNONYMS = { INT: 'INTERIOR', INSIDE: 'INTERIOR', INDOOR: 'INTERIOR', INDOORS: 'INTERIOR', EXT: 'EXTERIOR', OUTSIDE: 'EXTERIOR', OUTDOOR: 'EXTERIOR', OUTDOORS: 'EXTERIOR', INT_EXT: 'INTERIOR' } as const;
export const SEX_SYNONYMS = { F: 'FEMALE', WOMAN: 'FEMALE', GIRL: 'FEMALE', SHE: 'FEMALE', M: 'MALE', MAN: 'MALE', BOY: 'MALE', HE: 'MALE' } as const;
export const MODE_SYNONYMS = { SINGLE: 'SOLO', ONE: 'SOLO', LEAD: 'SOLO', TOGETHER: 'DUET', BOTH: 'DUET', PAIR: 'DUET', TRADING: 'ALTERNATING', ALTERNATE: 'ALTERNATING', TURNS: 'ALTERNATING', CALL_AND_RESPONSE: 'ALTERNATING', GROUP: 'ENSEMBLE', CHORUS: 'ENSEMBLE', ALL: 'ENSEMBLE', EVERYONE: 'ENSEMBLE', LISTENING: 'LISTENER', REACTION: 'LISTENER', NO_SINGING: 'INSTRUMENTAL', NONE: 'INSTRUMENTAL', MUSIC_ONLY: 'INSTRUMENTAL', INTRO: 'INSTRUMENTAL', OUTRO: 'INSTRUMENTAL' } as const;
