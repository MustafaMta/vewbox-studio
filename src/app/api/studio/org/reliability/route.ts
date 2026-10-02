import { json, route } from '@/server/http';
import { bootstrap } from '@/server/bootstrap';
import { reliabilitySummary } from '@/server/org/runs';

export const dynamic = 'force-dynamic';

/** The reliability dashboard (`?hours=168`): first-attempt success, retry rate, failure classes, cost and latency per
 *  accepted shot, QA rejections, export success, open reliability events. */
export const GET = route(async (req) => {
  await bootstrap();
  const hours = Math.min(24 * 365, Math.max(1, Number(new URL(req.url).searchParams.get('hours') ?? 24 * 7) || 24 * 7));
  return json(await reliabilitySummary(hours), { headers: { 'Cache-Control': 'no-store' } });
});
