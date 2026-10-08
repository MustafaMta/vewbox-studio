import type { Language } from '@/domain/vocabulary';

/** EVALUATION VOICE ENGINES — engines the studio may LISTEN to but never ship (docs/VOICE-ENGINE.md). They speak the same
 *  `/synthesize` contract as the production engines (src/server/providers/voice-engines.ts), but their weights are not
 *  commercial-safe, so they are kept out of `VOICE_ENGINES`: `pickEngine`, `pinnable` and `englishEngine` never see
 *  them, no identity can pin them, and no film line is spoken by them. They are reached only by the evaluation harness
 *  (scripts/voice-acting-eval.ts) and the listening comparison. Promotion needs a commercial licence on file AND a
 *  native listener's pass — both recorded, neither inferred. Pure data. */

export type EvalTtsEngine = 'fish-s2-pro';

export interface EvalVoiceEngine {
  id: EvalTtsEngine;
  label: string;
  urlEnv: 'TTS_FISH_URL';
  defaultUrl: string;
  /** the compose service and profile that run it (never part of `up`) */
  compose: { service: string; profile: string };
  languages: readonly Language[];
  /** how delivery is asked for: S2 Pro reads free-form inline [tags] before the words they colour */
  acting: 'inline-tags';
  usesReferenceText: true;
  licence: string;
  commercialUse: false;
  /** what would have to be true before it could ever be a production engine */
  promotion: string;
  /** the pinned weights and code (docker/models/manifest.json group, docker/tts-fish/Dockerfile) */
  pinned: { weights: string; code: string; manifestGroup: string };
}

export const EVAL_VOICE_ENGINES: Record<EvalTtsEngine, EvalVoiceEngine> = {
  'fish-s2-pro': {
    id: 'fish-s2-pro', label: 'Fish Audio S2 Pro (evaluation)', urlEnv: 'TTS_FISH_URL', defaultUrl: 'http://127.0.0.1:8025', compose: { service: 'tts-fish', profile: 'fish' },
    // English is a first-tier language on the model card; Arabic is listed in the second tier, with no dialect named
    languages: ['EN', 'AR'], acting: 'inline-tags', usesReferenceText: true,
    licence: 'Fish Audio Research License — research and non-commercial use only; commercial use needs a separate licence from Fish Audio',
    commercialUse: false,
    promotion: 'a commercial licence from Fish Audio on file, then a native Baghdadi listener passing it on the acting tests',
    pinned: { weights: 'fishaudio/s2-pro@1de9996b6be38b745688de084d87a5633f714e4e', code: 'fishaudio/fish-speech@214da3cd841bda85da2496b96cd3c4d7edb1337e', manifestGroup: 'eval-tts-fish-s2-pro' },
  },
};

export const isEvalTtsEngine = (x: unknown): x is EvalTtsEngine => typeof x === 'string' && Object.prototype.hasOwnProperty.call(EVAL_VOICE_ENGINES, x);
