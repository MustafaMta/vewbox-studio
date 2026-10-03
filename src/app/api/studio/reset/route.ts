import { z } from 'zod';
import { StudioError } from '@/domain/errors';
import { replaceStudio, sampleFixtureAllowed } from '@/server/studio/seed';
import { notifyJobs, readState } from '@/server/studio/engine';
import { clearJobs } from '@/server/jobs/queue';
import { libraryRoot, removeFile } from '@/server/media';
import { isTestLibrary, resetAllowed } from '@/server/test-guard';
import { json, readJson, route } from '@/server/http';
import { log } from '@/server/log';

export const dynamic = 'force-dynamic';

const Body = z.object({ kind: z.enum(['sample', 'empty']), keepSettings: z.boolean().optional() });

/** THE TEST SUITES' RESET (docs/BACKEND-AUDIT-2026-10.md C3). Replaces the whole studio — `kind: 'sample'` loads the
 *  sample fixture, `kind: 'empty'` empties it — and clears the job history. Destructive, so it is a test operation:
 *  - refused (403 FORBIDDEN) unless the server runs with VEWBOX_ALLOW_RESET=1 on a database that is not the live
 *    `vewbox` (src/server/test-guard.ts) — the producer's studio can never be reset through this route;
 *  - `kind: 'sample'` additionally needs STUDIO_SAMPLE_FIXTURE=1 (424 NOT_CONFIGURED otherwise);
 *  - library files of the removed (non-sample) assets are deleted only when LIBRARY_ROOT is a marked test library
 *    (`.vewbox-test-library`); otherwise they are left on disk.
 *  Settings (defaults) survive unless `keepSettings: false` is sent (test suites start from the defaults). */
export const POST = route(async (req) => {
  const allowed = resetAllowed();
  if (!allowed.ok) {
    log.warn({ reason: allowed.reason }, 'studio reset refused');
    return json({ error: { code: 'FORBIDDEN', message: allowed.reason } }, { status: 403 });
  }
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new StudioError('INVALID', 'kind must be sample or empty');
  if (parsed.data.kind === 'sample' && !sampleFixtureAllowed()) throw new StudioError('NOT_CONFIGURED', 'The sample studio is a test fixture: it is loaded only on a server started with STUDIO_SAMPLE_FIXTURE=1.');
  const before = await readState();
  const jobs = await clearJobs();
  const out = await replaceStudio(parsed.data.kind, parsed.data.keepSettings ?? true);
  const root = libraryRoot();
  const deleteFiles = isTestLibrary(root);
  let filesRemoved = 0;
  if (deleteFiles) {
    for (const a of before.state.assets) {
      const rel = a.provenance?.path as string | undefined;
      if (!a.sample && rel) { await removeFile(rel); filesRemoved++; }
    }
  } else log.info({ database: allowed.database }, 'studio reset: library files kept (LIBRARY_ROOT is not a marked test library)');
  await notifyJobs('*', 'CLEARED');
  return json({ version: out.version, hash: out.hash, jobsRemoved: jobs.removed, filesRemoved });
});
