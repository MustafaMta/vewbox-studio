import { StudioError } from '@/domain/errors';
import { getJob, listEvents } from '@/server/jobs/queue';
import { json, route } from '@/server/http';

export const dynamic = 'force-dynamic';

export const GET = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) throw new StudioError('NOT_FOUND', 'Job not found.');
  const events = await listEvents(id);
  return json({ job, events }, { headers: { 'Cache-Control': 'no-store' } });
});
