import { json, params, route } from '@/server/http';
import { bootstrap } from '@/server/bootstrap';
import { readOrg } from '@/server/org/registry';
import { agentStats, listAgentRuns, listFailures, listStudioEvents } from '@/server/org/runs';
import { StudioError } from '@/domain/errors';

export const dynamic = 'force-dynamic';

/** One agent: its registration, its tools and skills (with the skill instructions it reads), its real runs. */
export const GET = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  await bootstrap();
  const { id } = await params(ctx);
  const sp = new URL(req.url).searchParams;
  const org = await readOrg();
  const agent = org.agents.find((a) => a.id === id);
  if (!agent) throw new StudioError('NOT_FOUND', `No agent ${id}`);
  const [runs, stats, events] = await Promise.all([listAgentRuns({ agentId: id, limit: Number(sp.get('limit') ?? 50) || 50 }), agentStats(24 * 365), listStudioEvents({ agentId: id, limit: 50 })]);
  // the failure history: the failed attempts of the jobs this agent ran (job_attempts, step 15)
  const jobIds = Array.from(new Set(runs.map((r) => r.jobId)));
  const failures = await listFailures({ jobIds, limit: 30 });
  return json({ agent, department: org.departments.find((d) => d.id === agent.department), tools: org.tools.filter((t) => agent.tools.includes(t.id)), skills: org.skills.filter((s) => agent.skills.includes(s.id)), runs, stats: stats.find((s) => s.agentId === id) ?? null, events, failures, current: runs.find((r) => r.outcome === null) ?? null }, { headers: { 'Cache-Control': 'no-store' } });
});
