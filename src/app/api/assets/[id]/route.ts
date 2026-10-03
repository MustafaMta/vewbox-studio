import { StudioError } from '@/domain/errors';
import { command, readState } from '@/server/studio/engine';
import { assertSafeId, removeFile, removeThumb } from '@/server/media';
import { json, route } from '@/server/http';

export const dynamic = 'force-dynamic';

/** Remove an asset and every use of it (and the display-size thumbnail derived beside it, B7). Refused (423) for a
 *  picture a used character's appearance rests on. */
export const DELETE = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  assertSafeId(id);
  const { state } = await readState();
  const a = state.assets.find((x) => x.id === id);
  if (!a) throw new StudioError('NOT_FOUND', 'Asset not found.');
  await command('deleteAsset', [id], 'delete');
  const rel = a.provenance?.path as string | undefined;
  if (!a.sample && rel) { await removeFile(rel); if (a.thumb) await removeThumb(rel); }
  return json({ ok: true });
});
