import { json, route } from '@/server/http';
import { bootstrap } from '@/server/bootstrap';
import { readOrg } from '@/server/org/registry';
import { agentStats, listStudioEvents } from '@/server/org/runs';
import { PIPELINE } from '@/server/org/model';
import { queueStats } from '@/server/jobs/queue';

export const dynamic = 'force-dynamic';

/** The studio as an organisation: departments, agents, tools and skills as persisted, each agent's real run
 *  statistics, the pipeline graph, the queue, and the latest activity. Everything comes from the database. */
export const GET = route(async (req) => {
  await bootstrap();
  const sp = new URL(req.url).searchParams;
  const hours = Math.min(24 * 365, Math.max(1, Number(sp.get('hours') ?? 24 * 30) || 24 * 30));
  const [org, stats, events, queue] = await Promise.all([readOrg(), agentStats(hours), listStudioEvents({ limit: Number(sp.get('events') ?? 60) || 60 }), queueStats()]);
  return json({ ...org, pipeline: PIPELINE, stats, events, queue, hours }, { headers: { 'Cache-Control': 'no-store' } });
});
