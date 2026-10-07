/** THE STUDIO'S VOCABULARY — the finite options a producer can choose. Every value here appears somewhere in the
 *  interface as a control. These are plain TypeScript unions and label tables: the prototype validates in forms, not
 *  with a schema library. */

export const STYLES = ['CARTOON', 'ANIME', 'REALISTIC'] as const;
export type Style = (typeof STYLES)[number];

/** What a character performs (master plan §3): spoken parts, songs, or both — with one identity either way. */
export const PERFORMER_KINDS = ['ACTOR', 'SINGER', 'ACTOR_SINGER'] as const;
export type PerformerKind = (typeof PERFORMER_KINDS)[number];
/** Whether a performer kind sings (and so carries a singing profile). */
export const sings = (k: PerformerKind): boolean => k !== 'ACTOR';

/** A singer's range, kept with the singing profile (never with the spoken voice). */
export const VOICE_TYPES = ['SOPRANO', 'MEZZO_SOPRANO', 'ALTO', 'TENOR', 'BARITONE', 'BASS'] as const;
export type VoiceType = (typeof VOICE_TYPES)[number];

export const LANGUAGES = ['EN', 'AR'] as const;
export type Language = (typeof LANGUAGES)[number];

export const DIALECTS = ['IRAQI_BAGHDADI', 'MSA', 'GULF', 'LEVANTINE', 'EGYPTIAN', 'MOROCCAN'] as const;
export type Dialect = (typeof DIALECTS)[number];

export const ASPECTS = ['WIDE_16_9', 'VERTICAL_9_16', 'SQUARE_1_1', 'CINEMA_2_39'] as const;
export type Aspect = (typeof ASPECTS)[number];

export const KINDS = ['EPISODE', 'SHORT', 'MUSIC_VIDEO'] as const;
export type Kind = (typeof KINDS)[number];

export const STAGES = ['STORY', 'CAST_AND_WORLD', 'STORYBOARD', 'PRODUCE', 'FINAL_CUT', 'COMPLETE'] as const;
export type Stage = (typeof STAGES)[number];

export const TIMES_OF_DAY = ['DAWN', 'MORNING', 'MIDDAY', 'AFTERNOON', 'GOLDEN_HOUR', 'DUSK', 'NIGHT'] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

export const FRAMINGS = ['EXTREME_WIDE', 'WIDE', 'MEDIUM_WIDE', 'MEDIUM', 'MEDIUM_CLOSE_UP', 'CLOSE_UP', 'EXTREME_CLOSE_UP', 'INSERT', 'TWO_SHOT', 'OVER_THE_SHOULDER'] as const;
export type Framing = (typeof FRAMINGS)[number];

export const CAMERA_MOVES = ['STATIC', 'PUSH_IN', 'PULL_BACK', 'PAN_LEFT', 'PAN_RIGHT', 'TILT_UP', 'TILT_DOWN', 'TRUCK_LEFT', 'TRUCK_RIGHT', 'HANDHELD', 'FOLLOW', 'ORBIT', 'CRANE_UP', 'CRANE_DOWN', 'RACK_FOCUS'] as const;
export type CameraMove = (typeof CAMERA_MOVES)[number];

export const TRANSITIONS = ['CUT', 'EXTEND', 'DISSOLVE', 'FADE'] as const;
export type Transition = (typeof TRANSITIONS)[number];

export const CHARACTER_REF_ROLES = ['FACE', 'FRONT', 'THREE_QUARTER', 'SIDE', 'BACK', 'FULL_BODY', 'EXPRESSION', 'OUTFIT'] as const;
export type CharacterRefRole = (typeof CHARACTER_REF_ROLES)[number];

export const LOCATION_REF_ROLES = ['MASTER', 'VIEW', 'STATE'] as const;
export type LocationRefRole = (typeof LOCATION_REF_ROLES)[number];

export const LYRIC_KINDS = ['INTRO', 'VERSE', 'PRE_CHORUS', 'CHORUS', 'BRIDGE', 'OUTRO', 'INSTRUMENTAL'] as const;
export type LyricKind = (typeof LYRIC_KINDS)[number];

export const SEXES = ['FEMALE', 'MALE'] as const;
export type Sex = (typeof SEXES)[number];

export const PITCHES = ['LOW', 'MID', 'HIGH'] as const;
export const PACES = ['SLOW', 'MEASURED', 'QUICK'] as const;

/** Pixel sizes for each aspect, as the interface describes them. */
export const ASPECT_INFO: Record<Aspect, { width: number; height: number; label: string; ratio: number }> = {
  WIDE_16_9: { width: 1344, height: 768, label: '16:9 · TV and cinema', ratio: 16 / 9 },
  VERTICAL_9_16: { width: 768, height: 1344, label: '9:16 · phones', ratio: 9 / 16 },
  SQUARE_1_1: { width: 1024, height: 1024, label: '1:1 · feeds', ratio: 1 },
  CINEMA_2_39: { width: 1536, height: 640, label: '2.39:1 · anamorphic', ratio: 2.39 },
};

/** The dialects' English names: the prompts' and the interface's words for a production's dialect (the interface is
 *  English-only). */
export const DIALECT_LABELS: Record<Dialect, { en: string }> = {
  IRAQI_BAGHDADI: { en: 'Iraqi — Baghdadi' },
  MSA: { en: 'Modern Standard Arabic' },
  GULF: { en: 'Gulf' },
  LEVANTINE: { en: 'Levantine' },
  EGYPTIAN: { en: 'Egyptian' },
  MOROCCAN: { en: 'Moroccan' },
};

/** Suggested lengths, in seconds, by what is being made. */
export const DURATIONS: Record<'EPISODE' | 'SHORT' | 'MUSIC_VIDEO', number[]> = {
  EPISODE: [180, 300, 420, 600],
  SHORT: [30, 60, 90, 120],
  MUSIC_VIDEO: [90, 120, 180, 240],
};
