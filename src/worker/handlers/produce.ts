import type { Handler } from './index';
import type { Shot } from '@/domain/types';
import { StudioError } from '@/domain/errors';
import { readState } from '@/server/studio/engine';
import { enqueue, getJob, listJobs } from '@/server/jobs/queue';
import { isTerminalStatus } from '@/domain/jobs';
import { needsTake } from '@/studio/selectors';
import { orderedShots } from '@/domain/timeline';
import * as comfy from '@/server/providers/comfy';
import { requireApproval } from '@/server/org/gates';

/** PRODUCE — the "make everything" button: for each shot without an accepted take, draw the opening frame (when
 *  missing) and then generate a take; record the dialogue when the voice service is up; finally assemble. It is an
 *  orchestrator: it queues child jobs with idempotency keys (so a restart never doubles a MiniMax request), waits,
 *  and reports. One failed shot does not stop the others; the summary says what is left. */

export const produce: Handler = async (ctx) => {
  const { productionId, shotIds, framesOnly, respeak } = ctx.job.payload as { productionId: string; shotIds?: string[]; framesOnly?: boolean; respeak?: boolean };
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === productionId);
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  if (p.shots.length === 0) throw new StudioError('INVALID', 'Plan the shots before producing.');
  // the first human gate: nothing is generated for a story nobody approved
  await requireApproval(productionId, 'STORY');
  // respeak: speaking shots whose chosen take never proved its words (made before the script check existed, or
  // failing it) get a new take through the audio-first pipeline; a passing new take becomes the choice
  const unverified = (sh: Shot) => { const t = sh.takes.find((x) => x.id === sh.selectedTakeId); const c = t?.qa?.checks.find((x) => x.name === 'script-spoken'); return sh.dialogue.length > 0 && (!t || t.provider === 'SAMPLE' || !c || !c.ok); };
  const targets = p.shots.filter((sh) => (!shotIds?.length || shotIds.includes(sh.id)) && (respeak ? unverified(sh) : needsTake(sh)));
  if (targets.length === 0) return { message: respeak ? 'every speaking shot already has a verified take' : 'every shot already has a chosen take', shots: 0 };
  const round = ctx.job.attempts;
  const children: string[] = [];
  // a reclaimed or retried run adopts the children it already queued and that are still working, so a shot never
  // gets a second generation in flight (and no duplicate MiniMax request)
  const inFlight = (await listJobs({ productionId, activeOnly: true, limit: 500 })).filter((j) => j.parentId === ctx.job.id);
  const adopt = (type: 'SHOT_FRAMES' | 'GENERATE_TAKE', shotId: string) => inFlight.find((j) => j.type === type && j.shotId === shotId)?.id;
  // frames first (local GPU, fast), then takes (MiniMax). Frames need the image engine; when its weights are not
  // there yet the takes go ahead from the prompt and references alone, and the summary says so.
  const imagesReady = await comfy.health().then(async (h) => h.ok && (await comfy.listModels('diffusion_models').catch(() => [] as string[])).some((m) => m.includes('qwen_image'))).catch(() => false);
  if (!imagesReady) await ctx.event('warn', 'image engine not ready: opening frames skipped, takes generated from prompt and references');
  await ctx.activity('PRODUCTION_STARTED', `“${p.title}”: ${targets.length} shot(s) to ${respeak ? 're-record' : 'generate'}${framesOnly ? ' (frames only)' : ''}`, { shots: targets.length, respeak: Boolean(respeak) });
  for (const sh of targets) {
    if (!sh.openingFrameAssetId && imagesReady) {
      const existing = adopt('SHOT_FRAMES', sh.id);
      if (existing) { children.push(existing); continue; }
      const r = await ctx.tool('jobs.enqueue', () => enqueue({ type: 'SHOT_FRAMES', payload: { productionId, shotId: sh.id }, parentId: ctx.job.id, idempotencyKey: `produce:${ctx.job.id}:frame:${sh.id}:${round}`, priority: 2 }), { label: 'SHOT_FRAMES' });
      children.push(r.job.id);
    }
  }
  await waitFor(ctx, children, 'drawing frames');
  if (framesOnly) return { frames: children.length, shots: targets.length };
  // a shot that continues the previous one is generated from that take's last frames, so it must wait for its
  // predecessor when the predecessor is in this run; everything else runs in parallel
  const takeJobs: string[] = [];
  const jobOfShot = new Map<string, string>();
  const order = orderedShots(p);
  const targetIds = new Set(targets.map((t) => t.id));
  for (const sh of order.filter((x) => targetIds.has(x.id))) {
    const prev = order[order.findIndex((x) => x.id === sh.id) - 1];
    if (sh.continuity?.relationToPrevious === 'CONTINUATION' && prev && prev.sceneId === sh.sceneId && jobOfShot.has(prev.id)) await waitFor(ctx, [jobOfShot.get(prev.id)!], `waiting for the shot this one continues`);
    const existing = adopt('GENERATE_TAKE', sh.id);
    const id = existing ?? (await ctx.tool('jobs.enqueue', () => enqueue({ type: 'GENERATE_TAKE', payload: { productionId, shotId: sh.id, ...(respeak ? { select: true } : {}) }, parentId: ctx.job.id, idempotencyKey: `produce:${ctx.job.id}:take:${sh.id}:${round}`, priority: 1 }), { label: 'GENERATE_TAKE' })).job.id;
    takeJobs.push(id); jobOfShot.set(sh.id, id);
  }
  const outcome = await waitFor(ctx, takeJobs, respeak ? 're-recording speaking shots' : 'generating takes');
  const fresh = (await readState()).state.productions.find((x) => x.id === productionId)!;
  const remaining = fresh.shots.filter((sh) => needsTake(sh)).length;
  if (respeak) { const still = fresh.shots.filter(unverified).length; return { shots: targets.length, completed: outcome.completed, failed: outcome.failed, stillUnverified: still, awaitingReview: still > 0 }; }
  if (remaining === 0 && !fresh.cutAssetId) {
    const r = await ctx.tool('jobs.enqueue', () => enqueue({ type: 'ASSEMBLE', payload: { productionId }, parentId: ctx.job.id, idempotencyKey: `produce:${ctx.job.id}:assemble:${round}` }), { label: 'ASSEMBLE' });
    await waitFor(ctx, [r.job.id], 'assembling');
  }
  await ctx.activity('PRODUCTION_ROUND', `“${p.title}”: ${outcome.completed} of ${targets.length} shot(s) generated${outcome.failed ? `, ${outcome.failed} failed` : ''}${remaining ? `, ${remaining} still without a take` : ''}`, { completed: outcome.completed, failed: outcome.failed, remaining });
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
