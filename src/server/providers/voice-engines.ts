import type { Language } from '@/domain/vocabulary';
import { isOneWordLine } from '../media/lead-in';
import { EVAL_VOICE_ENGINES, type EvalTtsEngine } from './voice-eval-engines';

/** THE LOCAL VOICE ENGINES AND WHAT EACH CAN DO — capability data, not code paths (docs/research/VOICE-BENCH-2026-10.md).
 *  Every engine speaks the same `/synthesize` contract (docker/tts/app.py, docker/tts-bench/app.py): text + ONE
 *  reference clip (+ its transcript) → a WAV with provenance headers. A character's identity pins one engine by id
 *  (`VoiceIdentity.model`); the engine for NEW English identities is `VOICE_ENGINE_EN` (default: IndexTTS 2.5 until a
 *  candidate passes the real-UI test — the promotion rule, FINAL-LOCAL-DIRECTIVE §25). Only commercial-safe weights
 *  appear here (producer's rule 2026-10-06); research references never do. Pure data + lookups. */

export type LocalTtsEngine = 'indextts' | 'habibi' | 'voxcpm2' | 'dots' | 'moss';

export interface VoiceEngineCaps {
  id: LocalTtsEngine;
  label: string;
  /** the env var holding its URL, and the default (the compose service name on the studio network) */
  urlEnv: 'TTS_URL' | 'TTS_HABIBI_URL' | 'TTS_VOXCPM2_URL' | 'TTS_DOTS_URL' | 'TTS_MOSS_URL';
  defaultUrl: string;
  languages: readonly Language[];
  /** how a line's length can be asked for: `speed` (duration factor), `tokens` (an exact token budget from seconds), none */
  durationControl: 'speed' | 'tokens' | 'none';
  /** how delivery is asked for: an emotion vector, a style instruction in words, or only through the reference */
  emotion: 'vector' | 'style' | 'reference';
  /** the reference transcript conditions the engine (sent whenever the identity stores it) */
  usesReferenceText: boolean;
  /** one-word lines need the lead-in sentence and the cut (src/server/media/lead-in.ts): measured on IndexTTS only */
  oneWordLeadIn: boolean;
  /** an engine with token-level duration control stops a one-word line by its budget instead: the length asked for
   *  (seconds) when the line is one word and no other target is given (MOSS ran «Nothing.» on to 5.7 s unbudgeted) */
  oneWordBudgetSeconds?: number;
  licence: string;
  /** measured peak card memory while loaded (MB); the lease estimate for TTS covers the largest selectable engine */
  vramMb: number;
}

export const VOICE_ENGINES: Record<LocalTtsEngine, VoiceEngineCaps> = {
  indextts: { id: 'indextts', label: 'IndexTTS 2.5', urlEnv: 'TTS_URL', defaultUrl: 'http://tts:8020', languages: ['EN', 'AR'], durationControl: 'speed', emotion: 'vector', usesReferenceText: false, oneWordLeadIn: true, licence: 'bilibili Model Use License (commercial below 100M MAU / RMB 1bn; §3.4c)', vramMb: 6000 },
  // THE IRAQI ENGINE (producer decision 2026-10-07): the Specialized IRQ checkpoint only (Apache-2.0 per the model card)
  habibi: { id: 'habibi', label: 'Habibi-TTS Specialized IRQ', urlEnv: 'TTS_HABIBI_URL', defaultUrl: 'http://tts-habibi:8021', languages: ['AR'], durationControl: 'speed', emotion: 'reference', usesReferenceText: true, oneWordLeadIn: false, licence: 'Apache-2.0 (Specialized IRQ checkpoint; F5-TTS/Emilia lineage noted for legal review)', vramMb: 2000 },
  // the candidates' defaults are HOST ports (like TTS_DESIGN_URL): the worker runs on the host; compose passes the service names.
  // VoxCPM2 and dots list Arabic on their cards but are bench engines only. MOSS-TTS v1.5 documents Arabic among its 31
  // languages (language="Arabic"; no Arabic dialect is documented): it is the English/general engine and speaks Arabic
  // script for its voices; Iraqi voices are Habibi's (pickEngine), MOSS only a controlled comparison if ever needed
  voxcpm2: { id: 'voxcpm2', label: 'VoxCPM2 (clone)', urlEnv: 'TTS_VOXCPM2_URL', defaultUrl: 'http://127.0.0.1:8040', languages: ['EN'], durationControl: 'none', emotion: 'style', usesReferenceText: false, oneWordLeadIn: false, licence: 'Apache-2.0', vramMb: 7700 },
  dots: { id: 'dots', label: 'dots.tts-soar', urlEnv: 'TTS_DOTS_URL', defaultUrl: 'http://127.0.0.1:8041', languages: ['EN'], durationControl: 'none', emotion: 'reference', usesReferenceText: true, oneWordLeadIn: false, licence: 'Apache-2.0', vramMb: 8000 },
  moss: { id: 'moss', label: 'MOSS-TTS v1.5', urlEnv: 'TTS_MOSS_URL', defaultUrl: 'http://127.0.0.1:8023', languages: ['EN', 'AR'], durationControl: 'tokens', emotion: 'reference', usesReferenceText: false, oneWordLeadIn: false, oneWordBudgetSeconds: 0.9, licence: 'Apache-2.0', vramMb: 24000 /* measured: torch peak 23,986 MB, bf16 + SDPA, 2026-10-06 focused run */ },
};

export const isLocalTtsEngine = (x: unknown): x is LocalTtsEngine => typeof x === 'string' && Object.prototype.hasOwnProperty.call(VOICE_ENGINES, x);

/** The engine new English identities are built with: `VOICE_ENGINE_EN` when it names an engine that speaks English,
 *  else IndexTTS. An identity already pinned keeps its own engine (persistent voice: never re-routed by this). */
export function englishEngine(configured: string | undefined): LocalTtsEngine {
  return isLocalTtsEngine(configured) && VOICE_ENGINES[configured].languages.includes('EN') ? configured : 'indextts';
}

/** The GPU lease estimate for a line on `engine` (MB): the voice services' shared floor (voice-measure TTS_VRAM 8000)
 *  or the engine's own measured peak, whichever is larger. An evaluation engine (voice-eval-engines.ts) brings its own
 *  estimate: a preview that names one leases the card for it the same way. */
export const TTS_VRAM_FLOOR_MB = 8000;
export const ttsVramFor = (engine: LocalTtsEngine | EvalTtsEngine): number => Math.max(TTS_VRAM_FLOOR_MB, isLocalTtsEngine(engine) ? VOICE_ENGINES[engine].vramMb : EVAL_VOICE_ENGINES[engine].vramMb);

/** The length to ask of `engine` for `text`: the caller's target when it has one; else, for a one-word line on an
 *  engine that budgets by tokens, the engine's one-word budget; else nothing (the engine's own length). */
export function durationFor(engine: LocalTtsEngine, text: string, targetSeconds?: number): number | undefined {
  if (targetSeconds) return targetSeconds;
  const caps = VOICE_ENGINES[engine];
  return caps.durationControl === 'tokens' && caps.oneWordBudgetSeconds && isOneWordLine(text) ? caps.oneWordBudgetSeconds : undefined;
}

/** An engine an identity may pin for a character speaking `language`. */
export const pinnable = (model: string | undefined, language: Language): LocalTtsEngine | undefined => (isLocalTtsEngine(model) && VOICE_ENGINES[model].languages.includes(language) ? model : undefined);
