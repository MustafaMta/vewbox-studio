import { and, desc, eq } from 'drizzle-orm';
import { StudioError } from '@/domain/errors';
import { approvalSubjectHash, isGatedStage } from '@/domain/approvals';
import { db, schema } from '../db/client';
import { log } from '../log';
import type { PipelineStage } from './model';

/** HUMAN GATES — two decisions stay with a person: the story (before anything is generated for it) and the cut
 *  (before it is exported). A gate is a recorded approval; the worker refuses the gated job without one, with a
 *  message that says where to give it. Nothing here is bypassed by a retry.
 *  BOUND APPROVALS (docs/BACKEND-AUDIT-2026-10.md H9, step 9): an approval records the hash of what was approved
 *  (src/domain/approvals.ts); the gate opens only while the subject still hashes the same — a redeveloped story or a
 *  re-selected take needs a new approval. An approval recorded before step 9 (no hash) is honoured as it was.
 *  Rollback: APPROVAL_BINDING=off compares nothing. */

export const GATES: Partial<Record<PipelineStage, { blocks: string; message: string; changed: string }>> = {
  STORY: { blocks: 'PRODUCE', message: 'The story needs your approval before production starts: open Production (or the Produce tab) and approve it.', changed: 'The story changed after you approved it (a scene, the logline or the synopsis): review it and approve it again before production starts.' },
  EDIT: { blocks: 'EXPORT', message: 'The cut needs your approval before it is exported: watch it on the Final Cut tab and approve it.', changed: 'The cut changed after you approved it (another take was chosen, a shot was added or removed, or it was assembled again): watch it and approve it again before it is exported.' },
};

const bindingOn = () => process.env.APPROVAL_BINDING !== 'off';

export async function latestApproval(productionId: string, stage: PipelineStage) {
  const rows = await db().select().from(schema.approvals).where(and(eq(schema.approvals.productionId, productionId), eq(schema.approvals.stage, stage))).orderBy(desc(schema.approvals.createdAt)).limit(1);
  return rows[0];
}

/** Whether the latest approval of a stage still holds: APPROVED, and (bound) its subject unchanged. */
export async function approvalHolds(productionId: string, stage: PipelineStage): Promise<{ ok: boolean; reason?: 'NONE' | 'NOT_APPROVED' | 'CHANGED'; approvalId?: string }> {
  const a = await latestApproval(productionId, stage);
  if (!a) return { ok: false, reason: 'NONE' };
  if (a.decision !== 'APPROVED') return { ok: false, reason: 'NOT_APPROVED', approvalId: a.id };
  if (!a.subjectHash || !isGatedStage(stage) || !bindingOn()) {
    if (!a.subjectHash && isGatedStage(stage)) log.info({ productionId, stage, approvalId: a.id }, 'gate: an approval recorded before step 9 (no subject hash) is honoured as it was');
    return { ok: true, approvalId: a.id };
  }
  const { readState } = await import('../studio/engine');
  const p = (await readState()).state.productions.find((x) => x.id === productionId);
  if (!p) return { ok: false, reason: 'NONE' };
  return approvalSubjectHash(p, stage) === a.subjectHash ? { ok: true, approvalId: a.id } : { ok: false, reason: 'CHANGED', approvalId: a.id };
}

/** Throw unless the gate is open. The error is non-retryable: a person has to act. */
export async function requireApproval(productionId: string, stage: PipelineStage): Promise<void> {
  const r = await approvalHolds(productionId, stage);
  if (r.ok) return;
  const gate = GATES[stage];
  const message = r.reason === 'CHANGED' ? gate?.changed ?? `${stage} changed since it was approved; approve it again.` : gate?.message ?? `${stage} needs approval first.`;
  throw Object.assign(new StudioError('INVALID', message, { stage, gate: 'APPROVAL', reason: r.reason, approvalId: r.approvalId }), { failureClass: 'INVALID_INPUT', retryable: false });
}
