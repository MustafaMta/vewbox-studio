import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { workflowVersion as structuralWorkflowVersion, type Graph } from '../workflows';
import { StudioError } from '@/domain/errors';
import { env } from '../env';
import { log } from '../log';

/** COMFYUI AS AN ENGINE — workflows are JSON graphs built in code (src/server/workflows), submitted over HTTP,
 *  tracked through /history, and their outputs fetched through /view. The worker never edits node graphs by hand and
 *  users never see ComfyUI. Each graph is hashed so a take can say which workflow revision made it. */

export interface ComfyOutputFile { filename: string; subfolder: string; type: 'output' | 'temp' | 'input' }
export interface ComfyRunResult { promptId: string; outputs: Record<string, { images?: ComfyOutputFile[]; audio?: ComfyOutputFile[]; video?: ComfyOutputFile[]; gifs?: ComfyOutputFile[]; text?: string[] }>; ms: number; /** ComfyUI's own execution time (queue wait excluded), when it reported it */ engineMs?: number; workflowVersion: string }

const baseUrl = () => env().COMFYUI_URL.replace(/\/$/, '');

async function http<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 30_000);
  try {
    const res = await fetch(`${baseUrl()}${path}`, { ...init, signal: ctrl.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new StudioError(res.status >= 500 ? 'UNAVAILABLE' : 'PROVIDER', `ComfyUI ${path}: HTTP ${res.status} ${text.slice(0, 1500)}`, { status: res.status });
    }
    const ct = res.headers.get('content-type') ?? '';
    return (ct.includes('application/json') ? await res.json() : await res.text()) as T;
  } catch (e) {
    if (e instanceof StudioError) throw e;
    throw new StudioError('UNAVAILABLE', `ComfyUI is not reachable at ${baseUrl()}: ${(e as Error).message}`);
  } finally { clearTimeout(t); }
}

export async function health(): Promise<{ ok: boolean; version?: string; vramTotal?: number; vramFree?: number; device?: string }> {
  try {
    const s = await http<{ system: { comfyui_version?: string }; devices: Array<{ name: string; vram_total: number; vram_free: number }> }>('/system_stats');
    const d = s.devices?.[0];
    return { ok: true, version: s.system?.comfyui_version, vramTotal: d?.vram_total, vramFree: d?.vram_free, device: d?.name };
  } catch { return { ok: false }; }
}

export async function objectInfo(nodeClass?: string): Promise<Record<string, unknown>> {
  return http<Record<string, unknown>>(nodeClass ? `/object_info/${encodeURIComponent(nodeClass)}` : '/object_info', { timeoutMs: 60_000 });
}

export async function hasNodes(classes: string[]): Promise<{ missing: string[] }> {
  const info = await objectInfo();
  return { missing: classes.filter((c) => !(c in info)) };
}

export async function listModels(folder: string): Promise<string[]> {
  return http<string[]>(`/models/${encodeURIComponent(folder)}`);
}

/** Drop every loaded model and free VRAM (used when the GPU switches family). */
export async function free(): Promise<void> {
  await http('/free', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ unload_models: true, free_memory: true }) });
}

export async function interrupt(): Promise<void> { await http('/interrupt', { method: 'POST' }); }

/** Put a local file into ComfyUI's input folder (name derived from content so repeats are cheap). */
export async function uploadInput(file: string, opts: { ext?: string; subfolder?: string } = {}): Promise<string> {
  const buf = await fs.readFile(file);
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
  const ext = opts.ext ?? (file.split('.').pop() ?? 'bin');
  const name = `vb-${hash}.${ext}`;
  const fd = new FormData();
  fd.set('image', new Blob([buf]), name);
  fd.set('overwrite', 'true');
  fd.set('type', 'input');
  if (opts.subfolder) fd.set('subfolder', opts.subfolder);
  const r = await http<{ name: string; subfolder: string }>('/upload/image', { method: 'POST', body: fd, timeoutMs: 300_000 });
  return r.subfolder ? `${r.subfolder}/${r.name}` : r.name;
}

export const workflowVersion = (graph: Record<string, unknown>) => structuralWorkflowVersion(graph as Graph);

/** Submit a graph and wait for it. Progress reports the current node and sampler step when ComfyUI exposes them. */
export async function run(graph: Record<string, unknown>, opts: { timeoutMs?: number; onProgress?: (p: { node?: string; value?: number; max?: number; queue?: number }) => Promise<void> | void; shouldStop?: () => Promise<boolean> | boolean; clientId?: string } = {}): Promise<ComfyRunResult> {
  const clientId = opts.clientId ?? crypto.randomUUID();
  const t0 = Date.now();
  const sub = await http<{ prompt_id: string; node_errors?: Record<string, unknown>; error?: unknown }>('/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: graph, client_id: clientId }), timeoutMs: 120_000 });
  if (!sub.prompt_id) throw new StudioError('PROVIDER', `ComfyUI refused the workflow: ${JSON.stringify(sub.error ?? sub.node_errors).slice(0, 600)}`);
  const promptId = sub.prompt_id;
  const timeout = opts.timeoutMs ?? 60 * 60_000;
  let lastQueueLog = 0;
  for (;;) {
    if (await opts.shouldStop?.()) { await interrupt().catch(() => {}); throw new StudioError('CONFLICT', 'cancelled'); }
    const hist = await http<Record<string, { outputs: ComfyRunResult['outputs']; status?: { status_str?: string; completed?: boolean; messages?: unknown[] } }>>(`/history/${promptId}`);
    const h = hist[promptId];
    if (h) {
      if (h.status?.status_str === 'error') {
        const msg = JSON.stringify(h.status.messages ?? []).slice(0, 1200);
        throw new StudioError('PROVIDER', `ComfyUI workflow failed: ${msg}`, { promptId });
      }
      if (h.status?.completed || Object.keys(h.outputs ?? {}).length > 0) {
        // ComfyUI stamps execution_start / execution_success: the engine time proper, without our queue wait
        const stamps = ((h.status?.messages ?? []) as Array<[string, { timestamp?: number }]>).filter((m) => Array.isArray(m));
        const started = stamps.find((m) => m[0] === 'execution_start')?.[1]?.timestamp;
        const finished = stamps.find((m) => m[0] === 'execution_success')?.[1]?.timestamp;
        return { promptId, outputs: h.outputs ?? {}, ms: Date.now() - t0, engineMs: started && finished ? finished - started : undefined, workflowVersion: workflowVersion(graph) };
      }
    }
    // queue position, for honest progress
    const q = await http<{ queue_running: unknown[][]; queue_pending: unknown[][] }>('/queue').catch(() => null);
    if (q) {
      const pendingIdx = q.queue_pending.findIndex((x) => x[1] === promptId);
      const runningNow = q.queue_running.some((x) => x[1] === promptId);
      if (Date.now() - lastQueueLog > 15_000) { lastQueueLog = Date.now(); await opts.onProgress?.({ queue: runningNow ? 0 : pendingIdx + 1 }); }
    }
    if (Date.now() - t0 > timeout) { await interrupt().catch(() => {}); throw new StudioError('PROVIDER', `ComfyUI workflow ${promptId} did not finish within ${Math.round(timeout / 60000)} min`); }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/** Fetch an output file's bytes. */
export async function view(f: ComfyOutputFile): Promise<Buffer> {
  const sp = new URLSearchParams({ filename: f.filename, subfolder: f.subfolder ?? '', type: f.type ?? 'output' });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 300_000);
  try {
    const res = await fetch(`${baseUrl()}/view?${sp}`, { signal: ctrl.signal });
    if (!res.ok) throw new StudioError('PROVIDER', `ComfyUI /view ${f.filename}: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally { clearTimeout(t); }
}

export function firstOutput(outputs: ComfyRunResult['outputs'], kind: 'images' | 'audio' | 'video' | 'gifs'): ComfyOutputFile | undefined {
  for (const node of Object.values(outputs)) { const xs = node[kind]; if (xs && xs.length) return xs[0]; }
  return undefined;
}

export function allOutputs(outputs: ComfyRunResult['outputs'], kind: 'images' | 'audio' | 'video' | 'gifs'): ComfyOutputFile[] {
  return Object.values(outputs).flatMap((n) => n[kind] ?? []);
}

export { log as comfyLog };
