import { json, params, route } from '@/server/http';
import { bootstrap } from '@/server/bootstrap';
import { StudioError } from '@/domain/errors';
import { readState } from '@/server/studio/engine';
import { preflightTake } from '@/server/org/preflight';
import { chooseBackend } from '@/server/providers/video';

export const dynamic = 'force-dynamic';

/** BEFORE THE NEXT TAKE (cloud directive §11, final directive §20 — first-attempt reliability): the take preflight the
 *  worker runs before it touches the engine, run here on the studio as it stands, so the shot page shows what would
 *  refuse the take (and what it would only warn about) before anyone queues it. Read-only: no World Bible pin is made
 *  (the worker reads the pinned world when it runs and checks again). */
export const GET = route(async (_req, ctx: { params: Promise<{ id: string; shotId: string }> }) => {
  await bootstrap();
  const { id, shotId } = await params(ctx);
  const { state, version } = await readState();
  const p = state.productions.find((x) => x.id === id);
  if (!p) throw new StudioError('NOT_FOUND', 'Production not found');
  const sh = p.shots.find((x) => x.id === shotId);
  if (!sh) throw new StudioError('NOT_FOUND', 'Shot not found');
  let backend: 'local' | 'api';
  try { backend = chooseBackend(); } catch (e) { return json({ ok: false, version, backend: null, checks: [{ name: 'video-engine-configured', ok: false, detail: (e as Error).message, failureClass: 'INFRASTRUCTURE' }], warnings: [] }, { headers: { 'Cache-Control': 'no-store' } }); }
  const pf = preflightTake(state, p, sh, { backend });
  return json({ ...pf, version, backend }, { headers: { 'Cache-Control': 'no-store' } });
});
