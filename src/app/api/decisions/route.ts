import { json, route } from '@/server/http';
import { bootstrap } from '@/server/bootstrap';
import { decisionsNow } from '@/server/studio/decisions';

export const dynamic = 'force-dynamic';

/** What waits for the producer (docs/CONTRACTS-REDESIGN-BACKEND.md B8): `{ items, count, complete, at }`, the same
 *  selector the shell runs on its own copy. */
export const GET = route(async () => {
  await bootstrap();
  return json(await decisionsNow(), { headers: { 'Cache-Control': 'no-store' } });
});
