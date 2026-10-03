import { StudioError } from '@/domain/errors';
import { json, route } from '@/server/http';
import { getResearchItems, getResearchRun } from '@/server/research';

export const dynamic = 'force-dynamic';

/** One research run: its topics, the coverage of every platform, the limitations, and the items it rests on (URLs,
 *  dates and only the metrics the sources returned). */
export const GET = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const run = await getResearchRun(id);
  if (!run) throw new StudioError('NOT_FOUND', 'Research run not found.');
  const items = await getResearchItems(run.itemIds);
  return json({ run, items }, { headers: { 'Cache-Control': 'no-store' } });
});
