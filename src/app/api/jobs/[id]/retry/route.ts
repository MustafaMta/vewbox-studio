import { and, eq } from 'drizzle-orm';
import { getJob, retry } from '@/server/jobs/queue';
import { json, route } from '@/server/http';
import { db, schema } from '@/server/db/client';
import { StudioError } from '@/domain/errors';
import { FAILURE_CLASSES, type FailureClass } from '@/server/org/model';
import { RETRYABLE_CLASSES, agentForJob, studioEvent } from '@/server/org/runs';

export const dynamic = 'force-dynamic';

/** The failure class a failed job was recorded with (the worker writes it into the error details). */
function failureClassOf(job: NonNullable<Awaited<ReturnType<typeof getJob>>>): FailureClass | undefined {
  const fc = job.error?.details?.failureClass;
  return typeof fc === 'string' && (FAILURE_CLASSES as readonly string[]).includes(fc) ? (fc as FailureClass) : undefined;
}

/** Retry a failed or cancelled job. A retry is an investigated attempt: `changeMade` in the body says what was
 *  corrected and is recorded on the job's open reliability events. It is REQUIRED when the last failure was not a
 *  transient one (only infrastructure, provider and resource failures may be retried unchanged; a cancelled job may
 *  be restarted as it was). */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  let changeMade: string | undefined;
  try { const body = (await req.json()) as { changeMade?: string } | null; changeMade = body?.changeMade?.trim().slice(0, 500) || undefined; } catch { /* no body */ }
  const before = await getJob(id);
  if (!before) throw new StudioError('NOT_FOUND', `Job ${id} not found`);
  if (before.status === 'FAILED' && !changeMade) {
    const fc = failureClassOf(before);
    const transient = fc ? RETRYABLE_CLASSES.includes(fc) : before.error?.retryable === true;
    if (!transient) throw new StudioError('INVALID', `This job failed with ${fc ?? 'an unclassified failure'}, which an unchanged retry would repeat. Correct the cause first and say what changed (changeMade).`, { failureClass: fc, needs: 'changeMade' });
  }
  const job = await retry(id);
  if (changeMade) {
    await db().update(schema.reliabilityEvents).set({ changeMade }).where(and(eq(schema.reliabilityEvents.jobId, id), eq(schema.reliabilityEvents.resolved, false)));
    const agent = agentForJob(job);
    await studioEvent({ departmentId: 'QA', agentId: 'reliability-engineer', productionId: job.productionId, kind: 'RETRY_WITH_CHANGE', message: `Retry of ${job.type} (attempt ${job.attempts + 1}) by ${agent.name}: ${changeMade}`, data: { changeMade }, jobId: job.id });
  }
  return json({ job });
});
