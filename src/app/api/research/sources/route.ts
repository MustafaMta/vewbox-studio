import { json, route } from '@/server/http';
import { readState } from '@/server/studio/engine';
import { researchSources } from '@/server/research';

export const dynamic = 'force-dynamic';

/** What each research platform's access path is right now, in the producer's priority order (TikTok, Instagram,
 *  Facebook, YouTube, then news and Wikipedia), with Settings' switches applied: READY, NOT_CONFIGURED (the variable
 *  names it needs), UNSUPPORTED (why), DISABLED. Never a credential. */
export const GET = route(async () => {
  const { state } = await readState();
  const settings = state.settings.research;
  return json({ enabled: settings?.enabled !== false, cacheHours: settings?.cacheHours ?? null, sources: researchSources(settings) }, { headers: { 'Cache-Control': 'no-store' } });
});
