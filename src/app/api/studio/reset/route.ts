import { z } from 'zod';
import { StudioError } from '@/domain/errors';
import { replaceStudio, sampleFixtureAllowed } from '@/server/studio/seed';
import { notifyJobs, readState } from '@/server/studio/engine';
import { clearJobs } from '@/server/jobs/queue';
import { removeFile } from '@/server/media';
import { json, readJson, route } from '@/server/http';

export const dynamic = 'force-dynamic';

const Body = z.object({ kind: z.enum(['sample', 'empty']), keepSettings: z.boolean().optional() });

/** Settings → "Start with an empty studio" (`kind: 'empty'`), and the test suites' reset to the sample studio
 *  (`kind: 'sample'`), which is a test fixture: refused unless this server runs with STUDIO_SAMPLE_FIXTURE=1
 *  (playwright.config.ts starts its server that way). Library files of non-sample assets are removed. Settings
 *  (language, defaults) survive unless `keepSettings: false` is sent (test suites start from the defaults). */
export const POST = route(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new StudioError('INVALID', 'kind must be sample or empty');
  if (parsed.data.kind === 'sample' && !sampleFixtureAllowed()) throw new StudioError('NOT_CONFIGURED', 'The sample studio is a test fixture: it is loaded only on a server started with STUDIO_SAMPLE_FIXTURE=1.');
  const before = await readState();
  const jobs = await clearJobs();
  const out = await replaceStudio(parsed.data.kind, parsed.data.keepSettings ?? true);
  for (const a of before.state.assets) {
    const rel = a.provenance?.path as string | undefined;
    if (!a.sample && rel) await removeFile(rel);
  }
  await notifyJobs('*', 'CLEARED');
  return json({ version: out.version, hash: out.hash, jobsRemoved: jobs.removed });
});
