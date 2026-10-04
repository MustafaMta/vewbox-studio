import { z } from 'zod';
import { StudioError } from '@/domain/errors';
import { json, readJson, route } from '@/server/http';
import { bootstrap } from '@/server/bootstrap';
import { restoreDeleted } from '@/server/studio/tombstones';

export const dynamic = 'force-dynamic';

const Body = z.object({ kind: z.enum(['production', 'scene', 'shot', 'take']), id: z.string().min(1).max(80) });

/** BRING BACK WHAT WAS REMOVED (docs/BACKEND-AUDIT-2026-10.md C4, step 10): `{ kind, id }` — a tombstoned take comes
 *  back to its shot; a shot, scene or production with everything the same removal took (and the parents it needs).
 *  Answers what was restored and any take that could not be (its media was deleted from the library). The studio's
 *  version moves on and every page is told, like any other change. */
export const POST = route(async (req) => {
  await bootstrap();
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new StudioError('INVALID', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return json(await restoreDeleted(parsed.data.kind, parsed.data.id));
});
