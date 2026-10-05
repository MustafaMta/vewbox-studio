import os from 'node:os';
import { and, asc, eq, lt, sql as dsql } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { env } from '../env';
import { log } from '../log';
import { jobScope } from '../jobs/context';
import { leaseSeconds, recordMetric } from '../jobs/queue';

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

export interface GpuLeaseOptions { jobId?: string; signal?: AbortSignal }
export interface GpuLease { <T>(family: GpuFamily, estimateMb: number, fn: () => Promise<T>, opts?: GpuLeaseOptions): Promise<T> }

export interface LeaseConfig {
  /** this process (a worker instance) — unique among the processes sharing the database */
  process: string;
  resource?: string;
  ttlMs?: number;
  pollMs?: number;
  /** make the card free for `to` (default: the engine unloaders) */
  unload?: (from: GpuFamily | null, to: GpuFamily) => Promise<unknown>;
}

type Row = typeof schema.resourceLeases.$inferSelect;

/** The admission rule, pure (tested): may `me` take the resource now? `rows` are the live rows of the resource. */
export function admits(rows: Pick<Row, 'holder' | 'ticket' | 'family' | 'state' | 'jobId'>[], me: Pick<Row, 'holder' | 'family' | 'jobId'>): boolean {
  const holders = rows.filter((r) => r.state === 'HOLDING' && r.holder !== me.holder);
  const waiters = rows.filter((r) => r.state === 'WAITING').sort((a, b) => a.ticket - b.ticket);
  const sameFamily = holders.every((h) => h.family === me.family);
  // nested: this job already holds the card — granted when the card is this job's alone, or held by this family
  if (me.jobId && holders.some((h) => h.jobId === me.jobId)) return sameFamily || holders.every((h) => h.jobId === me.jobId);
  return waiters[0]?.holder === me.holder && sameFamily;
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
  const expiry = () => new Date(Date.now() + ttlMs).toISOString();

  /** One admission round, under the resource's lock: expired rows go, then this row is granted or stays waiting. */
  const round = (holder: string, family: GpuFamily, jobId: string | undefined) => db().transaction(async (tx) => {
    await tx.execute(dsql`select pg_advisory_xact_lock(hashtext(${`resource:${resource}`}))`);
    const now = new Date().toISOString();
    const expired = await tx.delete(schema.resourceLeases).where(and(eq(schema.resourceLeases.resource, resource), lt(schema.resourceLeases.expiresAt, now))).returning({ holder: schema.resourceLeases.holder, process: schema.resourceLeases.process, state: schema.resourceLeases.state });
    if (expired.length) log.warn({ resource, expired }, 'gpu lease: rows of a process that stopped renewing them were removed');
    const rows = await tx.select().from(schema.resourceLeases).where(eq(schema.resourceLeases.resource, resource)).orderBy(asc(schema.resourceLeases.ticket));
    const me = rows.find((r) => r.holder === holder);
    if (!me) return { state: 'LOST' as const };
    if (!admits(rows, { holder, family, jobId: jobId ?? null })) {
      await tx.update(schema.resourceLeases).set({ expiresAt: expiry() }).where(and(eq(schema.resourceLeases.resource, resource), eq(schema.resourceLeases.holder, holder)));
      return { state: 'WAITING' as const, ahead: rows.filter((r) => r.ticket < me.ticket && r.state === 'WAITING').length, holders: rows.filter((r) => r.state === 'HOLDING').map((r) => r.family) };
    }
    await tx.update(schema.resourceLeases).set({ state: 'HOLDING', grantedAt: now, expiresAt: expiry() }).where(and(eq(schema.resourceLeases.resource, resource), eq(schema.resourceLeases.holder, holder)));
    const prev = await tx.select().from(schema.resourceState).where(eq(schema.resourceState.resource, resource));
    const loaded = (prev[0]?.loadedFamily ?? null) as GpuFamily | null;
    if (loaded !== family) await tx.insert(schema.resourceState).values({ resource, loadedFamily: family, updatedAt: now }).onConflictDoUpdate({ target: schema.resourceState.resource, set: { loadedFamily: family, updatedAt: now } });
    return { state: 'GRANTED' as const, from: loaded };
  });

  const enter = async (holder: string, family: GpuFamily, jobId: string | undefined) => {
    await db().insert(schema.resourceLeases).values({ resource, holder, family, state: 'WAITING', jobId: jobId ?? null, process: cfg.process, requestedAt: new Date().toISOString(), expiresAt: expiry() });
  };
  const leave = async (holder: string) => {
    try { await db().delete(schema.resourceLeases).where(and(eq(schema.resourceLeases.resource, resource), eq(schema.resourceLeases.holder, holder))); }
    catch (e) { log.error({ resource, holder, err: (e as Error).message }, 'gpu lease: could not release (the row expires on its own)'); }
    wakeAll();
  };

  return async <T>(family: GpuFamily, estimateMb: number, fn: () => Promise<T>, opts: GpuLeaseOptions = {}): Promise<T> => {
    const budget = env().GPU_VRAM_BUDGET_MB;
    if (estimateMb > budget) log.warn({ family, estimateMb, budget }, 'estimated VRAM exceeds the budget; the service must offload');
    const jobId = opts.jobId ?? (jobScope()?.jobId || undefined);
    const signal = opts.signal ?? jobScope()?.signal;
    const holder = `${cfg.process}:${life}:${++seq}`;
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
      void db().update(schema.resourceLeases).set({ expiresAt: expiry() }).where(and(eq(schema.resourceLeases.resource, resource), eq(schema.resourceLeases.holder, holder))).returning({ holder: schema.resourceLeases.holder })
        .then((rows) => { if (!rows.length) log.error({ holder, family }, 'gpu lease: the held row expired (this process stalled); another family may take the card'); })
        .catch((e: Error) => log.warn({ holder, err: e.message }, 'gpu lease: renewal failed; retrying'));
    }, Math.max(1000, Math.floor(ttlMs / 3)));
    try {
      if (granted.from !== family) {
        const tu = Date.now();
        await unload(granted.from, family);
        log.info({ from: granted.from, to: family, ms: Date.now() - tu }, 'gpu family switched');
      }
      const waited = Date.now() - t0;
      if (waited > 1000) await recordMetric('gpu.wait_ms', waited, 'ms', { family }, jobId).catch(() => undefined);
      const tr = Date.now();
      const out = await fn();
      await recordMetric('gpu.hold_ms', Date.now() - tr, 'ms', { family }, jobId).catch(() => undefined);
      return out;
    } finally {
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
  const rows = await db().delete(schema.resourceLeases).where(and(eq(schema.resourceLeases.resource, resource), eq(schema.resourceLeases.process, processName))).returning({ holder: schema.resourceLeases.holder });
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
