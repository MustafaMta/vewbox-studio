import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { StudioError } from '@/domain/errors';
import { databaseName, isLiveDatabase, LIVE_DATABASE_NAMES, withDatabase } from '../test-guard';
import { db, schema, type Db } from '../db/client';
import { env } from '../env';

/** ONE GPU LEASE PER MACHINE (incident 2026-10-06 12:41–12:48Z). There is one card and one set of engines (ComfyUI,
 *  TTS, ASR, Ollama, LatentSync), so there must be one lease. Before, the lease lived in each process's own database:
 *  an app or worker running on a COPY (a QA server, a product engineer's server, the e2e server, a worktree worker)
 *  queued in its copy's `resource_leases` and then called the live engines outside the live lease — Qwen-Image
 *  prompts ran beside the LLM and ASR holds.
 *
 *  - The lease tables (`resource_leases`, `resource_state`) and the "worker GPU job waiting" check always use
 *    GPU_LEASE_DATABASE_URL, by default the LIVE studio database on the same server as DATABASE_URL — whatever
 *    database the process itself uses.
 *  - THE GUARD: a process whose lease is NOT the live one refuses to call a real local engine (a loopback or compose
 *    service URL) with a clear error, instead of using the card unseen. Tests on their own lease run against fixture
 *    engines and say so (VEWBOX_FIXTURE_ENGINES=1); a hosted API (a dotted public host) is never a local engine. */

type Env = Record<string, string | undefined>;

/** The lease database for this process. */
export function leaseDatabaseUrl(e: Env = process.env): string {
  const explicit = e.GPU_LEASE_DATABASE_URL?.trim();
  if (explicit) return explicit;
  const own = e.DATABASE_URL ?? '';
  return own ? withDatabase(own, LIVE_DATABASE_NAMES[0]) : own;
}

/** Whether this process queues on the live studio's lease. */
export const leaseIsLive = (e: Env = process.env): boolean => Boolean(databaseName(leaseDatabaseUrl(e))) && isLiveDatabase(leaseDatabaseUrl(e), e);

const g = globalThis as unknown as { __vewboxLeaseDb?: { url: string; db: Db } };

/** The Drizzle handle of the lease database (the process's own pool when it is the same database). */
export function leaseDb(): Db {
  const url = leaseDatabaseUrl({ ...process.env, DATABASE_URL: env().DATABASE_URL });
  if (databaseName(url) === databaseName(env().DATABASE_URL) && hostOf(url) === hostOf(env().DATABASE_URL)) return db();
  if (g.__vewboxLeaseDb?.url !== url) g.__vewboxLeaseDb = { url, db: drizzle(postgres(url, { max: 3, idle_timeout: 30, connect_timeout: 10, prepare: false, onnotice: () => {} }), { schema }) };
  return g.__vewboxLeaseDb.db;
}
const hostOf = (u: string | undefined) => { try { const x = new URL(u ?? ''); return `${x.hostname}:${x.port}`; } catch { return ''; } };

/** A real engine on this machine: a loopback address, the Docker host alias, or a compose service name (no dot). */
export function isLocalEngine(url: string): boolean {
  let h: string;
  try { h = new URL(url).hostname.replace(/^\[|\]$/g, '').toLowerCase(); } catch { return false; }
  return h === 'localhost' || h === '::1' || /^127\./.test(h) || h === 'host.docker.internal' || (h.length > 0 && !h.includes('.') && !h.includes(':'));
}

/** Why this process may not call `url`, or undefined. Pure (tested). */
export function engineGuardProblem(url: string, e: Env = process.env): string | undefined {
  if (e.VEWBOX_FIXTURE_ENGINES === '1' || !isLocalEngine(url) || leaseIsLive(e)) return undefined;
  return `This process takes its GPU lease in "${databaseName(leaseDatabaseUrl(e)) ?? '?'}", not in the live studio's, so it may not call the machine's real engine at ${url}: the card is shared, and work outside the live lease runs beside the studio's models. Use the live lease (unset GPU_LEASE_DATABASE_URL, or point it at the live database) — or, in a test, fixture engines (VEWBOX_FIXTURE_ENGINES=1).`;
}

/** The engine URL, or a refusal (NOT_CONFIGURED, failure class INFRASTRUCTURE, not retryable). */
export function guardedEngineUrl(url: string, what: string): string {
  const problem = engineGuardProblem(url);
  if (problem) throw Object.assign(new StudioError('NOT_CONFIGURED', `${what}: ${problem}`, { reason: 'GPU_LEASE_NOT_SHARED', url }), { failureClass: 'INFRASTRUCTURE', retryable: false });
  return url;
}
