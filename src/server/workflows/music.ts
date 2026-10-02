import { MODELS, seed32, type Graph } from './index';

/** MUSIC — ACE-Step 1.5 XL (MIT) as the primary local song engine and MiniMax Music 3 (open weights) as the second,
 *  both through their native ComfyUI nodes. Lyrics carry [Verse]/[Chorus] tags; the caption carries genre, tempo,
 *  instrumentation and voice. */

export interface SongInput { caption: string; lyrics: string; seconds: number; seed?: number; language?: string; bpm?: number; instrumental?: boolean; filenamePrefix?: string }

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
  const keyscale = keyFromCaption(i.caption) ?? keyGuess(i.caption);
  return {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: MODELS.aceDit, weight_dtype: 'default' }, _meta: { title: 'ACE-Step 1.5 XL turbo' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: MODELS.aceClip, type: 'ace', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: MODELS.aceVae } },
    '4': { class_type: 'TextEncodeAceStepAudio1.5', inputs: { clip: ['2', 0], tags: i.caption, lyrics, seed: seed32(i.seed), bpm, duration: Math.round(i.seconds), timesignature: '4', language: aceLanguage(i.language), keyscale, generate_audio_codes: true, cfg_scale: 2.0, temperature: 0.85, top_p: 0.9, top_k: 0, min_p: 0.0 } },
    '5': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['4', 0] } },
    '6': { class_type: 'EmptyAceStep1.5LatentAudio', inputs: { seconds: Math.round(i.seconds), batch_size: 1 } },
    '7': { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['6', 0], seed: seed32(i.seed), steps: 8, cfg: 1.0, sampler_name: 'euler', scheduler: 'simple', denoise: 1.0 } },
    '8': { class_type: 'VAEDecodeAudio', inputs: { samples: ['7', 0], vae: ['3', 0] } },
    '9': { class_type: 'SaveAudio', inputs: { audio: ['8', 0], filename_prefix: i.filenamePrefix ?? 'vewbox/song' } },
  };
}

export function minimaxMusic3Song(i: SongInput): Graph {
  return {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: MODELS.music3Dit, weight_dtype: 'default' }, _meta: { title: 'MiniMax Music 3' } },
    // ComfyUI loads the Music 3 text encoder under the shared `minimax` CLIP type and tells it apart by its weights
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: MODELS.music3Clip, type: 'minimax', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: MODELS.music3Vae } },
    '4': { class_type: 'MiniMaxMusic3TextEncode', inputs: { clip: ['2', 0], caption: i.caption, lyrics: i.instrumental ? '[Instrumental]' : i.lyrics, seed: seed32(i.seed), max_duration: Math.round(i.seconds), cfg_scale: 3.0, top_k: 50 } },
    '5': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['4', 0] } },
    '6': { class_type: 'EmptyMiniMaxMusic3LatentAudio', inputs: { seconds: ['4', 1], batch_size: 1 } },
    '7': { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['6', 0], seed: seed32(i.seed), steps: 30, cfg: 1.0, sampler_name: 'euler', scheduler: 'simple', denoise: 1.0 } },
    '8': { class_type: 'VAEDecodeAudio', inputs: { samples: ['7', 0], vae: ['3', 0] } },
    '9': { class_type: 'SaveAudio', inputs: { audio: ['8', 0], filename_prefix: i.filenamePrefix ?? 'vewbox/song-m3' } },
  };
}
