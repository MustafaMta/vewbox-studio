import { eq, sql as dsql } from 'drizzle-orm';
import type { StudioState } from '@/domain/types';
import { type Command, type CommandName, type CommandResult, isCommandName, runCommand } from '@/domain/commands';
import { hashState } from '@/domain/hash';
import { StudioError } from '@/domain/errors';
import { db, schema, sql } from '../db/client';
import { loadSnapshot, versionOf, type AggregateKind, type AggregateVersions } from './snapshot';
import { persistState } from './persist';
import { log } from '../log';
import { assertLeaseHeld } from '../jobs/fence';
import { jobScope } from '../jobs/context';
import { derivedBatchId, findReplay, recordBatch } from './journal';
import { batchScope, isScopeMiss, mergeScoped, widen, type Scope } from './scope';
import { isScopedConflict, loadScoped, saveScoped } from './store';
import { hashStateCached, readModelAt, remember, type ReadModel } from './readmodel';

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
export interface ApplyOptions {
  also?: (tx: Tx, results: unknown[]) => Promise<void>; batchId?: string;
  /** false: the caller does not read the answer's hash (workers) — a scoped batch then never reads the whole studio to
   *  compute it */
  hash?: boolean;
  /** COMPARE-AND-SET (docs/BACKEND-AUDIT-2026-10.md H3, step 11): the aggregate versions the sender read. When one
   *  moved since (someone else changed that production, show, character or location), nothing is applied and the
   *  batch throws CONFLICT with reason STALE_VERSION — the sender re-reads and re-decides (intent commands make that
   *  safe). */
  expect?: ExpectedVersion[];
}
export interface ExpectedVersion { kind: AggregateKind; id: string; version: number }

/** Which saver runs (docs/BACKEND-AUDIT-2026-10.md step 13): `v2` (the default) loads and saves only what a batch's
 *  scope names, under per-aggregate locks with compare-and-set on versions; `v1` — the rollback, STUDIO_STORE=v1 — loads
 *  and diffs the whole studio under one exclusive lock for every batch, as before. Read per call. */
export const storeMode = (): 'v1' | 'v2' => (process.env.STUDIO_STORE === 'v1' ? 'v1' : 'v2');

/** Run commands as one unit: all or nothing. */
export async function applyCommands(commands: Command[], origin = 'server', opts: ApplyOptions = {}): Promise<BatchResult> {
  for (const c of commands) if (!isCommandName(c.name)) throw new StudioError('INVALID', `Unknown command ${String(c.name)}`);
  const batchId = opts.batchId ?? derivedBatchId(commands);
  if (storeMode() === 'v2') {
    const scope = batchScope(commands, opts.expect ?? []);
    if (!scope.full) {
      const r = await applyScoped(commands, origin, opts, batchId, scope);
      if (r !== WHOLE) return r;
    }
  }
  return applyWhole(commands, origin, opts, batchId);
}

const WHOLE = Symbol('run the batch on the whole studio');
/** A scoped run refused the batch: the refusal is confirmed on the whole studio (its error is the authoritative one). */
class RefusedOnScope extends Error { constructor() { super('refused on its scope'); this.name = 'RefusedOnScope'; } }
const pgCode = (e: unknown): string | undefined => (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
/** deadlock_detected, serialization_failure: the batch is run again */
const transient = (e: unknown) => isScopedConflict(e) || pgCode(e) === '40P01' || pgCode(e) === '40001';
const SCOPED_ATTEMPTS = 3;

/** THE SCOPED RUN (step 13b): the global lock SHARED (only a whole-studio batch, a reset or a restore takes it
 *  exclusively), the batch's aggregates locked, only its scope loaded, the same reducers, only its changes saved with
 *  compare-and-set. A reducer that reaches outside the scope widens it and runs again; a conflicting writer runs it
 *  again on fresh rows (three times, then on the whole studio); a refusal is confirmed on the whole studio. */
async function applyScoped(commands: Command[], origin: string, opts: ApplyOptions, batchId: string, scope: Scope): Promise<BatchResult | typeof WHOLE> {
  const t0 = Date.now();
  const jobId = jobScope()?.jobId || undefined;
  const deletedBy = `${origin}: ${Array.from(new Set(commands.map((c) => c.name))).join(', ')}`;
  for (let attempt = 1; attempt <= SCOPED_ATTEMPTS; attempt++) {
    try {
      const out = await db().transaction(async (tx) => {
        await tx.execute(dsql`select pg_advisory_xact_lock_shared(hashtext(${LOCK_KEY}))`);
        for (const key of [...scope.locks].sort()) await tx.execute(dsql`select pg_advisory_xact_lock(hashtext(${key}))`);
        await assertLeaseHeld(tx, `commands ${commands.map((c) => c.name).join(', ')}`);
        const earlier = await findReplay(tx, origin, batchId);
        if (earlier) return { kind: 'replay' as const, earlier };
        let snap = await loadScoped(tx, scope);
        for (const x of opts.expect ?? []) {
          const actual = versionOf(snap.versions, x.kind, x.id);
          if (actual !== x.version) throw new StudioError('CONFLICT', `The ${x.kind} changed since it was read (version ${x.version}, now ${actual ?? 'gone'}); read it again before writing.`, { reason: 'STALE_VERSION', kind: x.kind, id: x.id, expected: x.version, actual: actual ?? null });
        }
        let state: StudioState; let results: unknown[];
        for (let widened = 0; ; widened++) {
          try {
            state = snap.state; results = [];
            for (const c of commands) { const r = runCommand(state, c); state = r.state; results.push(r.result ?? null); }
            break;
          } catch (e) {
            if (isScopeMiss(e) && widened < 8) { log.debug({ commands: commands.map((c) => c.name), collection: e.collection }, 'scope widened'); snap = await loadScoped(tx, widen(snap.scope, e.collection)); continue; }
            if (e instanceof StudioError) throw new RefusedOnScope();
            throw e;
          }
        }
        // a new row whose id is taken elsewhere (the reducer saw only its scope): the whole studio decides
        const report = await saveScoped(tx, snap, state, { deletedBy }).catch((e: unknown) => { if (e instanceof StudioError) throw new RefusedOnScope(); throw e; });
        if (opts.also) await opts.also(tx, results);
        const changed = report.inserted + report.updated + report.deleted > 0;
        // the studio version moves LAST: its row lock is held only from here to the commit
        let version: number;
        if (changed) {
          const now = new Date().toISOString();
          version = (await tx.insert(schema.studioMeta).values({ id: 'studio', version: 1, updatedAt: now }).onConflictDoUpdate({ target: schema.studioMeta.id, set: { version: dsql`${schema.studioMeta.version} + 1`, updatedAt: now } }).returning({ version: schema.studioMeta.version }))[0].version;
        } else version = (await tx.select({ version: schema.studioMeta.version }).from(schema.studioMeta).where(eq(schema.studioMeta.id, 'studio')))[0]?.version ?? 0;
        // the answer's hash is the WHOLE studio's: the read model at the previous version with this batch put in
        const base = readModelAt(changed ? version - 1 : version);
        const merged = base ? (changed ? mergeScoped(base.state, state, snap.loaded) : base.state) : undefined;
        const hash = merged ? (changed ? hashStateCached(merged) : base!.hash) : '';
        const accepted = { ok: true as const, version, hash, results };
        await recordBatch(tx, { clientId: origin, batchId, origin, jobId, commands, result: accepted });
        return { kind: 'applied' as const, accepted, changed, report, merged };
      });
      if (out.kind === 'replay') {
        const { earlier } = out;
        const same = earlier.commands.length === commands.length && earlier.commands.every((c, i) => c.name === commands[i].name && c.seed === commands[i].seed);
        if (!same) throw new StudioError('CONFLICT', `Batch ${batchId} was already applied with other commands; a new batch needs a new id.`, { batchId });
        log.info({ origin, batchId, commands: commands.map((c) => c.name) }, 'batch already applied: answered from the command journal');
        const stored = earlier.result as BatchResult;
        return { ...stored, hash: stored.hash || (opts.hash === false ? '' : (await currentReadModel()).hash), replayed: true };
      }
      let { hash } = out.accepted;
      if (out.merged) remember(out.accepted.version, out.merged, hash);
      else if (opts.hash !== false) hash = (await currentReadModel()).hash;
      if (out.changed) {
        log.debug({ ms: Date.now() - t0, commands: commands.map((c) => c.name), attempt, ...out.report }, 'commands applied (scoped)');
        await notifyChange(out.accepted.version, origin);
      }
      return { ...out.accepted, hash };
    } catch (e) {
      if (e instanceof RefusedOnScope) return WHOLE;
      if (transient(e) && attempt < SCOPED_ATTEMPTS) { log.info({ commands: commands.map((c) => c.name), attempt, why: (e as Error).message }, 'scoped batch conflicted; running it again'); continue; }
      if (transient(e)) { log.warn({ commands: commands.map((c) => c.name), why: (e as Error).message }, 'scoped batch kept conflicting; running it on the whole studio'); return WHOLE; }
      throw e;
    }
  }
  return WHOLE;
}

/** The whole studio as of now, read in ONE consistent snapshot (a repeatable-read, read-only transaction: every table
 *  as of the same instant, the studio version with them), kept as the read model. */
export async function currentReadModel(): Promise<ReadModel> {
  const snap = await db().transaction((tx) => loadSnapshot(tx), { isolationLevel: 'repeatable read', accessMode: 'read only' });
  return remember(snap.version, snap.state, undefined, { fromDatabase: true, versions: snap.versions });
}

/** THE WHOLE-STUDIO RUN — every batch under STUDIO_STORE=v1, and under v2 the batches whose scope is the whole studio
 *  (cascades, proposals), refusals, and scoped batches that kept conflicting. */
async function applyWhole(commands: Command[], origin: string, opts: ApplyOptions, batchId: string): Promise<BatchResult> {
  const t0 = Date.now();
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
      return { ...(earlier.result as BatchResult), replayed: true as const, changed: false, report: { inserted: 0, updated: 0, deleted: 0 }, state: undefined as StudioState | undefined };
    }
    const snap = await loadSnapshot(tx);
    for (const x of opts.expect ?? []) {
      const actual = versionOf(snap.versions, x.kind, x.id);
      if (actual !== x.version) throw new StudioError('CONFLICT', `The ${x.kind} changed since it was read (version ${x.version}, now ${actual ?? 'gone'}); read it again before writing.`, { reason: 'STALE_VERSION', kind: x.kind, id: x.id, expected: x.version, actual: actual ?? null });
    }
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
          return { ...refused, changed: false, report: { inserted: 0, updated: 0, deleted: 0 }, state: snap.state };
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
    return { ...accepted, changed, report, state };
  });
  // the read model follows what this batch committed (the studio at its version)
  if (out.state && !(out as { replayed?: boolean }).replayed) remember(out.version, out.state, out.hash);
  if (out.ok && out.changed) {
    log.debug({ ms: Date.now() - t0, commands: commands.map((c) => c.name), ...out.report }, 'commands applied');
    await notifyChange(out.version, origin);
  }
  const { changed: _c, report: _r, state: _s, ...rest } = out as typeof out & { changed?: boolean; report?: unknown; state?: unknown }; void _c; void _r; void _s;
  return rest as BatchResult;
}
/** Convenience for server code and workers: one command, its result, or a thrown StudioError. */
export async function command<K extends CommandName>(name: K, args: Command<K>['args'], origin = 'server'): Promise<CommandResult<K>> {
  const cmd: Command<K> = { name, args, seed: `${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, at: new Date().toISOString() };
  const r = await applyCommands([cmd as Command], origin, { hash: false });
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
  const r = await applyCommands(cmds, origin, { also: opts.also, expect: opts.expect, hash: false });
  if (!r.ok) throw new StudioError(r.error.code as StudioError['code'], r.error.message, { ...r.error.details, failedAt: r.failedAt, command: cmds[r.failedAt]?.name });
  return r.results;
}

/** The current state, for readers that do not change anything. */
/** THE STUDIO AS IT IS NOW, for readers that change nothing (docs/BACKEND-AUDIT-2026-10.md H2, step 13c).
 *  - ONE CONSISTENT SNAPSHOT: every table is read in one repeatable-read, read-only transaction, so a reader never sees
 *    half of a batch (before this the twelve tables were read on separate pool connections, outside any transaction,
 *    and a batch committing in between could be seen half applied).
 *  - READ ONCE PER VERSION: the whole studio read at a studio version is kept (src/server/studio/readmodel.ts); while
 *    the version has not moved, a read costs one query. Only a studio read from the database is served this way —
 *    never one assembled from a batch's own result — so a read is always exactly what a fresh read returns.
 *  The caller gets its own copy (workers may change what they read); `shared: true` (a route that only serialises it)
 *  skips the copy. STUDIO_STORE=v1 reads as before. */
export async function readState(opts: { shared?: boolean } = {}): Promise<{ state: StudioState; version: number; hash: string; versions: AggregateVersions }> {
  if (storeMode() === 'v1') {
    const snap = await loadSnapshot();
    return { state: snap.state, version: snap.version, hash: hashState(snap.state), versions: snap.versions };
  }
  const now = (await db().select({ version: schema.studioMeta.version }).from(schema.studioMeta).where(eq(schema.studioMeta.id, 'studio')))[0]?.version ?? 0;
  const hit = readModelAt(now);
  const m = hit?.fromDatabase && hit.versions ? hit : await currentReadModel();
  const out = { state: m.state, version: m.version, hash: m.hash, versions: m.versions! };
  return opts.shared ? out : structuredClone(out);
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
