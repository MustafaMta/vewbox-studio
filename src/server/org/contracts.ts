import { z } from 'zod';
import { JOB_STATUSES, JOB_TYPES } from '@/domain/jobs';
import { PROVIDER_STATUSES, RESEARCH_CATEGORIES, RESEARCH_PLATFORMS } from '@/domain/development';

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

export const STORY_TASKS = ['proposal', 'continuity', 'character-design', 'develop', 'script', 'shot-plan', 'performance-plan', 'audience-analysis', 'concepts', 'idea-draft', 'idea-review', 'song'] as const;
export type StoryTask = (typeof STORY_TASKS)[number];

/** What the story handlers ask the model for (the engine function and the records it works on). */
export const StructuredAnswerInput = z.strictObject({
  task: z.enum(STORY_TASKS),
  productionId: z.string().min(1).optional(),
  showId: z.string().min(1).optional(),
  sceneIds: z.array(z.string().min(1)).optional(),
  /** the characters the answer is for (WRITE_SONG: the song's singers) */
  characterIds: z.array(z.string().min(1)).optional(),
  /** AUTO_IDEA: what is proposed */
  kind: z.enum(['SHOW', 'SEASON', 'EPISODE', 'SHORT', 'MUSIC_VIDEO']).optional(),
  /** a development stage: the AUTO_IDEA job it belongs to */
  ideaJobId: z.string().min(1).optional(),
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
  boundary: z.enum(['continuous', 'cut', 'transition']).optional(),
});
/** planShotsDraft: the scene's shots before the Shot Planner's timing fit, with the budget they are fitted to. */
const ShotPlanOut = z.looseObject({ shots: z.array(PlannedShotOut).min(1), budget: z.number().positive(), maxShot: z.number().positive() });
/** WRITE_SONG: the song plan (src/server/story/song.ts SongPlanSchema) — every sung section names its singers. */
const SongOut = z.looseObject({ title: z.string().min(1), concept: z.string(), genre: z.string(), mood: z.string(), bpm: z.number().int().min(50).max(200), key: z.string(), caption: z.string().min(1), sections: z.array(z.looseObject({ kind: z.string(), lyrics: z.string(), singers: z.array(z.string()) })).min(3).max(10) });
const PerformancePlanOut = z.array(z.looseObject({ sectionId: z.string(), mode: z.enum(['SOLO', 'DUET', 'ALTERNATING', 'ENSEMBLE', 'LISTENER', 'INSTRUMENTAL']), singerIds: z.array(z.string()), lines: z.array(z.looseObject({ singerId: z.string(), text: z.string() })).optional() }));

// the research-driven Auto Idea's stages (src/server/story/development/engine.ts), after the studio's own checks
const confidence = z.enum(['LOW', 'MEDIUM', 'HIGH']);
const AudiencePatternOut = z.looseObject({ id: z.string().regex(/^P\d+$/), kind: z.string().min(1), pattern: z.string().min(1), evidenceIds: z.array(z.string().min(1)), measured: z.string().optional(), interpretation: z.string().min(1), confidence, limitations: z.string().optional() })
  // a measurement always rests on a cited source; without one the pattern is craft knowledge, never HIGH
  .refine((p) => !p.measured || p.evidenceIds.length > 0, 'a measured pattern cites its sources').refine((p) => p.evidenceIds.length > 0 || p.confidence !== 'HIGH', 'a pattern without evidence is at most MEDIUM');
const AudienceAnalysisOut = z.looseObject({ audience: z.string().min(1), basis: z.enum(['EVIDENCE', 'CRAFT_ONLY']), patterns: z.array(AudiencePatternOut).min(1), cautions: z.array(z.string()) });
const AudienceStageOut = z.looseObject({ analysis: AudienceAnalysisOut, downgraded: z.number().int().min(0), droppedRefs: z.number().int().min(0) });
const ConceptOut = z.looseObject({ id: z.string().min(1), title: z.string().min(1), logline: z.string().min(1), hook: z.string().min(1), whyItWorks: z.string(), patternIds: z.array(z.string()), originalityNote: z.string(), risks: z.string() });
const ConceptSetOut = z.looseObject({ concepts: z.array(ConceptOut).length(3), chosenId: z.string().min(1), rationale: z.string().min(1), originality: z.array(z.looseObject({ conceptId: z.string(), ok: z.boolean() })).length(3) })
  // a concept that failed its originality check is never the chosen one
  .refine((s) => s.originality.some((o) => o.conceptId === s.chosenId && o.ok), 'the chosen concept passed the originality check');
const DraftContentOut = z.looseObject({ proposal: ProposalOut, hook: z.string().min(1), ending: z.string().min(1), strategy: z.enum(['SHORT_FOCUSED', 'SHOW_SERIAL', 'SEASON_CONTINUATION', 'EPISODE_CONTINUATION', 'MUSIC_FIRST']), draft: z.number().int().min(1).max(2), conceptId: z.string().min(1), answered: z.array(z.string()).optional() });
const StoryReviewOut = z.looseObject({ reviewer: z.enum(['STORY_EDITOR', 'AUDIENCE_EXPERIENCE']), agentId: z.string().min(1), scores: z.record(z.string(), z.number().int().min(1).max(5)), issues: z.array(z.looseObject({ criterion: z.string(), severity: z.enum(['MINOR', 'MAJOR']), note: z.string(), fix: z.string() })), verdict: z.enum(['APPROVE', 'REVISE']), summary: z.string(), draft: z.number().int().min(1) })
  // the verdict rule: a MAJOR issue means REVISE
  .refine((r) => r.verdict === 'REVISE' || !r.issues.some((i) => i.severity === 'MAJOR'), 'a MAJOR issue means REVISE');

const STORY_OUTPUT: Record<StoryTask, z.ZodType> = { proposal: ProposalOut, continuity: ContinuityOut, 'character-design': CharacterDesignOut, develop: DevelopOut, script: ScriptOut, 'shot-plan': ShotPlanOut, 'performance-plan': PerformancePlanOut, 'audience-analysis': AudienceStageOut, concepts: ConceptSetOut, 'idea-draft': DraftContentOut, 'idea-review': StoryReviewOut, song: SongOut };
export const StructuredAnswerOutput = z.union([ProposalOut, ContinuityOut, CharacterDesignOut, DevelopOut, ScriptOut, ShotPlanOut, PerformancePlanOut, AudienceStageOut, ConceptSetOut, DraftContentOut, StoryReviewOut, SongOut]);

// ---------------------------------------------------------------------------------------------------- research

const platform = z.enum(RESEARCH_PLATFORMS);
const ResearchTopic = z.object({ query: z.string().min(1), platforms: z.array(platform), categories: z.array(z.enum(RESEARCH_CATEGORIES)), language: z.enum(['EN', 'AR']), region: z.string().optional(), reason: z.string().min(10) });
const Coverage = z.object({ platform, provider: z.string().min(1), status: z.enum(PROVIDER_STATUSES), detail: z.string().min(1), queries: z.number().int().min(0), items: z.number().int().min(0), fetchedAt: z.string().optional(), cachedUntil: z.string().optional() });
const metricsOf = z.strictObject({ views: z.number().optional(), likes: z.number().optional(), comments: z.number().optional(), shares: z.number().optional(), pageviews: z.number().optional(), rank: z.number().optional(), articles: z.number().optional(), periodDays: z.number().optional() });
/** An item is a real link with its dates and only the source's own measurements: an http(s) URL, a retrieval time, an
 *  excerpt of at most 200 characters (contract §3). */
const ResearchItemOut = z.object({ id: z.string().min(1), platform, provider: z.string().min(1), url: z.url({ protocol: /^https?$/ }), title: z.string().min(1), publishedAt: z.string().optional(), retrievedAt: z.string().min(1), category: z.enum(RESEARCH_CATEGORIES), language: z.string().optional(), region: z.string().optional(), metrics: metricsOf, excerpt: z.string().max(200).optional(), query: z.string().min(1), creator: z.string().optional() });

/** research.plan_topics: the request as the Trend Research Agent reads it. */
export const ResearchPlanInput = z.strictObject({ ideaJobId: z.string().min(1), kind: z.enum(['SHOW', 'SEASON', 'EPISODE', 'SHORT', 'MUSIC_VIDEO']), language: z.enum(['EN', 'AR']), dialect: z.string().optional(), style: z.string().optional(), genre: z.string().optional(), show: z.string().optional(), refresh: z.boolean() });
export const ResearchPlanOutput = z.array(ResearchTopic).min(1).max(4);
/** research.query_source: one platform, the planned topics. */
export const ResearchQueryInput = z.strictObject({ platform, topics: z.array(ResearchTopic).min(1), refresh: z.boolean() });
export const ResearchQueryOutput = z.looseObject({ coverage: Coverage, items: z.array(ResearchItemOut), reusedFromCache: z.number().int().min(0) })
  .refine((r) => r.coverage.items === r.items.length, 'the coverage counts the items it returns')
  .refine((r) => r.items.every((i) => i.platform === r.coverage.platform), 'items belong to the platform queried')
  .refine((r) => r.items.length === 0 || ['OK', 'CACHED'].includes(r.coverage.status), 'only an answering platform returns items');
/** research.store_evidence: what is recorded. */
export const ResearchStoreInput = z.strictObject({ ideaJobId: z.string().min(1), platforms: z.array(platform).length(RESEARCH_PLATFORMS.length), items: z.number().int().min(0) });
export const ResearchRunOutput = z.looseObject({ id: z.string().min(1), status: z.enum(['COMPLETE', 'PARTIAL', 'UNAVAILABLE', 'DISABLED']), topics: z.array(ResearchTopic), coverage: z.array(Coverage).length(RESEARCH_PLATFORMS.length), itemIds: z.array(z.string()), reusedFromCache: z.number().int().min(0), limitations: z.array(z.string()), startedAt: z.string(), finishedAt: z.string() })
  .refine((r) => r.coverage.map((c) => c.platform).join() === RESEARCH_PLATFORMS.join(), 'coverage lists every platform in priority order');

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
/** One guide anchored on the clip's timeline (`MiniMaxH3AddGuide`): a still, a clip (optionally with its own
 *  soundtrack), audio, or a clip and audio together; at least one medium; a soundtrack from the clip needs a clip. */
const VideoGuide = z.object({ frameIdx: z.number().int().min(0), imageFile: file.optional(), imageIsVideo: z.boolean().optional(), audioFile: file.optional(), audioFromVideo: z.boolean().optional() })
  .refine((g) => Boolean(g.imageFile || g.audioFile), 'a guide anchors an image, a clip or audio')
  .refine((g) => !g.audioFromVideo || Boolean(g.imageFile && g.imageIsVideo), 'audioFromVideo needs a guide clip');
/** generateVideo()'s request without its callbacks (onStatus, onTaskCreated, shouldStop); limits are MiniMax H3's
 *  (`MiniMaxH3ReferenceToVideo`: 9 pictures, 3 audios; the studio chains at most 4 guides). */
export const VideoGenerateInput = z.object({
  prompt: z.string().min(1),
  seconds: z.number().min(1).max(15),
  width: z.number().int().positive(), height: z.number().int().positive(), aspect: z.string().min(1),
  firstFrame: picture.optional(), lastFrame: picture.optional(),
  referenceImages: z.array(picture).max(9).optional(),
  referenceAudio: z.array(z.object({ file })).max(3).optional(),
  guides: z.array(VideoGuide).max(4).optional(),
  lowering: z.string().optional(),
  seed: z.number().int().optional(), model: z.string().optional(), resolution: z.string().optional(), resumeTaskId: z.string().optional(),
});
export const VideoGenerateOutput = z.looseObject({
  file, backend: z.enum(['api', 'local']), model: z.string().min(1), requestId: z.string().min(1),
  // the hosted API reports its own resolution label; the local graph reports WxH
  resolution: z.union([z.string(), z.number()]), seconds: z.number(),
  costUsd: z.number().optional(), ms: z.number(), engineMs: z.number().optional(), workflowVersion: z.string().optional(),
  params: z.record(z.string(), z.unknown()),
});

/** correctLipSync(): one take's mouth redrawn to its authoritative audio (src/server/providers/lipsync.ts). The output
 *  is the corrected file with the service's report, or `{ available: false, reason }` (the service is away or refused). */
export const LipsyncCorrectInput = z.object({ takeId: z.string().min(1), audioOffset: z.number().min(-600).max(600) });
export const LipsyncCorrectOutput = z.union([
  z.looseObject({ available: z.literal(true), file, bytes: z.number().int().positive(), report: z.looseObject({ frames: z.number().int().positive(), outFrames: z.number().int().min(0), model: z.string().min(1), track: z.looseObject({ framesEdited: z.number().int().min(0) }) }) }),
  z.looseObject({ available: z.literal(false), reason: z.string() }),
]);

// ---------------------------------------------------------------------------------------------------- speech

/** Local engines (IndexTTS 2.5, Habibi-TTS IRQ) speak from a reference recording; the hosted path from a voice id. */
export const SynthesizeInput = z.union([
  z.looseObject({ text: z.string().min(1), language: z.enum(['EN', 'AR']), referenceWav: file, engine: z.enum(['indextts', 'habibi', 'voxcpm2', 'dots', 'moss', 'auto']).optional(), referenceText: z.string().optional(), seed: z.number().optional(), speed: z.number().positive().optional(), emotionAlpha: z.number().optional() }),
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
/** designVoice() (src/server/providers/voice-design.ts): a description only, no audio in (Rule V-DESIGN). */
export const DesignVoiceInput = z.object({
  description: z.string().min(1).max(300), text: z.string().min(1).max(1000), language: z.enum(['EN', 'AR']),
  seed: z.number().int().nonnegative().optional(), n: z.number().int().min(1).max(3).optional(), cfgValue: z.number().optional(), inferenceTimesteps: z.number().int().optional(),
  designId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(), loudnessTarget: z.number().min(-30).max(-12).optional(),
});
const designFile = z.looseObject({ file: file.optional(), sampleRate: z.number().int().positive(), durationSeconds: z.number().positive(), bytes: z.number().int().positive(), sha256: z.string().regex(/^[0-9a-f]{64}$/), truePeakDbtp: z.number().nullable(), lufs: z.number().nullable(), clippedSamples: z.number().int().nonnegative() });
/** designVoice()'s result: every candidate's 48 kHz original and 24 kHz reference (hash-checked by the client), its
 *  ECAPA embedding when the encoder is present, and the pairwise similarity. */
export const DesignVoiceOutput = z.looseObject({
  designId: z.string().min(1), engine: z.string().min(1), model: z.string(), engineVersion: z.string().min(1), language: z.enum(['EN', 'AR']),
  description: z.string(), text: z.string(), seed: z.number().int(), seeds: z.array(z.number().int()).min(1).max(3), params: z.record(z.string(), z.number()), ms: z.number(),
  candidates: z.array(z.looseObject({ index: z.number().int().positive(), seed: z.number().int(), generationMs: z.number(), native: designFile, reference: designFile, embedding: z.array(z.number()).length(192).optional() })).min(1).max(3),
  similarity: z.array(z.array(z.number())).nullable(), label: z.string(),
});
/** embedVoice(): the 192-d ECAPA vector of a recording (CPU, in the design service). */
export const EmbedVoiceOutput = z.looseObject({ embedding: z.array(z.number()).length(192), model: z.string().min(1), version: z.string(), durationSeconds: z.number().positive() });
export const StemsInput = z.object({ file, outDir: file });
export const StemsOutput = z.looseObject({ files: z.record(z.string(), z.string()), ms: z.number(), model: z.string() });

// ----------------------------------------------------------------------------------------------------- music

export const MusicInput = z.object({ engine: z.literal('ace-step'), variant: z.enum(['xl-sft', 'xl-turbo']), caption: z.string(), lyrics: z.string(), seconds: z.number().positive().optional(), instrumental: z.boolean().optional(), bpm: z.number().int().optional(), key: z.string().optional() });
/** minimax.generateMusic() returns the audio; the local engines return the ComfyUI run. */
export const MusicOutput = ComfyRunOutput;

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
/** `takeFrom`: seconds of the take's head that repeat the previous shot (a continuation guide) and are not measured. */
export const AlignLagInput = z.object({ takeFile: file, masterFile: file, from: z.number().min(0), seconds: z.number().min(0), takeFrom: z.number().min(0).optional() });
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
  StructuredAnswerInput, StructuredAnswerOutput, ComfyGraphInput, ComfyRunOutput, VideoGenerateInput, VideoGenerateOutput, LipsyncCorrectInput, LipsyncCorrectOutput, SynthesizeInput, SynthesizeOutput,
  CloneVoiceInput, CloneVoiceOutput, TranscribeInput, TranscribeOutput, DesignVoiceInput, DesignVoiceOutput, EmbedVoiceOutput, StemsInput, StemsOutput, MusicInput, MusicOutput, FileInput, ProbeOutput,
  QaTakeInput, QaTakeOutput, AssembleInput, AssembleOutput, ValidateExportInput, ValidateExportOutput, AlignLagInput, AlignLagOutput, LyricsAlignInput, LyricsAlignOutput,
  EnqueueInput, EnqueueOutput,
  ResearchPlanInput, ResearchPlanOutput, ResearchQueryInput, ResearchQueryOutput, ResearchStoreInput, ResearchRunOutput,
};

export const CONTRACTS: Record<string, ToolContract> = {
  'story.structured_answer': { input: StructuredAnswerInput, output: StructuredAnswerOutput, outputFor: (i) => { const t = (i as { task?: StoryTask } | undefined)?.task; return t ? STORY_OUTPUT[t] : undefined; } },
  'image.generate': { input: ComfyGraphInput, output: ComfyRunOutput },
  'image.edit_with_references': { input: ComfyGraphInput, output: ComfyRunOutput },
  'image.describe_reference': { input: ComfyGraphInput, output: ComfyRunOutput },
  'video.minimax_generate': { input: VideoGenerateInput, output: VideoGenerateOutput },
  'video.lipsync_correct': { input: LipsyncCorrectInput, output: LipsyncCorrectOutput },
  'speech.synthesize': { input: SynthesizeInput, output: SynthesizeOutput },
  'speech.clone_voice': { input: CloneVoiceInput, output: CloneVoiceOutput },
  'speech.transcribe': { input: TranscribeInput, output: TranscribeOutput },
  'speech.design_voice': { input: DesignVoiceInput, output: DesignVoiceOutput },
  'speech.embed_voice': { input: FileInput, output: EmbedVoiceOutput },
  'audio.separate_stems': { input: StemsInput, output: StemsOutput },
  'music.generate': { input: MusicInput, output: MusicOutput },
  'media.probe': { input: FileInput, output: ProbeOutput },
  'media.qa_take': { input: QaTakeInput, output: QaTakeOutput },
  'media.assemble': { input: AssembleInput, output: AssembleOutput },
  'media.validate_export': { input: ValidateExportInput, output: ValidateExportOutput },
  'media.align_lag': { input: AlignLagInput, output: AlignLagOutput },
  'lyrics.align': { input: LyricsAlignInput, output: LyricsAlignOutput },
  'jobs.enqueue': { input: EnqueueInput, output: EnqueueOutput },
  'research.plan_topics': { input: ResearchPlanInput, output: ResearchPlanOutput },
  'research.query_source': { input: ResearchQueryInput, output: ResearchQueryOutput },
  'research.store_evidence': { input: ResearchStoreInput, output: ResearchRunOutput },
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
