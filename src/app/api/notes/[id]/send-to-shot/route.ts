import { z } from 'zod';
import { StudioError } from '@/domain/errors';
import { json, params, readJson, route } from '@/server/http';
import { bootstrap } from '@/server/bootstrap';
import { sendNoteToShot } from '@/server/studio/notes';

export const dynamic = 'force-dynamic';

const Body = z.object({ shotId: z.string().min(1).max(80), by: z.string().max(64).optional() });

/** POST { shotId, by? } → { note, shot } — the note's text joins the shot's notes; nothing is generated. */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  await bootstrap();
  const { id } = await params(ctx);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new StudioError('INVALID', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  const r = await sendNoteToShot(id, parsed.data.shotId, { by: parsed.data.by });
  return json({ note: r.note, shot: r.shot });
});
