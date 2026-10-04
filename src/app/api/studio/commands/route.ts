import { json, route } from '@/server/http';
import { bootstrap } from '@/server/bootstrap';
import { recentCommands } from '@/server/studio/journal';

export const dynamic = 'force-dynamic';

/** THE COMMAND LOG, READ ONLY (the engine room): the newest command-journal entries, newest first — who sent which
 *  commands to which aggregates and how each batch ended; never the arguments or seeds (src/server/studio/journal.ts
 *  `CommandLogView`). `?limit=` 1–200, default 50. Sending commands stays POST /api/commands. */
export const GET = route(async (req) => {
  await bootstrap();
  const n = Number(new URL(req.url).searchParams.get('limit'));
  return json({ entries: await recentCommands(Number.isFinite(n) && n > 0 ? n : 50) }, { headers: { 'Cache-Control': 'no-store' } });
});
