import { MODELS, seed32, snap, type Graph } from './index';
import { MINIMAX_H3_LOCAL as CAP, framesFor, guideFramesKept, videoTier, type VideoQualityTier } from '@/domain/video-capability';

/** LOCAL MINIMAX H3 — the open-weights MiniMax video model running in ComfyUI on the RTX 5090. Text-to-video and
 *  first/last-frame-to-video with native audio (FL2VA checkpoint), or reference-to-video (Ref2VA) with up to nine
 *  reference pictures and three reference audios, plus guides anchored on the target timeline (`MiniMaxH3AddGuide`).
 *  Follows the official templates (comfyui_workflow_templates 0.11.73): res_multistep, video shift 12, audio shift 3,
 *  24 fps, frame count on the 17k+5 grid. QUALITY TIER (capability 	iers, MODEL-EVAL-2026-10.md §8.4): inal (the\n *  default) = the base model at 20 steps, as the official templates ship; draft = the turbo LoRA, 8 (FL2VA) or 4\n *  (Ref2VA) steps — only when asked for. Explicit turbo/steps/scheduler/refImageSize override the tier. Verified against ComfyUI
 *  v0.38.1 `comfy_extras/nodes_minimax_h3.py` (docs/research/MINIMAX-CONTINUITY.md §1). */

/** The numbers below are READ from the engine's capability record (src/domain/video-capability.ts), never restated. */
export const H3_FPS = CAP.fps;
/** The trained range of the model (node tooltip: "124 = ~5s; trained range is ~124-362, longer is untested"). */
export const H3_MIN_FRAMES = CAP.minFrames;
export const H3_MAX_FRAMES = CAP.maxFrames;
/** Reference limits of `MiniMaxH3ReferenceToVideo` (autogrow max): 9 images, 3 videos (+ their soundtracks), 3 audios. */
export const H3_MAX_REF_IMAGES = CAP.refs.images;
export const H3_MAX_REF_AUDIOS = CAP.refs.audios;

/** ComfyUI's `align_frame_count`: the next frame count on the 17k+5 grid at or above n (never below 5). */
export function h3AlignFrames(n: number): number {
  const m = Math.max(5, Math.round(n));
  return m + (((5 - (m % 17)) % 17) + 17) % 17;
}

/** Frames generated for a clip of `seconds`: snapped UP to the 17k+5 grid exactly as the node and the official
 *  template do (`max(5, round(s·24)) + (5 − n % 17) % 17` in Python, where % is never negative), then held inside the
 *  trained range 124–362 (≈5.17–15.08 s). Over-generation is safe (the cut takes its window); under-generation is not. */
export function h3FrameCount(seconds: number): number {
  return framesFor(CAP, seconds);
}

/** Frames `MiniMaxH3AddGuide` keeps of an image batch: fewer than 5 → the first image only; otherwise snapped DOWN to
 *  5, 22, 39 … (17k+5) (`nodes_minimax_h3.py` MiniMaxH3AddGuide.execute). */
export function h3GuideClipFrames(n: number): number {
  return guideFramesKept(CAP, n);
}

/** Whether a guide of `guideFrames` frames anchored at `frameIdx` fits a clip of `frames` frames (the node refuses
 *  `resolved + guideFrames > frameCount`; a negative index counts from the end). */
export function h3GuideFits(frameIdx: number, guideFrames: number, frames: number): boolean {
  const at = frameIdx >= 0 ? frameIdx : frames + frameIdx;
  return at >= 0 && at + Math.max(1, guideFrames) <= frames;
}

/** A guide is CONDITIONING, not pinned media (`comfy/ldm/minimax/model.py`: keyframe rows are never updated and the
 *  target is always fully generated): anchored frames are re-rendered closely, anchored audio steers timing, prosody
 *  and timbre but the output audio is always new (docs/AUDIOVISUAL-QA.md E1). Uses: the recorded dialogue or the song
 *  stretch at the first speaking frame, the previous shot's tail (frames AND its sound, at frame 0) for a
 *  continuation, a drawn opening frame at 0 or an ending frame at −1 on the reference graph. */
export interface H3Guide {
  /** frame index the media is anchored at (negative counts from the end) */
  frameIdx: number;
  /** an uploaded image, or an uploaded video whose frames are anchored as a clip (cropped down to 5, 22, 39 … frames) */
  image?: string;
  imageIsVideo?: boolean;
  /** an uploaded audio file, cropped to the clip's remaining duration */
  audio?: string;
  /** the guide video's OWN soundtrack is anchored with its frames (GetVideoComponents audio → the same AddGuide):
   *  the template's continuation idiom, "the first 22 frames of an existing video plus its audio … to continue both
   *  streams". Ignored when `audio` names a file (that file wins) or the guide is not a video. */
  audioFromVideo?: boolean;
}

export interface H3Input {
  prompt: string;
  width: number; height: number; seconds: number;
  seed?: number; steps?: number; turbo?: boolean;
  /** the capability's quality tier (default inal); explicit turbo/steps/scheduler/refImageSize override it */
  quality?: VideoQualityTier;
  /** sampler schedule; the r2v template note: `beta`/`normal` "tends to outperform `simple`" for reference-heavy prompts */
  scheduler?: 'simple' | 'beta' | 'normal';
  /** Ref2VA picture sizing: `match` (down to the generation's area) or `max` (2048 short edge, slower) */
  refImageSize?: 'match' | 'max';
  /** On FL2VA: the first/last frame inputs (both also enter Qwen as <Picture 1>/<Picture 2>). On Ref2VA (which has no
   *  frame inputs): anchored as AddGuide images at frame 0 and −1, so neither is ever dropped. */
  firstFrame?: string; lastFrame?: string;
  referenceImages?: string[]; referenceAudio?: string[];
  guides?: H3Guide[];
  filenamePrefix?: string;
}

/** The engine's DEFAULT continuation guide length (22 frames ≈ 0.92 s: motion, speech rhythm and room tone; the
 *  template's idiom). A request reads the resolved choice (`resolveContinuation`: shot > studio > engine) from its shot
 *  pack, never this constant; it stays for the tests and tools that describe the default. */
export const H3_GUIDE_FRAMES = CAP.guides!.defaultContinuationFrames;

export type H3GraphKind = 'FL2VA' | 'REF2VA';
export const h3GraphKind = (i: Pick<H3Input, 'referenceImages' | 'referenceAudio'>): H3GraphKind => (i.referenceImages?.length || i.referenceAudio?.length ? 'REF2VA' : 'FL2VA');

export function minimaxH3Video(i: H3Input): Graph {
  const useRef = h3GraphKind(i) === 'REF2VA';
  const tier = videoTier(CAP, i.quality).config;
  const turbo = i.turbo ?? tier?.turbo ?? false;
  const steps = i.steps ?? (turbo ? (useRef ? 4 : 8) : (tier && !tier.turbo ? tier.steps : 20));
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
  const guides: H3Guide[] = [];
  if (useRef) {
    const inputs: Record<string, unknown> = { clip: ['2', 0], vae: ['3', 0], audio_vae: ['4', 0], prompt: i.prompt, width: w, height: h, length, ref_image_size: i.refImageSize ?? CAP.refs.imageSizing?.mode ?? 'match' };
    // the reference slots are ComfyUI v3 "autogrow" groups: the API key is the group and the slot joined by a dot
    // (`ref_images.ref_image_0`), which the executor folds back into the nested dict the node reads. Connection order
    // is the tokenizer's order: the k-th connected picture is <Picture k+1> in the prompt.
    (i.referenceImages ?? []).slice(0, H3_MAX_REF_IMAGES).forEach((ref, k) => { g[`ri${k}`] = { class_type: 'LoadImage', inputs: { image: ref } }; inputs[`ref_images.ref_image_${k}`] = [`ri${k}`, 0]; });
    (i.referenceAudio ?? []).slice(0, H3_MAX_REF_AUDIOS).forEach((ref, k) => { g[`ra${k}`] = { class_type: 'LoadAudio', inputs: { audio: ref } }; inputs[`ref_audios.ref_audio_${k}`] = [`ra${k}`, 0]; });
    g['7'] = { class_type: 'MiniMaxH3ReferenceToVideo', inputs };
    // Ref2VA has no frame inputs: the opening and ending frames become timeline anchors (the multiframe template's
    // pattern), so a reference shot never silently loses them
    if (i.firstFrame) guides.push({ frameIdx: 0, image: i.firstFrame });
    if (i.lastFrame) guides.push({ frameIdx: -1, image: i.lastFrame });
  } else {
    const inputs: Record<string, unknown> = { clip: ['2', 0], vae: ['3', 0], prompt: i.prompt, width: w, height: h, length };
    if (i.firstFrame) { g['ff'] = { class_type: 'LoadImage', inputs: { image: i.firstFrame } }; inputs.first_frame = ['ff', 0]; }
    if (i.lastFrame) { g['lf'] = { class_type: 'LoadImage', inputs: { image: i.lastFrame } }; inputs.last_frame = ['lf', 0]; }
    g['7'] = { class_type: 'MiniMaxH3ImageToVideo', inputs };
  }
  guides.push(...(i.guides ?? []));
  // guides chain on the conditioning: each one anchors its media at its frame index of the target timeline
  let positive: [string, number] = ['7', 0];
  guides.forEach((gd, k) => {
    const id = `g${k}`;
    const inputs: Record<string, unknown> = { positive, latent: ['7', 1], frame_idx: gd.frameIdx };
    let videoNode: string | undefined;
    if (gd.image) {
      if (gd.imageIsVideo) { videoNode = `${id}c`; g[`${id}v`] = { class_type: 'LoadVideo', inputs: { file: gd.image } }; g[videoNode] = { class_type: 'GetVideoComponents', inputs: { video: [`${id}v`, 0] } }; inputs.image = [videoNode, 0]; }
      else { g[`${id}i`] = { class_type: 'LoadImage', inputs: { image: gd.image } }; inputs.image = [`${id}i`, 0]; }
      inputs.vae = ['3', 0];
    }
    if (gd.audio) { g[`${id}a`] = { class_type: 'LoadAudio', inputs: { audio: gd.audio } }; inputs.audio = [`${id}a`, 0]; inputs.audio_vae = ['4', 0]; }
    else if (gd.audioFromVideo && videoNode) { inputs.audio = [videoNode, 1]; inputs.audio_vae = ['4', 0]; }
    g[id] = { class_type: 'MiniMaxH3AddGuide', inputs };
    positive = [id, 0];
  });
  g['8'] = { class_type: 'RandomNoise', inputs: { noise_seed: seed32(i.seed) } };
  g['9'] = { class_type: 'KSamplerSelect', inputs: { sampler_name: 'res_multistep' } };
  g['10'] = { class_type: 'BasicScheduler', inputs: { model, scheduler: i.scheduler ?? tier?.scheduler ?? 'simple', steps, denoise: 1.0 } };
  g['11'] = { class_type: 'BasicGuider', inputs: { model, conditioning: positive } };
  g['12'] = { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['8', 0], guider: ['11', 0], sampler: ['9', 0], sigmas: ['10', 0], latent_image: ['7', 1] } };
  g['13'] = { class_type: 'VAEDecode', inputs: { samples: ['12', 0], vae: ['3', 0] } };
  g['14'] = { class_type: 'VAEDecodeAudio', inputs: { samples: ['12', 0], vae: ['4', 0] } };
  g['15'] = { class_type: 'CreateVideo', inputs: { images: ['13', 0], audio: ['14', 0], fps: H3_FPS } };
  g['16'] = { class_type: 'SaveVideo', inputs: { video: ['15', 0], filename_prefix: i.filenamePrefix ?? 'vewbox/h3', format: 'mp4', codec: 'h264' } };
  return g;
}
