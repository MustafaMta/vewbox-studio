import { StudioError } from '@/domain/errors';
import { json, readJson, route } from '@/server/http';
import { bootstrap } from '@/server/bootstrap';
import { assertTermsAccepted } from '@/server/terms';
import { RegenerateInput, regenerate } from '@/server/jobs/regenerate';

export const dynamic = 'force-dynamic';

/** TARGETED REGENERATION (step 14): POST { shotId } — a new take of that one shot; { shotId, lineId } — that one
 *  dialogue line recorded again. Optional: select (the new take becomes the choice when it passes), prompt, seed,
 *  idempotencyKey. Nothing else of the production is queued or touched. Answer: { job, created, scope: 'shot'|'line' }
 *  (201 when a job was queued, 200 when the key named an existing one). src/server/jobs/regenerate.ts. */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  await bootstrap();
  const { id } = await ctx.params;
  const parsed = RegenerateInput.safeParse(await readJson(req));
  if (!parsed.success) throw new StudioError('INVALID', parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  // a regeneration is a GENERATE_TAKE or a DIALOGUE_AUDIO: both wait for the terms of use (src/server/terms.ts)
  await assertTermsAccepted('GENERATE_TAKE');
  const r = await regenerate(id.slice(0, 80), parsed.data);
  return json(r, { status: r.created ? 201 : 200 });
});
