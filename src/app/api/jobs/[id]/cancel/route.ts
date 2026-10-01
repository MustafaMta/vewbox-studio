import { requestCancel } from '@/server/jobs/queue';
import { json, route } from '@/server/http';

export const dynamic = 'force-dynamic';

export const POST = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return json({ job: await requestCancel(id) });
});
