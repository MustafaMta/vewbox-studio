import { seed32, snap, type Graph } from './index';
import type { PxRect } from './canonical-image';

/** JOYAI-IMAGE-EDIT — JD's 16B MMDiT editor with a Qwen3-VL-8B encoder (jdopensource/JoyAI-Image-Edit-Plus-ComfyUI,
 *  repackaged as Comfy-Org/JoyAI-Image-Edit; Apache-2.0), CANDIDATE of the 2026-10-06 model upgrade
 *  (docs/research/MODEL-EVAL-2026-10.md §7). Core ComfyUI 0.38.1 nodes only; the wiring is the official template
 *  `image_joyai_image_edit` (comfyui_workflow_templates 0.11.73): UNETLoader → CFGNorm(1, pre_cfg) → KSampler 40 steps,
 *  cfg 4, euler/normal; CLIPLoader type `joyimage`; TextEncodeJoyImageEdit for the prompt AND the negative, each with the
 *  same reference pictures (autogrow `images.image0…image5`, at most 6) and the VAE; EmptySD3LatentImage at the target
 *  size. The VAE file is the Wan2.1 VAE, used here only as JoyAI's image latent codec (no Wan video model is installed or
 *  used). Reference pictures are scaled to ≈1 MP as the studio's other editors scale them. */

/** The candidate's pinned files (manifest group eval-joyai-image-edit). Kept out of `MODELS` until promoted, so the
 *  registry never lists a candidate as a weight the studio uses. */
export const JOYAI_FILES = {
  dit: 'joyai_image_edit_int8_convrot.safetensors',
  te: 'qwen3vl_8b_joyimage_edit_int8_convrot.safetensors',
  vae: 'wan_2.1_vae.safetensors',
} as const;

export const JOYAI_MAX_REFERENCES = 6;
export const JOYAI_DEFAULTS = { steps: 40, cfg: 4.0, sampler: 'euler', scheduler: 'normal' } as const;

export interface JoyaiReference {
  /** an uploaded file name in ComfyUI's input folder */
  image: string;
  /** cut this rectangle out of the picture first (a face crop), then scale it to `square`² instead of ≈1 MP */
  crop?: PxRect;
  square?: number;
}

export interface JoyaiEditInput {
  prompt: string;
  negative?: string;
  references: Array<string | JoyaiReference>;
  width: number;
  height: number;
  seed?: number;
  steps?: number;
  cfg?: number;
  filenamePrefix?: string;
  /** the SaveImage node id (the canonical graphs use CANONICAL_OUTPUT) */
  outputId?: string;
}

export function joyaiEdit(i: JoyaiEditInput): Graph {
  if (i.references.length > JOYAI_MAX_REFERENCES) throw new Error(`joyaiEdit takes at most ${JOYAI_MAX_REFERENCES} reference images`);
  const g: Graph = {
    unet: { class_type: 'UNETLoader', inputs: { unet_name: JOYAI_FILES.dit, weight_dtype: 'default' }, _meta: { title: 'JoyAI-Image-Edit' } },
    norm: { class_type: 'CFGNorm', inputs: { model: ['unet', 0], strength: 1.0, pre_cfg: true } },
    clip: { class_type: 'CLIPLoader', inputs: { clip_name: JOYAI_FILES.te, type: 'joyimage', device: 'default' } },
    vae: { class_type: 'VAELoader', inputs: { vae_name: JOYAI_FILES.vae } },
  };
  const images: Record<string, [string, number]> = {};
  i.references.forEach((r, k) => {
    const ref: JoyaiReference = typeof r === 'string' ? { image: r } : r;
    const id = `img${k + 1}`;
    g[id] = { class_type: 'LoadImage', inputs: { image: ref.image } };
    let src: [string, number] = [id, 0];
    if (ref.crop) {
      const c = ref.crop;
      g[`${id}c`] = { class_type: 'ImageCrop', inputs: { image: src, width: Math.max(16, Math.round(c.width)), height: Math.max(16, Math.round(c.height)), x: Math.max(0, Math.round(c.x)), y: Math.max(0, Math.round(c.y)) } };
      src = [`${id}c`, 0];
    }
    g[`${id}s`] = ref.square
      ? { class_type: 'ImageScale', inputs: { image: src, upscale_method: 'lanczos', width: ref.square, height: ref.square, crop: 'center' } }
      : { class_type: 'ImageScaleToTotalPixels', inputs: { image: src, upscale_method: 'lanczos', megapixels: 1.0, resolution_steps: 16 } };
    images[`images.image${k}`] = [`${id}s`, 0];
  });
  g.pos = { class_type: 'TextEncodeJoyImageEdit', inputs: { clip: ['clip', 0], prompt: i.prompt, vae: ['vae', 0], ...images } };
  g.neg = { class_type: 'TextEncodeJoyImageEdit', inputs: { clip: ['clip', 0], prompt: i.negative ?? '', vae: ['vae', 0], ...images } };
  g.latent = { class_type: 'EmptySD3LatentImage', inputs: { width: snap(i.width, 16), height: snap(i.height, 16), batch_size: 1 } };
  g.sample = { class_type: 'KSampler', inputs: { model: ['norm', 0], positive: ['pos', 0], negative: ['neg', 0], latent_image: ['latent', 0], seed: seed32(i.seed), steps: i.steps ?? JOYAI_DEFAULTS.steps, cfg: i.cfg ?? JOYAI_DEFAULTS.cfg, sampler_name: JOYAI_DEFAULTS.sampler, scheduler: JOYAI_DEFAULTS.scheduler, denoise: 1.0 } };
  g.decode = { class_type: 'VAEDecode', inputs: { samples: ['sample', 0], vae: ['vae', 0] } };
  g[i.outputId ?? 'save'] = { class_type: 'SaveImage', inputs: { images: ['decode', 0], filename_prefix: i.filenamePrefix ?? 'vewbox/joyai-edit' } };
  return g;
}
