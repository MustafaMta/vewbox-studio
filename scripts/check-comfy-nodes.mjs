#!/usr/bin/env node
/** Verifies that the running ComfyUI exposes every node class and input the studio's workflow templates use
 *  (src/server/workflows), and that the model files they name are visible to it. Run after `docker compose up`:
 *    node scripts/check-comfy-nodes.mjs            # COMFYUI_URL defaults to http://127.0.0.1:8188
 *  Exit code 1 when anything is missing, with the exact names, so a ComfyUI upgrade never fails silently at job time. */

const base = (process.env.COMFYUI_URL || 'http://127.0.0.1:8188').replace(/\/$/, '');

const NEEDED = {
  // video: local MiniMax H3
  UNETLoader: ['unet_name', 'weight_dtype'], CLIPLoader: ['clip_name', 'type'], VAELoader: ['vae_name'], LoraLoaderModelOnly: ['model', 'lora_name', 'strength_model'],
  MiniMaxH3SigmaShift: ['model', 'shift_video', 'shift_audio'], MiniMaxH3ImageToVideo: ['clip', 'vae', 'prompt', 'width', 'height', 'length', 'first_frame', 'last_frame'],
  MiniMaxH3ReferenceToVideo: ['clip', 'vae', 'audio_vae', 'prompt', 'width', 'height', 'length', 'ref_image_size', 'ref_images', 'ref_audios'],
  RandomNoise: ['noise_seed'], KSamplerSelect: ['sampler_name'], BasicScheduler: ['model', 'scheduler', 'steps', 'denoise'], BasicGuider: ['model', 'conditioning'],
  SamplerCustomAdvanced: ['noise', 'guider', 'sampler', 'sigmas', 'latent_image'], VAEDecode: ['samples', 'vae'], VAEDecodeAudio: ['samples', 'vae'],
  CreateVideo: ['images', 'audio', 'fps'], SaveVideo: ['video', 'filename_prefix', 'format', 'codec'], LoadImage: ['image'], LoadAudio: ['audio'],
  // images: Qwen-Image / Qwen-Image-Edit
  ModelSamplingAuraFlow: ['model', 'shift'], DualCLIPLoader: ['clip_name1', 'clip_name2', 'type', 'device'], CLIPTextEncode: ['clip', 'text'], EmptySD3LatentImage: ['width', 'height', 'batch_size'],
  KSampler: ['model', 'positive', 'negative', 'latent_image', 'seed', 'steps', 'cfg', 'sampler_name', 'scheduler', 'denoise'], SaveImage: ['images', 'filename_prefix'],
  ImageScaleToTotalPixels: ['image', 'upscale_method', 'megapixels', 'resolution_steps'], TextEncodeQwenImageEditPlus: ['clip', 'prompt', 'vae', 'image1', 'image2', 'image3'], VAEEncode: ['pixels', 'vae'],
  // identity sheet tiles, face crops and reference validation (core nodes of ComfyUI 0.38)
  ImageCrop: ['image', 'width', 'height', 'x', 'y'], ImageScale: ['image', 'upscale_method', 'width', 'height', 'crop'],
  LoadMediaPipeFaceLandmarker: ['model_name'], MediaPipeFaceLandmarker: ['face_detection_model', 'image', 'detector_variant', 'num_faces', 'min_confidence', 'missing_frame_fallback'],
  MediaPipeFaceMask: ['face_landmarks', 'regions'], MaskToImage: ['mask'], PreviewAny: ['source'],
  // reading an uploaded reference picture: Qwen3.5-4B in core TextGenerate (the canonical image's Image Reference mode)
  TextGenerate: ['clip', 'prompt', 'max_length', 'sampling_mode', 'image', 'thinking', 'use_default_template', 'system_prompt'], PrimitiveStringMultiline: ['value'],
  // music: ACE-Step 1.5 and MiniMax Music 3
  'TextEncodeAceStepAudio1.5': ['clip', 'tags', 'lyrics', 'seed', 'bpm', 'duration', 'timesignature', 'language', 'keyscale', 'generate_audio_codes', 'cfg_scale', 'temperature', 'top_p', 'top_k', 'min_p'],
  ConditioningZeroOut: ['conditioning'], 'EmptyAceStep1.5LatentAudio': ['seconds', 'batch_size'], SaveAudio: ['audio', 'filename_prefix'],
  MiniMaxMusic3TextEncode: ['clip', 'caption', 'lyrics', 'seed', 'max_duration', 'cfg_scale', 'top_k'], EmptyMiniMaxMusic3LatentAudio: ['seconds', 'batch_size'],
};
const CLIP_TYPES = ['minimax', 'qwen_image', 'ace', 'stable_diffusion']; // Music 3's encoder loads under `minimax` too (detected by its weights); Qwen3.5 is detected by its weights under any type
const SAMPLERS = ['res_multistep', 'euler'];

const res = await fetch(`${base}/object_info`);
if (!res.ok) { console.error(`ComfyUI at ${base} answered ${res.status}`); process.exit(1); }
const info = await res.json();
const problems = [];
const inputsOf = (node) => ({ ...(node.input?.required ?? {}), ...(node.input?.optional ?? {}) });
for (const [cls, inputs] of Object.entries(NEEDED)) {
  const node = info[cls];
  if (!node) { problems.push(`missing node class: ${cls}`); continue; }
  const have = inputsOf(node);
  for (const inp of inputs) if (!(inp in have)) problems.push(`${cls}: missing input "${inp}" (has: ${Object.keys(have).join(', ')})`);
}
// combo options come either as a plain list (classic schema) or as ["COMBO", {options}] (v3 schema)
const options = (spec) => (Array.isArray(spec) ? (Array.isArray(spec[0]) ? spec[0] : spec[0] === 'COMBO' ? spec[1]?.options ?? [] : []) : []);
const clipTypes = info.CLIPLoader ? options(inputsOf(info.CLIPLoader).type) : [];
for (const t of CLIP_TYPES) if (!clipTypes.includes(t)) problems.push(`CLIPLoader.type lacks "${t}" (has: ${clipTypes.join(', ')})`);
const samplers = info.KSamplerSelect ? options(inputsOf(info.KSamplerSelect).sampler_name) : [];
for (const s of SAMPLERS) if (!samplers.includes(s)) problems.push(`sampler "${s}" not available`);

// every workflow template the studio renders, from the registry: each node must provide every REQUIRED input of
// its class (a ComfyUI upgrade that adds a required input — as `ImageScaleToTotalPixels.resolution_steps` did —
// fails here instead of at the first real job)
//
// The templates come from the running studio (its registry), or — to check a branch the server is not running —
// from a JSON file of [{ name, graph }] named by TEMPLATES_JSON, written with:
//   pnpm exec tsx -e "import('./src/server/registry.ts').then(m => console.log(JSON.stringify(m.workflowTemplates())))" > templates.json
const studio = process.env.STUDIO_URL || 'http://localhost:4200';
try {
  const templates = [];
  if (process.env.TEMPLATES_JSON) {
    const { readFile } = await import('node:fs/promises');
    for (const t of JSON.parse(await readFile(process.env.TEMPLATES_JSON, 'utf8'))) templates.push(t);
    console.log(`templates: ${templates.length} from ${process.env.TEMPLATES_JSON}`);
  } else {
    // POST: the registry is synced now (a GET only reads what the last sync wrote), so new templates are listed
    const reg = await fetch(`${studio}/api/registry`, { method: 'POST' }).then((r) => r.json());
    const seenWf = new Set();
    for (const wf of reg.workflows ?? []) {
      if (seenWf.has(wf.name)) continue; seenWf.add(wf.name);
      const graph = (await fetch(`${studio}/api/registry/workflow/${encodeURIComponent(wf.name)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null))?.graph;
      if (graph) templates.push({ name: wf.name, graph });
    }
    console.log(`templates: ${templates.length} from ${studio}`);
  }
  for (const wf of templates) {
    const graph = wf.graph;
    if (!graph) continue;
    for (const [id, node] of Object.entries(graph)) {
      const cls = info[node.class_type];
      if (!cls) { problems.push(`${wf.name}: node ${id} uses unknown class ${node.class_type}`); continue; }
      for (const req of Object.keys(cls.input?.required ?? {})) if (!(req in node.inputs)) problems.push(`${wf.name}: ${node.class_type} (${id}) does not provide required input "${req}"`);
      // literal values must satisfy the input's range or option list (ACE-Step refused bpm 0 and keyscale "")
      const specs = inputsOf(cls);
      for (const [name, value] of Object.entries(node.inputs)) {
        const spec = specs[name];
        if (!spec || (Array.isArray(value) && value.length === 2 && typeof value[1] === 'number')) continue; // a link
        const opts = options(spec);
        // file pickers (models, uploaded images/audio) are checked by the model list below, not by the template
        // (LoadVideo's input is `file`: the continuation tail is uploaded per take, so "tail.mov" is a placeholder)
        const filePicker = /_name\d*$|^(image|audio|video|file)$/.test(name);
        if (opts.length && !filePicker && !opts.includes(value)) { problems.push(`${wf.name}: ${node.class_type}.${name} = ${JSON.stringify(value)} is not one of ${opts.slice(0, 8).join(', ')}${opts.length > 8 ? ', …' : ''}`); continue; }
        const cfg = Array.isArray(spec) && spec[1] && typeof spec[1] === 'object' ? spec[1] : {};
        if (typeof value === 'number') {
          if (typeof cfg.min === 'number' && value < cfg.min) problems.push(`${wf.name}: ${node.class_type}.${name} = ${value} is below the minimum ${cfg.min}`);
          if (typeof cfg.max === 'number' && value > cfg.max) problems.push(`${wf.name}: ${node.class_type}.${name} = ${value} is above the maximum ${cfg.max}`);
        }
      }
    }
  }
} catch (e) { console.log(`(workflow templates not checked: ${e.message})`); }

// model files the templates name, as ComfyUI sees them
const want = {
  diffusion_models: ['minimax_h3_fl2va_pruned_int8_convrot.safetensors', 'minimax_h3_ref2va_pruned_int8_convrot.safetensors', 'qwen_image_edit_2511_fp8mixed.safetensors', 'qwen_image_2512_fp8_e4m3fn.safetensors', 'acestep_v1.5_xl_turbo_bf16.safetensors', 'minimax_music3_dit_int8_convrot.safetensors'],
  text_encoders: ['qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', 'qwen_2.5_vl_7b_fp8_scaled.safetensors', 'qwen_0.6b_ace15.safetensors', 'qwen_1.7b_ace15.safetensors', 'minimax_music3_text_encoder_pruned_int8_convrot.safetensors', 'qwen3.5_4b_bf16.safetensors'],
  vae: ['minimax_h3_video_vae_int8_convrot.safetensors', 'minimax_h3_audio_vae_fp32.safetensors', 'qwen_image_vae.safetensors', 'ace_1.5_vae.safetensors', 'minimax_music3_dav.safetensors'],
  loras: ['minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors', 'minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors', 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors', 'Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors', 'qwen-image-edit-2511-multiple-angles-lora.safetensors'],
  detection: ['mediapipe_face_fp32.safetensors'],
};
const missingModels = [];
for (const [folder, files] of Object.entries(want)) {
  const r = await fetch(`${base}/models/${folder}`);
  const have = r.ok ? await r.json() : [];
  for (const f of files) if (!have.includes(f)) missingModels.push(`${folder}/${f}`);
}

console.log(`ComfyUI ${base}: ${Object.keys(info).length} node classes`);
if (problems.length) { console.log('NODE PROBLEMS:'); for (const p of problems) console.log('  - ' + p); } else console.log('nodes: every class and input the workflows use is present');
if (missingModels.length) { console.log('MODELS NOT YET PRESENT (download pending or path wrong):'); for (const m of missingModels) console.log('  - ' + m); } else console.log('models: every pinned file is visible');
process.exit(problems.length ? 1 : 0);
