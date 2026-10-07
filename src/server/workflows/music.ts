import { MODELS, seed32, type Graph } from './index';

/** MUSIC — ACE-Step 1.5 XL (MIT), the studio's one song engine, through its native ComfyUI nodes. Lyrics carry [Verse]/[Chorus] tags; the caption carries genre, tempo,
 *  instrumentation and voice. */

/** The ACE-Step 1.5 XL variant a song is made with: xl-sft the production song generator (with the 5Hz LM 4B), xl-turbo
 *  a quick draft, only when chosen (MUSIC_ACE_VARIANT=xl-turbo; with the 1.7B LM) — never a silent fallback. Settings are the official ComfyUI templates'
 *  (Comfy-Org/workflow_templates audio_ace_step1_5_xl_sft / audio_ace_step_1_5_split, read 2026-10-06). */
export type AceVariant = 'xl-sft' | 'xl-turbo';
// file names written out (not read from MODELS): workflows/index.ts re-exports this module, so MODELS is not yet
// initialised while this module evaluates; a test keeps the two in step
export const ACE_VARIANTS: Record<AceVariant, { dit: string; lm: string; steps: number; cfg: number; shift: number; lmCfg: number; temperature: number; topP: number; label: string }> = {
  'xl-sft': { dit: 'acestep_v1.5_xl_sft_bf16.safetensors', lm: 'qwen_4b_ace15.safetensors', steps: 50, cfg: 7, shift: 3, lmCfg: 2, temperature: 0.85, topP: 1.0, label: 'ACE-Step 1.5 XL-SFT + 5Hz LM 4B' },
  'xl-turbo': { dit: 'acestep_v1.5_xl_turbo_bf16.safetensors', lm: 'qwen_1.7b_ace15.safetensors', steps: 8, cfg: 1, shift: 3, lmCfg: 2, temperature: 0.85, topP: 0.9, label: 'ACE-Step 1.5 XL turbo + 5Hz LM 1.7B' },
};

export interface SongInput { caption: string; lyrics: string; seconds: number; seed?: number; language?: string; bpm?: number; key?: string; instrumental?: boolean; filenamePrefix?: string; variant?: AceVariant }

/** The ACE-Step encoder wants a tempo (10–300), a time signature, a language code and a key; none may be left open.
 *  Tempo and key are read from the caption when the writer gave them ("68 BPM", "in D minor"), else sensible defaults. */
export const ACE_LANGUAGES = ['ar', 'az', 'bg', 'bn', 'ca', 'cs', 'da', 'de', 'el', 'en', 'es', 'fa', 'fi', 'fr', 'he', 'hi', 'hr', 'ht', 'hu', 'id', 'is', 'it', 'ja', 'ko', 'la', 'lt', 'ms', 'ne', 'nl', 'no', 'pa', 'pl', 'pt', 'ro', 'ru', 'sa', 'sk', 'sr', 'sv', 'sw', 'ta', 'te', 'th', 'tl', 'tr', 'uk', 'ur', 'vi', 'yue', 'zh', 'unknown'];
export const ACE_KEYS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'].flatMap((k) => [`${k} major`, `${k} minor`]);
export function bpmFromCaption(caption: string): number | undefined { const m = /(\d{2,3})\s*bpm/i.exec(caption); const n = m ? Number(m[1]) : NaN; return n >= 10 && n <= 300 ? n : undefined; }
export function keyFromCaption(caption: string): string | undefined { const m = /\b([A-G])\s*(#|b|♯|♭)?\s*(major|minor|maj|min)\b/i.exec(caption); if (!m) return undefined; const acc = m[2] === '♯' ? '#' : m[2] === '♭' ? 'b' : (m[2] ?? ''); const k = `${m[1].toUpperCase()}${acc} ${/^maj/i.test(m[3]) ? 'major' : 'minor'}`; return ACE_KEYS.includes(k) ? k : undefined; }
export function aceLanguage(language?: string): string { const l = (language ?? '').toLowerCase().split(/[-_]/)[0]; return ACE_LANGUAGES.includes(l) ? l : 'unknown'; }
const bpmGuess = (caption: string) => (/\b(slow|ballad|lullaby|ambient)\b/i.test(caption) ? 72 : /\b(fast|upbeat|dance|energetic)\b/i.test(caption) ? 128 : 100);
const keyGuess = (caption: string) => (/\b(melanchol|sad|mournful|bittersweet|minor|dark|lonely)\w*/i.test(caption) ? 'A minor' : 'C major');

export function aceStepSong(i: SongInput): Graph {
  const lyrics = i.instrumental ? '[Instrumental]' : i.lyrics;
  const bpm = i.bpm && i.bpm >= 10 && i.bpm <= 300 ? i.bpm : bpmFromCaption(i.caption) ?? bpmGuess(i.caption);
  const keyscale = (i.key && ACE_KEYS.includes(i.key) ? i.key : undefined) ?? keyFromCaption(i.caption) ?? keyGuess(i.caption);
  const v = ACE_VARIANTS[i.variant ?? 'xl-sft'];
  return {
    // mirrors ComfyUI's own ACE-Step 1.5 XL templates: dual encoder (the 0.6B text encoder + the 5Hz language model that
    // writes the audio codes), AuraFlow shift 3; XL-SFT at 50 steps / cfg 7, turbo at 8 steps / cfg 1
    '1': { class_type: 'UNETLoader', inputs: { unet_name: v.dit, weight_dtype: 'default' }, _meta: { title: v.label } },
    '2': { class_type: 'DualCLIPLoader', inputs: { clip_name1: MODELS.aceTextEncoder, clip_name2: v.lm, type: 'ace', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: MODELS.aceVae } },
    '4': { class_type: 'TextEncodeAceStepAudio1.5', inputs: { clip: ['2', 0], tags: i.caption, lyrics, seed: seed32(i.seed), bpm, duration: Math.round(i.seconds), timesignature: '4', language: aceLanguage(i.language), keyscale, generate_audio_codes: true, cfg_scale: v.lmCfg, temperature: v.temperature, top_p: v.topP, top_k: 0, min_p: 0.0 } },
    '5': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['4', 0] } },
    '6': { class_type: 'EmptyAceStep1.5LatentAudio', inputs: { seconds: Math.round(i.seconds), batch_size: 1 } },
    '10': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['1', 0], shift: v.shift } },
    '7': { class_type: 'KSampler', inputs: { model: ['10', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['6', 0], seed: seed32(i.seed), steps: v.steps, cfg: v.cfg, sampler_name: 'euler', scheduler: 'simple', denoise: 1.0 } },
    '8': { class_type: 'VAEDecodeAudio', inputs: { samples: ['7', 0], vae: ['3', 0] } },
    '9': { class_type: 'SaveAudio', inputs: { audio: ['8', 0], filename_prefix: i.filenamePrefix ?? 'vewbox/song' } },
  };
}

