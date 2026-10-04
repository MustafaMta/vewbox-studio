import { afterAll, describe, expect, it } from 'vitest';
import { command, commands, readState } from '@/server/studio/engine';

/** THE STALE CHAIN, STORED (gap V3): the mark a re-selection puts on a continuation take survives the database round
 *  trip every page reads (GET /api/studio is this state), and is cleared by the next whole choice. Runs on the test
 *  database only (vitest.worker.config.ts). */

const tag = Math.random().toString(36).slice(2, 8);
const made: string[] = [];
afterAll(async () => { await commands(made.map((id) => ({ name: 'deleteProduction' as const, args: [id] as [string] }))).catch(() => undefined); });

describe('takes.stale in the database', () => {
  it('re-selecting the predecessor stores the mark on the continuation; re-selecting the original clears it; a fresh continuation of the new choice is whole', async () => {
    const assetId = `up-chain-${tag}`;
    const [, prod] = await commands([
      { name: 'addAsset', args: [{ id: assetId, kind: 'VIDEO', src: `/api/media/${assetId}`, label: 'v', tags: [], sample: false, origin: 'UPLOAD', durationSeconds: 5.17, provenance: { path: `video/2026/10/${assetId}.mp4` } }] },
      { name: 'addProduction', args: [{ kind: 'SHORT', title: `Chain ${tag}`, style: 'ANIME', language: 'EN', aspect: 'WIDE_16_9', targetSeconds: 10, brief: { mode: 'MANUAL', text: 'x' }, castIds: [], locationIds: [] }] },
    ]) as [unknown, { production: { id: string } }];
    const id = prod.production.id; made.push(id);
    const { scene } = await command('addScene', [id, { title: 'S', timeOfDay: 'DAWN' }]);
    const shotInput = { sceneId: scene.id, purpose: '', action: '', framing: 'MEDIUM' as const, cameraMove: 'STATIC' as const, durationSeconds: 5, characterIds: [] as string[], dialogue: [], transition: 'CUT' as const };
    const { shot: a } = await command('addShot', [id, shotInput]);
    const staging = { beats: [{ at: 0, action: 'She waits.' }, { at: 2.5, action: 'He turns.', cut: { camera: 'reverse' } }], pace: 'NORMAL' as const, extras: [{ description: 'two shoppers', count: 2 }], actions: ['waits', 'turns'] };
    const { shot: b } = await command('addShot', [id, { ...shotInput, boundary: 'continuous', staging, continuity: { version: 1, characters: [], props: [], environment: {}, camera: {}, relationToPrevious: 'CONTINUATION' } }]);
    // the boundary (shots.boundary) and the staging (shots.staging) survive the round trip too
    const stored = (await readState()).state.productions.find((x) => x.id === id)!.shots;
    expect(stored.map((s) => s.boundary)).toEqual([undefined, 'continuous']);
    expect(stored[1].staging).toEqual(staging);
    const a1 = (await command('addTake', [id, a.id, { assetId, provider: 'MINIMAX' }])).take;
    const a2 = (await command('addTake', [id, a.id, { assetId, provider: 'MINIMAX' }])).take;
    await command('selectTake', [id, a.id, a1.id]);
    const b1 = (await command('addTake', [id, b.id, { assetId, provider: 'MINIMAX', relation: 'CONTINUATION', continuesTakeId: a1.id, trimStartFrames: 22, select: 'ALWAYS' }])).take;
    const p = async () => (await readState()).state.productions.find((x) => x.id === id)!;
    const takeB = async (takeId: string) => (await p()).shots.find((s) => s.id === b.id)!.takes.find((t) => t.id === takeId)!;
    expect((await takeB(b1.id)).stale).toBeUndefined();
    await command('selectTake', [id, a.id, a2.id]);
    expect((await takeB(b1.id)).stale).toMatchObject({ because: 'PREDECESSOR_RESELECTED', previousShotId: a.id, expectedTakeId: a2.id, since: expect.stringMatching(/^\d{4}-/) });
    await command('selectTake', [id, a.id, a1.id]);
    expect((await takeB(b1.id)).stale).toBeUndefined();
    await command('selectTake', [id, a.id, a2.id]);
    const b2 = (await command('addTake', [id, b.id, { assetId, provider: 'MINIMAX', relation: 'CONTINUATION', continuesTakeId: a2.id, trimStartFrames: 22, select: 'ALWAYS' }])).take;
    expect((await p()).shots.find((s) => s.id === b.id)!.selectedTakeId).toBe(b2.id);
    expect((await takeB(b2.id)).stale).toBeUndefined();
    expect((await takeB(b1.id)).stale).toMatchObject({ expectedTakeId: a2.id });
  });
});
