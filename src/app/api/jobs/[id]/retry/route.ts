import { getJob, retry } from '@/server/jobs/queue';
import { json, route } from '@/server/http';
import { StudioError } from '@/domain/errors';
import { agentForJob, recordChangeMade, retryNeedsChange, studioEvent } from '@/server/org/runs';

export const dynamic = 'force-dynamic';

/** Retry a failed or cancelled job. A retry is an investigated attempt: `changeMade` in the body says what was
 *  corrected and is recorded on the job's open failed attempts. It is REQUIRED when the last failure was not a
 *  transient one (only infrastructure, provider and resource failures may be retried unchanged; a cancelled job may
 *  be restarted as it was) — an unchanged retry of anything else would repeat the failure. */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  let changeMade: string | undefined;
  try { const body = (await req.json()) as { changeMade?: string } | null; changeMade = body?.changeMade?.trim().slice(0, 500) || undefined; } catch { /* no body */ }
  const before = await getJob(id);
  if (!before) throw new StudioError('NOT_FOUND', `Job ${id} not found`);
  const need = retryNeedsChange(before);
  if (need.needed && !changeMade) throw new StudioError('INVALID', `This job failed with ${need.failureClass ?? 'an unclassified failure'}, which an unchanged retry would repeat. Correct the cause first and say what changed (changeMade).`, { failureClass: need.failureClass, needs: 'changeMade' });
  const job = await retry(id);
  if (changeMade) {
    await recordChangeMade(id, changeMade);
    const agent = agentForJob(job);
    // the producer's correction, on the record of the agent whose job is retried (not an agent's own work)
    await studioEvent({ departmentId: agent.department, agentId: agent.id, productionId: job.productionId, kind: 'RETRY_WITH_CHANGE', message: `Retry of ${job.type} (attempt ${job.attempts + 1}) by ${agent.name}: ${changeMade}`, data: { changeMade }, jobId: job.id });
  }
  return json({ job });
});
