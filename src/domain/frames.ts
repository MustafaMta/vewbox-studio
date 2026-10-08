import type { Asset } from './types';
import type { Framing } from './vocabulary';

/** The people count recorded on a drawn shot frame (src/worker/handlers/images.ts drawShotFrame): how many people the
 *  vision model counted against how many the shot has. Absent when the frame was not counted (no vision model, an
 *  uploaded frame, a frame from before the count was kept). Read by the preflight (a failed count is never filmed
 *  from) and the shot page (shown beside the frame). */
export interface FrameCheck { expected: number; counted: number; ok: boolean }
/** The face of a drawn frame measured against the character's canonical image (SFace cosine, the take QA's judge):
 *  recorded when the frame was edited to the moment's expression and condition, which can move a face. FAIL is never
 *  filmed from; REVIEW is shown beside the frame. */
export interface FrameIdentity { characterId: string; median: number | null; verdict: 'PASS' | 'REVIEW' | 'FAIL' | 'NOT_MEASURED' }
export function frameIdentityOf(a: Pick<Asset, 'provenance'> | undefined): FrameIdentity | undefined {
  const x = a?.provenance?.identityCheck as { characterId?: unknown; median?: unknown; verdict?: unknown } | undefined;
  return x && typeof x.characterId === 'string' && typeof x.verdict === 'string' ? { characterId: x.characterId, median: typeof x.median === 'number' ? x.median : null, verdict: x.verdict as FrameIdentity['verdict'] } : undefined;
}

export function frameCheckOf(a: Pick<Asset, 'provenance'> | undefined): FrameCheck | undefined {
  const pc = a?.provenance?.peopleCheck as { expected?: unknown; counted?: unknown; ok?: unknown } | undefined;
  return pc && typeof pc.expected === 'number' && typeof pc.counted === 'number' ? { expected: pc.expected, counted: pc.counted, ok: pc.ok === true } : undefined;
}

/** THE FRAME REALISES ITS FRAMING (continuity recovery 2026-10-08, "The Last Crossing" 2.1 and 2.5): two planned
 *  INSERTs were drawn as medium shots of the whole man, and H3, told "close-up on the hands", cut inside the take to
 *  match the words. The drawn frame is measured by its largest confident face (YuNet), as a share of the frame's
 *  height, and placed on the framing ladder; a frame two steps from its plan is refused before filming, one step is
 *  a warning. START thresholds (face share of the frame height, from FACE_FRAMING: a close-up's face is ~1/1.9 of the
 *  frame, a medium close-up's ~1/3.0, a medium's ~1/4.6). */
export const FRAMING_LADDER = ['WIDE', 'MEDIUM_WIDE', 'MEDIUM', 'MEDIUM_CLOSE_UP', 'CLOSE_UP'] as const;
export type LadderStep = (typeof FRAMING_LADDER)[number];
export const FACE_SHARE_STEPS: Array<{ min: number; step: LadderStep }> = [{ min: 0.42, step: 'CLOSE_UP' }, { min: 0.27, step: 'MEDIUM_CLOSE_UP' }, { min: 0.15, step: 'MEDIUM' }, { min: 0.07, step: 'MEDIUM_WIDE' }, { min: 0, step: 'WIDE' }];
/** An insert shows a hand or an object: a face this large (share of the frame height) means a person was drawn. */
export const INSERT_MAX_FACE_SHARE = 0.1;

export interface FrameFraming { planned: Framing; measured: LadderStep | 'NO_FACE'; faceShare: number | null; verdict: 'PASS' | 'REVIEW' | 'FAIL' | 'NOT_MEASURED'; note?: string }

/** Where a planned framing sits on the ladder (a two-shot and an over-the-shoulder are medium; an extreme close-up is
 *  a close-up; an insert has no face step). */
const plannedStep = (f: Framing): LadderStep | undefined => (f === 'EXTREME_WIDE' ? 'WIDE' : f === 'TWO_SHOT' || f === 'OVER_THE_SHOULDER' ? 'MEDIUM' : f === 'EXTREME_CLOSE_UP' ? 'CLOSE_UP' : f === 'INSERT' ? undefined : (f as LadderStep));

/** The verdict on a drawn frame's framing from its largest face (`faceHeight` and `frameHeight` in pixels; no face:
 *  undefined). Pure (tested). */
export function judgeFrameFraming(planned: Framing, faceHeight: number | undefined, frameHeight: number): FrameFraming {
  const share = faceHeight && frameHeight > 0 ? Math.round((faceHeight / frameHeight) * 1000) / 1000 : null;
  const measured: FrameFraming['measured'] = share === null ? 'NO_FACE' : FACE_SHARE_STEPS.find((s) => share >= s.min)!.step;
  if (planned === 'INSERT') {
    if (share === null || share < INSERT_MAX_FACE_SHARE) return { planned, measured, faceShare: share, verdict: 'PASS' };
    return { planned, measured, faceShare: share, verdict: 'FAIL', note: `an insert shows a hand or an object, but a face fills ${Math.round(share * 100)} % of the frame's height (a ${measured.toLowerCase().replace(/_/g, ' ')})` };
  }
  const want = plannedStep(planned)!;
  // a close shot may be on a hand or an object, and a person may face away: no face is nothing measured
  if (share === null) return { planned, measured, faceShare: null, verdict: 'NOT_MEASURED', note: 'no face in the frame' };
  const gap = Math.abs(FRAMING_LADDER.indexOf(measured as LadderStep) - FRAMING_LADDER.indexOf(want));
  const words = (s: string) => s.toLowerCase().replace(/_/g, ' ');
  if (gap === 0) return { planned, measured, faceShare: share, verdict: 'PASS' };
  return { planned, measured, faceShare: share, verdict: gap >= 2 ? 'FAIL' : 'REVIEW', note: `planned ${words(planned)}, drawn as about a ${words(measured)} (the face is ${Math.round(share * 100)} % of the frame's height)` };
}

export function frameFramingOf(a: Pick<Asset, 'provenance'> | undefined): FrameFraming | undefined {
  const x = a?.provenance?.framingCheck as Partial<FrameFraming> | undefined;
  return x && typeof x.planned === 'string' && typeof x.verdict === 'string' ? { planned: x.planned as Framing, measured: (x.measured ?? 'NO_FACE') as FrameFraming['measured'], faceShare: typeof x.faceShare === 'number' ? x.faceShare : null, verdict: x.verdict as FrameFraming['verdict'], note: x.note } : undefined;
}

/** THE PREVIOUS SHOT'S ACTUAL END, AS A FRAME'S REFERENCE (continuity recovery 2026-10-08): a CUT's opening frame is
 *  drawn with the last frame the cut shows of the previous shot's chosen take — its clothes and their condition, what
 *  each hand holds, the objects and the light, as filmed. Recorded on the frame so a frame drawn from an older take of
 *  the previous shot is known to be stale. */
export interface PreviousEnd { shotId: string; takeId: string; assetId: string; sourceFrame: number }
export function previousEndOf(a: Pick<Asset, 'provenance'> | undefined): PreviousEnd | undefined {
  const x = a?.provenance?.previousEnd as Partial<PreviousEnd> | undefined;
  return x && typeof x.shotId === 'string' && typeof x.takeId === 'string' && typeof x.assetId === 'string' && typeof x.sourceFrame === 'number' ? { shotId: x.shotId, takeId: x.takeId, assetId: x.assetId, sourceFrame: x.sourceFrame } : undefined;
}