import { MODELS, seed32, snap, type Graph } from './index';

/** QWEN-IMAGE — text-to-image (2512) and multi-reference editing (Edit-2511), both with the Lightning LoRAs so a
 *  1328² picture takes seconds rather than minutes on the 5090. Reference images are uploaded to ComfyUI's input
 *  folder first and referenced by filename. */

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

export interface EditInput { prompt: string; negative?: string; references: string[]; width?: number; height?: number; seed?: number; steps?: number; cfg?: number; denoise?: number; filenamePrefix?: string }

/** Edit-2511 takes up to three reference pictures (image1 = the main subject or scene, image2/3 = extra identities
 *  or costume sheets). The output size follows image1 unless width/height are given. */
export function qwenEdit(i: EditInput): Graph {
  if (i.references.length === 0 || i.references.length > 3) throw new Error('qwenEdit needs 1–3 reference images');
  const g: Graph = {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: MODELS.qwenEditDit, weight_dtype: 'default' }, _meta: { title: 'Qwen-Image-Edit-2511' } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: MODELS.qwenClip, type: 'qwen_image', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: MODELS.qwenVae } },
    '4': { class_type: 'LoraLoaderModelOnly', inputs: { model: ['1', 0], lora_name: MODELS.qwenEditLightning, strength_model: 1.0 } },
    '5': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['4', 0], shift: 3.1 } },
  };
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
  g['9'] = { class_type: 'KSampler', inputs: { model: ['5', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['8', 0], seed: seed32(i.seed), steps: i.steps ?? 4, cfg: i.cfg ?? 1.0, sampler_name: 'euler', scheduler: 'simple', denoise: i.denoise ?? 1.0 } };
  g['10'] = { class_type: 'VAEDecode', inputs: { samples: ['9', 0], vae: ['3', 0] } };
  g['11'] = { class_type: 'SaveImage', inputs: { images: ['10', 0], filename_prefix: i.filenamePrefix ?? 'vewbox/edit' } };
  return g;
}
