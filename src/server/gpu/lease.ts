import os from 'node:os';
import { and, asc, eq, isNull, lt, sql as dsql } from 'drizzle-orm';
import { schema } from '../db/client';
import { leaseDb } from './lease-db';
import { env } from '../env';
import { log } from '../log';
import { jobScope } from '../jobs/context';
import { leaseSeconds, recordMetric } from '../jobs/queue';
import { JOB_RESOURCE, JOB_TYPES } from '@/domain/jobs';

/** THE GPU LEASE, SHARED BY EVERY PROCESS (docs/BACKEND-AUDIT-2026-10.md H7, step 8). One RTX 5090: local models
 *  (images, video, music in ComfyUI; voices; transcription; the local story model) each hold their weights while
 *  loaded, and only one family fits. Before this the lease was a variable in one process; a second worker, or the web
 *  server measuring a voice reference, went around it.
 *
 *  Now every acquisition is a row in `resource_leases` (src/server/db/schema.ts):
 *  - ADMISSION IS FIFO by ticket. A request is granted when it is the oldest waiter and the card is free or held by
 *    its own family. The same family shares the card (a service batches) — but never past an older waiter of another
 *    family: a stream of VIDEO work cannot starve a waiting ASR call.
 *  - A request nested in a job that already holds the card (a take transcribing its own clip) is granted as soon as
 *    nothing of another job is on the card, ahead of the queue — it would otherwise wait for itself.
 *  - When the family changes, the engines that do not serve the new one unload first (src/server/gpu/unloaders.ts);
 *    `resource_state` remembers what was loaded last.
 *  - Rows are renewed while their process lives (holders and waiters); a dead process's row expires (90 s) and is
 *    removed by the next admission, so a crash never blocks the card.
 *  Rollback: GPU_LEASE=memory restores the in-process lease of each process. */

/** LIPSYNC: the lip-sync corrector (docker/lipsync, LatentSync 1.6) — its own family so that taking the card for it
 *  unloads ComfyUI (H3 may still be resident after a VIDEO job; a VIDEO→VIDEO hand-over unloads nothing). */
export type GpuFamily = 'IMAGE' | 'VIDEO' | 'TTS' | 'ASR' | 'MUSIC' | 'LLM' | 'LIPSYNC';
export const GPU_FAMILIES: readonly GpuFamily[] = ['IMAGE', 'VIDEO', 'TTS', 'ASR', 'MUSIC', 'LLM', 'LIPSYNC'];

/** 'normal': the studio's own work (worker jobs, the web). 'background': benchmarks and evaluations through
 *  scripts/gpu-hold.ts — admitted only when no normal request waits (the films first), never preempting a holder,
 *  and admitted at the next free slot once it has waited BACKGROUND_STARVATION_MS (45 min). */
export type GpuPriority = 'normal' | 'background';
export interface GpuLeaseOptions { jobId?: string; signal?: AbortSignal; priority?: GpuPriority }

/** A background request's holder key starts with this (no migration: the priority rides on the key). */
export const BACKGROUND_PREFIX = 'bg:';
/** A background request waiting this long is served like a normal one (the starvation guard). */
export const BACKGROUND_STARVATION_MS = 45 * 60_000;
export const isBackground = (holder: string): boolean => holder.startsWith(BACKGROUND_PREFIX);
/** A holder whose family switch (the other engines unloading) is still in progress. It is a HOLDING row with no
 *  granted_at yet — NOT a state of its own: a process running older lease code (a gpu-hold started before this version)
 *  counts only HOLDING rows as holders, and a new state was invisible to it — at 13:05:12Z an old-code background TTS hold
 *  was admitted beside a worker's ASR grant that was still SWITCHING. The legacy 'SWITCHING' state (one build wrote it)
 *  is still read as switching. */
export const SWITCHING = 'SWITCHING';
export const isSwitching = (r: { state: string; grantedAt?: string | null }): boolean => r.state === SWITCHING || (r.state === 'HOLDING' && r.grantedAt === null);
export interface GpuLease { <T>(family: GpuFamily, estimateMb: number, fn: () => Promise<T>, opts?: GpuLeaseOptions): Promise<T> }

export interface LeaseConfig {
  /** this process (a worker instance) — unique among the processes sharing the database */
  process: string;
  resource?: string;
  ttlMs?: number;
  pollMs?: number;
  /** make the card free for `to` (default: the engine unloaders) */
  unload?: (from: GpuFamily | null, to: GpuFamily) => Promise<unknown>;
  /** whether worker GPU jobs are about to ask for the card (keeps background requests out); default: the jobs table */
  gpuJobsWaiting?: (tx: { execute: ReturnType<typeof leaseDb>['execute'] }, nowIso: string) => Promise<boolean>;
}

type Row = typeof schema.resourceLeases.$inferSelect;

/** The admission rule, pure (tested): may `me` take the resource now? `rows` are the live rows of the resource.
 *  THE QUEUE ORDER: normal requests first, FIFO by ticket among themselves; then background requests, FIFO by ticket.
 *  A background request that has waited BACKGROUND_STARVATION_MS (by `requestedAt`, against `now`) counts as normal —
 *  with its old ticket it is next at the following free slot. Only the head of that order is admitted, and only when
 *  the card is free or held by its family. A holder is never preempted (nothing here takes a card back). */
export function admits(rows: Array<Pick<Row, 'holder' | 'ticket' | 'family' | 'state' | 'jobId'> & { requestedAt?: string; grantedAt?: string | null }>, me: Pick<Row, 'holder' | 'family' | 'jobId'>, now = Date.now(), ctx: { gpuJobsWaiting?: boolean } = {}): boolean {
  // SWITCHING: a holder granted across a family change whose engines are still unloading. It holds the card like a
  // holder, and nobody else — not even its own family — is admitted until the unload is done (2026-10-06 12:42Z: a
  // second IMAGE request shared the card while the first was still unloading Ollama, and Qwen-Image loaded beside it)
  const holders = rows.filter((r) => (r.state === 'HOLDING' || r.state === SWITCHING) && r.holder !== me.holder);
  if (holders.some((h) => isSwitching(h))) return false;
  const sameFamily = holders.every((h) => h.family === me.family);
  // nested: this job already holds the card — granted when the card is this job's alone, or held by this family
  if (me.jobId && holders.some((h) => h.jobId === me.jobId)) return sameFamily || holders.every((h) => h.jobId === me.jobId);
  const background = (r: { holder: string; requestedAt?: string }) => isBackground(r.holder) && !(r.requestedAt && now - Date.parse(r.requestedAt) >= BACKGROUND_STARVATION_MS);
  const waiters = rows.filter((r) => r.state === 'WAITING').sort((a, b) => Number(background(a)) - Number(background(b)) || a.ticket - b.ticket);
  const head = waiters[0];
  if (head?.holder !== me.holder || !sameFamily) return false;
  // THE FILMS FIRST between their GPU steps too: a worker GPU job queued (or claimed and preparing, about to ask for
  // the card) keeps a background request out, unless it is starving
  if (background(head) && ctx.gpuJobsWaiting) return false;
  return true;
}

/** The worker's GPU-lane jobs (JOB_RESOURCE GPU) that want the card soon: QUEUED and runnable while intake is open, or
 *  running without a lease row (claimed, preparing its request). */
// takes and songs run in the HOSTED lane but on this card when there is no hosted key (local MiniMax H3, ACE-Step)
const gpuJobTypes = () => JOB_TYPES.filter((t) => JOB_RESOURCE[t] === 'GPU' || (!env().MINIMAX_API_KEY && (t === 'GENERATE_TAKE' || t === 'GENERATE_SONG')));
export async function workerGpuJobsWaiting(tx: { execute: ReturnType<typeof leaseDb>['execute'] }, nowIso: string, opts: { productionId?: string } = {}): Promise<boolean> {
  const types = dsql.join(gpuJobTypes().map((t) => dsql`${t}`), dsql`, `);
  const scope = opts.productionId ? dsql`and j.production_id = ${opts.productionId}` : dsql``;
  const rows = await tx.execute<{ waiting: boolean }>(dsql`select exists (
    select 1 from jobs j where j.type in (${types}) and j.cancel_requested = false ${scope} and (
      (j.status = 'QUEUED' and (j.run_after is null or j.run_after <= ${nowIso}) and not exists (select 1 from studio_meta m where m.id = 'studio' and m.intake_paused_at is not null))
      or (j.status in ('PREPARING', 'GENERATING', 'DOWNLOADING', 'VALIDATING', 'POSTPROCESSING') and not exists (select 1 from resource_leases l where l.job_id = j.id))
    )) as waiting`);
  return Boolean(rows[0]?.waiting);
}

export function createDbGpuLease(cfg: LeaseConfig): GpuLease {
  const resource = cfg.resource ?? 'gpu0';
  const ttlMs = cfg.ttlMs ?? leaseSeconds() * 1000;
  const pollMs = cfg.pollMs ?? 500;
  const unload = cfg.unload ?? (async (from: GpuFamily | null, to: GpuFamily) => (await import('./unloaders')).unloadFor(from, to));
  let seq = 0;
  // a process restarted under the same name (WORKER_ID set) must never reuse a holder key of its previous life, whose
  // rows may still be in the table until they expire: the holder carries a nonce of this process's life
  const life = Math.random().toString(36).slice(2, 8);
  const wakers = new Set<() => void>();
  const wakeAll = () => { for (const w of [...wakers]) w(); };
  /** an expiry on the database clock (see the round) */
  const expirySql = () => dsql`now() + make_interval(secs => ${ttlMs / 1000})`;

  /** One admission round, under the resource's lock: expired rows go, then this row is granted or stays waiting. */
  const round = (holder: string, family: GpuFamily, jobId: string | undefined) => leaseDb().transaction(async (tx) => {
    await tx.execute(dsql`select pg_advisory_xact_lock(hashtext(${`resource:${resource}`}))`);
    // DATABASE TIME, never this process's clock: expiry, requests and the starvation guard are compared on one clock (a
    // process in a container or after a sleep may run minutes off, and would expire or starve others' rows)
    const nowMs = Number((await tx.execute<{ ms: string }>(dsql`select (extract(epoch from now()) * 1000)::bigint::text as ms`))[0].ms);
    const now = new Date(nowMs).toISOString();
    const expiryAt = () => new Date(nowMs + ttlMs).toISOString();
    const expired = await tx.delete(schema.resourceLeases).where(and(eq(schema.resourceLeases.resource, resource), lt(schema.resourceLeases.expiresAt, now))).returning({ holder: schema.resourceLeases.holder, process: schema.resourceLeases.process, state: schema.resourceLeases.state });
    if (expired.length) log.warn({ resource, expired }, 'gpu lease: rows of a process that stopped renewing them were removed');
    const rows = await tx.select().from(schema.resourceLeases).where(eq(schema.resourceLeases.resource, resource)).orderBy(asc(schema.resourceLeases.ticket));
    const me = rows.find((r) => r.holder === holder);
    if (!me) return { state: 'LOST' as const };
    const gpuJobsWaiting = isBackground(holder) ? await (cfg.gpuJobsWaiting ?? workerGpuJobsWaiting)(tx, now) : false;
    if (!admits(rows, { holder, family, jobId: jobId ?? null }, Date.parse(now), { gpuJobsWaiting })) {
      await tx.update(schema.resourceLeases).set({ expiresAt: expiryAt() }).where(and(eq(schema.resourceLeases.resource, resource), eq(schema.resourceLeases.holder, holder)));
      return { state: 'WAITING' as const, ahead: rows.filter((r) => r.ticket < me.ticket && r.state === 'WAITING').length, holders: rows.filter((r) => r.state === 'HOLDING' || r.state === SWITCHING).map((r) => r.family) };
    }
    const prev = await tx.select().from(schema.resourceState).where(eq(schema.resourceState.resource, resource));
    const loaded = (prev[0]?.loadedFamily ?? null) as GpuFamily | null;
    // a grant across a family change is SWITCHING until its unloads are done (then HOLDING: markHolding below)
    await tx.update(schema.resourceLeases).set({ state: 'HOLDING', grantedAt: loaded === family ? now : null, expiresAt: expiryAt() }).where(and(eq(schema.resourceLeases.resource, resource), eq(schema.resourceLeases.holder, holder)));
    if (loaded !== family) await tx.insert(schema.resourceState).values({ resource, loadedFamily: family, updatedAt: now }).onConflictDoUpdate({ target: schema.resourceState.resource, set: { loadedFamily: family, updatedAt: now } });
    return { state: 'GRANTED' as const, from: loaded };
  });

  const enter = async (holder: string, family: GpuFamily, jobId: string | undefined) => {
    await leaseDb().insert(schema.resourceLeases).values({ resource, holder, family, state: 'WAITING', jobId: jobId ?? null, process: cfg.process, requestedAt: dsql`now()`, expiresAt: expirySql() });
  };
  const markHolding = async (holder: string) => {
    await leaseDb().update(schema.resourceLeases).set({ state: 'HOLDING', grantedAt: dsql`now()` }).where(and(eq(schema.resourceLeases.resource, resource), eq(schema.resourceLeases.holder, holder), isNull(schema.resourceLeases.grantedAt))).catch((e: Error) => log.warn({ holder, err: e.message }, 'gpu lease: could not mark the switch done (the row expires on its own)'));
    wakeAll();
  };
  /** The job still holds the card for another family (the outer request): unload this family, record the outer one. */
  const restoreOuter = async (holder: string, family: GpuFamily, jobId: string) => {
    const outer = (await leaseDb().select().from(schema.resourceLeases).where(and(eq(schema.resourceLeases.resource, resource), eq(schema.resourceLeases.jobId, jobId))))
      .filter((r) => r.holder !== holder && (r.state === 'HOLDING' || r.state === SWITCHING) && r.family !== family);
    if (!outer.length) return;
    const back = outer[0].family as GpuFamily;
    await leaseDb().update(schema.resourceLeases).set({ grantedAt: null }).where(and(eq(schema.resourceLeases.resource, resource), eq(schema.resourceLeases.holder, holder)));
    await leaseDb().insert(schema.resourceState).values({ resource, loadedFamily: back, updatedAt: new Date().toISOString() }).onConflictDoUpdate({ target: schema.resourceState.resource, set: { loadedFamily: back, updatedAt: new Date().toISOString() } });
    await unload(family, back);
    log.info({ from: family, to: back, jobId }, 'gpu family switched back to the outer request of the job');
  };
  const leave = async (holder: string) => {
    try { await leaseDb().delete(schema.resourceLeases).where(and(eq(schema.resourceLeases.resource, resource), eq(schema.resourceLeases.holder, holder))); }
    catch (e) { log.error({ resource, holder, err: (e as Error).message }, 'gpu lease: could not release (the row expires on its own)'); }
    wakeAll();
  };

  return async <T>(family: GpuFamily, estimateMb: number, fn: () => Promise<T>, opts: GpuLeaseOptions = {}): Promise<T> => {
    const budget = env().GPU_VRAM_BUDGET_MB;
    if (estimateMb > budget) log.warn({ family, estimateMb, budget }, 'estimated VRAM exceeds the budget; the service must offload');
    const jobId = opts.jobId ?? (jobScope()?.jobId || undefined);
    const signal = opts.signal ?? jobScope()?.signal;
    const holder = `${opts.priority === 'background' ? BACKGROUND_PREFIX : ''}${cfg.process}:${life}:${++seq}`;
    const t0 = Date.now();
    await enter(holder, family, jobId);
    let granted: { from: GpuFamily | null } | undefined;
    try {
      for (let polls = 0; ; polls++) {
        if (signal?.aborted) throw signal.reason ?? new Error('aborted while waiting for the GPU');
        const r = await round(holder, family, jobId);
        if (r.state === 'GRANTED') { granted = { from: r.from }; break; }
        if (r.state === 'LOST') { log.warn({ holder, family }, 'gpu lease: this request expired while waiting (the process stalled); queued again'); await enter(holder, family, jobId); continue; }
        if (polls % 20 === 0) log.debug({ family, ahead: r.ahead, holders: r.holders }, 'gpu lease: waiting');
        await new Promise<void>((resolve) => {
          const done = () => { clearTimeout(t); wakers.delete(done); signal?.removeEventListener('abort', done); resolve(); };
          const t = setTimeout(done, pollMs);
          wakers.add(done);
          signal?.addEventListener('abort', done, { once: true });
        });
      }
    } catch (e) { await leave(holder); throw e; }
    // renewed while held; a lost row (this process stalled past the TTL) is logged — the work in flight is not stopped
    const renew = setInterval(() => {
      void leaseDb().update(schema.resourceLeases).set({ expiresAt: expirySql() }).where(and(eq(schema.resourceLeases.resource, resource), eq(schema.resourceLeases.holder, holder))).returning({ holder: schema.resourceLeases.holder })
        .then((rows) => { if (!rows.length) log.error({ holder, family }, 'gpu lease: the held row expired (this process stalled); another family may take the card'); })
        .catch((e: Error) => log.warn({ holder, err: e.message }, 'gpu lease: renewal failed; retrying'));
    }, Math.max(1000, Math.floor(ttlMs / 3)));
    try {
      if (granted.from !== family) {
        const tu = Date.now();
        try { await unload(granted.from, family); }
        finally { await markHolding(holder); }
        log.info({ from: granted.from, to: family, ms: Date.now() - tu }, 'gpu family switched');
      }
      const waited = Date.now() - t0;
      if (waited > 1000) await recordMetric('gpu.wait_ms', waited, 'ms', { family }, jobId).catch(() => undefined);
      const tr = Date.now();
      const out = await fn();
      await recordMetric('gpu.hold_ms', Date.now() - tr, 'ms', { family }, jobId).catch(() => undefined);
      return out;
    } finally {
      // A NESTED REQUEST OF ANOTHER FAMILY gives the card back to the family its job still holds: that family's
      // engines are what the job uses next, so the nested family's engines unload and the card is recorded as the outer
      // family again (before, the outer job went on with its model beside the nested family's weights)
      if (jobId) await restoreOuter(holder, family, jobId).catch((e: Error) => log.warn({ holder, err: e.message }, 'gpu lease: could not switch back to the outer family'));
      clearInterval(renew);
      await leave(holder);
    }
  };
}

// ------------------------------------------------------------------------------------------ the in-process lease

/** The lease of one process (before step 8; the rollback GPU_LEASE=memory). Same family shares; another waits. */
export function createMemoryGpuLease(cfg: { unload?: (from: GpuFamily | null, to: GpuFamily) => Promise<unknown> } = {}): GpuLease {
  const unload = cfg.unload ?? (async (from: GpuFamily | null, to: GpuFamily) => (await import('./unloaders')).unloadFor(from, to));
  let current: { family: GpuFamily; holders: number } | null = null;
  let last: GpuFamily | null = null;
  const waiters: Array<() => void> = [];
  return async <T>(family: GpuFamily, _estimateMb: number, fn: () => Promise<T>): Promise<T> => {
    for (;;) {
      if (!current) { current = { family, holders: 1 }; break; }
      if (current.family === family) { current.holders += 1; break; }
      await new Promise<void>((r) => waiters.push(r));
    }
    try {
      if (last !== family) { await unload(last, family); last = family; }
      return await fn();
    } finally {
      current!.holders -= 1;
      if (current!.holders <= 0) { current = null; for (const w of waiters.splice(0)) w(); }
    }
  };
}

/** A stopping process gives the card back at once (rows it holds or waits with), instead of leaving them to expire
 *  after the TTL — the next worker would otherwise wait 90 s for a card nobody uses. Returns the rows removed. */
export async function releaseProcessGpuLeases(processName: string, resource = 'gpu0'): Promise<number> {
  const rows = await leaseDb().delete(schema.resourceLeases).where(and(eq(schema.resourceLeases.resource, resource), eq(schema.resourceLeases.process, processName))).returning({ holder: schema.resourceLeases.holder });
  if (rows.length) log.info({ resource, process: processName, rows: rows.length }, 'gpu lease: released the rows of a stopping process');
  return rows.length;
}

const g = globalThis as unknown as { __vewboxGpuLease?: { mode: string; lease: GpuLease } };

/** This process's lease: the shared database lease, or (GPU_LEASE=memory) the in-process one. */
export const gpuLease: GpuLease = (family, estimateMb, fn, opts) => {
  const mode = process.env.GPU_LEASE === 'memory' ? 'memory' : 'db';
  if (g.__vewboxGpuLease?.mode !== mode) g.__vewboxGpuLease = { mode, lease: mode === 'memory' ? createMemoryGpuLease() : createDbGpuLease({ process: env().WORKER_ID || `${os.hostname()}-${process.pid}` }) };
  return g.__vewboxGpuLease.lease(family, estimateMb, fn, opts);
};
