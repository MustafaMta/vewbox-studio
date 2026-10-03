import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Handler, HandlerContext } from './index';
import { step } from './step';
import { StudioError, missingReference } from '@/domain/errors';
import { nid } from '@/domain/ids';
import type { Asset, Character, CharacterRef, Location, LocationRef, PendingReference, Production, Shot } from '@/domain/types';
import type { CharacterRefRole, TimeOfDay } from '@/domain/vocabulary';
import { ASPECT_INFO } from '@/domain/vocabulary';
import { command, readState } from '@/server/studio/engine';
import { castOf, worldOf } from '@/studio/selectors';
import { adoptFile, assetFromStored, ffprobe, fileFor } from '@/server/media';
import { tmpDir } from '@/server/media/ffmpeg';
import { grayPixels, validateReferenceImage, type ReferenceValidation } from '@/server/media/image-check';
import { fullBodyInFrame, type FramingCheck } from '@/server/media/figure-check';
import * as comfy from '@/server/providers/comfy';
import {
  CANONICAL_OUTPUT, MODELS, REFERENCE_DESCRIBE_KEY, REFERENCE_FACE_OUTPUTS, SHEET_OUTPUTS, SHEET_TILES, VIEW_SEED_OFFSET,
  canonicalIdentityLine, canonicalPrompt, faceCropRect, hasNonLatinLetters, identityLine as buildIdentityLine, identityLineFromDescription, identitySeedFor,
  negativeFor, parseCharacterDescription, parseFaceBoxes, qwenCanonicalImage, qwenEdit, qwenIdentitySheet, qwenReferenceCanonical, qwenTextToImage,
  qwenView, referenceCanonicalPrompt, referenceReadGraph, sheetPrompt, viewPrompt, vlmOutput, type CharacterDescription, type PxRect, type ViewRole,
} from '@/server/workflows';
import { continuityLine, framePrompt, locationPrompt } from '@/server/story/prompts';
import { effectiveRelation } from '@/server/production/shot-pack';
import { LOOK_FIELDS, type LookField } from '@/server/story/schemas';
import { styleDirection } from '@/server/story/style';
import { canChangeAppearance } from '@/domain/rules';
import { primaryImageOf } from '@/domain/identity';
import { recordMetric } from '@/server/jobs/queue';
import { recordHandoff } from '@/server/org/runs';

/** PICTURES — the canonical character image, optional secondary character material, location plates and views,
 *  storyboard frames. All drawn by Qwen-Image (text to image) and Qwen-Image-Edit (multi-reference editing) in ComfyUI
 *  on the local GPU, under the GPU lease. Every picture becomes a library asset with its prompt, references, seed and
 *  workflow version.
 *
 *  Character identity (docs/CONTRACTS-IDENTITY-PACK.md v2): one character = ONE canonical front full-body image,
 *  drawn by CHARACTER_APPEARANCE — from the English identity line (style first; Qwen-Image-2512 in quality mode), or
 *  from the producer's uploaded picture, which is read first (MediaPipe face box, a Qwen3.5-4B description that writes
 *  the identity line) and redrawn into the production's style (Qwen-Image-Edit-2511). A picture whose figure is not
 *  whole in the frame is redrawn once (the first becomes RAW), then left for the producer with the reason. The image is
 *  a DRAFT until the producer approves it; it is the primary image everywhere, including the reference of every shot.
 *  Evidence and the A/B behind every choice: docs/evidence/image-v2/REPORT.md. */

const IMAGE_VRAM_MB = 24000;
const assetFile = (a: Asset) => fileFor({ storage: a.sample ? 'PUBLIC' : 'LIBRARY', path: a.sample ? a.src.replace(/^\/+/, '') : String(a.provenance?.path ?? '') });
// bundled sample pictures are placeholders for the UI, never references for generation
const usable = (a?: Asset) => Boolean(a && a.kind === 'IMAGE' && !a.sample && a.mimeType !== 'image/svg+xml');

/** The pure identity helpers, exported here for the handlers' callers and tests (they live in workflows/identity). */
export { buildIdentityLine as identityLine, identitySeedFor };

async function requireComfy() {
  const h = await comfy.health();
  if (!h.ok) throw new StudioError('UNAVAILABLE', 'The image engine (ComfyUI) is not reachable. Start the comfyui service.');
  const { missing } = await comfy.hasNodes(['TextEncodeQwenImageEditPlus', 'UNETLoader', 'ModelSamplingAuraFlow', 'ImageCrop', 'ImageScale']);
  if (missing.length) throw new StudioError('NOT_CONFIGURED', `ComfyUI is missing nodes: ${missing.join(', ')}`);
  const models = await comfy.listModels('diffusion_models').catch(() => [] as string[]);
  if (!models.some((m) => m.includes('qwen_image'))) throw new StudioError('NOT_CONFIGURED', 'Qwen-Image weights are not downloaded yet (see docker/models).');
}

/** Is the fal Multiple-Angles LoRA visible to ComfyUI? (Optional: the views are drawn with prose otherwise.) */
async function hasAngleLora(): Promise<boolean> {
  const loras = await comfy.listModels('loras').catch(() => [] as string[]);
  return loras.includes(MODELS.qwenMultiAngleLora);
}

interface Drawn { id: string; file: string; prompt: string; references: string[]; workflowVersion: string; ms: number; width?: number; height?: number }

type ImageTool = 'image.generate' | 'image.edit_with_references' | 'image.describe_reference';

/** Run one graph under the GPU lease as a recorded tool call. */
async function runGraph(ctx: HandlerContext, graph: Record<string, unknown>, opts: { label: string; tool: ImageTool }): Promise<comfy.ComfyRunResult> {
  return ctx.gpu('IMAGE', IMAGE_VRAM_MB, () => ctx.tool(opts.tool, () => comfy.run(graph, { timeoutMs: 20 * 60_000, shouldStop: async () => { try { await ctx.checkpoint(); return false; } catch { return true; } }, onProgress: (p) => ctx.progress('GENERATING', { phase: 'drawing', message: p.queue ? `waiting behind ${p.queue} in the GPU queue` : opts.label, percent: null }) }), { label: opts.label, input: { graph, label: opts.label } }), { jobId: ctx.job.id });
}

/** Fetch one ComfyUI output file into a temporary folder (the caller removes `dir`). */
async function fetchOutput(out: comfy.ComfyOutputFile): Promise<{ dir: string; file: string }> {
  const dir = await tmpDir('img');
  const file = path.join(dir, out.filename);
  await fsp.writeFile(file, await comfy.view(out));
  return { dir, file };
}

type AdoptOptions = { label: string; tags: string[]; prompt: string; negative?: string; references: string[]; seed?: number; model: string; loras?: string[]; provenance?: Record<string, unknown>; ms: number; tier?: 'SECONDARY' | 'RAW' };

/** Bring a fetched output into the library as an asset with its provenance (and its tier when it is not canonical). */
async function adoptFetched(ctx: HandlerContext, tmp: string, run: comfy.ComfyRunResult, opts: AdoptOptions): Promise<Drawn> {
  const id = nid('gen');
  const stored = await adoptFile(id, tmp, { expectKind: 'IMAGE' });
  const provenance = { provider: 'COMFYUI', model: opts.model, loras: opts.loras ?? [], prompt: opts.prompt, negative: opts.negative, references: opts.references, seed: opts.seed, workflowVersion: run.workflowVersion, promptId: run.promptId, engineMs: run.engineMs, ...(opts.provenance ?? {}) };
  await command('addAsset', [assetFromStored(id, stored, { label: opts.label, tags: opts.tags, origin: 'GENERATED', jobId: ctx.job.id, provenance, ...(opts.tier ? { tier: opts.tier } : {}) })], 'worker');
  return { id, file: stored.absPath, prompt: opts.prompt, references: opts.references, workflowVersion: run.workflowVersion, ms: opts.ms, width: stored.probe?.width, height: stored.probe?.height };
}

/** Bring one ComfyUI output file into the library as an asset with its provenance. */
async function adoptOutput(ctx: HandlerContext, out: comfy.ComfyOutputFile, run: comfy.ComfyRunResult, opts: AdoptOptions): Promise<Drawn> {
  const { dir, file } = await fetchOutput(out);
  try { return await adoptFetched(ctx, file, run, opts); } finally { await fsp.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

/** Run one image workflow (text to image, or an edit from up to three references) and bring the result into the
 *  library as an asset. */
async function draw(ctx: HandlerContext, opts: { prompt: string; negative?: string; references?: Asset[]; width: number; height: number; label: string; tags: string[]; seed?: number; quality?: boolean; provenance?: Record<string, unknown> }): Promise<Drawn> {
  const refs = (opts.references ?? []).filter(usable).slice(0, 3);
  const graph = refs.length
    ? qwenEdit({ prompt: opts.prompt, negative: opts.negative, references: await Promise.all(refs.map((a) => comfy.uploadInput(assetFile(a)))), width: opts.width, height: opts.height, seed: opts.seed, quality: opts.quality })
    : qwenTextToImage({ prompt: opts.prompt, negative: opts.negative, width: opts.width, height: opts.height, seed: opts.seed });
  const t0 = Date.now();
  const run = await runGraph(ctx, graph, { label: opts.label, tool: refs.length ? 'image.edit_with_references' : 'image.generate' });
  const out = comfy.firstOutput(run.outputs, 'images');
  if (!out) throw new StudioError('PROVIDER', 'ComfyUI returned no image.');
  const model = refs.length ? 'Qwen-Image-Edit-2511' : 'Qwen-Image-2512';
  const loras = refs.length ? (opts.quality ? [] : [MODELS.qwenEditLightning]) : [MODELS.qwenLightning];
  const d = await adoptOutput(ctx, out, run, { label: opts.label, tags: opts.tags, prompt: opts.prompt, negative: opts.negative, references: refs.map((r) => r.id), seed: opts.seed, model, loras, provenance: opts.provenance, ms: Date.now() - t0 });
  await recordMetric('image.generation_ms', d.ms, 'ms', { model, refs: refs.length }, ctx.job.id);
  return d;
}

const NEG = 'text, watermark, logo, signature, blurry, deformed hands, extra fingers, extra limbs, duplicate person, cropped head';

// ------------------------------------------------------------------------------------------- character appearance

const identityLineOf = (c: Character) => buildIdentityLine(c);
const identitySeedOf = (c: Character) => identitySeedFor(c);
const roleLabel = (r: string) => r.toLowerCase().replace(/_/g, ' ');
/** The identity line a character is drawn and described with: its canonical image's, else the derived one. */
const drawnLineOf = (c: Character) => c.canonicalImage?.identityLine || identityLineOf(c);

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
  if (!usable(pending)) throw missingReference(`${c.name}: the reference picture is missing or is not a usable image; upload a clear picture of the face.`, { characterId: c.id, assetId: c.pendingReference.assetId });
  const stored = (c.pendingReference as PendingReference & { validation?: ReferenceValidation }).validation;
  const v = stored ?? await validateReferenceImage(assetFile(pending!));
  if (!v.ok) throw missingReference(`${c.name}: the reference picture cannot be used — ${v.reasons.join('; ')}.`, { characterId: c.id, assetId: pending!.id, validation: v });
  return v;
}

interface ReferenceRead { upload: string; faceRect?: PxRect; faces: number; description?: CharacterDescription; notes: string[]; describedBy?: string }

/** Read the producer's picture in ComfyUI before drawing from it: the face box (one face → a chin-safe crop given to
 *  the redraw as image 2) and, when Qwen3.5-4B is installed, the description the identity line is written from. */
async function readReference(ctx: HandlerContext, c: Character, pending: Asset): Promise<ReferenceRead> {
  const file = assetFile(pending);
  const upload = await comfy.uploadInput(file);
  const describe = (await comfy.listModels('text_encoders').catch(() => [] as string[])).includes(MODELS.vlm);
  const run = await runGraph(ctx, referenceReadGraph({ image: upload, describe }), { label: `${c.name} — reading the reference picture`, tool: 'image.describe_reference' });
  const notes: string[] = [];
  const boxes = parseFaceBoxes(comfy.textOutput(run.outputs, REFERENCE_FACE_OUTPUTS.bboxes));
  let faceRect: PxRect | undefined;
  if (boxes.length === 1) {
    const p = await ffprobe(file);
    const size = { width: Number(p.width) || pending.width || 0, height: Number(p.height) || pending.height || 0 };
    if (size.width && size.height) faceRect = faceCropRect(boxes[0], size);
  } else notes.push(boxes.length ? `${boxes.length} faces found: the redraw gets no separate face crop` : 'no face found by the detector: the redraw gets no separate face crop');
  let description: CharacterDescription | undefined;
  if (!describe) notes.push('the vision model (Qwen3.5-4B) is not installed: the look is taken from the picture alone');
  else {
    const text = comfy.textOutput(run.outputs, vlmOutput(REFERENCE_DESCRIBE_KEY)) ?? '';
    try { description = parseCharacterDescription(text); } catch (e) { notes.push(`the description could not be read (${(e as Error).message}): the look is taken from the picture alone`); }
  }
  return { upload, faceRect, faces: boxes.length, description, notes, describedBy: description ? 'Qwen3.5-4B' : undefined };
}

const CANONICAL_ENGINE = { DESCRIPTION: 'Qwen-Image-2512 (30 steps, cfg 4)', REFERENCE: 'Qwen-Image-Edit-2511 (24 steps, cfg 4)' } as const;
const FRAMING_OK = 'full body in frame: head and feet inside the picture with margin';

/** The framing check of a drawn picture: the whole figure, head to feet, with margin (src/server/media/figure-check.ts;
 *  in the A/B it passed all 36 canonical pictures and failed all 12 deliberately cropped ones). */
async function framingOf(file: string): Promise<FramingCheck> { return fullBodyInFrame(await grayPixels(file, 640)); }

export const characterAppearance: Handler = async (ctx) => {
  const { characterId } = ctx.job.payload as { characterId: string };
  const { state } = await readState();
  const c = state.characters.find((x) => x.id === characterId);
  if (!c) throw new StudioError('NOT_FOUND', 'Character not found');
  if (!canChangeAppearance(c)) throw new StudioError('APPEARANCE_LOCKED', `${c.name} has been used in a video; the appearance is preserved for continuity.`);
  const pending = c.pendingReference ? state.assets.find((a) => a.id === c.pendingReference!.assetId) : undefined;
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
  const look = read ? referenceLook(c, read.description) : { ...textLook(c), from: 'DESCRIPTION' as const, lowConfidence: [] as string[], notVisible: [] as string[] };
  if (!read && look.nonLatin.length && !/;/.test(look.line)) throw new StudioError('INVALID', `${c.name}: the look is written only in a script the image model does not read (${look.nonLatin.slice(0, 3).join('; ')}); write the appearance in English, or describe the character so it is designed.`, { characterId: c.id, nonLatin: look.nonLatin, failureClass: 'INVALID_INPUT' });
  const notes = [...(read?.notes ?? []), ...(look.nonLatin.length ? [`left out of the prompt (not in English): ${look.nonLatin.slice(0, 4).join('; ')}`] : []), ...(look.lowConfidence.length ? [`not used (the description was unsure): ${look.lowConfidence.join(', ')}`] : [])];
  if (notes.length) await ctx.event('warn', `${c.name}: ${notes.join(' — ')}`, { characterId: c.id, notes });
  const engine = read ? CANONICAL_ENGINE.REFERENCE : CANONICAL_ENGINE.DESCRIPTION;
  const model = read ? 'Qwen-Image-Edit-2511' : 'Qwen-Image-2512';
  const references = pending ? [pending.id] : [];

  // draw; a picture whose figure is not whole in the frame is redrawn once (it stays in the library as RAW). From a
  // picture the redraw leaves the face crop out: with it the model drew a three-quarter-length shot in 1 of 3 A/B
  // runs, without it 3 of 3 were whole figures (REPORT §4)
  const rejected: Array<{ assetId: string; seed: number; reasons: string[] }> = [];
  let drawn: Drawn | undefined; let usedSeed = seed; let framing: FramingCheck | undefined;
  for (let attempt = 0; attempt < 2 && !drawn; attempt++) {
    usedSeed = (seed + attempt) % 2 ** 31;
    const faceRect = attempt === 0 ? read?.faceRect : undefined;
    const prompt = read
      ? referenceCanonicalPrompt({ style, identityLine: look.line, faceImage: Boolean(faceRect), character: d.character, visual: d.visual })
      : canonicalPrompt({ style, identityLine: look.line, character: d.character, visual: d.visual, avoid: d.avoid });
    const graph = read ? qwenReferenceCanonical({ upload: read.upload, faceRect, prompt, negative, seed: usedSeed }) : qwenCanonicalImage({ prompt, negative, seed: usedSeed });
    await ctx.progress('GENERATING', { phase: 'drawing', message: attempt ? `Drawing ${c.name} again (the first picture was not whole in the frame)` : `Drawing ${c.name}`, percent: null });
    const t0 = Date.now();
    const run = await runGraph(ctx, graph, { label: `${c.name} — canonical image`, tool: read ? 'image.edit_with_references' : 'image.generate' });
    const out = run.outputs[CANONICAL_OUTPUT]?.images?.[0];
    if (!out) throw new StudioError('PROVIDER', 'ComfyUI returned no image.');
    const tmp = await fetchOutput(out);
    try {
      framing = await framingOf(tmp.file);
      const keep = framing.ok || attempt === 1;
      const a = await adoptFetched(ctx, tmp.file, run, { label: `${c.name} — ${keep ? 'canonical image' : 'rejected draft'}`, tags: ['character', keep ? 'canonical' : 'rejected'], prompt, negative, references, seed: usedSeed, model, loras: [], ms: Date.now() - t0, ...(keep ? {} : { tier: 'RAW' as const }), provenance: { characterId: c.id, view: 'CANONICAL', identityLine: look.line, identitySeed: seed, lookFrom: pending ? 'REFERENCE' : 'DESCRIPTION', framing: { ok: framing.ok, reasons: framing.reasons, box: framing.box }, ...(pending ? { referenceAssetId: pending.id, faceBox: read?.faceRect, faceCropGiven: Boolean(faceRect), faces: read?.faces, description: read?.description, describedBy: read?.describedBy } : {}), ...(validation ? { referenceValidation: validation } : {}) } });
      await recordMetric('image.generation_ms', a.ms, 'ms', { model, refs: references.length, canonical: 1 }, ctx.job.id);
      if (keep) drawn = a;
      else {
        rejected.push({ assetId: a.id, seed: usedSeed, reasons: framing.reasons });
        await ctx.event('warn', `${c.name}: the first picture (${a.id}) was not whole in the frame — ${framing.reasons.join('; ')}; drawing once more`, { characterId: c.id, assetId: a.id, reasons: framing.reasons });
      }
    } finally { await fsp.rm(tmp.dir, { recursive: true, force: true }).catch(() => {}); }
    await ctx.checkpoint();
  }
  const check = { ok: framing!.ok, notes: [framing!.ok ? FRAMING_OK : `full body not in frame: ${framing!.reasons.join('; ')}`, ...rejected.map((r) => `redrawn once: the first picture (${r.assetId}) — ${r.reasons.join('; ')}`), ...notes] };
  await command('setCanonicalImage', [c.id, { assetId: drawn!.id, jobId: ctx.job.id, seed: usedSeed, referenceAssetId: pending?.id, engine, identityLine: look.line, check }], 'worker');
  const fresh = (await readState()).state.characters.find((x) => x.id === c.id);
  const from = pending ? `from the producer’s reference picture (${pending.id})${read?.description ? ', its look described by Qwen3.5-4B' : ''}` : 'from the description';
  await ctx.activity('CHARACTER_DRAWN', `${c.name}: canonical image drawn ${from}, seed ${usedSeed}; ${framing!.ok ? 'whole figure in frame' : `FRAMING CHECK FAILED (${framing!.reasons.join('; ')})`}${rejected.length ? ', after one redraw' : ''} — awaiting your approval`, { characterId: c.id, assetId: drawn!.id, ms: drawn!.ms, references, seed: usedSeed, identityLine: look.line, check, rejected });
  return { canonicalAssetId: drawn!.id, version: fresh?.canonicalImage?.version, status: fresh?.canonicalImage?.status ?? 'DRAFT', ms: drawn!.ms, workflowVersion: drawn!.workflowVersion, seed: usedSeed, identityLine: look.line, lookFrom: pending ? 'REFERENCE' : 'DESCRIPTION', engine, check, rejected, message: `${c.name}: canonical image drawn — awaiting your approval` };
};

/** The default pack: the four sheet tiles, then the derived views. FACE is the sheet's face crop. */
const REF_VIEWS: CharacterRefRole[] = ['FRONT', 'THREE_QUARTER', 'SIDE', 'BACK', 'FULL_BODY', 'EXPRESSION'];
const isTile = (r: string): r is (typeof SHEET_TILES)[number] => (SHEET_TILES as readonly string[]).includes(r);

export const characterRefs: Handler = async (ctx) => {
  const { characterId, roles } = ctx.job.payload as { characterId: string; roles?: CharacterRefRole[] };
  const { state } = await readState();
  const c = state.characters.find((x) => x.id === characterId);
  if (!c) throw new StudioError('NOT_FOUND', 'Character not found');
  if (!canChangeAppearance(c)) throw new StudioError('APPEARANCE_LOCKED', `${c.name} has been used in a video; the appearance is preserved for continuity.`);
  // SECONDARY material (contract v2): drawn on request from the character's primary image (the canonical image, else
  // a legacy portrait); never part of creation, never the identity
  const portrait = state.assets.find((a) => a.id === primaryImageOf(c));
  if (!usable(portrait)) throw new StudioError('INVALID', 'Draw the character’s image first; secondary material is made from it.');
  await requireComfy();
  const byId = (id?: string) => (id ? state.assets.find((a) => a.id === id) : undefined);
  const wanted = (roles?.length ? roles : REF_VIEWS).filter((r) => r !== 'FACE');
  const partial = Boolean(roles?.length);
  const line = drawnLineOf(c);
  const seed = identitySeedOf(c);
  const direction = styleDirection(c.style);
  const angleLora = await hasAngleLora();
  // a partial redraw of derived views can reuse the existing sheet, face crop and FRONT tile when all three exist
  const prevFront = c.refs.find((r) => r.role === 'FRONT'); const prevFace = c.refs.find((r) => r.role === 'FACE');
  let front = byId(prevFront?.assetId), face = byId(prevFace?.assetId), sheet = byId(prevFront?.references?.[0]);
  const needSheet = !partial || wanted.some(isTile) || !usable(front) || !usable(face) || !usable(sheet);
  const derived = wanted.filter((r) => !isTile(r)) as ViewRole[];
  const total = (needSheet ? 1 : 0) + derived.length;
  const refs: CharacterRef[] = [];
  const loras = (quality: boolean, angle: boolean) => [...(quality ? [] : [MODELS.qwenEditLightning]), ...(angle ? [MODELS.qwenMultiAngleLora] : [])];
  let step = 0;

  if (needSheet) {
    step++;
    await ctx.progress('GENERATING', { phase: 'drawing', message: `${c.name}: identity sheet (front, three-quarter, side, back in one pass)`, step, total });
    const prompt = sheetPrompt({ identityLine: line, direction: `${direction.visual}. ${direction.avoid}` });
    const graph = qwenIdentitySheet({ portrait: await comfy.uploadInput(assetFile(portrait!)), prompt, negative: NEG, seed, quality: true });
    const t0 = Date.now();
    const run = await runGraph(ctx, graph, { label: `${c.name} — identity sheet`, tool: 'image.edit_with_references' });
    const outOf = (node: string) => { const o = run.outputs[node]?.images?.[0]; if (!o) throw new StudioError('PROVIDER', `ComfyUI returned no image for ${node}.`); return o; };
    const ms = Date.now() - t0;
    await recordMetric('image.generation_ms', ms, 'ms', { model: 'Qwen-Image-Edit-2511', refs: 2, quality: 1, sheet: 1 }, ctx.job.id);
    const base = { prompt, negative: NEG, seed, model: 'Qwen-Image-Edit-2511', ms, tier: 'SECONDARY' as const };
    const sheetDrawn = await adoptOutput(ctx, outOf(SHEET_OUTPUTS.sheet), run, { ...base, label: `${c.name} — identity sheet`, tags: ['character', 'sheet'], references: [portrait!.id], loras: loras(true, false), provenance: { characterId: c.id, view: 'SHEET', identityLine: line, identitySeed: seed, quality: true } });
    const faceDrawn = await adoptOutput(ctx, outOf(SHEET_OUTPUTS.face), run, { ...base, label: `${c.name} — face crop`, tags: ['character', 'reference', 'face'], references: [portrait!.id], loras: [], provenance: { characterId: c.id, view: 'FACE', cutFrom: portrait!.id, identityLine: line, identitySeed: seed } });
    refs.push({ id: `ref-${faceDrawn.id}`, role: 'FACE', assetId: faceDrawn.id, view: 'FACE', references: [portrait!.id], seed });
    const tiles: string[] = [];
    for (const role of SHEET_TILES) {
      const tile = await adoptOutput(ctx, outOf(SHEET_OUTPUTS[role]), run, { ...base, label: `${c.name} — ${roleLabel(role)}`, tags: ['character', 'reference'], references: [sheetDrawn.id], loras: loras(true, false), provenance: { characterId: c.id, view: 'SHEET_TILE', role, cutFrom: sheetDrawn.id, identityLine: line, identitySeed: seed } });
      refs.push({ id: `ref-${tile.id}`, role, assetId: tile.id, view: 'SHEET_TILE', references: [sheetDrawn.id, portrait!.id, faceDrawn.id], seed });
      tiles.push(tile.id);
    }
    const fresh = (await readState()).state.assets;
    sheet = fresh.find((a) => a.id === sheetDrawn.id); face = fresh.find((a) => a.id === faceDrawn.id); front = fresh.find((a) => a.id === tiles[0]);
    await ctx.activity('CHARACTER_SHEET', `${c.name}: identity sheet drawn in one quality pass from the character's image (${portrait!.id}) and its face crop (${faceDrawn.id}), seed ${seed}; cut into front, three-quarter, side and back tiles`, { characterId: c.id, sheetAssetId: sheetDrawn.id, faceAssetId: faceDrawn.id, tiles, references: [portrait!.id, faceDrawn.id], seed, ms, engineMs: run.engineMs });
    await ctx.checkpoint();
  }

  if (derived.length) {
    if (!usable(front) || !usable(face) || !usable(sheet)) throw new StudioError('PROVIDER', 'The identity sheet did not produce the FRONT tile, face crop and sheet needed for the derived views.');
    const references = [front!, face!, sheet!];
    const uploaded = await Promise.all(references.map((a) => comfy.uploadInput(assetFile(a))));
    for (const role of derived) {
      step++;
      await ctx.progress('GENERATING', { phase: 'drawing', message: `${c.name}: ${roleLabel(role)} view from the front tile, face crop and sheet`, step, total });
      const prev = c.refs.find((r) => r.role === role);
      // a redraw of one view bumps its previous seed; a fresh pack uses the identity seed plus the view's offset
      const viewSeed = partial && typeof prev?.seed === 'number' ? prev.seed + 1 : seed + VIEW_SEED_OFFSET[role];
      const prompt = viewPrompt({ view: role, identityLine: line, direction: `${direction.visual}. ${direction.avoid}`, angleLora });
      const graph = qwenView({ references: uploaded, view: role, prompt, negative: NEG, seed: viewSeed, angleLora });
      const t0 = Date.now();
      const run = await runGraph(ctx, graph, { label: `${c.name} — ${roleLabel(role)}`, tool: 'image.edit_with_references' });
      const out = comfy.firstOutput(run.outputs, 'images');
      if (!out) throw new StudioError('PROVIDER', 'ComfyUI returned no image.');
      const ms = Date.now() - t0;
      await recordMetric('image.generation_ms', ms, 'ms', { model: 'Qwen-Image-Edit-2511', refs: 3, angleLora: angleLora ? 1 : 0 }, ctx.job.id);
      const d = await adoptOutput(ctx, out, run, { label: `${c.name} — ${roleLabel(role)}`, tags: ['character', 'reference'], prompt, negative: NEG, references: references.map((a) => a.id), seed: viewSeed, model: 'Qwen-Image-Edit-2511', loras: loras(false, angleLora), provenance: { characterId: c.id, view: role, identityLine: line, identitySeed: seed, angleLora }, ms, tier: 'SECONDARY' });
      refs.push({ id: `ref-${d.id}`, role, assetId: d.id, view: role, references: references.map((a) => a.id), seed: viewSeed });
      await ctx.activity('CHARACTER_SHEET', `${c.name}: ${roleLabel(role)} drawn from the front tile (${front!.id}), face crop (${face!.id}) and sheet (${sheet!.id}), seed ${viewSeed}${angleLora ? ', Multiple-Angles LoRA' : ''}`, { characterId: c.id, assetId: d.id, view: role, references: references.map((a) => a.id), seed: viewSeed, angleLora, ms, engineMs: run.engineMs });
      await ctx.checkpoint();
    }
  }

  // a full pack replaces the refs list (the previous tiles and views stay in the library as assets); a partial
  // redraw replaces only the roles drawn
  if (partial) await command('addCharacterRefs', [c.id, refs], 'worker');
  else await command('updateCharacter', [c.id, { refs }], 'worker');
  // secondary material handed on with the character's primary image to every production the character is in
  const fresh = (await readState()).state.characters.find((x) => x.id === c.id)!;
  const got = new Set(fresh.refs.map((r) => r.role));
  const missing = wanted.filter((v) => !got.has(v));
  const sheetId = fresh.refs.find((r) => r.role === 'FRONT')?.references?.[0];
  const primary = primaryImageOf(fresh);
  for (const p of (await readState()).state.productions.filter((x) => x.castIds.includes(c.id))) {
    await recordHandoff({ productionId: p.id, stage: 'CAST_WORLD', producerDepartment: 'CASTING', receiverDepartment: 'PREPRODUCTION', artifactIds: [...(primary ? [primary] : []), ...(sheetId ? [sheetId] : []), ...refs.map((r) => r.assetId)], outputVersions: { character: c.id, refs: fresh.refs.length, identitySeed: seed, model: 'Qwen-Image-Edit-2511', loras: loras(false, angleLora).join(',') }, validation: { ok: missing.length === 0, checks: [{ name: 'primary-image-present', ok: Boolean(primary) }, { name: 'identity-sheet-present', ok: Boolean(sheetId), detail: sheetId }, { name: 'reference-views-complete', ok: missing.length === 0, detail: missing.length ? `missing ${missing.join(', ')}` : `${wanted.length} views` }, { name: 'references-recorded', ok: refs.every((r) => Array.isArray(r.references) && typeof r.seed === 'number'), detail: `identity line: ${line.slice(0, 120)}` }] }, jobId: ctx.job.id });
  }
  return { refs: refs.length, sheetAssetId: sheetId, identitySeed: seed, angleLora };
};

// ---------------------------------------------------------------------------------------------------- locations

export const locationPlates: Handler = async (ctx) => {
  const { locationId, timesOfDay, force } = ctx.job.payload as { locationId: string; timesOfDay?: TimeOfDay[]; force?: boolean };
  const { state } = await readState();
  const l = state.locations.find((x) => x.id === locationId);
  if (!l) throw new StudioError('NOT_FOUND', 'Location not found');
  await requireComfy();
  const refs: LocationRef[] = [];
  // a bundled sample plate is a placeholder, not a master to build views from
  const existingMaster = force ? undefined : state.assets.find((a) => a.id === l.masterAssetId && !a.sample);
  let master: Asset | undefined = usable(existingMaster) ? existingMaster : undefined;
  const primaryTod = (timesOfDay?.[0] ?? l.lighting[0] ?? 'MORNING') as TimeOfDay;
  if (!master) {
    await ctx.progress('GENERATING', { phase: 'drawing', message: `${l.name}: master plate`, step: 1, total: 3 + (timesOfDay?.length ?? 1) });
    const m = await draw(ctx, { prompt: locationPrompt(l, 'MASTER', primaryTod), negative: NEG + ', people, person', width: 1344, height: 768, label: `${l.name} — master plate`, tags: ['location', 'master'], provenance: { locationId: l.id, view: 'MASTER', timeOfDay: primaryTod } });
    refs.push({ id: `lref-${m.id}`, role: 'MASTER', assetId: m.id, label: 'Master plate', timeOfDay: primaryTod });
    master = (await readState()).state.assets.find((a) => a.id === m.id);
    await ctx.checkpoint();
  }
  const views: Array<{ note: string; label: string }> = [{ note: 'camera turned to the opposite side of the space, reverse angle', label: 'Reverse angle' }, { note: 'a closer view towards the main landmark', label: 'Towards the landmark' }];
  for (const [i, v] of views.entries()) {
    await ctx.progress('GENERATING', { phase: 'drawing', message: `${l.name}: ${v.label.toLowerCase()}`, step: 2 + i, total: 3 + (timesOfDay?.length ?? 1) });
    const r = await draw(ctx, { prompt: locationPrompt(l, 'VIEW', primaryTod, v.note) + ' Same place as the reference picture: identical architecture, layout, materials and props.', negative: NEG + ', people, person', references: master ? [master] : [], width: 1344, height: 768, label: `${l.name} — ${v.label.toLowerCase()}`, tags: ['location', 'view'], provenance: { locationId: l.id, view: 'VIEW', note: v.note } });
    refs.push({ id: `lref-${r.id}`, role: 'VIEW', assetId: r.id, label: v.label, timeOfDay: primaryTod });
    await ctx.checkpoint();
  }
  const states = (timesOfDay ?? l.lighting).filter((t) => t !== primaryTod).slice(0, 3);
  for (const [i, tod] of states.entries()) {
    await ctx.progress('GENERATING', { phase: 'drawing', message: `${l.name}: ${tod.toLowerCase().replace('_', ' ')}`, step: 4 + i, total: 3 + states.length });
    const r = await draw(ctx, { prompt: locationPrompt(l, 'STATE', tod) + ' Same place and same camera as the reference picture; only the light and time of day change.', negative: NEG + ', people, person', references: master ? [master] : [], width: 1344, height: 768, label: `${l.name} — ${tod.toLowerCase().replace('_', ' ')}`, tags: ['location', 'state'], provenance: { locationId: l.id, view: 'STATE', timeOfDay: tod } });
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

export async function drawShotFrame(ctx: HandlerContext, state: Awaited<ReturnType<typeof readState>>['state'], p: Production, sh: Shot, opts: { ending?: boolean } = {}): Promise<string> {
  const scene = p.scenes.find((sc) => sc.id === sh.sceneId);
  const cast = castOf(state, p); const world = worldOf(state, p);
  const loc = world.find((l) => l.id === scene?.locationId);
  const byId = (id?: string) => (id ? state.assets.find((a) => a.id === id) : undefined);
  // references: the location plate for this time of day (or the master) first, then up to two characters — each by
  // its primary image (the canonical front full-body image, else a legacy portrait); a lone character with a legacy
  // face crop also gets it as the third picture
  const plate = loc ? (loc.refs.find((r) => r.role === 'STATE' && r.timeOfDay === scene?.timeOfDay) ?? loc.refs.find((r) => r.role === 'MASTER')) : undefined;
  const refs: Asset[] = [];
  const notes: string[] = [];
  const plateAsset = byId(plate?.assetId ?? loc?.masterAssetId);
  if (usable(plateAsset)) { refs.push(plateAsset!); notes.push(`image ${refs.length} is the exact place (keep its architecture, layout and props)`); }
  const people = sh.characterIds.map((id) => cast.find((c) => c.id === id)).filter(Boolean) as Character[];
  for (const c of people.slice(0, 2)) {
    const a = byId(primaryImageOf(c));
    if (usable(a)) { refs.push(a!); notes.push(`image ${refs.length} is the person ${drawnLineOf(c).replace(/^Identity:\s*/, '').replace(/\.$/, '') || 'described in the action'} — keep the face, hair, skin and wardrobe exactly`); }
  }
  if (people.length === 1 && refs.length < 3) {
    const faceCrop = byId(people[0].refs.find((r) => r.role === 'FACE')?.assetId);
    if (usable(faceCrop) && !refs.includes(faceCrop!)) { refs.push(faceCrop!); notes.push(`image ${refs.length} is the same person's face, close up`); }
  }
  const info = ASPECT_INFO[p.aspect];
  const which = opts.ending ? 'ending' : 'opening';
  const guidance = refs.length ? ` Use the reference pictures: ${notes.join('; ')}.` : '';
  // an editorial CUT is a new angle on the same moment: the frame carries the previous shot's state (positions,
  // screen direction, props, light) as well as this shot's own; a story transition starts fresh
  const { relation, previous } = effectiveRelation(p, sh);
  const own = continuityLine(sh, cast);
  const carried = relation === 'CUT' && previous && !opts.ending ? continuityLine(previous, cast) : '';
  const prompt = framePrompt(p, sh, cast, loc, scene) + (opts.ending ? ' Show the end of the action.' : '') + (own ? ` Continuity: ${own}` : '') + (carried ? ` The same moment as the previous shot, seen from a new angle; it showed: ${carried}` : '') + guidance;
  const r = await draw(ctx, { prompt, negative: NEG, references: refs, width: info.width, height: info.height, label: `${p.title} — shot ${scene?.number ?? '?'}.${sh.number} ${which} frame`, tags: ['frame', which], provenance: { productionId: p.id, shotId: sh.id, frame: which, people: people.slice(0, 2).map((c) => c.id) } });
  await command('setShotFrames', [p.id, sh.id, opts.ending ? { endingFrameAssetId: r.id } : { openingFrameAssetId: r.id }], 'worker');
  return r.id;
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

export { requireComfy as requireImageEngine, usable as usableImage };
export type { Location };
