import { MODELS, seed32, type Graph } from './index';

/** MUSIC — ACE-Step 1.5 XL (MIT) as the primary local song engine and MiniMax Music 3 (open weights) as the second,
 *  both through their native ComfyUI nodes. Lyrics carry [Verse]/[Chorus] tags; the caption carries genre, tempo,
 *  instrumentation and voice. */

export interface SongInput { caption: string; lyrics: string; seconds: number; seed?: number; language?: string; bpm?: number; instrumental?: boolean; filenamePrefix?: string }

export function aceStepSong(i: SongInput): Graph {
  const lyrics = i.instrumental ? '[Instrumental]' : i.lyrics;
  return {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: MODELS.aceDit, weight_dtype: 'default' }, _meta: { title: 'ACE-Step 1.5 XL turbo' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: MODELS.aceClip, type: 'ace', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: MODELS.aceVae } },
    '4': { class_type: 'TextEncodeAceStepAudio1.5', inputs: { clip: ['2', 0], tags: i.caption, lyrics, seed: seed32(i.seed), bpm: i.bpm ?? 0, duration: Math.round(i.seconds), timesignature: 4, language: i.language ?? 'unknown', keyscale: '', generate_audio_codes: true, cfg_scale: 2.0, temperature: 0.85, top_p: 0.9, top_k: 0, min_p: 0.0 } },
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
