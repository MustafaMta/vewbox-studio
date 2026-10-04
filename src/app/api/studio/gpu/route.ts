import { json, route } from '@/server/http';
import { bootstrap } from '@/server/bootstrap';
import { gpuStatus } from '@/server/gpu/status';

export const dynamic = 'force-dynamic';

/** THE GPU QUEUE, READ ONLY (the engine room): who holds the card and who waits for it, in admission order, what was
 *  loaded last, and the last engine unloads — src/server/gpu/status.ts `GpuStatus`. `?unloads=` (1–100, default 20). */
export const GET = route(async (req) => {
  await bootstrap();
  const n = Number(new URL(req.url).searchParams.get('unloads'));
  return json(await gpuStatus({ unloads: Number.isFinite(n) && n > 0 ? n : undefined }), { headers: { 'Cache-Control': 'no-store' } });
});
