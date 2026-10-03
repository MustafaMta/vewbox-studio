import type { Asset, Production, Shot, ShotDialogue } from './types';

/** LINE REVIEW — a dialogue recording the voice check flagged (src/worker/handlers/voice.ts LineCheck: it drifted from
 *  the script, or it could not be heard back) waits for the producer's ear. It is settled when the producer KEEPS it
 *  (`keepLineRecordings`: the decision is recorded in the recording's provenance as `review`) or when the line is
 *  recorded again (its current recording is then another job's). A DIALOGUE_AUDIO job parked in AWAITING_REVIEW is
 *  settled once none of its lines is open (src/server/jobs/reviews.ts); the decisions selector lists only open lines. */

export interface LineReview { decision: 'KEPT'; by: string; at: string; shotId: string; lineId: string }

export const reviewOf = (a: Pick<Asset, 'provenance'>): LineReview | undefined => {
  const r = (a.provenance as { review?: LineReview } | undefined)?.review;
  return r && r.decision === 'KEPT' ? r : undefined;
};

/** Why a recording still needs a human ear: none or a null check — it was not heard back; `ok: false` — it drifted.
 *  Undefined when it passed, or when the producer kept it. */
export function earReason(a: Pick<Asset, 'provenance'>): 'NOT_HEARD' | 'DRIFTED' | undefined {
  if (reviewOf(a)) return undefined;
  const prov = a.provenance ?? {};
  if (!('check' in prov) || prov.check === null) return 'NOT_HEARD';
  return (prov.check as { ok?: boolean } | undefined)?.ok === false ? 'DRIFTED' : undefined;
}

/** The lines a job recorded (their CURRENT recording carries the job's id) that still need a human ear. */
export function openReviewLines(p: Production, assets: ReadonlyMap<string, Asset>, jobId: string): Array<{ shot: Shot; line: ShotDialogue; asset: Asset; reason: 'NOT_HEARD' | 'DRIFTED' }> {
  const out: Array<{ shot: Shot; line: ShotDialogue; asset: Asset; reason: 'NOT_HEARD' | 'DRIFTED' }> = [];
  for (const shot of p.shots) for (const line of shot.dialogue) {
    const asset = line.audioAssetId ? assets.get(line.audioAssetId) : undefined;
    const reason = asset && asset.jobId === jobId ? earReason(asset) : undefined;
    if (asset && reason) out.push({ shot, line, asset, reason });
  }
  return out;
}
