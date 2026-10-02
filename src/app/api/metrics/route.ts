import { json, route } from '@/server/http';
import { jobOutcomes, metricsSummary } from '@/server/registry';
import { queueStats } from '@/server/jobs/queue';

export const dynamic = 'force-dynamic';

/** Reliability and performance: job outcomes per type and timing metrics over a window (`?hours=24`). */
export const GET = route(async (req) => {
  const hours = Math.min(24 * 30, Math.max(1, Number(new URL(req.url).searchParams.get('hours') ?? 24) || 24));
  const [jobs, metrics, queue] = await Promise.all([jobOutcomes(hours), metricsSummary(hours), queueStats()]);
  return json({ hours, queue, jobs, metrics }, { headers: { 'Cache-Control': 'no-store' } });
});
