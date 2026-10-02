import type { Handler } from './index';
import { StudioError } from '@/domain/errors';
import { readState } from '@/server/studio/engine';
import { enqueue, getJob, listJobs } from '@/server/jobs/queue';
import { isTerminalStatus } from '@/domain/jobs';
import { needsTake } from '@/studio/selectors';
import * as comfy from '@/server/providers/comfy';

/** PRODUCE — the "make everything" button: for each shot without an accepted take, draw the opening frame (when
 *  missing) and then generate a take; record the dialogue when the voice service is up; finally assemble. It is an
 *  orchestrator: it queues child jobs with idempotency keys (so a restart never doubles a MiniMax request), waits,
 *  and reports. One failed shot does not stop the others; the summary says what is left. */

export const produce: Handler = async (ctx) => {
  const { productionId, shotIds, framesOnly } = ctx.job.payload as { productionId: string; shotIds?: string[]; framesOnly?: boolean };
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === productionId);
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  if (p.shots.length === 0) throw new StudioError('INVALID', 'Plan the shots before producing.');
  const targets = p.shots.filter((sh) => (!shotIds?.length || shotIds.includes(sh.id)) && needsTake(sh));
  if (targets.length === 0) return { message: 'every shot already has a chosen take', shots: 0 };
  const round = ctx.job.attempts;
  const children: string[] = [];
  // frames first (local GPU, fast), then takes (MiniMax). Frames need the image engine; when its weights are not
  // there yet the takes go ahead from the prompt and references alone, and the summary says so.
  const imagesReady = await comfy.health().then(async (h) => h.ok && (await comfy.listModels('diffusion_models').catch(() => [] as string[])).some((m) => m.includes('qwen_image'))).catch(() => false);
  if (!imagesReady) await ctx.event('warn', 'image engine not ready: opening frames skipped, takes generated from prompt and references');
  for (const sh of targets) {
    if (!sh.openingFrameAssetId && imagesReady) {
      const r = await enqueue({ type: 'SHOT_FRAMES', payload: { productionId, shotId: sh.id }, parentId: ctx.job.id, idempotencyKey: `produce:${ctx.job.id}:frame:${sh.id}:${round}`, priority: 2 });
      children.push(r.job.id);
    }
  }
  await waitFor(ctx, children, 'drawing frames');
  if (framesOnly) return { frames: children.length, shots: targets.length };
  const takeJobs: string[] = [];
  for (const sh of targets) {
    const r = await enqueue({ type: 'GENERATE_TAKE', payload: { productionId, shotId: sh.id }, parentId: ctx.job.id, idempotencyKey: `produce:${ctx.job.id}:take:${sh.id}:${round}`, priority: 1 });
    takeJobs.push(r.job.id);
  }
  const outcome = await waitFor(ctx, takeJobs, 'generating takes');
  const fresh = (await readState()).state.productions.find((x) => x.id === productionId)!;
  const remaining = fresh.shots.filter((sh) => needsTake(sh)).length;
  if (remaining === 0 && !fresh.cutAssetId) {
    const r = await enqueue({ type: 'ASSEMBLE', payload: { productionId }, parentId: ctx.job.id, idempotencyKey: `produce:${ctx.job.id}:assemble:${round}` });
    await waitFor(ctx, [r.job.id], 'assembling');
  }
  return { shots: targets.length, completed: outcome.completed, failed: outcome.failed, remainingWithoutTake: remaining, awaitingReview: remaining > 0 };
};

async function waitFor(ctx: Parameters<Handler>[0], ids: string[], phase: string): Promise<{ completed: number; failed: number }> {
  if (ids.length === 0) return { completed: 0, failed: 0 };
  for (;;) {
    await ctx.checkpoint();
    const jobs = await Promise.all(ids.map((id) => getJob(id)));
    const done = jobs.filter((j) => j && isTerminalStatus(j.status));
    const completed = jobs.filter((j) => j?.status === 'COMPLETED').length;
    const failed = jobs.filter((j) => j?.status === 'FAILED' || j?.status === 'CANCELLED').length;
    await ctx.progress('GENERATING', { phase, message: `${phase}: ${done.length}/${ids.length} finished${failed ? `, ${failed} failed` : ''}`, step: done.length, total: ids.length, percent: Math.round((done.length / ids.length) * 100) });
    if (done.length === ids.length) return { completed, failed };
    await new Promise((r) => setTimeout(r, 5000));
  }
}

export { listJobs };
