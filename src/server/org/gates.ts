import { and, desc, eq } from 'drizzle-orm';
import { StudioError } from '@/domain/errors';
import { db, schema } from '../db/client';
import type { PipelineStage } from './model';

/** HUMAN GATES — two decisions stay with a person: the story (before anything is generated for it) and the cut
 *  (before it is exported). A gate is a recorded approval; the worker refuses the gated job without one, with a
 *  message that says where to give it. Nothing here is bypassed by a retry. */

export const GATES: Partial<Record<PipelineStage, { blocks: string; message: string }>> = {
  STORY: { blocks: 'PRODUCE', message: 'The story needs your approval before production starts: open Production (or the Produce tab) and approve it.' },
  EDIT: { blocks: 'EXPORT', message: 'The cut needs your approval before it is exported: watch it on the Final Cut tab and approve it.' },
};

export async function latestApproval(productionId: string, stage: PipelineStage) {
  const rows = await db().select().from(schema.approvals).where(and(eq(schema.approvals.productionId, productionId), eq(schema.approvals.stage, stage))).orderBy(desc(schema.approvals.createdAt)).limit(1);
  return rows[0];
}

export async function isApproved(productionId: string, stage: PipelineStage): Promise<boolean> {
  const a = await latestApproval(productionId, stage);
  return a?.decision === 'APPROVED';
}

/** Throw unless the gate is open. The error is non-retryable: a person has to act. */
export async function requireApproval(productionId: string, stage: PipelineStage): Promise<void> {
  if (await isApproved(productionId, stage)) return;
  const gate = GATES[stage];
  throw Object.assign(new StudioError('INVALID', gate?.message ?? `${stage} needs approval first.`, { stage, gate: 'APPROVAL' }), { failureClass: 'INVALID_INPUT', retryable: false });
}
