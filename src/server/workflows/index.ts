/** COMFYUI WORKFLOWS — built in code, versioned by content hash, never edited by hand. Node ids are strings; the
 *  shapes follow the official templates for each model family. Model filenames are the pinned files from
 *  docker/models/manifest.json. */

import { createHash } from 'node:crypto';

export type Graph = Record<string, { class_type: string; inputs: Record<string, unknown>; _meta?: { title: string } }>;

export const MODELS = {
  // images
  qwenEditDit: 'qwen_image_edit_2511_fp8mixed.safetensors',
  qwenEditLightning: 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors',
  qwenDit: 'qwen_image_2512_fp8_e4m3fn.safetensors',
  qwenLightning: 'Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors',
  qwenClip: 'qwen_2.5_vl_7b_fp8_scaled.safetensors',
  qwenVae: 'qwen_image_vae.safetensors',
  /** FLUX.2 [klein] 4B distilled (Comfy-Org/flux2-klein-4B, Apache-2.0): the canonical image from the producer's picture
   *  (docs/research/FLUX-VS-QWEN.md), with its Qwen3-4B text encoder and the FLUX.2 VAE */
  kleinDit: 'flux-2-klein-4b.safetensors',
  kleinTe: 'qwen_3_4b.safetensors',
  kleinVae: 'flux2-vae.safetensors',
  /** MediaPipe BlazeFace + landmarker weights (Comfy-Org/mediapipe, models/detection), 5.4 MB */
  mediapipeFace: 'mediapipe_face_fp32.safetensors',
  /** Qwen3.5-4B (Comfy-Org/Qwen3.5, Apache-2.0, 9.3 GB) — a vision-language model run by core `TextGenerate`; used
   *  only to describe an uploaded reference picture (Image Reference mode) */
  vlm: 'qwen3.5_4b_bf16.safetensors',
  // local MiniMax H3
  h3Fl2va: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
  h3Ref2va: 'minimax_h3_ref2va_pruned_int8_convrot.safetensors',
  h3Clip: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
  h3VideoVae: 'minimax_h3_video_vae_int8_convrot.safetensors',
  h3AudioVae: 'minimax_h3_audio_vae_fp32.safetensors',
  h3TurboFl2v8: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors',
  h3TurboRef2v4: 'minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors',
  // music
  /** ACE-Step 1.5 XL: SFT (the production song generator), turbo (a draft or a fallback), base (repaint/cover/extend) */
  aceDitSft: 'acestep_v1.5_xl_sft_bf16.safetensors',
  aceDit: 'acestep_v1.5_xl_turbo_bf16.safetensors',
  aceDitBase: 'acestep_v1.5_xl_base_bf16.safetensors',
  /** ACE-Step 1.5 loads two encoders: the 0.6B text encoder and the language model that writes the audio codes */
  aceTextEncoder: 'qwen_0.6b_ace15.safetensors',
  aceClip: 'qwen_1.7b_ace15.safetensors',
  /** the ACE-Step 5Hz LM 4B (composition / audio codes), the production pairing with XL-SFT */
  aceLm4b: 'qwen_4b_ace15.safetensors',
  aceVae: 'ace_1.5_vae.safetensors',
  music3Dit: 'minimax_music3_dit_int8_convrot.safetensors',
  music3Clip: 'minimax_music3_text_encoder_pruned_int8_convrot.safetensors',
  music3Vae: 'minimax_music3_dav.safetensors',
} as const;

/** A workflow's version: a hash of its structure (node classes, wiring and fixed parameters) with the per-run values
 *  (prompt, seed, files, sizes, durations) blanked, so the same template always has the same version. Recorded on
 *  every take and listed in the registry. */
export function workflowVersion(graph: Graph): string {
  const VOLATILE = new Set(['prompt', 'text', 'tags', 'lyrics', 'caption', 'seed', 'noise_seed', 'image', 'audio', 'filename_prefix', 'width', 'height', 'length', 'seconds', 'duration', 'max_duration', 'megapixels', 'bpm', 'language', 'strength_model', 'batch_size']);
  const shape = Object.fromEntries(Object.entries(graph).sort(([a], [b]) => a.localeCompare(b)).map(([id, n]) => [id, { c: n.class_type, i: Object.fromEntries(Object.entries(n.inputs).filter(([k]) => !VOLATILE.has(k)).map(([k, v]) => [k, Array.isArray(v) ? `@${v[0]}:${v[1]}` : v])) }]));
  return createHash('sha256').update(JSON.stringify(shape)).digest('hex').slice(0, 16);
}

export const seed32 = (seed?: number) => (seed === undefined || !Number.isFinite(seed) ? Math.floor(Math.random() * 2 ** 31) : Math.abs(Math.floor(seed)) % 2 ** 31);

/** Round to the multiple ComfyUI latents need. */
export const snap = (n: number, m: number) => Math.max(m, Math.round(n / m) * m);

export { qwenTextToImage, qwenEdit, qwenSecondary, faceCheck, isSecondaryMaterialKind, FACE_CHECK_OUTPUTS, SECONDARY_MATERIAL, SECONDARY_SPEC } from './qwen-image';
export type { SecondaryMaterialKind } from './qwen-image';
export { identitySeedFor, seedFromId } from './identity';
// the canonical character image and its identity line (docs/CONTRACTS-IDENTITY-PACK.md v2; the handler is
// src/worker/handlers/images.ts)
export * from './canonical-image';
export { joyaiEdit, JOYAI_FILES, JOYAI_MAX_REFERENCES, JOYAI_DEFAULTS } from './joyai-image';
export type { JoyaiEditInput, JoyaiReference } from './joyai-image';
export { minimaxH3Video, h3FrameCount, h3GraphKind, H3_FPS } from './minimax-h3';
export { aceStepSong, minimaxMusic3Song } from './music';
