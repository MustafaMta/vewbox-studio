import { z } from 'zod';
import { JOB_STATUSES, JOB_TYPES } from '@/domain/jobs';

/** TYPED TOOL CONTRACTS (docs/CONTRACTS-PHASE2-STUDIO.md R4) — for every registered tool, the input a call site
 *  passes (`ctx.tool(id, fn, { input })`) and the output the provider function really returns. The tool runner
 *  (tools.ts) validates the input before the call (WRONG_PARAMETERS on a mismatch) and the output after it
 *  (OUTPUT_CORRUPTION), and records either on the run's tool call. Every schema was written from its call sites and
 *  the provider code they call: precise on the fields the studio reads, loose objects (extra keys allowed) where a
 *  provider may add fields, never `any`. A schema that rejects what a working call returns is a bug. */

/** A number an ffmpeg/ffprobe measurement produced: NaN when the filter printed "-inf" or "N/A" (silence, a missing
 *  field) — the checks treat that as a failed measurement, so the contract must let it through. */
const metric = z.union([z.number(), z.nan()]);
const file = z.string().min(1);
const bytes = z.custom<Buffer>((v) => Buffer.isBuffer(v), 'a byte buffer');

// --------------------------------------------------------------------------------------- story.structured_answer

export const STORY_TASKS = ['proposal', 'continuity', 'character-design', 'develop', 'script', 'shot-plan', 'performance-plan'] as const;
export type StoryTask = (typeof STORY_TASKS)[number];

/** What the story handlers ask the model for (the engine function and the records it works on). */
export const StructuredAnswerInput = z.strictObject({
  task: z.enum(STORY_TASKS),
  productionId: z.string().min(1).optional(),
  showId: z.string().min(1).optional(),
  sceneIds: z.array(z.string().min(1)).optional(),
  /** AUTO_IDEA: what is proposed */
  kind: z.enum(['SHOW', 'SEASON', 'EPISODE', 'SHORT', 'MUSIC_VIDEO']).optional(),
});

const ProposalOut = z.looseObject({
  sample: z.boolean(), title: z.string().min(1), logline: z.string(), premise: z.string(), genre: z.string(), mood: z.string(),
  style: z.string(), language: z.string(), durationSeconds: z.number(),
  structure: z.array(z.looseObject({ title: z.string(), summary: z.string() })),
  cast: z.array(z.looseObject({ key: z.string(), name: z.string(), role: z.string(), isNew: z.boolean(), characterId: z.string().optional() })),
  locations: z.array(z.looseObject({ key: z.string(), name: z.string(), isNew: z.boolean(), locationId: z.string().optional() })),
  song: z.looseObject({ title: z.string(), caption: z.string(), lyrics: z.string() }).optional(),
});
const ContinuityOut = z.looseObject({ events: z.array(z.string()), unresolved: z.array(z.string()), relationships: z.array(z.string()).optional(), resolved: z.array(z.string()).optional() });
const CharacterDesignOut = z.looseObject({
  name: z.string().min(1), nameAr: z.string().optional(), role: z.string().min(1), sex: z.enum(['FEMALE', 'MALE']), ageYears: z.number().int(),
  build: z.string(), face: z.string(), hair: z.string(), skin: z.string(), eyes: z.string(), distinguishing: z.array(z.string()), wardrobe: z.string(), personality: z.string(),
  voice: z.looseObject({ pitch: z.enum(['LOW', 'MID', 'HIGH']), pace: z.enum(['SLOW', 'MEASURED', 'QUICK']), timbre: z.string() }).optional(),
});
const DevelopOut = z.looseObject({
  logline: z.string(), synopsis: z.string(),
  newCharacters: z.array(z.looseObject({ name: z.string(), role: z.string(), sex: z.enum(['FEMALE', 'MALE']), design: z.looseObject({ face: z.string() }) })),
  newLocations: z.array(z.looseObject({ name: z.string(), design: z.looseObject({ description: z.string() }) })),
  scenes: z.array(z.looseObject({ title: z.string(), locationName: z.string(), timeOfDay: z.string(), characterNames: z.array(z.string()) })).min(1),
});
const ScriptOut = z.looseObject({
  scenes: z.array(z.looseObject({ sceneId: z.string(), beats: z.array(z.looseObject({ action: z.string(), lines: z.array(z.looseObject({ characterName: z.string(), text: z.string(), textAr: z.string().optional(), delivery: z.string().optional() })) })) })),
});
const PlannedShotOut = z.looseObject({
  purpose: z.string(), action: z.string(), framing: z.string(), cameraMove: z.string(), durationSeconds: z.number().min(1).max(15),
  characterIds: z.array(z.string()),
  dialogue: z.array(z.looseObject({ id: z.string(), characterId: z.string(), text: z.string(), textAr: z.string().optional() })),
  transition: z.string(),
  continuity: z.looseObject({ characters: z.array(z.looseObject({ characterId: z.string() })), props: z.array(z.looseObject({ name: z.string() })), environment: z.looseObject({}), camera: z.looseObject({}), relationToPrevious: z.string() }),
  prompt: z.string(),
});
/** planShotsDraft: the scene's shots before the Shot Planner's timing fit, with the budget they are fitted to. */
const ShotPlanOut = z.looseObject({ shots: z.array(PlannedShotOut).min(1), budget: z.number().positive(), maxShot: z.number().positive() });
const PerformancePlanOut = z.array(z.looseObject({ sectionId: z.string(), mode: z.enum(['SOLO', 'DUET', 'ALTERNATING', 'ENSEMBLE', 'LISTENER', 'INSTRUMENTAL']), singerIds: z.array(z.string()), lines: z.array(z.looseObject({ singerId: z.string(), text: z.string() })).optional() }));

const STORY_OUTPUT: Record<StoryTask, z.ZodType> = { proposal: ProposalOut, continuity: ContinuityOut, 'character-design': CharacterDesignOut, develop: DevelopOut, script: ScriptOut, 'shot-plan': ShotPlanOut, 'performance-plan': PerformancePlanOut };
export const StructuredAnswerOutput = z.union([ProposalOut, ContinuityOut, CharacterDesignOut, DevelopOut, ScriptOut, ShotPlanOut, PerformancePlanOut]);

// ------------------------------------------------------------------------------------------------ ComfyUI graphs

/** image.generate / image.edit_with_references / image.describe_reference: the API-format graph that is submitted. */
export const ComfyGraphInput = z.looseObject({
  graph: z.record(z.string(), z.looseObject({ class_type: z.string().min(1), inputs: z.record(z.string(), z.unknown()) })),
  label: z.string().optional(),
});
const comfyFile = z.looseObject({ filename: z.string().min(1), subfolder: z.string().optional(), type: z.string().optional() });
/** comfy.run(): the prompt id, the history outputs per node (files, or the text of a PreviewAny node: face boxes, a
 *  description), the timings and the structural workflow version. */
export const ComfyRunOutput = z.looseObject({
  promptId: z.string().min(1),
  outputs: z.record(z.string(), z.looseObject({ images: z.array(comfyFile).optional(), audio: z.array(comfyFile).optional(), video: z.array(comfyFile).optional(), gifs: z.array(comfyFile).optional(), text: z.array(z.string()).optional() })),
  ms: z.number(), engineMs: z.number().optional(), workflowVersion: z.string(),
});

// ---------------------------------------------------------------------------------------------------- video

const picture = z.object({ file, mime: z.string().min(1) });
/** generateVideo()'s request without its callbacks (onStatus, onTaskCreated, shouldStop); limits are MiniMax H3's. */
export const VideoGenerateInput = z.object({
  prompt: z.string().min(1),
  seconds: z.number().min(1).max(15),
  width: z.number().int().positive(), height: z.number().int().positive(), aspect: z.string().min(1),
  firstFrame: picture.optional(), lastFrame: picture.optional(),
  referenceImages: z.array(picture).max(9).optional(),
  referenceAudio: z.array(z.object({ file })).max(3).optional(),
  guides: z.array(z.object({ frameIdx: z.number().int().min(0), imageFile: file.optional(), imageIsVideo: z.boolean().optional(), audioFile: file.optional() })).max(4).optional(),
  seed: z.number().int().optional(), model: z.string().optional(), resolution: z.string().optional(), resumeTaskId: z.string().optional(),
});
export const VideoGenerateOutput = z.looseObject({
  file, backend: z.enum(['api', 'local']), model: z.string().min(1), requestId: z.string().min(1),
  // the hosted API reports its own resolution label; the local graph reports WxH
  resolution: z.union([z.string(), z.number()]), seconds: z.number(),
  costUsd: z.number().optional(), ms: z.number(), engineMs: z.number().optional(), workflowVersion: z.string().optional(),
  params: z.record(z.string(), z.unknown()),
});

// ---------------------------------------------------------------------------------------------------- speech

/** Local engines (IndexTTS 2.5, Habibi-TTS IRQ) speak from a reference recording; the hosted path from a voice id. */
export const SynthesizeInput = z.union([
  z.looseObject({ text: z.string().min(1), language: z.enum(['EN', 'AR']), referenceWav: file, engine: z.enum(['indextts', 'habibi', 'auto']).optional(), referenceText: z.string().optional(), seed: z.number().optional(), speed: z.number().positive().optional(), emotionAlpha: z.number().optional() }),
  z.looseObject({ text: z.string().min(1), voiceId: z.string().min(1), languageBoost: z.string().optional(), emotion: z.string().optional() }),
]);
export const SynthesizeOutput = z.union([
  // synthesize(): the file and the service's answer headers
  z.looseObject({ file, sampleRate: z.number(), durationSeconds: z.number(), engine: z.string(), model: z.string(), ms: z.number(), engineVersion: z.string(), seed: z.number().optional(), params: z.record(z.string(), z.number()), truePeakDbtp: z.number().optional(), gainReductionDb: z.number().optional() }),
  // minimax.speak(): the audio bytes
  z.looseObject({ bytes, format: z.string(), durationMs: z.number().optional(), traceId: z.string().optional() }),
]);
export const CloneVoiceInput = z.object({ file, voiceId: z.string().min(1), languageBoost: z.string().optional() });
export const CloneVoiceOutput = z.looseObject({ voiceId: z.string().min(1), demoUrl: z.string().optional() });
export const TranscribeInput = z.object({ file, language: z.enum(['ar', 'en', 'auto']).optional(), prompt: z.string().optional() });
/** transcribe(): the ASR service's JSON (docker/asr/app.py), mapped to camelCase. */
export const TranscribeOutput = z.looseObject({
  language: z.string(), languageProbability: z.number(), duration: z.number(), text: z.string(),
  segments: z.array(z.looseObject({ start: z.number(), end: z.number(), text: z.string(), words: z.array(z.looseObject({ start: z.number(), end: z.number(), word: z.string(), probability: z.number() })).optional() })),
  ms: z.number(), model: z.string(),
});
export const StemsInput = z.object({ file, outDir: file });
export const StemsOutput = z.looseObject({ files: z.record(z.string(), z.string()), ms: z.number(), model: z.string() });

// ----------------------------------------------------------------------------------------------------- music

export const MusicInput = z.object({ engine: z.enum(['minimax-api', 'ace-step', 'minimax-music3']), caption: z.string(), lyrics: z.string(), seconds: z.number().positive().optional(), instrumental: z.boolean().optional() });
/** minimax.generateMusic() returns the audio; the local engines return the ComfyUI run. */
export const MusicOutput = z.union([z.looseObject({ bytes, format: z.string(), traceId: z.string().optional() }), ComfyRunOutput]);

// ----------------------------------------------------------------------------------------------------- media

export const FileInput = z.object({ file });
const Probe = z.looseObject({
  hasVideo: z.boolean(), hasAudio: z.boolean(),
  width: metric.optional(), height: metric.optional(), durationSeconds: metric.optional(), fps: metric.optional(),
  videoCodec: z.string().optional(), audioCodec: z.string().optional(), container: z.string().optional(), sampleRate: metric.optional(), channels: metric.optional(), frames: metric.optional(), bitrate: metric.optional(), pixFmt: z.string().optional(), colorSpace: z.string().optional(),
});
/** ffprobe() or decodeCheck(), the two calls behind media.probe. */
export const ProbeOutput = z.union([Probe, z.looseObject({ ok: z.boolean(), frames: z.number(), error: z.string().optional() })]);
const QaCheck = z.looseObject({ name: z.string().min(1), ok: z.boolean(), value: z.union([z.string(), metric]).optional(), threshold: z.union([z.string(), z.number()]).optional(), detail: z.string().optional() });
export const QaTakeInput = z.object({ file, expect: z.object({ durationSeconds: z.number().positive(), width: z.number().positive().optional(), height: z.number().positive().optional(), expectAudio: z.boolean().optional(), minFps: z.number().positive().optional(), speechExpected: z.boolean().optional() }) });
export const QaTakeOutput = z.looseObject({ report: z.looseObject({ ok: z.boolean(), checks: z.array(QaCheck).min(1), reviewedAt: z.string().optional(), reviewer: z.enum(['AUTO', 'HUMAN']).optional() }), probe: Probe });
const MixPlan = z.looseObject({
  rate: z.number().int().positive(), targetLufs: z.number(), notes: z.array(z.string()),
  tracks: z.array(z.looseObject({ kind: z.string().min(1), sourceAssetId: z.string().min(1), sourceOffsetSamples: z.number().int().min(0), startSample: z.number().int().min(0), durationSamples: z.number().int().min(0), gain: z.number().min(0), policy: z.string(), shotId: z.string().optional(), muted: z.boolean().optional() })),
});
/** assemble(production, timeline, options) as the cut/export render calls it. */
export const AssembleInput = z.object({
  productionId: z.string().min(1), shots: z.number().int().positive(), width: z.number().int().positive(), height: z.number().int().positive(), fps: z.number().positive(),
  codec: z.enum(['h264', 'h265', 'prores']), outFile: file, mix: MixPlan, files: z.record(z.string(), file),
  subtitles: z.object({ srt: file.optional(), burn: z.enum(['none', 'ar', 'en', 'both']) }),
});
export const AssembleOutput = z.looseObject({ file, loudness: z.looseObject({ integrated: metric, truePeak: metric }).nullable(), durationSeconds: z.number() });
export const ValidateExportInput = z.object({ file, expect: z.object({ width: z.number().int().positive(), height: z.number().int().positive(), fps: z.number().positive(), durationSeconds: z.number().min(0), subtitlesBurned: z.boolean() }) });
export const ValidateExportOutput = z.looseObject({ ok: z.boolean(), checks: z.array(z.looseObject({ name: z.string().min(1), ok: z.boolean(), value: z.union([z.string(), metric]).optional(), detail: z.string().optional() })).min(1) });
export const AlignLagInput = z.object({ takeFile: file, masterFile: file, from: z.number().min(0), seconds: z.number().min(0) });
export const AlignLagOutput = z.looseObject({ lagMs: metric, corrZero: metric, corrBest: metric });
export const LyricsAlignInput = z.object({
  sections: z.array(z.looseObject({ id: z.string().min(1), text: z.string(), textAr: z.string().optional(), from: z.number(), to: z.number() })),
  words: z.array(z.object({ start: z.number(), end: z.number(), word: z.string() })),
  language: z.enum(['EN', 'AR']),
});
export const LyricsAlignOutput = z.array(z.looseObject({ sectionId: z.string(), index: z.number().int().min(0), text: z.string(), textAr: z.string().optional(), from: z.number(), to: z.number(), confidence: z.number(), method: z.enum(['ALIGNED', 'SPREAD']) }));

// ------------------------------------------------------------------------------------------------------ jobs

/** enqueue()'s argument; the payload itself is validated by enqueue against JOB_PAYLOADS[type]. */
export const EnqueueInput = z.object({ type: z.enum(JOB_TYPES), payload: z.record(z.string(), z.unknown()), priority: z.number().int().optional(), maxAttempts: z.number().int().positive().optional(), idempotencyKey: z.string().min(1).optional(), parentId: z.string().min(1).optional(), runAfter: z.string().optional() });
export const EnqueueOutput = z.looseObject({ job: z.looseObject({ id: z.string().min(1), type: z.enum(JOB_TYPES), status: z.enum(JOB_STATUSES), attempts: z.number().int().min(0), maxAttempts: z.number().int().positive(), payload: z.record(z.string(), z.unknown()) }), created: z.boolean() });

// ------------------------------------------------------------------------------------------------- registry

export interface ToolContract {
  input: z.ZodType;
  output: z.ZodType;
  /** a narrower output schema chosen by the call's input (story.structured_answer: by task) */
  outputFor?: (input: unknown) => z.ZodType | undefined;
}

/** The named schemas, so a ToolDef's `inputSchema`/`outputSchema` names a real schema (a test checks it). */
export const SCHEMAS: Record<string, z.ZodType> = {
  StructuredAnswerInput, StructuredAnswerOutput, ComfyGraphInput, ComfyRunOutput, VideoGenerateInput, VideoGenerateOutput, SynthesizeInput, SynthesizeOutput,
  CloneVoiceInput, CloneVoiceOutput, TranscribeInput, TranscribeOutput, StemsInput, StemsOutput, MusicInput, MusicOutput, FileInput, ProbeOutput,
  QaTakeInput, QaTakeOutput, AssembleInput, AssembleOutput, ValidateExportInput, ValidateExportOutput, AlignLagInput, AlignLagOutput, LyricsAlignInput, LyricsAlignOutput,
  EnqueueInput, EnqueueOutput,
};

export const CONTRACTS: Record<string, ToolContract> = {
  'story.structured_answer': { input: StructuredAnswerInput, output: StructuredAnswerOutput, outputFor: (i) => { const t = (i as { task?: StoryTask } | undefined)?.task; return t ? STORY_OUTPUT[t] : undefined; } },
  'image.generate': { input: ComfyGraphInput, output: ComfyRunOutput },
  'image.edit_with_references': { input: ComfyGraphInput, output: ComfyRunOutput },
  'image.describe_reference': { input: ComfyGraphInput, output: ComfyRunOutput },
  'video.minimax_generate': { input: VideoGenerateInput, output: VideoGenerateOutput },
  'speech.synthesize': { input: SynthesizeInput, output: SynthesizeOutput },
  'speech.clone_voice': { input: CloneVoiceInput, output: CloneVoiceOutput },
  'speech.transcribe': { input: TranscribeInput, output: TranscribeOutput },
  'audio.separate_stems': { input: StemsInput, output: StemsOutput },
  'music.generate': { input: MusicInput, output: MusicOutput },
  'media.probe': { input: FileInput, output: ProbeOutput },
  'media.qa_take': { input: QaTakeInput, output: QaTakeOutput },
  'media.assemble': { input: AssembleInput, output: AssembleOutput },
  'media.validate_export': { input: ValidateExportInput, output: ValidateExportOutput },
  'media.align_lag': { input: AlignLagInput, output: AlignLagOutput },
  'lyrics.align': { input: LyricsAlignInput, output: LyricsAlignOutput },
  'jobs.enqueue': { input: EnqueueInput, output: EnqueueOutput },
};

/** The issues of a failed parse in one line (path: message; …), for the tool call record and the error. */
export const issuesOf = (e: z.ZodError) => e.issues.slice(0, 6).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');

export type JsonSchema = Record<string, unknown>;
/** A contract as JSON Schema for the org API (zod 4 `z.toJSONSchema`; a byte buffer has no JSON form and shows as {}). */
export function contractJsonSchema(toolId: string): { input: JsonSchema; output: JsonSchema } | null {
  const c = CONTRACTS[toolId];
  if (!c) return null;
  return {
    input: z.toJSONSchema(c.input, { unrepresentable: 'any', io: 'input' }) as JsonSchema,
    output: z.toJSONSchema(c.output, { unrepresentable: 'any', io: 'output' }) as JsonSchema,
  };
}
