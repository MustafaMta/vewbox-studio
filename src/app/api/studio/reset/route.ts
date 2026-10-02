import { z } from 'zod';
import { StudioError } from '@/domain/errors';
import { replaceStudio } from '@/server/studio/seed';
import { readState } from '@/server/studio/engine';
import { removeFile } from '@/server/media';
import { json, readJson, route } from '@/server/http';

export const dynamic = 'force-dynamic';

const Body = z.object({ kind: z.enum(['sample', 'empty']), keepSettings: z.boolean().optional() });

/** Settings → "Reset sample data" / "Start with an empty studio". Library files of non-sample assets are removed.
 *  Settings (language, defaults) survive unless `keepSettings: false` is sent (test suites start from the defaults). */
export const POST = route(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new StudioError('INVALID', 'kind must be sample or empty');
  const before = await readState();
  const out = await replaceStudio(parsed.data.kind, parsed.data.keepSettings ?? true);
  for (const a of before.state.assets) {
    const rel = a.provenance?.path as string | undefined;
    if (!a.sample && rel) await removeFile(rel);
  }
  return json({ version: out.version, hash: out.hash });
});
