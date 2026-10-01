import { z } from 'zod';
import { JOB_TYPES } from '@/domain/jobs';
import { StudioError } from '@/domain/errors';
import { enqueue, listJobs } from '@/server/jobs/queue';
import { json, readJson, route } from '@/server/http';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  const u = new URL(req.url);
  const jobs = await listJobs({ productionId: u.searchParams.get('productionId') ?? undefined, activeOnly: u.searchParams.get('active') === '1', limit: Number(u.searchParams.get('limit') ?? 200), since: u.searchParams.get('since') ?? undefined });
  return json({ jobs }, { headers: { 'Cache-Control': 'no-store' } });
});

const Body = z.object({ type: z.enum(JOB_TYPES), payload: z.unknown(), idempotencyKey: z.string().max(200).optional(), priority: z.number().int().min(-10).max(10).optional() });

/** Start a production job. The response is the queued job; progress arrives on the event stream. */
export const POST = route(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new StudioError('INVALID', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  const r = await enqueue({ type: parsed.data.type, payload: parsed.data.payload, idempotencyKey: parsed.data.idempotencyKey, priority: parsed.data.priority });
  return json({ job: r.job, created: r.created }, { status: r.created ? 201 : 200 });
});
