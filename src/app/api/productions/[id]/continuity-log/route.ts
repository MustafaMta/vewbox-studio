import { json, params, route } from '@/server/http';
import { bootstrap } from '@/server/bootstrap';
import { StudioError } from '@/domain/errors';
import { readState } from '@/server/studio/engine';
import { continuityLog } from '@/domain/continuity-log';

export const dynamic = 'force-dynamic';

/** THE CONTINUITY LOG of a production (src/domain/continuity-log.ts): per shot in cut order, what is established at its
 *  end, what changed against the shot before and whether something explains it, the flags (crossed line, a prop gone
 *  from a hand, light or time changing inside a scene, a continuous shot without an end pose, the chosen take's checks
 *  to review) and which of them the producer accepted. Derived from the stored records on every read; read-only. */
export const GET = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  await bootstrap();
  const { id } = await params(ctx);
  const { state, version } = await readState();
  const p = state.productions.find((x) => x.id === id);
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  return json({ ...continuityLog(state, p), version }, { headers: { 'Cache-Control': 'no-store' } });
});
