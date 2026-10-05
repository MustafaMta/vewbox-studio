import fsp from 'node:fs/promises';
import { minimaxH3Video } from '@/server/workflows/minimax-h3';
import * as comfy from '@/server/providers/comfy';

/** IS THE MACHINE READY FOR THIS REQUEST? (cloud directive 2026-10-05 §11 "first-attempt reliability": models available,
 *  resources available, output storage available — validated BEFORE MiniMax is called, so an avoidable failure never
 *  costs a generation.) The pure preflight (src/server/org/preflight.ts) judges the plan; this judges the machine:
 *  - the ComfyUI node classes and model files the H3 graph will name (read from the very graph builder the request
 *    uses, never from a second list), and
 *  - free space where the take will be written.
 *  An engine that cannot be asked is reported as OFFLINE — a readable reason for the job, never a fake result. */

export interface GraphRequirements { nodes: string[]; models: Array<{ folder: string; file: string }> }

const MODEL_INPUTS: Record<string, string> = { unet_name: 'diffusion_models', clip_name: 'text_encoders', vae_name: 'vae', lora_name: 'loras' };

/** The node classes and model files a built graph names. Pure. */
export function graphRequirements(graph: Record<string, { class_type: string; inputs: Record<string, unknown> }>): GraphRequirements {
  const nodes = new Set<string>(); const models = new Map<string, { folder: string; file: string }>();
  for (const n of Object.values(graph)) {
    nodes.add(n.class_type);
    for (const [k, folder] of Object.entries(MODEL_INPUTS)) { const v = n.inputs[k]; if (typeof v === 'string') models.set(`${folder}/${v}`, { folder, file: v }); }
  }
  return { nodes: [...nodes].sort(), models: [...models.values()] };
}

/** What every local H3 request may need: both graphs (reference and first/last frame), with a tail guide. */
export function h3Requirements(): GraphRequirements {
  const ref = minimaxH3Video({ prompt: 'x', width: 1280, height: 720, seconds: 5, referenceImages: ['a.png'], referenceAudio: ['a.wav'], guides: [{ frameIdx: 0, image: 'tail.mp4', imageIsVideo: true, audioFromVideo: true }] });
  const fl = minimaxH3Video({ prompt: 'x', width: 1280, height: 720, seconds: 5, firstFrame: 'a.png', lastFrame: 'b.png' });
  const a = graphRequirements(ref as never), b = graphRequirements(fl as never);
  const models = new Map([...a.models, ...b.models].map((m) => [`${m.folder}/${m.file}`, m]));
  return { nodes: [...new Set([...a.nodes, ...b.nodes])].sort(), models: [...models.values()] };
}

export interface Readiness { ok: boolean; offline?: boolean; missingNodes: string[]; missingModels: string[]; detail: string }

/** Ask the running ComfyUI whether it has what the requirements name. */
export async function engineReadiness(req: GraphRequirements, api: Pick<typeof comfy, 'hasNodes' | 'listModels'> = comfy): Promise<Readiness> {
  try {
    const { missing } = await api.hasNodes(req.nodes);
    const folders = [...new Set(req.models.map((m) => m.folder))];
    const listed = new Map<string, Set<string>>();
    for (const f of folders) listed.set(f, new Set(await api.listModels(f).catch(() => [] as string[])));
    const missingModels = req.models.filter((m) => !listed.get(m.folder)?.has(m.file)).map((m) => `${m.folder}/${m.file}`);
    const ok = missing.length === 0 && missingModels.length === 0;
    return { ok, missingNodes: missing, missingModels, detail: ok ? `${req.nodes.length} node classes and ${req.models.length} model files present` : [missing.length ? `missing nodes: ${missing.join(', ')}` : '', missingModels.length ? `missing models: ${missingModels.join(', ')}` : ''].filter(Boolean).join('; ') };
  } catch (e) {
    return { ok: false, offline: true, missingNodes: [], missingModels: [], detail: `ComfyUI is offline (${(e as Error).message.split('\n')[0]}): the local MiniMax engine cannot be asked` };
  }
}

/** Free space under a directory (the library), against a floor. A take is ~10–60 MB, its tail and work files more; the
 *  default floor of 2 GB keeps a scene's worth of takes and their intermediates. */
export async function storageReadiness(dir: string, minFreeBytes = 2 * 1024 ** 3, statfs: (p: string) => Promise<{ bavail: number | bigint; bsize: number | bigint }> = (p) => fsp.statfs(p)): Promise<{ ok: boolean; freeBytes?: number; detail: string }> {
  try {
    const s = await statfs(dir);
    const freeBytes = Number(s.bavail) * Number(s.bsize);
    const ok = freeBytes >= minFreeBytes;
    return { ok, freeBytes, detail: `${(freeBytes / 1024 ** 3).toFixed(1)} GB free in the library${ok ? '' : `, under the ${(minFreeBytes / 1024 ** 3).toFixed(1)} GB a take needs with its work files`}` };
  } catch (e) {
    return { ok: false, detail: `the library folder cannot be read (${(e as Error).message.split('\n')[0]})` };
  }
}

/** THE REFERENCE FILES ARE ON DISK (directive §20 "required references"): every picture the shot pack conditions on,
 *  the clip or frame it opens from, its ending frame and every recorded line it reuses, by file — an asset row whose
 *  file is gone (a restore without the library, a manual clean-up) is refused BEFORE the engine is asked, naming what
 *  is missing, instead of failing mid-request as an unclassified "no such file". `fileOf` resolves an asset's file. */
export interface ReferenceNeed { assetId: string; what: string }
export function referenceNeeds(pack: { pictures: Array<{ assetId: string; role: string }>; opening: { kind: string; assetId?: string }; ending?: { assetId: string } }, lines: Array<{ id: string; audioAssetId?: string }> = []): ReferenceNeed[] {
  const needs: ReferenceNeed[] = pack.pictures.map((p, i) => ({ assetId: p.assetId, what: `reference picture ${i + 1} (${p.role.toLowerCase().replace('_', ' ')})` }));
  if (pack.opening.assetId) needs.push({ assetId: pack.opening.assetId, what: `opening ${pack.opening.kind === 'TAIL' ? "clip (the previous take's tail)" : pack.opening.kind === 'LAST_FRAME_AS_FIRST' ? "frame (the previous take's last frame)" : 'frame'}` });
  if (pack.ending) needs.push({ assetId: pack.ending.assetId, what: 'ending frame' });
  for (const l of lines) if (l.audioAssetId) needs.push({ assetId: l.audioAssetId, what: `recorded line ${l.id}` });
  const seen = new Set<string>();
  return needs.filter((n) => (seen.has(`${n.assetId}:${n.what}`) ? false : (seen.add(`${n.assetId}:${n.what}`), true)));
}

export async function referenceFilesReadiness(needs: ReferenceNeed[], fileOf: (assetId: string) => string | undefined, exists: (file: string) => Promise<boolean> = async (f) => fsp.stat(f).then((s) => s.isFile() && s.size > 0, () => false)): Promise<{ ok: boolean; missing: Array<ReferenceNeed & { file?: string }>; detail: string }> {
  const missing: Array<ReferenceNeed & { file?: string }> = [];
  for (const n of needs) {
    const file = fileOf(n.assetId);
    if (!file || !(await exists(file))) missing.push({ ...n, ...(file ? { file } : {}) });
  }
  return { ok: missing.length === 0, missing, detail: missing.length ? `missing reference file${missing.length > 1 ? 's' : ''}: ${missing.map((m) => `${m.what} (asset ${m.assetId}${m.file ? '' : ', no record'})`).join('; ')}` : `${needs.length} reference file(s) present` };
}

/** The engine's answer is reused for a minute per requirement set (object_info is large; a scene asks many times). A
 *  failed answer is never cached: the next take asks again. */
const cache = new Map<string, { at: number; r: Readiness }>();
export async function cachedEngineReadiness(req: GraphRequirements, ttlMs = 60_000, now = Date.now()): Promise<Readiness> {
  const key = JSON.stringify(req);
  const hit = cache.get(key);
  if (hit && now - hit.at < ttlMs) return hit.r;
  const r = await engineReadiness(req);
  if (r.ok) cache.set(key, { at: now, r }); else cache.delete(key);
  return r;
}

/** Forget the cached answers (tests; and after the engine is restarted). */
export function resetReadinessCache(): void { cache.clear(); }
