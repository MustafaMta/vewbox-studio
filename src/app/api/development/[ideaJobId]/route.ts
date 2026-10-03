import { asc, eq } from 'drizzle-orm';
import { StudioError } from '@/domain/errors';
import { DEVELOPMENT_STAGES, type DevelopmentStage } from '@/domain/development';
import { db, schema } from '@/server/db/client';
import { json, route } from '@/server/http';
import { getJob, rowToJob } from '@/server/jobs/queue';
import { artifactsOf } from '@/server/development/artifacts';

export const dynamic = 'force-dynamic';

/** One Auto Idea's development, for the progress stepper and the "How this was developed" panel: the AUTO_IDEA job
 *  (status, the running stage's message, the steps it reported), its child jobs with the stage each runs (from the
 *  idempotency key `idea:${ideaJobId}:${stage}:n`), every versioned artifact, and the proposal once written. */
export const GET = route(async (_req, ctx: { params: Promise<{ ideaJobId: string }> }) => {
  const { ideaJobId } = await ctx.params;
  const job = await getJob(ideaJobId);
  if (!job || job.type !== 'AUTO_IDEA') throw new StudioError('NOT_FOUND', 'Auto Idea not found.');
  const [children, artifacts, proposals] = await Promise.all([
    db().select().from(schema.jobs).where(eq(schema.jobs.parentId, ideaJobId)).orderBy(asc(schema.jobs.createdAt)),
    artifactsOf(ideaJobId),
    db().select({ id: schema.proposals.id, createdAt: schema.proposals.createdAt }).from(schema.proposals).where(eq(schema.proposals.jobId, ideaJobId)),
  ]);
  const stageOf = (key: string | null): DevelopmentStage | undefined => { const s = key?.split(':')[2]; return (DEVELOPMENT_STAGES as readonly string[]).includes(s ?? '') ? (s as DevelopmentStage) : undefined; };
  return json({
    ideaJobId,
    job: { id: job.id, status: job.status, progress: job.progress, result: job.result, error: job.error, attempts: job.attempts, startedAt: job.startedAt, finishedAt: job.finishedAt, createdAt: job.createdAt },
    stages: children.map((r) => { const j = rowToJob(r); return { stage: stageOf(r.idempotencyKey), jobId: j.id, type: j.type, status: j.status, progress: j.progress, error: j.error, result: j.result, attempts: j.attempts, startedAt: j.startedAt, finishedAt: j.finishedAt }; }),
    artifacts,
    proposal: proposals[0] ?? null,
  }, { headers: { 'Cache-Control': 'no-store' } });
});
