/** FLUX vs QWEN — GPU A/B for the canonical character image (docs/research/FLUX-VS-QWEN.md). Straight through
 *  ComfyUI, not through the worker; the shipping pipeline is not touched. Same six characters, same seeds, same
 *  prompts and the same three reference uploads as tools/canonical-image-gpu.ts (docs/evidence/image-v2/REPORT.md).
 *
 *  Arms (all at the canonical 928×1664 frame):
 *    QWEN  shipping: Qwen-Image-2512, 30 steps, cfg 4 + negative          (text)
 *          shipping: Qwen-Image-Edit-2511, 24 steps, cfg 4 + negative    (reference; image1 upload, image2 face crop)
 *    K4D   FLUX.2 [klein] 4B distilled, 4 steps, cfg 1 (no negative)     (text; reference via ReferenceLatent)
 *    K4B   FLUX.2 [klein] 4B Base, 50 steps, cfg 4 + the same negative  (text; reference via ReferenceLatent)
 *    -T    the same klein graph with a FLUX-style prompt (fluxTextPrompt / fluxReferencePrompt: no negations, no generic
 *          "glasses, facial hair" list); -S (text) the shipping prompt with "his/her own left/right" written in picture
 *          space (toPictureSides), for QWEN and K4D
 *  Reference variants: `face` = upload + face crop (shipping attempt 0), `noface` = upload only (shipping retry).
 *  The reference identity lines are the Qwen3.5-4B descriptions recorded in docs/evidence/image-v2/canonical/report.json
 *  (frozen, so every arm reads the same words). Phase `extra-prep` draws three more bust / waist-up stand-in uploads and
 *  reads them like the worker does; phase `extra` redraws them (records `reference-extra`).
 *
 *  Measured per picture: wall and engine time (cold = first picture after /free), card VRAM by nvidia-smi sampled
 *  every 200 ms (baseline before the arm and peak during the picture), framing by src/server/media/figure-check.ts,
 *  and whether another client's prompt ran inside the picture's window (`interleaved`).
 *
 *    pnpm exec tsx tools/flux-vs-qwen-gpu.ts --arms QWEN,K4D,K4B --phases text,reference
 *    pnpm exec tsx tools/flux-vs-qwen-gpu.ts --arms K4D-T,QWEN --phases extra-prep,extra
 *    pnpm exec tsx tools/flux-vs-qwen-gpu.ts --validate        (FLUX graphs against /object_info, nothing queued)
 *    pnpm exec tsx tools/flux-vs-qwen-gpu.ts --sheets --arms QWEN,QWEN-S,K4D,K4D-S,K4D-T,K4B,K4B-T
 *    pnpm exec tsx tools/flux-vs-qwen-gpu.ts --summary         (report + identity.json + visual-scores.json → summary.json)
 *  Identity metrics: tools/flux-vs-qwen-identity.py (CPU, throwaway container; command in its header).
 *
 *  Before a run it unloads the voice/ASR/voice-design services (POST /unload on :8020/:8021/:8030/:8022) and waits
 *  until no studio job is active and ComfyUI's queue is empty. */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import type { Style } from '@/domain/vocabulary';
import * as comfy from '@/server/providers/comfy';
import { grayPixels } from '@/server/media/image-check';
import { fullBodyInFrame } from '@/server/media/figure-check';
import { ffprobe } from '@/server/media';
import { styleDirection } from '@/server/story/style';
import {
  CANONICAL_FRAME, CANONICAL_OUTPUT, FACE_CHECK_OUTPUTS, REFERENCE_DESCRIBE_KEY, canonicalIdentityLine, canonicalPrompt, faceCropRect,
  identityLineFromDescription, negativeFor, parseCharacterDescription, parseFaceBoxes, qwenCanonicalImage, qwenReferenceCanonical,
  referenceCanonicalPrompt, referenceReadGraph, seed32, vlmOutput, type Graph, type IdentitySource, type PxRect,
} from '@/server/workflows';

const execFileP = promisify(execFile);
process.env.DATABASE_URL ??= 'postgres://unused@127.0.0.1:5432/unused';
process.env.COMFYUI_URL ??= 'http://127.0.0.1:8188';

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const has = (name: string) => process.argv.includes(`--${name}`);
const ARMS = (arg('arms') ?? 'QWEN,K4D,K4B').split(/[,\s]+/).filter(Boolean);
const PHASES = new Set((arg('phases') ?? 'text,reference').split(/[,\s]+/).filter(Boolean));
const ONLY = arg('only')?.split(',');
const EVIDENCE = path.resolve('docs/evidence/flux-vs-qwen');
/** PNG originals live in the main checkout's var/ (gitignored) so they outlive this worktree */
const PNG = process.env.FVQ_PNG ?? 'D:/volexar-studio/volexar-studio/var/flux-vs-qwen';
/** the three generated stand-in uploads of tools/canonical-image-gpu.ts (not real people), copied beside the PNGs */
const FIXTURES = process.env.FVQ_FIXTURES ?? `${PNG}/fixtures`;
const V2_REPORT = path.resolve('docs/evidence/image-v2/canonical/report.json');

// ------------------------------------------------------------------------------------------------ the test set
// identical to tools/canonical-image-gpu.ts (CAST, UPLOADS, seeds)
type Person = IdentitySource & { key: string; seed: number };
const CAST: Record<Style, Person[]> = {
  CARTOON: [
    { key: 'c1-kite-maker', seed: 910001, sex: 'MALE', ageYears: 70, build: 'slim, slightly stooped', hair: 'short grey', eyes: 'dark brown', skin: 'warm tan', wardrobe: 'a patchwork jacket of brown, teal, ochre and brick-red squares over a beige T-shirt, olive trousers, tan leather sandals', distinguishing: ['full white beard', 'round wire glasses', 'a large brass wristwatch on his own left wrist', 'a bright red patch on his own right elbow only'] },
    { key: 'c2-girl', seed: 920002, sex: 'FEMALE', ageYears: 10, build: 'small', hair: 'black, in two long braids', eyes: 'amber', skin: 'light brown', wardrobe: 'an olive T-shirt, blue denim overalls, white sneakers with red laces', distinguishing: ['freckles', 'a red string bracelet on her own right wrist', 'the overalls torn open at her own left knee'] },
  ],
  ANIME: [
    { key: 'a1-student', seed: 930003, sex: 'FEMALE', ageYears: 17, build: 'slender', hair: 'shoulder-length teal bob', eyes: 'violet', skin: 'fair', wardrobe: 'a navy sailor school uniform with a red neckerchief and a pleated navy skirt, black knee socks, brown loafers', distinguishing: ['a white hair clip on her own left side of the head', 'a black school bag on a strap over her own right shoulder'] },
    { key: 'a2-courier', seed: 940004, sex: 'MALE', ageYears: 30, build: 'athletic', hair: 'spiky black', eyes: 'dark grey', skin: 'tan', wardrobe: 'an orange bomber jacket over a black T-shirt, grey cargo trousers, yellow sneakers', distinguishing: ['a scar through his own right eyebrow', 'a white star patch on the left sleeve of the jacket only'] },
  ],
  REALISTIC: [
    { key: 'r1-pharmacist', seed: 950005, sex: 'FEMALE', ageYears: 45, build: 'medium', hair: 'greying black, tied in a low bun', eyes: 'brown', skin: 'light olive', wardrobe: 'a white lab coat over a burgundy blouse, black trousers, black flats', distinguishing: ['rectangular black glasses', 'a silver wristwatch on her own left wrist', 'a blue ID badge clipped to the lab coat over her own right chest'] },
    { key: 'r2-mechanic', seed: 960006, sex: 'MALE', ageYears: 28, build: 'stocky', hair: 'short curly dark-brown', eyes: 'hazel', skin: 'medium brown', wardrobe: 'faded blue coveralls, black work boots', distinguishing: ['trimmed stubble beard', 'a silver stud in his own left ear', 'a white name patch on the coveralls over his own left chest', 'a red rag hanging from his own right hip pocket'] },
  ],
};
const UPLOADS: Array<{ key: string; file: string; style: Style }> = [
  { key: 'ir1-headshot-to-cartoon', file: 'upload-photo-headshot.png', style: 'CARTOON' },
  { key: 'ir2-photo-to-realistic', file: 'upload-photo-fullbody.png', style: 'REALISTIC' },
  { key: 'ir3-anime-to-anime', file: 'upload-anime.png', style: 'ANIME' },
];
const REF_SEEDS = [970007, 970008];

// ------------------------------------------------------------------------------------------------ FLUX.2 klein
export const KLEIN = {
  distilled: 'flux-2-klein-4b.safetensors',
  base: 'flux-2-klein-base-4b.safetensors',
  te: 'qwen_3_4b.safetensors',
  vae: 'flux2-vae.safetensors',
} as const;
type Link = [string, number];

/** FLUX.2 [klein] 4B in core ComfyUI 0.38.1, as the Comfy-Org templates wire it (image_flux2_klein_text_to_image,
 *  image_flux2_klein_image_edit_4b_*): Qwen3-4B (`CLIPLoader type flux2`) → CLIPTextEncode; each reference picture →
 *  VAEEncode → ReferenceLatent on the conditioning (also on the negative when cfg > 1); Flux2Scheduler sigmas,
 *  EmptyFlux2LatentImage, euler, CFGGuider, SamplerCustomAdvanced. Distilled: cfg 1 and a zeroed negative. */
export function kleinGraph(i: { unet: string; prompt: string; negative?: string; seed: number; steps: number; cfg: number; refs?: Array<{ image: string; crop?: PxRect }>; width?: number; height?: number; filenamePrefix?: string }): Graph {
  const W = i.width ?? CANONICAL_FRAME.width, H = i.height ?? CANONICAL_FRAME.height;
  const g: Graph = {
    unet: { class_type: 'UNETLoader', inputs: { unet_name: i.unet, weight_dtype: 'default' }, _meta: { title: 'FLUX.2 klein 4B' } },
    clip: { class_type: 'CLIPLoader', inputs: { clip_name: KLEIN.te, type: 'flux2', device: 'default' } },
    vae: { class_type: 'VAELoader', inputs: { vae_name: KLEIN.vae } },
    pos: { class_type: 'CLIPTextEncode', inputs: { clip: ['clip', 0], text: i.prompt } },
  };
  const guided = i.cfg > 1;
  g.neg = guided ? { class_type: 'CLIPTextEncode', inputs: { clip: ['clip', 0], text: i.negative ?? '' } } : { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['pos', 0] } };
  let pos: Link = ['pos', 0], neg: Link = ['neg', 0];
  (i.refs ?? []).forEach((r, k) => {
    g[`ref${k}`] = { class_type: 'LoadImage', inputs: { image: r.image } };
    if (r.crop) {
      const c = r.crop;
      g[`ref${k}c`] = { class_type: 'ImageCrop', inputs: { image: [`ref${k}`, 0], width: Math.max(16, Math.round(c.width)), height: Math.max(16, Math.round(c.height)), x: Math.max(0, Math.round(c.x)), y: Math.max(0, Math.round(c.y)) } };
      g[`ref${k}s`] = { class_type: 'ImageScale', inputs: { image: [`ref${k}c`, 0], upscale_method: 'lanczos', width: 1024, height: 1024, crop: 'center' } };
    } else g[`ref${k}s`] = { class_type: 'ImageScaleToTotalPixels', inputs: { image: [`ref${k}`, 0], upscale_method: 'lanczos', megapixels: 1.0, resolution_steps: 16 } };
    g[`ref${k}e`] = { class_type: 'VAEEncode', inputs: { pixels: [`ref${k}s`, 0], vae: ['vae', 0] } };
    g[`ref${k}p`] = { class_type: 'ReferenceLatent', inputs: { conditioning: pos, latent: [`ref${k}e`, 0] } };
    pos = [`ref${k}p`, 0];
    if (guided) { g[`ref${k}n`] = { class_type: 'ReferenceLatent', inputs: { conditioning: neg, latent: [`ref${k}e`, 0] } }; neg = [`ref${k}n`, 0]; }
  });
  g.sigmas = { class_type: 'Flux2Scheduler', inputs: { steps: i.steps, width: W, height: H } };
  g.latent = { class_type: 'EmptyFlux2LatentImage', inputs: { width: W, height: H, batch_size: 1 } };
  g.noise = { class_type: 'RandomNoise', inputs: { noise_seed: seed32(i.seed) } };
  g.sampler = { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } };
  g.guider = { class_type: 'CFGGuider', inputs: { model: ['unet', 0], positive: pos, negative: neg, cfg: i.cfg } };
  g.sample = { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['noise', 0], guider: ['guider', 0], sampler: ['sampler', 0], sigmas: ['sigmas', 0], latent_image: ['latent', 0] } };
  g.decode = { class_type: 'VAEDecode', inputs: { samples: ['sample', 0], vae: ['vae', 0] } };
  g[CANONICAL_OUTPUT] = { class_type: 'SaveImage', inputs: { images: ['decode', 0], filename_prefix: i.filenamePrefix ?? 'vewbox/fvq' } };
  return g;
}

/** A FLUX-style rewrite of the same prompt for the `-T` arms (BFL's FLUX.2 guide: no negative prompts, "word order
 *  matters", describe what you want): the same medium, framing, identity line and style direction, without the
 *  negations ("not a photograph", "no props, no text") and without the avoid sentence. */
const FLUX_MEDIUM: Record<Style, { lead: string; noun: string }> = {
  CARTOON: { lead: '3D animated feature-film character design, stylized CG render:', noun: 'a stylized 3D animated feature-film character (CG render)' },
  ANIME: { lead: '2D anime character design, cel-shaded illustration with clean line art and flat colours:', noun: 'a 2D anime character (cel-shaded illustration with clean line art and flat colours)' },
  REALISTIC: { lead: 'Photorealistic full-length studio photograph of a real person, 50 mm lens:', noun: 'a photorealistic full-length studio photograph of a real person' },
};
const FLUX_FRAMING = 'one character, full-body front view facing the camera, the whole figure from the top of the head to the soles of the feet inside the picture with clear margin above the head and below the feet, standing in a relaxed neutral pose, arms relaxed at the sides, neutral expression, plain neutral mid-grey studio background, even soft studio light';
const fluxSentences = (parts: Array<string | undefined>) => parts.map((p) => (p ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).map((p) => (/[.!?:]$/.test(p) ? p : `${p}.`)).join(' ');
export const fluxTextPrompt = (style: Style, identityLine: string, d: { character?: string; visual?: string }) => fluxSentences([`${FLUX_MEDIUM[style].lead} ${FLUX_FRAMING}`, identityLine, d.character, d.visual]);
/** (the shipping sentence lists "facial hair, glasses" generically: klein drew glasses on the clean-shaven-eyed IR2
 *  man in 4/4 K4D redraws, so the rewrite names only what every picture has) */
export const fluxReferencePrompt = (style: Style, identityLine: string, face: boolean, d: { character?: string; visual?: string }) => fluxSentences([`Redraw the person in image 1${face ? ', with the face exactly as in image 2,' : ''} as ${FLUX_MEDIUM[style].noun}: ${FLUX_FRAMING}`, 'Keep the face, age, skin tone, hair and every visible garment and colour exactly as in the picture; complete what the picture does not show from the description', identityLine, d.character, d.visual]);

interface TextIn { style: Style; prompt: string; negative: string; seed: number; prefix: string }
interface RefIn extends TextIn { upload: string; faceRect?: PxRect }
const ARM_DEF: Record<string, { label: string; text: (i: TextIn) => Graph; reference: (i: RefIn) => Graph }> = {
  QWEN: {
    label: 'Qwen-Image-2512 30 steps cfg 4 / Qwen-Image-Edit-2511 24 steps cfg 4 (shipping)',
    text: (i) => qwenCanonicalImage({ prompt: i.prompt, negative: i.negative, seed: i.seed, filenamePrefix: i.prefix }),
    reference: (i) => qwenReferenceCanonical({ upload: i.upload, faceRect: i.faceRect, prompt: i.prompt, negative: i.negative, seed: i.seed, filenamePrefix: i.prefix }),
  },
  K4D: {
    label: 'FLUX.2 [klein] 4B distilled, 4 steps, cfg 1',
    text: (i) => kleinGraph({ unet: KLEIN.distilled, prompt: i.prompt, seed: i.seed, steps: 4, cfg: 1, filenamePrefix: i.prefix }),
    reference: (i) => kleinGraph({ unet: KLEIN.distilled, prompt: i.prompt, seed: i.seed, steps: 4, cfg: 1, refs: [{ image: i.upload }, ...(i.faceRect ? [{ image: i.upload, crop: i.faceRect }] : [])], filenamePrefix: i.prefix }),
  },
  K4B: {
    label: 'FLUX.2 [klein] 4B Base, 50 steps, cfg 4 + negative',
    text: (i) => kleinGraph({ unet: KLEIN.base, prompt: i.prompt, negative: i.negative, seed: i.seed, steps: 50, cfg: 4, filenamePrefix: i.prefix }),
    reference: (i) => kleinGraph({ unet: KLEIN.base, prompt: i.prompt, negative: i.negative, seed: i.seed, steps: 50, cfg: 4, refs: [{ image: i.upload }, ...(i.faceRect ? [{ image: i.upload, crop: i.faceRect }] : [])], filenamePrefix: i.prefix }),
  },
};
// the -T arms: the same graphs with the FLUX-style prompt rewrite (fluxTextPrompt / fluxReferencePrompt)
ARM_DEF['K4D-T'] = { ...ARM_DEF.K4D, label: `${ARM_DEF.K4D.label}, FLUX-style prompt (no negations)` };
ARM_DEF['K4B-T'] = { ...ARM_DEF.K4B, label: `${ARM_DEF.K4B.label}, FLUX-style prompt (no negations)` };
// the -S arms (text only): the shipping prompt with every "his/her own left/right" in the identity line written in
// picture space for the front view ("the picture's right-hand …"), to see whether one-sided details follow
ARM_DEF['K4D-S'] = { ...ARM_DEF.K4D, label: `${ARM_DEF.K4D.label}, shipping prompt with picture-side wording` };
ARM_DEF['QWEN-S'] = { ...ARM_DEF.QWEN, label: `${ARM_DEF.QWEN.label}, shipping prompt with picture-side wording` };
const tuned = (arm: string) => arm.endsWith('-T');
const pictureSides = (arm: string) => arm.endsWith('-S');
/** "on his own left wrist" → "on the picture's right-hand wrist" (a front view mirrors the character's sides) */
export const toPictureSides = (line: string) => line.replace(/\b(?:his|her|their) own (left|right)\b/g, (_, side: string) => `the picture's ${side === 'left' ? 'right' : 'left'}-hand`);

// ------------------------------------------------------------------------------------------------ measurement
interface Rec { phase: string; arm: string; style: Style; key: string; variant?: string; seed: number; file: string; cold: boolean; wallMs: number; engineMs?: number; vramBaseMiB: number; vramPeakMiB: number; framing: { ok: boolean; reasons: string[]; heightPct: number | null; marginsPct?: Record<string, number> | null }; error?: string; prompt: string; startedAt?: string; endedAt?: string; /** prompts of other clients that ComfyUI executed while this picture was being drawn (shared GPU) */ interleaved?: string[] }
const report: { updatedAt: string; comfy?: unknown; gpu?: unknown; arms: Record<string, string>; records: Rec[]; events: Array<{ at: string; msg: string }> } = { updatedAt: '', arms: {}, records: [], events: [] };
const reportFile = path.join(EVIDENCE, 'report.json');
async function save() { report.updatedAt = new Date().toISOString(); await fs.mkdir(EVIDENCE, { recursive: true }); await fs.writeFile(reportFile, JSON.stringify(report, null, 2)); }
const note = (msg: string) => { console.log(msg); report.events.push({ at: new Date().toISOString(), msg }); };

/** Card memory in MiB from nvidia-smi, sampled every 200 ms while `fn` runs. */
async function sampled<T>(fn: () => Promise<T>): Promise<{ value: T; peak: number }> {
  let peak = 0;
  const p = spawn('nvidia-smi', ['--query-gpu=memory.used', '--format=csv,noheader,nounits', '-lms', '200'], { stdio: ['ignore', 'pipe', 'ignore'] });
  p.stdout.on('data', (b: Buffer) => { for (const l of b.toString().split(/\r?\n/)) { const v = Number(l.trim()); if (Number.isFinite(v) && l.trim()) peak = Math.max(peak, v); } });
  try { const value = await fn(); await new Promise((r) => setTimeout(r, 400)); return { value, peak }; } finally { p.kill(); }
}
async function vramNow(): Promise<number> {
  const { stdout } = await execFileP('nvidia-smi', ['--query-gpu=memory.used', '--format=csv,noheader,nounits']);
  return Number(stdout.trim().split(/\r?\n/)[0]);
}

async function activeJobs(): Promise<number> {
  try {
    const { stdout } = await execFileP('docker', ['exec', 'vewbox-db-1', 'psql', '-U', 'vewbox', '-d', 'vewbox', '-At', '-c', "select count(*) from jobs where status in ('PREPARING','GENERATING','DOWNLOADING','VALIDATING','POSTPROCESSING')"]);
    return Number(stdout.trim()) || 0;
  } catch { return -1; }
}
async function comfyQueue(): Promise<number> {
  const r = await fetch(`${process.env.COMFYUI_URL}/queue`).then((x) => x.json() as Promise<{ queue_running: unknown[]; queue_pending: unknown[] }>);
  return r.queue_running.length + r.queue_pending.length;
}
/** Wait until no studio job is active and ComfyUI's queue is empty (the shared worker may draw characters). */
async function waitIdle(checkJobs: boolean) {
  for (let n = 0; ; n++) {
    const [jobs, q] = await Promise.all([checkJobs ? activeJobs() : Promise.resolve(0), comfyQueue()]);
    if (jobs <= 0 && q === 0) return;
    if (n % 6 === 0) note(`waiting: ${jobs} active job(s), ${q} ComfyUI prompt(s)`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
}
async function unloadVoices() {
  const before = await vramNow();
  for (const port of [8020, 8021, 8030, 8022]) {
    const r = await fetch(`http://127.0.0.1:${port}/unload`, { method: 'POST' }).then((x) => `${x.status}`, (e) => `error ${(e as Error).message}`);
    note(`POST :${port}/unload → ${r}`);
  }
  await new Promise((r) => setTimeout(r, 3000));
  note(`card memory before unload ${before} MiB, after ${await vramNow()} MiB`);
}

async function framing(file: string) {
  const r = fullBodyInFrame(await grayPixels(file, 640));
  return { ok: r.ok, reasons: r.reasons, heightPct: r.box ? Math.round(r.box.h * 1000) / 10 : null, marginsPct: r.margins && Object.fromEntries(Object.entries(r.margins).map(([k, v]) => [k, Math.round(v * 1000) / 10])) };
}

let coldNext = true;
let armBase = 0;
async function draw(rec: Omit<Rec, 'file' | 'cold' | 'wallMs' | 'engineMs' | 'vramBaseMiB' | 'vramPeakMiB' | 'framing'>, graph: Graph, dest: string) {
  await waitIdle(false);
  const cold = coldNext; coldNext = false;
  const t0 = Date.now();
  try {
    const { value: run, peak } = await sampled(() => comfy.run(graph, { timeoutMs: 30 * 60_000 }));
    const out = run.outputs[CANONICAL_OUTPUT]?.images?.[0];
    if (!out) throw new Error('no image');
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, await comfy.view(out));
    const t1 = Date.now();
    const r: Rec = { ...rec, file: path.relative(PNG, dest).replace(/\\/g, '/'), cold, wallMs: t1 - t0, engineMs: run.engineMs, vramBaseMiB: armBase, vramPeakMiB: peak, framing: await framing(dest), startedAt: new Date(t0).toISOString(), endedAt: new Date(t1).toISOString() };
    const others = await othersBetween(t0, t1, run.promptId);
    if (others.length) { r.interleaved = others; note(`${rec.arm} ${rec.key} s${rec.seed}: ${others.length} prompt(s) of another client ran inside this picture's window — timing/VRAM of this record are not clean`); }
    upsert(r);
    console.log(`✓ ${r.arm} ${r.key}${r.variant ? ` ${r.variant}` : ''} s${r.seed}: ${(r.wallMs / 1000).toFixed(1)} s (engine ${((r.engineMs ?? 0) / 1000).toFixed(1)} s${cold ? ', cold' : ''}), card peak ${peak} MiB, framing ${r.framing.ok ? 'ok' : r.framing.reasons.join('; ')}`);
  } catch (e) {
    const r: Rec = { ...rec, file: '', cold, wallMs: Date.now() - t0, vramBaseMiB: armBase, vramPeakMiB: 0, framing: { ok: false, reasons: ['generation failed'], heightPct: null }, error: String((e as Error).message ?? e).slice(0, 500) };
    upsert(r);
    console.log(`✗ ${r.arm} ${r.key} s${r.seed}: ${r.error}`);
  }
  await save();
}
/** Prompt ids (not ours) whose execution overlapped [t0, t1] according to ComfyUI's history. */
async function othersBetween(t0: number, t1: number, mine: string): Promise<string[]> {
  try {
    const h = await fetch(`${process.env.COMFYUI_URL}/history?max_items=12`).then((x) => x.json() as Promise<Record<string, { status?: { messages?: Array<[string, { timestamp?: number }]> } }>>);
    return Object.entries(h).filter(([id, v]) => {
      if (id === mine) return false;
      const m = v.status?.messages ?? [];
      const s = m.find((x) => x[0] === 'execution_start')?.[1]?.timestamp, e = m.find((x) => x[0] === 'execution_success' || x[0] === 'execution_error')?.[1]?.timestamp;
      return s !== undefined && e !== undefined && s < t1 && e > t0;
    }).map(([id]) => id);
  } catch { return []; }
}
function upsert(r: Rec) {
  const i = report.records.findIndex((x) => x.phase === r.phase && x.arm === r.arm && x.key === r.key && x.variant === r.variant && x.seed === r.seed);
  if (i >= 0) report.records[i] = r; else report.records.push(r);
}

async function startArm(arm: string) {
  await waitIdle(true);
  await comfy.free();
  await new Promise((r) => setTimeout(r, 3000));
  armBase = await vramNow();
  coldNext = true;
  note(`arm ${arm}: models freed, card at ${armBase} MiB`);
}

// ------------------------------------------------------------------------------------------------ phases
async function textPhase(arm: string) {
  const def = ARM_DEF[arm];
  for (const style of ['CARTOON', 'ANIME', 'REALISTIC'] as Style[]) {
    const d = styleDirection(style);
    for (const p of CAST[style]) {
      if (ONLY && !ONLY.includes(p.key)) continue;
      const line0 = canonicalIdentityLine(p, { style }).line;
      const line = pictureSides(arm) ? toPictureSides(line0) : line0;
      const prompt = tuned(arm) ? fluxTextPrompt(style, line, d) : canonicalPrompt({ style, identityLine: line, character: d.character, visual: d.visual, avoid: d.avoid });
      for (const k of [0, 1]) {
        const seed = p.seed + k;
        const dest = path.join(PNG, 'text', `${p.key}-${arm}-s${k}.png`);
        await draw({ phase: 'text', arm, style, key: p.key, seed, prompt }, def.text({ style, prompt, negative: negativeFor(style), seed, prefix: `vewbox/fvq/${p.key}-${arm}` }), dest);
      }
    }
  }
}

/** EXTRA uploads (phase `extra-prep`): the original set has one bust photo (IR2), the case where Edit-2511 failed the
 *  framing; three more generated stand-ins (not real people), bust or waist-up, cropped like typical phone/profile
 *  photos, so the reference finding does not rest on one picture. Drawn by Qwen-Image-2512 (the stand-in generator of
 *  tools/canonical-image-gpu.ts), then read exactly as the worker reads an upload (MediaPipe boxes + Qwen3.5-4B). */
const EXTRA: Array<{ key: string; style: Style; seed: number; prompt: string }> = [
  { key: 'ix1-bust-photo-to-realistic', style: 'REALISTIC', seed: 980011, prompt: 'Candid head-and-shoulders photograph of a man of about 60 with a grey flat cap, short grey stubble beard, deep smile lines and a brown tweed jacket over a cream knitted jumper, looking at the camera, natural window light, plain pale wall behind him, shallow depth of field, 85 mm lens, realistic skin texture.' },
  { key: 'ix2-waist-photo-to-cartoon', style: 'CARTOON', seed: 980012, prompt: 'Waist-up smartphone photograph of a woman of about 25 with long curly copper-red hair, freckles, small gold hoop earrings and a bottle-green cable-knit sweater, smiling at the camera, standing in front of a plain light grey wall, soft daylight, realistic photo.' },
  { key: 'ix3-bust-photo-to-anime', style: 'ANIME', seed: 980013, prompt: 'Head-and-shoulders photograph of a man of about 40 with a shaved head, a thick short black beard, dark brown eyes and an orange high-visibility work vest with silver reflective stripes over a navy T-shirt, serious expression, looking at the camera, plain grey background, studio light, realistic photo.' },
];
const extraFile = path.join(EVIDENCE, 'extra-uploads.json');
type ExtraRead = { key: string; style: Style; file: string; identityLine: string; faceBoxes: Array<{ x: number; y: number; width: number; height: number; score?: number }>; description?: unknown; vlmText: string; lowConfidence: string[]; notVisible: string[] };

async function extraPrep() {
  const reads: ExtraRead[] = [];
  for (const x of EXTRA) {
    const file = path.join(FIXTURES, `${x.key}.png`);
    await fs.mkdir(FIXTURES, { recursive: true });
    const run = await comfy.run(qwenCanonicalImage({ prompt: x.prompt, negative: 'text, watermark, cartoon, illustration, 3D render, full body, legs, feet', seed: x.seed, filenamePrefix: `vewbox/fvq/${x.key}-upload` }), { timeoutMs: 30 * 60_000 });
    await fs.writeFile(file, await comfy.view(run.outputs[CANONICAL_OUTPUT]!.images![0]));
    const upload = await comfy.uploadInput(file);
    const read = await comfy.run(referenceReadGraph({ image: upload, describe: true }), { timeoutMs: 30 * 60_000 });
    const vlmText = comfy.textOutput(read.outputs, vlmOutput(REFERENCE_DESCRIBE_KEY)) ?? '';
    const faceBoxes = parseFaceBoxes(comfy.textOutput(read.outputs, FACE_CHECK_OUTPUTS.bboxes));
    const dsc = parseCharacterDescription(vlmText);
    const { line, lowConfidence, notVisible } = identityLineFromDescription(dsc, { style: x.style });
    reads.push({ key: x.key, style: x.style, file: path.relative(PNG, file).replace(/\\/g, '/'), identityLine: line, faceBoxes, description: dsc, vlmText, lowConfidence, notVisible });
    note(`extra upload ${x.key}: ${faceBoxes.length} face(s); ${line}`);
    await fs.writeFile(extraFile, JSON.stringify({ note: 'generated stand-in uploads (not real people), read like the worker reads an upload', reads }, null, 2));
  }
}

async function referencePhase(arm: string) {
  const def = ARM_DEF[arm];
  const v2 = JSON.parse(await fs.readFile(V2_REPORT, 'utf8')) as { records: Array<{ phase: string; key: string; notes?: { identityLine?: string; faceBoxes?: Array<{ x: number; y: number; width: number; height: number }> } }> };
  const extra = PHASES.has('extra') ? (JSON.parse(await fs.readFile(extraFile, 'utf8')) as { reads: ExtraRead[] }).reads : [];
  const uploads = PHASES.has('extra') ? extra.map((x) => ({ key: x.key, file: path.basename(x.file), style: x.style })) : UPLOADS;
  for (const u of uploads) {
    if (ONLY && !ONLY.includes(u.key)) continue;
    const ex = extra.find((x) => x.key === u.key);
    const src = ex ? { notes: { identityLine: ex.identityLine, faceBoxes: ex.faceBoxes } } : v2.records.find((r) => r.phase === 'reference' && r.key === u.key);
    if (!src?.notes?.identityLine) throw new Error(`no frozen identity line for ${u.key} in ${V2_REPORT}`);
    const file = path.join(FIXTURES, u.file);
    const upload = await comfy.uploadInput(file);
    const pr = await ffprobe(file);
    const boxes = src.notes.faceBoxes ?? [];
    const faceRect = boxes.length === 1 ? faceCropRect(boxes[0], { width: Number(pr.width), height: Number(pr.height) }) : undefined;
    const d = styleDirection(u.style);
    for (const variant of faceRect ? ['face', 'noface'] : ['noface']) {
      const prompt = tuned(arm) ? fluxReferencePrompt(u.style, src.notes.identityLine, variant === 'face', d) : referenceCanonicalPrompt({ style: u.style, identityLine: src.notes.identityLine, faceImage: variant === 'face', character: d.character, visual: d.visual });
      for (const seed of REF_SEEDS) {
        const dest = path.join(PNG, 'reference', `${u.key}-${arm}-${variant}-s${seed - REF_SEEDS[0]}.png`);
        await draw({ phase: ex ? 'reference-extra' : 'reference', arm, style: u.style, key: u.key, variant, seed, prompt }, def.reference({ style: u.style, prompt, negative: negativeFor(u.style), seed, upload, faceRect: variant === 'face' ? faceRect : undefined, prefix: `vewbox/fvq/${u.key}-${arm}` }), dest);
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------ contact sheets
const FONT = 'C\\:/Windows/Fonts/arialbd.ttf';
async function sheet(cells: Array<{ file: string; label: string }>, out: string, h = 720) {
  const inputs = cells.flatMap((c) => ['-i', c.file]);
  const scaled = cells.map((c, i) => `[${i}:v]scale=-2:${h}:flags=lanczos,pad=ceil(iw/2)*2:${h}:(ow-iw)/2:0:color=0x202020,drawtext=fontfile='${FONT}':text='${c.label.replace(/[':]/g, ' ')}':x=6:y=6:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=5[v${i}]`).join(';');
  const filter = `${scaled};${cells.map((_, i) => `[v${i}]`).join('')}hstack=inputs=${cells.length}[o]`;
  await fs.mkdir(path.dirname(out), { recursive: true });
  await execFileP('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', filter, '-map', '[o]', '-q:v', '3', out], { maxBuffer: 64 * 1024 * 1024 });
}
async function sheets() {
  const recs = (JSON.parse(await fs.readFile(reportFile, 'utf8')) as typeof report).records.filter((r) => r.file);
  const abs = (r: Rec) => path.join(PNG, r.file);
  const order = (a: Rec, b: Rec) => ARMS.indexOf(a.arm) - ARMS.indexOf(b.arm) || a.seed - b.seed;
  for (const style of ['CARTOON', 'ANIME', 'REALISTIC'] as Style[]) for (const p of CAST[style]) {
    const rs = recs.filter((r) => r.phase === 'text' && r.key === p.key).sort(order);
    if (rs.length) await sheet(rs.map((r) => ({ file: abs(r), label: `${r.arm}-s${r.seed - p.seed}${r.framing.ok ? '' : ' FRAMING'}` })), path.join(EVIDENCE, `text-${p.key}.jpg`));
  }
  const extra = await fs.readFile(extraFile, 'utf8').then((t) => (JSON.parse(t) as { reads: ExtraRead[] }).reads.map((x) => ({ key: x.key, file: path.basename(x.file), style: x.style })), () => []);
  for (const u of [...UPLOADS, ...extra]) for (const variant of ['face', 'noface']) {
    const rs = recs.filter((r) => r.phase.startsWith('reference') && r.key === u.key && r.variant === variant).sort(order);
    if (rs.length) await sheet([{ file: path.join(FIXTURES, u.file), label: 'UPLOAD' }, ...rs.map((r) => ({ file: abs(r), label: `${r.arm}-${variant}-s${r.seed - REF_SEEDS[0]}${r.framing.ok ? '' : ' FRAMING'}` }))], path.join(EVIDENCE, `reference-${u.key}-${variant}.jpg`));
  }
  console.log('contact sheets written to', EVIDENCE);
}

// ------------------------------------------------------------------------------------------------ summary
/** One row per picture from the reviewer's careful look (docs/evidence/flux-vs-qwen/visual-scores.json). */
interface Look { arm: string; key: string; variant?: string; seed: number; quality: number; style: 'ok' | 'partial' | 'wrong'; fullBody: boolean; anatomy: 'ok' | 'minor' | 'major'; tokens: [number, number]; sided?: [number, number]; likeness?: number; /** an attribute the character does not have was drawn (e.g. glasses) */ hallucination?: boolean; notes?: string }
async function summary() {
  const recs = (JSON.parse(await fs.readFile(reportFile, 'utf8')) as typeof report).records;
  const looks = JSON.parse(await fs.readFile(path.join(EVIDENCE, 'visual-scores.json'), 'utf8')) as { rows: Look[] };
  const ident = await fs.readFile(path.join(EVIDENCE, 'identity.json'), 'utf8').then((t) => JSON.parse(t) as { rows: Array<{ arm: string; key: string; variant?: string; seed: number; sfaceCos?: number; dinoFaceCos?: number; ccipDiff?: number }> }, () => ({ rows: [] }));
  const same = (a: { arm: string; key: string; variant?: string; seed: number }, b: { arm: string; key: string; variant?: string; seed: number }) => a.arm === b.arm && a.key === b.key && (a.variant ?? '') === (b.variant ?? '') && a.seed === b.seed;
  const med = (xs: number[]) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };
  const mean = (xs: number[]) => { const s = xs.filter(Number.isFinite); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : NaN; };
  const out: Record<string, unknown> = {};
  for (const phase of ['text', 'reference', 'reference-extra']) for (const arm of [...new Set(recs.filter((r) => r.phase === phase).map((r) => r.arm))]) {
    const rs = recs.filter((r) => r.phase === phase && r.arm === arm);
    const ls = rs.map((r) => looks.rows.find((l) => same(l, r)));
    const warm = rs.filter((r) => !r.cold && !r.error && !r.interleaved?.length);
    // a failure = no usable canonical image: generation error, framing check failed, not a whole figure by eye, wrong
    // medium, major anatomy error, or an invented attribute
    const failures = rs.filter((r, i) => r.error || !r.framing.ok || ls[i]?.style === 'wrong' || ls[i]?.anatomy === 'major' || ls[i]?.fullBody === false || ls[i]?.hallucination);
    const byStyle = Object.fromEntries((['CARTOON', 'ANIME', 'REALISTIC'] as Style[]).map((s) => { const idx = rs.map((r, i) => (r.style === s ? i : -1)).filter((i) => i >= 0); return [s, { styleOk: `${idx.filter((i) => ls[i]?.style === 'ok').length}/${idx.length}`, quality: Number(mean(idx.map((i) => ls[i]?.quality ?? NaN)).toFixed(2)) }]; }));
    const sum = (f: (l: Look) => [number, number] | undefined): [number, number] => { const a: [number, number] = [0, 0]; for (const l of ls) { const v = l && f(l); if (v) { a[0] += v[0]; a[1] += v[1]; } } return a; };
    const id = ident.rows.filter((x) => x.arm === arm && rs.some((r) => r.key === x.key));
    const styleOf = (key: string) => rs.find((r) => r.key === key)?.style;
    out[`${phase}:${arm}`] = {
      label: report.arms[arm] ?? arm, pictures: rs.length, errors: rs.filter((r) => r.error).length,
      framingPass: `${rs.filter((r) => r.framing.ok).length}/${rs.length}`, fullBodyByEye: `${ls.filter((l) => l?.fullBody).length}/${rs.length}`,
      styleOk: `${ls.filter((l) => l?.style === 'ok').length}/${rs.length}`, byStyle, qualityMean: Number(mean(ls.map((l) => l?.quality ?? NaN)).toFixed(2)),
      anatomy: { ok: ls.filter((l) => l?.anatomy === 'ok').length, minor: ls.filter((l) => l?.anatomy === 'minor').length, major: ls.filter((l) => l?.anatomy === 'major').length },
      tokens: sum((l) => l.tokens), hallucinated: ls.filter((l) => l?.hallucination).length, unscored: ls.filter((l) => !l).length,
      failureRate: `${failures.length}/${rs.length}`,
      ...(phase === 'text'
        ? { sided: sum((l) => l.sided), engineSecWarmMedian: Number((med(warm.map((r) => r.engineMs ?? NaN)) / 1000).toFixed(1)) }
        : { likenessMean: Number(mean(ls.map((l) => l?.likeness ?? NaN)).toFixed(2)), engineSecWarmMedian: { uploadAndFace: Number((med(warm.filter((r) => r.variant === 'face').map((r) => r.engineMs ?? NaN)) / 1000).toFixed(1)), uploadOnly: Number((med(warm.filter((r) => r.variant === 'noface').map((r) => r.engineMs ?? NaN)) / 1000).toFixed(1)) } }),
      engineSecCold: Number(((rs.find((r) => r.cold)?.engineMs ?? NaN) / 1000).toFixed(1)),
      vramPeakMiBMax: Math.max(...rs.map((r) => r.vramPeakMiB || 0)), vramBaseMiB: med(rs.map((r) => r.vramBaseMiB)),
      ...(phase !== 'text' && id.length ? {
        sfaceCos: {
          realisticTargetMean: Number(mean(id.filter((x) => styleOf(x.key) === 'REALISTIC').map((x) => x.sfaceCos ?? NaN)).toFixed(3)),
          realisticTargetWholeFigureOnly: id.filter((x) => styleOf(x.key) === 'REALISTIC' && recs.find((r) => r.phase === phase && same(r, x))?.framing.ok).map((x) => x.sfaceCos),
          cartoonTargetMean: Number(mean(id.filter((x) => styleOf(x.key) === 'CARTOON').map((x) => x.sfaceCos ?? NaN)).toFixed(3)),
          animeTargetMean: Number(mean(id.filter((x) => styleOf(x.key) === 'ANIME').map((x) => x.sfaceCos ?? NaN)).toFixed(3)),
        },
        dinoFaceCosMean: Number(mean(id.map((x) => x.dinoFaceCos ?? NaN)).toFixed(3)),
        ...(phase === 'reference' ? { ccipDiffIr3Mean: Number(mean(id.filter((x) => x.key.startsWith('ir3')).map((x) => x.ccipDiff ?? NaN)).toFixed(3)) } : {}),
      } : {}),
    };
  }
  await fs.writeFile(path.join(EVIDENCE, 'summary.json'), JSON.stringify({ generatedAt: new Date().toISOString(), arms: out }, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

async function main() {
  const prev = await fs.readFile(reportFile, 'utf8').then((t) => JSON.parse(t) as typeof report, () => undefined);
  if (prev) Object.assign(report, prev);
  if (has('sheets')) return sheets();
  if (has('summary')) return summary();
  if (has('validate')) {
    // submit each FLUX graph shape for validation only: ComfyUI checks every node and input before queueing; the
    // only acceptable complaints are model files that are not downloaded yet
    const upload = await comfy.uploadInput(path.join(FIXTURES, UPLOADS[0].file));
    const graphs = { t2i_distilled: ARM_DEF.K4D.text({ style: 'CARTOON', prompt: 'x', negative: 'y', seed: 1, prefix: 'vewbox/fvq/validate' }), t2i_base: ARM_DEF.K4B.text({ style: 'CARTOON', prompt: 'x', negative: 'y', seed: 1, prefix: 'vewbox/fvq/validate' }), ref_base_face: ARM_DEF.K4B.reference({ style: 'CARTOON', prompt: 'x', negative: 'y', seed: 1, upload, faceRect: { x: 10, y: 10, width: 300, height: 300 }, prefix: 'vewbox/fvq/validate' }) };
    for (const [name, g] of Object.entries(graphs)) {
      const res = await fetch(`${process.env.COMFYUI_URL}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: g, validate_only: true }) });
      const body = await res.text();
      let errs: string[] = [];
      try { errs = Object.entries((JSON.parse(body) as { node_errors?: Record<string, { errors: Array<{ details: string }> }> }).node_errors ?? {}).flatMap(([n, e]) => e.errors.map((x) => `${n}: ${x.details.slice(0, 90)}`)); } catch { /* not JSON */ }
      console.log(name, res.status, errs.length ? errs.join(' | ') : body.slice(0, 300));
      if (res.ok) { const id = (JSON.parse(body) as { prompt_id?: string }).prompt_id; if (id) await comfy.cancelPrompt(id).catch(() => false); }
    }
    return;
  }
  const h = await comfy.health();
  if (!h.ok) throw new Error('ComfyUI is not reachable');
  report.comfy = h;
  report.gpu = (await execFileP('nvidia-smi', ['--query-gpu=name,driver_version,memory.total', '--format=csv,noheader'])).stdout.trim();
  for (const a of ARMS) { if (!ARM_DEF[a]) throw new Error(`unknown arm ${a}`); report.arms[a] = ARM_DEF[a].label; }
  await waitIdle(true);
  await unloadVoices();
  if (PHASES.has('extra-prep')) await extraPrep();
  for (const arm of ARMS) {
    if (PHASES.has('text')) { await startArm(arm); await textPhase(arm); }
    if (PHASES.has('reference') || PHASES.has('extra')) { await startArm(arm); await referencePhase(arm); }
  }
  await save();
}

main().catch(async (e) => { console.error('FAILED', e); note(`FAILED: ${(e as Error).message}`); await save(); process.exit(1); });
