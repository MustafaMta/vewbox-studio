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
 * quality, and a failed attempt is recorded, never regenerated. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import * as comfy from '@/server/providers/comfy';
import { MODELS, seed32, snap, qwenCanonicalImage, qwenEdit, qwenTextToImage, kleinReferenceCanonical, qwenReferenceCanonical, referenceReadGraph, canonicalPrompt, kleinReferencePrompt, referenceCanonicalPrompt, canonicalIdentityLine, identityLineFromDescription, negativeFor, parseCharacterDescription, parseFaceBoxes, faceCropRect, CANONICAL_FRAME, CANONICAL_OUTPUT, STYLE_MEDIUM, REFERENCE_DESCRIBE_KEY, REFERENCE_FACE_OUTPUTS, vlmOutput, type Graph, type PxRect, type CharacterDescription } from '@/server/workflows';
import { locationPrompt } from '@/server/story/prompts';
import { styleDirection } from '@/server/story/style';
import { fullBodyInFrame, type FramingCheck } from '@/server/media/figure-check';
import { grayPixels } from '@/server/media/image-check';
import type { Location } from '@/domain/types';
import type { Style } from '@/domain/vocabulary';

const run = promisify(execFile);
const ROOT = process.cwd();
const OUT = path.join(ROOT, 'var/model-eval/images');
const EVID = path.join(ROOT, 'docs/evidence/model-eval-2026-10/images');
const argv = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
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
const identityOf = (c: (typeof CHARACTERS)[number]) => canonicalIdentityLine(c.sheet, { style: c.style }).line;

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

// ------------------------------------------------------------------------------------------------ measurement
class VramMeter {
  private proc: ChildProcess | null = null; private samples: Array<[number, number]> = [];
  start() { this.proc = spawn('nvidia-smi', ['--query-gpu=memory.used', '--format=csv,noheader,nounits', '-lms', '250']); this.proc.stdout!.on('data', (d: Buffer) => { for (const line of d.toString().split(/\r?\n/)) { const v = Number(line.trim()); if (Number.isFinite(v) && line.trim()) this.samples.push([Date.now(), v]); } }); }
  peak(since: number) { const xs = this.samples.filter(([t]) => t >= since).map(([, v]) => v); return xs.length ? Math.max(...xs) : NaN; }
  now() { return this.samples.length ? this.samples[this.samples.length - 1][1] : NaN; }
  stop() { this.proc?.kill(); }
}
const meter = new VramMeter();
const exists = (f: string) => fs.access(f).then(() => true, () => false);
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

interface Item { id: string; phase: string; style: Style; arm: string; family: string; seed: number; prompt: string; negative?: string; inputs?: Record<string, string>; build: () => Promise<Graph>; canonicalFrame?: boolean }
interface Result { id: string; phase: string; style: Style; arm: string; family: string; seed: number; prompt: string; negative?: string; inputs?: Record<string, string>; /** false: the item failed before its graph reached ComfyUI (a harness error, not an attempt) */ submitted?: boolean; file?: string; proxy?: string; width?: number; height?: number; engineMs?: number; wallMs?: number; vramBeforeMiB?: number; vramPeakMiB?: number; coldLoad?: boolean; framing?: FramingCheck; workflowVersion?: string; error?: string; skipped?: string; at: string }

const FAMILY: Record<string, string> = { '2512q': 'qwen', '2512d': 'qwen', 'edit-q': 'qwen', 'edit-d': 'qwen', 'edit-ref': 'qwen', klein: 'klein', qi21: 'qi21', qi21e: 'qi21', 'qi21-ref': 'qi21', read: 'read' };
const ARM_MODEL: Record<string, string> = { '2512q': MODELS.qwenDit, '2512d': MODELS.qwenDit, 'edit-q': MODELS.qwenEditDit, 'edit-d': MODELS.qwenEditDit, 'edit-ref': MODELS.qwenEditDit, klein: MODELS.kleinDit, qi21: QI21.dit, qi21e: QI21.dit, 'qi21-ref': QI21.dit };

async function main() {
  console.log(`phases ${PHASES.join(',')}; arms ${[...ARMS].join(',')}; seeds ${SEEDS.join(',')}${ONLY ? `; only ${ONLY}` : ''} (argv: ${argv.join(' ')})`);
  const h = await comfy.health();
  if (!h.ok) throw new Error('ComfyUI is not reachable');
  const q = await fetch(`${process.env.COMFYUI_URL ?? 'http://127.0.0.1:8188'}/queue`).then((r) => r.json() as Promise<{ queue_running: unknown[]; queue_pending: unknown[] }>);
  if (q.queue_running.length + q.queue_pending.length) throw new Error('ComfyUI is busy; this evaluation needs the card to itself');
  await fs.mkdir(OUT, { recursive: true }); await fs.mkdir(EVID, { recursive: true });
  const resultsFile = path.join(EVID, 'results.json');
  const results: Record<string, Result> = await fs.readFile(resultsFile, 'utf8').then((t) => JSON.parse(t) as Record<string, Result>, () => ({}));
  const save = () => fs.writeFile(resultsFile, JSON.stringify(results, null, 2));
  const onDisk = new Set(await comfy.listModels('diffusion_models'));
  const upload = (f: string) => comfy.uploadInput(f);

  // ---------------------------------------------------------------------------------------------- items
  const items: Item[] = [];
  const t2iArms = ['2512q', '2512d', 'klein', 'qi21'].filter((a) => ARMS.has(a));
  const styleOf = (s: Style) => styleDirection(s);
  if (PHASES.includes('t2i')) for (const c of CHARACTERS) for (const seed of SEEDS) for (const arm of t2iArms) {
    const d = styleOf(c.style); const identityLine = identityOf(c);
    const prompt = canonicalPrompt({ style: c.style, identityLine, character: d.character, visual: d.visual, avoid: d.avoid });
    const negative = negativeFor(c.style);
    items.push({ id: `t2i/${c.id}-${arm}-s${seed}`, phase: 't2i', style: c.style, arm, family: FAMILY[arm], seed, prompt, negative, canonicalFrame: true, build: async () => arm === '2512q' ? qwenCanonicalImage({ prompt, negative, seed, quality: true, filenamePrefix: 'vewbox/eval/2512q' }) : arm === '2512d' ? qwenCanonicalImage({ prompt, negative, seed, quality: false, filenamePrefix: 'vewbox/eval/2512d' }) : arm === 'klein' ? kleinT2I({ prompt, width: CANONICAL_FRAME.width, height: CANONICAL_FRAME.height, seed }) : qi21({ prompt, negative, width: CANONICAL_FRAME.width, height: CANONICAL_FRAME.height, seed, prefix: 'qi21-t2i' }) });
  }
  const plateArms = ['2512d', '2512q', 'qi21'].filter((a) => ARMS.has(a));
  const plateFile = (style: Style, arm: string, seed: number) => path.join(OUT, 'plate', `L1-${style.toLowerCase()}-${arm}-s${seed}.png`);
  if (PHASES.includes('plate')) for (const style of ['CARTOON', 'ANIME', 'REALISTIC'] as Style[]) for (const seed of SEEDS.slice(0, 1)) for (const arm of plateArms) {
    const prompt = locationPrompt(location(style), 'MASTER', 'MORNING');
    items.push({ id: `plate/L1-${style.toLowerCase()}-${arm}-s${seed}`, phase: 'plate', style, arm, family: FAMILY[arm], seed, prompt, negative: PLATE_NEG, build: async () => arm === '2512d' ? qwenTextToImage({ prompt, negative: PLATE_NEG, width: 1344, height: 768, seed, filenamePrefix: 'vewbox/eval/plate-2512d' }) : arm === '2512q' ? qwen2512T2I({ prompt, negative: PLATE_NEG, width: 1344, height: 768, seed, quality: true }) : qi21({ prompt, negative: PLATE_NEG, width: 1344, height: 768, seed, prefix: 'qi21-plate' }) });
  }
  const editArms = ['edit-q', 'edit-d', 'qi21e'].filter((a) => ARMS.has(a));
  // the views and the E1 edits take the shipping plate (2512 Lightning, seed 1) of their direction as image 1
  if (PHASES.includes('views')) for (const v of VIEWS) for (const arm of editArms) {
    const style: Style = 'REALISTIC'; const seed = SEEDS[0];
    const prompt = `${locationPrompt(location(style), v.id === 'dusk' ? 'STATE' : 'VIEW', v.id === 'dusk' ? 'DUSK' : 'MORNING', v.id === 'dusk' ? undefined : v.note)} Image 1 is the exact place: keep its architecture, arcades, signage and props.`;
    items.push({ id: `views/L2-${v.id}-${arm}-s${seed}`, phase: 'views', style, arm, family: FAMILY[arm], seed, prompt, negative: PLATE_NEG, inputs: { image1: `plate L1-realistic-2512d-s${seed}` }, build: async () => {
      const plate = await upload(plateFile(style, '2512d', seed));
      if (arm === 'qi21e') { const g: Graph = {}; const refs = refNodes([plate], g); return qi21({ prompt, negative: PLATE_NEG, seed, references: refs, prefix: 'qi21-view' }, g); }
      return qwenEdit({ prompt, negative: PLATE_NEG, references: [plate], width: 1344, height: 768, seed, quality: arm === 'edit-q', filenamePrefix: `vewbox/eval/view-${arm}` });
    } });
  }
  const posterArms = ['2512q', 'qi21'].filter((a) => ARMS.has(a));
  if (PHASES.includes('poster')) for (const variant of ['P1', 'P2']) for (const seed of SEEDS) for (const arm of posterArms) {
    const style: Style = 'CARTOON'; const d = styleOf(style);
    const kite = identityOf(CHARACTERS[0]).replace(/^Identity:\s*/, '').replace(/\.$/, ''); const girl = identityOf(CHARACTERS[1]).replace(/^Identity:\s*/, '').replace(/\.$/, '').replace(/^Japanese anime character, /, '');
    const prompt = `${d.visual}. Vertical film poster key art: on a Baghdad rooftop at dusk an old kite-maker (${kite}) releases a red kite into the sky while a courier girl (${girl}) looks up beside him; both in the same stylized 3D animated style; cinematic lighting, warm dusk sky, the city skyline below; the top quarter of the poster is open sky left empty for a title${variant === 'P2' ? "; the title text 'THE KITE MAKER' in large serif capitals across the top" : '; no text, no lettering'}. ${d.avoid}`;
    const negative = variant === 'P2' ? negativeFor(style).replace('text, lettering, ', '') : negativeFor(style);
    items.push({ id: `poster/${variant}-${arm}-s${seed}`, phase: 'poster', style, arm, family: FAMILY[arm], seed, prompt, negative, build: async () => arm === '2512q' ? qwen2512T2I({ prompt, negative, width: 896, height: 1344, seed, quality: true }) : qi21({ prompt, negative, width: 896, height: 1344, seed, prefix: 'qi21-poster' }) });
  }
  // E1: the canonical image (2512 quality, seed 1) of each character placed in its direction's plate
  if (PHASES.includes('edit')) for (const c of CHARACTERS) for (const seed of SEEDS) for (const arm of editArms) {
    const d = styleOf(c.style); const plateSeed = SEEDS[0];
    const prompt = `${d.visual}. Place the person of image 2 at the second book stall of the market of image 1, standing in a three-quarter view, holding a red kite in one hand, morning light; keep the face, hair, skin and every garment and colour of image 2 exactly, and the architecture and stalls of image 1 exactly. Single still frame, sharp, no text, no watermark. ${d.avoid}`;
    const negative = negativeFor(c.style);
    items.push({ id: `edit/E1-${c.id}-${arm}-s${seed}`, phase: 'edit', style: c.style, arm, family: FAMILY[arm], seed, prompt, negative, inputs: { image1: `plate L1-${c.style.toLowerCase()}-2512d-s${plateSeed}`, image2: `t2i ${c.id}-2512q-s${plateSeed}` }, build: async () => {
      const plate = await upload(plateFile(c.style, '2512d', plateSeed));
      const canonical = await upload(path.join(OUT, 't2i', `${c.id}-2512q-s${plateSeed}.png`));
      if (arm === 'qi21e') { const g: Graph = {}; const refs = refNodes([plate, canonical], g); return qi21({ prompt, negative, seed, references: refs, prefix: 'qi21-edit' }, g); }
      return qwenEdit({ prompt, negative, references: [plate, canonical], width: 1344, height: 768, seed, quality: arm === 'edit-q', filenamePrefix: `vewbox/eval/edit-${arm}` });
    } });
  }
  const refArms = ['klein', 'edit-ref', 'qi21-ref'].filter((a) => ARMS.has(a));
  if (PHASES.includes('reference')) for (const u of REFERENCE_UPLOADS) for (const seed of SEEDS) for (const arm of refArms) {
    const d = styleOf(u.style);
    items.push({ id: `reference/${u.id}-${arm}-s${seed}`, phase: 'reference', style: u.style, arm, family: FAMILY[arm], seed, prompt: '(written from the reading)', inputs: { upload: u.file }, canonicalFrame: true, build: async () => {
      const read = await readUpload(u.file);
      const identityLine = identityLineFromDescription(read.description, { style: u.style }).line;
      const faceRect = read.faceRect;
      if (arm === 'klein') { const prompt = kleinReferencePrompt({ style: u.style, identityLine, faceImage: Boolean(faceRect), character: d.character, visual: d.visual }); lastPrompt = prompt; return kleinReferenceCanonical({ upload: read.upload, faceRect, prompt, seed, filenamePrefix: 'vewbox/eval/klein-ref' }); }
      const prompt = referenceCanonicalPrompt({ style: u.style, identityLine, faceImage: Boolean(faceRect), character: d.character, visual: d.visual }); lastPrompt = prompt;
      if (arm === 'edit-ref') return qwenReferenceCanonical({ upload: read.upload, faceRect, prompt, negative: negativeFor(u.style), seed, filenamePrefix: 'vewbox/eval/edit-ref' });
      return qi21Reference({ upload: read.upload, faceRect, prompt, negative: negativeFor(u.style), seed });
    } });
  }
  const stressArms = ['2512q', 'qi21'].filter((a) => ARMS.has(a));
  if (PHASES.includes('stress')) for (const c of CHARACTERS) for (const p of POSES) for (const arm of stressArms) {
    const d = styleOf(c.style); const seed = SEEDS[0];
    const prompt = [`${STYLE_MEDIUM[c.style].lead} one character, full-body front view facing the camera, the whole figure from the top of the head to the soles of the feet inside the picture with clear margin above the head and below the feet, ${p.pose}, plain neutral mid-grey studio background, even soft studio light, no text.`, identityOf(c), d.character, d.visual, d.avoid].join(' ');
    const negative = negativeFor(c.style);
    items.push({ id: `stress/${c.id}-${p.id}-${arm}-s${seed}`, phase: 'stress', style: c.style, arm, family: FAMILY[arm], seed, prompt, negative, canonicalFrame: true, build: async () => arm === '2512q' ? qwen2512T2I({ prompt, negative, width: CANONICAL_FRAME.width, height: CANONICAL_FRAME.height, seed, quality: true }) : qi21({ prompt, negative, width: CANONICAL_FRAME.width, height: CANONICAL_FRAME.height, seed, prefix: 'qi21-stress' }) });
  }

  // the Image Reference read (MediaPipe + Qwen3.5-4B), once per upload, cached in results.json
  let lastPrompt = '';
  const reads: Record<string, { upload: string; description: CharacterDescription; faceRect?: PxRect; boxes: unknown; text: string }> = (results['reads'] as unknown as typeof reads) ?? {};
  async function readUpload(file: string) {
    if (reads[file]) return reads[file];
    const abs = await uploadPath(file);
    const up = await upload(abs);
    const t0 = Date.now();
    const r = await comfy.run(referenceReadGraph({ image: up, describe: true }), { timeoutMs: 20 * 60_000 });
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
  const order = ['qwen', 'klein', 'read', 'qi21'];
  const phaseOrder = ['t2i', 'plate', 'views', 'poster', 'edit', 'reference', 'stress'];
  todo.sort((a, b) => order.indexOf(a.family) - order.indexOf(b.family) || phaseOrder.indexOf(a.phase) - phaseOrder.indexOf(b.phase) || a.id.localeCompare(b.id));
  console.log(`${todo.length} item(s) to draw (${items.length} planned, ${items.length - todo.length} done)`);
  meter.start();
  let family = '';
  for (const it of todo) {
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
      const r = await comfy.run(graph, { timeoutMs: 30 * 60_000 });
      const file = path.join(OUT, `${it.id}.png`);
      await saveOutput(r, file);
      const px = path.join(EVID, `${it.id}.jpg`);
      await proxy(file, px);
      const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]);
      const [w, hh] = stdout.trim().split(',').map(Number);
      const framing = it.canonicalFrame ? fullBodyInFrame(await grayPixels(file, 640)) : undefined;
      results[it.id] = { id: it.id, phase: it.phase, style: it.style, arm: it.arm, family: it.family, seed: it.seed, prompt: it.prompt === '(written from the reading)' ? lastPrompt : it.prompt, negative: it.negative, inputs: it.inputs, file: path.relative(ROOT, file), proxy: path.relative(EVID, px), width: w, height: hh, engineMs: r.engineMs, wallMs: Date.now() - t0, vramBeforeMiB: before, vramPeakMiB: meter.peak(t0), coldLoad: cold, framing, workflowVersion: r.workflowVersion, at: new Date().toISOString() };
      await fs.mkdir(path.join(EVID, 'graphs'), { recursive: true });
      await fs.writeFile(path.join(EVID, 'graphs', `${it.id.replace(/\//g, '--')}.json`), JSON.stringify(graph, null, 2));
      console.log(`engine ${Math.round((r.engineMs ?? 0) / 1000)} s, wall ${Math.round((Date.now() - t0) / 1000)} s, peak ${meter.peak(t0)} MiB${framing ? `, framing ${framing.ok ? 'ok' : `FAIL (${framing.reasons.join('; ')})`}` : ''}`);
    } catch (e) {
      // the reference read runs inside build(): an engine error there is an attempt as well (it reached ComfyUI)
      const engineError = submitted || e instanceof comfy.ComfyError;
      results[it.id] = { id: it.id, phase: it.phase, style: it.style, arm: it.arm, family: it.family, seed: it.seed, prompt: it.prompt, negative: it.negative, inputs: it.inputs, submitted: engineError, error: String((e as Error).message ?? e), wallMs: Date.now() - t0, vramPeakMiB: meter.peak(t0), at: new Date().toISOString() };
      console.log(`${engineError ? 'ENGINE ERROR' : 'HARNESS ERROR (not an attempt)'} ${(e as Error).message}`);
    }
    await save();
  }
  meter.stop();
  // contact sheets per phase and style, in the item order of results.json (the order is listed in sheets.json)
  const sheets: Record<string, string[]> = {};
  for (const phase of PHASES) {
    const done = Object.values(results).filter((r) => r && r.phase === phase && r.proxy);
    const byStyle = new Map<string, Result[]>();
    for (const r of done) { const k = `${phase}-${r.style.toLowerCase()}`; byStyle.set(k, [...(byStyle.get(k) ?? []), r]); }
    for (const [k, rs] of byStyle) {
      rs.sort((a, b) => a.id.localeCompare(b.id));
      const portrait = phase === 't2i' || phase === 'reference' || phase === 'stress' || phase === 'poster';
      const dst = path.join(EVID, `sheet-${k}.jpg`);
      await sheet(rs.map((r) => path.join(EVID, r.proxy!)), dst, portrait ? { w: 288, h: 512 } : { w: 512, h: 292 }, portrait ? Math.min(6, rs.length) : Math.min(3, rs.length));
      sheets[path.basename(dst)] = rs.map((r) => r.id);
    }
  }
  await fs.writeFile(path.join(EVID, 'sheets.json'), JSON.stringify(sheets, null, 2));
  console.log('done');
}

main().catch((e) => { meter.stop(); console.error(e); process.exit(1); });
