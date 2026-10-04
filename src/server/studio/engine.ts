import { eq, sql as dsql } from 'drizzle-orm';
import type { StudioState } from '@/domain/types';
import { type Command, type CommandName, type CommandResult, isCommandName, runCommand } from '@/domain/commands';
import { hashState } from '@/domain/hash';
import { StudioError } from '@/domain/errors';
import { db, schema, sql } from '../db/client';
import { loadSnapshot } from './snapshot';
import { persistState } from './persist';
import { log } from '../log';
import { assertLeaseHeld } from '../jobs/fence';
import { jobScope } from '../jobs/context';
import { derivedBatchId, findReplay, recordBatch } from './journal';

/** THE COMMAND ENGINE — apply a batch of commands to the authoritative state under one lock, in one transaction,
 *  and tell every listener the studio changed. The browser runs the same commands optimistically; the hash it gets
 *  back tells it whether its copy still matches. */

export type BatchResult = ({ ok: true; version: number; hash: string; results: unknown[] } | { ok: false; version: number; hash: string; results: unknown[]; failedAt: number; error: { code: string; message: string; details?: Record<string, unknown> } }) & { /** the batch was applied before: this is the stored result (step 9) */ replayed?: boolean };

const LOCK_KEY = 'vewbox-studio';

export type Tx = Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0];

/** `also`: rows outside the studio document that belong to the same result (a take's QA reports, its World Bible
 *  read), written in the SAME transaction after the commands persisted — all of it commits, or none (audit C2). It
 *  runs only when every command was accepted.
 *  `batchId` (with the sender, `origin`): the batch's identity in the command journal — the same batch sent again
 *  returns its stored result (audit H10, step 9); derived from the commands' seeds when not given. */
export interface ApplyOptions { also?: (tx: Tx, results: unknown[]) => Promise<void>; batchId?: string }

/** Run commands as one unit: all or nothing. */
export async function applyCommands(commands: Command[], origin = 'server', opts: ApplyOptions = {}): Promise<BatchResult> {
  for (const c of commands) if (!isCommandName(c.name)) throw new StudioError('INVALID', `Unknown command ${String(c.name)}`);
  const t0 = Date.now();
  const batchId = opts.batchId ?? derivedBatchId(commands);
  const jobId = jobScope()?.jobId || undefined;
  const out = await db().transaction(async (tx) => {
    await tx.execute(dsql`select pg_advisory_xact_lock(hashtext(${LOCK_KEY}))`);
    // a worker's commands are fenced on its lease, in this transaction (src/server/jobs/fence.ts, audit C1)
    await assertLeaseHeld(tx, `commands ${commands.map((c) => c.name).join(', ')}`);
    // THE JOURNAL (step 9): a batch this sender already got accepted is answered from the log, not applied again
    const earlier = await findReplay(tx, origin, batchId);
    if (earlier) {
      const same = earlier.commands.length === commands.length && earlier.commands.every((c, i) => c.name === commands[i].name && c.seed === commands[i].seed);
      if (!same) throw new StudioError('CONFLICT', `Batch ${batchId} was already applied with other commands; a new batch needs a new id.`, { batchId });
      log.info({ origin, batchId, commands: commands.map((c) => c.name) }, 'batch already applied: answered from the command journal');
      return { ...(earlier.result as BatchResult), replayed: true as const, changed: false, report: { inserted: 0, updated: 0, deleted: 0 } };
    }
    const snap = await loadSnapshot(tx);
    let state: StudioState = snap.state;
    const results: unknown[] = [];
    for (let i = 0; i < commands.length; i++) {
      try {
        const r = runCommand(state, commands[i]);
        state = r.state; results.push(r.result ?? null);
      } catch (e) {
        if (e instanceof StudioError) {
          log.warn({ command: commands[i].name, code: e.code, msg: e.message }, 'command refused');
          const refused = { ok: false as const, version: snap.version, hash: hashState(snap.state), results, failedAt: i, error: { code: e.code, message: e.message, details: e.details } };
          await recordBatch(tx, { clientId: origin, batchId, origin, jobId, commands, result: refused });
          return refused;
        }
        throw e;
      }
    }
    // what this batch removes is tombstoned with the batch's name on it (step 10)
    const report = await persistState(tx, snap.hashes, state, { deletedBy: `${origin}: ${Array.from(new Set(commands.map((c) => c.name))).join(', ')}` });
    if (opts.also) await opts.also(tx, results);
    const changed = report.inserted + report.updated + report.deleted > 0;
    let version = snap.version;
    if (changed) {
      const now = new Date().toISOString();
      const rows = await tx.insert(schema.studioMeta).values({ id: 'studio', version: 1, updatedAt: now }).onConflictDoUpdate({ target: schema.studioMeta.id, set: { version: dsql`${schema.studioMeta.version} + 1`, updatedAt: now } }).returning({ version: schema.studioMeta.version });
      version = rows[0].version;
    }
    const accepted = { ok: true as const, version, hash: hashState(state), results };
    await recordBatch(tx, { clientId: origin, batchId, origin, jobId, commands, result: accepted });
    return { ...accepted, changed, report };
  });
  if (out.ok && out.changed) {
    log.debug({ ms: Date.now() - t0, commands: commands.map((c) => c.name), ...out.report }, 'commands applied');
    await notifyChange(out.version, origin);
  }
  if (!out.ok) return out;
  const { changed: _c, report: _r, ...rest } = out as typeof out & { changed?: boolean; report?: unknown }; void _c; void _r;
  return rest;
}
/** Convenience for server code and workers: one command, its result, or a thrown StudioError. */
export async function command<K extends CommandName>(name: K, args: Command<K>['args'], origin = 'server'): Promise<CommandResult<K>> {
  const cmd: Command<K> = { name, args, seed: `${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, at: new Date().toISOString() };
  const r = await applyCommands([cmd as Command], origin);
  if (!r.ok) throw new StudioError(r.error.code as StudioError['code'], r.error.message, r.error.details);
  return r.results[0] as CommandResult<K>;
}

/** Several commands as one unit (a record and what belongs to it — an asset, its sample, the identity it proves):
 *  all applied under one lock and one transaction, or none. Throws the refusing command's StudioError. */
export type CommandSpec = { [K in CommandName]: { name: K; args: Command<K>['args'] } }[CommandName];

/** The command list as `commands()` will run it: seeds `${seed}-${index}` and one clock, so a caller can dry-run
 *  one of them with `runCommand` on a snapshot and learn the ids the real batch will mint. */
export function stampCommands(list: CommandSpec[], opts: { seed?: string; at?: string } = {}): Command[] {
  const seed = opts.seed ?? `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const at = opts.at ?? new Date().toISOString();
  return list.map((c, i) => ({ name: c.name, args: c.args, seed: `${seed}-${i}`, at }) as Command);
}

export async function commands(list: CommandSpec[], origin = 'server', opts: { seed?: string; at?: string } & ApplyOptions = {}): Promise<unknown[]> {
  const cmds = stampCommands(list, opts);
  const r = await applyCommands(cmds, origin, { also: opts.also });
  if (!r.ok) throw new StudioError(r.error.code as StudioError['code'], r.error.message, { ...r.error.details, failedAt: r.failedAt, command: cmds[r.failedAt]?.name });
  return r.results;
}

/** The current state, for readers that do not change anything. */
export async function readState(): Promise<{ state: StudioState; version: number; hash: string }> {
  const snap = await loadSnapshot();
  return { state: snap.state, version: snap.version, hash: hashState(snap.state) };
}

export async function currentVersion(): Promise<number> {
  const rows = await db().select({ version: schema.studioMeta.version }).from(schema.studioMeta).where(eq(schema.studioMeta.id, 'studio'));
  return rows[0]?.version ?? 0;
}

/** Postgres NOTIFY carries the change to every web process (the SSE route listens). */
export async function notifyChange(version: number, origin: string) {
  await sql().notify('vewbox_studio', JSON.stringify({ type: 'studio', version, origin, at: new Date().toISOString() }));
}

export async function notifyJobs(jobId: string, status: string) {
  await sql().notify('vewbox_jobs', JSON.stringify({ type: 'job', jobId, status, at: new Date().toISOString() }));
}
