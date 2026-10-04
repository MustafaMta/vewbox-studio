import { greyFrames, meanAbsDiff, p95 } from './assembly-joins';

/** DOES THE TAKE'S OPENING REPEAT THE TAIL? (docs/research/STORYBUILDER-INTEGRATION.md §f.3, gap V2.) A continuation
 *  anchors the previous shot's last frames at frame 0, and the cut drops that many frames of the take on the
 *  assumption that the model re-rendered them. The assumption is MEASURED here before anything is dropped: the
 *  take's first frames are compared with the tail clip frame by frame (64×36 grey, mean absolute luma difference —
 *  the same measure as the join QA). When the head is a close re-render the trim stands (and a head that lands a
 *  frame early or late corrects the trim); when it is not, the take is kept untrimmed and its join is HARD, with the
 *  numbers recorded on the take. The floor below is a code default (C1 measured the re-rendered head at PSNR 38.7 dB,
 *  about 3 luma levels RMS); the model phase (Q1) sets it from a distribution over seeds. */

export const GUIDE_HEAD = {
  /** mean luma difference (0–255, 64×36 grey) up to which the head counts as a repeat of the tail */
  maxMeanDiff: 12,
  /** how far before and after the planned last guide frame the tail's last frame is looked for */
  searchBefore: 3, searchAfter: 2,
  /** a shifted match must beat the planned frame's difference by this factor to move the trim */
  shiftGain: 0.6,
} as const;

export interface GuideHeadMetric {
  /** the planned guide length (frames the cut would drop) */
  frames: number;
  takeFrames: number; tailFrames: number;
  /** per-frame mean luma difference, take frame i against tail frame i */
  perFrame: number[];
  meanDiff: number; maxDiff: number;
  /** the tail's own frame-to-frame change (p95): how much a frame may differ from its neighbour in this material */
  tailMotionP95: number;
  /** the take frame that best matches the tail's LAST frame, searched around frames−1 */
  lastMatchIndex: number; lastMatchDiff: number; plannedLastDiff: number;
  threshold: number;
  repeats: boolean;
  /** the trim to apply: frames (or the corrected lastMatchIndex + 1) when the head repeats; 0 when it does not */
  trimStartFrames: number;
  corrected: boolean;
  detail: string;
}

/** Judge a take's head against the tail it was anchored on. Pure: grey frames in, verdict out. */
export function judgeGuideHead(take: Uint8Array[], tail: Uint8Array[], frames: number, opts: Partial<typeof GUIDE_HEAD> = {}): GuideHeadMetric {
  const o = { ...GUIDE_HEAD, ...opts };
  const g = Math.min(frames, tail.length, take.length);
  const perFrame = Array.from({ length: g }, (_, i) => Number(meanAbsDiff(take[i], tail[i]).toFixed(3)));
  const meanDiff = perFrame.length ? perFrame.reduce((a, b) => a + b, 0) / perFrame.length : 255;
  const maxDiff = perFrame.length ? Math.max(...perFrame) : 255;
  const tailMotionP95 = p95(tail.slice(1).map((f, i) => meanAbsDiff(tail[i], f)));
  const threshold = Math.max(o.maxMeanDiff, tailMotionP95);
  const repeats = g > 0 && g === frames && meanDiff <= threshold;
  // where the tail's last frame really lands in the take: the planned frame (frames − 1), or a neighbour that matches
  // it clearly better (the model re-rendered the head a frame early or late)
  const last = tail[tail.length - 1];
  const planned = frames - 1;
  const plannedLastDiff = planned < take.length && last ? meanAbsDiff(take[planned], last) : 255;
  let lastMatchIndex = planned; let lastMatchDiff = plannedLastDiff;
  if (last) for (let i = Math.max(0, planned - o.searchBefore); i <= Math.min(take.length - 1, planned + o.searchAfter); i++) {
    const d = meanAbsDiff(take[i], last);
    if (d < lastMatchDiff) { lastMatchDiff = d; lastMatchIndex = i; }
  }
  const corrected = repeats && lastMatchIndex !== planned && lastMatchDiff <= o.shiftGain * plannedLastDiff;
  const trimStartFrames = !repeats ? 0 : corrected ? lastMatchIndex + 1 : frames;
  const detail = !repeats
    ? `the take's first ${g} frame(s) differ from the tail by ${meanDiff.toFixed(2)} luma on average (max ${maxDiff.toFixed(2)}; allowed ${threshold.toFixed(2)}): the model did not repeat the tail, so the take is kept untrimmed and joined by a hard cut`
    : corrected
      ? `the head repeats the tail (mean difference ${meanDiff.toFixed(2)} luma) but its last frame lands at take frame ${lastMatchIndex}, not ${planned}: the trim moves to ${trimStartFrames} frames`
      : `the head repeats the tail (mean difference ${meanDiff.toFixed(2)} luma, allowed ${threshold.toFixed(2)}); ${frames} frames are dropped`;
  return { frames, takeFrames: take.length, tailFrames: tail.length, perFrame, meanDiff: Number(meanDiff.toFixed(3)), maxDiff: Number(maxDiff.toFixed(3)), tailMotionP95: Number(tailMotionP95.toFixed(3)), lastMatchIndex, lastMatchDiff: Number(lastMatchDiff.toFixed(3)), plannedLastDiff: Number(plannedLastDiff.toFixed(3)), threshold: Number(threshold.toFixed(3)), repeats, trimStartFrames, corrected, detail };
}

/** Measure a generated take's head against the tail clip it was anchored on (both decoded by ffmpeg). Only the first
 *  frames of the take are read. */
export async function measureGuideHead(takeFile: string, tailFile: string, frames: number, opts: Partial<typeof GUIDE_HEAD> = {}): Promise<GuideHeadMetric> {
  const want = frames + (opts.searchAfter ?? GUIDE_HEAD.searchAfter) + 1;
  const [take, tail] = await Promise.all([greyFrames(takeFile, want), greyFrames(tailFile)]);
  return judgeGuideHead(take, tail, frames, opts);
}

/** What the take records about the measurement (`params.guide.head`) and the join it decided. */
export type { GuideJoin } from '@/domain/timeline';
export interface GuideHeadRecord { repeats: boolean; meanDiff: number; maxDiff: number; threshold: number; lastMatchIndex: number; corrected: boolean; trimStartFrames: number; detail: string }
export const guideHeadRecord = (m: GuideHeadMetric): GuideHeadRecord => ({ repeats: m.repeats, meanDiff: m.meanDiff, maxDiff: m.maxDiff, threshold: m.threshold, lastMatchIndex: m.lastMatchIndex, corrected: m.corrected, trimStartFrames: m.trimStartFrames, detail: m.detail });

export { guideJoinOf } from '@/domain/timeline';
