import { afterAll, describe, expect, it } from 'vitest';
import { command, commands, readState } from '@/server/studio/engine';

/** THE LOCATION BIBLE, STORED (drizzle/0026): a place's identity version and a scene's "establish here" mark survive
 *  the scoped command path and the database round trip every page reads. Runs on the test database only
 *  (vitest.worker.config.ts). */

const tag = Math.random().toString(36).slice(2, 8);
const made = { productions: [] as string[], locations: [] as string[] };
afterAll(async () => {
  await commands(made.productions.map((id) => ({ name: 'deleteProduction' as const, args: [id] as [string] }))).catch(() => undefined);
  await commands(made.locations.map((id) => ({ name: 'deleteLocation' as const, args: [id] as [string] }))).catch(() => undefined);
});

describe('locations.identity and scenes.establish_location in the database', () => {
  it('a new place is identity v1; a layout change stored through a command reads back as v2 with the new line; a plate leaves it alone', async () => {
    const { location } = await command('addLocation', [{ name: `Roof ${tag}`, kind: 'EXTERIOR', description: 'a flat roof', style: 'CARTOON', lighting: ['NIGHT'], landmarks: ['a water tank'], props: ['a plastic chair'] }]);
    made.locations.push(location.id);
    const stored = async () => (await readState()).state.locations.find((l) => l.id === location.id)!;
    expect((await stored()).identity).toMatchObject({ version: 1, line: 'a flat roof; fixed features: a water tank; permanent props: a plastic chair' });
    await command('updateLocation', [location.id, { layout: { spatial: 'the tank is on the right, the chair centre' } }]);
    expect((await stored()).identity).toMatchObject({ version: 2, line: 'a flat roof; layout: the tank is on the right, the chair centre; fixed features: a water tank; permanent props: a plastic chair' });
    await command('addLocationRefs', [location.id, [{ id: `r-${tag}`, role: 'STATE', assetId: `plate-${tag}`, label: 'night', timeOfDay: 'NIGHT' }]], 'worker');
    expect((await stored()).identity!.version).toBe(2);
    expect((await stored()).refs.map((r) => r.assetId)).toEqual([`plate-${tag}`]);
  });

  it('a scene marked "establish here" keeps the mark through the round trip, and loses it when unmarked', async () => {
    const { production } = await command('addProduction', [{ kind: 'SHORT', title: `Establish ${tag}`, style: 'CARTOON', language: 'EN', aspect: 'WIDE_16_9', targetSeconds: 10, brief: { mode: 'MANUAL', text: 'x' }, castIds: [], locationIds: [] }]);
    made.productions.push(production.id);
    const { scene } = await command('addScene', [production.id, { title: 'First look', timeOfDay: 'DUSK', establishLocation: true }]);
    const { scene: plain } = await command('addScene', [production.id, { title: 'Later', timeOfDay: 'NIGHT' }]);
    const scenes = async () => (await readState()).state.productions.find((x) => x.id === production.id)!.scenes;
    expect((await scenes()).map((sc) => sc.establishLocation)).toEqual([true, undefined]);
    await command('updateScene', [production.id, scene.id, { establishLocation: false }]);
    await command('updateScene', [production.id, plain.id, { establishLocation: true }]);
    expect((await scenes()).map((sc) => sc.establishLocation)).toEqual([undefined, true]);
  });
});
