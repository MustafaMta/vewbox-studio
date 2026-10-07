import { llmDisplayName } from '@/domain/llm-names';
import { z } from 'zod';

/** THE SERVER'S CONFIGURATION — read once from the environment, validated, never logged with secrets. Everything a
 *  container needs is here; `.env.example` documents each variable. Shared by the web server and the worker. */

const bool = z.string().optional().transform((v) => v === '1' || v === 'true');

const Schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1),
  /** Where library files live (uploads, generated media, exports). A Docker volume in production. */
  LIBRARY_ROOT: z.string().min(1).default('./var/library'),
  /** Where the bundled sample media lives (the Next.js public folder). */
  PUBLIC_ROOT: z.string().min(1).default('./public'),
  /** Optional password gate for the whole studio. Empty = open (local use). */
  STUDIO_PASSWORD: z.string().optional().default(''),
  /** Upload limits. */
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(2048),
  /** MiniMax (hosted). */
  MINIMAX_API_KEY: z.string().optional().default(''),
  MINIMAX_BASE_URL: z.string().default('https://api.minimax.io'),
  MINIMAX_VIDEO_MODEL: z.string().default('MiniMax-H3'),
  MINIMAX_VIDEO_RESOLUTION: z.string().default('768P'),
  MINIMAX_SPEECH_MODEL: z.string().default('speech-2.8-hd'),
  MINIMAX_MUSIC_MODEL: z.string().default('music-3.0'),
  /** THE PLANNER (the only one): Qwen3.8-27B-NVFP4 on the local vLLM server (compose service llm-vllm). */
  OPENAI_COMPATIBLE_BASE_URL: z.string().optional().default(''),
  OPENAI_COMPATIBLE_API_KEY: z.string().optional().default(''),
  OPENAI_COMPATIBLE_MODEL: z.string().optional().default(''),
  /** The planner's context window (prompt + answer): the vLLM server's --max-model-len. */
  LLM_CONTEXT_LENGTH: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().positive().default(32768)),
  /** Local GPU services. */
  COMFYUI_URL: z.string().default('http://comfyui:8188'),
  TTS_URL: z.string().default('http://tts:8020'),
  TTS_HABIBI_URL: z.string().default('http://tts-habibi:8021'),
  /** Candidate voice engines (docker/tts-bench, compose profile `bench`; src/server/providers/voice-engines.ts). Used
   *  only by an identity that pins them, or for new English identities when VOICE_ENGINE_EN names one. */
  TTS_VOXCPM2_URL: z.string().default('http://127.0.0.1:8040'),
  TTS_DOTS_URL: z.string().default('http://127.0.0.1:8041'),
  /** MOSS-TTS v1.5 (compose service tts-moss, profile `moss`); host port by default like TTS_DESIGN_URL. */
  TTS_MOSS_URL: z.string().default('http://127.0.0.1:8023'),
  /** The engine NEW English voices are built with (moss | indextts | voxcpm2 | dots). MOSS-TTS v1.5 since 2026-10-06
   *  (PRODUCTION-STACK-DIRECTIVE; docs/research/VOICE-BENCH-2026-10.md §3.2: ECAPA 0.67–0.86 vs IndexTTS 0.44–0.67 on
   *  the acceptance lines, every word heard, duration within 2 %); needs the `tts-moss` service (compose profile
   *  `moss`). `indextts` returns to the old route. Pinned identities keep the engine they were built with. */
  VOICE_ENGINE_EN: z.string().default('moss'),
  /** Voice design + speaker embeddings (VoxCPM2, ECAPA). The default is the host port, so a host worker without the
   *  variable still reaches it; compose passes http://tts-design:8022 to the containers. Empty = not configured. */
  TTS_DESIGN_URL: z.string().default('http://127.0.0.1:8022'),
  ASR_URL: z.string().default('http://asr:8030'),
  /** The lip-sync corrector (docker/lipsync: LatentSync 1.6 with a YuNet + MediaPipe face tracker). Host port by
   *  default (8045 on the host: 8040–8042 are the voice benches), like TTS_DESIGN_URL; compose passes http://lipsync:8040. Empty = not configured (correction offered as
   *  unavailable). It edits the mouth of an existing take on request only — it never generates video. */
  LIPSYNC_URL: z.string().default('http://127.0.0.1:8045'),
  /** MOSS-SoundEffect (compose service sfx-moss, profile sfx): ambience and effects outside the song. Host port by
   *  default; compose passes http://sfx-moss:8024. Empty = not configured. */
  SFX_URL: z.string().default('http://127.0.0.1:8024'),
  /** The song engine is ACE-Step 1.5 only. Variant: auto and xl-sft = XL-SFT + the 5Hz LM 4B (the production song
   *  generator; refused with the missing files named when not installed); xl-turbo = a quick draft, only when chosen. */
  MUSIC_ACE_VARIANT: z.enum(['auto', 'xl-sft', 'xl-turbo']).default('auto'),
  VIDEO_BACKEND: z.enum(['auto', 'api', 'local']).default('auto'),
  /** Where the public web origin is, for callbacks and absolute media URLs handed to providers. */
  PUBLIC_BASE_URL: z.string().optional().default(''),
  /** Worker tuning. */
  WORKER_ID: z.string().optional().default(''),
  WORKER_CONCURRENCY_HOSTED: z.coerce.number().int().positive().default(4),
  WORKER_CONCURRENCY_LLM: z.coerce.number().int().positive().default(2),
  WORKER_CONCURRENCY_CPU: z.coerce.number().int().positive().default(2),
  GPU_VRAM_BUDGET_MB: z.coerce.number().int().positive().default(32000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  LOG_PRETTY: bool,
  /** Version strings stamped onto generated takes. */
  CODE_VERSION: z.string().optional().default('dev'),
});

export type Env = z.infer<typeof Schema>;

let cached: Env | null = null;
export function env(): Env {
  if (cached) return cached;
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Which hosted and local capabilities are configured, for the Settings page and the worker. Never includes secrets. */
export function capabilities() {
  const e = env();
  return {
    minimax: Boolean(e.MINIMAX_API_KEY),
    /** the planner (the local vLLM server) when it is configured */
    llm: e.OPENAI_COMPATIBLE_BASE_URL ? 'openai-compatible' : null,
    openaiCompatible: Boolean(e.OPENAI_COMPATIBLE_BASE_URL),
    /** the planner's model as shown */
    llmModel: llmDisplayName(e.OPENAI_COMPATIBLE_MODEL),
    comfyui: e.COMFYUI_URL,
    tts: e.TTS_URL,
    asr: e.ASR_URL,
    videoModel: e.MINIMAX_VIDEO_MODEL,
    videoResolution: e.MINIMAX_VIDEO_RESOLUTION,
  };
}
