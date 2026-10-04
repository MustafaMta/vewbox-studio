import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/server/db/client';
import { applyCommands, readState } from '@/server/studio/engine';
import { replaceStudio } from '@/server/studio/seed';
import { forgetReadModel, readModel } from '@/server/studio/readmodel';
import type { Command } from '@/domain/commands';
import type { StudioState } from '@/domain/types';

/** READS NEVER SEE A HALF-APPLIED WRITE (docs/BACKEND-AUDIT-2026-10.md H2, step 13c), on the test database. A batch
 *  that changes a production AND a character commits both or neither; a reader running at the same time sees both
 *  changes or neither — never the shot's new note beside the character's old one. And a studio read once per version
 *  is served again without reading the tables, each caller with its own copy. */

const run = Math.random().toString(36).slice(2, 8);
const prior = process.env.STUDIO_STORE;
beforeAll(async () => { process.env.STUDIO_STORE = 'v2'; await replaceStudio('sample'); });
afterAll(async () => { process.env.STUDIO_STORE = prior; await replaceStudio('empty'); });

const pair = (s: StudioState) => [s.productions.find((p) => p.id === 's1e1')!.shots.find((x) => x.id === 's1e1-2')!.notes ?? null, s.characters.find((c) => c.id === 'hana')!.notes ?? null];

describe('consistent reads (step 13c)', () => {
  it('a reader running beside a writer sees each two-aggregate batch whole or not at all', async () => {
    const N = 60;
    let writing = true; let reads = 0; const torn: unknown[] = [];
    const writer = (async () => {
      for (let k = 1; k <= N; k++) {
        const at = new Date().toISOString();
        const r = await applyCommands([
          { name: 'updateShot', args: ['s1e1', 's1e1-2', { notes: `batch ${k}` }], seed: `cr-${run}-${k}-a`, at },
          { name: 'updateCharacter', args: ['hana', { notes: `batch ${k}` }], seed: `cr-${run}-${k}-b`, at },
        ] as unknown as Command[], `consistent-${run}`, { batchId: `cr-${k}` });
        expect(r.ok).toBe(true);
      }
      writing = false;
    })();
    const reader = (async () => {
      while (writing) {
        forgetReadModel(); // every read goes to the tables
        const [shot, character] = pair((await readState()).state);
        reads++;
        if (shot !== character && !(shot === null && character === null)) torn.push({ shot, character });
      }
    })();
    await Promise.all([writer, reader]);
    expect(torn).toEqual([]);
    expect(reads).toBeGreaterThan(10);
    expect(pair((await readState()).state)).toEqual([`batch ${N}`, `batch ${N}`]);
  });

  it('why: the whole read is one repeatable-read snapshot — a batch committing between two of its queries is not seen by the second (as it was by the old reads, one connection per table)', async () => {
    const write = (k: string) => applyCommands([{ name: 'updateCharacter', args: ['hana', { notes: k }], seed: `cr-${run}-${k}`, at: new Date().toISOString() } as unknown as Command], `consistent-${run}`, { batchId: k });
    await write('before');
    const seen = async (iso?: 'repeatable read') => db().transaction(async (tx) => {
      const first = (await tx.select({ notes: schema.characters.notes }).from(schema.characters).where(eq(schema.characters.id, 'hana')))[0].notes;
      await write(`between ${iso ?? 'read committed'}`); // another connection commits here
      const second = (await tx.select({ notes: schema.characters.notes }).from(schema.characters).where(eq(schema.characters.id, 'hana')))[0].notes;
      return [first, second];
    }, iso ? { isolationLevel: iso, accessMode: 'read only' } : undefined);
    const [a, b] = await seen('repeatable read');
    expect(b).toBe(a);
    const [c, d] = await seen();
    expect(d).not.toBe(c);
  });

  it('a studio read at a version is served again while the version stands — a fresh copy for every caller', async () => {
    forgetReadModel();
    const a = await readState();
    const model = readModel();
    expect(model?.fromDatabase).toBe(true);
    const b = await readState();
    expect(readModel()).toBe(model); // not read again
    expect(b.version).toBe(a.version);
    expect(b.hash).toBe(a.hash);
    // copies: a caller that changes what it read changes nobody else's
    a.state.productions[0].title = 'changed by a careless reader';
    expect((await readState()).state.productions[0].title).not.toBe('changed by a careless reader');
    // the snapshot route reads it shared (it only serialises it)
    expect((await readState({ shared: true })).state).toBe(model!.state);
    // a write moves the version: the next read is a new database read, never the batch's own assembled result
    await applyCommands([{ name: 'updateShot', args: ['s1e1', 's1e1-2', { notes: 'after' }], seed: `cr-${run}-after`, at: new Date().toISOString() } as unknown as Command], `consistent-${run}`, { batchId: 'after' });
    expect(readModel()?.fromDatabase).toBeFalsy();
    const c = await readState();
    expect(c.version).toBe(a.version + 1);
    expect(readModel()?.fromDatabase).toBe(true);
    expect(pair(c.state)[0]).toBe('after');
  });
});
