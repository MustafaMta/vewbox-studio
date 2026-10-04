import { json, route } from '@/server/http';
import { bootstrap } from '@/server/bootstrap';
import { listDeleted } from '@/server/studio/tombstones';

export const dynamic = 'force-dynamic';

/** WHAT WAS REMOVED, AND CAN COME BACK (docs/BACKEND-AUDIT-2026-10.md C4, step 10): the tombstoned productions,
 *  scenes, shots and takes, newest first — `?productionId=` for one production. Each item: kind, id, productionId, a
 *  label, when and by what it was removed, and how many takes it holds. Restore with POST /api/studio/restore. */
export const GET = route(async (req) => {
  await bootstrap();
  const sp = new URL(req.url).searchParams;
  const productionId = sp.get('productionId')?.slice(0, 80) || undefined;
  const limit = Number(sp.get('limit'));
  return json({ items: await listDeleted({ productionId, limit: Number.isFinite(limit) && limit > 0 ? limit : undefined }) }, { headers: { 'Cache-Control': 'no-store' } });
});
