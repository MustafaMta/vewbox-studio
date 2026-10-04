import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/server/db/client';
import { command, commands, readState } from '@/server/studio/engine';
import { listDeleted, restoreDeleted } from '@/server/studio/tombstones';
import type { Scene } from '@/domain/types';

/** NO MORE CASCADING TAKE LOSS (docs/BACKEND-AUDIT-2026-10.md C4, step 10 — the producer's rule: a failed or
 *  replaced story step never destroys generated work). On the test database: removing a scene, a shot, a take or a
 *  production tombstones the rows (media rows untouched) and they come back by restore; replacing the script keeps
 *  scene and shot ids by match; the foreign keys refuse a cascade outright. */

const tag = Math.random().toString(36).slice(2, 8);
const assetIds: string[] = [];
const productions: string[] = [];
let characterId = '';

beforeAll(async () => {
  const [c] = await commands([{ name: 'addCharacter', args: [{ name: `Tomb ${tag}`, style: 'ANIME', sex: 'FEMALE', ageYears: 30, language: 'EN', role: '', build: '', face: '', hair: '', skin: '', eyes: '', wardrobe: '', personality: '', distinguishing: [] }] }]) as [{ character: { id: string } }];
  characterId = c.character.id;
});
afterAll(async () => {
  // the test database is purged the way a reset purges it: takes first (RESTRICT)
  if (productions.length) {
    await db().delete(schema.takes).where(inArray(schema.takes.productionId, productions));
    await db().delete(schema.shots).where(inArray(schema.shots.productionId, productions));
    await db().delete(schema.scenes).where(inArray(schema.scenes.productionId, productions));
    await db().delete(schema.productions).where(inArray(schema.productions.id, productions));
  }
  await commands([{ name: 'deleteCharacter', args: [characterId] }, ...assetIds.map((id) => ({ name: 'deleteAsset' as const, args: [id] as [string] }))]).catch(() => undefined);
});

/** A production with one scene, one shot (with the character in it) and one take. */
async function filmed(title: string) {
  const assetId = `up-tomb-${Math.random().toString(36).slice(2, 10)}`; assetIds.push(assetId);
  const [, prod] = await commands([
    { name: 'addAsset', args: [{ id: assetId, kind: 'VIDEO', src: `/api/media/${assetId}`, label: 'take', tags: [], sample: false, origin: 'GENERATED', provenance: { path: `video/2026/10/${assetId}.mp4` } }] },
    { name: 'addProduction', args: [{ kind: 'SHORT', title, style: 'ANIME', language: 'EN', aspect: 'WIDE_16_9', targetSeconds: 10, brief: { mode: 'MANUAL', text: 'x' }, castIds: [characterId], locationIds: [] }] },
  ]) as [unknown, { production: { id: string } }];
  const productionId = prod.production.id; productions.push(productionId);
  const { scene } = await command('addScene', [productionId, { title: 'The harbour', timeOfDay: 'NIGHT' }]);
  const { shot } = await command('addShot', [productionId, { sceneId: scene.id, purpose: 'arrival', action: '', framing: 'WIDE', cameraMove: 'STATIC', durationSeconds: 5, characterIds: [characterId], dialogue: [], transition: 'CUT' }]);
  const { take } = await command('addTake', [productionId, shot.id, { assetId, provider: 'MINIMAX', label: 'Take 1' }]);
  await command('selectTake', [productionId, shot.id, take.id]);
  return { productionId, sceneId: scene.id, shotId: shot.id, takeId: take.id, assetId };
}
const prod = async (id: string) => (await readState()).state.productions.find((p) => p.id === id);
const takeRow = async (id: string) => (await db().select().from(schema.takes).where(eq(schema.takes.id, id)))[0];

describe('tombstones, not deletes (audit C4, step 10)', () => {
  it('deleting a scene tombstones its shots and takes (media rows kept); restoring the scene brings them all back by id', async () => {
    const f = await filmed(`Scene loss ${tag}`);
    await command('deleteScene', [f.productionId, f.sceneId]);
    expect((await prod(f.productionId))!.scenes).toEqual([]);
    const t = await takeRow(f.takeId);
    expect(t.deletedAt).toBeTruthy(); expect(t.deletedBy).toMatch(/deleteScene/);
    expect((await readState()).state.assets.some((a) => a.id === f.assetId)).toBe(true);
    const listed = await listDeleted({ productionId: f.productionId });
    expect(listed.find((x) => x.kind === 'scene' && x.id === f.sceneId)).toMatchObject({ takes: 1 });
    const r = await restoreDeleted('scene', f.sceneId);
    expect(r.restored).toMatchObject({ scenes: [f.sceneId], shots: [f.shotId], takes: [f.takeId] });
    const p = (await prod(f.productionId))!;
    expect(p.scenes.map((s) => s.id)).toEqual([f.sceneId]);
    expect(p.shots[0]).toMatchObject({ id: f.shotId, selectedTakeId: f.takeId });
    expect(p.shots[0].takes.map((x) => x.id)).toEqual([f.takeId]);
  });

  it('a removed take is tombstoned (its character keeps the usage record) and comes back with its usage', async () => {
    const f = await filmed(`Take loss ${tag}`);
    await command('removeTake', [f.productionId, f.shotId, f.takeId]);
    expect((await prod(f.productionId))!.shots[0].takes).toEqual([]);
    const usage = async () => (await db().select().from(schema.characterUsage).where(eq(schema.characterUsage.takeId, f.takeId)))[0]?.status;
    expect(await usage()).toBe('TAKE_REMOVED');
    await restoreDeleted('take', f.takeId);
    expect((await prod(f.productionId))!.shots[0].takes.map((t) => t.id)).toEqual([f.takeId]);
    expect(await usage()).toBe('IN_TAKE');
    await expect(restoreDeleted('take', f.takeId)).rejects.toMatchObject({ code: 'INVALID' });
  });

  it('deleting a production keeps every take recoverable; restoring it restores what that deletion removed', async () => {
    const f = await filmed(`Production loss ${tag}`);
    await command('deleteProduction', [f.productionId]);
    expect(await prod(f.productionId)).toBeUndefined();
    expect((await takeRow(f.takeId)).deletedAt).toBeTruthy();
    const r = await restoreDeleted('production', f.productionId);
    expect(r.restored).toMatchObject({ productions: [f.productionId], scenes: [f.sceneId], shots: [f.shotId], takes: [f.takeId] });
    expect((await prod(f.productionId))!.shots[0].takes[0].id).toBe(f.takeId);
  });

  it('re-running story development (replaceScript) keeps the matched scenes\' ids, so their shots and takes stay live', async () => {
    const f = await filmed(`Story rerun ${tag}`);
    const developed: Array<Omit<Scene, 'number'>> = [
      { id: 'scene-new-random-1', title: 'The Harbour', timeOfDay: 'DUSK', characterIds: [characterId], beats: [] },
      { id: 'scene-new-random-2', title: 'The lighthouse', timeOfDay: 'NIGHT', characterIds: [], beats: [] },
    ];
    await command('replaceScript', [f.productionId, developed, { keepWritten: true }]);
    const p = (await prod(f.productionId))!;
    expect(p.scenes.map((s) => [s.id, s.timeOfDay])).toEqual([[f.sceneId, 'DUSK'], ['scene-new-random-2', 'NIGHT']]);
    expect(p.shots[0]).toMatchObject({ id: f.shotId, sceneId: f.sceneId, selectedTakeId: f.takeId });
    expect((await takeRow(f.takeId)).deletedAt).toBeNull();
    // a script the producer already wrote lines into is not replaced by a re-run
    await command('updateScene', [f.productionId, f.sceneId, { beats: [{ id: 'b', action: 'x', lines: [{ id: 'l', characterId, text: 'Hello.' }] }] }]);
    await expect(command('replaceScript', [f.productionId, [{ title: 'Something else', timeOfDay: 'DAWN', characterIds: [], beats: [] }], { keepWritten: true }])).rejects.toMatchObject({ code: 'CONFLICT', details: { reason: 'SCRIPT_WRITTEN' } });
  });

  it('a script that drops a scene tombstones its shots and takes — restorable', async () => {
    const f = await filmed(`Story dropped ${tag}`);
    // the new script has nothing in common with the old one but its place is taken: matched by position. A script
    // with fewer scenes than places drops one — two scenes first, then a script of one unrelated scene
    const { scene: second } = await command('addScene', [f.productionId, { title: 'Second', timeOfDay: 'DAWN' }]);
    const { shot } = await command('addShot', [f.productionId, { sceneId: second.id, purpose: '', action: '', framing: 'WIDE', cameraMove: 'STATIC', durationSeconds: 4, characterIds: [], dialogue: [], transition: 'CUT' }]);
    const { take } = await command('addTake', [f.productionId, shot.id, { assetId: f.assetId, provider: 'MINIMAX' }]);
    await command('replaceScript', [f.productionId, [{ title: 'The harbour', timeOfDay: 'NIGHT', characterIds: [], beats: [] }]]);
    expect((await prod(f.productionId))!.scenes.map((s) => s.id)).toEqual([f.sceneId]);
    expect((await takeRow(take.id)).deletedAt).toBeTruthy();
    await restoreDeleted('scene', second.id);
    expect((await prod(f.productionId))!.shots.find((s) => s.id === shot.id)!.takes.map((t) => t.id)).toEqual([take.id]);
  });

  it('the database refuses to cascade: a shot with takes cannot be deleted from under them', async () => {
    const f = await filmed(`Restrict ${tag}`);
    const err = await db().delete(schema.shots).where(eq(schema.shots.id, f.shotId)).then(() => null, (e: unknown) => e as { code?: string; cause?: { code?: string } });
    expect(err?.code ?? err?.cause?.code).toBe('23503');
    expect(await takeRow(f.takeId)).toBeTruthy();
  });
});
