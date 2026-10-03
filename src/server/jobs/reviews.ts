import { and, eq, inArray } from 'drizzle-orm';
import { openReviewLines } from '@/domain/line-review';
import { db, schema } from '../db/client';
import { readState, notifyJobs } from '../studio/engine';
import { log } from '../log';
import { addEvent } from './queue';

/** SETTLING A DIALOGUE REVIEW (src/domain/line-review.ts). A DIALOGUE_AUDIO job parked in AWAITING_REVIEW stands for
 *  the lines it recorded that the voice check flagged. Once none of them is open — each was kept by the producer
 *  (`keepLineRecordings`) or recorded again (its current recording is another job's) — the job is COMPLETED, with
 *  `result.review` saying how it was settled. Compare-and-set on the status, so a concurrent settle or retry wins
 *  once. Called after `keepLineRecordings` (POST /api/commands) and after every DIALOGUE_AUDIO run (a re-recording).
 *  Returns the settled job ids. */
export async function settleDialogueReviews(productionIds?: string[]): Promise<string[]> {
  const conds = [eq(schema.jobs.type, 'DIALOGUE_AUDIO'), eq(schema.jobs.status, 'AWAITING_REVIEW')];
  if (productionIds?.length) conds.push(inArray(schema.jobs.productionId, productionIds));
  const waiting = await db().select({ id: schema.jobs.id, productionId: schema.jobs.productionId, result: schema.jobs.result }).from(schema.jobs).where(and(...conds));
  if (waiting.length === 0) return [];
  const { state } = await readState();
  const assets = new Map(state.assets.map((a) => [a.id, a]));
  const settled: string[] = [];
  for (const j of waiting) {
    const p = state.productions.find((x) => x.id === j.productionId);
    if (p && openReviewLines(p, assets, j.id).length > 0) continue;
    // what settled it: the lines of this job the producer kept (the rest were recorded again, or are gone)
    const kept = p ? p.shots.flatMap((sh) => sh.dialogue.filter((d) => { const a = d.audioAssetId ? assets.get(d.audioAssetId) : undefined; return a?.jobId === j.id && (a.provenance as { review?: { decision?: string } } | undefined)?.review?.decision === 'KEPT'; }).map((d) => ({ shotId: sh.id, lineId: d.id }))) : [];
    const now = new Date().toISOString();
    const rows = await db().update(schema.jobs).set({ status: 'COMPLETED', finishedAt: now, updatedAt: now, progress: { phase: 'done', percent: 100, message: 'review settled' }, result: { ...(j.result ?? {}), awaitingReview: false, review: { settledAt: now, kept } } })
      .where(and(eq(schema.jobs.id, j.id), eq(schema.jobs.status, 'AWAITING_REVIEW'))).returning({ id: schema.jobs.id });
    if (!rows.length) continue;
    settled.push(j.id);
    log.info({ jobId: j.id, kept: kept.length }, 'dialogue review settled');
    await addEvent(j.id, 'info', `review settled: every flagged line kept (${kept.length}) or recorded again`, { kept }).catch(() => undefined);
    await notifyJobs(j.id, 'COMPLETED').catch(() => undefined);
  }
  return settled;
}
