/** COMFYUI WORKFLOWS — built in code, versioned by content hash, never edited by hand. Node ids are strings; the
 *  shapes follow the official templates for each model family. Model filenames are the pinned files from
 *  docker/models/manifest.json. */

export type Graph = Record<string, { class_type: string; inputs: Record<string, unknown>; _meta?: { title: string } }>;

export const MODELS = {
  // images
  qwenEditDit: 'qwen_image_edit_2511_fp8mixed.safetensors',
  qwenEditLightning: 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors',
  qwenDit: 'qwen_image_2512_fp8_e4m3fn.safetensors',
  qwenLightning: 'Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors',
  qwenClip: 'qwen_2.5_vl_7b_fp8_scaled.safetensors',
  qwenVae: 'qwen_image_vae.safetensors',
  // local MiniMax H3
  h3Fl2va: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
  h3Ref2va: 'minimax_h3_ref2va_pruned_int8_convrot.safetensors',
  h3Clip: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
  h3VideoVae: 'minimax_h3_video_vae_int8_convrot.safetensors',
  h3AudioVae: 'minimax_h3_audio_vae_fp32.safetensors',
  h3TurboFl2v8: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors',
  h3TurboRef2v4: 'minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors',
  // music
  aceDit: 'acestep_v1.5_xl_turbo_bf16.safetensors',
  aceClip: 'qwen_1.7b_ace15.safetensors',
  aceVae: 'ace_1.5_vae.safetensors',
  music3Dit: 'minimax_music3_dit_int8_convrot.safetensors',
  music3Clip: 'minimax_music3_text_encoder_pruned_int8_convrot.safetensors',
  music3Vae: 'minimax_music3_dav.safetensors',
} as const;

export const seed32 = (seed?: number) => (seed === undefined || !Number.isFinite(seed) ? Math.floor(Math.random() * 2 ** 31) : Math.abs(Math.floor(seed)) % 2 ** 31);

/** Round to the multiple ComfyUI latents need. */
export const snap = (n: number, m: number) => Math.max(m, Math.round(n / m) * m);

export { qwenTextToImage, qwenEdit } from './qwen-image';
export { minimaxH3Video, h3FrameCount } from './minimax-h3';
export { aceStepSong, minimaxMusic3Song } from './music';
