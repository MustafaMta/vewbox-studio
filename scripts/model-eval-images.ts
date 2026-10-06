/* IMAGE MODEL EVALUATION (docs/research/MODEL-STACK-2026-10.md §5.1–5.5, run as docs/research/MODEL-EVAL-2026-10.md §2):
 * the fixed prompt set drawn straight through ComfyUI with the studio's OWN builders (canonical image, plates, views,
 * edits, the Image Reference read + redraw) on every candidate that is on the models volume, same seeds, same prompts.
 *
 *   pnpm exec tsx --env-file=../../.env --env-file=../../.env.local scripts/model-eval-images.ts \
 *       [--phases t2i,plate,views,poster,edit,reference,stress] [--arms 2512q,2512d,klein,qi21,edit-q,edit-d,qi21e,edit-ref,qi21-ref] \
 *       [--seeds 970007,970008] [--only <item id prefix>]
 *
 * Preconditions: ComfyUI answers and its queue is empty; the speech services are unloaded; job intake is paused and no
 * worker runs (this script never touches the studio). Per item: engine time (ComfyUI's own), wall time, the card's
 * peak memory (nvidia-smi sampled every 250 ms), the studio's framing check on canonical-frame pictures, the graph and
 * the prompt. Originals: var/model-eval/images/<phase>/ (gitignored); evidence: docs/evidence/model-eval-2026-10/images/
 * (results.json, 768 px proxies, contact sheets). The pictures are judged by eye afterwards; nothing here scores
 * quality, and a failed attempt is recorded, never regenerated.
 *
 * Model upgrade, 2026-10-06 (MODEL-EVAL-2026-10.md §7): `--tag upgrade` writes to var/model-eval/images-upgrade and
 * docs/evidence/model-eval-2026-10/images-upgrade so the first run's results stay as they were. New arms: `2512bf`
 * (Qwen-Image-2512 bf16, quality settings, partially loaded), `joy-e` (JoyAI-Image-Edit for views, placement,
 * identity-preserving edits and multi-character frames), `joy-ref` (JoyAI Image Reference). New phases: `idedit` (the
 * canonical image redrawn in a new pose and expression) and `multi` (two canonical characters placed in one plate).
 * Every picture with a known identity gets the asr service's SFace cosine (POST /qa/identity, a 1-s still clip), and
 * the comfyui container's RAM is sampled with docker stats beside the card's VRAM. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import * as comfy from '@/server/providers/comfy';
import { installHoldGuard, track, settled, cancelOurs, assertIdle } from './lib/comfy-hold-guard';
import { MODELS, JOYAI_FILES, joyaiEdit, seed32, snap, qwenCanonicalImage, qwenEdit, qwenTextToImage, kleinReferenceCanonical, qwenReferenceCanonical, referenceReadGraph, canonicalPrompt, kleinReferencePrompt, referenceCanonicalPrompt, canonicalIdentityLine, identityLineFromDescription, negativeFor, parseCharacterDescription, parseFaceBoxes, faceCropRect, CANONICAL_FRAME, CANONICAL_OUTPUT, STYLE_MEDIUM, REFERENCE_DESCRIBE_KEY, REFERENCE_FACE_OUTPUTS, vlmOutput, type Graph, type PxRect, type CharacterDescription } from '@/server/workflows';
import { locationPrompt } from '@/server/story/prompts';
import { styleDirection } from '@/server/story/style';
import { fullBodyInFrame, type FramingCheck } from '@/server/media/figure-check';
import { grayPixels } from '@/server/media/image-check';
import type { Location } from '@/domain/types';
import type { Style } from '@/domain/vocabulary';

const run = promisify(execFile);
const ROOT = process.cwd();
const argv = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const TAG = opt('tag', '');
const OUT = path.join(ROOT, `var/model-eval/images${TAG ? `-${TAG}` : ''}`);
const EVID = path.join(ROOT, `docs/evidence/model-eval-2026-10/images${TAG ? `-${TAG}` : ''}`);
const ASR_URL = process.env.ASR_URL ?? 'http://127.0.0.1:8030';
const COMFY_CONTAINER = process.env.COMFY_CONTAINER ?? 'vewbox-comfyui-1';
const PHASES = opt('phases', 't2i,plate,views,poster,edit,reference,stress').split(',');
const ARMS = new Set(opt('arms', '2512q,2512d,klein,qi21,edit-q,edit-d,qi21e,edit-ref,qi21-ref').split(','));
const SEEDS = opt('seeds', '970007,970008').split(',').map(Number);
const ONLY = opt('only', '');
/** the A/B's uploads live in two folders (the first A/B's and the confirmation's); a file is looked up in both */
const UPLOAD_DIRS = (process.env.EVAL_UPLOADS ?? 'D:/volexar-studio/volexar-studio/var/flux-vs-qwen/confirmation/fixtures;D:/volexar-studio/volexar-studio/var/flux-vs-qwen/fixtures').split(';');
const uploadPath = async (file: string) => { for (const d of UPLOAD_DIRS) { const p = path.join(d, file); if (await fs.access(p).then(() => true, () => false)) return p; } throw new Error(`upload ${file} not found in ${UPLOAD_DIRS.join(', ')}`); };

// ------------------------------------------------------------------------------------------ the evaluation set
/** The evaluation-only Qwen-Image-2.1 files (manifest group eval-qwen-image-2.1; Qwen Research Licence). */
const QI21 = { dit: 'qwen_image_2.1_int8_convrot.safetensors', te: 'qwen3vl_8b_int8_convrot.safetensors', vae: 'qwen_image_2.1_vae_bf16.safetensors' } as const;

/** §5.1 C1–C3 as character sheets, so the shipping identity line is written by `canonicalIdentityLine`. */
const CHARACTERS: Array<{ id: string; style: Style; sheet: Parameters<typeof canonicalIdentityLine>[0] }> = [
  { id: 'C1-kite-maker', style: 'CARTOON', sheet: { sex: 'MALE', ageYears: 70, build: 'thin', face: 'kind deep-set eyes, white stubble', hair: 'short white', eyes: 'dark brown', skin: 'weathered olive', wardrobe: 'a patchwork waistcoat of large coloured squares over a grey dishdasha; brown leather sandals', distinguishing: ['red kite string wound on his right wrist'] } },
  { id: 'C2-courier-girl', style: 'ANIME', sheet: { sex: 'FEMALE', ageYears: 17, build: 'slim', face: 'small pointed chin', hair: 'short black bob', eyes: 'amber', skin: 'fair', wardrobe: 'a yellow rain jacket, navy shorts over black leggings, red sneakers', distinguishing: ['messenger bag strap across her left shoulder'] } },
  { id: 'C3-pharmacist', style: 'REALISTIC', sheet: { sex: 'FEMALE', ageYears: 34, build: 'petite', face: 'oval face', hair: 'greying hair in a low bun', eyes: 'dark brown', skin: 'olive', wardrobe: 'a white coat over a burgundy blouse, black trousers, black flat shoes', distinguishing: ['thin gold glasses', 'a name badge on the left chest', 'a steel watch on the left wrist'] } },
];
/** A second realistic character, drawn once (2512 quality, first seed) as an INPUT of the multi-character frames. */
const C4 = { id: 'C4-bookseller', style: 'REALISTIC' as Style, sheet: { sex: 'MALE', ageYears: 62, build: 'stocky', face: 'round face, a thick grey moustache', hair: 'short grey hair', eyes: 'brown', skin: 'olive', wardrobe: 'a brown wool vest over a white long-sleeved shirt, dark grey trousers, black leather shoes', distinguishing: ['a red pencil tucked behind his right ear'] } as Parameters<typeof canonicalIdentityLine>[0] };
const identityOf = (c: { style: Style; sheet: Parameters<typeof canonicalIdentityLine>[0] }) => canonicalIdentityLine(c.sheet, { style: c.style }).line;

/** §5.3 L1, one plate per direction (the E1 edit places each character in its own direction's plate). */
const location = (style: Style): Location => ({ id: `eval-mutanabbi-${style.toLowerCase()}`, name: 'Al-Mutanabbi Street book market', kind: 'EXTERIOR', style, description: 'Al-Mutanabbi Street book market in Baghdad: a long pedestrian street of book stalls under the arcades of old brick buildings, stacks of books on wooden tables, early morning, empty of people', landmarks: ['arcades of old brick buildings with wooden balconies', 'book stalls with stacked books', 'a café entrance on the corner'], props: ['stacks of books', 'wooden stall tables', 'hanging signboards'], lighting: ['MORNING'], refs: [], createdAt: '2026-10-05T00:00:00.000Z', updatedAt: '2026-10-05T00:00:00.000Z' } as unknown as Location);
/** the plate handler's negative (src/worker/handlers/images.ts NEG + ', people, person') */
const PLATE_NEG = 'text, watermark, logo, signature, blurry, deformed hands, extra fingers, extra limbs, duplicate person, cropped head, people, person';
const VIEWS = [{ id: 'reverse', note: 'reverse angle from the far end of the street' }, { id: 'stall', note: 'close view of one book stall' }, { id: 'dusk', note: 'the same street at dusk with the lamps lit' }];
const POSES = [{ id: 'tea', pose: 'standing, holding a small glass of tea in both hands in front of the chest' }, { id: 'crossed', pose: 'standing with the arms crossed over the chest' }, { id: 'running', pose: 'running mid-stride toward the camera' }];
const REFERENCE_UPLOADS = [{ id: 'ir2-bust', file: 'upload-photo-headshot.png', style: 'REALISTIC' as Style }, { id: 'ix1-bust', file: 'ix1-bust-photo-to-realistic.png', style: 'REALISTIC' as Style }, { id: 'ic3-teen', file: 'ic3.png', style: 'ANIME' as Style }, { id: 'ic4-cg-girl', file: 'ic4.png', style: 'CARTOON' as Style }, { id: 'ix2-waist', file: 'ix2-waist-photo-to-cartoon.png', style: 'CARTOON' as Style }];

// ----------------------------------------------------------------------------------- graphs the studio does not have
/** Qwen-Image-2512 text-to-image at any size: the canonical graph's shape (quality: no LoRA, 30 steps, cfg 4). */
function qwen2512T2I(i: { prompt: string; negative: string; width: number; height: number; seed: number; quality: boolean }): Graph {
  const g = qwenCanonicalImage({ prompt: i.prompt, negative: i.negative, seed: i.seed, quality: i.quality });
  g['8'] = { class_type: 'EmptySD3LatentImage', inputs: { width: snap(i.width, 16), height: snap(i.height, 16), batch_size: 1 } };
  return g;
}
/** Qwen-Image-2512 bf16 (candidate, 40.86 GB): the shipping graph with the full-precision DiT. */
const QWEN_BF16 = 'qwen_image_2512_bf16.safetensors';
function bf16(g: Graph): Graph { g['1'] = { ...g['1'], inputs: { ...g['1'].inputs, unet_name: QWEN_BF16 }, _meta: { title: 'Qwen-Image-2512 bf16 (candidate)' } }; return g; }
/** FLUX.2 [klein] 4B from text alone: the Image Reference graph without its reference latents (a T2I candidate on disk). */
function kleinT2I(i: { prompt: string; width: number; height: number; seed: number }): Graph {
  return {
    unet: { class_type: 'UNETLoader', inputs: { unet_name: MODELS.kleinDit, weight_dtype: 'default' } },
    clip: { class_type: 'CLIPLoader', inputs: { clip_name: MODELS.kleinTe, type: 'flux2', device: 'default' } },
    vae: { class_type: 'VAELoader', inputs: { vae_name: MODELS.kleinVae } },
    pos: { class_type: 'CLIPTextEncode', inputs: { clip: ['clip', 0], text: i.prompt } },
    neg: { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['pos', 0] } },
    sigmas: { class_type: 'Flux2Scheduler', inputs: { steps: 4, width: i.width, height: i.height } },
    latent: { class_type: 'EmptyFlux2LatentImage', inputs: { width: i.width, height: i.height, batch_size: 1 } },
    noise: { class_type: 'RandomNoise', inputs: { noise_seed: seed32(i.seed) } },
    sampler: { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    guider: { class_type: 'CFGGuider', inputs: { model: ['unet', 0], positive: ['pos', 0], negative: ['neg', 0], cfg: 1 } },
    sample: { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['noise', 0], guider: ['guider', 0], sampler: ['sampler', 0], sigmas: ['sigmas', 0], latent_image: ['latent', 0] } },
    decode: { class_type: 'VAEDecode', inputs: { samples: ['sample', 0], vae: ['vae', 0] } },
    [CANONICAL_OUTPUT]: { class_type: 'SaveImage', inputs: { images: ['decode', 0], filename_prefix: 'vewbox/eval/klein-t2i' } },
  };
}
/** Qwen-Image-2.1 (evaluation): the official template's wiring (comfyui_workflow_templates 0.11.73
 *  image_qwen_image_2_1_t2i / _image_edit): UNETLoader → QwenImage21Cache(auto) → KSampler 25 steps, cfg 1, euler/simple;
 *  TextEncodeQwenImage21 (prompt, negative, resolution 1024, reference images spliced as VAE latents) → positive /
 *  negative; EmptyLatentImage at the target size, or the encoder's own latent (the first reference's size) for an edit. */
function qi21(i: { prompt: string; negative: string; width?: number; height?: number; seed: number; references?: Array<[string, number]>; steps?: number; prefix: string }, extra: Graph = {}): Graph {
  const images: Record<string, unknown> = {};
  (i.references ?? []).forEach((r, k) => { images[`images.image_${k + 1}`] = r; });
  const g: Graph = {
    ...extra,
    unet: { class_type: 'UNETLoader', inputs: { unet_name: QI21.dit, weight_dtype: 'default' }, _meta: { title: 'Qwen-Image-2.1 (evaluation)' } },
    cache: { class_type: 'QwenImage21Cache', inputs: { model: ['unet', 0], device: 'auto', dtype: 'default' } },
    clip: { class_type: 'CLIPLoader', inputs: { clip_name: QI21.te, type: 'qwen_image', device: 'default' } },
    vae: { class_type: 'VAELoader', inputs: { vae_name: QI21.vae } },
    enc: { class_type: 'TextEncodeQwenImage21', inputs: { clip: ['clip', 0], prompt: i.prompt, negative_prompt: i.negative, resolution: 1024, vae: ['vae', 0], ...images } },
    latent: i.width && i.height ? { class_type: 'EmptyLatentImage', inputs: { width: snap(i.width, 16), height: snap(i.height, 16), batch_size: 1 } } : { class_type: 'LatentFromBatch', inputs: { samples: ['enc', 2], batch_index: 0, length: 1 } },
    sample: { class_type: 'KSampler', inputs: { model: ['cache', 0], positive: ['enc', 0], negative: ['enc', 1], latent_image: ['latent', 0], seed: seed32(i.seed), steps: i.steps ?? 25, cfg: 1.0, sampler_name: 'euler', scheduler: 'simple', denoise: 1.0 } },
    decode: { class_type: 'VAEDecode', inputs: { samples: ['sample', 0], vae: ['vae', 0] } },
    [CANONICAL_OUTPUT]: { class_type: 'SaveImage', inputs: { images: ['decode', 0], filename_prefix: `vewbox/eval/${i.prefix}` } },
  };
  return g;
}
/** The reference pictures of an edit, scaled as the shipping edit scales them (≈1 MP), as graph inputs. */
function refNodes(refs: string[], g: Graph): Array<[string, number]> {
  return refs.map((ref, k) => { g[`img${k + 1}`] = { class_type: 'LoadImage', inputs: { image: ref } }; g[`img${k + 1}s`] = { class_type: 'ImageScaleToTotalPixels', inputs: { image: [`img${k + 1}`, 0], upscale_method: 'lanczos', megapixels: 1.0, resolution_steps: 16 } }; return [`img${k + 1}s`, 0] as [string, number]; });
}
/** Qwen-Image-2.1 Image Reference: the upload as image_1 and its face crop (cut in the graph, 1024², as the shipping
 *  graphs cut it) as image_2, the canonical frame as the target. */
function qi21Reference(i: { upload: string; faceRect?: PxRect; prompt: string; negative: string; seed: number }): Graph {
  const g: Graph = { img1: { class_type: 'LoadImage', inputs: { image: i.upload } }, img1s: { class_type: 'ImageScaleToTotalPixels', inputs: { image: ['img1', 0], upscale_method: 'lanczos', megapixels: 1.0, resolution_steps: 16 } } };
  const refs: Array<[string, number]> = [['img1s', 0]];
  if (i.faceRect) {
    const r = i.faceRect;
    g.facecrop = { class_type: 'ImageCrop', inputs: { image: ['img1', 0], width: Math.max(16, Math.round(r.width)), height: Math.max(16, Math.round(r.height)), x: Math.max(0, Math.round(r.x)), y: Math.max(0, Math.round(r.y)) } };
    g.img2s = { class_type: 'ImageScale', inputs: { image: ['facecrop', 0], upscale_method: 'lanczos', width: 1024, height: 1024, crop: 'center' } };
    refs.push(['img2s', 0]);
  }
  return qi21({ prompt: i.prompt, negative: i.negative, width: CANONICAL_FRAME.width, height: CANONICAL_FRAME.height, seed: i.seed, references: refs, prefix: 'qi21-ref' }, g);
}

/** JoyAI Image Reference: the upload as image 1 and its face crop (1024²) as image 2, the canonical frame as the target —
 *  the same inputs the shipping arms get, with the shipping Qwen reference prompt (JoyAI reads a negative). */
function joyReference(i: { upload: string; faceRect?: PxRect; prompt: string; negative: string; seed: number }): Graph {
  const refs = [i.upload, ...(i.faceRect ? [{ image: i.upload, crop: i.faceRect, square: 1024 }] : [])];
  return joyaiEdit({ prompt: i.prompt, negative: i.negative, references: refs, width: CANONICAL_FRAME.width, height: CANONICAL_FRAME.height, seed: i.seed, filenamePrefix: 'vewbox/eval/joy-ref', outputId: CANONICAL_OUTPUT });
}

// ------------------------------------------------------------------------------------------------ measurement
/** The comfyui container's memory (docker stats, streamed): the host-RAM side of a model's staging. */
class RamMeter {
  private proc: ChildProcess | null = null; private samples: Array<[number, number]> = [];
  start() {
    this.proc = spawn('docker', ['stats', COMFY_CONTAINER, '--format', '{{.MemUsage}}']);
    this.proc.stdout!.on('data', (d: Buffer) => { for (const m of d.toString().matchAll(/([\d.]+)\s*(KiB|MiB|GiB|kB|MB|GB)\s*\//g)) { const v = Number(m[1]) * ({ KiB: 1 / 1024, kB: 1 / 1024, MiB: 1, MB: 1, GiB: 1024, GB: 1024 } as Record<string, number>)[m[2]]; if (Number.isFinite(v)) this.samples.push([Date.now(), v]); } });
    this.proc.on('error', () => {});
  }
  peak(since: number) { const xs = this.samples.filter(([t]) => t >= since).map(([, v]) => v); return xs.length ? Math.round(Math.max(...xs)) : NaN; }
  stop() { this.proc?.kill(); }
}
const ram = new RamMeter();
/** SFace cosine of each known face against the picture (asr POST /qa/identity takes a clip: a 1-s still is made). */
async function sface(picture: string, refs: Array<{ id: string; file: string }>): Promise<Record<string, number | null> | { error: string }> {
  try {
    const clip = picture.replace(/\.png$/, '.still.mp4');
    await run('ffmpeg', ['-y', '-v', 'error', '-loop', '1', '-i', picture, '-t', '1', '-r', '2', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-crf', '12', clip]);
    const form = new FormData();
    form.append('video', new Blob([await fs.readFile(clip)], { type: 'video/mp4' }), 'still.mp4');
    for (const r of refs) form.append('references', new Blob([await fs.readFile(r.file)], { type: 'image/png' }), path.basename(r.file));
    form.append('characters', JSON.stringify(refs.map((r) => r.id)));
    form.append('sample_fps', '1');
    const res = await fetch(`${ASR_URL}/qa/identity`, { method: 'POST', body: form });
    await fs.rm(clip, { force: true });
    if (!res.ok) return { error: `${res.status} ${(await res.text()).slice(0, 200)}` };
    const j = await res.json() as { characters: Record<string, { reference: { available: boolean; reason?: string }; summary: { max?: number | null; median: number | null } | null }> };
    return Object.fromEntries(refs.map((r) => { const c = j.characters[r.id]; return [r.id, c?.reference?.available ? (c.summary?.median ?? null) : null]; }));
  } catch (e) { return { error: String((e as Error).message ?? e) }; }
}
class VramMeter {
  private proc: ChildProcess | null = null; private samples: Array<[number, number]> = [];
  start() { this.proc = spawn('nvidia-smi', ['--query-gpu=memory.used', '--format=csv,noheader,nounits', '-lms', '250']); this.proc.stdout!.on('data', (d: Buffer) => { for (const line of d.toString().split(/\r?\n/)) { const v = Number(line.trim()); if (Number.isFinite(v) && line.trim()) this.samples.push([Date.now(), v]); } }); }
  peak(since: number) { const xs = this.samples.filter(([t]) => t >= since).map(([, v]) => v); return xs.length ? Math.max(...xs) : NaN; }
  now() { return this.samples.length ? this.samples[this.samples.length - 1][1] : NaN; }
  stop() { this.proc?.kill(); }
}
const meter = new VramMeter();
async function saveOutput(r: comfy.ComfyRunResult, file: string) {
  const out = comfy.firstOutput(r.outputs, 'images');
  if (!out) throw new Error('no image output');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, await comfy.view(out));
}
async function proxy(src: string, dst: string, height = 768) { await fs.mkdir(path.dirname(dst), { recursive: true }); await run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vf', `scale=-2:${height}`, '-q:v', '4', dst]); }
/** A contact sheet: every file scaled into a cell, in reading order (the order is written next to it). */
async function sheet(files: string[], dst: string, cell: { w: number; h: number }, cols: number) {
  if (!files.length) return;
  const rows = Math.ceil(files.length / cols);
  const inputs = files.flatMap((f) => ['-i', f]);
  const scaled = files.map((_, k) => `[${k}:v]scale=${cell.w}:${cell.h}:force_original_aspect_ratio=decrease,pad=${cell.w}:${cell.h}:(ow-iw)/2:(oh-ih)/2:color=0x202020,setsar=1[c${k}]`).join(';');
  const concat = files.map((_, k) => `[c${k}]`).join('') + `concat=n=${files.length}:v=1:a=0,tile=${cols}x${rows}:padding=4:color=0x101010[out]`;
  await run('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', `${scaled};${concat}`, '-map', '[out]', '-frames:v', '1', '-q:v', '4', dst], { maxBuffer: 64 << 20 });
}

/** `identity`: the faces the picture should carry (id → the original file of its reference), measured by SFace. */
interface Item { id: string; phase: string; style: Style; arm: string; family: string; seed: number; prompt: string; negative?: string; inputs?: Record<string, string>; build: () => Promise<Graph>; canonicalFrame?: boolean; identity?: () => Promise<Array<{ id: string; file: string }>> }
interface Result { id: string; phase: string; style: Style; arm: string; family: string; seed: number; prompt: string; negative?: string; inputs?: Record<string, string>; /** false: the item failed before its graph reached ComfyUI (a harness error, not an attempt) */ submitted?: boolean; file?: string; proxy?: string; width?: number; height?: number; engineMs?: number; wallMs?: number; vramBeforeMiB?: number; vramPeakMiB?: number; ramPeakMiB?: number; coldLoad?: boolean; framing?: FramingCheck; sface?: Record<string, number | null> | { error: string }; workflowVersion?: string; error?: string; skipped?: string; at: string }

const FAMILY: Record<string, string> = { '2512q': 'qwen', '2512d': 'qwen', 'edit-q': 'qwen', 'edit-d': 'qwen', 'edit-ref': 'qwen', '2512bf': 'qwenbf', klein: 'klein', qi21: 'qi21', qi21e: 'qi21', 'qi21-ref': 'qi21', 'joy-e': 'joy', 'joy-ref': 'joy', read: 'read' };
const ARM_MODEL: Record<string, string> = { '2512q': MODELS.qwenDit, '2512d': MODELS.qwenDit, 'edit-q': MODELS.qwenEditDit, 'edit-d': MODELS.qwenEditDit, 'edit-ref': MODELS.qwenEditDit, '2512bf': QWEN_BF16, klein: MODELS.kleinDit, qi21: QI21.dit, qi21e: QI21.dit, 'qi21-ref': QI21.dit, 'joy-e': JOYAI_FILES.dit, 'joy-ref': JOYAI_FILES.dit };

async function main() {
  console.log(`phases ${PHASES.join(',')}; arms ${[...ARMS].join(',')}; seeds ${SEEDS.join(',')}${ONLY ? `; only ${ONLY}` : ''} (argv: ${argv.join(' ')})`);
  installHoldGuard();
  const h = await comfy.health();
  if (!h.ok) throw new Error('ComfyUI is not reachable');
  // the lease was granted but ComfyUI may still finish someone else's prompt: wait up to 5 min for it to go idle, then give up
  for (let k = 0; ; k++) { try { await assertIdle(); break; } catch (e) { if (k >= 30) throw e; if (k === 0) console.log(`waiting for ComfyUI to go idle: ${(e as Error).message}`); await new Promise((r) => setTimeout(r, 10_000)); } }
  await fs.mkdir(OUT, { recursive: true }); await fs.mkdir(EVID, { recursive: true });
  const resultsFile = path.join(EVID, 'results.json');
  const results: Record<string, Result> = await fs.readFile(resultsFile, 'utf8').then((t) => JSON.parse(t) as Record<string, Result>, () => ({}));
  const save = () => fs.writeFile(resultsFile, JSON.stringify(results, null, 2));
  const onDisk = new Set(await comfy.listModels('diffusion_models'));
  const upload = (f: string) => comfy.uploadInput(f);

  // ---------------------------------------------------------------------------------------------- items
  const items: Item[] = [];
  const t2iArms = ['2512q', '2512d', '2512bf', 'klein', 'qi21'].filter((a) => ARMS.has(a));
  const styleOf = (s: Style) => styleDirection(s);
  /** the canonical image an edit is built from: 2512 quality, first seed (an INPUT, drawn in the qwen family first) */
  const canonicalFile = (cid: string) => path.join(OUT, 't2i', `${cid}-2512q-s${SEEDS[0]}.png`);
  const t2iGraph = (arm: string, prompt: string, negative: string, seed: number) => arm === '2512q' ? qwenCanonicalImage({ prompt, negative, seed, quality: true, filenamePrefix: 'vewbox/eval/2512q' }) : arm === '2512bf' ? bf16(qwenCanonicalImage({ prompt, negative, seed, quality: true, filenamePrefix: 'vewbox/eval/2512bf' })) : arm === '2512d' ? qwenCanonicalImage({ prompt, negative, seed, quality: false, filenamePrefix: 'vewbox/eval/2512d' }) : arm === 'klein' ? kleinT2I({ prompt, width: CANONICAL_FRAME.width, height: CANONICAL_FRAME.height, seed }) : qi21({ prompt, negative, width: CANONICAL_FRAME.width, height: CANONICAL_FRAME.height, seed, prefix: 'qi21-t2i' });
  if (PHASES.includes('t2i')) for (const c of CHARACTERS) for (const seed of SEEDS) for (const arm of t2iArms) {
    const d = styleOf(c.style); const identityLine = identityOf(c);
    const prompt = canonicalPrompt({ style: c.style, identityLine, character: d.character, visual: d.visual, avoid: d.avoid });
    const negative = negativeFor(c.style);
    items.push({ id: `t2i/${c.id}-${arm}-s${seed}`, phase: 't2i', style: c.style, arm, family: FAMILY[arm], seed, prompt, negative, canonicalFrame: true, build: async () => t2iGraph(arm, prompt, negative, seed) });
  }
  // the second realistic person of the multi-character frames, one shipping picture (an input, not compared)
  if (PHASES.includes('multi') && ARMS.has('2512q')) {
    const d = styleOf(C4.style); const prompt = canonicalPrompt({ style: C4.style, identityLine: identityOf(C4), character: d.character, visual: d.visual, avoid: d.avoid }); const negative = negativeFor(C4.style); const seed = SEEDS[0];
    items.push({ id: `t2i/${C4.id}-2512q-s${seed}`, phase: 't2i', style: C4.style, arm: '2512q', family: 'qwen', seed, prompt, negative, canonicalFrame: true, build: async () => t2iGraph('2512q', prompt, negative, seed) });
  }
  const plateArms = ['2512d', '2512q', '2512bf', 'qi21'].filter((a) => ARMS.has(a));
  const plateFile = (style: Style, arm: string, seed: number) => path.join(OUT, 'plate', `L1-${style.toLowerCase()}-${arm}-s${seed}.png`);
  if (PHASES.includes('plate')) for (const style of ['CARTOON', 'ANIME', 'REALISTIC'] as Style[]) for (const seed of SEEDS.slice(0, 1)) for (const arm of plateArms) {
    const prompt = locationPrompt(location(style), 'MASTER', 'MORNING');
    items.push({ id: `plate/L1-${style.toLowerCase()}-${arm}-s${seed}`, phase: 'plate', style, arm, family: FAMILY[arm], seed, prompt, negative: PLATE_NEG, build: async () => arm === '2512d' ? qwenTextToImage({ prompt, negative: PLATE_NEG, width: 1344, height: 768, seed, filenamePrefix: 'vewbox/eval/plate-2512d' }) : arm === '2512q' ? qwen2512T2I({ prompt, negative: PLATE_NEG, width: 1344, height: 768, seed, quality: true }) : arm === '2512bf' ? bf16(qwen2512T2I({ prompt, negative: PLATE_NEG, width: 1344, height: 768, seed, quality: true })) : qi21({ prompt, negative: PLATE_NEG, width: 1344, height: 768, seed, prefix: 'qi21-plate' }) });
  }
  const editArms = ['edit-q', 'edit-d', 'qi21e', 'joy-e'].filter((a) => ARMS.has(a));
  /** one edit on the arm's engine: `refs` are uploaded names, image 1 first */
  const editGraph = (arm: string, i: { prompt: string; negative: string; refs: string[]; width: number; height: number; seed: number; prefix: string }) => {
    if (arm === 'qi21e') { const g: Graph = {}; const nodes = refNodes(i.refs, g); return qi21({ prompt: i.prompt, negative: i.negative, seed: i.seed, references: nodes, width: i.width, height: i.height, prefix: `qi21-${i.prefix}` }, g); }
    if (arm === 'joy-e') return joyaiEdit({ prompt: i.prompt, negative: i.negative, references: i.refs, width: i.width, height: i.height, seed: i.seed, filenamePrefix: `vewbox/eval/joy-${i.prefix}` });
    return qwenEdit({ prompt: i.prompt, negative: i.negative, references: i.refs, width: i.width, height: i.height, seed: i.seed, quality: arm === 'edit-q', filenamePrefix: `vewbox/eval/${i.prefix}-${arm}` });
  };
  // the views and the E1 edits take the shipping plate (2512 Lightning, seed 1) of their direction as image 1
  if (PHASES.includes('views')) for (const v of VIEWS) for (const arm of editArms) {
    const style: Style = 'REALISTIC'; const seed = SEEDS[0];
    const prompt = `${locationPrompt(location(style), v.id === 'dusk' ? 'STATE' : 'VIEW', v.id === 'dusk' ? 'DUSK' : 'MORNING', v.id === 'dusk' ? undefined : v.note)} Image 1 is the exact place: keep its architecture, arcades, signage and props.`;
    items.push({ id: `views/L2-${v.id}-${arm}-s${seed}`, phase: 'views', style, arm, family: FAMILY[arm], seed, prompt, negative: PLATE_NEG, inputs: { image1: `plate L1-realistic-2512d-s${seed}` }, build: async () => {
      const plate = await upload(plateFile(style, '2512d', seed));
      // the first run let Qwen-2.1 keep the plate's size; every arm draws 1344×768 here
      return editGraph(arm, { prompt, negative: PLATE_NEG, refs: [plate], width: 1344, height: 768, seed, prefix: 'view' });
    } });
  }
  const posterArms = ['2512q', '2512bf', 'qi21'].filter((a) => ARMS.has(a));
  if (PHASES.includes('poster')) for (const variant of ['P1', 'P2']) for (const seed of SEEDS) for (const arm of posterArms) {
    const style: Style = 'CARTOON'; const d = styleOf(style);
    const kite = identityOf(CHARACTERS[0]).replace(/^Identity:\s*/, '').replace(/\.$/, ''); const girl = identityOf(CHARACTERS[1]).replace(/^Identity:\s*/, '').replace(/\.$/, '').replace(/^Japanese anime character, /, '');
    const prompt = `${d.visual}. Vertical film poster key art: on a Baghdad rooftop at dusk an old kite-maker (${kite}) releases a red kite into the sky while a courier girl (${girl}) looks up beside him; both in the same stylized 3D animated style; cinematic lighting, warm dusk sky, the city skyline below; the top quarter of the poster is open sky left empty for a title${variant === 'P2' ? "; the title text 'THE KITE MAKER' in large serif capitals across the top" : '; no text, no lettering'}. ${d.avoid}`;
    const negative = variant === 'P2' ? negativeFor(style).replace('text, lettering, ', '') : negativeFor(style);
    items.push({ id: `poster/${variant}-${arm}-s${seed}`, phase: 'poster', style, arm, family: FAMILY[arm], seed, prompt, negative, build: async () => arm === '2512q' ? qwen2512T2I({ prompt, negative, width: 896, height: 1344, seed, quality: true }) : arm === '2512bf' ? bf16(qwen2512T2I({ prompt, negative, width: 896, height: 1344, seed, quality: true })) : qi21({ prompt, negative, width: 896, height: 1344, seed, prefix: 'qi21-poster' }) });
  }
  // E1 (scene reference): the canonical image (2512 quality, seed 1) of each character placed in its direction's plate
  if (PHASES.includes('edit')) for (const c of CHARACTERS) for (const seed of SEEDS) for (const arm of editArms) {
    const d = styleOf(c.style); const plateSeed = SEEDS[0];
    const prompt = `${d.visual}. Place the person of image 2 at the second book stall of the market of image 1, standing in a three-quarter view, holding a red kite in one hand, morning light; keep the face, hair, skin and every garment and colour of image 2 exactly, and the architecture and stalls of image 1 exactly. Single still frame, sharp, no text, no watermark. ${d.avoid}`;
    const negative = negativeFor(c.style);
    items.push({ id: `edit/E1-${c.id}-${arm}-s${seed}`, phase: 'edit', style: c.style, arm, family: FAMILY[arm], seed, prompt, negative, inputs: { image1: `plate L1-${c.style.toLowerCase()}-2512d-s${plateSeed}`, image2: `t2i ${c.id}-2512q-s${plateSeed}` }, identity: async () => [{ id: c.id, file: canonicalFile(c.id) }], build: async () => {
      const plate = await upload(plateFile(c.style, '2512d', plateSeed));
      const canonical = await upload(canonicalFile(c.id));
      return editGraph(arm, { prompt, negative, refs: [plate, canonical], width: 1344, height: 768, seed, prefix: 'edit' });
    } });
  }
  // IDEDIT (identity-preserving edit): the canonical image redrawn in a new pose, view and expression
  if (PHASES.includes('idedit')) for (const c of CHARACTERS) for (const seed of SEEDS) for (const arm of editArms) {
    const d = styleOf(c.style);
    const prompt = `${d.visual}. The same person as in image 1, now sitting on a low wooden stool, seen in a three-quarter view from their left, laughing, both hands resting on the knees, the whole figure inside the picture; keep the face, age, hair, skin and every garment, colour and accessory exactly as in image 1, each on the same side of the body. Plain neutral mid-grey studio background, even soft studio light, no text. ${d.avoid}`;
    const negative = negativeFor(c.style);
    items.push({ id: `idedit/${c.id}-${arm}-s${seed}`, phase: 'idedit', style: c.style, arm, family: FAMILY[arm], seed, prompt, negative, inputs: { image1: `t2i ${c.id}-2512q-s${SEEDS[0]}` }, identity: async () => [{ id: c.id, file: canonicalFile(c.id) }], build: async () => {
      const canonical = await upload(canonicalFile(c.id));
      return editGraph(arm, { prompt, negative, refs: [canonical], width: 1024, height: 1280, seed, prefix: 'idedit' });
    } });
  }
  // MULTI (multi-character composition): two canonical people in the realistic plate, talking at a stall
  if (PHASES.includes('multi')) for (const seed of SEEDS) for (const arm of editArms) {
    const style: Style = 'REALISTIC'; const d = styleOf(style); const c3 = CHARACTERS[2];
    const prompt = `${d.visual}. The woman of image 2 and the man of image 3 stand together at the first book stall of the market of image 1, facing each other in conversation, both seen whole from head to feet in a medium-wide shot, morning light; she holds an open book, he points at a page. Keep each person's face, age, hair, skin and every garment, colour and accessory exactly as in their own image, and the architecture and stalls of image 1 exactly. Exactly two people, no one else. Single still frame, sharp, no text, no watermark. ${d.avoid}`;
    const negative = negativeFor(style);
    items.push({ id: `multi/M1-${arm}-s${seed}`, phase: 'multi', style, arm, family: FAMILY[arm], seed, prompt, negative, inputs: { image1: `plate L1-realistic-2512d-s${SEEDS[0]}`, image2: `t2i ${c3.id}-2512q-s${SEEDS[0]}`, image3: `t2i ${C4.id}-2512q-s${SEEDS[0]}` }, identity: async () => [{ id: c3.id, file: canonicalFile(c3.id) }, { id: C4.id, file: canonicalFile(C4.id) }], build: async () => {
      const plate = await upload(plateFile(style, '2512d', SEEDS[0]));
      return editGraph(arm, { prompt, negative, refs: [plate, await upload(canonicalFile(c3.id)), await upload(canonicalFile(C4.id))], width: 1344, height: 768, seed, prefix: 'multi' });
    } });
  }
  const refArms = ['klein', 'edit-ref', 'qi21-ref', 'joy-ref'].filter((a) => ARMS.has(a));
  if (PHASES.includes('reference')) for (const u of REFERENCE_UPLOADS) for (const seed of SEEDS) for (const arm of refArms) {
    const d = styleOf(u.style);
    items.push({ id: `reference/${u.id}-${arm}-s${seed}`, phase: 'reference', style: u.style, arm, family: FAMILY[arm], seed, prompt: '(written from the reading)', inputs: { upload: u.file }, canonicalFrame: true, identity: async () => [{ id: u.id, file: await uploadPath(u.file) }], build: async () => {
      const read = await readUpload(u.file);
      const identityLine = identityLineFromDescription(read.description, { style: u.style }).line;
      const faceRect = read.faceRect;
      if (arm === 'klein') { const prompt = kleinReferencePrompt({ style: u.style, identityLine, faceImage: Boolean(faceRect), character: d.character, visual: d.visual }); lastPrompt = prompt; return kleinReferenceCanonical({ upload: read.upload, faceRect, prompt, seed, filenamePrefix: 'vewbox/eval/klein-ref' }); }
      const prompt = referenceCanonicalPrompt({ style: u.style, identityLine, faceImage: Boolean(faceRect), character: d.character, visual: d.visual }); lastPrompt = prompt;
      if (arm === 'edit-ref') return qwenReferenceCanonical({ upload: read.upload, faceRect, prompt, negative: negativeFor(u.style), seed, filenamePrefix: 'vewbox/eval/edit-ref' });
      if (arm === 'joy-ref') return joyReference({ upload: read.upload, faceRect, prompt, negative: negativeFor(u.style), seed });
      return qi21Reference({ upload: read.upload, faceRect, prompt, negative: negativeFor(u.style), seed });
    } });
  }
  const stressArms = ['2512q', '2512bf', 'qi21'].filter((a) => ARMS.has(a));
  if (PHASES.includes('stress')) for (const c of CHARACTERS) for (const p of POSES) for (const arm of stressArms) {
    const d = styleOf(c.style); const seed = SEEDS[0];
    const prompt = [`${STYLE_MEDIUM[c.style].lead} one character, full-body front view facing the camera, the whole figure from the top of the head to the soles of the feet inside the picture with clear margin above the head and below the feet, ${p.pose}, plain neutral mid-grey studio background, even soft studio light, no text.`, identityOf(c), d.character, d.visual, d.avoid].join(' ');
    const negative = negativeFor(c.style);
    items.push({ id: `stress/${c.id}-${p.id}-${arm}-s${seed}`, phase: 'stress', style: c.style, arm, family: FAMILY[arm], seed, prompt, negative, canonicalFrame: true, build: async () => arm === '2512q' ? qwen2512T2I({ prompt, negative, width: CANONICAL_FRAME.width, height: CANONICAL_FRAME.height, seed, quality: true }) : arm === '2512bf' ? bf16(qwen2512T2I({ prompt, negative, width: CANONICAL_FRAME.width, height: CANONICAL_FRAME.height, seed, quality: true })) : qi21({ prompt, negative, width: CANONICAL_FRAME.width, height: CANONICAL_FRAME.height, seed, prefix: 'qi21-stress' }) });
  }

  // the Image Reference read (MediaPipe + Qwen3.5-4B), once per upload, cached in results.json
  let lastPrompt = '';
  const reads: Record<string, { upload: string; description: CharacterDescription; faceRect?: PxRect; boxes: unknown; text: string }> = (results['reads'] as unknown as typeof reads) ?? {};
  async function readUpload(file: string) {
    if (reads[file]) return reads[file];
    const abs = await uploadPath(file);
    const up = await upload(abs);
    const t0 = Date.now();
    const r = await comfy.run(referenceReadGraph({ image: up, describe: true }), { timeoutMs: 20 * 60_000, onSubmitted: track }); settled(r.promptId);
    const boxes = parseFaceBoxes(comfy.textOutput(r.outputs, REFERENCE_FACE_OUTPUTS.bboxes));
    const text = comfy.textOutput(r.outputs, vlmOutput(REFERENCE_DESCRIBE_KEY)) ?? '';
    const description = parseCharacterDescription(text);
    const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', abs]);
    const [w, hh] = stdout.trim().split(',').map(Number);
    const faceRect = boxes[0] ? faceCropRect(boxes[0], { width: w, height: hh }) : undefined;
    reads[file] = { upload: up, description, faceRect, boxes, text };
    results['reads'] = reads as unknown as Result;
    console.log(`read ${file}: ${boxes.length} face(s), ${Date.now() - t0} ms, engine ${r.engineMs} ms`);
    await save();
    return reads[file];
  }

  // ---------------------------------------------------------------------------------------------- run, by family
  // FIRST ATTEMPTS ONLY: an item that reached the engine (a picture, or an engine error) is never drawn again; an item
  // that failed before submission (a missing input file: a harness error, `submitted: false`) or was skipped because
  // its weights were absent never reached a model and is run
  const done = (r?: Result) => Boolean(r && (r.file || (r.error && r.submitted !== false)));
  const todo = items.filter((it) => !ONLY || it.id.startsWith(ONLY)).filter((it) => !done(results[it.id]));
  // by family (one load each), then by phase so an edit finds the plate and the canonical image it is built from
  // (run 1 ordered the ids alphabetically and the E1 edits ran before their inputs existed: harness errors, re-run)
  const order = ['qwen', 'qwenbf', 'klein', 'read', 'joy', 'qi21'];
  const phaseOrder = ['t2i', 'plate', 'views', 'poster', 'edit', 'idedit', 'multi', 'reference', 'stress'];
  todo.sort((a, b) => order.indexOf(a.family) - order.indexOf(b.family) || phaseOrder.indexOf(a.phase) - phaseOrder.indexOf(b.phase) || a.id.localeCompare(b.id));
  console.log(`${todo.length} item(s) to draw (${items.length} planned, ${items.length - todo.length} done)`);
  // --limit-min N: stop starting new items after N minutes (a bounded hold of the GPU lease; the rest runs next batch)
  const deadline = Date.now() + Number(opt('limit-min', '0')) * 60_000;
  meter.start(); ram.start();
  let family = '';
  for (const it of todo) {
    if (Number(opt('limit-min', '0')) > 0 && Date.now() > deadline) { console.log(`time limit reached; ${todo.length - todo.indexOf(it)} item(s) left for the next batch`); break; }
    const model = ARM_MODEL[it.arm];
    if (model && !onDisk.has(model)) { results[it.id] = { ...it, build: undefined, skipped: `${model} is not on the models volume`, at: new Date().toISOString() } as unknown as Result; await save(); console.log(`${it.id}: skipped (${model} absent)`); continue; }
    if (family && family !== it.family) { await comfy.free(); await new Promise((r) => setTimeout(r, 3000)); }
    const cold = family !== it.family; family = it.family;
    const t0 = Date.now(); const before = meter.now();
    process.stdout.write(`${it.id} … `);
    let submitted = false;
    try {
      const graph = await it.build();
      submitted = true;
      const r = await comfy.run(graph, { timeoutMs: 30 * 60_000, onSubmitted: track }); settled(r.promptId);
      const file = path.join(OUT, `${it.id}.png`);
      await saveOutput(r, file);
      const px = path.join(EVID, `${it.id}.jpg`);
      await proxy(file, px);
      const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]);
      const [w, hh] = stdout.trim().split(',').map(Number);
      const framing = it.canonicalFrame ? fullBodyInFrame(await grayPixels(file, 640)) : undefined;
      results[it.id] = { id: it.id, phase: it.phase, style: it.style, arm: it.arm, family: it.family, seed: it.seed, prompt: it.prompt === '(written from the reading)' ? lastPrompt : it.prompt, negative: it.negative, inputs: it.inputs, file: path.relative(ROOT, file), proxy: path.relative(EVID, px), width: w, height: hh, engineMs: r.engineMs, wallMs: Date.now() - t0, vramBeforeMiB: before, vramPeakMiB: meter.peak(t0), ramPeakMiB: ram.peak(t0), coldLoad: cold, framing, sface: it.identity ? await sface(file, await it.identity()) : undefined, workflowVersion: r.workflowVersion, at: new Date().toISOString() };
      await fs.mkdir(path.join(EVID, 'graphs'), { recursive: true });
      await fs.writeFile(path.join(EVID, 'graphs', `${it.id.replace(/\//g, '--')}.json`), JSON.stringify(graph, null, 2));
      console.log(`engine ${Math.round((r.engineMs ?? 0) / 1000)} s, wall ${Math.round((Date.now() - t0) / 1000)} s, peak ${meter.peak(t0)} MiB, ram ${ram.peak(t0)} MiB${results[it.id].sface ? `, sface ${JSON.stringify(results[it.id].sface)}` : ''}${framing ? `, framing ${framing.ok ? 'ok' : `FAIL (${framing.reasons.join('; ')})`}` : ''}`);
    } catch (e) {
      // the reference read runs inside build(): an engine error there is an attempt as well (it reached ComfyUI)
      const engineError = submitted || e instanceof comfy.ComfyError;
      results[it.id] = { id: it.id, phase: it.phase, style: it.style, arm: it.arm, family: it.family, seed: it.seed, prompt: it.prompt, negative: it.negative, inputs: it.inputs, submitted: engineError, error: String((e as Error).message ?? e), wallMs: Date.now() - t0, vramPeakMiB: meter.peak(t0), ramPeakMiB: ram.peak(t0), at: new Date().toISOString() };
      console.log(`${engineError ? 'ENGINE ERROR' : 'HARNESS ERROR (not an attempt)'} ${(e as Error).message}`);
    }
    await save();
  }
  meter.stop(); ram.stop();
  // contact sheets per phase and style, in the item order of results.json (the order is listed in sheets.json)
  const sheets: Record<string, string[]> = {};
  for (const phase of PHASES) {
    const done = Object.values(results).filter((r) => r && r.phase === phase && r.proxy);
    const byStyle = new Map<string, Result[]>();
    for (const r of done) { const k = `${phase}-${r.style.toLowerCase()}`; byStyle.set(k, [...(byStyle.get(k) ?? []), r]); }
    for (const [k, rs] of byStyle) {
      rs.sort((a, b) => a.id.localeCompare(b.id));
      const portrait = phase === 't2i' || phase === 'reference' || phase === 'stress' || phase === 'poster' || phase === 'idedit';
      const dst = path.join(EVID, `sheet-${k}.jpg`);
      await sheet(rs.map((r) => path.join(EVID, r.proxy!)), dst, portrait ? { w: 288, h: 512 } : { w: 512, h: 292 }, portrait ? Math.min(6, rs.length) : Math.min(3, rs.length));
      sheets[path.basename(dst)] = rs.map((r) => r.id);
    }
  }
  await fs.writeFile(path.join(EVID, 'sheets.json'), JSON.stringify(sheets, null, 2));
  console.log('done');
}

main().catch(async (e) => { meter.stop(); ram.stop(); console.error(e); await cancelOurs('error'); process.exit(1); });
