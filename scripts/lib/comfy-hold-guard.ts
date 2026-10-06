/** A benchmark's ComfyUI prompts never outlive its GPU hold (coordinator, 2026-10-06: a prompt left in ComfyUI's queue
 *  when a hold's command exits runs while another family holds the card). Every prompt the script submits is tracked
 *  (pass `track` as comfy.run's `onSubmitted`); on SIGINT/SIGTERM, an uncaught error or a normal exit, whatever is
 *  still pending or running of OURS is cancelled (comfy.cancelPrompt: dequeue or targeted interrupt — never another
 *  process's prompt). `assertIdle` refuses to start while ComfyUI has anything queued.
 *  A process killed outright (TerminateProcess on Windows) runs no handler: gpu-hold's own child.kill() is a soft kill
 *  on POSIX only, so the harnesses also bound each batch with --limit-min and never submit after the deadline. */
import * as comfy from '@/server/providers/comfy';

const live = new Set<string>();
let installed = false;

export function track(promptId: string): void { live.add(promptId); }
export function settled(promptId?: string): void { if (promptId) live.delete(promptId); }

export async function cancelOurs(reason: string): Promise<void> {
  for (const id of [...live]) {
    try { await comfy.cancelPrompt(id); console.error(`[hold-guard] cancelled ComfyUI prompt ${id} (${reason})`); } catch (e) { console.error(`[hold-guard] could not cancel ${id}: ${(e as Error).message}`); }
    live.delete(id);
  }
}

export function installHoldGuard(): void {
  if (installed) return; installed = true;
  const stop = (sig: string) => { void cancelOurs(sig).finally(() => process.exit(130)); };
  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));
  process.once('SIGBREAK', () => stop('SIGBREAK'));
  process.on('beforeExit', () => { if (live.size) void cancelOurs('exit'); });
}

export async function assertIdle(): Promise<void> {
  const base = process.env.COMFYUI_URL ?? 'http://127.0.0.1:8188';
  const q = await fetch(`${base}/queue`).then((r) => r.json() as Promise<{ queue_running: unknown[]; queue_pending: unknown[] }>);
  if (q.queue_running.length + q.queue_pending.length) throw new Error(`ComfyUI is busy (${q.queue_running.length} running, ${q.queue_pending.length} pending); a benchmark needs the card to itself`);
}
