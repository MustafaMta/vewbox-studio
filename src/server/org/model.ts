import type { JobType } from '@/domain/jobs';

/** THE STUDIO ORGANISATION — the company as code (docs/CONTRACTS-PHASE2-STUDIO.md). An agent is on the company pages
 *  only if code executes it: it owns job types (the worker opens its run per job), is routed a narrower piece of work
 *  by the payload, or performs DELEGATED STEPS — `step(ctx, '<agent>', '<step id>…', fn)` in src/worker opens a child
 *  run under the job's run with this agent's own allow-list. Roles nobody executes yet are `PLANNED_ROLES`: listed,
 *  never staffed (no tools, skills, model or activity). `registry.ts` persists this file on boot (and deletes what is
 *  no longer here), so the pages, the API and the history read one organisation. Nothing here is decorative. */

export const ORG_VERSION = 20;

export type DepartmentId = 'EXECUTIVE' | 'STORY' | 'CASTING' | 'WORLD' | 'PREPRODUCTION' | 'VIDEO' | 'SOUND' | 'POST' | 'QA';

export type ResourceFamily = 'LLM' | 'GPU_IMAGE' | 'GPU_VIDEO' | 'TTS' | 'ASR' | 'SFX' | 'CPU' | 'HOSTED' | 'NONE';

export interface ToolDef {
  id: string;
  name: string;
  description: string;
  version: string;
  /** the named zod schemas in contracts.ts that the tool runner validates the call's input and output against */
  inputSchema: string;
  outputSchema: string;
  /** what the tool touches (documentation; the allow-list on the agent is the grant) */
  permissions: string[];
  timeoutMs: number;
  resource: ResourceFamily;
  /** VRAM the lease reserves for a GPU family, MB */
  vramMb?: number;
  /** failure classes this tool can raise */
  errors: string[];
}

/** PROMPT: the SKILL.md body is injected into the system prompt of the LLM calls of the agents that list it.
 *  PROCEDURE: the procedure the SKILL.md describes is implemented by `implementedBy` and checked by `verifiedBy`.
 *  REFERENCE: read-only knowledge from an external repository — never executed, never injected. */
export type SkillKind = 'PROMPT' | 'PROCEDURE' | 'REFERENCE';
/** Computed at sync (registry.ts), never written by hand. */
export type SkillStatus = 'VERIFIED' | 'UNAVAILABLE' | 'DRAFT';

export interface SkillDef {
  id: string;
  name: string;
  /** folder under skills/ with SKILL.md (Agent Skills format); the frontmatter `name` must equal the folder name */
  path: string;
  source: string;
  supportedModels: string[];
  /** the tools the procedure calls — must equal the SKILL.md `allowed-tools` line (documentation, never a grant:
   *  grants are the agents' allow-lists) */
  requiredTools: string[];
  kind: SkillKind;
  /** files whose code implements the procedure (PROCEDURE) or carries the injection (PROMPT), repository-relative */
  implementedBy: string[];
  /** test files that check it, repository-relative */
  verifiedBy: string[];
  /** something this machine may lack; the status is UNAVAILABLE (with the reason) without it */
  requires?: { env: string; reason: string };
  note?: string;
}

/** A delegated step: real work an agent does inside another agent's job. `where` is the source file whose
 *  `step(ctx, '<agent>', '<id>…', fn)` call performs it (a test scans for it). */
export interface StepDef { id: string; name: string; where: string }

export interface AgentDef {
  id: string;
  name: string;
  department: DepartmentId;
  role: string;
  /** one honest paragraph: what the code does when this agent runs */
  description: string;
  /** for agents that call the language model (story.structured_answer): injected into the system prompt of every
   *  call they make (src/server/org/skills.ts agentPrompt); for the others it is documentation of the rules their
   *  code applies — the API says which (`instructionsReachModel`) */
  systemInstructions: string;
  /** the model or code that actually runs when this agent works */
  model: string;
  skills: string[];
  /** the allow-list: exactly the tools its job handlers and steps call (a test scans the code) */
  tools: string[];
  inputSchema: string;
  outputSchema: string;
  limits: { timeoutMs: number; maxAttempts: number; resource: ResourceFamily };
  version: string;
  qualityRequirements: string[];
  /** job types this agent executes (the worker opens its run per job) */
  jobTypes: JobType[];
  /** a narrower piece of a job type this agent executes when the payload says so (agentIdForJob) */
  payloadRoutes?: Array<{ jobType: JobType; when: string }>;
  /** delegated steps this agent performs inside other agents' jobs */
  steps: StepDef[];
}

/** A role the studio would need but nobody executes yet (R2): listed muted on its department page, never staffed. */
export interface PlannedRole { id: string; department: DepartmentId; name: string; would: string; /** why it is not implemented */ reason: string; phase: string }

export interface DepartmentDef {
  id: DepartmentId;
  name: string;
  directorId: string;
  responsibility: string;
  stages: PipelineStage[];
  order: number;
}

export type PipelineStage = 'STORY' | 'CAST_WORLD' | 'SCRIPT' | 'STORYBOARD' | 'SHOT_PLAN' | 'AUDIO_PREP' | 'VIDEO' | 'QA' | 'EDIT' | 'EXPORT';

export interface StageDef { id: PipelineStage; name: string; department: DepartmentId; dependsOn: PipelineStage[]; jobTypes: JobType[]; /** the department that receives the handoff */ handsTo?: DepartmentId; approval?: 'HUMAN' }

export const PIPELINE: StageDef[] = [
  { id: 'STORY', name: 'Story', department: 'STORY', dependsOn: [], jobTypes: ['AUTO_IDEA', 'IDEA_RESEARCH', 'IDEA_AUDIENCE', 'IDEA_CONCEPTS', 'IDEA_WRITE', 'IDEA_REVIEW', 'DEVELOP_STORY'], handsTo: 'CASTING', approval: 'HUMAN' },
  { id: 'CAST_WORLD', name: 'Cast & world', department: 'CASTING', dependsOn: ['STORY'], jobTypes: ['CREATE_CHARACTER', 'DESIGN_CHARACTER', 'CHARACTER_APPEARANCE', 'CHARACTER_REFS', 'VOICE_DESIGN', 'VOICE_BUILD', 'VOICE_PREVIEW', 'LOCATION_PLATES'], handsTo: 'PREPRODUCTION' },
  { id: 'SCRIPT', name: 'Script', department: 'STORY', dependsOn: ['STORY'], jobTypes: ['WRITE_SCRIPT'], handsTo: 'PREPRODUCTION' },
  { id: 'STORYBOARD', name: 'Storyboard', department: 'PREPRODUCTION', dependsOn: ['SCRIPT', 'CAST_WORLD'], jobTypes: ['SHOT_FRAMES'], handsTo: 'PREPRODUCTION' },
  { id: 'SHOT_PLAN', name: 'Shot plan', department: 'PREPRODUCTION', dependsOn: ['SCRIPT'], jobTypes: ['PLAN_SHOTS'], handsTo: 'SOUND' },
  { id: 'AUDIO_PREP', name: 'Audio preparation', department: 'SOUND', dependsOn: ['SHOT_PLAN', 'CAST_WORLD'], jobTypes: ['WRITE_SONG', 'GENERATE_SONG', 'CHECK_SONG', 'DIALOGUE_AUDIO', 'AMBIENCE'], handsTo: 'VIDEO' },
  // PRODUCE is the Production Coordinator's orchestration across stages, not a stage job
  { id: 'VIDEO', name: 'Video generation', department: 'VIDEO', dependsOn: ['SHOT_PLAN', 'STORYBOARD', 'AUDIO_PREP'], jobTypes: ['GENERATE_TAKE', 'CORRECT_LIPSYNC'], handsTo: 'QA' },
  { id: 'QA', name: 'Quality assurance', department: 'QA', dependsOn: ['VIDEO'], jobTypes: [], handsTo: 'POST' },
  { id: 'EDIT', name: 'Edit', department: 'POST', dependsOn: ['QA'], jobTypes: ['ASSEMBLE'], handsTo: 'POST', approval: 'HUMAN' },
  { id: 'EXPORT', name: 'Export', department: 'POST', dependsOn: ['EDIT'], jobTypes: ['EXPORT'] },
];

// ---------------------------------------------------------------------------------------------------------- tools

export const TOOLS: ToolDef[] = [
  // 10 minutes: the local 14B model shares the card with image and video generation and slows down under them
  { id: 'story.structured_answer', name: 'Structured story answer', description: 'Ask the story model for one JSON object against a schema, with lenient repair rounds; returns the validated data the story engine builds from it (the development stages: after the studio’s own checks — evidence traced, originality, the rubric).', version: '1.4.0', inputSchema: 'StructuredAnswerInput', outputSchema: 'StructuredAnswerOutput', permissions: ['llm'], timeoutMs: 600_000, resource: 'LLM', errors: ['PROVIDER', 'INVALID', 'UNAVAILABLE'] },
  { id: 'image.generate', name: 'Generate a picture', description: 'Qwen-Image-2512 text-to-image in ComfyUI (Lightning, 8 steps).', version: '1.1.0', inputSchema: 'ComfyGraphInput', outputSchema: 'ComfyRunOutput', permissions: ['gpu'], timeoutMs: 1_200_000, resource: 'GPU_IMAGE', vramMb: 20000, errors: ['PROVIDER', 'UNAVAILABLE'] },
  { id: 'image.edit_with_references', name: 'Draw from references', description: 'Qwen-Image-Edit-2511 with up to three reference pictures (identity, plate), in ComfyUI.', version: '1.1.0', inputSchema: 'ComfyGraphInput', outputSchema: 'ComfyRunOutput', permissions: ['gpu'], timeoutMs: 1_200_000, resource: 'GPU_IMAGE', vramMb: 20000, errors: ['PROVIDER', 'UNAVAILABLE'] },
  { id: 'image.describe_reference', name: 'Read a reference picture', description: 'The producer’s uploaded picture, read in ComfyUI before a character is drawn from it: MediaPipe face boxes (for the face crop) and a description of the visible look by Qwen3.5-4B (TextGenerate), from which the identity line is written — never invented.', version: '1.0.0', inputSchema: 'ComfyGraphInput', outputSchema: 'ComfyRunOutput', permissions: ['gpu'], timeoutMs: 600_000, resource: 'GPU_IMAGE', vramMb: 12000, errors: ['PROVIDER', 'UNAVAILABLE', 'NOT_CONFIGURED'] },
  { id: 'video.minimax_generate', name: 'Generate a MiniMax H3 clip', description: 'MiniMax H3 (the only video engine): first/last-frame or reference-to-video with pictures, audio and guides; local ComfyUI graphs or the hosted API when a key exists. Native stereo audio.', version: '2.0.0', inputSchema: 'VideoGenerateInput', outputSchema: 'VideoGenerateOutput', permissions: ['gpu', 'minimax'], timeoutMs: 5_400_000, resource: 'GPU_VIDEO', vramMb: 28000, errors: ['PROVIDER', 'UNAVAILABLE', 'NOT_CONFIGURED', 'INVALID'] },
  { id: 'video.lipsync_correct', name: 'Correct the lip-sync of a take', description: 'LatentSync 1.6 in the lipsync service: the mouth region of an EXISTING take redrawn to its authoritative audio (YuNet + MediaPipe face tracking, no InsightFace); same frames, rate and size, the original pixels outside the mouth. Never generates video.', version: '1.0.0', inputSchema: 'LipsyncCorrectInput', outputSchema: 'LipsyncCorrectOutput', permissions: ['gpu', 'fs'], timeoutMs: 1_800_000, resource: 'GPU_VIDEO', vramMb: 20000, errors: ['UNAVAILABLE', 'INVALID'] },
  { id: 'speech.synthesize', name: 'Speak a line', description: 'IndexTTS 2.5 (English, Arabic, mixed) or Habibi-TTS IRQ (Iraqi Arabic) from a reference recording; MiniMax speech when a key exists.', version: '1.2.0', inputSchema: 'SynthesizeInput', outputSchema: 'SynthesizeOutput', permissions: ['gpu', 'minimax'], timeoutMs: 600_000, resource: 'TTS', vramMb: 8000, errors: ['PROVIDER', 'UNAVAILABLE', 'NOT_CONFIGURED'] },
  { id: 'speech.clone_voice', name: 'Clone a voice (hosted)', description: 'MiniMax voice cloning from a reference recording; needs a MiniMax API key.', version: '1.0.0', inputSchema: 'CloneVoiceInput', outputSchema: 'CloneVoiceOutput', permissions: ['minimax'], timeoutMs: 600_000, resource: 'HOSTED', errors: ['PROVIDER', 'NOT_CONFIGURED'] },
  { id: 'speech.transcribe_qwen', name: 'Transcribe (Qwen3-ASR)', description: 'Qwen3-ASR-1.7B, the primary recogniser: the text and the language it detected (no word timings).', version: '1.0.0', inputSchema: 'QwenTranscribeInput', outputSchema: 'QwenTranscribeOutput', permissions: ['gpu'], timeoutMs: 600_000, resource: 'ASR', vramMb: 6000, errors: ['PROVIDER', 'UNAVAILABLE'] },
  { id: 'speech.transcribe', name: 'Transcribe', description: 'faster-whisper large-v3 (and the Arabic-dialect model) with word timings — the reference reading beside Qwen3-ASR.', version: '1.1.0', inputSchema: 'TranscribeInput', outputSchema: 'TranscribeOutput', permissions: ['gpu'], timeoutMs: 600_000, resource: 'ASR', vramMb: 4000, errors: ['PROVIDER', 'UNAVAILABLE'] },
  { id: 'speech.design_voice', name: 'Design a voice', description: 'VoxCPM2 (tts-design :8022): up to three synthetic candidate voices from a text description only (no audio in, Rule V-DESIGN), each a 48 kHz original and a 24 kHz reference with sha256, loudness, true peak, clipping and an ECAPA embedding.', version: '1.0.0', inputSchema: 'DesignVoiceInput', outputSchema: 'DesignVoiceOutput', permissions: ['gpu'], timeoutMs: 900_000, resource: 'TTS', vramMb: 7000, errors: ['PROVIDER', 'UNAVAILABLE', 'NOT_CONFIGURED', 'INVALID'] },
  { id: 'speech.embed_voice', name: 'Speaker embedding', description: 'ECAPA-TDNN (SpeechBrain, CPU, in tts-design): a 192-d speaker vector of a recording, for seed-to-line similarity. VoxCeleb-trained: a relative measure, never an identity or dialect proof.', version: '1.0.0', inputSchema: 'FileInput', outputSchema: 'EmbedVoiceOutput', permissions: ['cpu'], timeoutMs: 120_000, resource: 'CPU', errors: ['PROVIDER', 'UNAVAILABLE', 'NOT_CONFIGURED', 'INVALID'] },
  { id: 'audio.separate_stems', name: 'Separate stems', description: 'Demucs htdemucs: vocals and accompaniment.', version: '1.0.0', inputSchema: 'StemsInput', outputSchema: 'StemsOutput', permissions: ['gpu'], timeoutMs: 1_200_000, resource: 'ASR', vramMb: 4000, errors: ['PROVIDER', 'UNAVAILABLE'] },
  { id: 'audio.generate_effect', name: 'Make a sound effect', description: 'MOSS-SoundEffect v2.0 (1.3B DiT, the sfx-moss service): one ambience bed or effect from a description, 48 kHz, up to 30 s, peak-limited to −1 dBTP.', version: '1.0.0', inputSchema: 'SoundEffectInput', outputSchema: 'SoundEffectOutput', permissions: ['gpu'], timeoutMs: 900_000, resource: 'SFX', vramMb: 17500, errors: ['PROVIDER', 'UNAVAILABLE', 'NOT_CONFIGURED', 'INVALID'] },
  { id: 'music.generate', name: 'Compose a song', description: 'ACE-Step 1.5 XL-SFT with the 5Hz LM 4B in ComfyUI: ONE song from a caption, lyrics, tempo, key and the named singers’ vocal.', version: '2.0.0', inputSchema: 'MusicInput', outputSchema: 'MusicOutput', permissions: ['gpu', 'minimax'], timeoutMs: 1_800_000, resource: 'GPU_IMAGE', vramMb: 14000, errors: ['PROVIDER', 'UNAVAILABLE', 'NOT_CONFIGURED'] },
  { id: 'media.probe', name: 'Probe a file', description: 'ffprobe (streams, durations, frame rate, size) or a full ffmpeg decode pass.', version: '1.1.0', inputSchema: 'FileInput', outputSchema: 'ProbeOutput', permissions: ['fs'], timeoutMs: 60_000, resource: 'CPU', errors: ['INVALID'] },
  { id: 'media.qa_take', name: 'Check a take', description: 'Decodability, duration, size, black and frozen frames, flicker, silence, true peak.', version: '1.1.0', inputSchema: 'QaTakeInput', outputSchema: 'QaTakeOutput', permissions: ['fs'], timeoutMs: 300_000, resource: 'CPU', errors: ['INVALID'] },
  { id: 'media.assemble', name: 'Assemble a cut', description: 'Frame-exact picture join, typed sample-placed mix plan, EBU R128 loudness, encode, subtitles.', version: '2.0.0', inputSchema: 'AssembleInput', outputSchema: 'AssembleOutput', permissions: ['fs'], timeoutMs: 3_600_000, resource: 'CPU', errors: ['INVALID', 'PROVIDER'] },
  { id: 'media.validate_export', name: 'Validate a finished file', description: 'Lengths within a frame, frame rate, size, timestamps, black stretches.', version: '1.0.0', inputSchema: 'ValidateExportInput', outputSchema: 'ValidateExportOutput', permissions: ['fs'], timeoutMs: 600_000, resource: 'CPU', errors: ['INVALID'] },
  { id: 'media.align_lag', name: 'Measure sound-to-picture lag', description: 'Loudness-envelope cross-correlation of a take against the master stretch.', version: '1.0.0', inputSchema: 'AlignLagInput', outputSchema: 'AlignLagOutput', permissions: ['fs'], timeoutMs: 120_000, resource: 'CPU', errors: ['INVALID'] },
  { id: 'lyrics.align', name: 'Align lyrics to a vocal', description: 'Fuzzy monotone alignment of written lines to transcribed words.', version: '1.0.0', inputSchema: 'LyricsAlignInput', outputSchema: 'LyricsAlignOutput', permissions: [], timeoutMs: 60_000, resource: 'NONE', errors: [] },
  { id: 'jobs.enqueue', name: 'Queue a job', description: 'A durable child job with an idempotency key; an existing key returns the job already queued.', version: '1.0.0', inputSchema: 'EnqueueInput', outputSchema: 'EnqueueOutput', permissions: ['jobs:write'], timeoutMs: 30_000, resource: 'NONE', errors: ['INVALID'] },
  // the research-driven Auto Idea (docs/CONTRACTS-AUTO-IDEA.md §3): permitted access only, nothing scraped or invented
  { id: 'research.plan_topics', name: 'Plan research topics', description: 'Deterministic: from the format, style, genre, language and dialect (a season or episode: its show’s own genre) at most three topics — the format, the genre, measured attention — each with its platforms, region and the reason it was chosen.', version: '1.0.0', inputSchema: 'ResearchPlanInput', outputSchema: 'ResearchPlanOutput', permissions: [], timeoutMs: 10_000, resource: 'NONE', errors: ['INVALID'] },
  { id: 'research.query_source', name: 'Query a permitted source', description: 'One platform, in the producer’s priority order, through its permitted access path only — TikTok Research API, Instagram Graph hashtag search, YouTube Data API v3 (with credentials), GDELT DOC 2.0 news and Wikimedia pageviews classified by Wikidata (keyless); Facebook has none — cache first (TTL 12/24 h); returns the coverage and the items exactly as the source returned them.', version: '1.0.0', inputSchema: 'ResearchQueryInput', outputSchema: 'ResearchQueryOutput', permissions: ['network', 'db'], timeoutMs: 180_000, resource: 'HOSTED', errors: ['PROVIDER', 'UNAVAILABLE', 'NOT_CONFIGURED'] },
  { id: 'research.store_evidence', name: 'Record the research run', description: 'Records the run: every platform’s coverage in priority order (a platform not reached says why), the items it rests on, what was reused from the cache, and what the evidence cannot show.', version: '1.0.0', inputSchema: 'ResearchStoreInput', outputSchema: 'ResearchRunOutput', permissions: ['db'], timeoutMs: 30_000, resource: 'NONE', errors: ['INVALID'] },
];

/** Tools that existed in earlier versions and were removed because nothing called them (R4). */
export const REMOVED_TOOLS = ['studio.read', 'studio.command'] as const;

// --------------------------------------------------------------------------------------------------------- skills

const MINIMAX_KEY = { env: 'MINIMAX_API_KEY', reason: 'read-only knowledge from MiniMax-AI/skills about the hosted MiniMax API: never executed here, and this machine has no MINIMAX_API_KEY' };

export const SKILLS: SkillDef[] = [
  { id: 'h3-prompting', name: 'MiniMax H3 prompting', path: 'skills/h3-prompting', source: 'this studio; grammar after lumosai8/MinimaxStoryBuilder prompts.py and Comfy-Org/docs minimax-h3', supportedModels: ['MiniMax-H3 (local, ComfyUI)', 'MiniMax Hailuo (hosted)'], requiredTools: ['video.minimax_generate'], kind: 'PROCEDURE',
    implementedBy: ['src/worker/handlers/take.ts', 'src/server/story/prompts.ts', 'src/server/workflows/minimax-h3.ts', 'src/server/org/preflight.ts'], verifiedBy: ['tests/unit/preflight.test.ts', 'tests/unit/org-model.test.ts'] },
  { id: 'audio-first-dialogue', name: 'Audio-first speaking shots', path: 'skills/audio-first-dialogue', source: 'this studio (docs/AUDIOVISUAL-QA.md experiments E0–E2c)', supportedModels: ['MiniMax-H3 (local, ComfyUI)', 'IndexTTS 2.5', 'Habibi-TTS IRQ', 'faster-whisper large-v3'], requiredTools: ['speech.synthesize', 'speech.transcribe', 'video.minimax_generate', 'media.probe'], kind: 'PROCEDURE',
    implementedBy: ['src/worker/handlers/take.ts', 'src/worker/handlers/voice.ts', 'src/server/media/ffmpeg.ts', 'src/server/providers/speech.ts'], verifiedBy: ['tests/unit/script-coverage.test.ts', 'tests/unit/voice-metrics.test.ts'] },
  { id: 'iraqi-dialogue', name: 'Iraqi Arabic dialogue', path: 'skills/iraqi-dialogue', source: 'this studio; suite scripts/iraqi-voice-suite.mjs', supportedModels: ['Qwen3.8-27B-NVFP4', 'Habibi-TTS Specialized IRQ', 'MOSS-TTS v1.5', 'Qwen3-ASR-1.7B', 'faster-whisper large-v3'], requiredTools: ['story.structured_answer', 'speech.synthesize', 'speech.transcribe'], kind: 'PROCEDURE',
    implementedBy: ['src/server/story/engine.ts', 'src/server/providers/speech.ts', 'src/worker/handlers/voice.ts'], verifiedBy: ['tests/unit/voice-metrics.test.ts', 'tests/unit/script-coverage.test.ts'], note: 'dialect authenticity is a native listener’s call; the suite proves intelligibility only' },
  { id: 'shot-planning', name: 'Scene-by-scene shot planning', path: 'skills/shot-planning', source: 'this studio; staging rules after MinimaxStoryBuilder SYSTEM_PROMPTS (cast → outline → stage)', supportedModels: ['Qwen3.8-27B-NVFP4', 'any JSON-capable LLM'], requiredTools: ['story.structured_answer'], kind: 'PROMPT',
    implementedBy: ['src/server/org/skills.ts', 'src/server/story/engine.ts'], verifiedBy: ['tests/unit/skill-prompt.test.ts', 'tests/unit/fit-durations.test.ts'] },
  { id: 'screenwriting', name: 'Screenwriting for generated film', path: 'skills/screenwriting', source: 'this studio', supportedModels: ['Qwen3.8-27B-NVFP4', 'any JSON-capable LLM'], requiredTools: ['story.structured_answer'], kind: 'PROMPT',
    implementedBy: ['src/server/org/skills.ts', 'src/server/story/engine.ts'], verifiedBy: ['tests/unit/skill-prompt.test.ts'] },
  { id: 'character-design', name: 'Character design and the canonical image', path: 'skills/character-design', source: 'this studio; docs/CONTRACTS-IDENTITY-PACK.md v2; docs/evidence/image-v2/REPORT.md', supportedModels: ['Qwen3.8-27B-NVFP4', 'Qwen-Image-2512', 'Qwen-Image-Edit-2511', 'Qwen3.5-4B'], requiredTools: ['story.structured_answer', 'image.generate', 'image.edit_with_references', 'image.describe_reference'], kind: 'PROMPT',
    implementedBy: ['src/server/org/skills.ts', 'src/server/story/engine.ts', 'src/worker/handlers/story.ts', 'src/server/workflows/canonical-image.ts', 'src/server/media/figure-check.ts', 'src/worker/handlers/images.ts'], verifiedBy: ['tests/unit/skill-prompt.test.ts', 'tests/unit/canonical-image-workflow.test.ts', 'tests/unit/figure-check.test.ts', 'tests/unit/canonical-appearance.test.ts'] },
  { id: 'voice-identity', name: 'Voice identity: origin, consent, design, proof, routing, lock', path: 'skills/voice-identity', source: 'this studio; docs/CONTRACTS-CHARACTER-VOICE.md §1.4, docs/CONTRACTS-VOICE-IDENTITY-V2.md', supportedModels: ['VoxCPM2 (design)', 'ECAPA-TDNN', 'IndexTTS 2.5', 'Habibi-TTS IRQ', 'faster-whisper large-v3', 'MiniMax speech (hosted, with a key)'], requiredTools: ['speech.synthesize', 'speech.transcribe', 'speech.clone_voice', 'speech.design_voice', 'speech.embed_voice'], kind: 'PROCEDURE',
    implementedBy: ['src/worker/handlers/voice.ts', 'src/worker/handlers/voice-design.ts', 'src/domain/voice-identity.ts', 'src/domain/rules.ts', 'src/server/media/voice-check.ts', 'src/server/media/arabic-align.ts', 'src/server/studio/voice-reference.ts', 'src/server/org/preflight.ts'], verifiedBy: ['tests/unit/voice-build.test.ts', 'tests/unit/voice-design-build.test.ts', 'tests/unit/voice-identity-v2.test.ts', 'tests/unit/voice-lock.test.ts', 'tests/unit/voice-reference.test.ts', 'tests/unit/character-voice.test.ts'] },
  { id: 'world-continuity', name: 'World and location continuity', path: 'skills/world-continuity', source: 'this studio; references-on-every-shot rule after MinimaxStoryBuilder', supportedModels: ['Qwen-Image-2512', 'Qwen-Image-Edit-2511', 'MiniMax-H3 (local, ComfyUI)'], requiredTools: ['image.generate', 'image.edit_with_references'], kind: 'PROCEDURE',
    implementedBy: ['src/worker/handlers/images.ts', 'src/worker/handlers/take.ts', 'src/server/production/shot-pack.ts', 'src/server/workflows/qwen-image.ts', 'src/domain/identity.ts', 'src/domain/rules.ts', 'src/domain/world.ts', 'src/server/story/engine.ts', 'src/worker/handlers/story.ts'], verifiedBy: ['tests/unit/canonical-appearance.test.ts', 'tests/unit/qwen-image-workflow.test.ts', 'tests/unit/shot-pack.test.ts', 'tests/unit/shot-frame-world.test.ts'] },
  { id: 'singing-performance', name: 'Singing performance and lyric timing', path: 'skills/singing-performance', source: 'this studio', supportedModels: ['Qwen3.8-27B-NVFP4', 'faster-whisper large-v3', 'Demucs htdemucs'], requiredTools: ['story.structured_answer', 'speech.transcribe', 'lyrics.align', 'audio.separate_stems'], kind: 'PROCEDURE',
    implementedBy: ['src/worker/handlers/music.ts', 'src/server/media/lyrics.ts', 'src/server/story/engine.ts', 'src/domain/timeline.ts', 'src/server/media/assembly.ts'], verifiedBy: ['tests/unit/lyrics-align.test.ts', 'tests/unit/singing.test.ts'] },
  { id: 'audio-mix-policy', name: 'Authoritative audio tracks and mix policy', path: 'skills/audio-mix-policy', source: 'this studio', supportedModels: ['ffmpeg'], requiredTools: ['media.assemble', 'media.align_lag'], kind: 'PROCEDURE',
    implementedBy: ['src/server/media/assembly.ts', 'src/server/media/sync.ts', 'src/worker/handlers/assemble.ts'], verifiedBy: ['tests/unit/mix-plan.test.ts', 'tests/unit/sync.test.ts'] },
  { id: 'take-inspection', name: 'Take inspection and failure classes', path: 'skills/take-inspection', source: 'this studio', supportedModels: ['ffmpeg', 'faster-whisper large-v3'], requiredTools: ['media.qa_take', 'speech.transcribe', 'media.validate_export'], kind: 'PROCEDURE',
    implementedBy: ['src/server/media/ffmpeg.ts', 'src/server/media/assembly.ts', 'src/server/org/runs.ts', 'src/worker/handlers/take.ts', 'src/worker/index.ts'], verifiedBy: ['tests/unit/org-model.test.ts', 'tests/unit/script-coverage.test.ts'] },
  // the research-driven Auto Idea (docs/CONTRACTS-AUTO-IDEA.md)
  { id: 'trend-research', name: 'Permitted trend research', path: 'skills/trend-research', source: 'this studio; docs/CONTRACTS-AUTO-IDEA.md §3; access verified from this machine 2026-10-02/03', supportedModels: ['TikTok Research API', 'Instagram Graph API', 'YouTube Data API v3', 'GDELT DOC 2.0', 'Wikimedia pageviews + Wikidata'], requiredTools: ['research.plan_topics', 'research.query_source', 'research.store_evidence'], kind: 'PROCEDURE',
    implementedBy: ['src/server/research/index.ts', 'src/server/research/topics.ts', 'src/server/research/store.ts', 'src/server/research/providers/index.ts', 'src/worker/handlers/development.ts'], verifiedBy: ['tests/unit/research-providers.test.ts', 'tests/unit/research-run.test.ts'], note: 'TikTok, Instagram and YouTube need credentials this machine does not have (NOT_CONFIGURED); Facebook has no permitted path (UNSUPPORTED)' },
  { id: 'audience-analysis', name: 'Audience analysis from evidence', path: 'skills/audience-analysis', source: 'this studio; docs/CONTRACTS-AUTO-IDEA.md §4', supportedModels: ['Qwen3.8-27B-NVFP4', 'any JSON-capable LLM'], requiredTools: ['story.structured_answer'], kind: 'PROMPT',
    implementedBy: ['src/server/org/skills.ts', 'src/server/story/development/engine.ts', 'src/server/story/development/evidence.ts'], verifiedBy: ['tests/unit/development-evidence.test.ts', 'tests/unit/development-pipeline.test.ts'] },
  { id: 'creative-concepts', name: 'Original concepts from audience patterns', path: 'skills/creative-concepts', source: 'this studio; docs/CONTRACTS-AUTO-IDEA.md §2, §4', supportedModels: ['Qwen3.8-27B-NVFP4', 'any JSON-capable LLM'], requiredTools: ['story.structured_answer'], kind: 'PROMPT',
    implementedBy: ['src/server/org/skills.ts', 'src/server/story/development/engine.ts', 'src/server/story/development/originality.ts'], verifiedBy: ['tests/unit/development-originality.test.ts', 'tests/unit/development-pipeline.test.ts'] },
  { id: 'story-formats', name: 'Format strategies and continuation', path: 'skills/story-formats', source: 'this studio; docs/CONTRACTS-AUTO-IDEA.md §2; directive part 9', supportedModels: ['Qwen3.8-27B-NVFP4', 'any JSON-capable LLM'], requiredTools: ['story.structured_answer'], kind: 'PROCEDURE',
    implementedBy: ['src/server/story/development/strategy.ts', 'src/server/story/development/context.ts', 'src/server/story/development/resolve.ts', 'src/server/story/development/rubric.ts'], verifiedBy: ['tests/unit/development-strategy.test.ts', 'tests/unit/development-pipeline.test.ts'] },
  { id: 'story-review', name: 'Story editing against the rubric', path: 'skills/story-review', source: 'this studio; docs/CONTRACTS-AUTO-IDEA.md §2 (engagement rubric)', supportedModels: ['Qwen3.8-27B-NVFP4', 'any JSON-capable LLM'], requiredTools: ['story.structured_answer'], kind: 'PROMPT',
    implementedBy: ['src/server/org/skills.ts', 'src/server/story/development/engine.ts', 'src/server/story/development/rubric.ts'], verifiedBy: ['tests/unit/development-strategy.test.ts', 'tests/unit/development-pipeline.test.ts'] },
  { id: 'audience-experience-review', name: 'The audience’s experience, second by second', path: 'skills/audience-experience-review', source: 'this studio; docs/CONTRACTS-AUTO-IDEA.md §2 (engagement rubric)', supportedModels: ['Qwen3.8-27B-NVFP4', 'any JSON-capable LLM'], requiredTools: ['story.structured_answer'], kind: 'PROMPT',
    implementedBy: ['src/server/org/skills.ts', 'src/server/story/development/engine.ts', 'src/server/story/development/rubric.ts'], verifiedBy: ['tests/unit/development-strategy.test.ts', 'tests/unit/development-pipeline.test.ts'] },
  { id: 'minimax-multimodal-toolkit', name: 'MiniMax mmx-cli (hosted API, reference)', path: 'skills/minimax-multimodal-toolkit', source: 'github.com/MiniMax-AI/skills (folder minimax-multimodal-toolkit, skill mmx-cli)', supportedModels: ['MiniMax-Hailuo-2.3', 'speech-2.8-hd', 'music-2.5', 'image-01'], requiredTools: [], kind: 'REFERENCE', implementedBy: [], verifiedBy: [], requires: MINIMAX_KEY },
  { id: 'minimax-music-gen', name: 'MiniMax music generation (hosted, reference)', path: 'skills/minimax-music-gen', source: 'github.com/MiniMax-AI/skills (folder minimax-music-gen)', supportedModels: ['music-2.5'], requiredTools: [], kind: 'REFERENCE', implementedBy: [], verifiedBy: [], requires: MINIMAX_KEY },
];

// --------------------------------------------------------------------------------------------------------- agents

const S = (text: string) => text.replace(/\s+/g, ' ').trim();
const STEP_ONLY = { jobTypes: [] as JobType[], limits: { timeoutMs: 60_000, maxAttempts: 1, resource: 'NONE' as ResourceFamily } };
const W = (file: string) => `src/worker/${file}`;

export const AGENTS: AgentDef[] = [
  // Executive Office
  { id: 'executive-producer', name: 'Executive Producer', department: 'EXECUTIVE', role: 'Director: feasibility before anything is generated',
    description: 'Runs the feasibility preflight before a take is generated, before scenes are planned and before a new character’s portrait or voice is queued: the plan resolves (scene, place, cast), the prompt has words, duration and reference counts are inside MiniMax H3’s limits, every speaker has a recording, a continuation has its source, a character is not locked and has the reference it needs. A failed check refuses the work with its failure class before any engine is called.',
    systemInstructions: S(`Refuse what cannot succeed before an engine is touched; name the failed check and its failure class; a refusal is corrected by the producer, never retried blindly.`),
    model: 'rule set (src/server/org/preflight.ts)', skills: ['h3-prompting'], tools: [], inputSchema: 'Production, Shot', outputSchema: 'Preflight', version: '2.0.0',
    qualityRequirements: ['every failed check names its failure class', 'no engine call for a refused request'], ...STEP_ONLY,
    steps: [
      { id: 'take-preflight', name: 'Feasibility preflight of a take', where: W('handlers/take.ts') },
      { id: 'plan-preflight', name: 'Feasibility preflight of a shot plan', where: W('handlers/story.ts') },
      { id: 'character-preflight', name: 'Feasibility preflight of a character step', where: W('handlers/character.ts') },
    ] },
  { id: 'production-coordinator', name: 'Production Coordinator', department: 'EXECUTIVE', role: 'Runs a production through its jobs (PRODUCE)',
    description: 'Executes PRODUCE: queues an opening frame (never for a continuation, which starts from the previous take’s tail) and a take for every shot without an accepted take as durable child jobs with idempotency keys, adopts the children still working after a restart, generates the first shot of every unproven scene alone as its pilot and queues the scene’s other shots only after the pilot passed its checks, queues a continuation only after the take it continues was accepted, waits, and queues the assembly when every shot has a take. Refuses to start before the story is approved.',
    systemInstructions: S(`Queue durable jobs with idempotency keys, adopt in-flight children after a restart; a pilot shot per scene first, the rest of the scene only after it passed; a continuation only after the take it continues was accepted; one failed scene does not stop the others, and the summary says what is left and why.`),
    model: 'deterministic orchestrator (src/worker/handlers/produce.ts)', skills: [], tools: ['jobs.enqueue'], inputSchema: 'JOB_PAYLOADS.PRODUCE', outputSchema: 'production round summary', limits: { timeoutMs: 7_200_000, maxAttempts: 3, resource: 'CPU' }, version: '2.2.0',
    qualityRequirements: ['no duplicate generation in flight for one shot'], jobTypes: ['PRODUCE'], steps: [] },
  // Story Development
  { id: 'head-of-story', name: 'Head of Story', department: 'STORY', role: 'Director: story development',
    description: 'Executes AUTO_IDEA as the research-driven development: each stage is a durable child job with an idempotency key, run by its own agent — trend research, audience analysis, three concepts, the first draft, the story editor’s and the audience’s reviews, at most one revision — and the proposal is assembled with its development dossier (coverage per platform, sources, patterns, concepts, reviews), every stage handed on with its checks; research failing never fails the idea. Executes DEVELOP_STORY (logline, synopsis, scene breakdown with purpose, emotional objective, entry and exit states; new characters and places with full designs), writes it into the studio and records the STORY handoff.',
    systemInstructions: S(`From the producer's brief and the show's World Bible, develop the story: logline, synopsis, scene breakdown with purpose, emotional objective, entry and exit states. An episode is carried by its show's regulars; outside characters only when the brief names them.`),
    model: 'Qwen3.8-27B-NVFP4 (vLLM) for DEVELOP_STORY; deterministic orchestrator for AUTO_IDEA', skills: ['screenwriting'], tools: ['story.structured_answer', 'jobs.enqueue'], inputSchema: 'JOB_PAYLOADS.DEVELOP_STORY / AUTO_IDEA', outputSchema: 'DevelopResult / { proposalId, title, steps: DevelopmentStep[] }', limits: { timeoutMs: 600_000, maxAttempts: 3, resource: 'LLM' }, version: '3.0.0',
    qualityRequirements: ['every scene located and cast by id', 'no characters from outside the offered cast', 'every development stage reported as done, skipped (why) or failed (class)', 'revision at most once'], jobTypes: ['DEVELOP_STORY', 'AUTO_IDEA'], steps: [] },
  { id: 'screenwriter', name: 'Screenwriter', department: 'STORY', role: 'Scripts and dialogue',
    description: 'Executes WRITE_SCRIPT: beats and lines for every scene in batches of four, in the production’s language and dialect with an English gloss (a second translation call fills a missing gloss), and records the SCRIPT handoff. Executes IDEA_WRITE: the Auto Idea’s chosen concept as the full proposal by the format’s strategy (an Arabic story written in its dialect first, then glossed), with the hook, the ending and a few lines that set the voice; given the two reviews, the one revision, saying what each note became.',
    systemInstructions: S(`Write what we see (present tense, filmable in seconds) and short lines (spoken in under 6 s). Arabic productions: the dialect in textAr, a faithful English gloss in text. Never paraphrase an approved line later.`),
    model: 'Qwen3.8-27B-NVFP4 (vLLM)', skills: ['screenwriting', 'iraqi-dialogue', 'story-formats'], tools: ['story.structured_answer'], inputSchema: 'JOB_PAYLOADS.WRITE_SCRIPT / IDEA_WRITE', outputSchema: 'ScriptResult / DraftContent', limits: { timeoutMs: 600_000, maxAttempts: 3, resource: 'LLM' }, version: '2.2.0',
    qualityRequirements: ['every line glossed', 'no line over 28 words', 'a proposal follows its format’s strategy'], jobTypes: ['WRITE_SCRIPT', 'IDEA_WRITE'], steps: [] },
  { id: 'trend-research', name: 'Trend Research Agent', department: 'STORY', role: 'What audiences watch now, from permitted sources',
    description: 'Executes IDEA_RESEARCH: plans at most three topics from the request (the format, the genre — a continuing show’s own genre — and measured attention), queries every platform in the producer’s order (TikTok, Instagram, Facebook, YouTube, then news and Wikipedia) through its permitted access path only, cache first, and records the run: every platform’s coverage with the reason when it was not reached, the items with their URLs, dates and only the metrics the source returned. Nothing is scraped and nothing is invented.',
    systemInstructions: S(`Official APIs and permitted public access only; a platform without credentials is NOT_CONFIGURED and one without a permitted path UNSUPPORTED, recorded with the reason; never an invented item, metric or URL; news within 14 days; a chart as of the fetch.`),
    model: 'deterministic topic planner + TikTok Research API / Instagram Graph / YouTube Data API v3 (with credentials), GDELT DOC 2.0 and Wikimedia pageviews + Wikidata (keyless)', skills: ['trend-research'], tools: ['research.plan_topics', 'research.query_source', 'research.store_evidence'], inputSchema: 'JOB_PAYLOADS.IDEA_RESEARCH', outputSchema: 'ResearchRunSummary', limits: { timeoutMs: 600_000, maxAttempts: 2, resource: 'HOSTED' }, version: '1.0.0',
    qualityRequirements: ['coverage of all six platforms in priority order, every status explained', 'every item has its URL and dates and only the source’s own metrics', 'cache reuse counted'], jobTypes: ['IDEA_RESEARCH'], steps: [] },
  { id: 'audience-research', name: 'Audience Research Agent', department: 'STORY', role: 'Evidence into storytelling patterns',
    description: 'Executes IDEA_AUDIENCE: reads the run’s evidence and writes the audience and four to six storytelling patterns, each citing the items it rests on, with what was measured kept apart from what is interpreted. In code afterwards: a citation of an item that does not exist is dropped, a number that is not in a cited item’s metrics is removed and the pattern downgraded to interpretation only, a pattern without evidence is labelled craft knowledge, and the cautions say that views measure reach, not quality.',
    systemInstructions: S(`Measure only what a source measured: a number appears under "measured" only when a cited item's metrics hold it; everything else is interpretation, labelled as such; without evidence, say it is storytelling craft.`),
    model: 'Qwen3.8-27B-NVFP4 (vLLM)', skills: ['audience-analysis'], tools: ['story.structured_answer'], inputSchema: 'JOB_PAYLOADS.IDEA_AUDIENCE', outputSchema: 'AudienceAnalysis', limits: { timeoutMs: 600_000, maxAttempts: 2, resource: 'LLM' }, version: '1.0.0',
    qualityRequirements: ['every evidence id exists in the run', 'every measured number traceable to a cited item'], jobTypes: ['IDEA_AUDIENCE'], steps: [] },
  { id: 'creative-concept', name: 'Creative Concept Agent', department: 'STORY', role: 'Three original concepts and the choice',
    description: 'Executes IDEA_CONCEPTS: three distinct concepts on the audience patterns and, for a season or an episode, the show’s history — each with its hook, why it works, the patterns it uses, what is new and the risks — then the choice with its rationale. In code afterwards: every concept is checked against every researched title (token similarity), creator and known franchise; a failing concept is never chosen (one more round when all three fail), and the rationale names the patterns it builds on.',
    systemInstructions: S(`Original concepts only: research shows what an audience responds to, never material to copy — no researched title, creator, celebrity or franchise. Three different premises, not three variations; the hook is what the first seconds show.`),
    model: 'Qwen3.8-27B-NVFP4 (vLLM)', skills: ['creative-concepts', 'story-formats'], tools: ['story.structured_answer'], inputSchema: 'JOB_PAYLOADS.IDEA_CONCEPTS', outputSchema: 'ConceptSet', limits: { timeoutMs: 600_000, maxAttempts: 2, resource: 'LLM' }, version: '1.0.0',
    qualityRequirements: ['the chosen concept passed the originality check', 'the rationale names its patterns'], jobTypes: ['IDEA_CONCEPTS'], steps: [] },
  { id: 'story-editor', name: 'Story Editor', department: 'STORY', role: 'Craft review of a draft',
    description: 'Executes IDEA_REVIEW for the story editor: scores the draft on the format’s rubric (clarity, character, conflict, progression, ending, dialogue, continuity with the show, the song’s fit, originality) and lists issues with their fixes. The studio adds its own checks — the structure’s size for the format, an Arabic story actually written in its dialect, a show’s language, returning cast and open storylines kept, a music video’s tagged song, the title’s originality — and a MAJOR issue means REVISE.',
    systemInstructions: S(`Read for craft against the format's rubric; MAJOR only when the story fails its format or audience without the fix; every issue names where it is and how to fix it.`),
    model: 'Qwen3.8-27B-NVFP4 (vLLM)', skills: ['story-review'], tools: ['story.structured_answer'], inputSchema: 'JOB_PAYLOADS.IDEA_REVIEW (STORY_EDITOR)', outputSchema: 'StoryReview', limits: { timeoutMs: 600_000, maxAttempts: 2, resource: 'LLM' }, version: '1.0.0',
    qualityRequirements: ['scores only on the format’s criteria', 'a MAJOR issue triggers the one revision'], jobTypes: ['IDEA_REVIEW'], steps: [] },
  { id: 'audience-experience', name: 'Audience Experience Agent', department: 'STORY', role: 'The viewer’s experience of a draft',
    description: 'Executes IDEA_REVIEW for the audience (the payload names the reviewer): reads the draft as the viewer, second by second — whether the first seconds earn attention, curiosity, emotion, pacing, how it reads visually, whether the ending pays off — and flags manipulative retention tricks, arbitrary twists and needless cliffhangers. The studio adds its checks (a hook delivered by the first scene, an ending, a short’s scene count for its seconds); a MAJOR issue means REVISE.',
    systemInstructions: S(`Read as the audience: attention in the first 3–5 seconds, curiosity, emotion, no dead air, a visual story, an ending that pays off; never reward manipulation, arbitrary twists or needless cliffhangers.`),
    model: 'Qwen3.8-27B-NVFP4 (vLLM)', skills: ['audience-experience-review'], tools: ['story.structured_answer'], inputSchema: 'JOB_PAYLOADS.IDEA_REVIEW (AUDIENCE_EXPERIENCE)', outputSchema: 'StoryReview', limits: { timeoutMs: 600_000, maxAttempts: 2, resource: 'LLM' }, version: '1.0.0',
    qualityRequirements: ['scores only on the format’s criteria', 'a MAJOR issue triggers the one revision'], jobTypes: [], payloadRoutes: [{ jobType: 'IDEA_REVIEW', when: 'audienceExperience' }], steps: [] },
  { id: 'continuity-writer', name: 'Continuity Writer', department: 'STORY', role: 'The show’s story bible',
    description: 'Executes EPISODE_CONTINUITY after an episode is cut: the events later episodes must respect, changed relationships and open storylines go into the show’s bible timeline (a re-cut replaces its own entries).',
    systemInstructions: S(`After each episode, record the events and states later episodes must respect in the show's World Bible timeline. Facts, not opinions.`),
    model: 'Qwen3.8-27B-NVFP4 (vLLM)', skills: ['world-continuity'], tools: ['story.structured_answer'], inputSchema: 'JOB_PAYLOADS.EPISODE_CONTINUITY', outputSchema: 'ContinuityUpdate', limits: { timeoutMs: 300_000, maxAttempts: 2, resource: 'LLM' }, version: '1.2.0',
    qualityRequirements: ['timeline entries per finished episode'], jobTypes: ['EPISODE_CONTINUITY'], steps: [] },
  // Casting & Character Design
  { id: 'casting-director', name: 'Casting Director', department: 'CASTING', role: 'Director: who is in the cast and how they are made',
    description: 'Executes DESIGN_CHARACTER (a complete appearance and voice profile from a brief, a name or a partial sheet; the producer’s own fields win) and CREATE_CHARACTER (the chain design → one canonical front full-body image → voice as durable child jobs with idempotency keys — from a picture, the picture is read first and the design is given its apparent age, sex and visible clothing so it never contradicts it — ending “awaiting your approval”: the image becomes the character’s identity only when the producer approves it; secondary material is never part of creation, only made on request; every step reported as done, skipped with its reason, or failed with its class).',
    systemInstructions: S(`Design one original character from the brief: every appearance field concrete enough to draw from and written in English (build, face, hair, skin, eyes, and a wardrobe naming every garment with its colour and the footwear; facial hair stated exactly, e.g. "moustache only, clean-shaven chin"; a culturally specific garment with its cut and length, e.g. "ankle-length dishdasha"), one distinguishing detail that survives every shot (a one-sided detail says which of the character's own sides), a personality and a speaking voice. When the look is a reference picture you cannot see, design only who the character is and leave the look to the picture; when the brief says what a vision model saw in it (apparent age, sex, what is worn), the sex and age are those and the role, personality and voice never contradict it. Keep every field the producer already wrote exactly; never copy the look or name of an existing character.`),
    model: 'Qwen3.8-27B-NVFP4 (vLLM) for the design call; deterministic orchestrator for the creation chain', skills: ['character-design'], tools: ['story.structured_answer', 'jobs.enqueue'], inputSchema: 'JOB_PAYLOADS.DESIGN_CHARACTER / CREATE_CHARACTER', outputSchema: 'CharacterDesign / CreateCharacterResult', limits: { timeoutMs: 3_600_000, maxAttempts: 3, resource: 'LLM' }, version: '2.0.0',
    qualityRequirements: ['a designed character has every appearance field, in English', 'every creation step reported as done, skipped (why) or failed (class)', 'creation ends with the image awaiting the producer’s approval'], jobTypes: ['DESIGN_CHARACTER', 'CREATE_CHARACTER'], steps: [] },
  { id: 'character-designer', name: 'Character Designer', department: 'CASTING', role: 'The canonical character image',
    description: 'Executes CHARACTER_APPEARANCE: the character’s one canonical front full-body image — from the English identity line (Qwen-Image-2512, quality mode), or from the producer’s validated reference picture, read first (face box and a Qwen3.5-4B description that writes the identity line; in a creation from a picture this reading is done before the design, stored on the picture and reused) and redrawn into the production’s style (Qwen-Image-Edit-2511); a picture whose figure is not whole in the frame is redrawn once, then left for the producer with the reason; the image waits for the producer’s approval. CHARACTER_REFS draws optional secondary material on request — an expression sheet, the outfit or a close-up portrait — each in one Qwen-Image-Edit-2511 pass with the canonical image as its only reference, stored as SECONDARY: never part of creation, never the identity, and no other view is drawn.',
    systemInstructions: S(`Describe the character by appearance, never by name; the medium first, then one whole standing figure head to feet with margin on a plain background; an uploaded picture is read, never guessed; one identity, recorded with its seed and references. Secondary material is drawn only on request, from the canonical image alone, and never replaces it.`),
    model: 'Qwen-Image-2512 / Qwen-Image-Edit-2511 / Qwen3.5-4B (ComfyUI)', skills: ['character-design', 'world-continuity'], tools: ['image.generate', 'image.edit_with_references', 'image.describe_reference'], inputSchema: 'JOB_PAYLOADS.CHARACTER_APPEARANCE / CHARACTER_REFS', outputSchema: 'canonical image / secondary material', limits: { timeoutMs: 1_200_000, maxAttempts: 2, resource: 'GPU_IMAGE' }, version: '2.1.0',
    qualityRequirements: ['the style is the production’s (a cartoon is never a photograph)', 'the whole figure is in the frame, head to feet', 'an uploaded picture’s look is read, never invented', 'seed and references recorded', 'secondary material: one pass per kind from the canonical image, tier SECONDARY'], jobTypes: ['CHARACTER_APPEARANCE', 'CHARACTER_REFS'],
    steps: [{ id: 'reference-read', name: 'Reading the reference picture before the design', where: W('handlers/character.ts') }] },
  { id: 'voice-casting', name: 'Voice Casting Agent', department: 'CASTING', role: 'Persistent voice identity: designed or consented',
    description: 'Executes VOICE_DESIGN (three synthetic candidate voices from a description, each measured — CER, loudness, true peak, clipping, ≤ 11.5 s — and heard through the line engine with its ECAPA similarity; the producer chooses one), VOICE_BUILD (from a consented reference recording, a chosen design candidate, or AUTOMATIC: a consented recording, else an English or MSA voice designed from the profile, labelled synthetic and picked by the measurements under Rule V-DESIGN; an Iraqi voice only from a consented Iraqi recording; then a proof line spoken with the parameters that will be pinned, heard back and measured, and proof and identity written in one batch) and VOICE_PREVIEW (one line in the character’s voice, heard back and measured). Naturalness and dialect are recorded only from a person’s listening.',
    systemInstructions: S(`Clone only from a consented recording or a studio design seed whose sha256 matches its design record (Rule V-DESIGN), never from a generated line, a bundled sample or an unrecorded synthetic file; speak a proof line with the parameters that will be pinned; verify by transcription in the line's language; record every number; never call a voice natural or Iraqi — a listener does; a build that fails leaves the character untouched.`),
    model: 'VoxCPM2 + ECAPA (design) / IndexTTS 2.5 / Habibi-TTS IRQ + faster-whisper (MiniMax clone with a key)', skills: ['voice-identity', 'iraqi-dialogue'], tools: ['speech.synthesize', 'speech.clone_voice', 'speech.transcribe', 'speech.transcribe_qwen', 'speech.design_voice', 'speech.embed_voice'], inputSchema: 'JOB_PAYLOADS.VOICE_DESIGN / VOICE_BUILD / VOICE_PREVIEW', outputSchema: 'VoiceDesignRecord / VoiceIdentity + proof', limits: { timeoutMs: 1_800_000, maxAttempts: 2, resource: 'TTS' }, version: '2.0.0',
    qualityRequirements: ['proof line coverage ≥ 0.85 and CER ≤ 0.15 (WER reported)', 'reference is a consented upload or a recorded design seed', 'identity written only with its proof', 'every candidate measured before it is chosen'], jobTypes: ['VOICE_DESIGN', 'VOICE_BUILD', 'VOICE_PREVIEW'], steps: [] },
  { id: 'character-continuity', name: 'Character Continuity Agent', department: 'CASTING', role: 'Identity references for every shot',
    description: 'Hands each shot’s characters’ canonical images to the reference conditioning when a take is generated (identity hand-off) — every character in the shot, continuations included, within the nine-picture budget — enforces the identity re-application rule on the request before the engine is asked (each present character’s canonical image and the place’s plate connected and bound, or MISSING_REFERENCE), and checks an uploaded reference picture before a character is drawn from it.',
    systemInstructions: S(`For every shot, hand the canonical image (else the legacy portrait) of each character in it to the reference conditioning, in the shot's order, within the picture budget (the place keeps its slot; characters beyond it are named); refuse the request before the engine when a present character's image or the place's plate is not connected and bound (the identity re-application rule); a bundled sample, an SVG or a shot-specific frame is never an identity reference.`),
    model: 'rule set', skills: ['world-continuity'], tools: [], inputSchema: 'Shot, cast', outputSchema: 'identity references', version: '2.2.0',
    qualityRequirements: ['no bundled sample as an identity reference', 'every present character’s canonical image and the plate on every take, or a refusal'], ...STEP_ONLY,
    steps: [
      { id: 'identity-handoff', name: 'Identity hand-off for a shot', where: W('handlers/take.ts') },
      { id: 'identity-rule', name: 'The identity re-application rule on the request', where: W('handlers/take.ts') },
      { id: 'reference-picture-check', name: 'Reference picture check before drawing', where: W('handlers/images.ts') },
    ] },
  // World Building & Art Direction
  { id: 'art-director', name: 'Art Director', department: 'WORLD', role: 'Director: hand-off review of the places',
    description: 'Reviews the plates of a place before they are handed to pre-production: a master plate and at least one view must exist; the CAST_WORLD handoff carries the result.',
    systemInstructions: S(`A place is handed on only with its master plate and its views; a missing plate is named in the handoff.`),
    model: 'rule set', skills: ['world-continuity'], tools: [], inputSchema: 'Location', outputSchema: 'handoff checks', version: '2.0.0',
    qualityRequirements: ['every handed-off place has a master plate and a view'], ...STEP_ONLY,
    steps: [{ id: 'plate-handoff-review', name: 'Plate hand-off review', where: W('handlers/images.ts') }] },
  { id: 'environment-artist', name: 'Environment Artist', department: 'WORLD', role: 'Location plates',
    description: 'Executes LOCATION_PLATES: the master plate (unoccupied), a closer view towards the first landmark drawn from it, and up to three time-of-day states. No reverse angle yet: the edit model keeps the master’s composition.',
    systemInstructions: S(`Plates show the place before anyone arrives: pure environment and props, the same architecture in every view.`),
    model: 'Qwen-Image-2512 / Qwen-Image-Edit-2511 (ComfyUI)', skills: ['world-continuity'], tools: ['image.generate', 'image.edit_with_references'], inputSchema: 'JOB_PAYLOADS.LOCATION_PLATES', outputSchema: 'location plates', limits: { timeoutMs: 1_200_000, maxAttempts: 2, resource: 'GPU_IMAGE' }, version: '1.2.0',
    qualityRequirements: ['no figures in a plate'], jobTypes: ['LOCATION_PLATES'], steps: [] },
  { id: 'world-continuity', name: 'World Continuity', department: 'WORLD', role: 'The World Bible: pinned revisions, places reused on return',
    description: 'Keeps the World Bible: a structured, versioned record per show (or per short and music video) of the characters with their canonical images and voice identities, relationships, places with their plates, architecture and layout, props, wardrobe, the story timeline, light and weather, each scene’s end state, the world’s rules and the audio policy. Writes a revision whenever the world changes (after story development, the shot plan and an episode’s continuity record); pins a production to the revision its approved story is made against at its first production run, and moves the pin only when nothing the production already filmed would change; gives every take the place’s plate the bible chooses (an established frame of an approved take before a drawn plate, by id) and the pinned canonical images, and records what the take read; registers the frames an approved cut establishes, so a returning place is filmed against what the audience saw.',
    systemInstructions: S(`One world per show (or per short and music video), in append-only revisions; a production reads the revision its story was approved against and follows a newer one only when nothing it already filmed would change; a returning place is filmed against its established frames or plates by id, never redrawn from a description; every take records the revision it read.`),
    model: 'rule set (src/domain/world.ts, src/domain/location.ts, src/server/world, src/server/production/location-rule.ts)', skills: ['world-continuity'], tools: [], inputSchema: 'Production, World Bible revision', outputSchema: 'WorldRevision / WorldPin / WorldRead', version: '1.1.0',
    qualityRequirements: ['every take records the World Bible revision it read', 'a returning place is filmed against its plates by id', 'revisions are append-only', 'a place without a plate is never filmed from words: refused, or established by the scene’s own declaration'], ...STEP_ONLY,
    steps: [
      { id: 'world-sync', name: 'World Bible revision after the story changes', where: W('handlers/story.ts') },
      { id: 'world-pin', name: 'World Bible pin of a production', where: W('handlers/produce.ts') },
      { id: 'world-read', name: 'World Bible read for a take', where: W('handlers/take.ts') },
      { id: 'establish-locations', name: 'Established frames of an approved cut', where: W('handlers/assemble.ts') },
      { id: 'establish-here', name: 'A place established by its first take (the scene marked "establish here")', where: W('handlers/take.ts') },
      { id: 'drift-check', name: 'The take’s place measured against its canonical plate', where: W('handlers/take.ts') },
    ] },
  // Pre-Production
  { id: 'film-director', name: 'Film Director', department: 'PREPRODUCTION', role: 'Director: the shot plan',
    description: 'Executes PLAN_SHOTS: one structured call per scene for shots with purpose, staging, framing, camera move, duration, line assignment, continuity states and a generation prompt; for a music video it also assigns the singing per section and copies it onto the shots. Records the SHOT_PLAN handoff.',
    systemInstructions: S(`Every shot has a purpose; faces close when someone is on screen; keep the 180° line; mark continuation, cut or story transition; no shot without a reason.`),
    model: 'Qwen3.8-27B-NVFP4 (vLLM)', skills: ['shot-planning'], tools: ['story.structured_answer'], inputSchema: 'JOB_PAYLOADS.PLAN_SHOTS', outputSchema: 'PlannedShot[] per scene', limits: { timeoutMs: 900_000, maxAttempts: 3, resource: 'LLM' }, version: '2.1.0',
    qualityRequirements: ['every line assigned to exactly one shot', 'durations 3–15 s'], jobTypes: ['PLAN_SHOTS'], steps: [] },
  { id: 'storyboard-artist', name: 'Storyboard Artist', department: 'PREPRODUCTION', role: 'Opening frames',
    description: 'Executes SHOT_FRAMES: the opening (and on request the ending) frame of a shot from the location plate and up to two characters’ canonical images, in the production’s cast order left to right; the vision model counts the people in the frame and a frame with strangers or someone missing is drawn once more; records the STORYBOARD handoff when every shot has a frame.',
    systemInstructions: S(`Image 1 is the exact place; the following images are the people: keep face, hair, skin and wardrobe exactly. Exactly the shot's people, in the cast order from left to right, and nobody else.`),
    model: 'Qwen-Image-Edit-2511 + Qwen3.5-4B (ComfyUI)', skills: ['world-continuity'], tools: ['image.generate', 'image.edit_with_references', 'image.describe_reference'], inputSchema: 'JOB_PAYLOADS.SHOT_FRAMES', outputSchema: 'frame asset ids', limits: { timeoutMs: 600_000, maxAttempts: 2, resource: 'GPU_IMAGE' }, version: '1.3.0',
    qualityRequirements: ['frame built from the plate and the people when they exist', 'the people counted in the frame are the shot’s people (one redraw, then reported)'], jobTypes: ['SHOT_FRAMES'], steps: [] },
  { id: 'shot-planner', name: 'Shot Planner', department: 'PREPRODUCTION', role: 'Timing fit of a planned scene',
    description: 'Fits the planned shots of a scene to its running-time budget: when the plan comes in under 90 % of the budget, every shot is stretched by the same factor (whole seconds, 3–10 s per shot).',
    systemInstructions: S(`Longer shots, not more shots: stretch the plan evenly to fill at least 90 % of the scene's budget; never above the per-shot cap.`),
    model: 'deterministic (fitDurations)', skills: ['shot-planning'], tools: [], inputSchema: 'planned shots, budget', outputSchema: 'planned shots', version: '2.0.0',
    qualityRequirements: ['budget filled ≥ 90 % unless every shot is at the cap'], ...STEP_ONLY,
    steps: [{ id: 'timing-fit', name: 'Timing fit of a scene', where: W('handlers/story.ts') }] },
  // Video Production
  { id: 'minimax-video-specialist', name: 'MiniMax Video Specialist', department: 'VIDEO', role: 'Director: the MiniMax H3 take',
    description: 'Executes GENERATE_TAKE: records the shot’s missing lines first (sound first), sets the length from the words, builds the MiniMax H3 request (prompt with the exact lines, pictures, audio and guides, seed), runs it under the GPU lease (or the hosted API), and records the take with full provenance.',
    systemInstructions: S(`MiniMax only. Every shot with a character or a place on the reference graph: the canonical images and the plate bound in the prompt (<Subject k> is the … in <Picture k>), the exact script lines in <d> tags spoken by their bound subject; a continuation anchors the previous take's last 22 frames and their sound at frame 0, a cut or story transition anchors its drawn opening frame; recorded lines as guides at the first new frame; length from the words, snapped up to the engine's grid; prompt linted; seed recorded.`),
    model: 'MiniMax-H3 (local, ComfyUI 0.38.1, int8 pruned; final tier = base model 20 steps, draft tier = turbo LoRA on request) / hosted MiniMax when a key exists', skills: ['h3-prompting', 'audio-first-dialogue'], tools: ['video.minimax_generate', 'speech.synthesize', 'speech.transcribe', 'media.probe', 'image.generate', 'image.edit_with_references', 'image.describe_reference', 'speech.transcribe_qwen'], inputSchema: 'JOB_PAYLOADS.GENERATE_TAKE', outputSchema: 'Take', limits: { timeoutMs: 10_800_000, maxAttempts: 3, resource: 'GPU_VIDEO' }, version: '3.2.0',
    qualityRequirements: ['provenance complete', 'no paraphrased dialogue'], jobTypes: ['GENERATE_TAKE'], steps: [] },
  { id: 'lipsync-corrector', name: 'Lip-Sync Corrector', department: 'VIDEO', role: 'Mouth correction of a confirmed take',
    description: 'Executes CORRECT_LIPSYNC for one take the producer confirmed after a failed lip-sync review: checks that the take may be corrected (style, one speaker, the authoritative soundtrack, length, face size), redraws only the mouth region to the recorded line under the LIPSYNC GPU lease (LatentSync 1.6 with a YuNet + MediaPipe face tracker), measures the result against the original take and records it as a new take beside it, accepted or rejected with its numbers. Never generates video.',
    systemInstructions: S(`Only on a confirmed request; never a face that resembles another character more than the speaker; nothing outside the mouth region changes; the original take is kept; a correction that changes the face is rejected, never chosen.`),
    model: 'LatentSync 1.6 (ByteDance, OpenRAIL++-M) + YuNet/SFace/MediaPipe', skills: ['take-inspection'], tools: ['video.lipsync_correct'], inputSchema: 'JOB_PAYLOADS.CORRECT_LIPSYNC', outputSchema: 'Take', limits: { timeoutMs: 1_800_000, maxAttempts: 2, resource: 'GPU_VIDEO' }, version: '1.0.0',
    qualityRequirements: ['same frame count', 'same face as the original take', 'mouth follows the audio no worse than before'], jobTypes: ['CORRECT_LIPSYNC'], steps: [] },
  { id: 'reference-conditioning', name: 'Reference Conditioning Agent', department: 'VIDEO', role: 'Selects the references of a take',
    description: 'Chooses what MiniMax H3 is conditioned on for a take, by the shot’s relation to the previous one: on every shot with a character or a place, the characters’ canonical images and the plate for the scene’s time of day as bound reference pictures; a continuation’s previous tail (frames and sound) or a cut’s drawn opening frame anchored at frame 0, an ending frame at the last frame; the speakers’ voice samples as bound audio references when the shot has no recorded soundtrack; for the hosted API, one of reference mode or frame mode, never both.',
    systemInstructions: S(`Characters' canonical images first, in the shot's order; then the plate; then the drawn opening frame as a picture (never an identity); anchors on the timeline for the opening frame, a continuation's tail with its sound, an ending frame; voice samples for speakers only without a soundtrack; never a bundled sample picture; at most 9 pictures, 3 audio references and 4 guides.`),
    model: 'rule set', skills: ['h3-prompting'], tools: [], inputSchema: 'Shot, identity references, voices', outputSchema: 'conditioning set', version: '2.1.0',
    qualityRequirements: ['references within the engine’s limits'], ...STEP_ONLY,
    steps: [{ id: 'reference-selection', name: 'Reference selection for a take', where: W('handlers/take.ts') }] },
  // Sound & Music
  { id: 'dialogue-director', name: 'Dialogue Director', department: 'SOUND', role: 'Director: recorded dialogue',
    description: 'Executes DIALOGUE_AUDIO: records every line without a current recording in its character’s pinned voice, hears each back, regenerates a drifting line once and flags the rest; records the AUDIO_PREP handoff.',
    systemInstructions: S(`Record in the line's language with the character's pinned voice; verify by transcription; a flagged or unheard line goes to review, never silently accepted.`),
    model: 'IndexTTS 2.5 / Habibi-TTS IRQ + faster-whisper', skills: ['audio-first-dialogue', 'iraqi-dialogue', 'voice-identity'], tools: ['speech.synthesize', 'speech.transcribe', 'speech.transcribe_qwen'], inputSchema: 'JOB_PAYLOADS.DIALOGUE_AUDIO', outputSchema: 'recorded lines', limits: { timeoutMs: 1_800_000, maxAttempts: 2, resource: 'TTS' }, version: '1.2.0',
    qualityRequirements: ['every line transcribed back'], jobTypes: ['DIALOGUE_AUDIO'], steps: [] },
  { id: 'music-director', name: 'Music Director', department: 'SOUND', role: 'Songs',
    description: 'Executes WRITE_SONG (the planner writes the song: concept, structure, lyrics, tempo, key and who sings each section — only characters cast as singers) and GENERATE_SONG (ONE recording with ACE-Step 1.5 XL-SFT + the 5Hz LM 4B, the named singers’ vocal; stems; the written lines placed on the sung vocal; loudness and dead air measured, a true peak above −1 dBTP trimmed in the open) and CHECK_SONG (the same checks on the existing recording, never composing again); records the AUDIO_PREP handoff.',
    systemInstructions: S(`Write one original singable song for the named singers only; then record it once with ACE-Step 1.5 XL-SFT; stems; align the written lines to the sung vocal; measure, never hide.`),
    model: 'Qwen3.8-27B-NVFP4 (vLLM) for the song plan; ACE-Step 1.5 XL-SFT + 5Hz LM 4B (ComfyUI) + Demucs + faster-whisper', skills: ['singing-performance'], tools: ['story.structured_answer', 'music.generate', 'audio.separate_stems', 'speech.transcribe', 'lyrics.align'], inputSchema: 'JOB_PAYLOADS.WRITE_SONG / GENERATE_SONG / CHECK_SONG', outputSchema: 'song plan / song asset + stems', limits: { timeoutMs: 1_800_000, maxAttempts: 2, resource: 'GPU_IMAGE' }, version: '2.0.0',
    qualityRequirements: ['every sung section names a singer who sings', 'stems present', 'lyrics placed on the vocal', 'loudness −20…−8 LUFS, true peak ≤ 0 dBTP'], jobTypes: ['WRITE_SONG', 'GENERATE_SONG', 'CHECK_SONG'], steps: [] },
  { id: 'sound-designer', name: 'Sound Designer', department: 'SOUND', role: 'The places’ ambience',
    description: 'Executes AMBIENCE: one ambience bed per place with MOSS-SoundEffect v2, described from the place and the time and weather its scenes play in (never speech, never music); measures its loudness and true peak, keeps it in the library and on the place, and the World Bible carries it to every production there. One request, one recording: no best-of.',
    systemInstructions: S(`Describe what the place sounds like at that time and in that weather — the room, the air, the distant life — never voices, never music; record it once; measure it; a silent or clipped bed is refused, never kept.`),
    model: 'MOSS-SoundEffect v2.0 (1.3B DiT, sfx-moss) + Qwen3-ASR (no voices in a bed)', skills: ['world-continuity'], tools: ['audio.generate_effect', 'speech.transcribe_qwen'], inputSchema: 'JOB_PAYLOADS.AMBIENCE', outputSchema: 'LocationAmbience', limits: { timeoutMs: 900_000, maxAttempts: 2, resource: 'SFX' }, version: '1.0.0',
    qualityRequirements: ['no speech or music in a bed', 'loudness measured on the stored file', 'true peak ≤ −1 dBTP'], jobTypes: ['AMBIENCE'], steps: [] },
  { id: 'singing-performance', name: 'Singing Performance Agent', department: 'SOUND', role: 'Who sings which section',
    description: 'Executes PLAN_SHOTS with performanceOnly on a music video: aligns the lyrics to the vocal stem, assigns each section to its singers (solo, duet, alternating, ensemble, instrumental) and copies the assignment onto the shots by song window.',
    systemInstructions: S(`A wizard's "everyone sings everything" is a placeholder, not a decision: decide from the lyrics and the story; only an assigned performer sings in a shot.`),
    model: 'Qwen3.8-27B-NVFP4 (vLLM) + faster-whisper', skills: ['singing-performance'], tools: ['story.structured_answer', 'speech.transcribe', 'lyrics.align'], inputSchema: 'JOB_PAYLOADS.PLAN_SHOTS (performanceOnly)', outputSchema: 'section assignments', limits: { timeoutMs: 600_000, maxAttempts: 2, resource: 'LLM' }, version: '1.2.0',
    qualityRequirements: ['every section assigned'], jobTypes: [], payloadRoutes: [{ jobType: 'PLAN_SHOTS', when: 'performanceOnly' }], steps: [] },
  { id: 'iraqi-specialist', name: 'Iraqi Arabic Language Specialist', department: 'SOUND', role: 'Line preparation for Iraqi voices',
    description: 'Prepares an Iraqi character’s line before it is spoken: the engine and the verification language follow the line’s script (Arabic → the Iraqi engine; Latin or mixed → IndexTTS, with the fallback named).',
    systemInstructions: S(`Arabic script stays on the Iraqi engine; a Latin or mixed line goes to the bilingual engine and the fallback is named; the identity's engine is never rewritten by a fallback.`),
    model: 'rule set (routeLine)', skills: ['iraqi-dialogue'], tools: [], inputSchema: 'Character, line', outputSchema: 'LineRoute', version: '2.0.0',
    qualityRequirements: ['every fallback named in the job events'], ...STEP_ONLY,
    steps: [{ id: 'line-preparation', name: 'Line preparation before synthesis', where: W('handlers/voice.ts') }] },
  { id: 'audio-engineer', name: 'Audio Engineer', department: 'SOUND', role: 'The mix plan of a cut',
    description: 'Builds the typed mix plan of a cut or export: one authoritative sound per stretch at sample offsets (the song master in a music video with the takes muted; the takes’ own sound in a film, recorded lines only under silent takes), the loudness target, and a refusal when a source would be routed twice.',
    systemInstructions: S(`Whole frames and whole samples; every source once; −23 LUFS for films, −14 LUFS for music videos; never stretch.`),
    model: 'deterministic (buildMixPlan)', skills: ['audio-mix-policy'], tools: [], inputSchema: 'Timeline, song, recorded lines', outputSchema: 'MixPlan', version: '3.0.0',
    qualityRequirements: ['no source routed twice'], ...STEP_ONLY,
    steps: [{ id: 'mix-plan', name: 'Mix plan of a cut', where: W('handlers/assemble.ts') }] },
  // Post-Production
  { id: 'video-editor', name: 'Video Editor', department: 'POST', role: 'Director: the cut',
    description: 'Executes ASSEMBLE: joins the chosen takes frame-exactly (continuation heads dropped), aligns music-video performers to the master by measured lag, renders the mix and the review cut, and records the EDIT handoff.',
    systemInstructions: S(`The cut clock is whole frames; a continuation's repeated frames are dropped; a late performer loses head frames, nothing is stretched.`),
    model: 'ffmpeg', skills: ['audio-mix-policy'], tools: ['media.assemble', 'media.align_lag'], inputSchema: 'JOB_PAYLOADS.ASSEMBLE', outputSchema: 'cut asset', limits: { timeoutMs: 3_600_000, maxAttempts: 2, resource: 'CPU' }, version: '2.1.0',
    qualityRequirements: ['no sample take in a cut'], jobTypes: ['ASSEMBLE'], steps: [] },
  { id: 'export-engineer', name: 'Export Engineer', department: 'POST', role: 'Delivery files',
    description: 'Executes EXPORT of an approved cut: renders the delivery file at the chosen codec and size with the chosen subtitle treatment; the file is recorded only after it passes validation.',
    systemInstructions: S(`H.264/H.265/ProRes at 720/1080/2160; faststart; a failed validation fails the export.`),
    model: 'ffmpeg', skills: ['audio-mix-policy'], tools: ['media.assemble', 'media.align_lag'], inputSchema: 'JOB_PAYLOADS.EXPORT', outputSchema: 'export asset', limits: { timeoutMs: 3_600_000, maxAttempts: 2, resource: 'CPU' }, version: '2.1.0',
    qualityRequirements: ['validation passed'], jobTypes: ['EXPORT'], steps: [] },
  { id: 'subtitle-specialist', name: 'Subtitle Specialist', department: 'POST', role: 'Subtitle cues',
    description: 'Writes the subtitle cues of a cut or export: one cue per spoken line in its window (measured when the take carries line timings), one per lyric line on the vocal’s timing in a music video; Arabic, English or both merged; SRT for burn-in.',
    systemInstructions: S(`One cue per spoken line at its window; one cue per lyric line on the vocal's timing; Arabic cues keep their own direction.`),
    model: 'rule set (dialogueCues, lyricCues)', skills: ['singing-performance'], tools: [], inputSchema: 'Production, Timeline', outputSchema: 'Cue[]', version: '2.0.0',
    qualityRequirements: ['cues from measured timings when available'], ...STEP_ONLY,
    steps: [{ id: 'subtitle-cues', name: 'Subtitle cues of a cut', where: W('handlers/assemble.ts') }] },
  // Quality Assurance (independent)
  { id: 'quality-director', name: 'Quality Director', department: 'QA', role: 'Director: approval gates and the QA hand-off',
    description: 'Holds the two human gates (nothing is produced for a story nobody approved; nothing is exported from a cut nobody approved), the pilot gate of every scene (its first shot must pass its checks before the rest of the scene is generated) and reviews the QA hand-off to post-production: every chosen take inspected, none of them rejected.',
    systemInstructions: S(`A gate opens only on a recorded approval; a chosen take without a report or with a rejection is named in the hand-off, never hidden.`),
    model: 'rule set (src/server/org/gates.ts)', skills: ['take-inspection'], tools: [], inputSchema: 'Production', outputSchema: 'gate verdict / handoff checks', version: '2.1.0',
    qualityRequirements: ['thresholds are never lowered to pass material'], ...STEP_ONLY,
    steps: [
      { id: 'story-gate', name: 'Story approval gate', where: W('handlers/produce.ts') },
      { id: 'pilot-gate', name: 'Pilot shot gate of a scene', where: W('handlers/produce.ts') },
      { id: 'cut-gate', name: 'Cut approval gate', where: W('handlers/assemble.ts') },
      { id: 'qa-handoff-review', name: 'QA hand-off review', where: W('handlers/assemble.ts') },
    ] },
  { id: 'technical-media-inspector', name: 'Technical Media Inspector', department: 'QA', role: 'File integrity',
    description: 'Executes MEDIA_PROBE (ffprobe and a full decode of a stored file; a broken file is marked unavailable) and validates every finished cut and export (lengths within a frame, frame rate, size, timestamps, black stretches), recording a QA report either way.',
    systemInstructions: S(`Nothing is recorded as a cut or export without passing validation.`),
    model: 'ffprobe/ffmpeg', skills: ['take-inspection'], tools: ['media.probe', 'media.validate_export'], inputSchema: 'JOB_PAYLOADS.MEDIA_PROBE / file', outputSchema: 'probe / ExportValidation', limits: { timeoutMs: 600_000, maxAttempts: 1, resource: 'CPU' }, version: '2.0.0',
    qualityRequirements: ['validation on every finished file'], jobTypes: ['MEDIA_PROBE'],
    steps: [{ id: 'file-validation', name: 'Validation of a finished file', where: W('handlers/assemble.ts') }, { id: 'song-copies', name: 'One copy of the music in a music video’s cut', where: W('handlers/assemble.ts') }] },
  { id: 'audio-sync-inspector', name: 'Audio Synchronization Inspector', department: 'QA', role: 'Speech heard back; songs checked',
    description: 'Transcribes each speaking take and compares it with the script (coverage ≥ 0.7, WER reported, lines placed on the take); checks a new song’s length, stems and lyric placement; reports on a voice’s proof line.',
    systemInstructions: S(`Coverage ≥ 0.7 of the script in order; a take that could not be heard back goes to review, never passed on trust; report LIP_SYNC_FAILURE when the lines were not spoken.`),
    model: 'Qwen3-ASR-1.7B (primary) + faster-whisper large-v3 (reference) + rule set', skills: ['take-inspection', 'audio-first-dialogue'], tools: ['speech.transcribe', 'speech.transcribe_qwen'], inputSchema: 'take audio / song', outputSchema: 'script check / song checks', limits: { timeoutMs: 600_000, maxAttempts: 1, resource: 'ASR' }, version: '2.1.0',
    qualityRequirements: ['every speaking take transcribed'], jobTypes: [],
    steps: [
      { id: 'take-speech-check', name: 'Speech check of a take', where: W('handlers/take.ts') },
      { id: 'lip-sync-check', name: 'Mouths against the authoritative audio (lag, speaker, extra singers)', where: W('handlers/take.ts') },
      { id: 'song-check', name: 'Song check', where: W('handlers/music.ts') },
      { id: 'voice-proof-check', name: 'Proof-line check of a voice', where: W('handlers/voice.ts') },
    ] },
  { id: 'visual-quality-inspector', name: 'Visual Quality Inspector', department: 'QA', role: 'Measured picture checks',
    description: 'Runs the measured checks on every new take (decodable, duration, size, audio stream, black and frozen frames, flicker, silence, true peak), measures a continuation’s head against the tail it was anchored on before any frame is dropped (a head that does not repeat the tail is kept, joined by a hard cut), and counts the people on screen every half second with the vision model; a failed check rejects the take as OUTPUT_CORRUPTION.',
    systemInstructions: S(`Measured checks only; a failed check rejects the take; a continuation's head is compared with the tail before the trim is trusted; more people on screen than the shot holds — a stranger, a duplicated character — fails it; anatomy and acting are a person's review.`),
    model: 'ffmpeg + Qwen3.5-4B (ComfyUI)', skills: ['take-inspection'], tools: ['media.qa_take', 'image.describe_reference'], inputSchema: 'take file', outputSchema: 'QaReport', limits: { timeoutMs: 300_000, maxAttempts: 1, resource: 'CPU' }, version: '2.2.0',
    qualityRequirements: ['every take checked', 'a continuation head measured against its tail before it is trimmed', 'never more people on screen than the shot holds'], jobTypes: [],
    steps: [{ id: 'picture-check', name: 'Picture check of a take', where: W('handlers/take.ts') }, { id: 'guide-head-check', name: 'Does the head repeat the tail (before the trim)', where: W('handlers/take.ts') }, { id: 'people-check', name: 'People on screen, every half second', where: W('handlers/take.ts') }, { id: 'continuity-check', name: 'Fades, repeated frames, unplanned cuts, repeated speech, line timing (no model)', where: W('handlers/take.ts') }, { id: 'identity-check', name: 'Faces against their canonical images (SFace)', where: W('handlers/take.ts') }] },
  { id: 'reliability-engineer', name: 'Reliability Engineer', department: 'QA', role: 'Failure classification',
    description: 'Classifies every failed job into the studio’s failure classes, decides whether an unchanged retry is allowed (infrastructure, provider and resource failures only) and opens the reliability event; a later success resolves it.',
    systemInstructions: S(`A second attempt is an event, not a routine; only infrastructure, provider and resource failures retry unchanged; everything else needs a stated correction.`),
    model: 'rule set (classifyFailure)', skills: ['take-inspection'], tools: [], inputSchema: 'failed job, error', outputSchema: 'failure class + reliability event', version: '2.0.0',
    qualityRequirements: ['event per failure'], ...STEP_ONLY,
    steps: [{ id: 'failure-classification', name: 'Failure classification', where: 'src/worker/index.ts' }] },
];

/** Steps declared above that are not wired yet (a test asserts exactly these are absent from the code, so none is
 *  forgotten; wiring one means removing it from this list). Empty since the wave-2 fixer's branch merged and the
 *  character, voice and image handlers were wired. */
export const PENDING_STEPS: ReadonlyArray<{ agentId: string; stepId: string }> = [];

// ------------------------------------------------------------------------------------------------- planned roles

const LATER = 'a later phase (Shows, Shorts, Music Videos)';

export const PLANNED_ROLES: PlannedRole[] = [
  { id: 'studio-director', department: 'EXECUTIVE', name: 'Studio Director', would: 'Hold the creative standard across departments.', reason: 'Creative direction is the producer’s own, given through the story and cut approval gates; no code makes creative calls.', phase: 'not planned as an agent' },
  { id: 'world-designer', department: 'WORLD', name: 'World Designer', would: 'Design new places with layout, landmarks and props from the story’s needs.', reason: 'Part of the Head of Story’s develop call today (new places come with full designs).', phase: LATER },
  { id: 'set-designer', department: 'WORLD', name: 'Set Designer', would: 'Keep each place’s layout record current.', reason: 'Layouts are written once by the develop call and edited by hand; nothing maintains them.', phase: LATER },
  { id: 'props-designer', department: 'WORLD', name: 'Props Designer', would: 'Track recurring props and their state between scenes.', reason: 'Props exist only in the shot continuity the Film Director’s plan writes; there is no tracker.', phase: LATER },
  { id: 'cinematographer', department: 'PREPRODUCTION', name: 'Cinematographer', would: 'Set framing, lens, angle and movement per shot.', reason: 'Inside the Film Director’s single shot-plan call today.', phase: LATER },
  { id: 'production-planner', department: 'PREPRODUCTION', name: 'Production Planner', would: 'Estimate shots, seconds and engine time before production starts.', reason: 'Part of the Executive Producer’s preflight; no duration estimate is computed yet.', phase: LATER },
  { id: 'production-director', department: 'VIDEO', name: 'Production Director', would: 'Supervise each take against the approved plan.', reason: 'The plan is enforced by the preflight and the video specialist’s request; there is no supervisory code.', phase: LATER },
  { id: 'motion-director', department: 'VIDEO', name: 'Motion Director', would: 'Keep action continuous across continuation shots.', reason: 'The continuation guide is applied inside the video specialist’s take job.', phase: LATER },
  { id: 'performance-director', department: 'VIDEO', name: 'Performance Director', would: 'Decide who speaks or sings on screen and check it in the take.', reason: 'Decided by the shot plan and the singing assignment; nothing checks it in the picture.', phase: LATER },
  { id: 'rendering-engineer', department: 'VIDEO', name: 'Rendering Engineer', would: 'Run graphs under the GPU lease and resume prompts after a restart.', reason: 'Done by the worker’s GPU lease and the ComfyUI client inside each job, not by an agent.', phase: LATER },
  { id: 'sound-director', department: 'SOUND', name: 'Sound Director', would: 'Own the audio design of a production.', reason: 'The mix policy is code run by the Audio Engineer’s step; there is no further sound direction.', phase: LATER },
  { id: 'voice-engineer', department: 'SOUND', name: 'Voice Engineer', would: 'Keep every character’s voice stable across productions.', reason: 'The voice lock and revision are rules in code and Voice Casting’s job.', phase: LATER },
  { id: 'post-director', department: 'POST', name: 'Post-Production Director', would: 'Supervise cut, mix, subtitles and export.', reason: 'The cut approval is the producer’s; the Video Editor’s job and the Quality Director’s gates cover the rest.', phase: LATER },
  { id: 'continuity-editor', department: 'POST', name: 'Continuity Editor', would: 'Inspect each join for screen direction, wardrobe, props and light.', reason: 'Needs a vision model; no automatic join check exists.', phase: 'when a vision check exists' },
  { id: 'audio-mixing-engineer', department: 'POST', name: 'Audio Mixing Engineer', would: 'Render the final mix.', reason: 'Merged into the Audio Engineer (mix plan) and the Video Editor’s render.', phase: 'merged' },
  { id: 'colorist', department: 'POST', name: 'Colorist', would: 'Grade colour and exposure consistently.', reason: 'The conform is a fixed ffmpeg filter inside the assembly (bt709, yuv420p), not grading.', phase: LATER },
  { id: 'character-consistency-inspector', department: 'QA', name: 'Character Consistency Inspector', would: 'Compare a take’s frames with the character sheet and report identity drift.', reason: 'Needs an automatic identity check (docs/research/CHARACTER-IMAGE-V2.md).', phase: 'when an identity check exists' },
  { id: 'world-continuity-inspector', department: 'QA', name: 'World Continuity Inspector', would: 'Compare a take’s place with its plates.', reason: 'Needs an automatic environment check.', phase: 'when an environment check exists' },
  { id: 'lipsync-inspector', department: 'QA', name: 'Lip-Sync Inspector', would: 'Measure mouth motion against the spoken windows.', reason: 'Needs a measured lip-sync check; the Audio-Sync Inspector proves the words were spoken, not the lips.', phase: 'when a lip-sync measurement exists' },
];

export const DEPARTMENTS: DepartmentDef[] = [
  { id: 'EXECUTIVE', name: 'Executive Office', directorId: 'executive-producer', responsibility: 'Feasibility before generation, and running a production through its jobs.', stages: [], order: 0 },
  { id: 'STORY', name: 'Story Development', directorId: 'head-of-story', responsibility: 'Research-driven proposals (permitted trend research, audience patterns, original concepts, editorial and audience reviews), story development, script and dialogue; the show’s story bible.', stages: ['STORY', 'SCRIPT'], order: 1 },
  { id: 'CASTING', name: 'Casting & Character Design', directorId: 'casting-director', responsibility: 'Characters: design, the canonical front full-body image and the voice; the identity references every shot uses.', stages: ['CAST_WORLD'], order: 2 },
  { id: 'WORLD', name: 'World Building & Art Direction', directorId: 'art-director', responsibility: 'Places: plates, views and time-of-day states, reviewed before hand-off.', stages: ['CAST_WORLD'], order: 3 },
  { id: 'PREPRODUCTION', name: 'Pre-Production', directorId: 'film-director', responsibility: 'Scenes into timed shots with continuity states and opening frames.', stages: ['STORYBOARD', 'SHOT_PLAN'], order: 4 },
  { id: 'VIDEO', name: 'Video Production', directorId: 'minimax-video-specialist', responsibility: 'MiniMax H3 takes with complete provenance; MiniMax is the only video engine.', stages: ['VIDEO'], order: 5 },
  { id: 'SOUND', name: 'Sound & Music', directorId: 'dialogue-director', responsibility: 'Recorded dialogue, Iraqi line preparation, songs and stems, the mix plan.', stages: ['AUDIO_PREP'], order: 6 },
  { id: 'POST', name: 'Post-Production', directorId: 'video-editor', responsibility: 'The cut, subtitles and the validated export.', stages: ['EDIT', 'EXPORT'], order: 7 },
  { id: 'QA', name: 'Quality Assurance', directorId: 'quality-director', responsibility: 'Independent inspection (picture, speech, files), the approval gates and failure classification.', stages: ['QA'], order: 8 },
];

/** Which agent executes a job type. */
export const JOB_AGENT: Record<JobType, string> = Object.fromEntries(AGENTS.flatMap((a) => a.jobTypes.map((t) => [t, a.id]))) as Record<JobType, string>;

/** The agent for a concrete job: the type decides, except where an agent's payload route names a narrower piece. */
export function agentIdForJob(job: { type: JobType; payload: unknown }): string {
  const p = (job.payload ?? {}) as Record<string, unknown>;
  const routed = AGENTS.find((a) => a.payloadRoutes?.some((r) => r.jobType === job.type && Boolean(p[r.when])));
  return routed?.id ?? JOB_AGENT[job.type];
}

export const FAILURE_CLASSES = ['INVALID_INPUT', 'UNSUPPORTED_CAPABILITY', 'MISSING_REFERENCE', 'INCONSISTENT_PLAN', 'PROMPT_AMBIGUITY', 'WRONG_PARAMETERS', 'INFRASTRUCTURE', 'PROVIDER', 'RESOURCE_EXHAUSTION', 'CHARACTER_INCONSISTENCY', 'ENVIRONMENT_INCONSISTENCY', 'VOICE_MISMATCH', 'LIP_SYNC_FAILURE', 'AUDIO_DUPLICATION', 'OUTPUT_CORRUPTION', 'CANCELLED', 'UNKNOWN'] as const;
export type FailureClass = (typeof FAILURE_CLASSES)[number];

export const agentById = (id: string) => AGENTS.find((a) => a.id === id);
export const toolById = (id: string) => TOOLS.find((t) => t.id === id);
export const skillById = (id: string) => SKILLS.find((s) => s.id === id);
/** Agents whose model calls go through the story engine (they receive their instructions and PROMPT skills). */
export const callsModel = (a: Pick<AgentDef, 'tools'>) => a.tools.includes('story.structured_answer');
