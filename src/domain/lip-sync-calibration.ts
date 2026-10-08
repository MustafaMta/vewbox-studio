/** THE MOUTH MEASURE'S OWN LEAD (calibrated 2026-10-08, "The Last Crossing" 2.3). The Tier-1 lip-sync check
 *  (docker/asr/qa.py) correlates the mouth aperture with the loudness envelope of the line. A mouth opens before its
 *  sound (anticipation, a silent /h/ under the noise floor) and the envelope decays after it, so the best lag of an
 *  IN-SYNC face is not 0. Measured on the same clip and the same audio: the H3 take −4 frames (r 0.77) and LatentSync
 *  1.6's redraw of it — a model trained to be in sync — −5/−4 (r 0.78). Every speaking take measured −4 (1.2, 2.3) and
 *  the cut had been moving the line 4 frames EARLIER, so the sound led the picture by ~170 ms. The lag is judged from
 *  this point: a calibrated lag of 0 is in sync. n=1 clip with a usable correlation; recalibrate when a real recorded
 *  in-sync clip or SyncNet is available. */
export const MOUTH_MEASURE_LEAD_MS = -167;
/** Recorded on each new lip-sync record; a record without it holds the raw lag (read through `calibratedLagOf`). */
export const MOUTH_LAG_CALIBRATION = 'mouth-lead-167ms';

/** The measure's lead in frames at `fps` (−4 at 24 fps). */
export const mouthLeadFrames = (fps: number): number => Math.round((MOUTH_MEASURE_LEAD_MS * fps) / 1000);

/** A raw best lag (frames, positive = mouth later than the sound) as an offset from sync. */
export const calibratedLag = (rawLagFrames: number, fps: number): number => rawLagFrames - mouthLeadFrames(fps);

/** The search window the check needs: ±200 ms around the measure's lead, so ±(|lead| + 200) ms from zero. */
export const MOUTH_SEARCH_MS = Math.abs(MOUTH_MEASURE_LEAD_MS) + 200;

/** The calibrated lag of a stored lip-sync record (`take.params.lipSync`); an older record carries the raw lag. */
export function calibratedLagOf(ls: { lagFrames?: unknown; calibration?: unknown } | undefined, fps = 24): number | null {
  if (typeof ls?.lagFrames !== 'number') return null;
  return ls.calibration === MOUTH_LAG_CALIBRATION ? ls.lagFrames : calibratedLag(ls.lagFrames, fps);
}
