import { z } from 'zod';
import { JOB_PAYLOADS, JOB_TYPES, type JobType } from '@/domain/jobs';
import { StudioError } from '@/domain/errors';
import { enqueue, listJobs } from '@/server/jobs/queue';
import { requeueKeyFor, voiceBuildKey } from '@/server/jobs/keys';
import { readState } from '@/server/studio/engine';
import { preflightCharacter, type PreflightWarning } from '@/server/org/preflight';
import { json, readJson, route } from '@/server/http';
import { assertTermsAccepted } from '@/server/terms';

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
async function prepareCharacterJob(type: JobType, payload: unknown, key: string | undefined): Promise<{ key: string | undefined; warnings: PreflightWarning[] }> {
  if (!(type === 'VOICE_BUILD' || type === 'VOICE_DESIGN' || type === 'CHARACTER_APPEARANCE' || type === 'CHARACTER_REFS')) return { key, warnings: [] };
  const characterId = (payload as { characterId?: unknown } | null)?.characterId;
  if (typeof characterId !== 'string') return { key, warnings: [] };
  const { state } = await readState();
  const c = state.characters.find((x) => x.id === characterId);
  if (!c) throw new StudioError('NOT_FOUND', 'Character not found.');
  const pre = preflightCharacter(state, c, type, payload as Record<string, unknown>);
  if (!pre.ok) {
    const failed = pre.checks.filter((x) => !x.ok);
    // a recording without its consent statement is refused as such (contract v2 §1), so the page asks for the consent
    const code = failed.some((x) => x.name === 'reference-recording-consented' || (x.name === 'automatic-voice-source' && x.failureClass === 'INVALID_INPUT')) ? 'CONSENT_REQUIRED' : 'INVALID';
    throw new StudioError(code, failed.map((x) => x.detail ?? x.name).join('; '), { failureClass: failed[0].failureClass, checks: pre.checks });
  }
  if (type === 'VOICE_BUILD' && !key) return { key: voiceBuildKey(characterId, c.voice.identity?.revision ?? 0), warnings: pre.warnings };
  return { key, warnings: pre.warnings };
}

/** Start a production job. The response is the queued job (plus the preflight's warnings for a character job, e.g.
 *  "identity not approved" or "the approved pack returns to draft"); progress arrives on the event stream. */
export const POST = route(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new StudioError('INVALID', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  // a malformed request is said as such first (400 with the field named); then the terms of use (src/server/terms.ts):
  // nothing that generates is queued before they are accepted (403)
  const shape = (JOB_PAYLOADS[parsed.data.type] as z.ZodTypeAny).safeParse(parsed.data.payload);
  if (!shape.success) throw new StudioError('INVALID', `Invalid payload for ${parsed.data.type}: ${shape.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  await assertTermsAccepted(parsed.data.type);
  const { key, warnings } = await prepareCharacterJob(parsed.data.type, parsed.data.payload, parsed.data.idempotencyKey);
  // a submission identical to an active job (double click, two tabs, a resent request) gets that job back
  let r = await enqueue({ type: parsed.data.type, payload: parsed.data.payload, idempotencyKey: key, priority: parsed.data.priority, dedupeActive: true });
  // a voice-build or creation key met an earlier attempt that has ended (it failed, or was cancelled): that is a new
  // request, not a duplicate — queue it under a fresh key rather than hand back the old job, whoever supplied the key
  const fresh = !r.created ? requeueKeyFor(key, r.job) : null;
  if (fresh) r = await enqueue({ type: parsed.data.type, payload: parsed.data.payload, idempotencyKey: fresh, priority: parsed.data.priority });
  return json({ job: r.job, created: r.created, ...(warnings.length ? { warnings } : {}) }, { status: r.created ? 201 : 200 });
});
