import { json, params, route } from '@/server/http';
import { bootstrap } from '@/server/bootstrap';
import { resolveNote } from '@/server/studio/notes';

export const dynamic = 'force-dynamic';

/** POST { resolved?: boolean } (default true) → { note }. */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  await bootstrap();
  const { id } = await params(ctx);
  const body = await req.json().catch(() => ({})) as { resolved?: unknown };
  return json({ note: await resolveNote(id, body.resolved !== false) });
});
