import { env } from '../env';
import { engineGuardProblem } from './lease-db';
import { log } from '../log';
import * as comfy from '../providers/comfy';
import { unloadAsr, unloadTts } from '../providers/speech';
import { unloadDesign } from '../providers/voice-design';
import { unloadLipsync } from '../providers/lipsync';
import { unloadSfx } from '../providers/sfx';
import type { GpuFamily } from './lease';

/** THE ENGINES ON THE CARD AND HOW EACH LETS GO OF IT (docs/BACKEND-AUDIT-2026-10.md H7, step 8). When the GPU passes
 *  to another model family, every engine that does not serve the new family drops its weights first — ComfyUI
 *  (`/free`: unload models, free memory), the speech services (`/unload`, which also hands the freed host RAM back to
 *  the system: docs/research/MODEL-STACK-2026-10.md §1.2, docker/*\/app.py `malloc_trim`), Ollama (`keep_alive: 0`).
 *  ComfyUI serves three families with different checkpoints, so a switch between two of them frees it too. Every
 *  unload is best effort and bounded: an engine that is not running has nothing on the card. */

export interface Engine { name: string; serves: readonly GpuFamily[]; unload: () => Promise<void> }

/** The OpenAI-compatible server is the local Ollama (it holds the story model on the GPU) when it answers on 11434. */
export const localOllamaBase = (): string | undefined => {
  const url = env().OPENAI_COMPATIBLE_BASE_URL;
  if (!url || !/:11434(\/|$)/.test(url)) return undefined;
  const base = url.replace(/\/v1\/?$/, '').replace(/\/$/, '');
  // a process outside the live lease never touches the real Ollama (gpu/lease-db.ts): nothing to unload from here
  return engineGuardProblem(base) ? undefined : base;
};

/** Ollama unloads a model when asked to generate nothing with `keep_alive: 0`. EVERY loaded model is unloaded (Ollama's
 *  /api/ps), not only the studio's configured one: a benchmark or a second model left resident kept ~20–30 GB of
 *  VRAM and host RAM under the next family (2026-10-06: a Qwen-Image frame job choked ComfyUI after an LLM batch). */
export async function unloadOllama(): Promise<void> {
  const base = localOllamaBase();
  if (!base) return;
  let loaded: string[] = [];
  try {
    const r = await fetch(`${base}/api/ps`, { signal: AbortSignal.timeout(5_000) });
    if (r.ok) loaded = ((await r.json()) as { models?: Array<{ name?: string; model?: string }> }).models?.map((m) => m.name ?? m.model ?? '').filter(Boolean) ?? [];
  } catch { /* not running, or an older Ollama: fall back to the configured model */ }
  const models = new Set([...loaded, env().OPENAI_COMPATIBLE_MODEL].filter((m): m is string => Boolean(m)));
  for (const model of models) {
    try { await fetch(`${base}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, keep_alive: 0 }), signal: AbortSignal.timeout(20_000) }); } catch { /* not running */ }
  }
}

const extra: Engine[] = [];

/** The engines the lease unloads, in order. */
export function engines(): Engine[] {
  return [
    // ComfyUI's queue drains first: a prompt nobody holds the lease for must not run beside the next family's model
    { name: 'comfyui', serves: ['IMAGE', 'VIDEO', 'MUSIC'], unload: async () => { const w = await comfy.waitIdle(Number(process.env.GPU_COMFY_DRAIN_MS ?? 20 * 60_000)); if (w.promptIds.length) await (await import('../jobs/queue')).recordMetric('gpu.comfy_drain_ms', w.waitedMs, 'ms', { idle: w.idle, prompts: w.promptIds.length }).catch(() => undefined); await comfy.free(); } },
    { name: 'tts', serves: ['TTS'], unload: unloadTts },
    { name: 'tts-design', serves: ['TTS'], unload: unloadDesign },
    { name: 'asr', serves: ['ASR'], unload: unloadAsr },
    { name: 'ollama', serves: ['LLM'], unload: unloadOllama },
    // the lip-sync corrector (docker/lipsync); it also drops its weights after every request (LIPSYNC_KEEP_LOADED=0)
    { name: 'lipsync', serves: ['LIPSYNC'], unload: unloadLipsync },
    // MOSS-SoundEffect (sfx-moss); lazy-loaded, so an idle service holds nothing
    { name: 'sfx', serves: ['SFX'], unload: unloadSfx },
    ...extra,
  ];
}

/** Another engine that holds weights for a family (kept for callers of the old in-process lease). */
export function registerEngine(e: Engine): void { extra.push(e); }

/** Which engines must let go when the card passes from `from` (what was loaded last; null when unknown) to `to`:
 *  every engine that does not serve `to`, and one that serves both when the family changes (other weights). */
export function enginesToUnload(from: GpuFamily | null, to: GpuFamily, list: Engine[] = engines()): Engine[] {
  if (from === to) return [];
  return list.filter((e) => !e.serves.includes(to) || (from !== null && e.serves.includes(from)));
}

/** The metric each unload leaves (labels: engine, from, to, ok). */
export const UNLOAD_METRIC = 'gpu.unload_ms';

/** Unload them, timed, logged and recorded; failures are logged, never thrown. */
export async function unloadFor(from: GpuFamily | null, to: GpuFamily, list: Engine[] = engines()): Promise<string[]> {
  const done: string[] = [];
  for (const e of enginesToUnload(from, to, list)) {
    const t0 = Date.now();
    let ok = true;
    try { await e.unload(); done.push(e.name); } catch (err) { ok = false; log.warn({ engine: e.name, err: (err as Error).message }, 'gpu: unload failed'); }
    log.debug({ engine: e.name, ms: Date.now() - t0, from, to }, 'gpu: engine unloaded');
    // kept as a metric: the engine room lists the last unloads (GET /api/studio/gpu)
    await (await import('../jobs/queue')).recordMetric(UNLOAD_METRIC, Date.now() - t0, 'ms', { engine: e.name, from: from ?? 'unknown', to, ok }).catch(() => undefined);
  }
  return done;
}
