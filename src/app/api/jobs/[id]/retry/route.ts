import { and, eq } from 'drizzle-orm';
import { retry } from '@/server/jobs/queue';
import { json, route } from '@/server/http';
import { db, schema } from '@/server/db/client';
import { studioEvent } from '@/server/org/runs';
import { agentForJob } from '@/server/org/runs';

export const dynamic = 'force-dynamic';

/** Retry a failed or cancelled job. A retry is an investigated attempt: the optional `changeMade` in the body is
 *  recorded on the job's open reliability events (what was corrected before trying again). */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  let changeMade: string | undefined;
  try { const body = (await req.json()) as { changeMade?: string } | null; changeMade = body?.changeMade?.trim().slice(0, 500) || undefined; } catch { /* no body */ }
  const job = await retry(id);
  if (changeMade) {
    await db().update(schema.reliabilityEvents).set({ changeMade }).where(and(eq(schema.reliabilityEvents.jobId, id), eq(schema.reliabilityEvents.resolved, false)));
    const agent = agentForJob(job);
    await studioEvent({ departmentId: 'QA', agentId: 'reliability-engineer', productionId: job.productionId, kind: 'RETRY_WITH_CHANGE', message: `Retry of ${job.type} (attempt ${job.attempts + 1}) by ${agent.name}: ${changeMade}`, data: { changeMade }, jobId: job.id });
  }
  return json({ job });
});
