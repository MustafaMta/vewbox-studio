import { and, asc, desc, eq, gt } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { UNLOAD_METRIC } from './unloaders';
import { leaseDb } from './lease-db';
import { isSwitching } from './lease';

/** WHAT THE GPU IS DOING, READ ONLY (the engine room: GET /api/studio/gpu). The shared lease's rows
 *  (src/server/gpu/lease.ts): who holds the card and who waits, in admission order; what was loaded last; and the last
 *  engine unloads (each one a `gpu.unload_ms` metric). Nothing here changes the lease. */

export interface GpuHolder { holder: string; family: string; jobId: string | null; process: string; requestedAt: string; grantedAt: string | null; expiresAt: string }
export interface GpuWaiter { holder: string; family: string; jobId: string | null; process: string; requestedAt: string; expiresAt: string; /** 1 = next to be admitted */ position: number }
export interface GpuUnload { at: string; engine: string; from: string; to: string; ms: number; ok: boolean; jobId: string | null }
export interface GpuStatus {
  resource: string;
  /** `db`: one lease shared by every process; `memory`: the per-process rollback (GPU_LEASE=memory) — rows then stay empty */
  mode: 'db' | 'memory';
  loaded: { family: string | null; since: string | null };
  holders: GpuHolder[];
  waiting: GpuWaiter[];
  unloads: GpuUnload[];
  at: string;
}

export async function gpuStatus(opts: { resource?: string; unloads?: number } = {}): Promise<GpuStatus> {
  const resource = opts.resource ?? 'gpu0';
  const [rows, state, unloads] = await Promise.all([
    leaseDb().select().from(schema.resourceLeases).where(and(eq(schema.resourceLeases.resource, resource), gt(schema.resourceLeases.expiresAt, new Date().toISOString()))).orderBy(asc(schema.resourceLeases.ticket)),
    leaseDb().select().from(schema.resourceState).where(eq(schema.resourceState.resource, resource)),
    db().select().from(schema.metrics).where(eq(schema.metrics.name, UNLOAD_METRIC)).orderBy(desc(schema.metrics.at)).limit(Math.min(100, Math.max(1, opts.unloads ?? 20))),
  ]);
  const now = new Date().toISOString();
  // a row past its expiry belongs to a process that stopped renewing it: it is not on the card (the next admission removes it)
  const liveRows = rows;
  return {
    resource,
    mode: process.env.GPU_LEASE === 'memory' ? 'memory' : 'db',
    loaded: { family: state[0]?.loadedFamily ?? null, since: state[0]?.updatedAt ?? null },
    holders: liveRows.filter((r) => r.state === 'HOLDING' || r.state === 'SWITCHING').map((r) => ({ switching: isSwitching(r), holder: r.holder, family: r.family, jobId: r.jobId, process: r.process, requestedAt: r.requestedAt, grantedAt: r.grantedAt, expiresAt: r.expiresAt })),
    waiting: liveRows.filter((r) => r.state === 'WAITING').map((r, i) => ({ holder: r.holder, family: r.family, jobId: r.jobId, process: r.process, requestedAt: r.requestedAt, expiresAt: r.expiresAt, position: i + 1 })),
    unloads: unloads.map((m) => { const l = (m.labels ?? {}) as Record<string, unknown>; return { at: m.at, engine: String(l.engine ?? '?'), from: String(l.from ?? 'unknown'), to: String(l.to ?? '?'), ms: m.value, ok: l.ok !== false, jobId: m.jobId }; }),
    at: now,
  };
}
