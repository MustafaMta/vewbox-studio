import { afterAll, describe, expect, it } from 'vitest';
import { command, commands, readState } from '@/server/studio/engine';
import { cutInputsHash } from '@/domain/cut';

/** STALE DERIVATIVES (docs/BACKEND-AUDIT-2026-10.md M2, step 12), stored: the flag survives the database round trip
 *  that every page reads (GET /api/studio is this state), set by a re-selection, cleared by a current cut. */

const tag = Math.random().toString(36).slice(2, 8);
const made: string[] = [];
afterAll(async () => { await commands(made.map((id) => ({ name: 'deleteProduction' as const, args: [id] as [string] }))).catch(() => undefined); });

describe('cut_stale in the database (step 12)', () => {
  it('a re-selected take marks the stored cut stale; ASSEMBLE\'s current cut clears it; a cut rendered from older inputs stays stale', async () => {
    const assetId = `up-stale-${tag}`;
    const [, prod] = await commands([
      { name: 'addAsset', args: [{ id: assetId, kind: 'VIDEO', src: `/api/media/${assetId}`, label: 'v', tags: [], sample: false, origin: 'UPLOAD', provenance: { path: `video/2026/10/${assetId}.mp4` } }] },
      { name: 'addProduction', args: [{ kind: 'SHORT', title: `Stale ${tag}`, style: 'ANIME', language: 'EN', aspect: 'WIDE_16_9', targetSeconds: 10, brief: { mode: 'MANUAL', text: 'x' }, castIds: [], locationIds: [] }] },
    ]) as [unknown, { production: { id: string } }];
    const id = prod.production.id; made.push(id);
    const { scene } = await command('addScene', [id, { title: 'S', timeOfDay: 'DAWN' }]);
    const { shot } = await command('addShot', [id, { sceneId: scene.id, purpose: '', action: '', framing: 'WIDE', cameraMove: 'STATIC', durationSeconds: 4, characterIds: [], dialogue: [], transition: 'CUT' }]);
    const t1 = (await command('addTake', [id, shot.id, { assetId, provider: 'MINIMAX' }])).take;
    const t2 = (await command('addTake', [id, shot.id, { assetId, provider: 'MINIMAX' }])).take;
    await command('selectTake', [id, shot.id, t1.id]);
    const p = async () => (await readState()).state.productions.find((x) => x.id === id)!;
    await command('setCut', [id, assetId, { inputs: cutInputsHash(await p()) }]);
    expect((await p()).cutStale).toBeUndefined();
    const renderedFrom = cutInputsHash(await p());
    await command('selectTake', [id, shot.id, t2.id]);
    expect((await p()).cutStale).toBe(true);
    // a cut rendered before the re-selection is recorded: still stale
    await command('setCut', [id, assetId, { inputs: renderedFrom }]);
    expect((await p()).cutStale).toBe(true);
    await command('setCut', [id, assetId, { inputs: cutInputsHash(await p()) }]);
    expect((await p()).cutStale).toBeUndefined();
  });
});
