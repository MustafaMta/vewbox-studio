import { z } from 'zod';
import { DIALECTS, LANGUAGES, STYLES } from './vocabulary';

/** PRODUCTION JOBS — the durable work the studio does: writing, drawing, generating video, voices, songs, assembling
 *  and exporting. A job is a row in the database; the worker claims it, reports progress, and writes its results
 *  back as studio commands. The browser never waits on a request for a job to finish. */

export const JOB_TYPES = [
  'AUTO_IDEA',          // propose a show / episode / short / music video
  'DEVELOP_STORY',      // brief → concept, cast, places, synopsis
  'WRITE_SCRIPT',       // synopsis → scenes, beats, lines
  'PLAN_SHOTS',         // scenes → shots with continuity
  'CHARACTER_APPEARANCE', // description (+ reference) → portrait
  'CHARACTER_REFS',     // optional secondary material on request (expressions, outfits); never part of creation
  'LOCATION_PLATES',    // description → master plate + views
  'AMBIENCE',           // a place (+ the time and weather its scenes play in) → its ambience bed (MOSS-SoundEffect v2)
  'SHOT_FRAMES',        // shot + refs → opening (and ending) frame
  'GENERATE_TAKE',      // shot → MiniMax video → validated take
  'CORRECT_LIPSYNC',    // a flagged, confirmed take → a NEW take with the mouth redrawn to the authoritative audio (never generates video)
  'VOICE_BUILD',        // character → voice identity + sample
  'VOICE_PREVIEW',      // character + text → one line of speech
  'DIALOGUE_AUDIO',     // production → every line spoken
  'WRITE_SONG',         // production + its singers → the song plan: concept, structure, lyrics, tempo, key, who sings what (the planner)
  'GENERATE_SONG',      // the song plan → ONE authoritative recording (ACE-Step 1.5 XL-SFT)
  'CHECK_SONG',         // the recording → checked again (level trim, timing, stems, lyrics placed, song check); never composes
  'ASSEMBLE',           // chosen takes + sound → assembled cut
  'EXPORT',             // assembled cut → export file
  'PRODUCE',            // orchestrate: frames → takes for every shot without a chosen take
  'MEDIA_PROBE',        // validate an uploaded file
  'EPISODE_CONTINUITY', // a finished episode → the show's timeline, relationships and open storylines (Continuity Writer)
  'DESIGN_CHARACTER',   // a one-line brief → a fully designed character record (Casting)
  'CREATE_CHARACTER',   // orchestrate: design (when fields are missing) → the canonical image → voice (Casting Director)
  'VOICE_DESIGN',       // character + description → 3 designed candidate voices, measured and previewed through the line engine
  // the research-driven Auto Idea (docs/CONTRACTS-AUTO-IDEA.md): AUTO_IDEA orchestrates these child jobs
  'IDEA_RESEARCH',      // Trend Research Agent: plan topics, query permitted sources (cached), record evidence + coverage
  'IDEA_AUDIENCE',      // Audience Research Agent: evidence → storytelling patterns (measured vs interpreted)
  'IDEA_CONCEPTS',      // Creative Concept Agent: patterns + continuity → original concepts, originality check, choice
  'IDEA_WRITE',         // Screenwriter: chosen concept → the full proposal, by the format's strategy (or the one revision)
  'IDEA_REVIEW',        // Story Editor / Audience Experience Agent: rubric review of the draft
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
  /** an orchestrator between its passes, waiting for the jobs it queued (step 14): its status reads GENERATING */
  waiting?: boolean;
  /** how often its children woke it (a wake is not an attempt) */
  wakes?: number;
  /** an orchestrator's plan, kept between its passes */
  plan?: Record<string, unknown>;
}

export interface JobEvent { id: number; jobId: string; at: string; level: 'info' | 'warn' | 'error'; message: string; data?: Record<string, unknown> }

// ---------------------------------------------------------------------------------------------------- payloads

const id = z.string().min(1).max(80);
const style = z.enum(STYLES); const language = z.enum(LANGUAGES); const dialect = z.enum(DIALECTS);
const ideaPreferences = z.object({
  style: style.optional(), language: language.optional(), dialect: dialect.optional(),
  durationSeconds: z.number().int().positive().max(3600).optional(), mood: z.string().max(200).optional(), castIds: z.array(id).max(12).optional(), locationIds: z.array(id).max(12).optional(),
  concept: z.enum(['PERFORMANCE', 'NARRATIVE', 'MIXED']).optional(),
  genre: z.string().max(80).optional(), audience: z.string().max(200).optional(), direction: z.string().max(2000).optional(),
  /** AUTO: research when Settings allow it; OFF: an explicitly original concept, no research. */
  research: z.enum(['AUTO', 'OFF']).optional(),
}).strict();

const ideaRef = { ideaJobId: id };
const ideaKind = z.enum(['SHOW', 'SEASON', 'EPISODE', 'SHORT', 'MUSIC_VIDEO']);

/** A partial CharacterProfileInput (diagnosis §3.1) as a job may carry it; the command schema validates the whole. */
const characterProfilePartial = z.object({
  name: z.string().trim().min(1).max(80).optional(), nameAr: z.string().max(80).optional(), role: z.string().max(200).optional(),
  kind: z.enum(['ACTOR', 'SINGER', 'ACTOR_SINGER']).optional(),
  singing: z.object({ voiceType: z.enum(['SOPRANO', 'MEZZO_SOPRANO', 'ALTO', 'TENOR', 'BARITONE', 'BASS']).optional(), styles: z.array(z.string().max(40)).max(6).default([]), languages: z.array(language).max(2).default([]), notes: z.string().max(400).optional() }).optional(),
  style: style.optional(), sex: z.enum(['FEMALE', 'MALE']).optional(), species: z.string().max(60).optional(), ageYears: z.number().int().min(1).max(120).optional(),
  build: z.string().max(400).optional(), face: z.string().max(400).optional(), hair: z.string().max(400).optional(), skin: z.string().max(400).optional(), eyes: z.string().max(400).optional(), wardrobe: z.string().max(400).optional(), personality: z.string().max(400).optional(),
  distinguishing: z.array(z.string().max(120)).max(6).optional(), language: language.optional(), dialect: dialect.optional(),
  canon: z.object({ heightCm: z.number().positive().max(400).optional(), accessories: z.array(z.string().max(120)).max(12).optional(), visualRestrictions: z.array(z.string().max(200)).max(12).optional(), agePresentation: z.string().max(200).optional(), speech: z.string().max(400).optional() }).optional(),
  notes: z.string().max(4000).optional(),
  voice: z.object({ pitch: z.enum(['LOW', 'MID', 'HIGH']).optional(), pace: z.enum(['SLOW', 'MEASURED', 'QUICK']).optional(), timbre: z.string().max(200).optional(), notes: z.string().max(400).optional() }).optional(),
});
export type CharacterProfilePartial = z.infer<typeof characterProfilePartial>;

/** The look fields a designed character must have; a profile missing any of them is completed by Casting. */
export const DESIGN_FIELDS = ['role', 'sex', 'ageYears', 'build', 'face', 'hair', 'skin', 'eyes', 'wardrobe', 'personality'] as const;
export const profileNeedsDesign = (p: CharacterProfilePartial | undefined): boolean => !p || DESIGN_FIELDS.some((k) => p[k] === undefined || p[k] === '');

export const JOB_PAYLOADS = {
  AUTO_IDEA: z.object({ kind: z.enum(['SHOW', 'SEASON', 'EPISODE', 'SHORT', 'MUSIC_VIDEO']), showId: id.optional(), seasonId: id.optional(), preferences: ideaPreferences, brief: z.string().max(4000).optional(), /** fetch the research again instead of reusing the cache */ refresh: z.boolean().optional() }),
  DEVELOP_STORY: z.object({ productionId: id }),
  WRITE_SCRIPT: z.object({ productionId: id, sceneIds: z.array(id).optional() }),
  PLAN_SHOTS: z.object({ productionId: id, sceneIds: z.array(id).optional(), force: z.boolean().optional(), /** music video: redo only the singing assignment and copy it onto the existing shots */ performanceOnly: z.boolean().optional() }),
  CHARACTER_APPEARANCE: z.object({ characterId: id }),
  CHARACTER_REFS: z.object({ characterId: id, roles: z.array(z.string()).optional() }),
  LOCATION_PLATES: z.object({ locationId: id, timesOfDay: z.array(z.string()).optional(), /** draw a fresh master plate even when one exists (the old plates stay as assets) */ force: z.boolean().optional() }),
  /** the place's ambience bed: productionId names the scenes whose time and weather it is made for (absent: the place's own lighting); orce makes a new bed when it has one (the old recording stays in the library) */
  AMBIENCE: z.object({ locationId: id, productionId: id.optional(), force: z.boolean().optional() }),
  SHOT_FRAMES: z.object({ productionId: id, shotId: id, ending: z.boolean().optional() }),
  GENERATE_TAKE: z.object({ productionId: id, shotId: id, model: z.string().optional(), resolution: z.string().optional(), durationSeconds: z.number().int().optional(), prompt: z.string().max(4000).optional(), seed: z.number().int().optional(), /** make the new take the shot's choice when it passes its checks, replacing the current one (a re-record the producer asked for) */ select: z.boolean().optional(), /** the quality tier asked for (docs/CONTRACTS-REDESIGN-BACKEND.md B6). The take records the tier it was really made at in `params.quality`; today every take is `final` (local MiniMax H3 has one path), and a `draft` request is kept as `params.qualityRequested`. */ quality: z.enum(['draft', 'final']).optional() }),
  /** src/domain/lipsync-correction.ts: the producer confirms the correction of ONE take and says what the visual review
   *  found; the result is a new take of the shot beside the original (`derivedFrom`), chosen only with `select` and only
   *  when it passes its acceptance checks. `steps`/`guidance`/`seed`: the corrector's own parameters (defaults: its
   *  evaluated values). */
  CORRECT_LIPSYNC: z.object({ productionId: id, shotId: id, takeId: id, confirm: z.literal(true), reason: z.string().trim().min(3).max(1000), select: z.boolean().optional(), steps: z.number().int().min(5).max(60).optional(), guidance: z.number().min(1).max(3).optional(), seed: z.number().int().min(0).max(2 ** 31 - 1).optional() }),
  /** docs/CONTRACTS-VOICE-IDENTITY-V2.md §2. REFERENCE clones from that validated, consented upload. AUTOMATIC: a
   *  consented recording when there is one, otherwise EN/MSA are designed from the profile (VOICE_DESIGN's pipeline in
   *  the same job → gates → line-engine previews → pick) and Iraqi is refused MISSING_REFERENCE (the experiment switch
   *  `allowDesignedIraqi` aside). DESIGN pins the producer's chosen candidate of a design record. MANUAL is a hosted
   *  catalogue voice (NOT_CONFIGURED without a key). The enqueue path derives the key `VOICE_BUILD:${characterId}:${revision}`. */
  VOICE_BUILD: z.object({ characterId: id, mode: z.enum(['REFERENCE', 'AUTOMATIC', 'MANUAL', 'DESIGN']).default('AUTOMATIC'), referenceSampleId: id.optional(), provider: z.enum(['LOCAL_TTS', 'MINIMAX']).optional(), providerVoiceId: z.string().max(200).optional(), designId: id.optional(), candidate: z.number().int().min(1).max(3).optional() })
    .refine((p) => p.mode !== 'REFERENCE' || Boolean(p.referenceSampleId), { message: 'REFERENCE mode needs referenceSampleId', path: ['referenceSampleId'] })
    .refine((p) => p.mode !== 'MANUAL' || Boolean(p.providerVoiceId), { message: 'MANUAL mode needs providerVoiceId', path: ['providerVoiceId'] })
    .refine((p) => p.mode !== 'DESIGN' || (Boolean(p.designId) && p.candidate !== undefined), { message: 'DESIGN mode needs designId and candidate', path: ['designId'] }),
  /** Manual design (contract v2 §2 DESIGN): the producer's description (absent: written from the profile) → three
   *  candidates speaking the calibration sentence, each measured (CER, loudness, true peak, clipping, ≤ 11.5 s) and
   *  heard through the line engine; the producer then builds with VOICE_BUILD { mode: 'DESIGN', designId, candidate }. */
  VOICE_DESIGN: z.object({ characterId: id, description: z.string().trim().min(3).max(300).optional(), text: z.string().trim().min(10).max(400).optional(), seed: z.number().int().min(0).max(2 ** 31 - 4).optional(), n: z.number().int().min(1).max(1).optional() }),
  VOICE_PREVIEW: z.object({ characterId: id, text: z.string().min(1).max(600), language: language.optional(), emotion: z.string().optional() }),
  /** `lineIds`: only these lines (targeted regeneration, step 14) — recorded again even when their recording is current */
  DIALOGUE_AUDIO: z.object({ productionId: id, shotIds: z.array(id).optional(), lineIds: z.array(id).max(200).optional(), force: z.boolean().optional() }),
  WRITE_SONG: z.object({ productionId: id, brief: z.string().trim().max(2000).optional(), singerIds: z.array(id).max(4).optional() }),
  GENERATE_SONG: z.object({ productionId: id, instrumental: z.boolean().optional() }),
  CHECK_SONG: z.object({ productionId: id }),
  ASSEMBLE: z.object({ productionId: id, /** assemble a stale continuation join anyway (as a hard cut) */ allowStaleJoins: z.boolean().optional() }),
  EXPORT: z.object({ productionId: id, format: z.enum(['mp4-h264', 'mp4-h265', 'mov-prores']), resolution: z.enum(['720', '1080', '2160']), subtitles: z.enum(['none', 'ar', 'en', 'both']), /** end the export on a credit card listing the AI engines (the container metadata always discloses them) */ credits: z.boolean().optional() }),
  PRODUCE: z.object({ productionId: id, shotIds: z.array(id).optional(), framesOnly: z.boolean().optional(), /** re-record the speaking shots whose chosen take was never verified against the script (older pipeline) or failed; the new take replaces the choice when it passes */ respeak: z.boolean().optional() }),
  MEDIA_PROBE: z.object({ assetId: id }),
  EPISODE_CONTINUITY: z.object({ productionId: id }),
  /** A brief, a name alone, or a partial written profile to complete: Casting fills every missing field. */
  DESIGN_CHARACTER: z.object({ brief: z.string().max(2000).optional(), name: z.string().max(80).optional(), profile: characterProfilePartial.optional(), style: style.optional(), language: language.optional(), dialect: dialect.optional(), /** the production or show the character is for (its world is the context) */ productionId: id.optional(), showId: id.optional() })
    .refine((p) => Boolean(p.brief?.trim() || p.name?.trim() || p.profile?.name?.trim()), { message: 'a brief, a name or a profile with a name is required', path: ['brief'] }),
  /** Contract §1.1: one orchestrating job for the three starts of the character page. */
  CREATE_CHARACTER: z.object({
    mode: z.enum(['AUTO', 'MANUAL', 'REFERENCE']),
    name: z.string().max(80).optional(), brief: z.string().max(2000).optional(),
    profile: characterProfilePartial.optional(),
    referenceAssetId: id.optional(),
    style: style.optional(), language: language.optional(), dialect: dialect.optional(), productionId: id.optional(), showId: id.optional(),
    voice: z.object({ mode: z.enum(['NONE', 'REFERENCE', 'AUTOMATIC']), referenceSampleId: id.optional() }).optional(),
    draw: z.boolean().optional(),
  })
    .refine((p) => p.mode !== 'AUTO' || Boolean(p.brief?.trim() || p.name?.trim()), { message: 'AUTO needs a brief or a name', path: ['brief'] })
    .refine((p) => p.mode === 'AUTO' || Boolean(p.profile?.name?.trim() || p.name?.trim()), { message: 'a name is required', path: ['profile', 'name'] })
    .refine((p) => p.mode !== 'REFERENCE' || Boolean(p.referenceAssetId), { message: 'REFERENCE needs referenceAssetId', path: ['referenceAssetId'] }),
  /** Child jobs of an AUTO_IDEA (parentId = ideaJobId). Each reads the earlier stages' artifacts by id and writes its
   *  own; the request itself is read from the parent job's payload. */
  IDEA_RESEARCH: z.object({ ...ideaRef, kind: ideaKind, /** bypass the cache (the producer asked for fresh research) */ refresh: z.boolean().optional() }),
  IDEA_AUDIENCE: z.object({ ...ideaRef, researchArtifactId: id }),
  IDEA_CONCEPTS: z.object({ ...ideaRef, audienceArtifactId: id }),
  IDEA_WRITE: z.object({ ...ideaRef, conceptsArtifactId: id, /** a revision: the draft to revise and the reviews it answers */ draftArtifactId: id.optional(), reviewArtifactIds: z.array(id).max(4).optional() }),
  /** `audienceExperience` is derived from the reviewer (never sent): the payload route that runs the review as the
   *  Audience Experience Agent instead of the Story Editor (src/server/org/model.ts agentIdForJob). */
  IDEA_REVIEW: z.object({ ...ideaRef, draftArtifactId: id, reviewer: z.enum(['STORY_EDITOR', 'AUDIENCE_EXPERIENCE']) })
    .transform((p) => ({ ...p, audienceExperience: p.reviewer === 'AUDIENCE_EXPERIENCE' ? true as const : undefined })),
} satisfies Record<JobType, z.ZodTypeAny>;

/** What a client sends (defaults may be left out). */
export type JobPayload<T extends JobType> = z.input<(typeof JOB_PAYLOADS)[T]>;
/** What the queue stored after validation (defaults filled): the shape a handler reads. */
export type JobPayloadParsed<T extends JobType> = z.output<(typeof JOB_PAYLOADS)[T]>;

/** Which jobs want the local GPU (the worker serialises them against a VRAM budget) and which call a hosted service. */
export const JOB_RESOURCE: Record<JobType, 'GPU' | 'HOSTED' | 'CPU' | 'LLM'> = {
  AUTO_IDEA: 'LLM', DEVELOP_STORY: 'LLM', WRITE_SCRIPT: 'LLM', PLAN_SHOTS: 'LLM', WRITE_SONG: 'LLM',
  CHARACTER_APPEARANCE: 'GPU', CHARACTER_REFS: 'GPU', LOCATION_PLATES: 'GPU', AMBIENCE: 'GPU', SHOT_FRAMES: 'GPU', VOICE_BUILD: 'GPU', VOICE_PREVIEW: 'GPU', DIALOGUE_AUDIO: 'GPU', CHECK_SONG: 'GPU',
  GENERATE_TAKE: 'HOSTED', GENERATE_SONG: 'HOSTED',
  ASSEMBLE: 'CPU', EXPORT: 'CPU', PRODUCE: 'CPU', MEDIA_PROBE: 'CPU',
  EPISODE_CONTINUITY: 'LLM', DESIGN_CHARACTER: 'LLM', CREATE_CHARACTER: 'CPU',
  VOICE_DESIGN: 'GPU', CORRECT_LIPSYNC: 'GPU',
  // research calls hosted public APIs (network, no GPU); the stages after it are language-model calls
  IDEA_RESEARCH: 'HOSTED', IDEA_AUDIENCE: 'LLM', IDEA_CONCEPTS: 'LLM', IDEA_WRITE: 'LLM', IDEA_REVIEW: 'LLM',
};

/** Readable names of the job types (the activity page, run lists, the worker's log lines). */
export const JOB_LABELS: Record<JobType, string> = {
  AUTO_IDEA: 'Propose an idea',
  DEVELOP_STORY: 'Develop the story',
  WRITE_SCRIPT: 'Write the script',
  PLAN_SHOTS: 'Plan the shots',
  CHARACTER_APPEARANCE: 'Draw the character image',
  CHARACTER_REFS: 'Secondary material (optional)',
  LOCATION_PLATES: 'Location plates',
  AMBIENCE: 'Make the ambience',
  SHOT_FRAMES: 'Prepare frames',
  GENERATE_TAKE: 'Generate video',
  CORRECT_LIPSYNC: 'Correct the lip-sync of a take',
  VOICE_BUILD: 'Build the voice',
  VOICE_PREVIEW: 'Voice preview',
  DIALOGUE_AUDIO: 'Record the dialogue',
  WRITE_SONG: 'Write the song',
  GENERATE_SONG: 'Generate the song',
  CHECK_SONG: 'Check the recording again',
  ASSEMBLE: 'Assemble the cut',
  EXPORT: 'Export',
  PRODUCE: 'Produce',
  MEDIA_PROBE: 'Check a file',
  EPISODE_CONTINUITY: 'Record the episode in the story bible',
  DESIGN_CHARACTER: 'Design a character',
  CREATE_CHARACTER: 'Create a character',
  VOICE_DESIGN: 'Design a voice',
  IDEA_RESEARCH: 'Research entertainment trends',
  IDEA_AUDIENCE: 'Analyse the audience',
  IDEA_CONCEPTS: 'Develop concepts',
  IDEA_WRITE: 'Write the story',
  IDEA_REVIEW: 'Review the story',
};

/** The steps of CREATE_CHARACTER and what each one reported (contract §1.1). */
/** The chain's steps (contract v2): 'appearance' is the canonical-image step. Results stored by the wave-2 chain may
 *  still name a 'sheet' step; the page drops it (components/character/contract.ts normaliseStep). */
export type CreateCharacterStep = 'design' | 'appearance' | 'voice';
export interface CreateCharacterStepOutcome { step: CreateCharacterStep; status: 'done' | 'skipped' | 'failed'; jobId?: string; reason?: string; failureClass?: string }
export interface CreateCharacterResult { characterId: string; steps: CreateCharacterStepOutcome[] }
