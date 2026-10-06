import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Handler } from './index';
import { step } from './step';
import { commitTake, committedTake, type TakeCommit } from './take-commit';
import { StudioError } from '@/domain/errors';
import type { JobPayloadParsed } from '@/domain/jobs';
import type { Asset, QaCheck, Take } from '@/domain/types';
import { LIPSYNC_LATENTSYNC_16, judgeCorrection, planCorrection, type CorrectionMeasures } from '@/domain/lipsync-correction';
import { readState } from '@/server/studio/engine';
import { assetFile, assetFromStored, ffprobe } from '@/server/media';
import { frameAt, thumbnail, tmpDir } from '@/server/media/ffmpeg';
import { jobOutputs } from '@/server/jobs/outputs';
import { correctLipSync, lipsyncHealth } from '@/server/providers/lipsync';
import { faceIdentity, isQaUnavailable, judgeLipSync, mouthActivity, type IdentityResult, type MouthResult, type QaAnswer } from '@/server/providers/qa-service';
import { judgeContainer } from '@/server/media/continuity-qa';
import { H3_FPS } from '@/server/workflows/minimax-h3';
import { env } from '@/server/env';

/** CORRECT THE LIP-SYNC OF ONE TAKE (src/domain/lipsync-correction.ts; directive 2026-10-06 §16). Runs only for a take
 *  the producer confirmed after a failed lip-sync review, and only when the take is eligible (style, one speaker, the
 *  authoritative soundtrack, length) — a refusal fails the job with every reason, nothing runs. The corrector redraws
 *  the mouth region of the EXISTING take under the LIPSYNC GPU lease (H3 and every other engine unloaded first); it
 *  never generates video. The result is a NEW take of the shot (`derivedFrom`), measured against the original —
 *  frame count, the mouth against the audio, the face against the original take and the canonical image — and kept
 *  READY or REJECTED with those numbers in its QA record and in `params.postProcess`. The original take is never
 *  changed or unselected; the corrected one is chosen only when the producer asked (`select`) and it was accepted. */

type Measured = { mouth: QaAnswer<MouthResult>; identity: QaAnswer<IdentityResult> | null; self: QaAnswer<IdentityResult> | null };

const speakerCorr = (m: QaAnswer<MouthResult>): { corr: number | null; faceHeightPx: number | null; track: number | null } => {
  if (isQaUnavailable(m)) return { corr: null, faceHeightPx: null, track: null };
  const sp = m.tracks.find((t) => t.isSpeaker) ?? null;
  return { corr: sp?.corrBest ?? null, faceHeightPx: sp?.faceHeightPx ?? null, track: sp?.id ?? null };
};
const medianOf = (r: QaAnswer<IdentityResult> | null, id: string): number | null => (r && !isQaUnavailable(r) ? r.characters[id]?.summary?.median ?? null : null);

export const correctLipsync: Handler = async (ctx) => {
  const payload = ctx.job.payload as JobPayloadParsed<'CORRECT_LIPSYNC'>;
  const cap = LIPSYNC_LATENTSYNC_16;
  const { state } = await readState();
  const done = committedTake(state, ctx.job.id);
  if (done) {
    await ctx.event('info', `the corrected take ${done.take.label} was already recorded by an earlier attempt of this job`, { takeId: done.take.id });
    return { takeId: done.take.id, assetId: done.take.assetId, accepted: done.take.status === 'READY', resumedFromCommit: true };
  }
  const p = state.productions.find((x) => x.id === payload.productionId);
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  const sh = p.shots.find((x) => x.id === payload.shotId);
  if (!sh) throw new StudioError('NOT_FOUND', 'Shot not found');
  const take = sh.takes.find((t) => t.id === payload.takeId);
  if (!take) throw new StudioError('NOT_FOUND', 'Take not found in this shot');
  const byId = (id?: string) => (id ? state.assets.find((a) => a.id === id) : undefined);

  await ctx.progress('PREPARING', { phase: 'preparing', message: 'Checking that this take may be corrected' });
  const plan = planCorrection(p, sh, take, { confirm: payload.confirm, reason: payload.reason }, cap, H3_FPS);
  await ctx.event(plan.eligible ? 'info' : 'error', plan.eligible ? `lip-sync correction of ${take.label} planned (${plan.flags.join(', ')}): the audio starts at ${plan.audioOffset.toFixed(2)} s` : `lip-sync correction of ${take.label} refused: ${plan.reasons.join('; ')}`, { plan });
  if (!plan.eligible) throw Object.assign(new StudioError('INVALID', `This take cannot be corrected: ${plan.reasons.join('; ')}`, { reasons: plan.reasons, takeId: take.id }), { failureClass: 'UNSUPPORTED_CAPABILITY' });
  const health = await lipsyncHealth();
  if (!health.available) throw Object.assign(new StudioError('UNAVAILABLE', `The lip-sync corrector is not available: ${health.reason ?? 'unknown'}`), { failureClass: 'INFRASTRUCTURE' });

  const video = byId(take.assetId); const audio = byId(plan.audioAssetId);
  if (!video || !audio) throw new StudioError('NOT_FOUND', 'The take\'s video or its soundtrack is missing from the library');
  const canonical = (characterId: string): Asset | undefined => byId(take.references?.find((r) => r.kind === 'CHARACTER' && r.characterId === characterId)?.assetId ?? state.characters.find((c) => c.id === characterId)?.canonicalImage?.assetId);
  const speakerImg = canonical(plan.speakerId!);
  if (!speakerImg) throw Object.assign(new StudioError('INVALID', 'The speaker has no canonical image: the corrector could not tell their face from another'), { failureClass: 'MISSING_REFERENCE' });
  const others = plan.otherCharacterIds.map(canonical).filter((a): a is Asset => Boolean(a));
  const refs = [{ characterId: plan.speakerId!, image: assetFile(speakerImg) }];
  const videoFile = assetFile(video); const audioFile = assetFile(audio);
  const work = await tmpDir('lipsync');

  // BEFORE: the original take, measured the same way the corrected one will be
  const measure = async (file: string, label: string, selfRef?: string): Promise<Measured> => {
    const mouth = await step(ctx, 'audio-sync-inspector', `lip-sync-check: ${label}`, () => mouthActivity(file, { audio: audioFile, audioOffset: plan.audioOffset, fps: H3_FPS, mode: 'speech', speakers: 1 }));
    const identity = await step(ctx, 'visual-quality-inspector', `identity-check: ${label}`, () => faceIdentity(file, refs, { sampleFps: 4 }));
    const self = selfRef ? await step(ctx, 'visual-quality-inspector', `identity-check: ${label} against the original take`, () => faceIdentity(file, [{ characterId: 'original-take', image: selfRef }], { sampleFps: 4 })) : null;
    return { mouth, identity, self };
  };
  const firstFace = async (): Promise<string | undefined> => {
    const r = await faceIdentity(videoFile, refs, { sampleFps: 4 });
    if (isQaUnavailable(r)) return undefined;
    const s = r.characters[plan.speakerId!]?.series.find((x) => x.cosine !== null);
    return s ? frameAt(videoFile, path.join(work, 'original-face.png'), Math.round(s.t * H3_FPS), H3_FPS) : undefined;
  };
  const selfRef = await firstFace();
  const before = await measure(videoFile, `${take.label} before correction`, selfRef);
  const b = speakerCorr(before.mouth);
  if (b.faceHeightPx !== null && b.faceHeightPx < cap.minFacePx) throw Object.assign(new StudioError('INVALID', `The speaker's face is ${Math.round(b.faceHeightPx)} px tall; the corrector needs at least ${cap.minFacePx} px`, { takeId: take.id }), { failureClass: 'UNSUPPORTED_CAPABILITY' });

  // THE CORRECTION, under the LIPSYNC lease: ComfyUI (H3) and the other engines let go of the card first
  await ctx.progress('GENERATING', { phase: 'correcting', message: `Redrawing the mouth of ${take.label} to the recorded line` });
  const outFile = path.join(work, 'corrected.mp4');
  const t0 = Date.now();
  const res = await ctx.gpu('LIPSYNC', cap.vramMb, () => ctx.tool('video.lipsync_correct', () => correctLipSync(videoFile, audioFile, outFile, { audioOffset: plan.audioOffset, reference: assetFile(speakerImg), others: others.map(assetFile), steps: payload.steps, guidance: payload.guidance, seed: payload.seed }), { label: `lip-sync correction: ${take.label}`, input: { takeId: take.id, audioOffset: plan.audioOffset } }));
  if (!res.available) throw Object.assign(new StudioError('UNAVAILABLE', `The lip-sync corrector failed: ${res.reason}`), { failureClass: 'INFRASTRUCTURE' });
  const ms = Date.now() - t0;
  await ctx.event('info', `corrected in ${(ms / 1000).toFixed(0)} s: ${res.report.track.framesEdited} of ${res.report.frames} frames edited, ${res.report.vramPeakReservedMb} MB peak`, { report: res.report });

  // AFTER: the same measurements on the corrected take
  await ctx.progress('VALIDATING', { phase: 'validating', message: 'Measuring the corrected take against the original' });
  const after = await measure(outFile, `${take.label} after correction`, selfRef);
  const a = speakerCorr(after.mouth);
  const probe = await ffprobe(outFile);
  const measures: CorrectionMeasures = {
    frames: { original: res.report.frames, corrected: res.report.outFrames },
    corr: { before: b.corr, after: a.corr },
    canonical: { before: medianOf(before.identity, plan.speakerId!), after: medianOf(after.identity, plan.speakerId!) },
    selfIdentity: { before: medianOf(before.self, 'original-take'), after: medianOf(after.self, 'original-take') },
    fullStrengthShare: res.report.frames ? res.report.track.framesFullStrength / res.report.frames : 0,
    faceHeightPx: b.faceHeightPx,
  };
  const verdict = judgeCorrection(measures, cap);
  const lipAfter = judgeLipSync(after.mouth);
  const checks: QaCheck[] = [
    { name: 'same-frame-count', ok: measures.frames.corrected === measures.frames.original, value: measures.frames.corrected, threshold: measures.frames.original },
    { name: 'mouth-follows-audio', ok: !(measures.corr.before !== null && measures.corr.after !== null && measures.corr.after < measures.corr.before), value: measures.corr.after ?? undefined, threshold: measures.corr.before === null ? undefined : `≥ ${measures.corr.before.toFixed(2)} (before)`, detail: `Tier-1 after: ${lipAfter.verdict.toLowerCase()}${lipAfter.detail.length ? ` — ${lipAfter.detail.join('; ')}` : ''}` },
    { name: 'same-face-as-original', ok: !verdict.problems.some((x) => x.startsWith('the face changed') || x.includes('could not be compared')), value: measures.selfIdentity.after ?? undefined, threshold: measures.selfIdentity.before === null ? undefined : `≥ ${(measures.selfIdentity.before - cap.accept.selfIdentityDropMax).toFixed(2)}` },
    { name: 'identity-to-canonical', ok: !verdict.problems.some((x) => x.startsWith('identity to the canonical')), value: measures.canonical.after ?? undefined, threshold: measures.canonical.before === null ? undefined : `≥ ${(measures.canonical.before - cap.accept.canonicalDropMax).toFixed(2)}` },
    { name: 'corrected-at-full-strength', ok: measures.fullStrengthShare >= cap.minFullStrengthShare, value: Number(measures.fullStrengthShare.toFixed(2)), threshold: cap.minFullStrengthShare, detail: `${res.report.track.framesProfile} profile frame(s), ${res.report.track.lostRuns.length} lost run(s)` },
    judgeContainer(probe, { fps: take.fps ?? H3_FPS, expectAudio: Boolean(take.soundtrack) }),
  ];
  const accepted = verdict.accepted && checks.every((c) => c.ok);

  // the new take: poster, video, the take itself and its QA report in one commit
  const out = jobOutputs(ctx.job);
  const poster = path.join(work, 'poster.jpg');
  await thumbnail(outFile, poster, { at: Math.min(0.5, (probe.durationSeconds ?? 1) / 4) });
  const { id: posterId, stored: storedPoster } = await out.adopt('poster', poster, { expectKind: 'IMAGE' });
  const { id: videoId, stored } = await out.adopt('video', outFile, { expectKind: 'VIDEO' });
  const postProcess = {
    kind: 'LIPSYNC_CORRECTION', engine: res.report.model, capability: cap.id, fromTakeId: take.id, reason: payload.reason, flags: plan.flags, confirmedBy: 'producer',
    params: res.report.params, report: res.report, measures, verdict, ms,
  };
  const label = `${take.label} · lip-sync corrected`;
  const assets: TakeCommit['assets'] = [
    assetFromStored(posterId, storedPoster, { label: `${p.title} ${sh.number} — ${label} poster`, tags: ['take', 'poster'], origin: 'DERIVED', jobId: ctx.job.id, provenance: { from: videoId } }),
    assetFromStored(videoId, stored, { label: `${p.title} — shot ${sh.number} ${label}`, tags: ['take', 'lipsync-corrected'], origin: 'DERIVED', jobId: ctx.job.id, provenance: { fromTakeId: take.id, fromAssetId: take.assetId, process: 'LIPSYNC_CORRECTION', engine: res.report.model, params: res.report.params, codeVersion: env().CODE_VERSION }, poster: `/api/media/${posterId}` }),
  ];
  const newTake: TakeCommit['take'] = {
    assetId: videoId, label, status: accepted ? 'READY' : 'REJECTED',
    rejectionReason: accepted ? undefined : `Lip-sync correction not accepted: ${[...verdict.problems, ...checks.filter((c) => !c.ok && !verdict.problems.length).map((c) => c.name)].join('; ')}`,
    provider: take.provider, model: `${take.model ?? 'MiniMax-H3'} + ${res.report.model.split(' (')[0]} mouth correction`, requestId: take.requestId, prompt: take.prompt, seed: take.seed, references: take.references,
    params: { ...(take.params ?? {}), postProcess }, width: probe.width ?? take.width, height: probe.height ?? take.height, durationSeconds: probe.durationSeconds ?? take.durationSeconds, fps: probe.fps ?? take.fps,
    generationMs: ms, qa: { ok: accepted, checks }, jobId: ctx.job.id, codeVersion: env().CODE_VERSION, workflowVersion: take.workflowVersion, thumbnailAssetId: posterId,
    trimStartFrames: take.trimStartFrames, soundtrack: take.soundtrack, relation: take.relation, continuesTakeId: take.continuesTakeId,
    derivedFrom: { takeId: take.id, process: 'LIPSYNC_CORRECTION', jobId: ctx.job.id },
    ...(accepted && payload.select ? { select: 'ALWAYS' as const } : {}),
  };
  const qa: TakeCommit['qa'] = [{ name: 'lipsync-correction', productionId: p.id, subjectKind: 'TAKE', subjectId: '', inspectorId: 'audio-sync-inspector', checks, failureClass: accepted ? undefined : 'LIP_SYNC_FAILURE', decision: accepted ? 'ACCEPT' : 'REJECT', notes: [`corrected from ${take.label} (${take.id}) because: ${payload.reason}`, ...verdict.notes, ...verdict.problems].join('; '), evidenceAssetIds: [take.assetId, videoId], jobId: ctx.job.id }];
  const committed: Take = await commitTake({ jobId: ctx.job.id, productionId: p.id, shotId: sh.id, assets, take: newTake, qa });
  await fsp.rm(work, { recursive: true, force: true }).catch(() => {});
  await ctx.activity(accepted ? 'TAKE_CORRECTED' : 'TAKE_CORRECTION_REJECTED', `Shot ${sh.number} of “${p.title}”: ${committed.label} ${accepted ? 'made from' : 'made but not accepted, from'} ${take.label} (${verdict.notes.concat(verdict.problems).join('; ')})`, { takeId: committed.id, fromTakeId: take.id, accepted, measures });
  return { takeId: committed.id, fromTakeId: take.id, assetId: videoId, accepted, measures, problems: verdict.problems, ms, vramPeakReservedMb: res.report.vramPeakReservedMb };
};
