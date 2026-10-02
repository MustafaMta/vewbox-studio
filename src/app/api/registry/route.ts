import { json, route } from '@/server/http';
import { readRegistry, syncRegistry } from '@/server/registry';

export const dynamic = 'force-dynamic';

/** Models and workflow versions the studio knows, refreshed against the engines on every read. */
export const GET = route(async () => {
  const synced = await syncRegistry().catch((e) => ({ error: (e as Error).message }));
  const reg = await readRegistry();
  return json({ ...reg, synced }, { headers: { 'Cache-Control': 'no-store' } });
});
