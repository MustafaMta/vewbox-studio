import { env } from '../env';
import { engineGuardProblem, isLocalEngine } from '../gpu/lease-db';
import { log } from '../log';
import { StudioError } from '@/domain/errors';

/** THE vLLM PLANNER SERVER (compose service llm-vllm) and how it lets go of the card. Qwen3.8-27B-NVFP4 holds most of
 *  it (24.2 GiB of weights plus its cache, ≈ 30 GB in all); on a family switch the GPU lease puts vLLM to SLEEP LEVEL 2
 *  (weights and KV cache dropped from VRAM, nothing parked in host RAM: 0.4 s, ≈ 1.7 GB of CUDA context stays), and the
 *  next LLM call WAKES it inside its own lease: the weights are reloaded from the store (`reload_weights`), then the
 *  cache is re-allocated (≈ 6 s, measured 2026-10-07). The sleep/wake endpoints are vLLM's dev endpoints
 *  (VLLM_SERVER_DEV_MODE=1; the port is bound to 127.0.0.1 only). Every call is bounded; an engine that is not running
 *  has nothing on the card. */

/** vLLM's base URL (without /v1) for the configured planner; undefined when none is configured (or outside the live lease). */
export function localVllmBase(): string | undefined {
  const url = env().OPENAI_COMPATIBLE_BASE_URL;
  if (!url || !isLocalEngine(url)) return undefined;
  const base = url.replace(/\/v1\/?$/, '').replace(/\/$/, '');
  return engineGuardProblem(base) ? undefined : base;
}

const post = (url: string, body?: unknown, ms = 30_000) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(ms) });

/** Whether the server sleeps (undefined: not reachable). */
export async function vllmSleeping(base: string): Promise<boolean | undefined> {
  try {
    const r = await fetch(`${base}/is_sleeping`, { signal: AbortSignal.timeout(5_000) });
    if (!r.ok) return undefined;
    return Boolean(((await r.json()) as { is_sleeping?: boolean }).is_sleeping);
  } catch { return undefined; }
}

/** Sleep level 2: the weights and the KV cache leave VRAM (not parked in host RAM). Idempotent. */
export async function sleepVllm(base: string | undefined = localVllmBase()): Promise<void> {
  if (!base) return;
  const sleeping = await vllmSleeping(base);
  if (sleeping !== false) return; // asleep already, or not running
  const t0 = Date.now();
  const r = await post(`${base}/sleep?level=2`, undefined, 120_000);
  if (!r.ok) throw new Error(`vLLM /sleep: HTTP ${r.status} ${await r.text().catch(() => '')}`);
  log.info({ ms: Date.now() - t0 }, 'vllm: asleep (level 2)');
}

/** Wake from level 2 (weights reloaded from the store, then the cache), when asleep. Bounded; a failure is a
 *  retryable infrastructure error (the job's next attempt wakes it again). */
export async function wakeVllm(base: string, opts: { timeoutMs?: number } = {}): Promise<{ wokeMs?: number }> {
  if ((await vllmSleeping(base)) !== true) return {};
  const t0 = Date.now();
  const ms = opts.timeoutMs ?? 600_000;
  try {
    const step = async (what: string, url: string, body?: unknown) => { const r = await post(url, body, ms); if (!r.ok) throw new Error(`${what}: HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 300)}`); };
    await step('wake weights', `${base}/wake_up?tags=weights`);
    await step('reload weights', `${base}/collective_rpc`, { method: 'reload_weights' });
    await step('wake kv cache', `${base}/wake_up?tags=kv_cache`);
    await post(`${base}/reset_prefix_cache`, undefined, 30_000).catch(() => undefined);
  } catch (e) {
    throw Object.assign(new StudioError('UNAVAILABLE', `The planner (vLLM) could not wake: ${(e as Error).message}`, { reason: 'LLM_WAKE_FAILED' }), { failureClass: 'INFRASTRUCTURE', retryable: true });
  }
  const wokeMs = Date.now() - t0;
  log.info({ ms: wokeMs }, 'vllm: awake');
  return { wokeMs };
}
