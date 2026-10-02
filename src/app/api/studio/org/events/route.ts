import { json, route } from '@/server/http';
import { bootstrap } from '@/server/bootstrap';
import { listStudioEvents } from '@/server/org/runs';

export const dynamic = 'force-dynamic';

/** The activity feed, filtered: `?department=SOUND`, `?agent=music-director`, `?production=…`, `?since=<iso>`, `?limit=`. */
export const GET = route(async (req) => {
  await bootstrap();
  const sp = new URL(req.url).searchParams;
  const events = await listStudioEvents({ departmentId: sp.get('department') ?? undefined, agentId: sp.get('agent') ?? undefined, productionId: sp.get('production') ?? undefined, since: sp.get('since') ?? undefined, limit: Number(sp.get('limit') ?? 100) || 100 });
  return json({ events }, { headers: { 'Cache-Control': 'no-store' } });
});
