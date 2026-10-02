import { json, route } from '@/server/http';
import { bootstrap } from '@/server/bootstrap';
import { readOrg } from '@/server/org/registry';
import { agentStats, listStudioEvents, pipelinePositions, recentApprovals, recentHandoffs } from '@/server/org/runs';
import { PIPELINE } from '@/server/org/model';
import { listJobs, queueStats } from '@/server/jobs/queue';
import { readState } from '@/server/studio/engine';

export const dynamic = 'force-dynamic';

/** The studio as an organisation: departments, agents, tools and skills as persisted, each agent's real run
 *  statistics, the pipeline graph, the queue, the latest activity, the latest handoffs and approvals, every
 *  production's position in the pipeline, and the jobs in flight — everything the company diagram and the
 *  orchestrator panel show. All of it comes from the database. */
export const GET = route(async (req) => {
  await bootstrap();
  const sp = new URL(req.url).searchParams;
  const hours = Math.min(24 * 365, Math.max(1, Number(sp.get('hours') ?? 24 * 30) || 24 * 30));
  const { state } = await readState();
  const active = state.productions.filter((p) => p.stage !== 'COMPLETE').map((p) => p.id);
  const [org, stats, events, queue, handoffs, approvals, positions, jobs] = await Promise.all([
    readOrg(), agentStats(hours), listStudioEvents({ limit: Number(sp.get('events') ?? 60) || 60 }), queueStats(), recentHandoffs(40), recentApprovals(20), pipelinePositions(active), listJobs({ activeOnly: true, limit: 100 }),
  ]);
  return json({ ...org, pipeline: PIPELINE, stats, events, queue, hours, handoffs, approvals, positions, jobs: jobs.map((j) => ({ id: j.id, type: j.type, status: j.status, productionId: j.productionId, shotId: j.shotId, attempts: j.attempts, maxAttempts: j.maxAttempts, progress: j.progress, createdAt: j.createdAt })) }, { headers: { 'Cache-Control': 'no-store' } });
});
