import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Handler, HandlerContext } from './index';
import { StudioError, missingReference } from '@/domain/errors';
import { nid } from '@/domain/ids';
import type { Asset, Character, CharacterRef, Location, LocationRef, PendingReference, Production, Shot } from '@/domain/types';
import type { CharacterRefRole, TimeOfDay } from '@/domain/vocabulary';
import { ASPECT_INFO } from '@/domain/vocabulary';
import { command, readState } from '@/server/studio/engine';
import { castOf, worldOf } from '@/studio/selectors';
import { adoptFile, assetFromStored, fileFor } from '@/server/media';
import { tmpDir } from '@/server/media/ffmpeg';
import { validateReferenceImage, type ReferenceValidation } from '@/server/media/image-check';
import * as comfy from '@/server/providers/comfy';
import { MODELS, SHEET_OUTPUTS, SHEET_TILES, VIEW_SEED_OFFSET, identityLine as buildIdentityLine, identitySeedFor, qwenEdit, qwenIdentitySheet, qwenTextToImage, qwenView, sheetPrompt, viewPrompt, type ViewRole } from '@/server/workflows';
import { characterPrompt, framePrompt, locationPrompt } from '@/server/story/prompts';
import { styleDirection } from '@/server/story/style';
import { canChangeAppearance } from '@/domain/rules';
import { enqueue, recordMetric } from '@/server/jobs/queue';
import { recordHandoff } from '@/server/org/runs';

/** PICTURES — character portraits and reference packs, location plates and views, storyboard frames. All drawn by
 *  Qwen-Image (text to image) and Qwen-Image-Edit (multi-reference editing) in ComfyUI on the local GPU, under the
 *  GPU lease. Every picture becomes a library asset with its prompt, references, seed and workflow version.
 *
 *  Character identity (wave 2, docs/research/CHARACTER-IMAGE-STACK.md §4): the portrait is drawn once; one
 *  quality-mode Edit pass then draws front / three-quarter / side / back JOINTLY from the portrait and its face crop
 *  (the identity sheet), the sheet is cut into tiles, and every further view is drawn from the same three references
 *  in a fixed order (FRONT tile, face crop, sheet) with the character's identity line and seed. What was actually
 *  given to the model is recorded on every ref and asset and said in the activity feed. */

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

/** Run one graph under the GPU lease as a recorded tool call. */
async function runGraph(ctx: HandlerContext, graph: Record<string, unknown>, opts: { label: string; tool: 'image.generate' | 'image.edit_with_references' }): Promise<comfy.ComfyRunResult> {
  return ctx.gpu('IMAGE', IMAGE_VRAM_MB, () => ctx.tool(opts.tool, () => comfy.run(graph, { timeoutMs: 20 * 60_000, shouldStop: async () => { try { await ctx.checkpoint(); return false; } catch { return true; } }, onProgress: (p) => ctx.progress('GENERATING', { phase: 'drawing', message: p.queue ? `waiting behind ${p.queue} in the GPU queue` : opts.label, percent: null }) }), { label: opts.label }), { jobId: ctx.job.id });
}

/** Bring one ComfyUI output file into the library as an asset with its provenance. */
async function adoptOutput(ctx: HandlerContext, out: comfy.ComfyOutputFile, run: comfy.ComfyRunResult, opts: { label: string; tags: string[]; prompt: string; negative?: string; references: string[]; seed?: number; model: string; loras?: string[]; provenance?: Record<string, unknown>; ms: number }): Promise<Drawn> {
  const bytes = await comfy.view(out);
  const dir = await tmpDir('img');
  const tmp = path.join(dir, out.filename);
  await fsp.writeFile(tmp, bytes);
  const id = nid('gen');
  const stored = await adoptFile(id, tmp, { expectKind: 'IMAGE' });
  await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  const provenance = { provider: 'COMFYUI', model: opts.model, loras: opts.loras ?? [], prompt: opts.prompt, negative: opts.negative, references: opts.references, seed: opts.seed, workflowVersion: run.workflowVersion, promptId: run.promptId, engineMs: run.engineMs, ...(opts.provenance ?? {}) };
  await command('addAsset', [assetFromStored(id, stored, { label: opts.label, tags: opts.tags, origin: 'GENERATED', jobId: ctx.job.id, provenance })], 'worker');
  return { id, file: stored.absPath, prompt: opts.prompt, references: opts.references, workflowVersion: run.workflowVersion, ms: opts.ms, width: stored.probe?.width, height: stored.probe?.height };
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

export const characterAppearance: Handler = async (ctx) => {
  const { characterId } = ctx.job.payload as { characterId: string };
  const { state } = await readState();
  const c = state.characters.find((x) => x.id === characterId);
  if (!c) throw new StudioError('NOT_FOUND', 'Character not found');
  if (!canChangeAppearance(c)) throw new StudioError('APPEARANCE_LOCKED', `${c.name} has been used in a video; the appearance is preserved for continuity.`);
  const pending = c.pendingReference ? state.assets.find((a) => a.id === c.pendingReference!.assetId) : undefined;
  const validation = await requireUsableReference(c, pending);
  await requireComfy();
  const line = identityLineOf(c);
  const seed = identitySeedOf(c);
  await ctx.progress('GENERATING', { phase: 'drawing', message: `Drawing ${c.name}` });
  // the view sentence first (the direction text must not win over it), then the direction and the description,
  // then the identity line verbatim
  const prompt = ['Head-and-shoulders portrait, centred, looking at camera, neutral expression, plain mid-grey background, no props.', characterPrompt(c, 'PORTRAIT'), line, pending ? 'Keep the face, hair and identity of the person in the reference picture exactly; render them in this production direction.' : ''].filter(Boolean).join(' ').replace(/\s+/g, ' ');
  const portrait = await draw(ctx, { prompt, negative: NEG, references: pending ? [pending] : [], width: 1024, height: 1280, label: `${c.name} — portrait`, tags: ['character', 'portrait'], seed, provenance: { characterId: c.id, view: 'PORTRAIT', identityLine: line, identitySeed: seed, ...(validation ? { referenceValidation: validation } : {}) } });
  await ctx.checkpoint();
  // the old portrait and sheet stay in the library; only the character's pointers move
  await command('setCharacterAppearance', [c.id, { portraitAssetId: portrait.id, refs: [], keepExistingRefs: false }], 'worker');
  await command('updateCharacter', [c.id, { canon: { ...(c.canon ?? {}), identityLine: line, identitySeed: seed } }], 'worker');
  const from = pending ? `from the producer’s reference (${pending.id})` : 'from the description';
  await ctx.activity('CHARACTER_DRAWN', `${c.name}: portrait drawn ${from}, seed ${seed}`, { characterId: c.id, assetId: portrait.id, ms: portrait.ms, references: portrait.references, seed, identityLine: line });
  // the reference sheet follows as a child job — unless this job is itself a step of an orchestrated chain
  // (CREATE_CHARACTER queues its own sheet step with its own key)
  let refsJobId: string | undefined;
  if (!ctx.job.parentId) {
    const r = await enqueue({ type: 'CHARACTER_REFS', payload: { characterId: c.id }, parentId: ctx.job.id, idempotencyKey: `appearance:${ctx.job.id}:refs`, priority: ctx.job.priority });
    refsJobId = r.job.id;
  }
  return { portraitAssetId: portrait.id, ms: portrait.ms, workflowVersion: portrait.workflowVersion, identitySeed: seed, identityLine: line, refsJobId };
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
  const portrait = state.assets.find((a) => a.id === c.portraitAssetId);
  if (!usable(portrait)) throw new StudioError('INVALID', 'Draw the portrait first; the reference views are made from it.');
  await requireComfy();
  const byId = (id?: string) => (id ? state.assets.find((a) => a.id === id) : undefined);
  const wanted = (roles?.length ? roles : REF_VIEWS).filter((r) => r !== 'FACE');
  const partial = Boolean(roles?.length);
  const line = identityLineOf(c);
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
    const base = { prompt, negative: NEG, seed, model: 'Qwen-Image-Edit-2511', ms };
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
    await ctx.activity('CHARACTER_SHEET', `${c.name}: identity sheet drawn in one quality pass from the portrait (${portrait!.id}) and its face crop (${faceDrawn.id}), seed ${seed}; cut into front, three-quarter, side and back tiles`, { characterId: c.id, sheetAssetId: sheetDrawn.id, faceAssetId: faceDrawn.id, tiles, references: [portrait!.id, faceDrawn.id], seed, ms, engineMs: run.engineMs });
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
      const d = await adoptOutput(ctx, out, run, { label: `${c.name} — ${roleLabel(role)}`, tags: ['character', 'reference'], prompt, negative: NEG, references: references.map((a) => a.id), seed: viewSeed, model: 'Qwen-Image-Edit-2511', loras: loras(false, angleLora), provenance: { characterId: c.id, view: role, identityLine: line, identitySeed: seed, angleLora }, ms });
      refs.push({ id: `ref-${d.id}`, role, assetId: d.id, view: role, references: references.map((a) => a.id), seed: viewSeed });
      await ctx.activity('CHARACTER_SHEET', `${c.name}: ${roleLabel(role)} drawn from the front tile (${front!.id}), face crop (${face!.id}) and sheet (${sheet!.id}), seed ${viewSeed}${angleLora ? ', Multiple-Angles LoRA' : ''}`, { characterId: c.id, assetId: d.id, view: role, references: references.map((a) => a.id), seed: viewSeed, angleLora, ms, engineMs: run.engineMs });
      await ctx.checkpoint();
    }
  }

  // a full pack replaces the refs list (the previous tiles and views stay in the library as assets); a partial
  // redraw replaces only the roles drawn
  if (partial) await command('addCharacterRefs', [c.id, refs], 'worker');
  else await command('updateCharacter', [c.id, { refs }], 'worker');
  if (!c.canon?.identityLine || c.canon.identitySeed === undefined) await command('updateCharacter', [c.id, { canon: { ...(c.canon ?? {}), identityLine: line, identitySeed: seed } }], 'worker');
  // the character sheet is the Casting department's deliverable to every production the character is in
  const fresh = (await readState()).state.characters.find((x) => x.id === c.id)!;
  const got = new Set(fresh.refs.map((r) => r.role));
  const missing = wanted.filter((v) => !got.has(v));
  const sheetId = fresh.refs.find((r) => r.role === 'FRONT')?.references?.[0];
  for (const p of (await readState()).state.productions.filter((x) => x.castIds.includes(c.id))) {
    await recordHandoff({ productionId: p.id, stage: 'CAST_WORLD', producerDepartment: 'CASTING', receiverDepartment: 'PREPRODUCTION', artifactIds: [fresh.portraitAssetId!, ...(sheetId ? [sheetId] : []), ...refs.map((r) => r.assetId)], outputVersions: { character: c.id, refs: fresh.refs.length, identitySeed: seed, model: 'Qwen-Image-Edit-2511', loras: loras(false, angleLora).join(',') }, validation: { ok: missing.length === 0, checks: [{ name: 'portrait-present', ok: Boolean(fresh.portraitAssetId) }, { name: 'identity-sheet-present', ok: Boolean(sheetId), detail: sheetId }, { name: 'reference-views-complete', ok: missing.length === 0, detail: missing.length ? `missing ${missing.join(', ')}` : `${wanted.length} views` }, { name: 'references-recorded', ok: refs.every((r) => Array.isArray(r.references) && typeof r.seed === 'number'), detail: `identity line: ${line.slice(0, 120)}` }] }, jobId: ctx.job.id });
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
  const fresh = (await readState()).state.locations.find((x) => x.id === l.id)!;
  for (const p of (await readState()).state.productions.filter((x) => x.locationIds.includes(l.id))) {
    await recordHandoff({ productionId: p.id, stage: 'CAST_WORLD', producerDepartment: 'WORLD', receiverDepartment: 'PREPRODUCTION', artifactIds: refs.map((r) => r.assetId), outputVersions: { location: l.id, refs: fresh.refs.length }, validation: { ok: Boolean(fresh.masterAssetId) && fresh.refs.some((r) => r.role === 'VIEW'), checks: [{ name: 'master-plate-present', ok: Boolean(fresh.masterAssetId) }, { name: 'views-present', ok: fresh.refs.some((r) => r.role === 'VIEW'), detail: `${fresh.refs.filter((r) => r.role === 'VIEW').length} view(s), ${fresh.refs.filter((r) => r.role === 'STATE').length} time-of-day state(s)` }] }, jobId: ctx.job.id });
  }
  await ctx.activity('PLATES_DRAWN', `${l.name}: ${refs.length} plate(s) drawn${master ? '' : ' (no master)'}`, { locationId: l.id, refs: refs.length });
  return { refs: refs.length };
};

// -------------------------------------------------------------------------------------------------- shot frames

export async function drawShotFrame(ctx: HandlerContext, state: Awaited<ReturnType<typeof readState>>['state'], p: Production, sh: Shot, opts: { ending?: boolean } = {}): Promise<string> {
  const scene = p.scenes.find((sc) => sc.id === sh.sceneId);
  const cast = castOf(state, p); const world = worldOf(state, p);
  const loc = world.find((l) => l.id === scene?.locationId);
  const byId = (id?: string) => (id ? state.assets.find((a) => a.id === id) : undefined);
  // references: the location plate for this time of day (or the master) first, then up to two characters — each
  // by the FRONT tile of the identity sheet (neutral pose, no props; the portrait may carry both), falling back to
  // the portrait; a lone character also gets the face crop as the third picture
  const plate = loc ? (loc.refs.find((r) => r.role === 'STATE' && r.timeOfDay === scene?.timeOfDay) ?? loc.refs.find((r) => r.role === 'MASTER')) : undefined;
  const refs: Asset[] = [];
  const notes: string[] = [];
  const plateAsset = byId(plate?.assetId ?? loc?.masterAssetId);
  if (usable(plateAsset)) { refs.push(plateAsset!); notes.push(`image ${refs.length} is the exact place (keep its architecture, layout and props)`); }
  const people = sh.characterIds.map((id) => cast.find((c) => c.id === id)).filter(Boolean) as Character[];
  for (const c of people.slice(0, 2)) {
    const tile = byId(c.refs.find((r) => r.role === 'FRONT')?.assetId);
    const a = usable(tile) ? tile : byId(c.portraitAssetId);
    if (usable(a)) { refs.push(a!); notes.push(`image ${refs.length} is the person ${identityLineOf(c).replace(/^Identity:\s*/, '') || 'described in the action'} — keep the face, hair, skin and wardrobe exactly`); }
  }
  if (people.length === 1 && refs.length < 3) {
    const faceCrop = byId(people[0].refs.find((r) => r.role === 'FACE')?.assetId);
    if (usable(faceCrop) && !refs.includes(faceCrop!)) { refs.push(faceCrop!); notes.push(`image ${refs.length} is the same person's face, close up`); }
  }
  const info = ASPECT_INFO[p.aspect];
  const which = opts.ending ? 'ending' : 'opening';
  const guidance = refs.length ? ` Use the reference pictures: ${notes.join('; ')}.` : '';
  const prompt = framePrompt(p, sh, cast, loc, scene) + (opts.ending ? ' Show the end of the action.' : '') + guidance;
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
