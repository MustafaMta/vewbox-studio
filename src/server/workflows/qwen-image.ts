import { MODELS, seed32, snap, type Graph } from './index';

/** QWEN-IMAGE — text-to-image (2512) and multi-reference editing (Edit-2511). Drafts run with the Lightning LoRAs so a
 *  1328² picture takes seconds on the 5090; pictures of a character (the canonical image, secondary material) run in
 *  quality mode without the LoRA at 24 steps and cfg 4, where the negative prompt takes effect. Reference images are
 *  uploaded to ComfyUI's input folder first and referenced by filename. Every literal value here is checked against the
 *  running ComfyUI's node schemas by scripts/check-comfy-nodes.mjs through the registry's workflow templates. */

export interface T2IInput { prompt: string; negative?: string; width: number; height: number; seed?: number; steps?: number; cfg?: number; filenamePrefix?: string }

export function qwenTextToImage(i: T2IInput): Graph {
  const w = snap(i.width, 16); const h = snap(i.height, 16);
  return {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: MODELS.qwenDit, weight_dtype: 'default' }, _meta: { title: 'Qwen-Image-2512' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: MODELS.qwenClip, type: 'qwen_image', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: MODELS.qwenVae } },
    '4': { class_type: 'LoraLoaderModelOnly', inputs: { model: ['1', 0], lora_name: MODELS.qwenLightning, strength_model: 1.0 } },
    '5': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['4', 0], shift: 3.1 } },
    '6': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: i.prompt } },
    '7': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: i.negative ?? '' } },
    '8': { class_type: 'EmptySD3LatentImage', inputs: { width: w, height: h, batch_size: 1 } },
    '9': { class_type: 'KSampler', inputs: { model: ['5', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['8', 0], seed: seed32(i.seed), steps: i.steps ?? 8, cfg: i.cfg ?? 1.0, sampler_name: 'euler', scheduler: 'simple', denoise: 1.0 } },
    '10': { class_type: 'VAEDecode', inputs: { samples: ['9', 0], vae: ['3', 0] } },
    '11': { class_type: 'SaveImage', inputs: { images: ['10', 0], filename_prefix: i.filenamePrefix ?? 'vewbox/t2i' } },
  };
}

/** Quality mode: no Lightning LoRA, 24 steps, cfg 4.0 (the model card's true_cfg_scale; in ComfyUI the negative is
 *  encoded through the same Plus node and KSampler.cfg carries it). Draft mode: Lightning, 4 steps, cfg 1. */
const QUALITY = { steps: 24, cfg: 4.0 } as const;
const DRAFT = { steps: 4, cfg: 1.0 } as const;

/** Edit-2511 loaders and the model chain: UNET → (Lightning unless quality) → AuraFlow shift. Returns the link to feed
 *  the sampler. Node ids are fixed so the version hash is stable. Exported for the canonical-image graphs
 *  (canonical-image.ts). */
export function editModel(g: Graph, opts: { quality?: boolean }): [string, number] {
  g['1'] = { class_type: 'UNETLoader', inputs: { unet_name: MODELS.qwenEditDit, weight_dtype: 'default' }, _meta: { title: 'Qwen-Image-Edit-2511' } };
  g['2'] = { class_type: 'CLIPLoader', inputs: { clip_name: MODELS.qwenClip, type: 'qwen_image', device: 'default' } };
  g['3'] = { class_type: 'VAELoader', inputs: { vae_name: MODELS.qwenVae } };
  let model: [string, number] = ['1', 0];
  if (!opts.quality) { g['4'] = { class_type: 'LoraLoaderModelOnly', inputs: { model, lora_name: MODELS.qwenEditLightning, strength_model: 1.0 } }; model = ['4', 0]; }
  g['5'] = { class_type: 'ModelSamplingAuraFlow', inputs: { model, shift: 3.1 } };
  return ['5', 0];
}

export interface EditInput { prompt: string; negative?: string; references: string[]; width?: number; height?: number; seed?: number; steps?: number; cfg?: number; denoise?: number; filenamePrefix?: string; /** no Lightning LoRA: 24 steps, cfg 4 — for pictures of a character */ quality?: boolean }

/** Edit-2511 takes up to three reference pictures (image1 = the main subject or scene, image2/3 = extra identities
 *  or costume sheets). The output size follows image1 unless width/height are given. */
export function qwenEdit(i: EditInput): Graph {
  if (i.references.length === 0 || i.references.length > 3) throw new Error('qwenEdit needs 1–3 reference images');
  const g: Graph = {};
  const model = editModel(g, i);
  const imgNodes: string[] = [];
  i.references.forEach((ref, k) => {
    const id = `img${k + 1}`;
    g[id] = { class_type: 'LoadImage', inputs: { image: ref } };
    // the editor works at ~1 megapixel per reference; scale each so the long side is 1328
    // resolution_steps became a required input in ComfyUI 0.38 (found by the first real reference-conditioned job)
    g[`${id}s`] = { class_type: 'ImageScaleToTotalPixels', inputs: { image: [id, 0], upscale_method: 'lanczos', megapixels: 1.0, resolution_steps: 16 } };
    imgNodes.push(`${id}s`);
  });
  const enc = (text: string, id: string) => { g[id] = { class_type: 'TextEncodeQwenImageEditPlus', inputs: { clip: ['2', 0], prompt: text, vae: ['3', 0], ...(imgNodes[0] ? { image1: [imgNodes[0], 0] } : {}), ...(imgNodes[1] ? { image2: [imgNodes[1], 0] } : {}), ...(imgNodes[2] ? { image3: [imgNodes[2], 0] } : {}) } }; };
  enc(i.prompt, '6'); enc(i.negative ?? '', '7');
  if (i.width && i.height) g['8'] = { class_type: 'EmptySD3LatentImage', inputs: { width: snap(i.width, 16), height: snap(i.height, 16), batch_size: 1 } };
  else g['8'] = { class_type: 'VAEEncode', inputs: { pixels: [imgNodes[0], 0], vae: ['3', 0] } };
  const mode = i.quality ? QUALITY : DRAFT;
  g['9'] = { class_type: 'KSampler', inputs: { model, positive: ['6', 0], negative: ['7', 0], latent_image: ['8', 0], seed: seed32(i.seed), steps: i.steps ?? mode.steps, cfg: i.cfg ?? mode.cfg, sampler_name: 'euler', scheduler: 'simple', denoise: i.denoise ?? 1.0 } };
  g['10'] = { class_type: 'VAEDecode', inputs: { samples: ['9', 0], vae: ['3', 0] } };
  g['11'] = { class_type: 'SaveImage', inputs: { images: ['10', 0], filename_prefix: i.filenamePrefix ?? 'vewbox/edit' } };
  return g;
}

// --------------------------------------------------------------------------------------------- secondary material

/** Optional material drawn on request from the canonical image (docs/CONTRACTS-IDENTITY-PACK.md v2 §1: tier
 *  SECONDARY, never the identity): an expression sheet, the outfit in detail, a close-up portrait. One Edit-2511 pass
 *  each, image 1 = the canonical image; no other view is drawn. */
export const SECONDARY_MATERIAL = ['EXPRESSION', 'OUTFIT', 'PORTRAIT'] as const;
export type SecondaryMaterialKind = (typeof SECONDARY_MATERIAL)[number];
export const isSecondaryMaterialKind = (x: unknown): x is SecondaryMaterialKind => (SECONDARY_MATERIAL as readonly unknown[]).includes(x);

/** What each kind shows and its output size (multiples of 16). */
export const SECONDARY_SPEC: Record<SecondaryMaterialKind, { prose: string; width: number; height: number }> = {
  EXPRESSION: { prose: 'An expression sheet: the same head-and-shoulders face four times in a 2x2 grid, showing joy, worry, anger and surprise', width: 1280, height: 1280 },
  OUTFIT: { prose: 'An outfit reference: the whole figure from the front, head to toe, every garment, accessory and the footwear clearly visible and in detail', width: 928, height: 1664 },
  PORTRAIT: { prose: 'A head-and-shoulders close-up portrait, facing the camera, neutral calm expression', width: 1024, height: 1280 },
};

/** One kind of secondary material from the canonical image (an uploaded file name), in quality mode by default. */
export function qwenSecondary(i: { canonical: string; kind: SecondaryMaterialKind; prompt: string; negative?: string; seed?: number; quality?: boolean }): Graph {
  const spec = SECONDARY_SPEC[i.kind];
  if (!spec) throw new Error(`unknown secondary material ${i.kind}`);
  return qwenEdit({ prompt: i.prompt, negative: i.negative, references: [i.canonical], width: spec.width, height: spec.height, seed: i.seed, quality: i.quality ?? true, filenamePrefix: `vewbox/secondary-${i.kind.toLowerCase()}` });
}

// ---------------------------------------------------------------------------------------------- face detection

export const FACE_CHECK_OUTPUTS = { bboxes: 'bboxes' } as const;

export interface FaceCheckInput { image: string; numFaces?: number; minConfidence?: number }

/** MediaPipe face detection in ComfyUI (core nodes, 5 MB of weights): the bounding boxes come back as text through
 *  PreviewAny (run.outputs.bboxes.text). */
export function faceCheck(i: FaceCheckInput): Graph {
  return {
    img: { class_type: 'LoadImage', inputs: { image: i.image } },
    det: { class_type: 'LoadMediaPipeFaceLandmarker', inputs: { model_name: MODELS.mediapipeFace } },
    lm: { class_type: 'MediaPipeFaceLandmarker', inputs: { face_detection_model: ['det', 0], image: ['img', 0], detector_variant: 'both', num_faces: Math.max(0, Math.min(16, Math.round(i.numFaces ?? 5))), min_confidence: Math.max(0, Math.min(1, i.minConfidence ?? 0.5)), missing_frame_fallback: 'empty' } },
    [FACE_CHECK_OUTPUTS.bboxes]: { class_type: 'PreviewAny', inputs: { source: ['lm', 1] } },
  };
}
