import { afterAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/server/db/client';
import { createDbGpuLease, type GpuFamily } from '@/server/gpu/lease';

/** FAMILY SWITCHES ON THE CARD (incident 2026-10-06 12:41–12:48Z), on the real database:
 *  - a job holding LLM that asks for IMAGE: the LLM engines unload BEFORE the IMAGE work runs, the nested row is an
 *    IMAGE holder, and when the IMAGE work ends the card switches back to LLM (IMAGE engines unload, state LLM);
 *  - a grant across a family change is SWITCHING until its unloads finish: nobody — not even a request of the same
 *    family — is admitted meanwhile (the 12:42:06Z overlap). Each test has its own resource name. */

const resources: string[] = [];
const fresh = () => { const r = `gpu-switch-${Math.random().toString(36).slice(2, 8)}`; resources.push(r); return r; };
const latch = () => { let open!: () => void; const p = new Promise<void>((r) => { open = r; }); return { p, open }; };
const until = async (cond: () => boolean, ms = 8000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('timed out waiting'); await new Promise((r) => setTimeout(r, 10)); } };
const rowsOf = (resource: string) => db().select().from(schema.resourceLeases).where(eq(schema.resourceLeases.resource, resource));
const loaded = async (resource: string) => (await db().select().from(schema.resourceState).where(eq(schema.resourceState.resource, resource)))[0]?.loadedFamily;
afterAll(async () => { if (resources.length) { await db().delete(schema.resourceLeases).where(inArray(schema.resourceLeases.resource, resources)); await db().delete(schema.resourceState).where(inArray(schema.resourceState.resource, resources)); } });

describe('GPU family switches', () => {
  it('a job holding LLM that requests IMAGE: LLM unloads before the IMAGE work, the row records IMAGE, and the card switches back to LLM after', async () => {
    const r = fresh();
    const log: string[] = [];
    const lease = createDbGpuLease({ process: `p-${r}`, resource: r, pollMs: 15, unload: async (from, to) => { log.push(`unload ${from}->${to}`); } });
    const J = `job-${r}`;
    let during: { rows: Array<{ family: string; state: string }>; loaded?: string | null } | undefined;
    await lease('LLM', 1, async () => {
      log.push('LLM work');
      await lease('IMAGE', 1, async () => {
        log.push('IMAGE work');
        during = { rows: (await rowsOf(r)).map((x) => ({ family: x.family, state: x.state })).sort((a, b) => a.family.localeCompare(b.family)), loaded: await loaded(r) };
      }, { jobId: J });
      log.push('LLM work again');
      expect(await loaded(r)).toBe('LLM');
    }, { jobId: J });
    expect(log).toEqual(['unload null->LLM', 'LLM work', 'unload LLM->IMAGE', 'IMAGE work', 'unload IMAGE->LLM', 'LLM work again']);
    expect(during).toEqual({ rows: [{ family: 'IMAGE', state: 'HOLDING' }, { family: 'LLM', state: 'HOLDING' }], loaded: 'IMAGE' });
    expect(await rowsOf(r)).toEqual([]);
  });

  it('a grant across a family change is SWITCHING until its unloads finish: a second request of the same family waits for them', async () => {
    const r = fresh();
    const log: string[] = [];
    const gate = latch();
    const slowUnload = async (from: GpuFamily | null, to: GpuFamily) => { log.push(`unload ${from}->${to} start`); if (to === 'IMAGE') await gate.p; log.push(`unload ${from}->${to} done`); };
    const a = createDbGpuLease({ process: `a-${r}`, resource: r, pollMs: 15, unload: slowUnload });
    const b = createDbGpuLease({ process: `b-${r}`, resource: r, pollMs: 15, unload: slowUnload });
    await a('LLM', 1, async () => { log.push('LLM work'); });
    const w1 = latch();
    const first = a('IMAGE', 1, async () => { log.push('A IMAGE work'); await w1.p; });
    await until(() => log.includes('unload LLM->IMAGE start'));
    const second = b('IMAGE', 1, async () => { log.push('B IMAGE work'); });
    await new Promise((x) => setTimeout(x, 300));
    expect(log.includes('B IMAGE work')).toBe(false);
    expect((await rowsOf(r)).map((x) => [x.family, x.state]).sort()).toEqual([['IMAGE', 'SWITCHING'], ['IMAGE', 'WAITING']]);
    gate.open();
    await until(() => log.includes('B IMAGE work'));
    w1.open(); await first; await second;
    const iDone = log.indexOf('unload LLM->IMAGE done');
    expect(iDone).toBeGreaterThan(-1);
    expect(log.indexOf('A IMAGE work')).toBeGreaterThan(iDone);
    expect(log.indexOf('B IMAGE work')).toBeGreaterThan(iDone);
    expect(log.filter((l) => l.startsWith('unload') && l.endsWith('start'))).toEqual(['unload null->LLM start', 'unload LLM->IMAGE start']); // B shared: no second switch
  });

  it('another family never enters while a switch is in progress', async () => {
    const r = fresh();
    const gate = latch(); const log: string[] = [];
    const unload = async (_f: GpuFamily | null, to: GpuFamily) => { if (to === 'IMAGE') await gate.p; };
    const a = createDbGpuLease({ process: `a-${r}`, resource: r, pollMs: 15, unload });
    const b = createDbGpuLease({ process: `b-${r}`, resource: r, pollMs: 15, unload });
    await a('LLM', 1, async () => {});
    const first = a('IMAGE', 1, async () => { log.push('IMAGE'); });
    await until(() => true);
    await new Promise((x) => setTimeout(x, 100));
    const second = b('ASR', 1, async () => { log.push('ASR'); });
    await new Promise((x) => setTimeout(x, 300));
    expect(log).toEqual([]);
    expect((await db().select().from(schema.resourceLeases).where(and(eq(schema.resourceLeases.resource, r), eq(schema.resourceLeases.family, 'ASR'))))[0]?.state).toBe('WAITING');
    gate.open(); await first; await second;
    expect(log).toEqual(['IMAGE', 'ASR']);
  });
});
