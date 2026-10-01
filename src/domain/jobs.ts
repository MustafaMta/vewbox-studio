import { z } from 'zod';

/** PRODUCTION JOBS — the durable work the studio does: writing, drawing, generating video, voices, songs, assembling
 *  and exporting. A job is a row in the database; the worker claims it, reports progress, and writes its results
 *  back as studio commands. The browser never waits on a request for a job to finish. */

export const JOB_TYPES = [
  'AUTO_IDEA',          // propose a show / episode / short / music video
  'DEVELOP_STORY',      // brief → concept, cast, places, synopsis
  'WRITE_SCRIPT',       // synopsis → scenes, beats, lines
  'PLAN_SHOTS',         // scenes → shots with continuity
  'CHARACTER_APPEARANCE', // description (+ reference) → portrait
  'CHARACTER_REFS',     // portrait → reference pack
  'LOCATION_PLATES',    // description → master plate + views
  'SHOT_FRAMES',        // shot + refs → opening (and ending) frame
  'GENERATE_TAKE',      // shot → MiniMax video → validated take
  'VOICE_BUILD',        // character → voice identity + sample
  'VOICE_PREVIEW',      // character + text → one line of speech
  'DIALOGUE_AUDIO',     // production → every line spoken
  'GENERATE_SONG',      // music video → song (MiniMax music)
  'ASSEMBLE',           // chosen takes + sound → assembled cut
  'EXPORT',             // assembled cut → export file
  'PRODUCE',            // orchestrate: frames → takes for every shot without a chosen take
  'MEDIA_PROBE',        // validate an uploaded file
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = ['QUEUED', 'PREPARING', 'GENERATING', 'DOWNLOADING', 'VALIDATING', 'POSTPROCESSING', 'AWAITING_REVIEW', 'COMPLETED', 'FAILED', 'CANCELLED'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const ACTIVE_STATUSES: readonly JobStatus[] = ['QUEUED', 'PREPARING', 'GENERATING', 'DOWNLOADING', 'VALIDATING', 'POSTPROCESSING'];
export const isActiveStatus = (s: JobStatus) => ACTIVE_STATUSES.includes(s);
export const isTerminalStatus = (s: JobStatus) => s === 'COMPLETED' || s === 'FAILED' || s === 'CANCELLED';

export interface JobProgress { phase?: string; message?: string; step?: number; total?: number; /** Only when genuinely knowable; never invented for an opaque provider step. */ percent?: number | null; providerStatus?: string }
export interface JobError { code: string; message: string; retryable?: boolean; details?: Record<string, unknown> }

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  priority: number;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  progress?: JobProgress;
  error?: JobError;
  attempts: number;
  maxAttempts: number;
  runAfter?: string;
  startedAt?: string;
  finishedAt?: string;
  heartbeatAt?: string;
  cancelRequested: boolean;
  providerTaskId?: string;
  parentId?: string;
  productionId?: string;
  sceneId?: string;
  shotId?: string;
  takeId?: string;
  characterId?: string;
  locationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobEvent { id: number; jobId: string; at: string; level: 'info' | 'warn' | 'error'; message: string; data?: Record<string, unknown> }

// ---------------------------------------------------------------------------------------------------- payloads

const id = z.string().min(1).max(80);
const ideaPreferences = z.object({
  style: z.enum(['CARTOON', 'ANIME', 'REALISTIC']).optional(), language: z.enum(['EN', 'AR']).optional(), dialect: z.string().optional(),
  durationSeconds: z.number().int().positive().max(3600).optional(), mood: z.string().max(200).optional(), castIds: z.array(id).max(12).optional(), locationIds: z.array(id).max(12).optional(),
  concept: z.enum(['PERFORMANCE', 'NARRATIVE', 'MIXED']).optional(),
}).strict();

export const JOB_PAYLOADS = {
  AUTO_IDEA: z.object({ kind: z.enum(['SHOW', 'EPISODE', 'SHORT', 'MUSIC_VIDEO']), showId: id.optional(), seasonId: id.optional(), preferences: ideaPreferences, brief: z.string().max(4000).optional() }),
  DEVELOP_STORY: z.object({ productionId: id }),
  WRITE_SCRIPT: z.object({ productionId: id, sceneIds: z.array(id).optional() }),
  PLAN_SHOTS: z.object({ productionId: id, sceneIds: z.array(id).optional(), force: z.boolean().optional() }),
  CHARACTER_APPEARANCE: z.object({ characterId: id }),
  CHARACTER_REFS: z.object({ characterId: id, roles: z.array(z.string()).optional() }),
  LOCATION_PLATES: z.object({ locationId: id, timesOfDay: z.array(z.string()).optional() }),
  SHOT_FRAMES: z.object({ productionId: id, shotId: id, ending: z.boolean().optional() }),
  GENERATE_TAKE: z.object({ productionId: id, shotId: id, model: z.string().optional(), resolution: z.string().optional(), durationSeconds: z.number().int().optional(), prompt: z.string().max(4000).optional(), seed: z.number().int().optional() }),
  VOICE_BUILD: z.object({ characterId: id, referenceAssetId: id.optional(), provider: z.enum(['LOCAL_TTS', 'MINIMAX']).optional() }),
  VOICE_PREVIEW: z.object({ characterId: id, text: z.string().min(1).max(600), language: z.enum(['EN', 'AR']).optional(), emotion: z.string().optional() }),
  DIALOGUE_AUDIO: z.object({ productionId: id, shotIds: z.array(id).optional(), force: z.boolean().optional() }),
  GENERATE_SONG: z.object({ productionId: id, instrumental: z.boolean().optional() }),
  ASSEMBLE: z.object({ productionId: id }),
  EXPORT: z.object({ productionId: id, format: z.enum(['mp4-h264', 'mp4-h265', 'mov-prores']), resolution: z.enum(['720', '1080', '2160']), subtitles: z.enum(['none', 'ar', 'en', 'both']) }),
  PRODUCE: z.object({ productionId: id, shotIds: z.array(id).optional(), framesOnly: z.boolean().optional() }),
  MEDIA_PROBE: z.object({ assetId: id }),
} satisfies Record<JobType, z.ZodTypeAny>;

export type JobPayload<T extends JobType> = z.infer<(typeof JOB_PAYLOADS)[T]>;

/** Which jobs want the local GPU (the worker serialises them against a VRAM budget) and which call a hosted service. */
export const JOB_RESOURCE: Record<JobType, 'GPU' | 'HOSTED' | 'CPU' | 'LLM'> = {
  AUTO_IDEA: 'LLM', DEVELOP_STORY: 'LLM', WRITE_SCRIPT: 'LLM', PLAN_SHOTS: 'LLM',
  CHARACTER_APPEARANCE: 'GPU', CHARACTER_REFS: 'GPU', LOCATION_PLATES: 'GPU', SHOT_FRAMES: 'GPU', VOICE_BUILD: 'GPU', VOICE_PREVIEW: 'GPU', DIALOGUE_AUDIO: 'GPU',
  GENERATE_TAKE: 'HOSTED', GENERATE_SONG: 'HOSTED',
  ASSEMBLE: 'CPU', EXPORT: 'CPU', PRODUCE: 'CPU', MEDIA_PROBE: 'CPU',
};

/** Readable names for the activity page. */
export const JOB_LABELS: Record<JobType, { en: string; ar: string }> = {
  AUTO_IDEA: { en: 'Propose an idea', ar: 'اقتراح فكرة' },
  DEVELOP_STORY: { en: 'Develop the story', ar: 'تطوير القصة' },
  WRITE_SCRIPT: { en: 'Write the script', ar: 'كتابة السيناريو' },
  PLAN_SHOTS: { en: 'Plan the shots', ar: 'تخطيط اللقطات' },
  CHARACTER_APPEARANCE: { en: 'Draw the character', ar: 'رسم الشخصية' },
  CHARACTER_REFS: { en: 'Reference views', ar: 'المشاهد المرجعية' },
  LOCATION_PLATES: { en: 'Location plates', ar: 'لوحات الموقع' },
  SHOT_FRAMES: { en: 'Prepare frames', ar: 'تحضير الإطارات' },
  GENERATE_TAKE: { en: 'Generate video', ar: 'توليد الفيديو' },
  VOICE_BUILD: { en: 'Build the voice', ar: 'بناء الصوت' },
  VOICE_PREVIEW: { en: 'Voice preview', ar: 'معاينة الصوت' },
  DIALOGUE_AUDIO: { en: 'Record the dialogue', ar: 'تسجيل الحوار' },
  GENERATE_SONG: { en: 'Generate the song', ar: 'توليد الأغنية' },
  ASSEMBLE: { en: 'Assemble the cut', ar: 'تجميع المونتاج' },
  EXPORT: { en: 'Export', ar: 'تصدير' },
  PRODUCE: { en: 'Produce', ar: 'إنتاج' },
  MEDIA_PROBE: { en: 'Check a file', ar: 'فحص ملف' },
};
