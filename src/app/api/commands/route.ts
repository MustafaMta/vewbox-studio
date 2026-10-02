import { z } from 'zod';
import { StudioError } from '@/domain/errors';
import { isCommandName, validateCommandArgs, type Command } from '@/domain/commands';
import { applyCommands } from '@/server/studio/engine';
import { json, readJson, route } from '@/server/http';

export const dynamic = 'force-dynamic';

const Body = z.object({
  clientId: z.string().min(1).max(64),
  commands: z.array(z.object({ name: z.string(), args: z.array(z.unknown()), seed: z.string().min(4).max(80), at: z.string().datetime() })).min(1).max(200),
});

/** The browser's edits arrive here as a batch of named commands. All or nothing; the answer carries the new version
 *  and a hash of the authoritative state so the browser can tell whether its optimistic copy matches. Malformed
 *  arguments (the per-command schemas in src/domain/commands.ts) are a 400 with the field named, before any
 *  reducer runs — never a 500. */
export const POST = route(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new StudioError('INVALID', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  const commands = parsed.data.commands.map((c, i) => {
    if (!isCommandName(c.name)) throw new StudioError('INVALID', `Unknown command ${c.name}`);
    try { validateCommandArgs(c.name, c.args); } catch (e) { if (e instanceof StudioError) throw new StudioError(e.code, e.message, { ...e.details, failedAt: i }); throw e; }
    return c as unknown as Command;
  });
  const result = await applyCommands(commands, parsed.data.clientId);
  return json(result, { status: result.ok ? 200 : 409 });
});
