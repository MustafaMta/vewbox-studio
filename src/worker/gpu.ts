import { env } from '@/server/env';
import { log } from '@/server/log';
import { recordMetric } from '@/server/jobs/queue';

/** THE GPU BUDGET — one RTX 5090, 32 GB. Local models (images, video, voices, transcription, music) run in separate
 *  services that each hold their weights while loaded; this lease makes sure only one family is loaded at a time and
 *  asks the others to unload before a new family takes the card. Measured peaks are recorded as metrics. */

export type GpuFamily = 'IMAGE' | 'VIDEO' | 'TTS' | 'ASR' | 'MUSIC';

export interface GpuLease { <T>(family: GpuFamily, estimateMb: number, fn: () => Promise<T>, opts?: { jobId?: string }): Promise<T> }

interface Unloader { family: GpuFamily; unload: () => Promise<void> }
const unloaders: Unloader[] = [];
/** Services register how to drop their weights. */
export function registerUnloader(family: GpuFamily, unload: () => Promise<void>) { unloaders.push({ family, unload }); }

let current: { family: GpuFamily; holders: number } | null = null;
const waiters: Array<() => void> = [];

async function acquire(family: GpuFamily): Promise<void> {
  // same family can share (the service batches internally); a different family waits for the card to be free
  for (;;) {
    if (!current) { current = { family, holders: 1 }; return; }
    if (current.family === family) { current.holders += 1; return; }
    await new Promise<void>((r) => waiters.push(r));
  }
}
function release() {
  if (!current) return;
  current.holders -= 1;
  if (current.holders <= 0) { current = null; const w = waiters.splice(0); for (const f of w) f(); }
}

async function evictOthers(family: GpuFamily) {
  for (const u of unloaders) if (u.family !== family) { try { await u.unload(); } catch (e) { log.warn({ family: u.family, err: (e as Error).message }, 'unload failed'); } }
}

let lastFamily: GpuFamily | null = null;

export const gpuLease: GpuLease = async (family, estimateMb, fn, opts = {}) => {
  const budget = env().GPU_VRAM_BUDGET_MB;
  if (estimateMb > budget) log.warn({ family, estimateMb, budget }, 'estimated VRAM exceeds the budget; the service must offload');
  const t0 = Date.now();
  await acquire(family);
  try {
    if (lastFamily && lastFamily !== family) { const tu = Date.now(); await evictOthers(family); log.info({ from: lastFamily, to: family, ms: Date.now() - tu }, 'gpu family switched'); }
    lastFamily = family;
    const waited = Date.now() - t0;
    if (waited > 1000) await recordMetric('gpu.wait_ms', waited, 'ms', { family }, opts.jobId);
    const tr = Date.now();
    const out = await fn();
    await recordMetric('gpu.hold_ms', Date.now() - tr, 'ms', { family }, opts.jobId);
    return out;
  } finally { release(); }
};
