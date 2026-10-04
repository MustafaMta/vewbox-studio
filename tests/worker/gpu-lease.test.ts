import { afterAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/server/db/client';
import { createDbGpuLease, type GpuFamily } from '@/server/gpu/lease';

/** THE SHARED GPU LEASE (docs/BACKEND-AUDIT-2026-10.md H7, step 8), against the real database: two lease instances in
 *  one test process stand for two worker processes (each has its own process id, as a host worker and a compose
 *  worker do). Each test uses its own resource name, so it never meets the studio's `gpu0`. */

const resources: string[] = [];
const fresh = () => { const r = `gpu-test-${Math.random().toString(36).slice(2, 8)}`; resources.push(r); return r; };
afterAll(async () => {
  if (resources.length) {
    await db().delete(schema.resourceLeases).where(inArray(schema.resourceLeases.resource, resources));
    await db().delete(schema.resourceState).where(inArray(schema.resourceState.resource, resources));
  }
});

const latch = () => { let open!: () => void; const p = new Promise<void>((r) => { open = r; }); return { p, open }; };
const until = async (cond: () => boolean, ms = 5000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('timed out waiting'); await new Promise((r) => setTimeout(r, 10)); } };

function pair(resource: string) {
  const unloads: Array<[GpuFamily | null, GpuFamily]> = [];
  const unload = async (from: GpuFamily | null, to: GpuFamily) => { unloads.push([from, to]); };
  const a = createDbGpuLease({ process: `proc-A-${resource}`, resource, pollMs: 15, unload });
  const b = createDbGpuLease({ process: `proc-B-${resource}`, resource, pollMs: 15, unload });
  return { a, b, unloads };
}

describe('shared GPU lease (audit H7, step 8)', () => {
  it('two processes never hold different families at once; admission is FIFO, so a stream of one family cannot starve another', async () => {
    const resource = fresh();
    const { a, b, unloads } = pair(resource);
    const log: string[] = [];
    const onCard = new Map<string, GpuFamily>();
    const work = (name: string, family: GpuFamily, gate: Promise<void>) => async () => {
      for (const f of onCard.values()) if (f !== family) throw new Error(`${name} (${family}) shares the card with ${f}`);
      onCard.set(name, family); log.push(`${name}+`);
      await gate;
      onCard.delete(name); log.push(`${name}-`);
    };
    const g1 = latch(); const g2 = latch(); const g3 = latch();
    const v1 = a('VIDEO', 28000, work('A1', 'VIDEO', g1.p));
    await until(() => log.includes('A1+'));
    // process B asks for ASR: it waits for the card
    const asr = b('ASR', 4000, work('B1', 'ASR', g2.p));
    await new Promise((r) => setTimeout(r, 150));
    // process A asks for VIDEO again — the family on the card — but B asked first: no overtaking
    const v2 = a('VIDEO', 28000, work('A2', 'VIDEO', g3.p));
    await new Promise((r) => setTimeout(r, 200));
    expect(log).toEqual(['A1+']);
    const rows = await db().select().from(schema.resourceLeases).where(eq(schema.resourceLeases.resource, resource));
    expect(rows.map((r) => [r.family, r.state]).sort()).toEqual([['ASR', 'WAITING'], ['VIDEO', 'HOLDING'], ['VIDEO', 'WAITING']]);
    g1.open(); await v1;
    await until(() => log.includes('B1+'));
    await new Promise((r) => setTimeout(r, 100));
    expect(log).toEqual(['A1+', 'A1-', 'B1+']);
    g2.open(); await asr;
    await until(() => log.includes('A2+'));
    g3.open(); await v2;
    expect(log).toEqual(['A1+', 'A1-', 'B1+', 'B1-', 'A2+', 'A2-']);
    // each family switch made the other engines let go first
    expect(unloads).toEqual([[null, 'VIDEO'], ['VIDEO', 'ASR'], ['ASR', 'VIDEO']]);
    expect(await db().select().from(schema.resourceLeases).where(eq(schema.resourceLeases.resource, resource))).toEqual([]);
  }, 30_000);

  it('the same family shares the card across processes when nobody else is waiting', async () => {
    const resource = fresh();
    const { a, b } = pair(resource);
    let together = 0; let max = 0;
    const g = latch();
    const job = () => async () => { together++; max = Math.max(max, together); await g.p; together--; };
    const x = a('IMAGE', 9000, job()); const y = b('IMAGE', 9000, job());
    await until(() => max === 2);
    g.open(); await Promise.all([x, y]);
    expect(max).toBe(2);
  }, 30_000);

  it('a process that died holding the card does not block it: its row expires and the next request is admitted', async () => {
    const resource = fresh();
    const { b, unloads } = pair(resource);
    const past = new Date(Date.now() - 60_000).toISOString();
    await db().insert(schema.resourceLeases).values({ resource, holder: 'dead-process:1', family: 'IMAGE', state: 'HOLDING', process: 'dead-process', requestedAt: past, grantedAt: past, expiresAt: past });
    await db().insert(schema.resourceState).values({ resource, loadedFamily: 'IMAGE', updatedAt: past });
    const r = await b('TTS', 6000, async () => 'spoke');
    expect(r).toBe('spoke');
    expect(unloads).toEqual([['IMAGE', 'TTS']]);
  }, 30_000);

  it('a request nested in a job that holds the card is admitted at once (no deadlock behind its own waiters)', async () => {
    const resource = fresh();
    const { a, b } = pair(resource);
    const order: string[] = [];
    const g = latch();
    const take = a('VIDEO', 28000, async () => {
      order.push('video');
      // another job queues for ASR while the take holds the card
      const other = b('ASR', 4000, async () => { order.push('other-asr'); }, { jobId: 'job-other' });
      await new Promise((r) => setTimeout(r, 100));
      // the take transcribes its own clip (nested ASR) — admitted although job-other waits ahead of it
      await a('ASR', 4000, async () => { order.push('own-asr'); }, { jobId: 'job-take' });
      g.open();
      return { other };
    }, { jobId: 'job-take' });
    const { other } = await take;
    await g.p; await other;
    expect(order).toEqual(['video', 'own-asr', 'other-asr']);
  }, 30_000);

  it('a request abandoned while waiting (its job stopped) leaves the queue', async () => {
    const resource = fresh();
    const { a, b } = pair(resource);
    const g = latch();
    const holding = a('MUSIC', 20000, () => g.p);
    await until(() => true);
    await new Promise((r) => setTimeout(r, 50));
    const ctrl = new AbortController();
    const waiting = b('TTS', 6000, async () => 'never', { signal: ctrl.signal }).then(() => 'ran', (e: unknown) => e);
    await new Promise((r) => setTimeout(r, 100));
    ctrl.abort(new Error('job cancelled'));
    expect(await waiting).toMatchObject({ message: 'job cancelled' });
    const rows = await db().select().from(schema.resourceLeases).where(eq(schema.resourceLeases.resource, resource));
    expect(rows.map((r) => r.family)).toEqual(['MUSIC']);
    g.open(); await holding;
  }, 30_000);
});
