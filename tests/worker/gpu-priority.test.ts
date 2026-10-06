import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/server/db/client';
import { createDbGpuLease, workerGpuJobsWaiting, type GpuFamily } from '@/server/gpu/lease';
import { enqueue, requestCancel } from '@/server/jobs/queue';
import { resumeIntake } from '@/server/jobs/intake';

/** GPU LEASE PRIORITY against the real database: a worker process and a benchmark process (scripts/gpu-hold.ts, a
 *  BACKGROUND request) share one resource. One test per rule. Each test has its own resource name (never `gpu0`). */

const resources: string[] = [];
const fresh = () => { const r = `gpu-prio-${Math.random().toString(36).slice(2, 8)}`; resources.push(r); return r; };
const latch = () => { let open!: () => void; const p = new Promise<void>((r) => { open = r; }); return { p, open }; };
const until = async (cond: () => boolean, ms = 8000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('timed out waiting'); await new Promise((r) => setTimeout(r, 10)); } };
const made: string[] = [];
/** this file's own production id: the 'a film job is about to ask' rule is judged on its jobs alone, never on another test's */
const PROD = `p-prio-${Math.random().toString(36).slice(2, 8)}`;

function procs(resource: string) {
  const unload = async () => {};
  const gpuJobsWaiting: Parameters<typeof createDbGpuLease>[0]['gpuJobsWaiting'] = (tx, now) => workerGpuJobsWaiting(tx, now, { productionId: PROD });
  return { worker: createDbGpuLease({ process: `worker-${resource}`, resource, pollMs: 15, unload, gpuJobsWaiting }), bench: createDbGpuLease({ process: `bench-${resource}`, resource, pollMs: 15, unload, gpuJobsWaiting }) };
}
const work = (log: string[], name: string, gate: Promise<void>) => async () => { log.push(`${name}+`); await gate; log.push(`${name}-`); };

beforeAll(async () => {
  // intake must be open for this file's own job to count as waiting (other tests' jobs are never looked at: PROD)
  await resumeIntake();
});
afterAll(async () => {
  if (resources.length) { await db().delete(schema.resourceLeases).where(inArray(schema.resourceLeases.resource, resources)); await db().delete(schema.resourceState).where(inArray(schema.resourceState.resource, resources)); }
  if (made.length) await db().update(schema.jobs).set({ status: 'CANCELLED' }).where(inArray(schema.jobs.id, made));
});

describe('GPU lease priority (the films first)', () => {
  it('worker requests go before an earlier background request, FIFO among themselves; the background batch runs when none waits', async () => {
    const r = fresh(); const { worker, bench } = procs(r); const log: string[] = [];
    const g0 = latch(), gb = latch(), g1 = latch(), g2 = latch();
    const first = worker('VIDEO', 1, work(log, 'W0', g0.p));
    await until(() => log.includes('W0+'));
    const b = bench('IMAGE', 1, work(log, 'B', gb.p), { priority: 'background' });
    await new Promise((x) => setTimeout(x, 100));
    const w1 = worker('ASR', 1, work(log, 'W1', g1.p));
    await new Promise((x) => setTimeout(x, 60));
    const w2 = worker('TTS', 1, work(log, 'W2', g2.p));
    await new Promise((x) => setTimeout(x, 100));
    g0.open(); await first;
    await until(() => log.includes('W1+'));
    g1.open(); await w1;
    await until(() => log.includes('W2+'));
    expect(log.includes('B+')).toBe(false);
    g2.open(); await w2;
    await until(() => log.includes('B+'));
    gb.open(); await b;
    expect(log).toEqual(['W0+', 'W0-', 'W1+', 'W1-', 'W2+', 'W2-', 'B+', 'B-']);
  });

  it('a holder is never preempted: a background batch holding the card finishes before the worker request that arrives', async () => {
    const r = fresh(); const { worker, bench } = procs(r); const log: string[] = [];
    const gb = latch(), gw = latch();
    const b = bench('IMAGE', 1, work(log, 'B', gb.p), { priority: 'background' });
    await until(() => log.includes('B+'));
    const w = worker('VIDEO', 1, work(log, 'W', gw.p));
    await new Promise((x) => setTimeout(x, 200));
    expect(log).toEqual(['B+']);
    gb.open(); await b;
    await until(() => log.includes('W+'));
    gw.open(); await w;
    expect(log).toEqual(['B+', 'B-', 'W+', 'W-']);
  });

  it('a worker GPU job queued (about to ask for the card) keeps a background request out until it is gone', async () => {
    const r = fresh(); const { bench } = procs(r); const log: string[] = [];
    const { job } = await enqueue({ type: 'SHOT_FRAMES', payload: { productionId: PROD, shotId: 's-prio' } });
    made.push(job.id);
    const gb = latch();
    const b = bench('IMAGE', 1, work(log, 'B', gb.p), { priority: 'background' });
    await new Promise((x) => setTimeout(x, 300));
    expect(log).toEqual([]);
    await requestCancel(job.id);
    await until(() => log.includes('B+'));
    gb.open(); await b;
  });

  it('the starvation guard: a background request waiting 45 min is served at the next free slot, ahead of a newer worker request', async () => {
    const r = fresh(); const { worker, bench } = procs(r); const log: string[] = [];
    const g0 = latch(), gb = latch(), gw = latch();
    const first = worker('VIDEO', 1, work(log, 'W0', g0.p));
    await until(() => log.includes('W0+'));
    const b = bench('IMAGE', 1, work(log, 'B', gb.p), { priority: 'background' });
    // the benchmark has been waiting 46 minutes (once its request row exists)
    const t0 = Date.now();
    for (;;) {
      const n = await db().update(schema.resourceLeases).set({ requestedAt: new Date(Date.now() - 46 * 60_000).toISOString() }).where(and(eq(schema.resourceLeases.resource, r), eq(schema.resourceLeases.process, `bench-${r}`))).returning({ h: schema.resourceLeases.holder });
      if (n.length) break;
      if (Date.now() - t0 > 5000) throw new Error('the benchmark request never queued');
      await new Promise((x) => setTimeout(x, 20));
    }
    const w = worker('TTS', 1, work(log, 'W1', gw.p));
    await new Promise((x) => setTimeout(x, 80));
    g0.open(); await first;
    await until(() => log.includes('B+'));
    expect(log.includes('W1+')).toBe(false);
    gb.open(); await b;
    await until(() => log.includes('W1+'));
    gw.open(); await w;
    expect(log).toEqual(['W0+', 'W0-', 'B+', 'B-', 'W1+', 'W1-']);
  });
});

export type { GpuFamily };
