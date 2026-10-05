import { greyFrames, meanAbsDiff } from './assembly-joins';

/** DOES THE TAKE'S PLACE MATCH ITS CANONICAL PLATE? (the Location Bible's drift check.) The take's first kept frame
 *  (after a continuation's repeated head) is compared with the plate the take was conditioned on, with the measure of
 *  the join QA and the guide-head check (src/server/media/assembly-joins.ts): both decoded by ffmpeg to 64×36 grey,
 *  then the mean absolute luma difference. Two numbers are recorded:
 *  - `rawMeanDiff`: the plain mean absolute difference (0–255);
 *  - `meanDiff`: the same after each picture's own mean is subtracted (exposure-normalised), so a plate drawn at one
 *    brightness and a take lit a little differently are compared on their structure — the DECISION reads this one.
 *  THE THRESHOLD (`PLATE_DRIFT.maxMeanDiff` = 36 luma levels, normalised) is a PROVISIONAL code default set between
 *  two measured ranges on this machine (ffmpeg, a 640×360 testsrc2 plate, H.264 CRF 23 takes, frame 22): the SAME
 *  place re-rendered — re-encoded 0.1, +8 % exposure 0.1, blurred 2.0, reframed 3 % 7.6, a grey figure in front 3.8,
 *  all of these together 13.4, a black full-height figure over a tenth of the frame 27.2 (the hard case) — against
 *  ANOTHER picture (mandelbrot, SMPTE bars, cellular automata, life, RGB and YUV test sources) 51.2–70.1. A generated
 *  take of the right place also holds people and another camera position, so its true distribution has to be
 *  measured over real takes before the number is trusted. Until then a mismatch is REVIEW (never a rejection), and
 *  every take records the numbers, the frame, the plate and the threshold — a measured fact, never an invented score. */

export const PLATE_DRIFT = {
  /** exposure-normalised mean absolute luma difference (64×36 grey) up to which the place counts as its plate */
  maxMeanDiff: 36,
  measure: 'mean absolute luma difference, 64x36 grey, each picture minus its own mean (src/server/media/assembly-joins.ts)',
  basis: 'provisional: same place re-rendered 0.1–27.2, another picture 51.2–70.1 (ffmpeg-made, tests/unit/plate-drift.test.ts); calibrate over real takes',
} as const;

export interface PlateDrift {
  plateAssetId: string;
  /** the take frame compared (its first kept frame) */
  frame: number;
  meanDiff: number;
  rawMeanDiff: number;
  threshold: number;
  matches: boolean;
  measure: string;
  basis: string;
  detail: string;
}

const meanOf = (a: Uint8Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; };

/** The exposure-normalised mean absolute difference: each picture minus its own mean. */
export function centredMeanAbsDiff(a: Uint8Array, b: Uint8Array): number {
  const ma = meanOf(a), mb = meanOf(b);
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs((a[i] - ma) - (b[i] - mb));
  return n ? s / n : 0;
}

/** Judge one take frame against the plate. Pure: grey pictures in, verdict out. */
export function judgePlateDrift(frame: Uint8Array, plate: Uint8Array, at: { plateAssetId: string; frame: number }, opts: { maxMeanDiff?: number } = {}): PlateDrift {
  const threshold = opts.maxMeanDiff ?? PLATE_DRIFT.maxMeanDiff;
  const meanDiff = Number(centredMeanAbsDiff(frame, plate).toFixed(3));
  const rawMeanDiff = Number(meanAbsDiff(frame, plate).toFixed(3));
  const matches = meanDiff <= threshold;
  const detail = matches
    ? `the take's frame ${at.frame} matches the plate ${at.plateAssetId}: ${meanDiff.toFixed(2)} luma levels apart after exposure (raw ${rawMeanDiff.toFixed(2)}), allowed ${threshold}`
    : `the take's frame ${at.frame} differs from the plate ${at.plateAssetId} by ${meanDiff.toFixed(2)} luma levels after exposure (raw ${rawMeanDiff.toFixed(2)}), over the provisional ${threshold}: look before choosing it (review, not rejected)`;
  return { plateAssetId: at.plateAssetId, frame: at.frame, meanDiff, rawMeanDiff, threshold, matches, measure: PLATE_DRIFT.measure, basis: PLATE_DRIFT.basis, detail };
}

/** Measure a take's frame against a plate file (both decoded by ffmpeg; only the frames up to `frame` are read). */
export async function measurePlateDrift(takeFile: string, frame: number, plateFile: string, plateAssetId: string, opts: { maxMeanDiff?: number } = {}): Promise<PlateDrift> {
  const [frames, plate] = await Promise.all([greyFrames(takeFile, frame + 1), greyFrames(plateFile, 1)]);
  const f = frames[Math.min(frame, frames.length - 1)];
  if (!f || !plate[0]) throw new Error(`could not decode ${!f ? `frame ${frame} of the take` : 'the plate'}`);
  return judgePlateDrift(f, plate[0], { plateAssetId, frame: Math.min(frame, frames.length - 1) }, opts);
}

/** The identity re-application check, as the take records it: each present character's canonical image and the
 *  place's plate were connected and bound in the request that was sent (from the identity rule's report, judged on
 *  the request before the engine). */
export interface IdentityApplied { characterId: string; assetId?: string; picture?: number; applied: boolean; why?: string }
export function identityAppliedChecks(report: { ok: boolean; lowered?: string; characters: Array<{ characterId: string; name: string; assetId?: string; picture?: number; ok: boolean; why?: string }> }): { ok: boolean; characters: IdentityApplied[]; detail: string } {
  const characters = report.characters.map((c) => ({ characterId: c.characterId, assetId: c.assetId, picture: c.picture, applied: c.ok && (Boolean(report.lowered) || Boolean(c.picture && c.assetId)), why: c.why }));
  const ok = characters.every((c) => c.applied);
  const detail = report.lowered
    ? `waived: ${report.lowered}`
    : characters.length
      ? `${characters.filter((c) => c.applied).length} of ${characters.length} present character(s) conditioned on their canonical image (${characters.map((c) => `${c.characterId}: ${c.picture ? `<Picture ${c.picture}> = ${c.assetId}` : 'not applied'}`).join('; ')})`
      : 'no character in the shot';
  return { ok, characters, detail };
}
