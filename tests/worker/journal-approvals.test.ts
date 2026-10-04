import { afterAll, describe, expect, it } from 'vitest';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/server/db/client';
import { applyCommands, command, commands, readState } from '@/server/studio/engine';
import { readLog, replayLog } from '@/server/studio/journal';
import { recordApproval } from '@/server/org/runs';
import { requireApproval } from '@/server/org/gates';
import { approvalSubjectHash } from '@/domain/approvals';
import { hashState } from '@/domain/hash';
import type { Command } from '@/domain/commands';

/** THE COMMAND JOURNAL AND BOUND APPROVALS (docs/BACKEND-AUDIT-2026-10.md H9, H10, step 9), on the test database. */

const productions: string[] = [];
afterAll(async () => { if (productions.length) await commands(productions.map((id) => ({ name: 'deleteProduction' as const, args: [id] as [string] }))).catch(() => undefined); });
const at = () => new Date().toISOString();
const seed = () => `t-${Math.random().toString(36).slice(2, 12)}`;
// the test database outlives a run: every sender of this run is new
const run = Math.random().toString(36).slice(2, 8);
const client = (name: string) => `${name}-${run}`;

async function production(title: string) {
  const [r] = await commands([{ name: 'addProduction', args: [{ kind: 'SHORT', title, style: 'ANIME', language: 'EN', aspect: 'WIDE_16_9', targetSeconds: 10, brief: { mode: 'MANUAL', text: 'x' }, castIds: [], locationIds: [] }] }]) as [{ production: { id: string } }];
  productions.push(r.production.id);
  return r.production.id;
}

describe('the command journal (audit H10, step 9)', () => {
  it('a batch sent again with its id is answered from the journal and applied once', async () => {
    const productionId = await production('Journal replay');
    const batch = [{ name: 'addScene', args: [productionId, { title: 'Once', timeOfDay: 'MORNING' }], seed: seed(), at: at() }] as unknown as Command[];
    const first = await applyCommands(batch, client('client-journal'), { batchId: 'batch-1' });
    expect(first.ok).toBe(true); expect(first.replayed).toBeUndefined();
    // the page lost the answer and sends the same batch again
    const again = await applyCommands(batch, client('client-journal'), { batchId: 'batch-1' });
    expect(again).toMatchObject({ ok: true, replayed: true, version: first.version, hash: first.hash });
    const scenes = (await readState()).state.productions.find((p) => p.id === productionId)!.scenes;
    expect(scenes.map((s) => s.title)).toEqual(['Once']);
    // another sender may use the same batch id; the same sender may not reuse it for other commands
    expect((await applyCommands([{ ...batch[0], seed: seed() }], client('client-journal-2'), { batchId: 'batch-1' })).ok).toBe(true);
    await expect(applyCommands([{ ...batch[0], seed: seed() }], client('client-journal'), { batchId: 'batch-1' })).rejects.toMatchObject({ code: 'CONFLICT' });
    // without a batch id, the identical batch (same seeds) is the same batch
    const unnamed = [{ name: 'addScene', args: [productionId, { title: 'Unnamed', timeOfDay: 'NIGHT' }], seed: seed(), at: at() }] as unknown as Command[];
    await applyCommands(unnamed, client('client-journal'));
    expect((await applyCommands(unnamed, client('client-journal'))).replayed).toBe(true);
    const rows = await db().select().from(schema.commandLog).where(eq(schema.commandLog.clientId, client('client-journal')));
    expect(rows.filter((r) => r.ok).map((r) => r.batchId)).toContain('batch-1');
  });

  it('a refused batch is journaled as refused and may be sent again (it is evaluated again)', async () => {
    const bad: Command[] = [{ name: 'updateScene', args: ['production-missing', 'scene-missing', { title: 'x' }], seed: seed(), at: at() } as Command];
    const r1 = await applyCommands(bad, client('client-refused'), { batchId: 'refused-1' });
    expect(r1.ok).toBe(false);
    const r2 = await applyCommands(bad, client('client-refused'), { batchId: 'refused-1' });
    expect(r2.ok).toBe(false); expect(r2.replayed).toBeUndefined();
    const rows = await db().select().from(schema.commandLog).where(eq(schema.commandLog.clientId, client('client-refused')));
    expect(rows.map((r) => r.ok)).toEqual([false, false]);
  });

  it('replaying the journal from a state reproduces the studio that the batches made', async () => {
    const [last] = await db().select({ id: schema.commandLog.id }).from(schema.commandLog).orderBy(desc(schema.commandLog.id)).limit(1);
    const start = (await readState()).state;
    const productionId = await production('Journal audit');
    const { scene } = await command('addScene', [productionId, { title: 'A', timeOfDay: 'MORNING' }]);
    await applyCommands([{ name: 'updateScene', args: [productionId, scene.id, { title: 'A, rewritten' }], seed: seed(), at: at() } as Command], client('client-audit'), { batchId: 'audit-1' });
    await applyCommands([{ name: 'updateScene', args: [productionId, scene.id, { title: 'never' }], seed: seed(), at: at() } as Command, { name: 'deleteShot', args: ['nope', 'nope'], seed: seed(), at: at() } as Command], client('client-audit'), { batchId: 'audit-2' });
    const entries = await readLog({ afterId: last?.id ?? 0 });
    expect(entries.map((e) => [e.origin, e.ok])).toEqual([['server', true], ['server', true], [client('client-audit'), true], [client('client-audit'), false]]);
    // the same studio — timestamps compared as instants (the database writes them in its own format)
    const instants = (s: unknown) => JSON.parse(JSON.stringify(s), (_k, v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d/.test(v) ? new Date(v.replace(' ', 'T').replace(/\+00$/, 'Z')).toISOString() : v));
    expect(hashState(instants(replayLog(start, entries)))).toBe(hashState(instants((await readState()).state)));
  });
});

describe('bound approvals (audit H9, step 9)', () => {
  const approve = async (productionId: string, stage: 'STORY' | 'EDIT', withHash = true) => {
    const p = (await readState()).state.productions.find((x) => x.id === productionId)!;
    return recordApproval({ productionId, stage, subjectKind: 'STAGE', subjectId: stage, decision: 'APPROVED', by: 'test', ...(withHash ? { subjectHash: approvalSubjectHash(p, stage) } : {}) });
  };

  it('the story gate opens for the story the producer approved, and closes when a scene changes; the script does not', async () => {
    const productionId = await production('Bound story');
    const { scene } = await command('addScene', [productionId, { title: 'The harbour', timeOfDay: 'NIGHT', purpose: 'they meet' }]);
    await expect(requireApproval(productionId, 'STORY')).rejects.toThrow(/needs your approval/);
    await approve(productionId, 'STORY');
    await requireApproval(productionId, 'STORY');
    // the script is written after the approval: beats and lines are not the story
    await command('updateScene', [productionId, scene.id, { beats: [{ id: 'b1', action: 'She waits.', lines: [{ id: 'l1', characterId: 'c', text: 'Late again.' }] }], characterIds: ['c'] }]);
    await requireApproval(productionId, 'STORY');
    // the story itself changes: the gate closes until the producer approves it again
    await command('updateScene', [productionId, scene.id, { purpose: 'they part' }]);
    await expect(requireApproval(productionId, 'STORY')).rejects.toMatchObject({ code: 'INVALID', details: { reason: 'CHANGED' } });
    await approve(productionId, 'STORY');
    await requireApproval(productionId, 'STORY');
  });

  it('the cut gate closes when another take is chosen; an approval recorded before step 9 is honoured', async () => {
    const productionId = await production('Bound cut');
    await approve(productionId, 'EDIT');
    await requireApproval(productionId, 'EDIT');
    const { scene } = await command('addScene', [productionId, { title: 'S', timeOfDay: 'MORNING' }]);
    await command('addShot', [productionId, { sceneId: scene.id, purpose: '', action: '', framing: 'WIDE', cameraMove: 'STATIC', durationSeconds: 4, characterIds: [], dialogue: [], transition: 'CUT' }]);
    await expect(requireApproval(productionId, 'EDIT')).rejects.toThrow(/cut changed after you approved it/);
    // legacy approval (no subject hash) — accepted as it was
    await approve(productionId, 'EDIT', false);
    await requireApproval(productionId, 'EDIT');
    // what is not the cut (the production's title) does not reopen the gate
    await approve(productionId, 'EDIT');
    await command('updateProduction', [productionId, { title: 'Bound cut (renamed)' }]);
    await requireApproval(productionId, 'EDIT');
  });
});
