import { json, route } from '@/server/http';
import { readRegistry, syncRegistry } from '@/server/registry';

export const dynamic = 'force-dynamic';

/** Models and workflow versions the studio knows, as the last sync recorded them. A read never writes: the worker
 *  syncs on boot (audit H6: a sync on every read cost ~47 upserts and an engine round trip per Settings visit). */
export const GET = route(async () => json(await readRegistry(), { headers: { 'Cache-Control': 'no-store' } }));

/** "Check again" (Settings → Models, scripts/check-comfy-nodes.mjs): ask the engines now, write what they report,
 *  and answer with the registry as written. */
export const POST = route(async () => {
  const synced = await syncRegistry().catch((e) => ({ error: (e as Error).message }));
  return json({ ...(await readRegistry()), synced }, { headers: { 'Cache-Control': 'no-store' } });
});
