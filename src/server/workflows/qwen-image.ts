import { MODELS, seed32, snap, type Graph } from './index';

/** QWEN-IMAGE — text-to-image (2512) and multi-reference editing (Edit-2511). Drafts run with the Lightning LoRAs so a
 *  1328² picture takes seconds on the 5090; identity-critical pictures (the character sheet) run in quality mode
 *  without the LoRA at 24 steps and cfg 4. Reference images are uploaded to ComfyUI's input folder first and
 *  referenced by filename. Every literal value here is checked against the running ComfyUI's node schemas by
 *  scripts/check-comfy-nodes.mjs through the registry's workflow templates. */

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

export interface ExtraLora { name: string; strength: number }

/** Quality mode: no Lightning LoRA, 24 steps, cfg 4.0 (the model card's true_cfg_scale; in ComfyUI the negative is
 *  encoded through the same Plus node and KSampler.cfg carries it). Draft mode: Lightning, 4 steps, cfg 1. */
const QUALITY = { steps: 24, cfg: 4.0 } as const;
const DRAFT = { steps: 4, cfg: 1.0 } as const;

/** Edit-2511 loaders and the model chain: UNET → (Lightning unless quality) → extra LoRAs in order → AuraFlow shift.
 *  Returns the link to feed the sampler. Node ids are fixed so the version hash is stable. Exported for the
 *  canonical-image graphs (canonical-image.ts). */
export function editModel(g: Graph, opts: { quality?: boolean; extraLoras?: ExtraLora[] }): [string, number] {
  g['1'] = { class_type: 'UNETLoader', inputs: { unet_name: MODELS.qwenEditDit, weight_dtype: 'default' }, _meta: { title: 'Qwen-Image-Edit-2511' } };
  g['2'] = { class_type: 'CLIPLoader', inputs: { clip_name: MODELS.qwenClip, type: 'qwen_image', device: 'default' } };
  g['3'] = { class_type: 'VAELoader', inputs: { vae_name: MODELS.qwenVae } };
  let model: [string, number] = ['1', 0];
  if (!opts.quality) { g['4'] = { class_type: 'LoraLoaderModelOnly', inputs: { model, lora_name: MODELS.qwenEditLightning, strength_model: 1.0 } }; model = ['4', 0]; }
  (opts.extraLoras ?? []).forEach((l, k) => {
    const id = `lora${k + 1}`;
    g[id] = { class_type: 'LoraLoaderModelOnly', inputs: { model, lora_name: l.name, strength_model: Math.max(-100, Math.min(100, Number.isFinite(l.strength) ? l.strength : 1.0)) } };
    model = [id, 0];
  });
  g['5'] = { class_type: 'ModelSamplingAuraFlow', inputs: { model, shift: 3.1 } };
  return ['5', 0];
}

export interface EditInput { prompt: string; negative?: string; references: string[]; width?: number; height?: number; seed?: number; steps?: number; cfg?: number; denoise?: number; filenamePrefix?: string; /** no Lightning LoRA: 24 steps, cfg 4 — for identity-critical pictures */ quality?: boolean; /** chained after the Lightning LoRA (or the bare model in quality mode), e.g. the Multiple-Angles LoRA */ extraLoras?: ExtraLora[] }

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

// ------------------------------------------------------------------------------------------------ identity sheet

/** A face box in fractions of the normalised 1024×1280 portrait frame (x, y top-left; w, h). */
export interface FaceBox { x: number; y: number; w: number; h: number }
/** Until a detector has measured the face: the centre-top of a head-and-shoulders portrait. */
export const DEFAULT_FACE_BOX: FaceBox = { x: 0.22, y: 0, w: 0.56, h: 0.45 };
const PORTRAIT_FRAME = { width: 1024, height: 1280 } as const;
const FACE_SIZE = 1024;

export interface IdentitySheetInput { portrait: string; /** an uploaded face crop; when absent the crop is cut from the portrait in the graph */ faceCrop?: string; faceBox?: FaceBox; /** the full text (see identity.ts sheetPrompt) — the identity line is part of it */ prompt: string; negative?: string; seed?: number; width?: number; height?: number; /** default true: the canonical picture is worth the minutes */ quality?: boolean; steps?: number; cfg?: number; extraLoras?: ExtraLora[]; filenamePrefix?: string }

/** The tiles the sheet is cut into, left to right. */
export const SHEET_TILES = ['FRONT', 'THREE_QUARTER', 'SIDE', 'BACK'] as const;
/** Node ids of the SaveImage nodes of the sheet graph: the handler reads each file from run.outputs[id]. */
export const SHEET_OUTPUTS = { sheet: 'save_sheet', face: 'save_face', FRONT: 'save_front', THREE_QUARTER: 'save_threequarter', SIDE: 'save_side', BACK: 'save_back' } as const;

/** One Edit-2511 pass draws front / three-quarter / side / back jointly from the portrait (image1) and its face crop
 *  (image2), so the four figures share one denoising: beards, patch layouts and shoes agree. The sheet is cut into
 *  equal tiles in the same graph (ImageCrop) and the face crop is saved too, so one run yields six files. */
export function qwenIdentitySheet(i: IdentitySheetInput): Graph {
  const W = snap(i.width ?? 1664, 16); const H = snap(i.height ?? 1216, 16);
  const g: Graph = {};
  const model = editModel(g, { quality: i.quality ?? true, extraLoras: i.extraLoras });
  g['img1'] = { class_type: 'LoadImage', inputs: { image: i.portrait } };
  g['img1s'] = { class_type: 'ImageScaleToTotalPixels', inputs: { image: ['img1', 0], upscale_method: 'lanczos', megapixels: 1.0, resolution_steps: 16 } };
  if (i.faceCrop) {
    g['img2'] = { class_type: 'LoadImage', inputs: { image: i.faceCrop } };
    g['face'] = { class_type: 'ImageScale', inputs: { image: ['img2', 0], upscale_method: 'lanczos', width: FACE_SIZE, height: FACE_SIZE, crop: 'center' } };
  } else {
    const b = i.faceBox ?? DEFAULT_FACE_BOX;
    const px = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(v * max)));
    const x = px(b.x, PORTRAIT_FRAME.width), y = px(b.y, PORTRAIT_FRAME.height);
    const w = Math.max(16, Math.min(PORTRAIT_FRAME.width - x, px(b.w, PORTRAIT_FRAME.width)));
    const h = Math.max(16, Math.min(PORTRAIT_FRAME.height - y, px(b.h, PORTRAIT_FRAME.height)));
    // normalise the portrait to the frame the box is expressed in (centre crop keeps the aspect), cut, then upscale
    g['norm'] = { class_type: 'ImageScale', inputs: { image: ['img1', 0], upscale_method: 'lanczos', width: PORTRAIT_FRAME.width, height: PORTRAIT_FRAME.height, crop: 'center' } };
    g['facecrop'] = { class_type: 'ImageCrop', inputs: { image: ['norm', 0], width: w, height: h, x, y } };
    g['face'] = { class_type: 'ImageScale', inputs: { image: ['facecrop', 0], upscale_method: 'lanczos', width: FACE_SIZE, height: FACE_SIZE, crop: 'disabled' } };
  }
  const enc = (text: string, id: string) => { g[id] = { class_type: 'TextEncodeQwenImageEditPlus', inputs: { clip: ['2', 0], prompt: text, vae: ['3', 0], image1: ['img1s', 0], image2: ['face', 0] } }; };
  enc(i.prompt, '6'); enc(i.negative ?? '', '7');
  g['8'] = { class_type: 'EmptySD3LatentImage', inputs: { width: W, height: H, batch_size: 1 } };
  const mode = (i.quality ?? true) ? QUALITY : DRAFT;
  g['9'] = { class_type: 'KSampler', inputs: { model, positive: ['6', 0], negative: ['7', 0], latent_image: ['8', 0], seed: seed32(i.seed), steps: i.steps ?? mode.steps, cfg: i.cfg ?? mode.cfg, sampler_name: 'euler', scheduler: 'simple', denoise: 1.0 } };
  g['10'] = { class_type: 'VAEDecode', inputs: { samples: ['9', 0], vae: ['3', 0] } };
  const prefix = i.filenamePrefix ?? 'vewbox/sheet';
  g[SHEET_OUTPUTS.sheet] = { class_type: 'SaveImage', inputs: { images: ['10', 0], filename_prefix: prefix } };
  g[SHEET_OUTPUTS.face] = { class_type: 'SaveImage', inputs: { images: ['face', 0], filename_prefix: `${prefix}-face` } };
  const tile = Math.floor(W / SHEET_TILES.length);
  SHEET_TILES.forEach((role, k) => {
    const crop = `crop_${role.toLowerCase()}`;
    g[crop] = { class_type: 'ImageCrop', inputs: { image: ['10', 0], width: tile, height: H, x: k * tile, y: 0 } };
    g[SHEET_OUTPUTS[role]] = { class_type: 'SaveImage', inputs: { images: [crop, 0], filename_prefix: `${prefix}-${role.toLowerCase().replace('_', '')}` } };
  });
  return g;
}

// ------------------------------------------------------------------------------------------------- derived views

export type ViewRole = 'FRONT' | 'THREE_QUARTER' | 'SIDE' | 'BACK' | 'FULL_BODY' | 'FACE' | 'EXPRESSION' | 'OUTFIT';

/** Prose for the 2511-native viewpoint wording, the fal Multiple-Angles tokens (`<sks> {azimuth} {elevation}
 *  {distance}`, exactly the README's 96 descriptors) and the output size per view. */
export const VIEW_SPEC: Record<ViewRole, { prose: string; angle?: string; width: number; height: number }> = {
  FRONT: { prose: 'full front view, standing, arms relaxed, facing camera, neutral expression', angle: 'front view eye-level shot medium shot', width: 1024, height: 1280 },
  THREE_QUARTER: { prose: 'three-quarter view turned 45 degrees to the left, standing, neutral expression', angle: 'front-left quarter view eye-level shot medium shot', width: 1024, height: 1280 },
  SIDE: { prose: 'exact profile side view facing left, standing, neutral expression', angle: 'left side view eye-level shot medium shot', width: 1024, height: 1280 },
  BACK: { prose: 'back view, standing, arms relaxed', angle: 'back view eye-level shot medium shot', width: 1024, height: 1280 },
  FULL_BODY: { prose: 'full-body front view head to toe, standing, shoes visible', angle: 'front view eye-level shot wide shot', width: 832, height: 1472 },
  FACE: { prose: 'tight face close-up, facing camera, neutral expression', angle: 'front view eye-level shot close-up', width: 1024, height: 1024 },
  EXPRESSION: { prose: 'expression sheet: the same head-and-shoulders face four times in a 2x2 grid showing joy, worry, anger and surprise', width: 1280, height: 1280 },
  OUTFIT: { prose: 'full-body front view showing the complete wardrobe in detail, head to toe', angle: 'front view eye-level shot wide shot', width: 832, height: 1472 },
};

export interface ViewInput { /** exactly three, in this order: the FRONT tile, the face crop, the whole sheet */ references: string[]; view: ViewRole; /** the full text (see identity.ts viewPrompt) */ prompt: string; negative?: string; seed?: number; quality?: boolean; /** chain the Multiple-Angles LoRA (the handler checks it is present in /models/loras) */ angleLora?: boolean; width?: number; height?: number; filenamePrefix?: string }

/** A derived view (full body, expressions, a redrawn tile) from the fixed three references. */
export function qwenView(i: ViewInput): Graph {
  if (i.references.length !== 3) throw new Error('qwenView needs exactly three references: the FRONT tile, the face crop, the sheet');
  const spec = VIEW_SPEC[i.view];
  if (!spec) throw new Error(`unknown view ${i.view}`);
  return qwenEdit({ prompt: i.prompt, negative: i.negative, references: i.references, width: i.width ?? spec.width, height: i.height ?? spec.height, seed: i.seed, quality: i.quality, extraLoras: i.angleLora ? [{ name: MODELS.qwenMultiAngleLora, strength: 1.0 }] : [], filenamePrefix: i.filenamePrefix ?? `vewbox/view-${i.view.toLowerCase().replace('_', '')}` });
}

// ---------------------------------------------------------------------------------------------- face detection

export const FACE_CHECK_OUTPUTS = { bboxes: 'bboxes', mask: 'save_mask' } as const;

export interface FaceCheckInput { image: string; numFaces?: number; minConfidence?: number; /** also render the face-oval mask (fails on a picture with no face; the bbox text does not) */ mask?: boolean; filenamePrefix?: string }

/** MediaPipe face detection in ComfyUI (core nodes, 5 MB of weights): the bounding boxes come back as text through
 *  PreviewAny (run.outputs.bboxes.text), optionally with the face-oval mask as an image. */
export function faceCheck(i: FaceCheckInput): Graph {
  const g: Graph = {
    img: { class_type: 'LoadImage', inputs: { image: i.image } },
    det: { class_type: 'LoadMediaPipeFaceLandmarker', inputs: { model_name: MODELS.mediapipeFace } },
    lm: { class_type: 'MediaPipeFaceLandmarker', inputs: { face_detection_model: ['det', 0], image: ['img', 0], detector_variant: 'both', num_faces: Math.max(0, Math.min(16, Math.round(i.numFaces ?? 5))), min_confidence: Math.max(0, Math.min(1, i.minConfidence ?? 0.5)), missing_frame_fallback: 'empty' } },
    [FACE_CHECK_OUTPUTS.bboxes]: { class_type: 'PreviewAny', inputs: { source: ['lm', 1] } },
  };
  if (i.mask) {
    g['mask'] = { class_type: 'MediaPipeFaceMask', inputs: { face_landmarks: ['lm', 0], regions: 'all' } };
    g['m2i'] = { class_type: 'MaskToImage', inputs: { mask: ['mask', 0] } };
    g[FACE_CHECK_OUTPUTS.mask] = { class_type: 'SaveImage', inputs: { images: ['m2i', 0], filename_prefix: i.filenamePrefix ?? 'vewbox/facecheck' } };
  }
  return g;
}
