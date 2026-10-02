import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Handler, HandlerContext } from './index';
import { StudioError } from '@/domain/errors';
import { nid } from '@/domain/ids';
import type { Asset, Character, CharacterRef, Location, LocationRef, Production, Shot } from '@/domain/types';
import type { CharacterRefRole, TimeOfDay } from '@/domain/vocabulary';
import { ASPECT_INFO } from '@/domain/vocabulary';
import { command, readState } from '@/server/studio/engine';
import { castOf, worldOf } from '@/studio/selectors';
import { adoptFile, assetFromStored, fileFor } from '@/server/media';
import { tmpDir } from '@/server/media/ffmpeg';
import * as comfy from '@/server/providers/comfy';
import { qwenEdit, qwenTextToImage } from '@/server/workflows';
import { characterPrompt, framePrompt, locationPrompt } from '@/server/story/prompts';
import { canChangeAppearance } from '@/domain/rules';
import { recordMetric } from '@/server/jobs/queue';

/** PICTURES — character portraits and reference packs, location plates and views, storyboard frames. All drawn by
 *  Qwen-Image (text to image) and Qwen-Image-Edit (multi-reference editing) in ComfyUI on the local GPU, under the
 *  GPU lease. Every picture becomes a library asset with its prompt, references and workflow version. */

const IMAGE_VRAM_MB = 24000;
const assetFile = (a: Asset) => fileFor({ storage: a.sample ? 'PUBLIC' : 'LIBRARY', path: a.sample ? a.src.replace(/^\/+/, '') : String(a.provenance?.path ?? '') });
const usable = (a?: Asset) => Boolean(a && a.kind === 'IMAGE' && a.mimeType !== 'image/svg+xml');

async function requireComfy() {
  const h = await comfy.health();
  if (!h.ok) throw new StudioError('UNAVAILABLE', 'The image engine (ComfyUI) is not reachable. Start the comfyui service.');
  const { missing } = await comfy.hasNodes(['TextEncodeQwenImageEditPlus', 'UNETLoader', 'ModelSamplingAuraFlow']);
  if (missing.length) throw new StudioError('NOT_CONFIGURED', `ComfyUI is missing nodes: ${missing.join(', ')}`);
  const models = await comfy.listModels('diffusion_models').catch(() => [] as string[]);
  if (!models.some((m) => m.includes('qwen_image'))) throw new StudioError('NOT_CONFIGURED', 'Qwen-Image weights are not downloaded yet (see docker/models).');
}

interface Drawn { id: string; file: string; prompt: string; references: string[]; workflowVersion: string; ms: number; width?: number; height?: number }

/** Run one image workflow and bring the result into the library as an asset. */
async function draw(ctx: HandlerContext, opts: { prompt: string; negative?: string; references?: Asset[]; width: number; height: number; label: string; tags: string[]; seed?: number; provenance?: Record<string, unknown> }): Promise<Drawn> {
  const refs = (opts.references ?? []).filter(usable).slice(0, 3);
  const graph = refs.length
    ? qwenEdit({ prompt: opts.prompt, negative: opts.negative, references: await Promise.all(refs.map((a) => comfy.uploadInput(assetFile(a)))), width: opts.width, height: opts.height, seed: opts.seed })
    : qwenTextToImage({ prompt: opts.prompt, negative: opts.negative, width: opts.width, height: opts.height, seed: opts.seed });
  const t0 = Date.now();
  const run = await ctx.gpu('IMAGE', IMAGE_VRAM_MB, () => comfy.run(graph, { timeoutMs: 20 * 60_000, shouldStop: async () => { try { await ctx.checkpoint(); return false; } catch { return true; } }, onProgress: (p) => ctx.progress('GENERATING', { phase: 'drawing', message: p.queue ? `waiting behind ${p.queue} in the GPU queue` : opts.label, percent: null }) }), { jobId: ctx.job.id });
  const out = comfy.firstOutput(run.outputs, 'images');
  if (!out) throw new StudioError('PROVIDER', 'ComfyUI returned no image.');
  const bytes = await comfy.view(out);
  const dir = await tmpDir('img');
  const tmp = path.join(dir, out.filename);
  await fsp.writeFile(tmp, bytes);
  const id = nid('gen');
  const stored = await adoptFile(id, tmp, { expectKind: 'IMAGE' });
  await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  const provenance = { provider: 'COMFYUI', model: refs.length ? 'Qwen-Image-Edit-2511' : 'Qwen-Image-2512', prompt: opts.prompt, negative: opts.negative, references: refs.map((r) => r.id), seed: opts.seed, workflowVersion: run.workflowVersion, promptId: run.promptId, ...(opts.provenance ?? {}) };
  await command('addAsset', [assetFromStored(id, stored, { label: opts.label, tags: opts.tags, origin: 'GENERATED', jobId: ctx.job.id, provenance })], 'worker');
  await recordMetric('image.generation_ms', Date.now() - t0, 'ms', { model: provenance.model, refs: refs.length }, ctx.job.id);
  return { id, file: stored.absPath, prompt: opts.prompt, references: refs.map((r) => r.id), workflowVersion: run.workflowVersion, ms: Date.now() - t0, width: stored.probe?.width, height: stored.probe?.height };
}

const NEG = 'text, watermark, logo, signature, blurry, deformed hands, extra fingers, extra limbs, duplicate person, cropped head';

// ------------------------------------------------------------------------------------------- character appearance

export const characterAppearance: Handler = async (ctx) => {
  const { characterId } = ctx.job.payload as { characterId: string };
  const { state } = await readState();
  const c = state.characters.find((x) => x.id === characterId);
  if (!c) throw new StudioError('NOT_FOUND', 'Character not found');
  if (!canChangeAppearance(c)) throw new StudioError('APPEARANCE_LOCKED', `${c.name} has been used in a video; the appearance is preserved for continuity.`);
  await requireComfy();
  const pending = c.pendingReference ? state.assets.find((a) => a.id === c.pendingReference!.assetId) : undefined;
  await ctx.progress('GENERATING', { phase: 'drawing', message: `Drawing ${c.name}` });
  const prompt = characterPrompt(c, 'PORTRAIT') + (pending ? ' Keep the face, hair and identity of the person in the reference picture; render them in this production direction.' : '');
  const portrait = await draw(ctx, { prompt, negative: NEG, references: pending ? [pending] : [], width: 1024, height: 1280, label: `${c.name} — portrait`, tags: ['character', 'portrait'], provenance: { characterId: c.id, view: 'PORTRAIT' } });
  await ctx.checkpoint();
  await command('setCharacterAppearance', [c.id, { portraitAssetId: portrait.id, refs: [{ id: `ref-${portrait.id}`, role: 'FACE', assetId: portrait.id }], keepExistingRefs: false }], 'worker');
  return { portraitAssetId: portrait.id, ms: portrait.ms, workflowVersion: portrait.workflowVersion };
};

const REF_VIEWS: CharacterRefRole[] = ['FRONT', 'THREE_QUARTER', 'SIDE', 'FULL_BODY', 'EXPRESSION'];

export const characterRefs: Handler = async (ctx) => {
  const { characterId, roles } = ctx.job.payload as { characterId: string; roles?: CharacterRefRole[] };
  const { state } = await readState();
  const c = state.characters.find((x) => x.id === characterId);
  if (!c) throw new StudioError('NOT_FOUND', 'Character not found');
  if (!canChangeAppearance(c)) throw new StudioError('APPEARANCE_LOCKED', `${c.name} has been used in a video; the appearance is preserved for continuity.`);
  const portrait = state.assets.find((a) => a.id === c.portraitAssetId);
  if (!usable(portrait)) throw new StudioError('INVALID', 'Draw the portrait first; the reference views are made from it.');
  await requireComfy();
  const views = (roles?.length ? roles : REF_VIEWS).filter((r) => r !== 'FACE');
  const refs: CharacterRef[] = [];
  for (const [i, role] of views.entries()) {
    await ctx.progress('GENERATING', { phase: 'drawing', message: `${c.name}: ${role.toLowerCase().replace('_', ' ')} view`, step: i + 1, total: views.length });
    const r = await draw(ctx, { prompt: characterPrompt(c, role) + ' Same person as the reference picture: identical face, hair, skin and wardrobe.', negative: NEG, references: [portrait!], width: role === 'FULL_BODY' ? 832 : 1024, height: role === 'FULL_BODY' ? 1472 : 1280, label: `${c.name} — ${role.toLowerCase().replace('_', ' ')}`, tags: ['character', 'reference'], provenance: { characterId: c.id, view: role } });
    refs.push({ id: `ref-${r.id}`, role, assetId: r.id });
    await ctx.checkpoint();
  }
  await command('addCharacterRefs', [c.id, refs], 'worker');
  return { refs: refs.length };
};

// ---------------------------------------------------------------------------------------------------- locations

export const locationPlates: Handler = async (ctx) => {
  const { locationId, timesOfDay } = ctx.job.payload as { locationId: string; timesOfDay?: TimeOfDay[] };
  const { state } = await readState();
  const l = state.locations.find((x) => x.id === locationId);
  if (!l) throw new StudioError('NOT_FOUND', 'Location not found');
  await requireComfy();
  const refs: LocationRef[] = [];
  const existingMaster = state.assets.find((a) => a.id === l.masterAssetId);
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
  return { refs: refs.length };
};

// -------------------------------------------------------------------------------------------------- shot frames

export async function drawShotFrame(ctx: HandlerContext, state: Awaited<ReturnType<typeof readState>>['state'], p: Production, sh: Shot, opts: { ending?: boolean } = {}): Promise<string> {
  const scene = p.scenes.find((sc) => sc.id === sh.sceneId);
  const cast = castOf(state, p); const world = worldOf(state, p);
  const loc = world.find((l) => l.id === scene?.locationId);
  const byId = (id?: string) => (id ? state.assets.find((a) => a.id === id) : undefined);
  // references: the location plate for this time of day (or the master) first, then up to two character portraits
  const plate = loc ? (loc.refs.find((r) => r.role === 'STATE' && r.timeOfDay === scene?.timeOfDay) ?? loc.refs.find((r) => r.role === 'MASTER')) : undefined;
  const refs: Asset[] = [];
  const plateAsset = byId(plate?.assetId ?? loc?.masterAssetId);
  if (usable(plateAsset)) refs.push(plateAsset!);
  const people = sh.characterIds.map((id) => cast.find((c) => c.id === id)).filter(Boolean) as Character[];
  for (const c of people.slice(0, 2)) { const a = byId(c.portraitAssetId); if (usable(a)) refs.push(a!); }
  const info = ASPECT_INFO[p.aspect];
  const which = opts.ending ? 'ending' : 'opening';
  const guidance = refs.length ? ` Use the reference pictures: image 1 is the exact place (keep its architecture, layout and props${people.length ? `); the following images are the people (keep each face, hair, skin and wardrobe exactly` : ''}).` : '';
  const prompt = framePrompt(p, sh, cast, loc, scene) + (opts.ending ? ' Show the end of the action.' : '') + guidance;
  const r = await draw(ctx, { prompt, negative: NEG, references: refs, width: info.width, height: info.height, label: `${p.title} — shot ${scene?.number ?? '?'}.${sh.number} ${which} frame`, tags: ['frame', which], provenance: { productionId: p.id, shotId: sh.id, frame: which } });
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
  return { openingFrameAssetId: opening, endingFrameAssetId: endingId };
};

export { requireComfy as requireImageEngine, usable as usableImage };
export type { Location };
