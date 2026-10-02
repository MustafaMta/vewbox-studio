import { z } from 'zod';
import { CAMERA_MOVES, FRAMINGS, TIMES_OF_DAY, TRANSITIONS } from '@/domain/vocabulary';

/** WHAT THE STORY ENGINE MUST RETURN — strict shapes the language model fills in. Validation failures go back to the
 *  model once or twice with the exact problem before the job fails. */

const str = (max = 400) => z.string().trim().max(max);
const lines = z.array(z.object({ characterName: str(80), text: str(600), textAr: str(600).optional(), delivery: str(120).optional() })).max(16);

export const ProposalSchema = z.object({
  title: str(80).min(1),
  titleAr: str(80).optional(),
  logline: str(240).min(1),
  premise: str(1600).min(20),
  genre: str(60).min(1),
  mood: str(80).min(1),
  structure: z.array(z.object({ title: str(80).min(1), summary: str(400).min(1) })).min(2).max(8),
  cast: z.array(z.object({ existingCharacterId: z.string().optional(), name: str(60).min(1), role: str(120).min(1), reason: str(240).min(1), sex: z.enum(['FEMALE', 'MALE']).optional(), ageYears: z.number().int().min(1).max(120).optional(), appearance: str(400).optional(), personality: str(400).optional() })).min(1).max(8),
  locations: z.array(z.object({ existingLocationId: z.string().optional(), name: str(60).min(1), description: str(400).min(1), kind: z.enum(['INTERIOR', 'EXTERIOR']).optional() })).min(1).max(6),
  song: z.object({ title: str(80), caption: str(300), lyrics: z.string().trim().max(4000) }).optional(),
});
export type ProposalOut = z.infer<typeof ProposalSchema>;

export const CharacterDesignSchema = z.object({
  build: str(160), face: str(300), hair: str(160), skin: str(80), eyes: str(80), distinguishing: z.array(str(80)).max(6), wardrobe: str(300), personality: str(400), ageYears: z.number().int().min(1).max(120).optional(), sex: z.enum(['FEMALE', 'MALE']).optional(), nameAr: str(60).optional(),
  canon: z.object({ heightCm: z.number().int().min(30).max(250).optional(), accessories: z.array(str(80)).max(6).optional(), visualRestrictions: z.array(str(120)).max(6).optional(), agePresentation: str(80).optional(), speech: str(200).optional() }).optional(),
});

export const LocationDesignSchema = z.object({
  description: str(600), kind: z.enum(['INTERIOR', 'EXTERIOR']), landmarks: z.array(str(120)).max(8), props: z.array(str(80)).max(10), lighting: z.array(z.enum(TIMES_OF_DAY)).min(1).max(4), nameAr: str(60).optional(),
  layout: z.object({ geography: str(300).optional(), architecture: str(300).optional(), materials: z.array(str(60)).max(8).optional(), cameraZones: z.array(str(120)).max(6).optional(), entrances: z.array(str(80)).max(4).optional(), spatial: str(400).optional() }).optional(),
});

export const DevelopSchema = z.object({
  logline: str(240).min(1),
  synopsis: str(2400).min(40),
  genre: str(60).optional(),
  mood: str(80).optional(),
  titleAr: str(80).optional(),
  newCharacters: z.array(z.object({ name: str(60).min(1), role: str(120), sex: z.enum(['FEMALE', 'MALE']), design: CharacterDesignSchema })).max(6),
  newLocations: z.array(z.object({ name: str(60).min(1), design: LocationDesignSchema })).max(5),
  scenes: z.array(z.object({ title: str(80).min(1), locationName: str(60), timeOfDay: z.enum(TIMES_OF_DAY), characterNames: z.array(str(60)).max(8), purpose: str(300), emotionalObjective: str(200), entryState: str(300), exitState: str(300), targetSeconds: z.number().int().min(5).max(900) })).min(1).max(24),
});

export const ScriptSceneSchema = z.object({
  sceneId: z.string(),
  beats: z.array(z.object({ action: str(600).min(1), lines })).min(1).max(12),
});
export const ScriptSchema = z.object({ scenes: z.array(ScriptSceneSchema).min(1) });

export const ContinuitySchema = z.object({
  characters: z.array(z.object({ characterName: str(60), wardrobe: str(160).optional(), pose: str(160).optional(), position: str(120).optional(), screenDirection: z.enum(['LEFT', 'RIGHT', 'TOWARD', 'AWAY', 'NEUTRAL']).optional(), eyeline: str(120).optional(), emotion: str(80).optional(), holding: z.array(str(60)).max(4).optional() })).max(8),
  props: z.array(z.object({ name: str(60), ownerCharacterName: str(60).optional(), state: str(120).optional(), position: str(120).optional() })).max(10),
  environment: z.object({ timeOfDay: z.enum(TIMES_OF_DAY).optional(), weather: str(80).optional(), lighting: str(200).optional(), state: str(200).optional() }),
  camera: z.object({ lensIntent: str(120).optional(), angle: str(120).optional() }),
  relationToPrevious: z.enum(['CONTINUATION', 'CUT', 'STORY_TRANSITION']),
  notes: str(300).optional(),
});

export const ShotPlanSchema = z.object({
  shots: z.array(z.object({
    purpose: str(160).min(1),
    action: str(600).min(1),
    framing: z.enum(FRAMINGS),
    cameraMove: z.enum(CAMERA_MOVES),
    durationSeconds: z.number().min(2).max(15),
    characterNames: z.array(str(60)).max(6),
    dialogueLineIndexes: z.array(z.number().int().min(0)).max(6).optional(),
    transition: z.enum(TRANSITIONS),
    continuity: ContinuitySchema,
    prompt: str(1600).min(20),
  })).min(1).max(14),
});
export type ShotPlanOut = z.infer<typeof ShotPlanSchema>;

export const PerformancePlanSchema = z.object({
  sections: z.array(z.object({ sectionId: z.string(), mode: z.enum(['SOLO', 'DUET', 'ALTERNATING', 'ENSEMBLE', 'LISTENER', 'INSTRUMENTAL']), singerNames: z.array(str(60)).max(6), lines: z.array(z.object({ singerName: str(60), text: str(300) })).max(24).optional() })).min(1),
});
