import { MODELS, seed32, snap, type Graph } from './index';

/** LOCAL MINIMAX H3 — the open-weights MiniMax video model running in ComfyUI on the RTX 5090. Text-to-video and
 *  first/last-frame-to-video with native audio (FL2VA checkpoint), or reference-to-video (Ref2VA) with up to nine
 *  reference pictures and reference audio. Follows the official template: res_multistep / simple, video shift 12,
 *  audio shift 3, 24 fps, frame count on the 17k+5 grid, turbo LoRA for 8 (or 4) steps. */

export const H3_FPS = 24;
/** Frames must be 17k+5. */
export function h3FrameCount(seconds: number): number {
  const raw = Math.max(5, Math.round(seconds * H3_FPS));
  return raw + ((5 - (raw % 17)) % 17);
}

/** A guide anchors real media inside the clip being generated (ComfyUI's `MiniMaxH3AddGuide`): the frames and/or
 *  soundtrack are injected as latents at every sampling step and never denoised, so the output contains them
 *  exactly. Two uses: an authoritative soundtrack (a recorded dialogue line, a stretch of the song) that the mouths
 *  must follow, and the tail of the previous shot (its last frames + audio at frame 0) for an unbroken continuation. */
export interface H3Guide {
  /** frame index the media is anchored at (negative counts from the end) */
  frameIdx: number;
  /** an uploaded image, or an uploaded video whose frames are anchored as a clip (cropped to the 17k+5 grid) */
  image?: string;
  imageIsVideo?: boolean;
  /** an uploaded audio file, cropped to the clip's remaining duration */
  audio?: string;
}

export interface H3Input {
  prompt: string;
  width: number; height: number; seconds: number;
  seed?: number; steps?: number; turbo?: boolean;
  firstFrame?: string; lastFrame?: string;
  referenceImages?: string[]; referenceAudio?: string[];
  guides?: H3Guide[];
  filenamePrefix?: string;
}

/** Frames of the continuation guide: the previous shot's last 22 frames (the smallest clip on the 17k+5 grid above a
 *  single frame, ≈0.92 s at 24 fps), as MinimaxStoryBuilder's continuity mode and ComfyUI's node both use. */
export const H3_GUIDE_FRAMES = 22;

export function minimaxH3Video(i: H3Input): Graph {
  const useRef = Boolean(i.referenceImages?.length || i.referenceAudio?.length);
  const turbo = i.turbo !== false;
  const steps = i.steps ?? (turbo ? (useRef ? 4 : 8) : 20);
  // area cap 768x1344, multiples of 32
  let w = snap(i.width, 32), h = snap(i.height, 32);
  const cap = 768 * 1344;
  if (w * h > cap) { const s = Math.sqrt(cap / (w * h)); w = snap(w * s, 32); h = snap(h * s, 32); }
  const length = h3FrameCount(i.seconds);
  const g: Graph = {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: useRef ? MODELS.h3Ref2va : MODELS.h3Fl2va, weight_dtype: 'default' }, _meta: { title: 'MiniMax H3' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: MODELS.h3Clip, type: 'minimax', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: MODELS.h3VideoVae } },
    '4': { class_type: 'VAELoader', inputs: { vae_name: MODELS.h3AudioVae } },
  };
  let model: [string, number] = ['1', 0];
  if (turbo) { g['5'] = { class_type: 'LoraLoaderModelOnly', inputs: { model, lora_name: useRef ? MODELS.h3TurboRef2v4 : MODELS.h3TurboFl2v8, strength_model: 1.0 } }; model = ['5', 0]; }
  g['6'] = { class_type: 'MiniMaxH3SigmaShift', inputs: { model, shift_video: 12.0, shift_audio: 3.0 } };
  model = ['6', 0];
  if (useRef) {
    const inputs: Record<string, unknown> = { clip: ['2', 0], vae: ['3', 0], audio_vae: ['4', 0], prompt: i.prompt, width: w, height: h, length, ref_image_size: 'match' };
    // the reference slots are ComfyUI v3 "autogrow" groups: the API key is the group and the slot joined by a dot
    // (`ref_images.ref_image_0`), which the executor folds back into the nested dict the node reads
    (i.referenceImages ?? []).slice(0, 9).forEach((ref, k) => { g[`ri${k}`] = { class_type: 'LoadImage', inputs: { image: ref } }; inputs[`ref_images.ref_image_${k}`] = [`ri${k}`, 0]; });
    (i.referenceAudio ?? []).slice(0, 3).forEach((ref, k) => { g[`ra${k}`] = { class_type: 'LoadAudio', inputs: { audio: ref } }; inputs[`ref_audios.ref_audio_${k}`] = [`ra${k}`, 0]; });
    g['7'] = { class_type: 'MiniMaxH3ReferenceToVideo', inputs };
  } else {
    const inputs: Record<string, unknown> = { clip: ['2', 0], vae: ['3', 0], prompt: i.prompt, width: w, height: h, length };
    if (i.firstFrame) { g['ff'] = { class_type: 'LoadImage', inputs: { image: i.firstFrame } }; inputs.first_frame = ['ff', 0]; }
    if (i.lastFrame) { g['lf'] = { class_type: 'LoadImage', inputs: { image: i.lastFrame } }; inputs.last_frame = ['lf', 0]; }
    g['7'] = { class_type: 'MiniMaxH3ImageToVideo', inputs };
  }
  // guides chain on the conditioning: each one anchors its media at its frame index
  let positive: [string, number] = ['7', 0];
  (i.guides ?? []).forEach((gd, k) => {
    const id = `g${k}`;
    const inputs: Record<string, unknown> = { positive, latent: ['7', 1], frame_idx: gd.frameIdx };
    if (gd.image) {
      if (gd.imageIsVideo) { g[`${id}v`] = { class_type: 'LoadVideo', inputs: { file: gd.image } }; g[`${id}c`] = { class_type: 'GetVideoComponents', inputs: { video: [`${id}v`, 0] } }; inputs.image = [`${id}c`, 0]; }
      else { g[`${id}i`] = { class_type: 'LoadImage', inputs: { image: gd.image } }; inputs.image = [`${id}i`, 0]; }
      inputs.vae = ['3', 0];
    }
    if (gd.audio) { g[`${id}a`] = { class_type: 'LoadAudio', inputs: { audio: gd.audio } }; inputs.audio = [`${id}a`, 0]; inputs.audio_vae = ['4', 0]; }
    g[id] = { class_type: 'MiniMaxH3AddGuide', inputs };
    positive = [id, 0];
  });
  g['8'] = { class_type: 'RandomNoise', inputs: { noise_seed: seed32(i.seed) } };
  g['9'] = { class_type: 'KSamplerSelect', inputs: { sampler_name: 'res_multistep' } };
  g['10'] = { class_type: 'BasicScheduler', inputs: { model, scheduler: 'simple', steps, denoise: 1.0 } };
  g['11'] = { class_type: 'BasicGuider', inputs: { model, conditioning: positive } };
  g['12'] = { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['8', 0], guider: ['11', 0], sampler: ['9', 0], sigmas: ['10', 0], latent_image: ['7', 1] } };
  g['13'] = { class_type: 'VAEDecode', inputs: { samples: ['12', 0], vae: ['3', 0] } };
  g['14'] = { class_type: 'VAEDecodeAudio', inputs: { samples: ['12', 0], vae: ['4', 0] } };
  g['15'] = { class_type: 'CreateVideo', inputs: { images: ['13', 0], audio: ['14', 0], fps: H3_FPS } };
  g['16'] = { class_type: 'SaveVideo', inputs: { video: ['15', 0], filename_prefix: i.filenamePrefix ?? 'vewbox/h3', format: 'mp4', codec: 'h264' } };
  return g;
}
