import { z } from 'zod';
import { CAMERA_MOVES, FRAMINGS, TIMES_OF_DAY, TRANSITIONS } from '@/domain/vocabulary';
import { DIRECTION_SYNONYMS, FRAMING_SYNONYMS, KIND_SYNONYMS, MODE_SYNONYMS, MOVE_SYNONYMS, RELATION_SYNONYMS, SEX_SYNONYMS, TIME_SYNONYMS, TRANSITION_SYNONYMS, aliases, looseArray, looseEnum, looseNumber, looseString } from './lenient';

/** WHAT THE STORY ENGINE MUST RETURN — strict shapes the language model fills in. The shapes are strict about meaning
 *  and tolerant about spelling (see lenient.ts): nulls, case, synonyms and near-miss keys are normalised before
 *  validation, and genuine failures go back to the model once or twice with the exact problem before the job fails. */

const str = (max = 400) => looseString.pipe(z.string().trim().max(max));
const req = (max = 400) => looseString.pipe(z.string().trim().min(1).max(max));
const int = (min: number, max: number) => looseNumber.pipe(z.number().int().min(min).max(max));
const strs = (max = 80, limit = 8) => looseArray(str(max), { max: limit });

const timeOfDay = looseEnum(TIMES_OF_DAY, TIME_SYNONYMS);
const framing = looseEnum(FRAMINGS, FRAMING_SYNONYMS, 'MEDIUM');
const cameraMove = looseEnum(CAMERA_MOVES, MOVE_SYNONYMS, 'STATIC');
const transition = looseEnum(TRANSITIONS, TRANSITION_SYNONYMS, 'CUT');
const relation = looseEnum(['CONTINUATION', 'CUT', 'STORY_TRANSITION'], RELATION_SYNONYMS, 'CUT');
const screenDirection = looseEnum(['LEFT', 'RIGHT', 'TOWARD', 'AWAY', 'NEUTRAL'], DIRECTION_SYNONYMS);
const placeKind = looseEnum(['INTERIOR', 'EXTERIOR'], KIND_SYNONYMS);
const sex = looseEnum(['FEMALE', 'MALE'], SEX_SYNONYMS);

const lineAliases = aliases({ characterName: ['name', 'character', 'characterId', 'speaker', 'who', 'id'], text: ['line', 'dialogue', 'textEn', 'english'], textAr: ['arabic', 'ar', 'lineAr', 'dialogueAr'] });
const lines = looseArray(z.preprocess(lineAliases, z.object({ characterName: str(80), text: str(600), textAr: str(600).optional(), delivery: str(120).optional() })), { max: 16 });

export const ProposalSchema = z.preprocess(aliases({ title: ['name', 'titleEn'], logline: ['tagline', 'hook', 'oneLiner'], premise: ['synopsis', 'description', 'summary', 'story', 'concept', 'plot'], structure: ['scenes', 'episodes', 'sections', 'acts', 'beats'], cast: ['characters', 'people'], locations: ['places', 'settings'], mood: ['tone'] }), z.object({
  title: req(80),
  titleAr: str(80).optional(),
  logline: req(240),
  premise: looseString.pipe(z.string().trim().min(20).max(1600)),
  genre: req(60),
  mood: req(80),
  structure: looseArray(z.preprocess(aliases({ title: ['name', 'act', 'heading'], summary: ['description', 'text', 'beat'] }), z.object({ title: req(80), summary: req(400) })), { min: 2, max: 8 }),
  cast: looseArray(z.preprocess(aliases({ existingCharacterId: ['characterId', 'id'], reason: ['why', 'note', 'function'], appearance: ['look', 'description'] }), z.object({ existingCharacterId: z.string().optional(), name: req(60), role: req(120), reason: str(240).optional(), sex: sex.optional(), ageYears: int(1, 120).optional(), appearance: str(400).optional(), personality: str(400).optional() })), { min: 1, max: 8 }),
  locations: looseArray(z.preprocess(aliases({ existingLocationId: ['locationId', 'id'], description: ['look', 'summary'], kind: ['type'] }), z.object({ existingLocationId: z.string().optional(), name: req(60), description: req(400), kind: placeKind.optional() })), { min: 1, max: 6 }),
  song: z.preprocess(aliases({ caption: ['description', 'style', 'musicalCaption'], lyrics: ['text', 'words'] }), z.object({ title: str(80), caption: str(300).optional(), lyrics: z.string().trim().max(4000) })).optional(),
}));

export const CharacterDesignSchema = z.preprocess(aliases({ distinguishing: ['distinguishingFeatures', 'features', 'marks'], wardrobe: ['clothing', 'outfit', 'costume'] }), z.object({
  build: str(160), face: str(300), hair: str(160), skin: str(80), eyes: str(80), distinguishing: strs(80, 6), wardrobe: str(300), personality: str(400), ageYears: int(1, 120).optional(), sex: sex.optional(), nameAr: str(60).optional(),
  canon: z.object({ heightCm: int(30, 250).optional(), accessories: strs(80, 6).optional(), visualRestrictions: strs(120, 6).optional(), agePresentation: str(80).optional(), speech: str(200).optional() }).optional(),
}));

export const LocationDesignSchema = z.preprocess(aliases({ kind: ['type'], lighting: ['timesOfDay', 'times'] }), z.object({
  description: str(600), kind: placeKind, landmarks: strs(120, 8), props: strs(80, 10), lighting: looseArray(timeOfDay, { min: 1, max: 4 }), nameAr: str(60).optional(),
  layout: z.object({ geography: str(300).optional(), architecture: str(300).optional(), materials: strs(60, 8).optional(), cameraZones: strs(120, 6).optional(), entrances: strs(80, 4).optional(), spatial: str(400).optional() }).optional(),
}));

export const DevelopSchema = z.object({
  logline: req(240),
  synopsis: looseString.pipe(z.string().trim().min(40).max(2400)),
  genre: str(60).optional(),
  mood: str(80).optional(),
  titleAr: str(80).optional(),
  newCharacters: looseArray(z.preprocess(aliases({ sex: ['gender'] }), z.object({ name: req(60), role: str(120), sex, design: CharacterDesignSchema })), { max: 6 }),
  newLocations: looseArray(z.object({ name: req(60), design: LocationDesignSchema }), { max: 5 }),
  scenes: looseArray(z.preprocess(aliases({ locationName: ['location', 'place'], characterNames: ['characters', 'cast'], targetSeconds: ['seconds', 'duration', 'durationSeconds'], emotionalObjective: ['emotion', 'objective'] }), z.object({ title: req(80), locationName: str(60), timeOfDay, characterNames: strs(60, 8), purpose: str(300), emotionalObjective: str(200), entryState: str(300), exitState: str(300), targetSeconds: int(5, 900) })), { min: 1, max: 24 }),
});

export const ScriptSceneSchema = z.preprocess(aliases({ sceneId: ['id', 'scene'] }), z.object({
  sceneId: looseString,
  beats: looseArray(z.preprocess(aliases({ action: ['description', 'text', 'beat'], lines: ['dialogue'] }), z.object({ action: req(600), lines })), { min: 1, max: 12 }),
}));
export const ScriptSchema = z.object({ scenes: looseArray(ScriptSceneSchema, { min: 1 }) });

const personAliases = aliases({ characterName: ['name', 'character', 'characterId', 'who', 'id'], wardrobe: ['clothing', 'outfit', 'costume'], holding: ['props', 'items'] });
/** A continuity entry whose character is an object ({name}) or a bare string is unwrapped; one with no name at all is
 *  dropped — it cannot be attached to anyone and is not worth a repair round. */
const continuityPeople = (v: unknown): unknown => {
  const arr = Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v as Record<string, unknown>) : v ? [v] : [];
  return arr.map((x) => {
    if (typeof x === 'string') return { characterName: x };
    if (!x || typeof x !== 'object') return undefined;
    const o = personAliases(x) as Record<string, unknown>;
    if (o.characterName && typeof o.characterName === 'object') o.characterName = (o.characterName as Record<string, unknown>).name ?? (o.characterName as Record<string, unknown>).characterName;
    return typeof o.characterName === 'string' && o.characterName.trim() ? o : undefined;
  }).filter(Boolean);
};

export const ContinuitySchema = z.preprocess(aliases({ characters: ['cast', 'people'], relationToPrevious: ['relation', 'relationship', 'relationToPreviousShot', 'continuity'] }), z.object({
  characters: z.preprocess(continuityPeople, z.array(z.object({ characterName: str(60), wardrobe: str(160).optional(), pose: str(160).optional(), position: str(120).optional(), screenDirection: screenDirection.optional(), eyeline: str(120).optional(), emotion: str(80).optional(), holding: strs(60, 4).optional() })).max(8)),
  props: looseArray(z.preprocess(aliases({ name: ['prop', 'item'], ownerCharacterName: ['owner', 'heldBy', 'character'] }), z.object({ name: str(60), ownerCharacterName: str(60).optional(), state: str(120).optional(), position: str(120).optional() })), { max: 10 }),
  environment: z.preprocess((v) => v ?? {}, z.object({ timeOfDay: timeOfDay.optional(), weather: str(80).optional(), lighting: str(200).optional(), state: str(200).optional() })),
  camera: z.preprocess((v) => v ?? {}, z.object({ lensIntent: str(120).optional(), angle: str(120).optional() })),
  relationToPrevious: relation,
  notes: str(300).optional(),
}));

export const ShotPlanSchema = z.preprocess(aliases({ shots: ['shotList', 'shot_list', 'sequence', 'plan', 'storyboard', 'sceneShots', 'scene_shots', 'list'] }), z.object({
  shots: looseArray(z.preprocess(aliases({ purpose: ['intent', 'goal', 'title'], action: ['description', 'beat'], framing: ['shotSize', 'size', 'shotType'], cameraMove: ['camera', 'move', 'movement', 'cameraMovement'], durationSeconds: ['duration', 'seconds', 'length'], characterNames: ['characters', 'cast'], dialogueLineIndexes: ['lines', 'dialogue', 'lineIndexes', 'dialogueLines'], prompt: ['videoPrompt', 'generationPrompt'] }), z.object({
    purpose: req(160),
    action: req(600),
    framing,
    cameraMove,
    durationSeconds: looseNumber.pipe(z.number().min(2).max(15)),
    characterNames: strs(60, 6),
    dialogueLineIndexes: looseArray(int(0, 999), { max: 6 }).optional(),
    transition,
    continuity: z.preprocess((v) => v ?? {}, ContinuitySchema),
    prompt: str(1600).optional(),
  })), { min: 1, max: 14 }),
}));
export type ShotPlanOut = z.infer<typeof ShotPlanSchema>;

export const PerformancePlanSchema = z.object({
  sections: looseArray(z.preprocess(aliases({ sectionId: ['id', 'section'], singerNames: ['singers', 'performers'] }), z.object({ sectionId: looseString, mode: looseEnum(['SOLO', 'DUET', 'ALTERNATING', 'ENSEMBLE', 'LISTENER', 'INSTRUMENTAL'], MODE_SYNONYMS), singerNames: strs(60, 6), lines: looseArray(z.preprocess(aliases({ singerName: ['singer', 'name', 'who'] }), z.object({ singerName: str(60), text: str(300) })), { max: 24 }).optional() })), { min: 1 }),
});

// ------------------------------------------------------------- character design when the look is a reference picture

/** The written look of a character: what a sheet describes in words and a reference picture shows. */
export const LOOK_FIELDS = ['build', 'face', 'hair', 'skin', 'eyes', 'wardrobe'] as const;
export type LookField = (typeof LOOK_FIELDS)[number];

/** The line the CREATE_CHARACTER orchestrator puts at the head of the design brief in REFERENCE mode (it reaches
 *  `designCharacter` through the DESIGN_CHARACTER job's brief). The story model is text-only and no vision model is
 *  installed: it never sees the picture, so it designs who the character is and none of how they look. */
export const REFERENCE_LOOK_BRIEF = 'LOOK FROM THE REFERENCE PICTURE: the face, hair, skin, eyes, build and wardrobe are those of the person in the producer’s picture, which the designer cannot see.';
export const isReferenceLookBrief = (brief: string | undefined): boolean => Boolean(brief?.includes(REFERENCE_LOOK_BRIEF));

/** What a text-only designer may fill for a character whose look is a picture it cannot see: identity, role,
 *  personality and the voice description — no look field and no visible mark. */
export const CharacterDesignFromReferenceSchema = z.object({
  name: z.string().min(1).max(80), nameAr: z.string().max(80).optional(), role: z.string().min(1).max(120),
  sex: z.enum(['FEMALE', 'MALE']), ageYears: z.number().int().min(1).max(120), species: z.string().max(60).optional(),
  personality: z.string().min(2).max(400),
  voice: z.object({ pitch: z.enum(['LOW', 'MID', 'HIGH']), pace: z.enum(['SLOW', 'MEASURED', 'QUICK']), timbre: z.string().max(120), notes: z.string().max(200).optional() }).optional(),
});
