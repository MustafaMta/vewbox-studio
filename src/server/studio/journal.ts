import { and, asc, desc, eq, gt } from 'drizzle-orm';
import type { StudioState } from '@/domain/types';
import { runCommand, type Command } from '@/domain/commands';
import { canonical, hashString } from '@/domain/hash';
import { db, schema } from '../db/client';
import { batchScope } from './scope';

/** THE COMMAND JOURNAL (docs/BACKEND-AUDIT-2026-10.md H10, step 9). Every batch the studio applies is written to
 *  `command_log` in the batch's own transaction: who sent it (the page's client id, or `worker`/`server`), the job it
 *  belongs to, the commands exactly as they ran (name, args, seed, clock), the outcome and the studio version after.
 *  - REPLAY OF A RESENT BATCH: a page whose request failed after the server committed sends the same batch again (same
 *    client id and batch id); the stored result comes back and nothing is applied twice.
 *  - REPLAY OF THE LOG: commands carry their seed and clock, so running the logged batches in order on the state they
 *    started from reproduces the studio (`replayLog`) — an audit of what changed, and how. */

type Tx = Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0];

export interface LoggedResult { ok: boolean; version: number; hash: string; results: unknown[]; failedAt?: number; error?: { code: string; message: string; details?: Record<string, unknown> } }

/** The batch id a sender did not name: derived from its commands' seeds, so the identical batch sent again is the
 *  same batch. */
export const derivedBatchId = (commands: Pick<Command, 'seed'>[]): string => `seeds:${hashString(canonical(commands.map((c) => c.seed)))}`;

/** The stored result of an ACCEPTED batch of this sender with this id, if any (refused batches are re-evaluated). */
export async function findReplay(tx: Tx, clientId: string, batchId: string): Promise<{ result: LoggedResult; commands: Array<{ name: string; seed: string }> } | undefined> {
  const rows = await tx.select({ result: schema.commandLog.result, commands: schema.commandLog.commands }).from(schema.commandLog).where(and(eq(schema.commandLog.clientId, clientId), eq(schema.commandLog.batchId, batchId), eq(schema.commandLog.ok, true))).limit(1);
  return rows[0] ? { result: rows[0].result as unknown as LoggedResult, commands: rows[0].commands } : undefined;
}

export async function recordBatch(tx: Tx, e: { clientId: string; batchId: string; origin: string; jobId?: string; commands: Command[]; result: LoggedResult }): Promise<void> {
  await tx.insert(schema.commandLog).values({ clientId: e.clientId, batchId: e.batchId, origin: e.origin, jobId: e.jobId ?? null, commands: e.commands.map((c) => ({ name: c.name, args: c.args as unknown[], seed: c.seed, at: c.at })), ok: e.result.ok, result: e.result as unknown as Record<string, unknown>, studioVersion: e.result.version, createdAt: new Date().toISOString() });
}

export interface LogEntry { id: number; clientId: string; batchId: string; origin: string; jobId: string | null; commands: Command[]; ok: boolean; studioVersion: number; createdAt: string }

/** The journal after entry `afterId` (oldest first). */
export async function readLog(opts: { afterId?: number; limit?: number } = {}): Promise<LogEntry[]> {
  const rows = await db().select().from(schema.commandLog).where(opts.afterId ? gt(schema.commandLog.id, opts.afterId) : undefined).orderBy(asc(schema.commandLog.id)).limit(Math.min(5000, opts.limit ?? 500));
  return rows.map((r) => ({ id: r.id, clientId: r.clientId, batchId: r.batchId, origin: r.origin, jobId: r.jobId, commands: r.commands as Command[], ok: r.ok, studioVersion: r.studioVersion, createdAt: r.createdAt }));
}

/** Run the accepted batches of a log, in order, on `state` (pure): the studio they produced. A refused batch changed
 *  nothing and is skipped. Throws if a logged command no longer applies (the log and the state do not match). */
export function replayLog(state: StudioState, entries: Array<Pick<LogEntry, 'ok' | 'commands'>>): StudioState {
  let s = state;
  for (const e of entries) {
    if (!e.ok) continue;
    for (const c of e.commands) s = runCommand(s, c).state;
  }
  return s;
}

/** A journal entry as the engine room shows it (GET /api/studio/commands): WHO sent WHAT command to WHICH aggregate and
 *  how it ended — never the arguments (they carry the producer's text, prompts, file paths and provenance) and never
 *  the seeds (with the client and batch ids they would let a caller forge a replay). `sender` is `worker`, `server`,
 *  `seed`, `restore`… or `page:` plus the first six characters of the page's session id. */
export interface CommandLogView {
  id: number; at: string; sender: string; jobId: string | null; ok: boolean; studioVersion: number;
  commands: Array<{ name: string; /** the aggregates it was classified to write: `production:<id>`, `character:<id>`, … (`studio` for a whole-studio command) */ touches: string[] }>;
  /** a refused batch: which command and why */
  refused?: { failedAt: number; code: string; message: string };
  replayed?: boolean;
}

const SYSTEM_SENDERS = new Set(['worker', 'server', 'seed', 'restore', 'bench', 'reset']);
export const senderOf = (origin: string): string => (SYSTEM_SENDERS.has(origin) ? origin : `page:${origin.slice(0, 6)}`);

/** Pure: a command_log row as the engine room sees it. */
export function commandLogView(r: { id: number; origin: string; jobId: string | null; commands: Array<{ name: string; args: unknown[] }>; ok: boolean; result: Record<string, unknown>; studioVersion: number; createdAt: string }): CommandLogView {
  const commands = r.commands.map((c) => {
    const sc = batchScope([{ name: c.name as Command['name'], args: (Array.isArray(c.args) ? c.args : []) as never }]);
    return { name: c.name, touches: sc.full ? ['studio'] : [...sc.locks].map((k) => k.replace(/^studio:/, '')).sort() };
  });
  const err = r.result.error as { code?: string; message?: string } | undefined;
  return { id: r.id, at: r.createdAt, sender: senderOf(r.origin), jobId: r.jobId, ok: r.ok, studioVersion: r.studioVersion, commands, ...(!r.ok ? { refused: { failedAt: Number(r.result.failedAt ?? 0), code: String(err?.code ?? 'UNKNOWN'), message: String(err?.message ?? '').slice(0, 300) } } : {}) };
}

/** The newest `limit` journal entries (1–200, default 50), newest first. */
export async function recentCommands(limit = 50): Promise<CommandLogView[]> {
  const n = Math.min(200, Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 50)));
  const rows = await db().select({ id: schema.commandLog.id, origin: schema.commandLog.origin, jobId: schema.commandLog.jobId, commands: schema.commandLog.commands, ok: schema.commandLog.ok, result: schema.commandLog.result, studioVersion: schema.commandLog.studioVersion, createdAt: schema.commandLog.createdAt }).from(schema.commandLog).orderBy(desc(schema.commandLog.id)).limit(n);
  return rows.map(commandLogView);
}