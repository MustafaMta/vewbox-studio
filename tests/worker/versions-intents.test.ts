import { afterAll, describe, expect, it } from 'vitest';
import { command, commands, readState } from '@/server/studio/engine';

/** AGGREGATE VERSIONS AND INTENT COMMANDS (docs/BACKEND-AUDIT-2026-10.md H3, step 11), on the test database: a
 *  worker that read the studio minutes ago and a producer who edited it meanwhile — both edits survive; a stale
 *  whole-value write is refused by compare-and-set. */

const tag = Math.random().toString(36).slice(2, 8);
const made = { productions: [] as string[], shows: [] as string[], characters: [] as string[] };
afterAll(async () => {
  await commands([...made.productions.map((id) => ({ name: 'deleteProduction' as const, args: [id] as [string] })), ...made.shows.map((id) => ({ name: 'deleteShow' as const, args: [id] as [string] })), ...made.characters.map((id) => ({ name: 'deleteCharacter' as const, args: [id] as [string] }))]).catch(() => undefined);
});

async function character(name: string) {
  const { character: c } = await command('addCharacter', [{ name: `${name} ${tag}`, style: 'ANIME', sex: 'MALE', ageYears: 40, language: 'EN', role: '', build: '', face: '', hair: '', skin: '', eyes: '', wardrobe: '', personality: '', distinguishing: [] }]);
  made.characters.push(c.id); return c.id;
}
async function episode() {
  const { show, season } = await command('addShow', [{ title: `Versions ${tag}`, logline: 'l', genre: 'drama', style: 'ANIME', language: 'EN', aspect: 'WIDE_16_9' }]);
  made.shows.push(show.id);
  const { production } = await command('addProduction', [{ kind: 'EPISODE', showId: show.id, seasonId: season.id, title: 'Pilot', logline: 'the first logline', synopsis: 'the first synopsis', style: 'ANIME', language: 'EN', aspect: 'WIDE_16_9', targetSeconds: 60, brief: { mode: 'MANUAL', text: 'x' }, castIds: [], locationIds: [] }]);
  made.productions.push(production.id);
  return { showId: show.id, productionId: production.id };
}

describe('aggregate versions (step 11)', () => {
  it('a change to a production — or to one of its shots — moves its version on; other aggregates keep theirs', async () => {
    const { showId, productionId } = await episode();
    const v = async () => { const r = await readState(); return { p: r.versions.productions.get(productionId)!, s: r.versions.shows.get(showId)! }; };
    const v0 = await v();
    const { scene } = await command('addScene', [productionId, { title: 'S', timeOfDay: 'DAWN' }]);
    const v1 = await v();
    expect(v1.p).toBe(v0.p + 1); expect(v1.s).toBe(v0.s);
    const { shot } = await command('addShot', [productionId, { sceneId: scene.id, purpose: '', action: '', framing: 'WIDE', cameraMove: 'STATIC', durationSeconds: 4, characterIds: [], dialogue: [], transition: 'CUT' }]);
    await command('updateShot', [productionId, shot.id, { action: 'a door opens' }]);
    expect((await v()).p).toBe(v1.p + 2);
    await command('updateShow', [showId, { logline: 'another' }]);
    expect((await v()).s).toBe(v0.s + 1);
  });

  it('compare-and-set: a write that expects a version someone moved is refused whole; with the current one it lands', async () => {
    const { productionId } = await episode();
    const read = (await readState()).versions.productions.get(productionId)!;
    await command('updateProduction', [productionId, { title: 'Renamed by the producer' }]);
    await expect(commands([{ name: 'updateProduction', args: [productionId, { castIds: [] , logline: 'the worker\'s whole value' }] }], 'worker', { expect: [{ kind: 'production', id: productionId, version: read }] })).rejects.toMatchObject({ code: 'CONFLICT', details: { reason: 'STALE_VERSION', expected: read, actual: read + 1 } });
    expect((await readState()).state.productions.find((p) => p.id === productionId)).toMatchObject({ title: 'Renamed by the producer', logline: 'the first logline' });
    await commands([{ name: 'updateProduction', args: [productionId, { logline: 'written on the current version' }] }], 'worker', { expect: [{ kind: 'production', id: productionId, version: read + 1 }] });
    expect((await readState()).state.productions.find((p) => p.id === productionId)!.logline).toBe('written on the current version');
  });
});

describe('intent commands keep both edits (step 11)', () => {
  it('a worker writing from a stale read and a producer editing meanwhile: cast, fields and the show bible keep both', async () => {
    const { showId, productionId } = await episode();
    const producerPick = await character('Producer pick');
    const workerPick = await character('Worker pick');
    // the worker reads …
    const read = (await readState()).state.productions.find((p) => p.id === productionId)!;
    // … the producer edits while the model writes: the logline, the cast, the show's bible
    await command('updateProduction', [productionId, { logline: 'the producer\'s logline', castIds: [producerPick] }]);
    await command('updateShow', [showId, { bible: { relationships: ['Mira trusts Tarek'], timeline: ['S1E0: before'] } }]);
    // … the worker writes back what it means
    await commands([
      { name: 'fillProductionFields', args: [productionId, { logline: 'the model\'s logline', synopsis: 'the model\'s synopsis' }, { logline: read.logline, synopsis: read.synopsis }] },
      { name: 'addCastMember', args: [{ productionId, showId }, [workerPick]] },
      { name: 'updateShowBible', args: [showId, { timeline: { dropPrefix: 'S1E1:', add: ['S1E1: they meet'] }, relationships: { add: ['Tarek owes Mira'] } }] },
    ], 'worker');
    const s = (await readState()).state;
    const p = s.productions.find((x) => x.id === productionId)!;
    expect(p.logline).toBe('the producer\'s logline');
    expect(p.synopsis).toBe('the model\'s synopsis');
    expect(p.castIds).toEqual([producerPick, workerPick]);
    const show = s.shows.find((x) => x.id === showId)!;
    expect(show.castIds).toEqual([workerPick]);
    expect(show.bible).toMatchObject({ relationships: ['Mira trusts Tarek', 'Tarek owes Mira'], timeline: ['S1E0: before', 'S1E1: they meet'] });
  });

  it('two takes numbered from the same old read do not both become "Take 1"', async () => {
    const { productionId } = await episode();
    const { scene } = await command('addScene', [productionId, { title: 'S', timeOfDay: 'DAWN' }]);
    const { shot } = await command('addShot', [productionId, { sceneId: scene.id, purpose: '', action: '', framing: 'WIDE', cameraMove: 'STATIC', durationSeconds: 4, characterIds: [], dialogue: [], transition: 'CUT' }]);
    const { asset } = await command('addAsset', [{ id: `up-ver-${tag}`, kind: 'VIDEO', src: `/api/media/up-ver-${tag}`, label: 'v', tags: [], sample: false, origin: 'UPLOAD', provenance: { path: `video/2026/10/up-ver-${tag}.mp4` } }]);
    await command('addTake', [productionId, shot.id, { assetId: asset.id, provider: 'MINIMAX', label: 'Take 1' }]);
    await command('addTake', [productionId, shot.id, { assetId: asset.id, provider: 'MINIMAX', label: 'Take 1' }]);
    expect((await readState()).state.productions.find((p) => p.id === productionId)!.shots[0].takes.map((t) => t.label)).toEqual(['Take 1', 'Take 2']);
  });
});
