import type { Production, Shot, Take } from './types';
import type { Style } from './vocabulary';

/** LIP-SYNC CORRECTION — what the corrector may do, as DATA, and the pure rules that decide whether one take may be
 *  corrected and whether the corrected take is accepted (directive 2026-10-06 §16: "Prefer native MiniMax performance
 *  when it is sufficiently good; use post-processing only where needed. A lip-sync correction stage must not alter
 *  facial identity, expression, character appearance or intended cinematography").
 *
 *  The corrector (docker/lipsync: LatentSync 1.6 with a YuNet + MediaPipe face tracker) redraws the MOUTH REGION of an
 *  existing take to follow the authoritative audio; it never generates video. It runs only for a take that is FLAGGED
 *  (its lip-sync check failed or asked for review, or the producer's visual review found the lip-sync wrong) AND
 *  CONFIRMED (the producer asked for this correction of this take). The result is a NEW take of the same shot
 *  (`derivedFrom`), kept beside the original with its before/after measurements, visible in production history; the
 *  original is never changed. Every number below is the evaluation's (docs/MODELS.md, lip-sync corrector). */

export interface LipsyncCapability {
  id: 'latentsync-1.6';
  /** the styles the corrector may touch: it is trained on real talking heads; a style is listed only when the
   *  evaluation showed it does not harm that style's faces */
  styles: readonly Style[];
  /** sung vocals (music videos): only when evaluated for singing */
  singing: boolean;
  /** the speaker's face must be at least this tall (YuNet box, pixels) over the speech */
  minFacePx: number;
  /** at most this long (the service's limit) */
  maxSeconds: number;
  /** at least this share of the clip's frames must be corrected at full strength (frontal, found): a profile shot is
   *  not corrected half-way */
  minFullStrengthShare: number;
  /** acceptance of the corrected take (against the original take and the canonical image) */
  accept: {
    /** SFace cosine (median) of the take's faces against one frame of the ORIGINAL take: the corrected take may fall
     *  below the original take's own figure by at most this much (the same face, unchanged around the mouth) */
    selfIdentityDropMax: number;
    /** SFace cosine to the canonical image may drop by at most this much (median, corrected vs original) */
    canonicalDropMax: number;
    /** the mouth must follow the audio better: the Tier-1 correlation (MAR vs speech envelope) must not fall */
    corrMustNotFall: boolean;
    /** the performance must not be flattened: mouth activity INSIDE the speech may fall by at most this share (the
     *  evaluation measured −17…−35 % on cartoon faces — LatentSync draws smaller, more realistic mouths) */
    performanceDropMax: number;
    /** the output keeps the frame count exactly */
    sameFrameCount: true;
  };
  /** the lease estimate (MB), measured */
  vramMb: number;
}

export const LIPSYNC_LATENTSYNC_16: LipsyncCapability = {
  id: 'latentsync-1.6',
  styles: ['REALISTIC'],
  singing: false,
  minFacePx: 128,
  maxSeconds: 30,
  minFullStrengthShare: 0.6,
  accept: { selfIdentityDropMax: 0.05, canonicalDropMax: 0.05, corrMustNotFall: true, performanceDropMax: 0.2, sameFrameCount: true },
  vramMb: 20000,
};

export type CorrectionFlag = 'QA_LIPSYNC_FAIL' | 'QA_LIPSYNC_REVIEW' | 'VISUAL_REVIEW';

export interface CorrectionRequest {
  /** the producer's confirmation: always true in a request (a missing confirmation is refused before this) */
  confirm: true;
  /** what the visual review found (shown in production history with the corrected take) */
  reason: string;
}

export interface CorrectionPlan {
  eligible: boolean;
  /** why not (each a sentence the page can show) */
  reasons: string[];
  flags: CorrectionFlag[];
  speakerId?: string;
  otherCharacterIds: string[];
  /** the authoritative audio the mouth must follow and where it starts in the clip (seconds) */
  audioAssetId?: string;
  audioOffset: number;
  style?: Style;
}

type LipSyncRecord = { verdict?: string; against?: string };

/** May this take be corrected? Pure: every refusal is a reason, never a silent skip. */
export function planCorrection(p: Pick<Production, 'kind' | 'style'>, sh: Pick<Shot, 'dialogue' | 'characterIds'>, take: Take, req: Partial<CorrectionRequest>, cap: LipsyncCapability = LIPSYNC_LATENTSYNC_16, fps = 24): CorrectionPlan {
  const reasons: string[] = [];
  const flags: CorrectionFlag[] = [];
  const ls = (take.params?.lipSync ?? undefined) as LipSyncRecord | undefined;
  if (ls?.verdict === 'FAIL') flags.push('QA_LIPSYNC_FAIL');
  if (ls?.verdict === 'REVIEW') flags.push('QA_LIPSYNC_REVIEW');
  if (req.reason?.trim()) flags.push('VISUAL_REVIEW');
  if (req.confirm !== true) reasons.push('the correction was not confirmed: the producer asks for it, take by take');
  if (!req.reason?.trim()) reasons.push('say what the visual review found (the reason is kept with the corrected take)');
  if (take.derivedFrom) reasons.push(`this take is already a correction of ${take.derivedFrom.takeId}: correct the original take instead`);
  if (take.provider === 'SAMPLE') reasons.push('a bundled sample clip is not corrected');
  const style = p.style;
  if (!cap.styles.includes(style)) reasons.push(`the corrector is not enabled for ${style.toLowerCase()} faces (enabled: ${cap.styles.map((s) => s.toLowerCase()).join(', ') || 'none'}; evaluation in docs/MODELS.md)`);
  const st = take.soundtrack;
  const singing = p.kind === 'MUSIC_VIDEO';
  if (!st?.assetId) reasons.push('the take has no authoritative soundtrack (recorded lines or the song stretch) for the mouth to follow');
  else if (st.kind === 'SONG' || singing) { if (!cap.singing) reasons.push('singing is not corrected (the corrector is not evaluated for sung vocals)'); }
  // the speaker: the characters whose lines the take's soundtrack places
  const lineIds = new Set((st?.lines ?? []).map((l) => l.lineId));
  const speakers = [...new Set(sh.dialogue.filter((d) => lineIds.has(d.id)).map((d) => d.characterId).filter((x): x is string => Boolean(x)))];
  if (!singing && st?.kind === 'DIALOGUE') {
    if (speakers.length === 0) reasons.push('the take\'s lines name no speaking character');
    if (speakers.length > 1) reasons.push(`${speakers.length} characters speak in this take: one speaker per correction`);
  }
  const duration = take.durationSeconds ?? 0;
  if (duration > cap.maxSeconds) reasons.push(`the take is ${duration.toFixed(1)} s; the corrector takes at most ${cap.maxSeconds} s`);
  const speakerId = speakers.length === 1 ? speakers[0] : undefined;
  return {
    eligible: reasons.length === 0, reasons, flags, speakerId, style,
    otherCharacterIds: sh.characterIds.filter((c) => c !== speakerId),
    audioAssetId: st?.assetId, audioOffset: (take.trimStartFrames ?? 0) / fps,
  };
}

/** THE PRODUCER'S ACTION "Repair lip-sync" on a take (for the pages; pure): whether to offer it and, when not, why.
 *  `flagged` says whether the take's own lip-sync check asked for it (FAIL / REVIEW) — the producer may also ask after
 *  watching a take whose check passed. Queue it as `CORRECT_LIPSYNC { productionId, shotId, takeId, confirm: true,
 *  reason }` (POST /api/jobs); the result is a new derived take of the shot, never a change of this one. */
export function lipsyncRepairOffer(p: Pick<Production, 'kind' | 'style'>, sh: Pick<Shot, 'dialogue' | 'characterIds'>, take: Take, cap: LipsyncCapability = LIPSYNC_LATENTSYNC_16, fps = 24): { available: boolean; flagged: boolean; reasons: string[] } {
  const plan = planCorrection(p, sh, take, { confirm: true, reason: 'offer' }, cap, fps);
  return { available: plan.eligible, flagged: plan.flags.some((f) => f !== 'VISUAL_REVIEW'), reasons: plan.reasons };
}

export interface CorrectionMeasures {
  frames: { original: number; corrected: number };
  /** Tier-1 mouth check (MAR vs speech envelope, best lag) of the speaker before and after */
  corr: { before: number | null; after: number | null };
  /** Tier-1 mouth activity inside the speech (|dMAR/dt|), before and after: how lively the mouth performance is */
  activityInside?: { before: number | null; after: number | null };
  /** SFace to the canonical image, median, before and after */
  canonical: { before: number | null; after: number | null };
  /** SFace (median) of the original take's and of the corrected take's faces against one frame of the original */
  selfIdentity: { before: number | null; after: number | null };
  /** the corrector's own report: share of frames corrected at full strength, the face height */
  fullStrengthShare: number;
  faceHeightPx: number | null;
}

export interface CorrectionVerdict { accepted: boolean; problems: string[]; notes: string[] }

/** Is the corrected take accepted (READY) or kept as REJECTED with its problems? Missing measurements are problems:
 *  a correction is never accepted on trust. */
export function judgeCorrection(m: CorrectionMeasures, cap: LipsyncCapability = LIPSYNC_LATENTSYNC_16): CorrectionVerdict {
  const problems: string[] = []; const notes: string[] = [];
  const f = (x: number | null) => (x === null ? 'n/a' : x.toFixed(2));
  if (m.frames.corrected !== m.frames.original) problems.push(`the corrected take has ${m.frames.corrected} frames, the original ${m.frames.original}`);
  if (m.faceHeightPx !== null && m.faceHeightPx < cap.minFacePx) problems.push(`the speaker's face is ${Math.round(m.faceHeightPx)} px tall (< ${cap.minFacePx})`);
  if (m.fullStrengthShare < cap.minFullStrengthShare) problems.push(`only ${Math.round(m.fullStrengthShare * 100)} % of the frames could be corrected at full strength (profile or lost face; < ${Math.round(cap.minFullStrengthShare * 100)} %)`);
  if (m.selfIdentity.before === null || m.selfIdentity.after === null) problems.push('the corrected face could not be compared with the original take');
  else if (m.selfIdentity.before - m.selfIdentity.after > cap.accept.selfIdentityDropMax) problems.push(`the face changed: against a frame of the original take it scores ${f(m.selfIdentity.after)}, the original take itself ${f(m.selfIdentity.before)}`);
  else notes.push(`the same face: ${f(m.selfIdentity.before)} → ${f(m.selfIdentity.after)} against a frame of the original take`);
  if (m.canonical.before !== null && m.canonical.after !== null) {
    const drop = m.canonical.before - m.canonical.after;
    if (drop > cap.accept.canonicalDropMax) problems.push(`identity to the canonical image fell from ${f(m.canonical.before)} to ${f(m.canonical.after)}`);
    else notes.push(`identity to the canonical image ${f(m.canonical.before)} → ${f(m.canonical.after)}`);
  } else problems.push('identity to the canonical image was not measured');
  if (m.corr.before === null || m.corr.after === null) problems.push('the mouth check could not be measured before and after');
  else if (cap.accept.corrMustNotFall && m.corr.after < m.corr.before) problems.push(`the mouth follows the audio less after the correction (r ${f(m.corr.before)} → ${f(m.corr.after)})`);
  else notes.push(`mouth vs audio r ${f(m.corr.before)} → ${f(m.corr.after)}`);
  const ai = m.activityInside;
  if (ai && ai.before !== null && ai.after !== null && ai.before > 0) {
    const drop = (ai.before - ai.after) / ai.before;
    if (drop > cap.accept.performanceDropMax) problems.push(`the mouth performance is flattened: activity while speaking ${f(ai.before)} → ${f(ai.after)} (−${Math.round(drop * 100)} %)`);
    else notes.push(`mouth activity while speaking ${f(ai.before)} → ${f(ai.after)}`);
  }
  return { accepted: problems.length === 0, problems, notes };
}
