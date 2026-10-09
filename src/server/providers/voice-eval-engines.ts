import type { Language } from '@/domain/vocabulary';

/** EVALUATION VOICE ENGINES — engines the studio may LISTEN to but never ship (docs/VOICE-ENGINE.md). They speak the same
 *  `/synthesize` contract as the production engines (src/server/providers/voice-engines.ts), but they are not approved
 *  for production — a non-commercial licence (Fish) or weights nobody native has yet passed (FireRedTTS3) — so they are
 *  kept out of `VOICE_ENGINES`: `pickEngine`, `pinnable` and `englishEngine` never see them, no identity can pin them,
 *  and no film line is spoken by them. They are reached only by the evaluation harness (scripts/voice-acting-eval.ts),
 *  the listening comparison and an explicit preview that names them (speech.ts `synthesize` accepts an EvalTtsEngine).
 *  Promotion needs a commercial licence on file AND a native listener's pass — both recorded, neither inferred. Pure data. */

export type EvalTtsEngine = 'fish-s2-pro' | 'fireredtts3' | 'vewbox-iq';

export interface EvalVoiceEngine {
  id: EvalTtsEngine;
  label: string;
  urlEnv: 'TTS_FISH_URL' | 'TTS_FIREREDTTS3_URL' | 'TTS_IQ_URL';
  defaultUrl: string;
  /** the compose service and profile that run it (never part of `up`) */
  compose: { service: string; profile: string };
  languages: readonly Language[];
  /** how delivery is asked for: S2 Pro reads free-form inline [tags] before the words they colour; FireRedTTS3-Base
   *  has no control at all — delivery follows the reference */
  acting: 'inline-tags' | 'reference';
  /** the reference transcript conditions the engine (sent whenever the identity stores it; both require it) */
  usesReferenceText: boolean;
  licence: string;
  /** the licence allows commercial use — NOT a production approval (that is the native listener's) */
  commercialUse: boolean;
  /** the GPU lease estimate (MB): measured when known, else the weights' size with headroom (named as such) */
  vramMb: number;
  /** what would have to be true before it could ever be a production engine */
  promotion: string;
  /** the pinned weights and code (docker/models/manifest.json group; docker/tts-fish and docker/tts-firered Dockerfiles) */
  pinned: { weights: string; code: string; manifestGroup: string };
}

export const EVAL_VOICE_ENGINES: Record<EvalTtsEngine, EvalVoiceEngine> = {
  'fish-s2-pro': {
    id: 'fish-s2-pro', label: 'Fish Audio S2 Pro (evaluation)', urlEnv: 'TTS_FISH_URL', defaultUrl: 'http://127.0.0.1:8025', compose: { service: 'tts-fish', profile: 'fish' },
    // English is a first-tier language on the model card; Arabic is listed in the second tier, with no dialect named
    languages: ['EN', 'AR'], acting: 'inline-tags', usesReferenceText: true,
    licence: 'Fish Audio Research License — research and non-commercial use only; commercial use needs a separate licence from Fish Audio',
    commercialUse: false,
    vramMb: 12000, // estimate: 11 GB of weights (llama bf16 + codec); not yet measured
    promotion: 'a commercial licence from Fish Audio on file, then a native Baghdadi listener passing it on the acting tests',
    pinned: { weights: 'fishaudio/s2-pro@1de9996b6be38b745688de084d87a5633f714e4e', code: 'fishaudio/fish-speech@214da3cd841bda85da2496b96cd3c4d7edb1337e', manifestGroup: 'eval-tts-fish-s2-pro' },
  },
  // FireRedTTS3-Base (FireRed, Aug 2026): Qwen3-1.7B backbone + RedAE, 24 languages incl. Arabic (MSA-type evidence only,
  // self-reported MLS Arabic CER 1.75 / SIM 78.9; NO Iraqi evidence). Base has no style control: the reference decides.
  // Run by docker/tts-firered with PyTorch SDPA instead of upstream's flash-attn pin (research note §3).
  fireredtts3: {
    id: 'fireredtts3', label: 'FireRedTTS3-Base', urlEnv: 'TTS_FIREREDTTS3_URL', defaultUrl: 'http://127.0.0.1:8026', compose: { service: 'tts-firered', profile: 'firered' },
    languages: ['EN', 'AR'], acting: 'reference', usesReferenceText: true, // the backbone continues <|lang|><|sot|>{reference_text}{text}
    licence: 'Apache-2.0 (README: cloning intended for academic research — noted)',
    commercialUse: true,
    vramMb: 16000, // estimate: fp32 weights as stored (8.5 GB backbone+DiT, 3.8 GB RedAE) + bf16 autocast activations; measure (x-peak-vram-mb)
    promotion: 'a blind native Baghdadi listening pass against Habibi IRQ and MOSS from the same designed reference, the README cloning disclaimer reviewed by the producer, then a production registry entry with its measured VRAM',
    pinned: { weights: 'FireRedTeam/FireRedTTS3@dcf1bdcd1b8b25b382fa84c3e34eb82e3054a610 (fireredtts3_base, redae, campp, text_tokenizer)', code: 'FireRedTeam/FireRedTTS3@7a1f3a7282ff184cc1c7f070556baaf5f08b5216', manifestGroup: 'eval-tts-fireredtts3-base' },
  },
  // VEWBOX-IQ (docs/VEWBOX-IQ.md): Chatterbox Multilingual V3 (ResembleAI, MIT; T3 v3 + s3gen.pt) with the studio's own Iraqi
  // (Baghdadi) adaptation of T3 (LoRA + Arabic embedding rows, then partial FT; the speaker path, S3Gen and the voice encoder
  // frozen). The model label comes from the loaded checkpoint (x-model). Clones from the reference audio alone (no
  // transcript); delivery follows the reference, exaggeration/cfg_weight are the only knobs. Every output carries the
  // library's Perth watermark. Run by docker/tts-iq (profile `iq`); checkpoints under the dataset tree (IQ_ADAPTER_DIR).
  'vewbox-iq': {
    id: 'vewbox-iq', label: 'Vewbox-IQ (Chatterbox MTL V3 + Iraqi adaptation)', urlEnv: 'TTS_IQ_URL', defaultUrl: 'http://127.0.0.1:8027', compose: { service: 'tts-iq', profile: 'iq' },
    languages: ['EN', 'AR'], acting: 'reference', usesReferenceText: false,
    licence: 'MIT (Chatterbox Multilingual V3) + Vewbox-IQ adaptation',
    commercialUse: true,
    vramMb: 8000, // estimate: ≈ 3.5 GB for the multilingual model (NVIDIA model card) with headroom; measure (x-peak-vram-mb)
    promotion: 'the Stage A/B checkpoint passing the held-out ECAPA/CER stop rules AND a blind native Baghdadi listening pass on the Character A pack, then a production registry entry with its measured VRAM',
    pinned: { weights: 'ResembleAI/chatterbox@5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18 (t3_mtl23ls_v3, s3gen.pt | s3gen_v3, ve.pt, grapheme_mtl_merged_expanded_v1.json)', code: 'resemble-ai/chatterbox@65b18437192794391a0308a8f705b1e33e633948', manifestGroup: 'voice-chatterbox-mtl-v3' },
  },
};

export const isEvalTtsEngine = (x: unknown): x is EvalTtsEngine => typeof x === 'string' && Object.prototype.hasOwnProperty.call(EVAL_VOICE_ENGINES, x);
