import type { Language } from '@/domain/vocabulary';

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
  licence: string;
  /** measured peak card memory while loaded (MB); the lease estimate for TTS covers the largest selectable engine */
  vramMb: number;
}

export const VOICE_ENGINES: Record<LocalTtsEngine, VoiceEngineCaps> = {
  indextts: { id: 'indextts', label: 'IndexTTS 2.5', urlEnv: 'TTS_URL', defaultUrl: 'http://tts:8020', languages: ['EN', 'AR'], durationControl: 'speed', emotion: 'vector', usesReferenceText: false, oneWordLeadIn: true, licence: 'bilibili Model Use License (commercial below 100M MAU / RMB 1bn; §3.4c)', vramMb: 6000 },
  habibi: { id: 'habibi', label: 'Habibi-TTS IRQ', urlEnv: 'TTS_HABIBI_URL', defaultUrl: 'http://tts-habibi:8021', languages: ['AR'], durationControl: 'speed', emotion: 'reference', usesReferenceText: true, oneWordLeadIn: false, licence: 'Apache-2.0 per licensor; data-provenance risk (F5-TTS / Emilia)', vramMb: 2000 },
  voxcpm2: { id: 'voxcpm2', label: 'VoxCPM2 (clone)', urlEnv: 'TTS_VOXCPM2_URL', defaultUrl: 'http://tts-bench-voxcpm2:8040', languages: ['EN', 'AR'], durationControl: 'none', emotion: 'style', usesReferenceText: false, oneWordLeadIn: false, licence: 'Apache-2.0', vramMb: 7700 },
  dots: { id: 'dots', label: 'dots.tts-soar', urlEnv: 'TTS_DOTS_URL', defaultUrl: 'http://tts-bench-dots:8041', languages: ['EN', 'AR'], durationControl: 'none', emotion: 'reference', usesReferenceText: true, oneWordLeadIn: false, licence: 'Apache-2.0', vramMb: 8000 },
  moss: { id: 'moss', label: 'MOSS-TTS v1.5', urlEnv: 'TTS_MOSS_URL', defaultUrl: 'http://tts-bench-moss:8042', languages: ['EN', 'AR'], durationControl: 'tokens', emotion: 'reference', usesReferenceText: false, oneWordLeadIn: false, licence: 'Apache-2.0', vramMb: 20000 },
};

export const isLocalTtsEngine = (x: unknown): x is LocalTtsEngine => typeof x === 'string' && Object.prototype.hasOwnProperty.call(VOICE_ENGINES, x);

/** The engine new English identities are built with: `VOICE_ENGINE_EN` when it names an engine that speaks English,
 *  else IndexTTS. An identity already pinned keeps its own engine (persistent voice: never re-routed by this). */
export function englishEngine(configured: string | undefined): LocalTtsEngine {
  return isLocalTtsEngine(configured) && VOICE_ENGINES[configured].languages.includes('EN') ? configured : 'indextts';
}

/** An engine an identity may pin for a character speaking `language`. */
export const pinnable = (model: string | undefined, language: Language): LocalTtsEngine | undefined => (isLocalTtsEngine(model) && VOICE_ENGINES[model].languages.includes(language) ? model : undefined);
