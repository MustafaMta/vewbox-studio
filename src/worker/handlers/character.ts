import type { Handler, HandlerContext } from './index';
import { step } from './step';
import { StudioError, asStudioErrorCode, missingReference } from '@/domain/errors';
import type { Character } from '@/domain/types';
import { isTerminalStatus, profileNeedsDesign, type CreateCharacterResult, type CreateCharacterStep, type CreateCharacterStepOutcome, type Job, type JobPayloadParsed, type JobType } from '@/domain/jobs';
import { runCommand, type Command } from '@/domain/commands';
import type { CharacterInput } from '@/domain/actions';
import { commands, readState, stampCommands, type CommandSpec } from '@/server/studio/engine';
import { enqueue, getJob, retry } from '@/server/jobs/queue';
import { preflightCharacter, referenceImageProblem } from '@/server/org/preflight';
import { LOOK_FIELDS, REFERENCE_LOOK_BRIEF } from '@/server/story/schemas';

/** CREATE A CHARACTER — the one job behind the three starts of the character page (contract §1.1): Describe (AUTO),
 *  Write the sheet (MANUAL), From a picture (REFERENCE). It runs the chain as durable child jobs — design (only when
 *  fields are missing) → the canonical image (CHARACTER_APPEARANCE: one front full-body picture, contract v2) → voice
 *  (only when a reference exists) — each with the key
 *  `create:${jobId}:${step}` and this job as parent, so a restart adopts the children already queued and never
 *  runs a step twice. Progress is `step/total` over the real phases. Partial success keeps the record: the result
 *  lists every step as done, skipped (why) or failed (class, message); nothing is reported done that did not happen. */

/** design → image → voice (contract v2: no sheet or extra views by default; "appearance" is the canonical-image step). */
const STEPS: CreateCharacterStep[] = ['design', 'appearance', 'voice'];
const CHILD_TYPE: Record<CreateCharacterStep, JobType> = { design: 'DESIGN_CHARACTER', appearance: 'CHARACTER_APPEARANCE', voice: 'VOICE_BUILD' };
const LABEL: Record<CreateCharacterStep, string> = { design: 'Designing the character', appearance: 'Drawing the character image', voice: 'Building the voice' };
/** The DESIGN_CHARACTER payload's brief limit (src/domain/jobs.ts). */
const BRIEF_MAX = 2000;
/** In REFERENCE mode the look fields are the picture's: they count as present when deciding whether to design. */
const PICTURE_LOOK = Object.fromEntries(LOOK_FIELDS.map((k) => [k, 'as in the reference picture'])) as Record<(typeof LOOK_FIELDS)[number], string>;

/** How the chain waits (finding 10): it polls its child, and gives up after a wall-clock bound — the Casting
 *  Director's own `limits.timeoutMs` (src/server/org/model.ts), else this default. Mutable for tests. */
export const CHAIN_TIMING = { pollMs: 3000, timeoutMs: 60 * 60_000 };

interface Chain { deadline: number; boundMs: number; children: string[] }

/** Queue one step as a child (or adopt the child an earlier attempt queued under the same key) and wait for it.
 *  An adopted child that FAILED or was CANCELLED is run again (finding 12: a retry of the parent — the generic
 *  /api/jobs/{id}/retry, or a reclaim — must make progress, not re-report the old failure). Past the chain's
 *  deadline the parent fails INFRASTRUCTURE naming the children; they keep running and a retry adopts them. */
async function runStep(ctx: HandlerContext, chain: Chain, step: CreateCharacterStep, payload: Record<string, unknown>, index: number): Promise<Job> {
  const type = CHILD_TYPE[step];
  const req = { type, payload, parentId: ctx.job.id, idempotencyKey: `create:${ctx.job.id}:${step}`, priority: 1 };
  const r = await ctx.tool('jobs.enqueue', () => enqueue(req), { label: type, input: req });
  let job = r.job;
  chain.children.push(job.id);
  if (!r.created) {
    await ctx.event('info', `${step}: adopted job ${job.id} (${job.status})`, { step, jobId: job.id, status: job.status });
    if (job.status === 'FAILED' || job.status === 'CANCELLED') {
      const before = job.status;
      job = await retry(job.id).catch(async () => (await getJob(job.id)) ?? job); // a concurrent retry got there first
      await ctx.event('info', `${step}: the earlier ${type} ${job.id} had ${before.toLowerCase()}; running it again`, { step, jobId: job.id, was: before });
    }
  }
  for (;;) {
    await ctx.checkpoint();
    if (isTerminalStatus(job.status) || job.status === 'AWAITING_REVIEW') return job;
    if (Date.now() > chain.deadline) {
      throw new StudioError('UNAVAILABLE', `The ${step} step did not finish within ${Math.round(chain.boundMs / 60_000)} min (${type} ${job.id} is still ${job.status.toLowerCase()}); it keeps running — retry the creation to pick it up.`, { failureClass: 'INFRASTRUCTURE', step, childJobId: job.id, children: [...chain.children], timeoutMs: chain.boundMs });
    }
    await ctx.progress('GENERATING', { phase: step, message: `${LABEL[step]}${job.progress?.message ? `: ${job.progress.message}` : ''}`, step: index + 1, total: STEPS.length, percent: null });
    await new Promise((res) => setTimeout(res, CHAIN_TIMING.pollMs));
    job = (await getJob(job.id)) ?? job;
  }
}

const outcomeOf = (step: CreateCharacterStep, job: Job): CreateCharacterStepOutcome => (job.status === 'COMPLETED' || job.status === 'AWAITING_REVIEW'
  ? { step, status: 'done', jobId: job.id, ...(job.status === 'AWAITING_REVIEW' ? { reason: 'awaiting review' } : {}) }
  : { step, status: 'failed', jobId: job.id, reason: job.error?.message ?? job.status.toLowerCase(), failureClass: (job.error?.details?.failureClass as string | undefined) ?? (job.status === 'CANCELLED' ? 'CANCELLED' : 'UNKNOWN') });

export const createCharacter: Handler = async (ctx) => {
  const payload = ctx.job.payload as JobPayloadParsed<'CREATE_CHARACTER'>;
  const boundMs = ctx.agent.limits?.timeoutMs ?? CHAIN_TIMING.timeoutMs;
  const chain: Chain = { deadline: Date.now() + boundMs, boundMs, children: [] };
  const steps: CreateCharacterStepOutcome[] = [];
  const skip = (step: CreateCharacterStep, reason: string) => { steps.push({ step, status: 'skipped', reason }); };
  const { state } = await readState();
  const p = payload.productionId ? state.productions.find((x) => x.id === payload.productionId) : undefined;
  const show = payload.showId ? state.shows.find((x) => x.id === payload.showId) : p?.showId ? state.shows.find((x) => x.id === p.showId) : undefined;
  const profile = payload.profile ?? {};
  const name = (profile.name ?? payload.name)?.trim();
  const style = profile.style ?? payload.style ?? show?.style ?? p?.style ?? state.settings.defaults.style;
  const language = profile.language ?? payload.language ?? show?.language ?? p?.language ?? state.settings.defaults.language;
  const dialect = language === 'AR' ? profile.dialect ?? payload.dialect ?? show?.dialect ?? p?.dialect ?? state.settings.defaults.dialect : undefined;

  // REFERENCE: the picture is validated before anything is created (contract §1.2); an unusable one creates nothing
  const refAsset = payload.mode === 'REFERENCE' ? state.assets.find((a) => a.id === payload.referenceAssetId) : undefined;
  if (payload.mode === 'REFERENCE') {
    // the Character Continuity Agent's reference picture check, before anything is created from it
    await step(ctx, 'character-continuity', `reference-picture-check: ${payload.referenceAssetId ?? 'no picture'}`, async () => {
      const validation = refAsset?.provenance?.validation as { ok: boolean; reasons: string[] } | undefined;
      const problem = referenceImageProblem(state, payload.referenceAssetId, validation);
      if (problem) throw missingReference(`The reference picture cannot be used: ${problem}. Upload another picture (at least 512 px, one face, in focus) or describe the character instead.`, { referenceAssetId: payload.referenceAssetId });
    });
  }

  // 1) DESIGN — Casting fills the profile when fields are missing (AUTO always; MANUAL/REFERENCE when incomplete);
  //    a complete sheet is written directly, in one batch with its seat, under a key a restart recognises.
  //    REFERENCE: the look is the picture's, never designed — the look fields count as given (empty = "as in the
  //    reference picture") and the design brief opens with REFERENCE_LOOK_BRIEF, so the text-only designer fills
  //    only who the character is (finding 3)
  let characterId: string;
  const fromPicture = payload.mode === 'REFERENCE';
  const needsDesign = payload.mode === 'AUTO' || profileNeedsDesign({ ...(fromPicture ? PICTURE_LOOK : {}), ...profile, name });
  if (needsDesign) {
    await ctx.progress('GENERATING', { phase: 'design', message: LABEL.design, step: 1, total: STEPS.length, percent: null });
    const brief = fromPicture ? [REFERENCE_LOOK_BRIEF, payload.brief?.trim().slice(0, BRIEF_MAX - REFERENCE_LOOK_BRIEF.length - 1)].filter(Boolean).join('\n') : payload.brief;
    const child = await runStep(ctx, chain, 'design', { brief, name, profile: Object.keys(profile).length ? { ...profile, name } : undefined, style, language, dialect, productionId: p?.id, showId: show?.id }, 0);
    const out = outcomeOf('design', child);
    steps.push(out);
    const designed = child.result?.characterId as string | undefined;
    if (out.status !== 'done' || !designed) {
      // nothing exists yet: the job fails with the design's own error so the page offers the retry (a code outside
      // the studio's union — a provider's own string, a crash — is a provider failure, not passed on as ours)
      throw new StudioError(asStudioErrorCode(child.error?.code), `The character could not be designed: ${child.error?.message ?? child.status}`, { steps, childJobId: child.id, failureClass: out.failureClass });
    }
    characterId = designed;
  } else {
    if (!name) throw new StudioError('INVALID', 'A character needs a name.');
    const input: CharacterInput = {
      name, nameAr: profile.nameAr, role: profile.role ?? '', style, sex: profile.sex!, species: profile.species, ageYears: profile.ageYears!,
      build: profile.build ?? '', face: profile.face ?? '', hair: profile.hair ?? '', skin: profile.skin ?? '', eyes: profile.eyes ?? '', wardrobe: profile.wardrobe ?? '', personality: profile.personality ?? '', distinguishing: profile.distinguishing ?? [],
      language, dialect, canon: profile.canon, notes: profile.notes,
      voice: profile.voice ? { pitch: profile.voice.pitch ?? 'MID', pace: profile.voice.pace ?? 'MEASURED', timbre: profile.voice.timbre, notes: profile.voice.notes } : undefined,
    };
    // the same seed and clock on every attempt → the same id: a restart finds the record it already wrote
    const stamp = { seed: `create:${ctx.job.id}:character`, at: ctx.job.createdAt };
    const probe = runCommand(state, stampCommands([{ name: 'addCharacter', args: [input] }], stamp)[0] as Command<'addCharacter'>);
    characterId = probe.result.character.id;
    if (state.characters.some((c) => c.id === characterId)) await ctx.event('info', `character ${characterId} already written by an earlier attempt; adopted`, { characterId });
    else {
      const batch: CommandSpec[] = [{ name: 'addCharacter', args: [input] }];
      if (p) batch.push({ name: 'updateProduction', args: [p.id, { castIds: Array.from(new Set([...p.castIds, characterId])) }] });
      if (show) batch.push({ name: 'updateShow', args: [show.id, { castIds: Array.from(new Set([...show.castIds, characterId])) }] });
      await commands(batch, 'worker', stamp);
      await ctx.activity('CHARACTER_CREATED', `${name} added from the written sheet`, { characterId });
    }
    skip('design', payload.mode === 'REFERENCE' ? 'the sheet was complete; the look follows the picture' : 'the sheet was complete');
  }
  const fresh = async (): Promise<Character> => { const c = (await readState()).state.characters.find((x) => x.id === characterId); if (!c) throw new StudioError('NOT_FOUND', `Character ${characterId} no longer exists.`); return c; };
  let c = await fresh();

  // REFERENCE: the validated picture becomes the pending reference the portrait is drawn from
  if (payload.mode === 'REFERENCE' && refAsset && c.pendingReference?.assetId !== refAsset.id) {
    const validation = refAsset.provenance?.validation as NonNullable<Character['pendingReference']>['validation'];
    await commands([{ name: 'setPendingReference', args: [c.id, refAsset.id, validation] }], 'worker');
    c = await fresh();
  }

  // 2) IMAGE — the one canonical front full-body image, drawn unless the request said not to; nothing else is drawn
  //    (secondary material is a CHARACTER_REFS request of its own, never part of creation)
  const draw = payload.draw !== false;
  if (!draw) skip('appearance', 'not requested (draw: false)');
  else {
    const toDraw = c;
    const pre = await step(ctx, 'executive-producer', `character-preflight: canonical image of ${c.name}`, async () => preflightCharacter((await readState()).state, toDraw, 'CHARACTER_APPEARANCE'));
    if (!pre.ok) {
      const failed = pre.checks.filter((x) => !x.ok);
      steps.push({ step: 'appearance', status: 'failed', reason: failed.map((x) => x.detail ?? x.name).join('; '), failureClass: failed[0].failureClass });
    } else {
      const drawn = await runStep(ctx, chain, 'appearance', { characterId: c.id }, 1);
      const out = outcomeOf('appearance', drawn);
      // a drawn image is a DRAFT: the step is done and the image awaits the producer's approval
      steps.push(out.status === 'done' && drawn.status === 'COMPLETED' ? { ...out, reason: out.reason ?? 'canonical image drawn — awaiting your approval' } : out);
      c = await fresh();
    }
  }

  // 3) VOICE — only from a real reference; a new character without one has "no voice yet", and the result says why
  const voice = payload.voice;
  if (!voice || voice.mode === 'NONE') skip('voice', 'no voice requested');
  else {
    c = await fresh();
    const vp = voice.mode === 'REFERENCE' ? { characterId: c.id, mode: 'REFERENCE', referenceSampleId: voice.referenceSampleId } : { characterId: c.id, mode: 'AUTOMATIC' };
    const voiced = c;
    const pre = await step(ctx, 'executive-producer', `character-preflight: voice of ${c.name}`, async () => preflightCharacter((await readState()).state, voiced, 'VOICE_BUILD', vp));
    if (!pre.ok) {
      const failed = pre.checks.filter((x) => !x.ok);
      const missing = failed.every((x) => x.failureClass === 'MISSING_REFERENCE');
      if (missing) skip('voice', `no voice yet: ${failed.map((x) => x.detail ?? x.name).join('; ')}`);
      else steps.push({ step: 'voice', status: 'failed', reason: failed.map((x) => x.detail ?? x.name).join('; '), failureClass: failed[0].failureClass });
    } else {
      const built = await runStep(ctx, chain, 'voice', vp, 2);
      steps.push(outcomeOf('voice', built));
    }
  }

  const failed = steps.filter((s) => s.status === 'failed');
  const result: CreateCharacterResult = { characterId, steps };
  c = await fresh();
  // the character's identity is its canonical image, a DRAFT until the producer approves it
  const awaitingApproval = c.canonicalImage?.status === 'DRAFT';
  const message = `${c.name}: ${steps.map((s) => `${s.step === 'appearance' ? 'image' : s.step} ${s.status}`).join(', ')}${awaitingApproval ? ' — awaiting your approval' : ''}`;
  await ctx.activity(failed.length ? 'CHARACTER_CREATED_PARTIAL' : 'CHARACTER_CREATED', `${c.name}: ${steps.map((s) => `${s.step === 'appearance' ? 'image' : s.step} ${s.status}${s.reason ? ` (${s.reason.slice(0, 60)})` : ''}`).join(', ')}${awaitingApproval ? ' — awaiting your approval' : ''}`, { characterId, steps, canonicalImage: c.canonicalImage ? { assetId: c.canonicalImage.assetId, status: c.canonicalImage.status, version: c.canonicalImage.version } : undefined });
  return { ...result, message, awaitingApproval, canonicalAssetId: c.canonicalImage?.assetId, awaitingReview: failed.length > 0 || steps.some((s) => s.reason === 'awaiting review') };
};
