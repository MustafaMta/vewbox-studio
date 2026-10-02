import { z } from 'zod';
import { JOB_TYPES, isTerminalStatus, type JobType } from '@/domain/jobs';
import { StudioError } from '@/domain/errors';
import { enqueue, listJobs } from '@/server/jobs/queue';
import { readState } from '@/server/studio/engine';
import { preflightCharacter } from '@/server/org/preflight';
import { json, readJson, route } from '@/server/http';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  const u = new URL(req.url);
  const jobs = await listJobs({ productionId: u.searchParams.get('productionId') ?? undefined, activeOnly: u.searchParams.get('active') === '1', limit: Number(u.searchParams.get('limit') ?? 200), since: u.searchParams.get('since') ?? undefined });
  return json({ jobs }, { headers: { 'Cache-Control': 'no-store' } });
});

const Body = z.object({ type: z.enum(JOB_TYPES), payload: z.unknown(), idempotencyKey: z.string().max(200).optional(), priority: z.number().int().min(-10).max(10).optional() });

/** CHARACTER JOBS are checked before they are queued: the character must exist, a reference it would draw from
 *  must be usable (MISSING_REFERENCE otherwise, as a 400 the page can act on), and a voice build carries the key
 *  `VOICE_BUILD:${characterId}:${revision}` so a double submission is one job. A second request for a character
 *  with a build or a drawing already running gets that job back (created: false). */
async function prepareCharacterJob(type: JobType, payload: unknown, key: string | undefined): Promise<string | undefined> {
  if (!(type === 'VOICE_BUILD' || type === 'CHARACTER_APPEARANCE' || type === 'CHARACTER_REFS')) return key;
  const characterId = (payload as { characterId?: unknown } | null)?.characterId;
  if (typeof characterId !== 'string') return key;
  const { state } = await readState();
  const c = state.characters.find((x) => x.id === characterId);
  if (!c) throw new StudioError('NOT_FOUND', 'Character not found.');
  const pre = preflightCharacter(state, c, type, payload as Record<string, unknown>);
  if (!pre.ok) {
    const failed = pre.checks.filter((x) => !x.ok);
    throw new StudioError('INVALID', failed.map((x) => x.detail ?? x.name).join('; '), { failureClass: failed[0].failureClass, checks: pre.checks });
  }
  if (type === 'VOICE_BUILD' && !key) return `VOICE_BUILD:${characterId}:${c.voice.identity?.revision ?? 0}`;
  return key;
}

/** Start a production job. The response is the queued job; progress arrives on the event stream. */
export const POST = route(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new StudioError('INVALID', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  const key = await prepareCharacterJob(parsed.data.type, parsed.data.payload, parsed.data.idempotencyKey);
  let r = await enqueue({ type: parsed.data.type, payload: parsed.data.payload, idempotencyKey: key, priority: parsed.data.priority });
  // the derived voice key met an earlier, finished build of the same revision (it failed, or was cancelled): that is
  // a new request, not a duplicate — queue it under a fresh key rather than hand back the old job
  if (!r.created && key && !parsed.data.idempotencyKey && isTerminalStatus(r.job.status)) r = await enqueue({ type: parsed.data.type, payload: parsed.data.payload, idempotencyKey: `${key}:${Date.now().toString(36)}`, priority: parsed.data.priority });
  return json({ job: r.job, created: r.created }, { status: r.created ? 201 : 200 });
});
