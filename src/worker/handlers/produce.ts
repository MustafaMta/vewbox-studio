import type { Handler } from './index';
import { step } from './step';
import type { Production, Shot, StudioState, Take } from '@/domain/types';
import { StudioError } from '@/domain/errors';
import { readState } from '@/server/studio/engine';
import { enqueue, getJob, listJobs } from '@/server/jobs/queue';
import { isTerminalStatus, type Job } from '@/domain/jobs';
import { needsTake } from '@/studio/selectors';
import { orderedShots } from '@/domain/timeline';
import * as comfy from '@/server/providers/comfy';
import { requireApproval } from '@/server/org/gates';
import { effectiveRelation } from '@/server/production/shot-pack';
import { ensurePin, establishApprovedCuts } from '@/server/world';
import { waitFor as waitForJobs } from './wait';

/** PRODUCE — the "make everything" button: for each shot without an accepted take, draw the opening frame (when
 *  missing, and never for a continuation, which starts from the previous take's tail) and then generate a take;
 *  finally assemble. It is an orchestrator: it queues child jobs with idempotency keys (so a restart never doubles a
 *  MiniMax request), waits, and reports.
 *  PILOT GATE (docs/research/MINIMAX-CONTINUITY.md §3.9): in every scene not yet proven by an accepted take, the first
 *  shot to generate is a pilot; it is generated alone and must pass its checks (picture checks, and the script heard
 *  back for a speaking shot) before the scene's other shots are queued. A failed pilot stops that scene only. A
 *  continuation is queued strictly after its predecessor's take was ACCEPTED in this run (a failed predecessor blocks
 *  the chain behind it). One failed shot does not stop the other scenes; the summary says what is left. */

/** A take the studio may build on: real (not a bundled sample), READY, and its automatic checks passed. */
export const takeAccepted = (t: Take | undefined): boolean => Boolean(t && t.provider !== 'SAMPLE' && t.status === 'READY' && t.qa?.ok !== false);

/** The pilot of each scene among the shots to generate: the first of them in cut order, unless the scene already has
 *  a shot whose chosen take is accepted (the scene is proven, its gate is open). Scenes in cut order. */
export function planPilots(p: Production, targets: Shot[]): Array<{ sceneId: string; pilot?: Shot; rest: Shot[] }> {
  const ids = new Set(targets.map((t) => t.id));
  const order = orderedShots(p);
  const scenes: Array<{ sceneId: string; pilot?: Shot; rest: Shot[] }> = [];
  for (const sh of order.filter((x) => ids.has(x.id))) {
    let entry = scenes.find((s) => s.sceneId === sh.sceneId);
    if (!entry) {
      const proven = order.some((x) => x.sceneId === sh.sceneId && !ids.has(x.id) && takeAccepted(x.takes.find((t) => t.id === x.selectedTakeId)));
      entry = { sceneId: sh.sceneId, pilot: proven ? undefined : sh, rest: [] };
      scenes.push(entry);
      if (!proven) continue;
    }
    entry.rest.push(sh);
  }
  return scenes;
}

/** Whether a settled GENERATE_TAKE job produced a take that passed: the job completed (not failed, not awaiting a
 *  human ear) and the take it recorded is accepted. */
export function pilotVerdict(job: Pick<Job, 'status' | 'result' | 'error'> | undefined, state: Pick<StudioState, 'productions'>, productionId: string, shotId: string): { passed: boolean; takeId?: string; reason: string } {
  if (!job) return { passed: false, reason: 'the pilot job is missing' };
  if (job.status === 'FAILED' || job.status === 'CANCELLED') return { passed: false, reason: `the pilot ${job.status.toLowerCase()}: ${job.error?.message?.slice(0, 200) ?? 'no detail'}` };
  const takeId = typeof job.result?.takeId === 'string' ? job.result.takeId : undefined;
  const take = state.productions.find((x) => x.id === productionId)?.shots.find((s) => s.id === shotId)?.takes.find((t) => t.id === takeId);
  if (!take) return { passed: false, takeId, reason: 'the pilot recorded no take' };
  if (!takeAccepted(take)) return { passed: false, takeId, reason: `the pilot take failed its checks${take.rejectionReason ? ` (${take.rejectionReason})` : ''}` };
  if (job.status === 'AWAITING_REVIEW' || job.result?.takeUnverified === true) return { passed: false, takeId, reason: 'the pilot take could not be heard back and awaits a person’s review' };
  return { passed: true, takeId, reason: 'the pilot passed its checks' };
}

/** The orchestrator before step 14 (it held a worker slot and polled its children every 5 s): the rollback,
 *  PRODUCE_DAG=off, for one release. */
export const produceLegacy: Handler = async (ctx) => {
  const { productionId, shotIds, framesOnly, respeak } = ctx.job.payload as { productionId: string; shotIds?: string[]; framesOnly?: boolean; respeak?: boolean };
  const { state } = await readState();
  const p = state.productions.find((x) => x.id === productionId);
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  if (p.shots.length === 0) throw new StudioError('INVALID', 'Plan the shots before producing.');
  // the first human gate (the Quality Director's step): nothing is generated for a story nobody approved
  await step(ctx, 'quality-director', `story-gate: “${p.title}”`, () => requireApproval(productionId, 'STORY'));
  // THE WORLD BIBLE PIN (the World Continuity step): every approved cut in this world first registers the frames it
  // establishes (so a returning place is filmed against what the audience saw), then the production is pinned to the
  // revision of its approved story — or follows a newer one when nothing it already filmed changes; every take reads it
  const pin = await step(ctx, 'world-continuity', `world-pin: “${p.title}”`, async () => {
    const established = await establishApprovedCuts(state, p, { jobId: ctx.job.id });
    const fresh = established.some((e) => e.added) ? (await readState()).state : state;
    const out = await ensurePin(fresh, fresh.productions.find((x) => x.id === p.id) ?? p, { jobId: ctx.job.id, by: 'world-continuity' });
    await ctx.event(out.blocking.length ? 'warn' : 'info', `World Bible: ${out.message}`, { revision: out.view.revision.number, action: out.action, established: established.filter((e) => e.added), blocking: out.blocking });
    return { revision: out.view.revision.number, pinned: out.view.pinned, action: out.action, established: established.reduce((n, e) => n + e.added, 0), blocking: out.blocking.length };
  });
  // respeak: speaking shots whose chosen take never proved its words (made before the script check existed, or
  // failing it) get a new take through the audio-first pipeline; a passing new take becomes the choice
  const unverified = (sh: Shot) => { const t = sh.takes.find((x) => x.id === sh.selectedTakeId); const c = t?.qa?.checks.find((x) => x.name === 'script-spoken'); return sh.dialogue.length > 0 && (!t || t.provider === 'SAMPLE' || !c || !c.ok); };
  const targets = p.shots.filter((sh) => (!shotIds?.length || shotIds.includes(sh.id)) && (respeak ? unverified(sh) : needsTake(sh)));
  const round = ctx.job.attempts;
  // the cut is assembled when there is none yet, or when it is out of date (another take chosen, a shot changed —
  // audit M2, step 12): also when every shot already has its take
  const assembleIfNeeded = async (q: Production) => {
    if (q.shots.some((sh) => needsTake(sh)) || (q.cutAssetId && !q.cutStale)) return false;
    const req = { type: 'ASSEMBLE' as const, payload: { productionId }, parentId: ctx.job.id, idempotencyKey: `produce:${ctx.job.id}:assemble:${round}` };
    const r = await ctx.tool('jobs.enqueue', () => enqueue(req), { label: 'ASSEMBLE', input: req });
    await waitFor(ctx, [r.job.id], q.cutStale ? 'assembling again (the cut was out of date)' : 'assembling');
    return true;
  };
  if (targets.length === 0) {
    const assembled = !respeak && !framesOnly && (await assembleIfNeeded(p));
    return { message: respeak ? 'every speaking shot already has a verified take' : `every shot already has a chosen take${assembled ? '; the cut was out of date and was assembled again' : ''}`, shots: 0, ...(assembled ? { assembled: true } : {}) };
  }
  const children: string[] = [];
  // a reclaimed or retried run adopts the children it already queued and that are still working, so a shot never
  // gets a second generation in flight (and no duplicate MiniMax request)
  const inFlight = (await listJobs({ productionId, activeOnly: true, limit: 500 })).filter((j) => j.parentId === ctx.job.id);
  const adopt = (type: 'SHOT_FRAMES' | 'GENERATE_TAKE', shotId: string) => inFlight.find((j) => j.type === type && j.shotId === shotId)?.id;
  // frames first (local GPU, fast), then takes (MiniMax). Frames need the image engine; when its weights are not
  // there yet the takes go ahead from the prompt and references alone, and the summary says so. A continuation inside
  // its scene starts from the previous take's tail: it gets no opening frame.
  const imagesReady = await comfy.health().then(async (h) => h.ok && (await comfy.listModels('diffusion_models').catch(() => [] as string[])).some((m) => m.includes('qwen_image'))).catch(() => false);
  if (!imagesReady) await ctx.event('warn', 'image engine not ready: opening frames skipped, takes generated from prompt and references');
  await ctx.activity('PRODUCTION_STARTED', `“${p.title}”: ${targets.length} shot(s) to ${respeak ? 're-record' : 'generate'}${framesOnly ? ' (frames only)' : ''}`, { shots: targets.length, respeak: Boolean(respeak) });
  for (const sh of targets) {
    if (!sh.openingFrameAssetId && imagesReady && effectiveRelation(p, sh).relation !== 'CONTINUATION') {
      const existing = adopt('SHOT_FRAMES', sh.id);
      if (existing) { children.push(existing); continue; }
      const req = { type: 'SHOT_FRAMES' as const, payload: { productionId, shotId: sh.id }, parentId: ctx.job.id, idempotencyKey: `produce:${ctx.job.id}:frame:${sh.id}:${round}`, priority: 2 };
      const r = await ctx.tool('jobs.enqueue', () => enqueue(req), { label: 'SHOT_FRAMES', input: req });
      children.push(r.job.id);
    }
  }
  await waitFor(ctx, children, 'drawing frames');
  if (framesOnly) return { frames: children.length, shots: targets.length };
  const takeJobs: string[] = [];
  const jobOfShot = new Map<string, string>();
  const queueTake = async (sh: Shot) => {
    const existing = adopt('GENERATE_TAKE', sh.id);
    const req = { type: 'GENERATE_TAKE' as const, payload: { productionId, shotId: sh.id, ...(respeak ? { select: true } : {}) }, parentId: ctx.job.id, idempotencyKey: `produce:${ctx.job.id}:take:${sh.id}:${round}`, priority: 1 };
    const id = existing ?? (await ctx.tool('jobs.enqueue', () => enqueue(req), { label: 'GENERATE_TAKE', input: req })).job.id;
    takeJobs.push(id); jobOfShot.set(sh.id, id);
    return id;
  };
  /** whether the take a shot's job made in this run was accepted (a shot not generated in this run: its chosen take) */
  const acceptedInRun = async (shotId: string): Promise<boolean> => {
    const jobId = jobOfShot.get(shotId);
    const fresh = (await readState()).state;
    if (jobId) return pilotVerdict(await getJob(jobId), fresh, productionId, shotId).passed;
    const shot = fresh.productions.find((x) => x.id === productionId)?.shots.find((s) => s.id === shotId);
    return takeAccepted(shot?.takes.find((t) => t.id === shot.selectedTakeId));
  };
  // 1) THE PILOTS: the first shot of every unproven scene, generated alone
  const plan = planPilots(p, targets);
  const pilots = plan.filter((s) => s.pilot);
  for (const s of pilots) await queueTake(s.pilot!);
  if (pilots.length) await waitFor(ctx, pilots.map((s) => jobOfShot.get(s.pilot!.id)!), `pilot shot${pilots.length > 1 ? 's' : ''} (the first of ${pilots.length > 1 ? 'each scene' : 'the scene'})`);
  const fresh = (await readState()).state;
  const verdicts: Array<{ sceneId: string; sceneNumber?: number; shotId: string; passed: boolean; takeId?: string; reason: string }> = [];
  for (const s of pilots) {
    const sceneNumber = p.scenes.find((sc) => sc.id === s.sceneId)?.number;
    // THE PILOT GATE (the Quality Director's step): the scene's other shots wait for a pilot that passed its checks
    const v = await step(ctx, 'quality-director', `pilot-gate: scene ${sceneNumber ?? '?'} of “${p.title}”`, async () => {
      const verdict = pilotVerdict(await getJob(jobOfShot.get(s.pilot!.id)!), fresh, productionId, s.pilot!.id);
      await ctx.event(verdict.passed ? 'info' : 'warn', `scene ${sceneNumber ?? '?'}: ${verdict.reason}${verdict.passed ? '' : `; its other ${s.rest.length} shot(s) are not generated`}`, { sceneId: s.sceneId, shotId: s.pilot!.id, takeId: verdict.takeId, waiting: s.rest.length });
      return verdict;
    });
    verdicts.push({ sceneId: s.sceneId, sceneNumber, shotId: s.pilot!.id, ...v });
  }
  const open = new Set(plan.filter((s) => !s.pilot || verdicts.find((v) => v.sceneId === s.sceneId)?.passed).map((s) => s.sceneId));
  // 2) THE REST of every open scene, in cut order. A shot that continues the previous one is generated from that
  //    take's last frames, so it waits for its predecessor when the predecessor is in this run — and is not generated
  //    at all when the predecessor's take was not accepted; everything else runs in parallel
  const blocked: Array<{ shotId: string; reason: string }> = [];
  for (const sh of plan.filter((s) => open.has(s.sceneId)).flatMap((s) => s.rest)) {
    const { relation, previous } = effectiveRelation(p, sh);
    if (relation === 'CONTINUATION' && previous) {
      if (blocked.some((b) => b.shotId === previous.id)) { blocked.push({ shotId: sh.id, reason: `continues shot ${previous.number}, which was not generated` }); continue; }
      if (jobOfShot.has(previous.id)) {
        await waitFor(ctx, [jobOfShot.get(previous.id)!], 'waiting for the shot this one continues');
        if (!(await acceptedInRun(previous.id))) { blocked.push({ shotId: sh.id, reason: `continues shot ${previous.number}, whose take was not accepted` }); continue; }
      }
    }
    await queueTake(sh);
  }
  for (const s of plan.filter((x) => !open.has(x.sceneId))) for (const sh of s.rest) blocked.push({ shotId: sh.id, reason: `scene ${p.scenes.find((sc) => sc.id === s.sceneId)?.number ?? '?'}: its pilot did not pass` });
  const outcome = await waitFor(ctx, takeJobs, respeak ? 're-recording speaking shots' : 'generating takes');
  const after = (await readState()).state.productions.find((x) => x.id === productionId)!;
  const remaining = after.shots.filter((sh) => needsTake(sh)).length;
  const pilotsReport = verdicts.map((v) => ({ scene: v.sceneNumber, shotId: v.shotId, passed: v.passed, reason: v.reason }));
  if (respeak) { const still = after.shots.filter(unverified).length; return { shots: targets.length, completed: outcome.completed, failed: outcome.failed, pilots: pilotsReport, blocked, world: pin, stillUnverified: still, awaitingReview: still > 0 || blocked.length > 0 }; }
  if (remaining === 0) await assembleIfNeeded(after);
  await ctx.activity('PRODUCTION_ROUND', `“${p.title}”: ${outcome.completed} of ${targets.length} shot(s) generated${outcome.failed ? `, ${outcome.failed} failed` : ''}${blocked.length ? `, ${blocked.length} held back by a pilot or a predecessor` : ''}${remaining ? `, ${remaining} still without a take` : ''}`, { completed: outcome.completed, failed: outcome.failed, remaining, blocked: blocked.length });
  return { shots: targets.length, completed: outcome.completed, failed: outcome.failed, pilots: pilotsReport, blocked, world: pin, remainingWithoutTake: remaining, awaitingReview: remaining > 0 };
};

// ------------------------------------------------------------------------------- PRODUCE as a dependency graph

/** What PRODUCE remembers between its passes (`jobs.plan`, step 14). Shot ids, the child jobs it queued for them, the
 *  pilot gate's verdicts and what it held back. Everything else is read again on every pass. */
export interface ProducePlan {
  v: 1; round: number;
  targets: string[];
  imagesReady: boolean;
  world?: Record<string, unknown>;
  /** shotId → its SHOT_FRAMES job */
  frames: Record<string, string>;
  /** the scenes in cut order: their pilot (if unproven) and the other shots to generate */
  scenes?: Array<{ sceneId: string; pilot?: string; rest: string[] }>;
  /** shotId → its GENERATE_TAKE job */
  takes: Record<string, string>;
  verdicts?: Array<{ sceneId: string; sceneNumber?: number; shotId: string; passed: boolean; takeId?: string; reason: string }>;
  blocked: Array<{ shotId: string; reason: string }>;
  assembleJob?: string;
  /** nothing to generate: this run only assembles a stale cut */
  assembleOnly?: boolean;
}

const settledJob = (j: Job | undefined) => Boolean(j && settled(j.status));

/** PRODUCE — THE PLANNER (docs/BACKEND-AUDIT-2026-10.md M1, step 14). The same film as before (frames → the pilot of
 *  every unproven scene → the rest of each scene whose pilot passed, a continuation after its predecessor's accepted
 *  take → the cut), but as a dependency graph in the queue: every pass queues what is ready (idempotency keys
 *  `produce:<job>:<kind>:<shot>:<round>`, so a pass run twice queues nothing twice), records what it waits for and
 *  ends; the job WAITS without a worker slot and its children wake it. A crash mid-film resumes from the plan and the
 *  child jobs. A failed shot fails alone: its job is in the result (`failedShots`), and it is regenerated on its own
 *  (POST /api/productions/<id>/regenerate, or a retry of that job) — never by producing the film again.
 *  PRODUCE_DAG=off runs the polling orchestrator instead (rollback). */
export const produce: Handler = async (ctx) => {
  if (process.env.PRODUCE_DAG === 'off') return produceLegacy(ctx);
  const { productionId, shotIds, framesOnly, respeak } = ctx.job.payload as { productionId: string; shotIds?: string[]; framesOnly?: boolean; respeak?: boolean };
  // the failure round: a wake is not an attempt (src/server/jobs/queue.ts suspend), so the children's keys are stable
  // across passes and change only when the job itself is retried
  const round = ctx.job.attempts - (ctx.job.wakes ?? 0);
  const stored = ctx.job.plan as ProducePlan | undefined;
  let { state } = await readState();
  const prod = () => { const x = state.productions.find((y) => y.id === productionId); if (!x) throw new StudioError('NOT_FOUND', 'Production not found'); return x; };
  let p = prod();
  const unverified = (sh: Shot) => { const t = sh.takes.find((x) => x.id === sh.selectedTakeId); const c = t?.qa?.checks.find((x) => x.name === 'script-spoken'); return sh.dialogue.length > 0 && (!t || t.provider === 'SAMPLE' || !c || !c.ok); };
  const enqueueChild = async (req: { type: 'SHOT_FRAMES' | 'GENERATE_TAKE' | 'ASSEMBLE'; payload: Record<string, unknown>; key: string; priority?: number }) => {
    const input = { type: req.type, payload: req.payload, parentId: ctx.job.id, idempotencyKey: req.key, ...(req.priority !== undefined ? { priority: req.priority } : {}) };
    return (await ctx.tool('jobs.enqueue', () => enqueue(input), { label: req.type, input })).job.id;
  };
  const waitOn = (plan: ProducePlan, ids: string[], phase: string, done = 0, total = ids.length) => waitForJobs({ jobIds: ids, plan: plan as unknown as Record<string, unknown>, progress: { phase, message: `${phase}: ${done}/${total} finished`, step: done, total, percent: total ? Math.round((done / total) * 100) : null } });
  const needsAssembly = (q: Production) => !q.shots.some((sh) => needsTake(sh)) && !(q.cutAssetId && !q.cutStale);

  // ---- the first pass: the gates, the world pin, what to film, the frames ----
  let plan: ProducePlan;
  if (!stored || stored.round !== round) {
    if (p.shots.length === 0) throw new StudioError('INVALID', 'Plan the shots before producing.');
    await step(ctx, 'quality-director', `story-gate: “${p.title}”`, () => requireApproval(productionId, 'STORY'));
    const world = await step(ctx, 'world-continuity', `world-pin: “${p.title}”`, async () => {
      const established = await establishApprovedCuts(state, p, { jobId: ctx.job.id });
      const fresh = established.some((e) => e.added) ? (await readState()).state : state;
      const out = await ensurePin(fresh, fresh.productions.find((x) => x.id === p.id) ?? p, { jobId: ctx.job.id, by: 'world-continuity' });
      await ctx.event(out.blocking.length ? 'warn' : 'info', `World Bible: ${out.message}`, { revision: out.view.revision.number, action: out.action, established: established.filter((e) => e.added), blocking: out.blocking });
      return { revision: out.view.revision.number, pinned: out.view.pinned, action: out.action, established: established.reduce((n, e) => n + e.added, 0), blocking: out.blocking.length };
    });
    const targets = p.shots.filter((sh) => (!shotIds?.length || shotIds.includes(sh.id)) && (respeak ? unverified(sh) : needsTake(sh)));
    plan = { v: 1, round, targets: targets.map((s) => s.id), imagesReady: false, world, frames: {}, takes: {}, blocked: [] };
    if (targets.length === 0) {
      if (respeak || framesOnly || !needsAssembly(p)) return { message: respeak ? 'every speaking shot already has a verified take' : 'every shot already has a chosen take', shots: 0 };
      plan.assembleOnly = true;
      plan.assembleJob = await enqueueChild({ type: 'ASSEMBLE', payload: { productionId }, key: `produce:${ctx.job.id}:assemble:${round}` });
      return waitOn(plan, [plan.assembleJob], p.cutStale ? 'assembling again (the cut was out of date)' : 'assembling');
    }
    plan.imagesReady = await comfy.health().then(async (h) => h.ok && (await comfy.listModels('diffusion_models').catch(() => [] as string[])).some((m) => m.includes('qwen_image'))).catch(() => false);
    if (!plan.imagesReady) await ctx.event('warn', 'image engine not ready: opening frames skipped, takes generated from prompt and references');
    await ctx.activity('PRODUCTION_STARTED', `“${p.title}”: ${targets.length} shot(s) to ${respeak ? 're-record' : 'generate'}${framesOnly ? ' (frames only)' : ''}`, { shots: targets.length, respeak: Boolean(respeak) });
    // frames first (local GPU, fast); a continuation starts from the previous take's tail and gets none
    for (const sh of targets) {
      if (sh.openingFrameAssetId || !plan.imagesReady || effectiveRelation(p, sh).relation === 'CONTINUATION') continue;
      plan.frames[sh.id] = await enqueueChild({ type: 'SHOT_FRAMES', payload: { productionId, shotId: sh.id }, key: `produce:${ctx.job.id}:frame:${sh.id}:${round}`, priority: 2 });
    }
    const frameJobs = Object.values(plan.frames);
    if (frameJobs.length) return waitOn(plan, frameJobs, 'drawing frames');
  } else plan = { ...stored, frames: { ...stored.frames }, takes: { ...stored.takes }, blocked: [...stored.blocked] };

  if (plan.assembleOnly) {
    const a = plan.assembleJob ? await getJob(plan.assembleJob) : undefined;
    if (a && !settledJob(a)) return waitOn(plan, [a.id], 'assembling');
    return { message: 'every shot already has a chosen take; the cut was out of date and was assembled again', shots: 0, assembled: true, ...(a?.status === 'FAILED' ? { assembleFailed: true, assembleJobId: a.id } : {}) };
  }
  if (framesOnly) return { frames: Object.keys(plan.frames).length, shots: plan.targets.length };
  const targets = plan.targets.map((id) => p.shots.find((s) => s.id === id)).filter((s): s is Shot => Boolean(s));
  const queueTake = async (sh: Shot) => { plan.takes[sh.id] = await enqueueChild({ type: 'GENERATE_TAKE', payload: { productionId, shotId: sh.id, ...(respeak ? { select: true } : {}) }, key: `produce:${ctx.job.id}:take:${sh.id}:${round}`, priority: 1 }); };

  // ---- 1) the pilots: the first shot of every unproven scene, generated alone ----
  if (!plan.scenes) {
    plan.scenes = planPilots(p, targets).map((s) => ({ sceneId: s.sceneId, pilot: s.pilot?.id, rest: s.rest.map((x) => x.id) }));
    for (const s of plan.scenes) if (s.pilot) { const sh = targets.find((x) => x.id === s.pilot); if (sh) await queueTake(sh); }
    const pilotJobs = plan.scenes.flatMap((s) => (s.pilot && plan.takes[s.pilot] ? [plan.takes[s.pilot]] : []));
    if (pilotJobs.length) return waitOn(plan, pilotJobs, `pilot shot${pilotJobs.length > 1 ? 's' : ''} (the first of ${pilotJobs.length > 1 ? 'each scene' : 'the scene'})`);
  }
  // ---- the pilot gate (the Quality Director's step), once every pilot has settled ----
  if (!plan.verdicts) {
    plan.verdicts = [];
    for (const s of plan.scenes.filter((x) => x.pilot)) {
      const sceneNumber = p.scenes.find((sc) => sc.id === s.sceneId)?.number;
      const v = await step(ctx, 'quality-director', `pilot-gate: scene ${sceneNumber ?? '?'} of “${p.title}”`, async () => {
        const verdict = pilotVerdict(await getJob(plan.takes[s.pilot!]), state, productionId, s.pilot!);
        await ctx.event(verdict.passed ? 'info' : 'warn', `scene ${sceneNumber ?? '?'}: ${verdict.reason}${verdict.passed ? '' : `; its other ${s.rest.length} shot(s) are not generated`}`, { sceneId: s.sceneId, shotId: s.pilot, takeId: verdict.takeId, waiting: s.rest.length });
        return verdict;
      });
      plan.verdicts.push({ sceneId: s.sceneId, sceneNumber, shotId: s.pilot!, ...v });
      if (!v.passed) for (const id of s.rest) plan.blocked.push({ shotId: id, reason: `scene ${sceneNumber ?? '?'}: its pilot did not pass` });
    }
  }

  // ---- 2) the rest of every open scene, in cut order: whatever is ready is queued now; a continuation waits for the
  //         pass after its predecessor's take settled, and is held back when that take was not accepted ----
  const isBlocked = (id: string) => plan.blocked.some((b) => b.shotId === id);
  const waitingOn: string[] = [];
  for (const s of plan.scenes) {
    for (const id of s.rest) {
      if (plan.takes[id] || isBlocked(id)) continue;
      const sh = p.shots.find((x) => x.id === id);
      if (!sh) { plan.blocked.push({ shotId: id, reason: 'the shot no longer exists' }); continue; }
      const { relation, previous } = effectiveRelation(p, sh);
      if (relation === 'CONTINUATION' && previous) {
        if (isBlocked(previous.id)) { plan.blocked.push({ shotId: id, reason: `continues shot ${previous.number}, which was not generated` }); continue; }
        const prevJobId = plan.takes[previous.id];
        if (prevJobId) {
          const prevJob = await getJob(prevJobId);
          if (!settledJob(prevJob)) { waitingOn.push(prevJobId); continue; }
          if (!pilotVerdict(prevJob, state, productionId, previous.id).passed) { plan.blocked.push({ shotId: id, reason: `continues shot ${previous.number}, whose take was not accepted` }); continue; }
        }
      }
      await queueTake(sh);
    }
  }
  const takeJobs = Object.values(plan.takes);
  const jobs = await Promise.all(takeJobs.map((id) => getJob(id)));
  const open = takeJobs.filter((_, i) => !settledJob(jobs[i]));
  if (open.length || waitingOn.length) return waitOn(plan, Array.from(new Set([...open, ...waitingOn])), respeak ? 're-recording speaking shots' : 'generating takes', takeJobs.length - open.length, takeJobs.length);

  // ---- 3) every take settled: the cut, then the report ----
  state = (await readState()).state; p = prod();
  const remaining = p.shots.filter((sh) => needsTake(sh)).length;
  if (!respeak && remaining === 0 && needsAssembly(p) && !plan.assembleJob) {
    plan.assembleJob = await enqueueChild({ type: 'ASSEMBLE', payload: { productionId }, key: `produce:${ctx.job.id}:assemble:${round}` });
    return waitOn(plan, [plan.assembleJob], p.cutStale ? 'assembling again (the cut was out of date)' : 'assembling');
  }
  if (plan.assembleJob) { const a = await getJob(plan.assembleJob); if (a && !settledJob(a)) return waitOn(plan, [a.id], 'assembling'); }
  const completed = jobs.filter((j) => j?.status === 'COMPLETED' || j?.status === 'AWAITING_REVIEW').length;
  const byId = new Map(takeJobs.map((id, i) => [id, jobs[i]] as const));
  const failedShots = Object.entries(plan.takes).flatMap(([shotId, jobId]) => { const j = byId.get(jobId); return j && (j.status === 'FAILED' || j.status === 'CANCELLED') ? [{ shotId, jobId, reason: j.error?.message?.slice(0, 200) ?? j.status.toLowerCase() }] : []; });
  const failed = failedShots.length;
  const pilotsReport = (plan.verdicts ?? []).map((v) => ({ scene: v.sceneNumber, shotId: v.shotId, passed: v.passed, reason: v.reason }));
  if (respeak) { const still = p.shots.filter(unverified).length; return { shots: plan.targets.length, completed, failed, failedShots, pilots: pilotsReport, blocked: plan.blocked, world: plan.world, stillUnverified: still, awaitingReview: still > 0 || plan.blocked.length > 0 }; }
  await ctx.activity('PRODUCTION_ROUND', `“${p.title}”: ${completed} of ${plan.targets.length} shot(s) generated${failed ? `, ${failed} failed (each can be regenerated on its own)` : ''}${plan.blocked.length ? `, ${plan.blocked.length} held back by a pilot or a predecessor` : ''}${remaining ? `, ${remaining} still without a take` : ''}`, { completed, failed, remaining, blocked: plan.blocked.length });
  return { shots: plan.targets.length, completed, failed, failedShots, pilots: pilotsReport, blocked: plan.blocked, world: plan.world, remainingWithoutTake: remaining, awaitingReview: remaining > 0 };
};

/** A child job is settled when it is terminal or waits for a person (AWAITING_REVIEW is not terminal, but nothing more
 *  will happen to it without a person: waiting on it would never end). */
const settled = (s: Job['status']) => isTerminalStatus(s) || s === 'AWAITING_REVIEW';

async function waitFor(ctx: Parameters<Handler>[0], ids: string[], phase: string): Promise<{ completed: number; failed: number }> {
  if (ids.length === 0) return { completed: 0, failed: 0 };
  for (;;) {
    await ctx.checkpoint();
    const jobs = await Promise.all(ids.map((id) => getJob(id)));
    const done = jobs.filter((j) => j && settled(j.status));
    const completed = jobs.filter((j) => j?.status === 'COMPLETED' || j?.status === 'AWAITING_REVIEW').length;
    const failed = jobs.filter((j) => j?.status === 'FAILED' || j?.status === 'CANCELLED').length;
    await ctx.progress('GENERATING', { phase, message: `${phase}: ${done.length}/${ids.length} finished${failed ? `, ${failed} failed` : ''}`, step: done.length, total: ids.length, percent: Math.round((done.length / ids.length) * 100) });
    if (done.length === ids.length) return { completed, failed };
    await new Promise((r) => setTimeout(r, 5000));
  }
}

export { listJobs };
