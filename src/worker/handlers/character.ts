import type { Handler, HandlerContext } from './index';
import { StudioError, asStudioErrorCode, missingReference } from '@/domain/errors';
import type { Character } from '@/domain/types';
import { isTerminalStatus, profileNeedsDesign, type CreateCharacterResult, type CreateCharacterStep, type CreateCharacterStepOutcome, type Job, type JobPayloadParsed, type JobType } from '@/domain/jobs';
import { runCommand, type Command } from '@/domain/commands';
import type { CharacterInput } from '@/domain/actions';
import { commands, readState, stampCommands, type CommandSpec } from '@/server/studio/engine';
import { enqueue, getJob } from '@/server/jobs/queue';
import { preflightCharacter, referenceImageProblem } from '@/server/org/preflight';

/** CREATE A CHARACTER — the one job behind the three starts of the character page (contract §1.1): Describe (AUTO),
 *  Write the sheet (MANUAL), From a picture (REFERENCE). It runs the chain as durable child jobs — design (only when
 *  fields are missing) → appearance → reference sheet → voice (only when a reference exists) — each with the key
 *  `create:${jobId}:${step}` and this job as parent, so a restart adopts the children already queued and never
 *  runs a step twice. Progress is `step/total` over the real phases. Partial success keeps the record: the result
 *  lists every step as done, skipped (why) or failed (class, message); nothing is reported done that did not happen. */

const STEPS: CreateCharacterStep[] = ['design', 'appearance', 'sheet', 'voice'];
const CHILD_TYPE: Record<CreateCharacterStep, JobType> = { design: 'DESIGN_CHARACTER', appearance: 'CHARACTER_APPEARANCE', sheet: 'CHARACTER_REFS', voice: 'VOICE_BUILD' };
const LABEL: Record<CreateCharacterStep, string> = { design: 'Designing the character', appearance: 'Drawing the portrait', sheet: 'Drawing the reference sheet', voice: 'Building the voice' };

/** Queue one step as a child (or adopt the child an earlier attempt queued under the same key) and wait for it. */
async function runStep(ctx: HandlerContext, step: CreateCharacterStep, payload: Record<string, unknown>, index: number): Promise<Job> {
  const type = CHILD_TYPE[step];
  const r = await ctx.tool('jobs.enqueue', () => enqueue({ type, payload, parentId: ctx.job.id, idempotencyKey: `create:${ctx.job.id}:${step}`, priority: 1 }), { label: type });
  if (!r.created) await ctx.event('info', `${step}: adopted job ${r.job.id} (${r.job.status})`, { step, jobId: r.job.id, status: r.job.status });
  let job = r.job;
  for (;;) {
    await ctx.checkpoint();
    if (isTerminalStatus(job.status) || job.status === 'AWAITING_REVIEW') return job;
    await ctx.progress('GENERATING', { phase: step, message: `${LABEL[step]}${job.progress?.message ? `: ${job.progress.message}` : ''}`, step: index + 1, total: STEPS.length, percent: null });
    await new Promise((res) => setTimeout(res, 3000));
    job = (await getJob(job.id)) ?? job;
  }
}

const outcomeOf = (step: CreateCharacterStep, job: Job): CreateCharacterStepOutcome => (job.status === 'COMPLETED' || job.status === 'AWAITING_REVIEW'
  ? { step, status: 'done', jobId: job.id, ...(job.status === 'AWAITING_REVIEW' ? { reason: 'awaiting review' } : {}) }
  : { step, status: 'failed', jobId: job.id, reason: job.error?.message ?? job.status.toLowerCase(), failureClass: (job.error?.details?.failureClass as string | undefined) ?? (job.status === 'CANCELLED' ? 'CANCELLED' : 'UNKNOWN') });

export const createCharacter: Handler = async (ctx) => {
  const payload = ctx.job.payload as JobPayloadParsed<'CREATE_CHARACTER'>;
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
    const validation = refAsset?.provenance?.validation as { ok: boolean; reasons: string[] } | undefined;
    const problem = referenceImageProblem(state, payload.referenceAssetId, validation);
    if (problem) throw missingReference(`The reference picture cannot be used: ${problem}. Upload another picture (at least 512 px, one face, in focus) or describe the character instead.`, { referenceAssetId: payload.referenceAssetId });
  }

  // 1) DESIGN — Casting fills the profile when fields are missing (AUTO always; MANUAL/REFERENCE when incomplete);
  //    a complete sheet is written directly, in one batch with its seat, under a key a restart recognises
  let characterId: string;
  const needsDesign = payload.mode === 'AUTO' || profileNeedsDesign({ ...profile, name });
  if (needsDesign) {
    await ctx.progress('GENERATING', { phase: 'design', message: LABEL.design, step: 1, total: STEPS.length, percent: null });
    const child = await runStep(ctx, 'design', { brief: payload.brief, name, profile: Object.keys(profile).length ? { ...profile, name } : undefined, style, language, dialect, productionId: p?.id, showId: show?.id }, 0);
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

  // 2) APPEARANCE and 3) SHEET — drawn unless the request said not to; the sheet needs the portrait
  const draw = payload.draw !== false;
  if (!draw) { skip('appearance', 'not requested (draw: false)'); skip('sheet', 'not requested (draw: false)'); }
  else {
    const pre = preflightCharacter((await readState()).state, c, 'CHARACTER_APPEARANCE');
    if (!pre.ok) {
      const failed = pre.checks.filter((x) => !x.ok);
      steps.push({ step: 'appearance', status: 'failed', reason: failed.map((x) => x.detail ?? x.name).join('; '), failureClass: failed[0].failureClass });
      skip('sheet', 'no portrait to draw the views from');
    } else {
      const drawn = await runStep(ctx, 'appearance', { characterId: c.id }, 1);
      steps.push(outcomeOf('appearance', drawn));
      c = await fresh();
      if (drawn.status === 'COMPLETED' && c.portraitAssetId) { const sheet = await runStep(ctx, 'sheet', { characterId: c.id }, 2); steps.push(outcomeOf('sheet', sheet)); }
      else skip('sheet', 'no portrait to draw the views from');
    }
  }

  // 4) VOICE — only from a real reference; a new character without one has "no voice yet", and the result says why
  const voice = payload.voice;
  if (!voice || voice.mode === 'NONE') skip('voice', 'no voice requested');
  else {
    c = await fresh();
    const vp = voice.mode === 'REFERENCE' ? { characterId: c.id, mode: 'REFERENCE', referenceSampleId: voice.referenceSampleId } : { characterId: c.id, mode: 'AUTOMATIC' };
    const pre = preflightCharacter((await readState()).state, c, 'VOICE_BUILD', vp);
    if (!pre.ok) {
      const failed = pre.checks.filter((x) => !x.ok);
      const missing = failed.every((x) => x.failureClass === 'MISSING_REFERENCE');
      if (missing) skip('voice', `no voice yet: ${failed.map((x) => x.detail ?? x.name).join('; ')}`);
      else steps.push({ step: 'voice', status: 'failed', reason: failed.map((x) => x.detail ?? x.name).join('; '), failureClass: failed[0].failureClass });
    } else {
      const built = await runStep(ctx, 'voice', vp, 3);
      steps.push(outcomeOf('voice', built));
    }
  }

  const failed = steps.filter((s) => s.status === 'failed');
  const result: CreateCharacterResult = { characterId, steps };
  await ctx.activity(failed.length ? 'CHARACTER_CREATED_PARTIAL' : 'CHARACTER_CREATED', `${c.name}: ${steps.map((s) => `${s.step} ${s.status}${s.reason ? ` (${s.reason.slice(0, 60)})` : ''}`).join(', ')}`, { characterId, steps });
  return { ...result, awaitingReview: failed.length > 0 || steps.some((s) => s.reason === 'awaiting review') };
};
