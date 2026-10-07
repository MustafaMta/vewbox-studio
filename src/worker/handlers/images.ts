import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Handler, HandlerContext } from './index';
import type { ToolRunner } from '@/server/org/tools';
import { step } from './step';
import { canCountPeople, countPeopleInFiles, peopleExpected } from './people';
import { StudioError, missingReference } from '@/domain/errors';
import type { Asset, Character, CharacterRef, LocationRef, PendingReference, Production, Shot, WorldRead } from '@/domain/types';
import { overlayWorld } from '@/domain/world';
import { worldOfProduction } from '@/server/world';
import type { TimeOfDay } from '@/domain/vocabulary';
import { ASPECT_INFO } from '@/domain/vocabulary';
import { command, readState } from '@/server/studio/engine';
import { castOf, worldOf } from '@/studio/selectors';
import { assetFile, assetFromStored, ffprobe } from '@/server/media';
import { ffmpeg, tmpDir } from '@/server/media/ffmpeg';
import { grayPixels, validateReferenceImage, type ReferenceValidation } from '@/server/media/image-check';
import { fullBodyInFrame, type FramingCheck } from '@/server/media/figure-check';
import { faceBoxFromReading } from '@/server/media/presentation';
import * as comfy from '@/server/providers/comfy';
import {
  CANONICAL_FRAME, CANONICAL_OUTPUT, MODELS, REFERENCE_DESCRIBE_KEY, REFERENCE_FACE_OUTPUTS, SECONDARY_MATERIAL, portraitCrop,
  canonicalIdentityLine, canonicalPrompt, faceCropRect, hasNonLatinLetters, identityLineFromDescription, identitySeedFor, isSecondaryMaterialKind,
  negativeFor, parseCharacterDescription, parseFaceBoxes, qwenCanonicalImage, qwenEdit, qwenReferenceCanonical, qwenSecondary, qwenTextToImage,
  referenceCanonicalPrompt, referenceReadGraph, secondaryPrompt, vlmOutput, type CharacterDescription, type FaceBoxPx, type PxRect, type SecondaryMaterialKind,
  type CropPx, faceCheck, FACE_CHECK_OUTPUTS,
} from '@/server/workflows';
import { PLATE_WIDE_FRAMINGS, frameContinuityLine, framePrompt, framingCropFromFace, locationPrompt, personCropFor, plateCropFor } from '@/server/story/prompts';
import { effectiveRelation } from '@/server/production/shot-pack';
import { LOOK_FIELDS, type LookField } from '@/server/story/schemas';
import { styleDirection } from '@/server/story/style';
import { canChangeAppearance } from '@/domain/rules';
import { lookWritten, primaryImageOf, redrawsFromEarlierPicture, usableImage } from '@/domain/identity';
import { recordMetric } from '@/server/jobs/queue';
import { committedOutput, jobOutputs, stableSeed } from '@/server/jobs/outputs';
import { recordHandoff } from '@/server/org/runs';
import { IMAGE_VRAM_MB } from '@/server/gpu/estimates';

/** PICTURES — the canonical character image, optional secondary character material, location plates and views,
 *  storyboard frames. All drawn by Qwen-Image (text to image) and Qwen-Image-Edit (multi-reference editing) in ComfyUI
 *  on the local GPU, under the GPU lease. Every picture becomes a library asset with its prompt, references, seed and
 *  workflow version. A bundled sample or an SVG placeholder is never a reference (`usableImage`).
 *
 *  Character identity (docs/CONTRACTS-IDENTITY-PACK.md v2): one character = ONE canonical front full-body image,
 *  drawn by CHARACTER_APPEARANCE — from the English identity line (style first; Qwen-Image-2512 in quality mode), or
 *  from the producer's uploaded picture, which is read first (MediaPipe face box, a Qwen3.5-4B description that writes
 *  the identity line) and redrawn into the production's style (Qwen-Image-Edit-2511 since the stack directive of
 *  2026-10-06; the FLUX.2 [klein] 4B route was removed 2026-10-06). A picture whose figure is not
 *  whole in the frame is redrawn once (the first becomes RAW), then left for the producer with the reason. The image is
 *  a DRAFT until the producer approves it; it is the primary image everywhere, including the reference of every shot.
 *  CHARACTER_REFS draws optional SECONDARY material on request, one pass from that image. Evidence and the A/B behind
 *  every choice: docs/evidence/image-v2/REPORT.md. */


async function requireComfy() {
  const h = await comfy.health();
  if (!h.ok) throw new StudioError('UNAVAILABLE', 'The image engine (ComfyUI) is not reachable. Start the comfyui service.');
  const { missing } = await comfy.hasNodes(['TextEncodeQwenImageEditPlus', 'UNETLoader', 'ModelSamplingAuraFlow', 'ImageCrop', 'ImageScale']);
  if (missing.length) throw new StudioError('NOT_CONFIGURED', `ComfyUI is missing nodes: ${missing.join(', ')}`);
  const models = await comfy.listModels('diffusion_models').catch(() => [] as string[]);
  if (!models.some((m) => m.includes('qwen_image'))) throw new StudioError('NOT_CONFIGURED', 'Qwen-Image weights are not downloaded yet (see docker/models).');
}

interface Drawn { id: string; file: string; prompt: string; references: string[]; workflowVersion: string; ms: number; width?: number; height?: number; seed?: number }

type ImageTool = 'image.generate' | 'image.edit_with_references' | 'image.describe_reference';

/** Run one graph under the GPU lease as a recorded tool call (through `runner`, a delegated step's tool runner, when
 *  another agent's step runs it). */
async function runGraph(ctx: HandlerContext, graph: Record<string, unknown>, opts: { label: string; tool: ImageTool; runner?: ToolRunner; key: string }): Promise<comfy.ComfyRunResult> {
  const tool = opts.runner ?? ctx.tool;
  // the step's prompt key (audit H8, step 7): a restarted attempt re-attaches to the prompt it submitted before
  return ctx.gpu('IMAGE', IMAGE_VRAM_MB, () => tool(opts.tool, () => comfy.run(graph, { promptKey: `${ctx.job.id}:${opts.key}`, timeoutMs: 20 * 60_000, shouldStop: async () => { try { await ctx.checkpoint(); return false; } catch { return true; } }, onProgress: (p) => ctx.progress('GENERATING', { phase: 'drawing', message: p.queue ? `waiting behind ${p.queue} in the GPU queue` : opts.label, percent: null }) }), { label: opts.label, input: { graph, label: opts.label } }), { jobId: ctx.job.id });
}

/** Fetch one ComfyUI output file into a temporary folder (the caller removes `dir`). */
async function fetchOutput(out: comfy.ComfyOutputFile): Promise<{ dir: string; file: string }> {
  const dir = await tmpDir('img');
  const file = path.join(dir, out.filename);
  await fsp.writeFile(file, await comfy.view(out));
  return { dir, file };
}

type AdoptOptions = { key: string; label: string; tags: string[]; prompt: string; negative?: string; references: string[]; seed?: number; model: string; loras?: string[]; provenance?: Record<string, unknown>; ms: number; tier?: 'SECONDARY' | 'RAW' };

/** Bring a fetched output into the library as an asset with its provenance (and its tier when it is not canonical). */
async function adoptFetched(ctx: HandlerContext, tmp: string, run: comfy.ComfyRunResult, opts: AdoptOptions): Promise<Drawn> {
  // the picture's id is the job's output id for its step (src/server/jobs/outputs.ts): a retry finds it (reuseDrawn)
  const { id, stored } = await jobOutputs(ctx.job).adopt(`image:${opts.key}`, tmp, { expectKind: 'IMAGE' });
  const provenance = { provider: 'COMFYUI', model: opts.model, loras: opts.loras ?? [], prompt: opts.prompt, negative: opts.negative, references: opts.references, seed: opts.seed, workflowVersion: run.workflowVersion, promptId: run.promptId, engineMs: run.engineMs, ...(opts.provenance ?? {}) };
  await command('addAsset', [assetFromStored(id, stored, { label: opts.label, tags: opts.tags, origin: 'GENERATED', jobId: ctx.job.id, provenance, ...(opts.tier ? { tier: opts.tier } : {}) })], 'worker');
  return { id, file: stored.absPath, prompt: opts.prompt, references: opts.references, workflowVersion: run.workflowVersion, ms: opts.ms, width: stored.probe?.width, height: stored.probe?.height };
}

/** The picture an earlier attempt of this job already drew and recorded for step `key`: reused, never drawn twice
 *  (audit H8, step 7). */
async function reuseDrawn(ctx: HandlerContext, key: string): Promise<Drawn | undefined> {
  const a = await committedOutput(ctx.job.id, `image:${key}`);
  if (!a) return undefined;
  await ctx.event('info', `${a.label}: drawn by an earlier attempt of this job (${a.id}); reused`, { assetId: a.id, key });
  return { id: a.id, file: assetFile(a), prompt: String(a.provenance?.prompt ?? ''), references: Array.isArray(a.provenance?.references) ? (a.provenance!.references as string[]) : [], workflowVersion: String(a.provenance?.workflowVersion ?? ''), ms: 0, width: a.width, height: a.height, seed: typeof a.provenance?.seed === 'number' ? a.provenance.seed : undefined };
}

/** Bring one ComfyUI output file into the library as an asset with its provenance. */
async function adoptOutput(ctx: HandlerContext, out: comfy.ComfyOutputFile, run: comfy.ComfyRunResult, opts: AdoptOptions): Promise<Drawn> {
  const { dir, file } = await fetchOutput(out);
  try { return await adoptFetched(ctx, file, run, opts); } finally { await fsp.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

/** Run one image workflow (text to image, or an edit from up to three references) and bring the result into the
 *  library as an asset. */
async function draw(ctx: HandlerContext, opts: { key: string; prompt: string; negative?: string; references?: Asset[]; /** a cut per reference (same order) */ crops?: Array<CropPx | undefined>; width: number; height: number; label: string; tags: string[]; seed?: number; quality?: boolean; provenance?: Record<string, unknown> }): Promise<Drawn> {
  const reused = await reuseDrawn(ctx, opts.key);
  if (reused) return reused;
  const kept = (opts.references ?? []).map((a, k) => ({ a, crop: opts.crops?.[k] })).filter((x) => usableImage(x.a)).slice(0, 3);
  const refs = kept.map((x) => x.a);
  // the seed is the job's for this step: every attempt builds the same graph, so its prompt key finds the prompt
  const seed = opts.seed ?? stableSeed(ctx.job.id, `image:${opts.key}`);
  const graph = refs.length
    ? qwenEdit({ prompt: opts.prompt, negative: opts.negative, references: await Promise.all(refs.map((a) => comfy.uploadInput(assetFile(a)))), width: opts.width, height: opts.height, seed, quality: opts.quality, crops: kept.some((x) => x.crop) ? kept.map((x) => x.crop) : undefined })
    : qwenTextToImage({ prompt: opts.prompt, negative: opts.negative, width: opts.width, height: opts.height, seed });
  const t0 = Date.now();
  const run = await runGraph(ctx, graph, { key: opts.key, label: opts.label, tool: refs.length ? 'image.edit_with_references' : 'image.generate' });
  const out = comfy.firstOutput(run.outputs, 'images');
  if (!out) throw new StudioError('PROVIDER', 'ComfyUI returned no image.');
  const model = refs.length ? 'Qwen-Image-Edit-2511' : 'Qwen-Image-2512';
  const loras = refs.length ? (opts.quality ? [] : [MODELS.qwenEditLightning]) : [MODELS.qwenLightning];
  const d = await adoptOutput(ctx, out, run, { key: opts.key, label: opts.label, tags: opts.tags, prompt: opts.prompt, negative: opts.negative, references: refs.map((r) => r.id), seed, model, loras, provenance: opts.provenance, ms: Date.now() - t0 });
  await recordMetric('image.generation_ms', d.ms, 'ms', { model, refs: refs.length }, ctx.job.id);
  return d;
}

const NEG = 'text, watermark, logo, signature, blurry, deformed hands, extra fingers, extra limbs, duplicate person, cropped head';

// ------------------------------------------------------------------------------------------- character appearance

const identitySeedOf = (c: Character) => identitySeedFor(c);
/** The identity line a character is drawn and described with (shot frames, secondary material): the one recorded
 *  with its canonical image, else the canonical builder's line for the record (style first, age, the look). */
const drawnLineOf = (c: Character) => c.canonicalImage?.identityLine || canonicalIdentityLine(c, { style: c.style }).line;

// ----------------------------------------------------------------------------- the look from a reference picture

const LOOK_NAMES: Record<LookField, string> = { face: 'face', hair: 'hair', skin: 'skin', eyes: 'eyes', build: 'build', wardrobe: 'wardrobe' };
const clean = (s?: string) => (s ?? '').replace(/\s+/g, ' ').replace(/[.;]+$/, '').trim();
const listWords = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/** What the producer actually wrote about the look of a character drawn from a picture (a field they filled, a
 *  distinguishing mark, an accessory, a restriction): deliberate details, stated after the picture's own look. */
function writtenLook(c: Pick<Character, LookField | 'distinguishing'> & { canon?: Character['canon'] }): string[] {
  const written: string[] = [];
  if (clean(c.hair)) written.push(`${clean(c.hair)} hair`);
  if (clean(c.eyes)) written.push(`${clean(c.eyes)} eyes`);
  if (clean(c.skin) && clean(c.skin) !== '—') written.push(`${clean(c.skin)} skin`);
  if (clean(c.build)) written.push(`${clean(c.build)} build`);
  if (clean(c.face)) written.push(clean(c.face));
  if (clean(c.wardrobe)) written.push(`wearing ${clean(c.wardrobe)}`);
  for (const d of (c.distinguishing ?? []).slice(0, 6)) if (clean(d)) written.push(clean(d));
  const acc = (c.canon?.accessories ?? []).map(clean).filter(Boolean);
  if (acc.length) written.push(`accessories: ${acc.join(', ')}`);
  for (const r of (c.canon?.visualRestrictions ?? []).slice(0, 4)) if (clean(r)) written.push(clean(r).charAt(0).toLowerCase() + clean(r).slice(1));
  return written;
}

/** REFERENCE MODE without a description (finding 3) — the picture is the source of the look: the identity line names
 *  the look fields that come from the picture ("as in the reference picture") and keeps only what the producer wrote.
 *  Used when the vision model is not installed or its answer could not be read. */
export function referenceIdentityLine(c: Pick<Character, LookField | 'distinguishing'> & { canon?: Character['canon'] }): string {
  const fromPicture = LOOK_FIELDS.filter((k) => !clean(c[k]) || clean(c[k]) === '—').map((k) => LOOK_NAMES[k]);
  const parts = [fromPicture.length ? `${listWords(fromPicture)} exactly as in the reference picture` : '', ...writtenLook(c)].filter(Boolean);
  return `Identity: ${parts.join('; ')}.`;
}

/** REFERENCE MODE with a description: the English identity line written from what the vision model saw in the
 *  picture (style first; low-confidence fields left out and reported), then what the producer wrote. Non-Latin
 *  pieces the producer wrote are reported, never sent to the image model. */
export function referenceLook(c: Character, d: CharacterDescription | undefined): { line: string; from: 'DESCRIPTION' | 'PICTURE'; lowConfidence: string[]; notVisible: string[]; nonLatin: string[] } {
  const written = writtenLook(c);
  const nonLatin = written.filter(hasNonLatinLetters);
  if (!d) return { line: referenceIdentityLine(c), from: 'PICTURE', lowConfidence: [], notVisible: [], nonLatin };
  const base = identityLineFromDescription(d, { style: c.style });
  const body = base.line.replace(/^Identity:\s*/, '').replace(/\.$/, '');
  return { line: `Identity: ${[body, ...written.filter((w) => !hasNonLatinLetters(w))].join('; ')}.`, from: 'DESCRIPTION', lowConfidence: base.lowConfidence, notVisible: base.notVisible, nonLatin };
}

/** The look of a character drawn from text: the English identity line, style first (a line stored by an earlier
 *  drawing from a picture no longer applies when no picture is given). */
export function textLook(c: Character): { line: string; nonLatin: string[] } {
  const src = /as in the reference picture/.test(c.canon?.identityLine ?? '') ? { ...c, canon: { ...c.canon, identityLine: undefined } } : c;
  const r = canonicalIdentityLine(src, { style: c.style });
  return { line: r.line, nonLatin: r.nonLatin };
}

/** The producer's reference must be a real, usable, validated picture (contract §1.2: an unusable reference is
 *  refused with MISSING_REFERENCE, never silently replaced by text). A stored validation (written by the upload
 *  endpoint) is trusted; without one the file is measured here on the CPU. */
export async function requireUsableReference(c: Character, pending: Asset | undefined): Promise<ReferenceValidation | undefined> {
  if (!c.pendingReference) return undefined;
  if (!usableImage(pending)) throw missingReference(`${c.name}: the reference picture is missing or is not a usable image; upload a clear picture of the face.`, { characterId: c.id, assetId: c.pendingReference.assetId });
  const stored = (c.pendingReference as PendingReference & { validation?: ReferenceValidation }).validation;
  const v = stored ?? await validateReferenceImage(assetFile(pending));
  if (!v.ok) throw missingReference(`${c.name}: the reference picture cannot be used — ${v.reasons.join('; ')}.`, { characterId: c.id, assetId: pending.id, validation: v });
  return v;
}

/** One reading of a reference picture, as stored on the picture's asset (`provenance.reading`). */
interface StoredReading { boxes: FaceBoxPx[]; description: CharacterDescription; describedBy: string; vlm: string; at: string }
const storedReading = (a: Asset): StoredReading | undefined => {
  const r = a.provenance?.reading as Partial<StoredReading> | undefined;
  return r && r.vlm === MODELS.vlm && Array.isArray(r.boxes) && r.description && typeof r.description === 'object' && Array.isArray(r.description.clothing) ? r as StoredReading : undefined;
};

export interface PictureReading { upload: string; boxes: FaceBoxPx[]; description?: CharacterDescription; describedBy?: string; notes: string[]; reused: boolean }

/** Read the producer's picture in ComfyUI: the MediaPipe face boxes and, when Qwen3.5-4B is installed, the
 *  description the identity line (and, in the creation chain, the design — D15) is written from. A reading with a
 *  description is stored on the picture's asset and reused by the next read of the same picture, so the design and
 *  the drawing work from ONE reading (and the vision model runs once). `describeOnly`: without the vision model
 *  nothing is run (the caller only wants the description). `runner`: a delegated step's tool runner. */
export async function readReferencePicture(ctx: HandlerContext, picture: Asset, opts: { label: string; runner?: ToolRunner; describeOnly?: boolean }): Promise<PictureReading> {
  const upload = await comfy.uploadInput(assetFile(picture));
  const describe = (await comfy.listModels('text_encoders').catch(() => [] as string[])).includes(MODELS.vlm);
  const stored = storedReading(picture);
  if (stored) return { upload, boxes: stored.boxes, description: stored.description, describedBy: stored.describedBy, notes: [`the picture was already read (${stored.describedBy}); that one reading is used`], reused: true };
  if (!describe && opts.describeOnly) return { upload, boxes: [], notes: ['the vision model (Qwen3.5-4B) is not installed: the picture cannot be described'], reused: false };
  const run = await runGraph(ctx, referenceReadGraph({ image: upload, describe }), { key: `read:${picture.id}`, label: opts.label, tool: 'image.describe_reference', runner: opts.runner });
  const notes: string[] = [];
  const boxes = parseFaceBoxes(comfy.textOutput(run.outputs, REFERENCE_FACE_OUTPUTS.bboxes));
  let description: CharacterDescription | undefined;
  if (!describe) notes.push('the vision model (Qwen3.5-4B) is not installed: the look is taken from the picture alone');
  else {
    const text = comfy.textOutput(run.outputs, vlmOutput(REFERENCE_DESCRIBE_KEY)) ?? '';
    try { description = parseCharacterDescription(text); } catch (e) { notes.push(`the description could not be read (${(e as Error).message}): the look is taken from the picture alone`); }
  }
  if (description) {
    const fresh = (await readState()).state.assets.find((a) => a.id === picture.id) ?? picture;
    const reading: StoredReading = { boxes, description, describedBy: 'Qwen3.5-4B', vlm: MODELS.vlm, at: new Date().toISOString() };
    // the face box MediaPipe just measured on this picture is its presentation's face box (§2.4; one face only)
    const faceBox = faceBoxFromReading({ reading }, fresh);
    await command('updateAsset', [picture.id, { provenance: { ...(fresh.provenance ?? {}), reading }, ...(faceBox ? { presentation: { ...(fresh.presentation ?? {}), faceBox } } : {}) }], 'worker');
  }
  return { upload, boxes, description, describedBy: description ? 'Qwen3.5-4B' : undefined, notes, reused: false };
}

interface ReferenceRead { upload: string; faceRect?: PxRect; faces: number; description?: CharacterDescription; notes: string[]; describedBy?: string }

/** Read the producer's picture before drawing from it: the face box (one face → a chin-safe crop given to the redraw
 *  as image 2) and the description the identity line is written from. */
async function readReference(ctx: HandlerContext, c: Character, pending: Asset): Promise<ReferenceRead> {
  const read = await readReferencePicture(ctx, pending, { label: `${c.name} — reading the reference picture` });
  const notes = [...read.notes];
  let faceRect: PxRect | undefined;
  if (read.boxes.length === 1) {
    const p = await ffprobe(assetFile(pending));
    const size = { width: Number(p.width) || pending.width || 0, height: Number(p.height) || pending.height || 0 };
    if (size.width && size.height) faceRect = faceCropRect(read.boxes[0], size);
  } else notes.unshift(read.boxes.length ? `${read.boxes.length} faces found: the redraw gets no separate face crop` : 'no face found by the detector: the redraw gets no separate face crop');
  return { upload: read.upload, faceRect, faces: read.boxes.length, description: read.description, notes, describedBy: read.describedBy };
}

/** The engines of the canonical image: from the written look (Qwen-Image-2512), or from the producer's picture
 *  (Qwen-Image-Edit-2511 — the production editor by the producer's stack directive,
 *  docs/directives/PRODUCTION-STACK-DIRECTIVE-2026-10-06.md; FLUX is no longer a production dependency). */
const CANONICAL_ENGINE = { DESCRIPTION: 'Qwen-Image-2512 (30 steps, cfg 4)', REFERENCE_QWEN: 'Qwen-Image-Edit-2511 (24 steps, cfg 4)' } as const;
const FRAMING_OK = 'full body in frame: head and feet inside the picture with margin';

/** The framing check of a drawn picture: the whole figure, head to feet, with margin (src/server/media/figure-check.ts;
 *  in the A/B it passed all 36 canonical pictures and failed all 12 deliberately cropped ones). */
async function framingOf(file: string): Promise<FramingCheck> { return fullBodyInFrame(await grayPixels(file, 640)); }

export const characterAppearance: Handler = async (ctx) => {
  const { characterId } = ctx.job.payload as { characterId: string };
  const { state } = await readState();
  const c = state.characters.find((x) => x.id === characterId);
  if (!c) throw new StudioError('NOT_FOUND', 'Character not found');
  // an earlier attempt of THIS job already set the canonical image (it crashed before the job was completed): done
  if (c.canonicalImage?.jobId === ctx.job.id) {
    await ctx.event('info', `${c.name}: the canonical image was already set by an earlier attempt of this job; nothing is drawn again`, { characterId: c.id, assetId: c.canonicalImage.assetId });
    return { canonicalAssetId: c.canonicalImage.assetId, version: c.canonicalImage.version, status: c.canonicalImage.status, seed: c.canonicalImage.seed, identityLine: c.canonicalImage.identityLine, engine: c.canonicalImage.engine, check: c.canonicalImage.check, resumedFromCommit: true, message: `${c.name}: canonical image drawn — awaiting your approval` };
  }
  if (!canChangeAppearance(c)) throw new StudioError('APPEARANCE_LOCKED', `${c.name} has been used in a video; the appearance is preserved for continuity.`);
  // D19: the look of a character made from a picture IS that picture (its look fields stay empty until the producer
  // writes them), so a redraw without a new picture draws from the same picture again — from the written look it
  // would draw a stranger. The earlier picture is the one the current image records.
  const earlier = redrawsFromEarlierPicture(c) ? state.assets.find((a) => a.id === c.canonicalImage!.referenceAssetId) : undefined;
  const pending = c.pendingReference ? state.assets.find((a) => a.id === c.pendingReference!.assetId) : usableImage(earlier) ? earlier : undefined;
  // REFERENCE PICTURE CHECK (the Character Continuity Agent's step): an uploaded reference is checked before anything
  // is drawn from it
  const validation = c.pendingReference ? await step(ctx, 'character-continuity', `reference-picture-check: ${c.name}`, () => requireUsableReference(c, pending)) : undefined;
  await requireComfy();
  const style = c.style;
  const d = styleDirection(style);
  const negative = negativeFor(style);
  // a redraw is a new picture: the identity seed moves on by the version it replaces
  const seed = (identitySeedOf(c) + (c.canonicalImage?.version ?? 0)) % 2 ** 31;

  // the look: read from the producer's picture, or the English identity line of the written sheet
  await ctx.progress('GENERATING', { phase: 'drawing', message: pending ? `Reading ${c.name}’s reference picture` : `Drawing ${c.name}` });
  const read = pending ? await readReference(ctx, c, pending) : undefined;
  // without its picture (removed from the library) a picture-made character keeps the line its image was drawn from
  const keptLine = !read && !lookWritten(c) && c.canonicalImage?.referenceAssetId && c.canonicalImage.identityLine ? c.canonicalImage.identityLine : undefined;
  const look = read ? referenceLook(c, read.description) : { ...(keptLine ? { line: keptLine, nonLatin: [] as string[] } : textLook(c)), from: 'DESCRIPTION' as const, lowConfidence: [] as string[], notVisible: [] as string[] };
  if (!read && look.nonLatin.length && !/;/.test(look.line)) throw new StudioError('INVALID', `${c.name}: the look is written only in a script the image model does not read (${look.nonLatin.slice(0, 3).join('; ')}); write the appearance in English, or describe the character so it is designed.`, { characterId: c.id, nonLatin: look.nonLatin, failureClass: 'INVALID_INPUT' });
  const notes = [...(earlier && pending === earlier ? [`drawn again from the earlier reference picture (${earlier.id})`] : []), ...(keptLine ? ['the earlier reference picture is no longer in the library: drawn from the line the current image was drawn from'] : []), ...(read?.notes ?? []), ...(look.nonLatin.length ? [`left out of the prompt (not in English): ${look.nonLatin.slice(0, 4).join('; ')}`] : []), ...(look.lowConfidence.length ? [`not used (the description was unsure): ${look.lowConfidence.join(', ')}`] : [])];
  if (notes.length) await ctx.event('warn', `${c.name}: ${notes.join(' — ')}`, { characterId: c.id, notes });
  const engine = !read ? CANONICAL_ENGINE.DESCRIPTION : CANONICAL_ENGINE.REFERENCE_QWEN;
  const model = !read ? 'Qwen-Image-2512' : 'Qwen-Image-Edit-2511';
  const references = pending ? [pending.id] : [];

  // ONE DRAW (first-attempt policy, master plan §1): the picture is drawn once and kept with its framing check. A
  // figure that is not whole in the frame is NOT redrawn behind the producer's back: the failed check stays on the
  // image (approving over it needs a stated reason) and an explicit "Draw again" is a new, counted creative attempt
  // (the canonical image's version). An infrastructure retry of this job re-judges the picture it already drew.
  const rejected: Array<{ assetId: string; seed: number; reasons: string[] }> = [];
  const usedSeed = seed;
  const faceRect = read?.faceRect;
  const prompt = !read ? canonicalPrompt({ style, identityLine: look.line, character: d.character, visual: d.visual, avoid: d.avoid })
    : referenceCanonicalPrompt({ style, identityLine: look.line, faceImage: Boolean(faceRect), character: d.character, visual: d.visual });
  const graph = !read ? qwenCanonicalImage({ prompt, negative, seed: usedSeed })
    : qwenReferenceCanonical({ upload: read.upload, faceRect, prompt, negative, seed: usedSeed });
  await ctx.progress('GENERATING', { phase: 'drawing', message: `Drawing ${c.name}`, percent: null });
  const key = 'canonical:0';
  let drawn: Drawn | undefined = await reuseDrawn(ctx, key);
  let framing: FramingCheck;
  if (drawn) framing = await framingOf(drawn.file);
  else {
    const t0 = Date.now();
    const run = await runGraph(ctx, graph, { key, label: `${c.name} — canonical image`, tool: read ? 'image.edit_with_references' : 'image.generate' });
    const out = run.outputs[CANONICAL_OUTPUT]?.images?.[0];
    if (!out) throw new StudioError('PROVIDER', 'ComfyUI returned no image.');
    const tmp = await fetchOutput(out);
    try {
      framing = await framingOf(tmp.file);
      drawn = await adoptFetched(ctx, tmp.file, run, { key, label: `${c.name} — canonical image`, tags: ['character', 'canonical'], prompt, negative, references, seed: usedSeed, model, loras: [], ms: Date.now() - t0, provenance: { characterId: c.id, view: 'CANONICAL', identityLine: look.line, identitySeed: seed, lookFrom: pending ? 'REFERENCE' : 'DESCRIPTION', framing: { ok: framing.ok, reasons: framing.reasons, box: framing.box }, creativeAttempt: (c.canonicalImage?.version ?? 0) + 1, ...(pending ? { referenceAssetId: pending.id, faceBox: read?.faceRect, faceCropGiven: Boolean(faceRect), faces: read?.faces, description: read?.description, describedBy: read?.describedBy } : {}), ...(validation ? { referenceValidation: validation } : {}) } });
      await recordMetric('image.generation_ms', drawn.ms, 'ms', { model, refs: references.length, canonical: 1 }, ctx.job.id);
    } finally { await fsp.rm(tmp.dir, { recursive: true, force: true }).catch(() => {}); }
    await ctx.checkpoint();
  }
  if (!framing.ok) await ctx.event('warn', `${c.name}: the picture (${drawn.id}) is not whole in the frame — ${framing.reasons.join('; ')}; kept for your review (no automatic redraw)`, { characterId: c.id, assetId: drawn.id, reasons: framing.reasons });
  const check = { ok: framing.ok, notes: [framing.ok ? FRAMING_OK : `full body not in frame: ${framing.reasons.join('; ')}`, ...notes] };
  await command('setCanonicalImage', [c.id, { assetId: drawn!.id, jobId: ctx.job.id, seed: usedSeed, referenceAssetId: pending?.id, engine, identityLine: look.line, check }], 'worker');
  const fresh = (await readState()).state.characters.find((x) => x.id === c.id);
  const from = pending ? `from the producer’s reference picture (${pending.id})${read?.description ? ', its look described by Qwen3.5-4B' : ''}` : 'from the description';
  await ctx.activity('CHARACTER_DRAWN', `${c.name}: canonical image drawn ${from}, seed ${usedSeed}; ${framing.ok ? 'whole figure in frame' : `FRAMING CHECK FAILED (${framing.reasons.join('; ')})`} — awaiting your approval`, { characterId: c.id, assetId: drawn!.id, ms: drawn!.ms, references, seed: usedSeed, identityLine: look.line, check, rejected });
  return { canonicalAssetId: drawn!.id, version: fresh?.canonicalImage?.version, status: fresh?.canonicalImage?.status ?? 'DRAFT', ms: drawn!.ms, workflowVersion: drawn!.workflowVersion, seed: usedSeed, identityLine: look.line, lookFrom: pending ? 'REFERENCE' : 'DESCRIPTION', engine, check, rejected, message: `${c.name}: canonical image drawn — awaiting your approval` };
};

// ------------------------------------------------------------------------------------------- secondary material

/** Seed offsets from the identity seed, per kind: each kind is reproducible and distinct from the canonical image's
 *  seed; a redraw of a kind moves its previous seed on by one. */
const SECONDARY_SEED_OFFSET: Record<SecondaryMaterialKind, number> = { EXPRESSION: 17, OUTFIT: 19, PORTRAIT: 23 };
const SECONDARY_LABEL: Record<SecondaryMaterialKind, string> = { EXPRESSION: 'expression sheet', OUTFIT: 'outfit', PORTRAIT: 'close-up portrait' };

/** CHARACTER_REFS — optional SECONDARY material on request (contract v2 §1), never part of creation and never the
 *  identity: one Qwen-Image-Edit-2511 pass (quality mode) per requested kind — an expression sheet, the outfit, a
 *  close-up portrait — with the character's primary image as the only reference (the canonical image, else a legacy
 *  portrait) and its identity line. An expression sheet or an outfit replaces the previous one of its kind in the
 *  character's refs (the earlier picture stays in the library); a close-up portrait becomes the portrait shown in the
 *  secondary material, so it is drawn only beside a canonical image (it can never stand in for the primary image).
 *  No other view is drawn. */
export const characterRefs: Handler = async (ctx) => {
  const { characterId, roles } = ctx.job.payload as { characterId: string; roles?: string[] };
  const { state } = await readState();
  const c = state.characters.find((x) => x.id === characterId);
  if (!c) throw new StudioError('NOT_FOUND', 'Character not found');
  if (!canChangeAppearance(c)) throw new StudioError('APPEARANCE_LOCKED', `${c.name} has been used in a video; the appearance is preserved for continuity.`);
  const asked = [...new Set(roles ?? [])];
  const other = asked.filter((r) => !isSecondaryMaterialKind(r));
  if (!asked.length || other.length) throw new StudioError('INVALID', `Secondary material is ${SECONDARY_MATERIAL.map((k) => SECONDARY_LABEL[k]).join(', ')} (${SECONDARY_MATERIAL.join(', ')})${other.length ? `; ${other.join(', ')} is not drawn — one canonical image per character, no extra views` : ': name the kind to draw'}.`, { characterId: c.id, roles: asked, failureClass: 'INVALID_INPUT' });
  const kinds = asked as SecondaryMaterialKind[];
  if (kinds.includes('PORTRAIT') && !c.canonicalImage) throw new StudioError('INVALID', `${c.name}: a close-up portrait is drawn beside the canonical image, never in place of it; draw the character’s canonical image first.`, { characterId: c.id, failureClass: 'INVALID_INPUT' });
  const primary = state.assets.find((a) => a.id === primaryImageOf(c));
  if (!usableImage(primary)) throw missingReference(`${c.name}: draw the character’s image first; secondary material is made from it.`, { characterId: c.id });
  await requireComfy();
  const line = drawnLineOf(c);
  const seed = identitySeedOf(c);
  const negative = negativeFor(c.style);
  const visual = styleDirection(c.style).visual;
  const upload = await comfy.uploadInput(assetFile(primary));
  const previousSeed = (kind: SecondaryMaterialKind): number | undefined => {
    if (kind !== 'PORTRAIT') return c.refs.find((r) => r.role === kind)?.seed;
    const p = c.portraitAssetId ? state.assets.find((a) => a.id === c.portraitAssetId) : undefined;
    return p?.provenance?.view === 'PORTRAIT' && typeof p.provenance.seed === 'number' ? p.provenance.seed : undefined;
  };
  const drawn: Array<{ kind: SecondaryMaterialKind; assetId: string; seed: number; ms: number }> = [];
  for (const [n, kind] of kinds.entries()) {
    await ctx.progress('GENERATING', { phase: 'drawing', message: `${c.name}: ${SECONDARY_LABEL[kind]} from the character’s image`, step: n + 1, total: kinds.length, percent: null });
    const prev = previousSeed(kind);
    const kindSeed = (typeof prev === 'number' ? prev + 1 : seed + SECONDARY_SEED_OFFSET[kind]) % 2 ** 31;
    const prompt = secondaryPrompt({ kind, style: c.style, identityLine: line, visual });
    // the close-up is drawn from the head and shoulders of the canonical image (from the whole figure Edit-2511 drew
    // the whole figure again, docs/evidence/image-v2/d13)
    const crop = kind === 'PORTRAIT' ? portraitCrop({ width: primary.width || CANONICAL_FRAME.width, height: primary.height || CANONICAL_FRAME.height }, (primary.provenance?.framing as { box?: { x: number; y: number; w: number; h: number } | null } | undefined)?.box) : undefined;
    const key = `secondary:${kind}`;
    const earlierDraw = await reuseDrawn(ctx, key);
    if (earlierDraw) { drawn.push({ kind, assetId: earlierDraw.id, seed: earlierDraw.seed ?? kindSeed, ms: 0 }); continue; }
    const t0 = Date.now();
    const run = await runGraph(ctx, qwenSecondary({ canonical: upload, kind, prompt, negative, seed: kindSeed, crop }), { key, label: `${c.name} — ${SECONDARY_LABEL[kind]}`, tool: 'image.edit_with_references' });
    const out = comfy.firstOutput(run.outputs, 'images');
    if (!out) throw new StudioError('PROVIDER', 'ComfyUI returned no image.');
    const ms = Date.now() - t0;
    await recordMetric('image.generation_ms', ms, 'ms', { model: 'Qwen-Image-Edit-2511', refs: 1, quality: 1, secondary: 1 }, ctx.job.id);
    const d = await adoptOutput(ctx, out, run, { key, label: `${c.name} — ${SECONDARY_LABEL[kind]}`, tags: ['character', 'secondary', kind.toLowerCase()], prompt, negative, references: [primary.id], seed: kindSeed, model: 'Qwen-Image-Edit-2511', loras: [], provenance: { characterId: c.id, view: kind, identityLine: line, identitySeed: seed, quality: true, ...(crop ? { cropOfReference: crop } : {}) }, ms, tier: 'SECONDARY' });
    drawn.push({ kind, assetId: d.id, seed: kindSeed, ms });
    await ctx.activity('CHARACTER_SECONDARY', `${c.name}: ${SECONDARY_LABEL[kind]} drawn in one pass from the character’s image (${primary.id}), seed ${kindSeed} — secondary material, not the identity`, { characterId: c.id, assetId: d.id, kind, references: [primary.id], seed: kindSeed, ms, engineMs: run.engineMs });
    await ctx.checkpoint();
  }

  // recorded on the character from its current record: the drawn kinds replace their previous pictures only
  const now = (await readState()).state.characters.find((x) => x.id === c.id);
  if (!now) throw new StudioError('NOT_FOUND', `Character ${c.id} no longer exists.`);
  const refs: CharacterRef[] = drawn.filter((x) => x.kind !== 'PORTRAIT').map((x) => ({ id: `ref-${x.assetId}`, role: x.kind as Exclude<SecondaryMaterialKind, 'PORTRAIT'>, assetId: x.assetId, view: x.kind, references: [primary.id], seed: x.seed }));
  const replaced = new Set<string>(refs.map((r) => r.role));
  const portrait = drawn.find((x) => x.kind === 'PORTRAIT');
  await command('updateCharacter', [c.id, { ...(refs.length ? { refs: [...now.refs.filter((r) => !replaced.has(r.role)), ...refs] } : {}), ...(portrait ? { portraitAssetId: portrait.assetId } : {}) }], 'worker');
  // handed on with the character's primary image to every production the character is in
  for (const p of (await readState()).state.productions.filter((x) => x.castIds.includes(c.id))) {
    await recordHandoff({ productionId: p.id, stage: 'CAST_WORLD', producerDepartment: 'CASTING', receiverDepartment: 'PREPRODUCTION', artifactIds: [primary.id, ...drawn.map((x) => x.assetId)], outputVersions: { character: c.id, secondary: drawn.map((x) => x.kind).join(','), identitySeed: seed, model: 'Qwen-Image-Edit-2511' }, validation: { ok: drawn.length === kinds.length, checks: [{ name: 'primary-image-present', ok: true, detail: primary.id }, { name: 'secondary-material-drawn', ok: drawn.length === kinds.length, detail: kinds.join(', ') }, { name: 'references-recorded', ok: true, detail: `one reference (${primary.id}); identity line: ${line.slice(0, 120)}` }] }, jobId: ctx.job.id });
  }
  return { assetId: drawn.at(-1)?.assetId, secondary: drawn.map(({ kind, assetId, seed: s }) => ({ kind, assetId, seed: s })), references: [primary.id], identitySeed: seed, identityLine: line, message: `${c.name}: ${drawn.map((x) => SECONDARY_LABEL[x.kind]).join(', ')} drawn — secondary material` };
};

// ---------------------------------------------------------------------------------------------------- locations

/** A closer view of a place towards one of its landmarks, as Edit-2511 reads it (the wording measured in D24). */
export function landmarkViewPrompt(landmark: string): string {
  return `A closer view of the same place, the camera moved forward towards ${landmark.trim().replace(/\.$/, '').replace(/^(A|An|The) /, (m) => m.toLowerCase())}, which fills the middle of the frame. Keep the same materials, colours, furnishings, style of rendering and lighting.`;
}
/** A landmark's short label: its words up to the first comma or position phrase ("the long wooden workbench"). */
export function landmarkLabel(landmark: string): string {
  const head = landmark.split(/,| on the | in the | at the | under | beside | facing /i)[0]!.trim().replace(/\.$/, '');
  const short = head.length > 48 ? `${head.slice(0, 47).trimEnd()}…` : head;
  return short.replace(/^(A|An|The) /, (m) => m.toLowerCase());
}

export const locationPlates: Handler = async (ctx) => {
  const { locationId, timesOfDay, force } = ctx.job.payload as { locationId: string; timesOfDay?: TimeOfDay[]; force?: boolean };
  const { state } = await readState();
  const l = state.locations.find((x) => x.id === locationId);
  if (!l) throw new StudioError('NOT_FOUND', 'Location not found');
  // a place that has been filmed keeps its plates: a new master would change it under the takes already chosen
  if (force) {
    const filmedIn = state.productions.filter((p) => p.shots.some((sh) => sh.selectedTakeId && p.scenes.find((sc) => sc.id === sh.sceneId)?.locationId === l.id));
    if (filmedIn.length) throw new StudioError('APPEARANCE_LOCKED', `${l.name} has been filmed (${filmedIn.map((p) => p.title).join(', ')}); its plates are kept for continuity.`, { locationId: l.id, productionIds: filmedIn.map((p) => p.id) });
  }
  await requireComfy();
  const refs: LocationRef[] = [];
  // a bundled sample plate is a placeholder, not a master to build views from
  const existingMaster = force ? undefined : state.assets.find((a) => a.id === l.masterAssetId && !a.sample);
  let master: Asset | undefined = usableImage(existingMaster) ? existingMaster : undefined;
  const primaryTod = (timesOfDay?.[0] ?? l.lighting[0] ?? 'MORNING') as TimeOfDay;
  if (!master) {
    await ctx.progress('GENERATING', { phase: 'drawing', message: `${l.name}: master plate`, step: 1, total: 3 + (timesOfDay?.length ?? 1) });
    const m = await draw(ctx, { key: 'plate:master', prompt: locationPrompt(l, 'MASTER', primaryTod), negative: NEG + ', people, person', width: 1344, height: 768, label: `${l.name} — master plate`, tags: ['location', 'master'], provenance: { locationId: l.id, view: 'MASTER', timeOfDay: primaryTod } });
    refs.push({ id: `lref-${m.id}`, role: 'MASTER', assetId: m.id, label: 'Master plate', timeOfDay: primaryTod });
    master = (await readState()).state.assets.find((a) => a.id === m.id);
    await ctx.checkpoint();
  }
  // D24: a "reverse angle" drawn by Edit-2511 from the master kept the master's composition (6/6 draws, also with the
  // Multiple-Angles LoRA and with generic or landmark-derived wording; one hand-written prompt naming the door worked
  // 2/2) — so no view is labelled a reverse angle until a recipe holds. What does hold (2/2): a closer view towards the
  // first landmark, in quality mode (docs/evidence/location-views)
  const views: Array<{ prompt: string; note: string; label: string }> = l.landmarks[0] ? [{ prompt: landmarkViewPrompt(l.landmarks[0]), note: `a closer view towards ${l.landmarks[0]}`, label: `Towards ${landmarkLabel(l.landmarks[0])}` }] : [];
  for (const [i, v] of views.entries()) {
    await ctx.progress('GENERATING', { phase: 'drawing', message: `${l.name}: ${v.label.toLowerCase()}`, step: 2 + i, total: 2 + views.length + (timesOfDay?.length ?? 1) });
    const r = await draw(ctx, { key: `plate:view:${i}`, prompt: v.prompt, negative: NEG + ', people, person', references: master ? [master] : [], width: 1344, height: 768, quality: true, label: `${l.name} — ${v.label.toLowerCase()}`, tags: ['location', 'view'], provenance: { locationId: l.id, view: 'VIEW', note: v.note } });
    refs.push({ id: `lref-${r.id}`, role: 'VIEW', assetId: r.id, label: v.label, timeOfDay: primaryTod });
    await ctx.checkpoint();
  }
  const states = (timesOfDay ?? l.lighting).filter((t) => t !== primaryTod).slice(0, 3);
  for (const [i, tod] of states.entries()) {
    await ctx.progress('GENERATING', { phase: 'drawing', message: `${l.name}: ${tod.toLowerCase().replace('_', ' ')}`, step: 4 + i, total: 3 + states.length });
    const r = await draw(ctx, { key: `plate:state:${tod}`, prompt: locationPrompt(l, 'STATE', tod) + ' Same place and same camera as the reference picture; only the light and time of day change.', negative: NEG + ', people, person', references: master ? [master] : [], width: 1344, height: 768, label: `${l.name} — ${tod.toLowerCase().replace('_', ' ')}`, tags: ['location', 'state'], provenance: { locationId: l.id, view: 'STATE', timeOfDay: tod } });
    refs.push({ id: `lref-${r.id}`, role: 'STATE', assetId: r.id, label: tod.toLowerCase().replace('_', ' '), timeOfDay: tod });
    await ctx.checkpoint();
  }
  await command('addLocationRefs', [l.id, refs], 'worker');
  // PLATE HAND-OFF REVIEW (the Art Director's step): the place is handed on with its checks to every production it is in
  await step(ctx, 'art-director', `plate-handoff-review: ${l.name}`, async () => {
    const fresh = (await readState()).state.locations.find((x) => x.id === l.id)!;
    for (const p of (await readState()).state.productions.filter((x) => x.locationIds.includes(l.id))) {
      await recordHandoff({ productionId: p.id, stage: 'CAST_WORLD', producerDepartment: 'WORLD', receiverDepartment: 'PREPRODUCTION', artifactIds: refs.map((r) => r.assetId), outputVersions: { location: l.id, refs: fresh.refs.length }, validation: { ok: Boolean(fresh.masterAssetId) && fresh.refs.some((r) => r.role === 'VIEW'), checks: [{ name: 'master-plate-present', ok: Boolean(fresh.masterAssetId) }, { name: 'views-present', ok: fresh.refs.some((r) => r.role === 'VIEW'), detail: `${fresh.refs.filter((r) => r.role === 'VIEW').length} view(s), ${fresh.refs.filter((r) => r.role === 'STATE').length} time-of-day state(s)` }] }, jobId: ctx.job.id });
    }
  });
  await ctx.activity('PLATES_DRAWN', `${l.name}: ${refs.length} plate(s) drawn${master ? '' : ' (no master)'}`, { locationId: l.id, refs: refs.length });
  return { refs: refs.length };
};

// -------------------------------------------------------------------------------------------------- shot frames

type State = Awaited<ReturnType<typeof readState>>['state'];

/** The references of a storyboard frame, from the studio state with the production's World Bible laid over it
 *  (`overlayWorld`): the place by the plate `choosePlate` picked (`read.location` — an established frame at the scene's
 *  time of day, else the drawn plate for that time, an established frame of another time, the master), else (no bible
 *  read) the location's own plate for the time of day or its master; then up to two characters by their primary image
 *  (the pinned canonical image in the overlay, else a legacy portrait); a lone character's legacy face crop as the
 *  third picture.
 *
 *  A CLOSE SHOT (closer than MEDIUM_WIDE) WITH ITS PEOPLE PICTURED is composed from the people, not the place
 *  (acceptance 2026-10-06, Tea 1.3: with the plate as image 1 Qwen-Image-Edit-2511 kept the plate's wide composition for a
 *  medium close-up 2/2 and the people check refused the frame): the canonical image(s) come first, cut to the part of
 *  the figure the framing shows (`personCropFor`), and the plate is the last picture, cut to the shot's distance around
 *  the middle (`plateCropFor`) — the place behind them, never the camera. `crops` lines up with `refs`. Pure. */
export function frameReferences(state: State, p: Production, sh: Shot, read?: WorldRead): { refs: Asset[]; crops: Array<CropPx | undefined>; notes: string[]; people: Character[]; imageOf: Map<string, number>; plate?: { assetId: string; why: string }; composition: 'PLATE' | 'PEOPLE' } {
  const scene = p.scenes.find((sc) => sc.id === sh.sceneId);
  const cast = castOf(state, p);
  const loc = worldOf(state, p).find((l) => l.id === scene?.locationId);
  const byId = (id?: string) => (id ? state.assets.find((a) => a.id === id) : undefined);
  const own = loc ? (loc.refs.find((r) => r.role === 'STATE' && r.timeOfDay === scene?.timeOfDay) ?? loc.refs.find((r) => r.role === 'MASTER')) : undefined;
  const plate = read?.location?.assetId && read.location.locationId === loc?.id ? { assetId: read.location.assetId, why: read.location.why } : (own?.assetId ?? loc?.masterAssetId) ? { assetId: (own?.assetId ?? loc?.masterAssetId)!, why: own?.role === 'STATE' ? 'the location’s plate for this time of day (no World Bible read)' : 'the location’s master plate (no World Bible read)' } : undefined;
  const plateAsset = byId(plate?.assetId);
  // the production's cast order is the screen order: the same pair stands the same way round in every shot (D29 —
  // Najm left of Elias in one two-shot, right of him in the next, crossed the line between cuts)
  const order = (id: string) => { const i = p.castIds.indexOf(id); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
  const people = (sh.characterIds.map((id) => cast.find((c) => c.id === id)).filter(Boolean) as Character[]).sort((a, b) => order(a.id) - order(b.id));
  const pictured = people.slice(0, 2).map((c) => ({ c, a: byId(primaryImageOf(c)) })).filter((x) => usableImage(x.a)) as Array<{ c: Character; a: Asset }>;
  const close = !PLATE_WIDE_FRAMINGS.includes(sh.framing) && pictured.length > 0;
  const refs: Asset[] = []; const crops: Array<CropPx | undefined> = []; const notes: string[] = [];
  const shown: number[] = [];
  const imageOf = new Map<string, number>();
  const who = (c: Character) => drawnLineOf(c).replace(/^Identity:\s*/, '').replace(/\.$/, '') || 'described in the action';
  const addPlate = () => {
    if (!usableImage(plateAsset)) return;
    refs.push(plateAsset);
    if (close) { crops.push(plateAsset.width && plateAsset.height ? plateCropFor(sh.framing, { width: plateAsset.width, height: plateAsset.height }) : undefined); notes.push(`image ${refs.length} is the place right behind them (keep its architecture, materials, colours and light, soft in the background; not its framing)`); }
    else { crops.push(undefined); notes.push(PLATE_WIDE_FRAMINGS.includes(sh.framing) ? `image ${refs.length} is the exact place (keep its architecture, layout and props)` : `image ${refs.length} is the place (keep its architecture, materials, colours and light) seen from much further away than this shot: do not copy its framing`); }
  };
  if (!close) addPlate();
  for (const { c, a } of pictured) {
    refs.push(a); shown.push(refs.length); imageOf.set(c.id, refs.length);
    crops.push(close && a.width && a.height ? personCropFor(sh.framing, { width: a.width, height: a.height }) : undefined);
    // the picture gives WHO they are, not how they are now: its smile and pose were copied into a strained, soaked
    // moment (2026-10-08, "The Last Crossing" 1.1–1.2); the expression, pose and condition are the moment's
    notes.push(`${close ? `image ${refs.length} is the person ${who(c)}, framed as this shot frames them` : `image ${refs.length} is the person ${who(c)}`} — keep the face, hair, skin and wardrobe exactly; take the expression, pose and condition from this moment, not from the picture`);
  }
  if (close) addPlate();
  if (!close && people.length === 1 && refs.length < 3) {
    const faceCrop = byId(people[0].refs.find((r) => r.role === 'FACE')?.assetId);
    if (usableImage(faceCrop) && !refs.includes(faceCrop)) { refs.push(faceCrop); crops.push(undefined); notes.push(`image ${refs.length} is the same person's face, close up`); }
  }
  // how many people the picture holds: shot 2.3 of "The Static Sky" came back with two strangers beside the pair (D30)
  if (shown.length === 2) notes.push(`exactly two people are in the picture: the person of image ${shown[0]} on the left and the person of image ${shown[1]} on the right, and nobody else`);
  else if (shown.length === 1 && people.length === 1) notes.push(`exactly one person is in the picture, the person of image ${shown[0]}, and nobody else`);
  return { refs, crops, notes, people, imageOf, plate: usableImage(plateAsset) ? plate : undefined, composition: close ? 'PEOPLE' : 'PLATE' };
}

/** The production's World Bible revision (pinned, else the latest) laid over the studio for this shot — the plate
 *  and the pinned canonical images a take of it is filmed against (take.ts reads the same overlay). Without a bible
 *  (the database unreachable) the location's own plates are used, and the event says so. */
async function frameWorld(ctx: HandlerContext, state: State, p: Production, sh: Shot): Promise<{ state: State; read?: WorldRead }> {
  try {
    const view = await worldOfProduction(state, p, { jobId: ctx.job.id });
    return overlayWorld(state, view.revision.bible, p, sh, { id: view.revision.id, number: view.revision.number, pinned: view.pinned });
  } catch (e) {
    await ctx.event('warn', `shot ${sh.number}: the World Bible could not be read (${(e as Error).message}); the location’s own plates are used`, { shotId: sh.id });
    return { state };
  }
}

/** Draws a shot's opening (or ending) frame; an ending frame that still holds the wrong people is not kept (undefined). */
export async function drawShotFrame(ctx: HandlerContext, studio: State, p: Production, sh: Shot, opts: { ending?: boolean } = {}): Promise<string | undefined> {
  const world = await frameWorld(ctx, studio, p, sh);
  const state = world.state;
  const scene = p.scenes.find((sc) => sc.id === sh.sceneId);
  const cast = castOf(state, p);
  const loc = worldOf(state, p).find((l) => l.id === scene?.locationId);
  const { refs, crops, notes, people, imageOf, plate, composition } = frameReferences(state, p, sh, world.read);
  const info = ASPECT_INFO[p.aspect];
  const which = opts.ending ? 'ending' : 'opening';
  const guidance = refs.length ? ` Use the reference pictures: ${notes.join('; ')}.` : '';
  // an editorial CUT is a new angle on the same moment: the frame carries the previous shot's state (positions,
  // screen direction, props, light) as well as this shot's own; a story transition starts fresh
  const { relation, previous } = effectiveRelation(p, sh);
  // people are named by their reference picture once; the previous shot carries only its props and light (D30)
  const own = frameContinuityLine(sh, cast, imageOf);
  const carried = relation === 'CUT' && previous && !opts.ending ? frameContinuityLine(previous, cast, imageOf, { peopleToo: false }) : '';
  const prompt = framePrompt(p, sh, cast, loc, scene, { pictured: new Set(imageOf.keys()) }) + (opts.ending ? ' Show the end of the action.' : '') + (own ? ` Continuity: ${own}` : '') + (carried ? ` The same moment as the previous shot, seen from a new angle; it showed: ${carried}` : '') + guidance;
  const label = `${p.title} — shot ${scene?.number ?? '?'}.${sh.number} ${which} frame`;
  // D30: the prompt alone did not hold the number of people (two strangers in 2 of 10 frames); the vision model
  // counted 10/10 frames right, the portrait on the wall excluded — so the frame is counted and drawn once more
  const expected = peopleExpected(sh, people);
  // ONE REQUEST, ONE FRAME (the first-attempt rule, docs/MASTER-PRODUCTION-PLAN.md): the frame is drawn once and its
  // people counted; a wrong count is recorded on the frame and refused by the preflight until the producer redraws it
  // — it is never drawn again silently (it was, once, until 2026-10-08)
  let counted: number | undefined;
  let kept: Drawn | undefined = await draw(ctx, { key: `frame:${sh.id}:${which}:0`, prompt, negative: NEG, references: refs, crops, width: info.width, height: info.height, label, tags: ['frame', which], provenance: { productionId: p.id, shotId: sh.id, frame: which, people: people.slice(0, 2).map((c) => c.id), composition, crops, creativeAttempt: 1, ...(plate ? { plate: plate.assetId, plateWhy: plate.why } : {}), ...(world.read ? { worldRevision: world.read.revisionNumber, worldPinned: world.read.pinned, worldConflicts: world.read.conflicts } : {}) } });
  if (expected !== undefined) counted = await countPeople(ctx, kept.id, label);
  await ctx.checkpoint();
  const wrong = expected !== undefined && counted !== undefined && counted !== expected;
  // THE COUNT IS KEPT ON THE FRAME (acceptance 2026-10-05, open item 5: a frame that failed the people count was kept
  // and the warning lived only in the job log): the shot page shows it beside the frame, and the preflight refuses to
  // film from an opening frame that holds the wrong people until it is redrawn or removed
  if (kept && expected !== undefined && counted !== undefined) {
    const a = (await readState({ shared: true })).state.assets.find((x) => x.id === kept!.id);
    await command('updateAsset', [kept.id, { provenance: { ...(a?.provenance ?? {}), peopleCheck: { expected, counted, ok: !wrong, at: new Date().toISOString() } } }], 'worker');
  }
  // an ending frame is optional and a take is guided towards it: a wrong one is left out rather than filmed towards
  if (wrong && opts.ending) {
    await ctx.event('warn', `shot ${scene?.number ?? '?'}.${sh.number}: the ending frame still holds ${counted} people where the shot has ${expected} (${kept!.id}); the shot keeps no ending frame`, { shotId: sh.id, assetId: kept!.id, expected, counted });
    await command('setShotFrames', [p.id, sh.id, { endingFrameAssetId: null }], 'worker');
    return undefined;
  }
  if (wrong) await ctx.event('warn', `shot ${scene?.number ?? '?'}.${sh.number}: the ${which} frame (${kept!.id}) holds ${counted} people where the shot has ${expected} — redraw it before filming`, { shotId: sh.id, assetId: kept!.id, expected, counted });
  // A ONE-PERSON CLOSE SHOT IS CUT TO ITS FRAMING (acceptance 2026-10-06, Tea 1.3): composed from the person, the edit
  // model still draws about a medium shot; the frame is cropped around the drawn face to the planned framing's extent
  // and scaled back to the take size — or kept as drawn (no face, or the crop would be too soft)
  if (!wrong && composition === 'PEOPLE' && people.length === 1) kept = await framedToShot(ctx, kept!, sh, { width: info.width, height: info.height }, `frame:${sh.id}:${which}:framed`, label);
  await command('setShotFrames', [p.id, sh.id, opts.ending ? { endingFrameAssetId: kept!.id } : { openingFrameAssetId: kept!.id }], 'worker');
  return kept!.id;
}

/** Cut a drawn one-person frame to the shot's framing around its face (MediaPipe face box, `framingCropFromFace`) and
 *  scale it (lanczos) to the take size, as a DERIVED asset that records the crop; the drawn frame is returned unchanged
 *  when no face is found or when the frame is already as close. A crop the framing wants below the quality floor is cut
 *  as close as the floor allows (recorded as clamped), never left at the drawn composition. */
async function framedToShot(ctx: HandlerContext, drawn: Drawn, sh: Shot, size: { width: number; height: number }, key: string, label: string): Promise<Drawn> {
  const reused = await reuseDrawn(ctx, key);
  if (reused) return reused;
  const a = (await readState()).state.assets.find((x) => x.id === drawn.id);
  if (!usableImage(a) || !a.width || !a.height) return drawn;
  const run = await runGraph(ctx, faceCheck({ image: await comfy.uploadInput(assetFile(a)), numFaces: 3 }), { key: `${key}:face`, label: `${label}: finding the face`, tool: 'image.describe_reference' });
  const faces = parseFaceBoxes(comfy.textOutput(run.outputs, FACE_CHECK_OUTPUTS.bboxes));
  const face = faces[0];
  const crop = face ? framingCropFromFace(sh.framing, face, { width: a.width, height: a.height }) : undefined;
  if (!crop) {
    await ctx.event('info', `${label}: kept as drawn (${!face ? 'no face found' : 'the frame is already at its framing'})`, { assetId: drawn.id, face, framing: sh.framing });
    return drawn;
  }
  const dir = await tmpDir('frame');
  try {
    const out = path.join(dir, `${drawn.id}-framed.png`);
    await ffmpeg(['-y', '-v', 'error', '-i', assetFile(a), '-vf', `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${size.width}:${size.height}:flags=lanczos`, '-frames:v', '1', out]);
    const { id, stored } = await jobOutputs(ctx.job).adopt(`image:${key}`, out, { expectKind: 'IMAGE' });
    await command('addAsset', [assetFromStored(id, stored, { label: `${a.label} (cut to ${sh.framing.toLowerCase().replace(/_/g, ' ')})`, tags: [...(a.tags ?? []), 'framed'], origin: 'DERIVED', jobId: ctx.job.id, provenance: { ...(a.provenance ?? {}), from: drawn.id, framingCrop: { framing: sh.framing, crop, face, drawnSize: { width: a.width, height: a.height }, scaledTo: size, filter: 'lanczos' } } })], 'worker');
    await ctx.event(crop.clamped ? 'warn' : 'info', `${label}: cut to the planned ${sh.framing.toLowerCase().replace(/_/g, ' ')} around the face (${crop.width}×${crop.height} of ${a.width}×${a.height}${crop.clamped ? '; as close as the picture allows — the drawn figure was too small for the full framing' : ''}), scaled to ${size.width}×${size.height}`, { assetId: id, from: drawn.id, crop });
    return { ...drawn, id, file: stored.absPath, width: stored.probe?.width, height: stored.probe?.height };
  } finally { await fsp.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

export { peopleExpected };

/** The people physically in a drawn frame (people.ts); undefined when the vision model is not installed. */
async function countPeople(ctx: HandlerContext, assetId: string, label: string): Promise<number | undefined> {
  if (!(await canCountPeople())) return undefined;
  const a = (await readState()).state.assets.find((x) => x.id === assetId);
  if (!usableImage(a)) return undefined;
  return (await countPeopleInFiles(ctx, ctx.tool, 'image.describe_reference', [assetFile(a)], `${label}: counting the people`))[0];
}

export const shotFrames: Handler = async (ctx) => {
  const { productionId, shotId, ending } = ctx.job.payload as { productionId: string; shotId: string; ending?: boolean };
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === productionId);
  const sh = p?.shots.find((x) => x.id === shotId);
  if (!p || !sh) throw new StudioError('NOT_FOUND', 'Shot not found');
  await requireComfy();
  await ctx.progress('GENERATING', { phase: 'drawing', message: `Opening frame for shot ${sh.number}` });
  const opening = await drawShotFrame(ctx, state, p, sh);
  let endingId: string | undefined;
  if (ending) { await ctx.checkpoint(); await ctx.progress('GENERATING', { phase: 'drawing', message: `Ending frame for shot ${sh.number}` }); endingId = await drawShotFrame(ctx, (await readState()).state, p, sh, { ending: true }); }
  // the storyboard handoff: once every shot of the production has its opening frame
  const fresh = (await readState()).state.productions.find((x) => x.id === p.id)!;
  const without = fresh.shots.filter((x) => !x.openingFrameAssetId).length;
  const scene = fresh.scenes.find((sc) => sc.id === sh.sceneId);
  await ctx.activity('FRAME_DRAWN', `Shot ${scene?.number ?? '?'}.${sh.number} of “${p.title}”: opening frame drawn${endingId ? ' with its ending frame' : ''}`, { shotId: sh.id, assetId: opening });
  if (without === 0) await recordHandoff({ productionId: p.id, stage: 'STORYBOARD', producerDepartment: 'PREPRODUCTION', receiverDepartment: 'VIDEO', artifactIds: fresh.shots.map((x) => x.openingFrameAssetId!).filter(Boolean), outputVersions: { shots: fresh.shots.length }, validation: { ok: true, checks: [{ name: 'every-shot-has-opening-frame', ok: true, detail: `${fresh.shots.length} shots` }] }, jobId: ctx.job.id });
  return { openingFrameAssetId: opening, endingFrameAssetId: endingId };
};
