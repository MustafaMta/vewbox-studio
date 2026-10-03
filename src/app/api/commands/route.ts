import { z } from 'zod';
import { StudioError } from '@/domain/errors';
import { isCommandName, isSystemCommand, systemCommandMessage, validateClientCommand, type Command } from '@/domain/commands';
import { applyCommands } from '@/server/studio/engine';
import { json, readJson, route } from '@/server/http';
import { log } from '@/server/log';
import { settleDialogueReviews } from '@/server/jobs/reviews';

export const dynamic = 'force-dynamic';

const Body = z.object({
  clientId: z.string().min(1).max(64),
  commands: z.array(z.object({ name: z.string(), args: z.array(z.unknown()), seed: z.string().min(4).max(80), at: z.string().datetime() })).min(1).max(200),
});

/** The one-release rollback of the command boundary: a server started with STUDIO_LEGACY_COMMANDS=1 accepts system
 *  commands from pages again (logged). Read per call. */
const legacyCommands = () => process.env.STUDIO_LEGACY_COMMANDS === '1';

/** The browser's edits arrive here as a batch of named commands. All or nothing; the answer carries the new version
 *  and a hash of the authoritative state so the browser can tell whether its optimistic copy matches.
 *  THE COMMAND BOUNDARY (docs/BACKEND-AUDIT-2026-10.md H1): only CLIENT commands are accepted — a SYSTEM command
 *  (addAsset, setCut, recordExport, setVoiceIdentity, setCanonicalImage…: the worker's results) is refused with 403
 *  FORBIDDEN — and every argument list is validated against CLIENT_ARG_SCHEMAS (src/domain/commands.ts): malformed
 *  arguments are a 400 with the field named, before any reducer runs — never a 500. */
export const POST = route(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new StudioError('INVALID', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  const legacy = legacyCommands();
  const commands: Command[] = [];
  for (const [i, c] of parsed.data.commands.entries()) {
    if (!isCommandName(c.name)) throw new StudioError('INVALID', `Unknown command ${c.name}`, { failedAt: i });
    if (isSystemCommand(c.name)) {
      if (!legacy) {
        log.warn({ command: c.name, clientId: parsed.data.clientId }, 'system command refused at the boundary');
        return json({ error: { code: 'FORBIDDEN', message: systemCommandMessage(c.name), details: { command: c.name, failedAt: i } } }, { status: 403 });
      }
      log.warn({ command: c.name, clientId: parsed.data.clientId }, 'system command accepted from a page (STUDIO_LEGACY_COMMANDS=1)');
    }
    try { validateClientCommand(c.name, c.args, { allowSystem: legacy }); } catch (e) { if (e instanceof StudioError) throw new StudioError(e.code, e.message, { ...e.details, failedAt: i }); throw e; }
    commands.push(c as unknown as Command);
  }
  const result = await applyCommands(commands, parsed.data.clientId);
  // kept recordings may settle a DIALOGUE_AUDIO review (src/server/jobs/reviews.ts); the batch is committed either way
  const kept = commands.filter((c) => c.name === 'keepLineRecordings').map((c) => String((c.args as unknown[])[0]));
  if (result.ok && kept.length) await settleDialogueReviews([...new Set(kept)]).catch((e) => log.error({ err: (e as Error).message }, 'settling dialogue reviews failed'));
  return json(result, { status: result.ok ? 200 : 409 });
});
