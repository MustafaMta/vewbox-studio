import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as dsql } from 'drizzle-orm';
import { db, sql } from '@/server/db/client';
import { applyCommands, command, readState } from '@/server/studio/engine';
import { replaceStudio } from '@/server/studio/seed';
import { loadSnapshot } from '@/server/studio/snapshot';
import { loadScoped, saveScoped, isScopedConflict } from '@/server/studio/store';
import { batchScope, restrictState } from '@/server/studio/scope';
import { forgetReadModel } from '@/server/studio/readmodel';
import { hashState } from '@/domain/hash';
import { runCommand, type Command } from '@/domain/commands';
import type { StudioState } from '@/domain/types';

/** SCOPED PERSISTENCE, PART B (docs/BACKEND-AUDIT-2026-10.md H2, step 13b), on the test database:
 *  - the same batches give the same studio under the scoped store (v2) and the whole-studio saver (v1);
 *  - the scoped loader reads exactly the part of the studio the scope names;
 *  - batches on different productions do not wait for each other; batches on the same one do, and none is lost;
 *  - a concurrent change to a loaded aggregate makes the save a conflict (compare-and-set), never a lost update;
 *  - a new row whose id is taken elsewhere is refused, as the whole studio refuses it;
 *  - the answer's hash is the whole studio's, as the browser expects. */

const AT = '2026-10-04T10:00:00.000Z';
/** this run's client ids: the command journal answers a batch id it already saw from an earlier run */
const run = Math.random().toString(36).slice(2, 8);
const c = (i: number, name: string, ...args: unknown[]): Command => ({ name, args, seed: `scoped-eq-${i}`, at: AT } as unknown as Command);
const audio = (id: string) => ({ id, kind: 'AUDIO', src: `/api/media/${id}`, label: id, tags: [], sample: false, origin: 'UPLOAD', provenance: { path: `audio/${id}.wav` } });
const media = (id: string, kind: 'VIDEO' | 'IMAGE') => ({ id, kind, src: `/api/media/${id}`, label: id, tags: [], sample: false, origin: 'GENERATED', provenance: { path: `${kind.toLowerCase()}/${id}` } });

/** One batch per entry: production, character, asset, location, show, settings and whole-studio commands mixed. */
const sequence = (): Command[][] => {
  let i = 0;
  return [
    [c(++i, 'addAsset', media('scoped-vid-1', 'VIDEO')), c(++i, 'addAsset', audio('scoped-up-1')), c(++i, 'addAsset', media('scoped-img-1', 'IMAGE'))],
    [c(++i, 'updateShot', 's1e1', 's1e1-2', { action: 'they argue', notes: 'louder' })],
    [c(++i, 'addScene', 'night-tray', { title: 'Later', timeOfDay: 'NIGHT' })],
    [c(++i, 'addShot', 'night-tray', { sceneId: 'nt-sc1', purpose: 'p', action: 'a', framing: 'WIDE', cameraMove: 'STATIC', durationSeconds: 4, characterIds: ['hana'], dialogue: [], transition: 'CUT' })],
    [c(++i, 'addTake', 's1e2', 's1e2-3', { assetId: 'scoped-vid-1', provider: 'MINIMAX', id: 'scoped-take-1', select: 'IF_UNCHOSEN' })],
    [c(++i, 'rateTake', 's1e1', 's1e1-3', 's1e1-3-t1', 'REJECTED', { reason: 'soft' }), c(++i, 'selectTake', 's1e1', 's1e1-4', 's1e1-4-t1')],
    [c(++i, 'removeTake', 's1e1', 's1e1-3', 's1e1-3-t1')],
    [c(++i, 'moveShot', 's1e2', 's1e2-4', -1)],
    [c(++i, 'deleteShot', 'paper-boats', 'pb-2')],
    [c(++i, 'setDialogueAudio', 's1e1', 's1e1-2', 'd1', { audioAssetId: 'scoped-up-1', durationSeconds: 2 }), c(++i, 'keepLineRecordings', 's1e1', [{ shotId: 's1e1-2', lineId: 'd1' }])],
    [c(++i, 'updateCharacter', 'nour', { notes: 'scoped', language: 'EN' })],
    [c(++i, 'addCharacter', { name: 'Scoped Samia', role: '', style: 'ANIME', sex: 'FEMALE', ageYears: 40, language: 'AR', build: '', face: '', hair: '', skin: '', eyes: '', wardrobe: '', personality: '', distinguishing: [] })],
    [c(++i, 'addVoiceRecording', 'nour', 'scoped-up-1', 'take one', { text: 'hello' })],
    [c(++i, 'setCanonicalImage', 'nour', { assetId: 'scoped-img-1', jobId: 'job-x', check: { ok: true } })],
    [c(++i, 'addLocation', { name: 'Pier', kind: 'EXTERIOR', description: 'd', style: 'ANIME', lighting: [], landmarks: [], props: [] }), c(++i, 'updateLocation', 'cafe', { description: 'warmer' })],
    [c(++i, 'updateShow', 'last-sip', { logline: 'scoped logline' }), c(++i, 'addSeason', 'paper-kites')],
    [c(++i, 'addProduction', { kind: 'EPISODE', showId: 'last-sip', seasonId: 'last-sip-s1', title: 'Scoped episode', style: 'ANIME', language: 'EN', aspect: 'WIDE_16_9', targetSeconds: 60, brief: { mode: 'MANUAL', text: 'x' }, castIds: [], locationIds: [] })],
    [c(++i, 'updateSettings', { reducedMotion: true })],
    [c(++i, 'updateShot', 'nope', 'nope', {})], // refused
    [c(++i, 'deleteProduction', 'rooftop-radio')],
    [c(++i, 'deleteAsset', 'scoped-img-1')], // whole studio; refused (a canonical image)
    [c(++i, 'deleteLocation', 'alley')], // whole studio
  ];
};

/** The studio as a comparable value: instants normalised, top-level collections in id order (rows with the same
 *  creation time come back in either order). */
const normal = (s: StudioState) => {
  const t = JSON.parse(JSON.stringify(s), (_k, v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d/.test(v) ? new Date(v.replace(' ', 'T').replace(/\+00$/, 'Z')).toISOString() : v)) as StudioState;
  for (const k of ['shows', 'seasons', 'productions', 'characters', 'locations', 'assets'] as const) (t[k] as Array<{ id: string }>).sort((a, b) => a.id.localeCompare(b.id));
  return t;
};

async function runAll(mode: 'v1' | 'v2') {
  process.env.STUDIO_STORE = mode;
  await replaceStudio('sample');
  forgetReadModel();
  const outcomes: unknown[] = [];
  for (const [k, batch] of sequence().entries()) {
    const r = await applyCommands(batch, `scoped-eq-${mode}-${run}`, { batchId: `b${k}` });
    outcomes.push(r.ok ? { ok: true, results: r.results } : { ok: false, failedAt: r.failedAt, code: r.error.code });
  }
  return { state: normal((await readState()).state), outcomes };
}

const prior = process.env.STUDIO_STORE;
beforeAll(async () => { await replaceStudio('sample'); });
afterAll(async () => { process.env.STUDIO_STORE = prior; await replaceStudio('empty'); });

describe('scoped persistence (step 13b)', () => {
  it('the same batches give the same studio and the same answers under the scoped store and the whole-studio saver', async () => {
    const v1 = await runAll('v1');
    const v2 = await runAll('v2');
    expect(v2.outcomes).toEqual(v1.outcomes);
    expect(v1.outcomes.filter((o) => (o as { ok: boolean }).ok)).toHaveLength(sequence().length - 2);
    for (const k of Object.keys(v1.state) as Array<keyof StudioState>) expect(v2.state[k], k).toEqual(v1.state[k]);
    expect(hashState(v2.state)).toBe(hashState(v1.state));
  });

  it('the scoped loader reads exactly the part of the studio a scope names', async () => {
    process.env.STUDIO_STORE = 'v2';
    const full = await loadSnapshot();
    for (const batch of sequence()) {
      const scope = batchScope(batch);
      if (scope.full) continue;
      const snap = await db().transaction((tx) => loadScoped(tx, scope));
      const want = restrictState(full.state, snap.scope);
      expect(snap.loaded, batch[0].name).toEqual(want.loaded);
      for (const k of ['productions', 'characters', 'assets'] as const) if (snap.loaded[k] !== null) expect(hashState((snap.state[k] as Array<{ id: string }>)), `${batch[0].name} ${k}`).toBe(hashState(want.state[k]));
      if (snap.loaded.shows) expect(hashState([snap.state.shows, snap.state.seasons])).toBe(hashState([full.state.shows, full.state.seasons]));
      if (snap.loaded.locations) expect(hashState(snap.state.locations)).toBe(hashState(full.state.locations));
      // fingerprints: the scoped load's are the whole load's, for what it loaded
      for (const [id, h] of snap.hashes.takes) expect(full.hashes.takes.get(id)).toBe(h);
      for (const [id, h] of snap.hashes.characters) expect(full.hashes.characters.get(id)).toBe(h);
      for (const [id, h] of snap.hashes.assets) expect(full.hashes.assets.get(id)).toBe(h);
    }
  });

  it('batches on different productions do not wait for each other; on the same production they wait, and no edit is lost', async () => {
    process.env.STUDIO_STORE = 'v2';
    await replaceStudio('sample');
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    let locked!: () => void;
    const isLocked = new Promise<void>((r) => { locked = r; });
    // another writer holds production s1e1 (as a batch on it would)
    const holder = sql().begin(async (tx) => { await tx`select pg_advisory_xact_lock(hashtext('studio:production:s1e1'))`; locked(); await held; });
    await isLocked;
    const t0 = Date.now();
    const other = await applyCommands([c(900, 'updateShot', 's1e2', 's1e2-1', { notes: 'not blocked' })], `scoped-conc-${run}`, { batchId: 'other' });
    expect(other.ok).toBe(true);
    expect(Date.now() - t0).toBeLessThan(2000);
    let sameDone = false;
    const same = applyCommands([c(901, 'updateShot', 's1e1', 's1e1-1', { notes: 'waited' })], `scoped-conc-${run}`, { batchId: 'same' }).then((r) => { sameDone = true; return r; });
    await new Promise((r) => setTimeout(r, 400));
    expect(sameDone).toBe(false);
    release(); await holder;
    expect((await same).ok).toBe(true);
    // eight producers, one production, eight shots at once: all eight edits are there
    const shots = (await readState()).state.productions.find((p) => p.id === 's1e1')!.shots.slice(0, 7);
    const rs = await Promise.all(shots.map((sh, k) => applyCommands([c(910 + k, 'updateShot', 's1e1', sh.id, { notes: `parallel ${k}` })], `scoped-par-${k}-${run}`, { batchId: `par-${k}` })));
    expect(rs.every((r) => r.ok)).toBe(true);
    const after = (await readState()).state.productions.find((p) => p.id === 's1e1')!;
    expect(shots.map((sh) => after.shots.find((x) => x.id === sh.id)!.notes)).toEqual(shots.map((_, k) => `parallel ${k}`));
  });

  it('a change made to a loaded production after the load makes the save a conflict (compare-and-set), never a lost update', async () => {
    process.env.STUDIO_STORE = 'v2';
    const cmd = c(950, 'updateShot', 'night-tray', 'nt-2', { notes: 'stale writer' });
    const err = await db().transaction(async (tx) => {
      const snap = await loadScoped(tx, batchScope([cmd]));
      // meanwhile another writer (its own connection) changes the same production
      await command('updateProduction', ['night-tray', { logline: 'changed meanwhile' }]);
      const next = runCommand(snap.state, cmd).state;
      return saveScoped(tx, snap, next).then(() => null, (e: unknown) => e);
    }).catch((e: unknown) => e);
    expect(isScopedConflict(err)).toBe(true);
    // through the engine the batch is simply run again on the fresh production: both edits survive
    const r = await applyCommands([c(951, 'updateShot', 'night-tray', 'nt-2', { notes: 'second writer' })], `scoped-cas-${run}`, { batchId: 'cas' });
    expect(r.ok).toBe(true);
    const p = (await readState()).state.productions.find((x) => x.id === 'night-tray')!;
    expect([p.logline, p.shots.find((s) => s.id === 'nt-2')!.notes]).toEqual(['changed meanwhile', 'second writer']);
  });

  it('a new take whose id is a live take of another production is refused, as the whole studio refuses it', async () => {
    process.env.STUDIO_STORE = 'v2';
    const r = await applyCommands([c(960, 'addTake', 'paper-boats', 'pb-3', { assetId: 'take-01', provider: 'UPLOAD', id: 's1e1-1-t1' })], `scoped-dup-${run}`, { batchId: 'dup' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe('CONFLICT');
    const s1e1 = (await readState()).state.productions.find((x) => x.id === 's1e1')!;
    expect(s1e1.shots.find((s) => s.id === 's1e1-1')!.takes.some((t) => t.id === 's1e1-1-t1')).toBe(true);
  });

  it('the answer carries the whole studio’s hash, as the browser compares it', async () => {
    process.env.STUDIO_STORE = 'v2';
    // the whole-studio saver answers hashState(the batch run on the studio it loaded): so does the scoped one
    const before = (await readState()).state;
    const cmd = c(970, 'updateShot', 's1e2', 's1e2-2', { notes: 'hash 1' });
    const r1 = await applyCommands([cmd], `scoped-hash-${run}`, { batchId: 'h1' });
    expect(r1.hash).toBe(hashState(runCommand(before, cmd).state));
    // a cold read model (another process wrote in between): the hash is of the studio read whole, consistently, after it
    forgetReadModel();
    const r2 = await applyCommands([c(971, 'updateCharacter', 'hana', { notes: 'hash 2' })], `scoped-hash-${run}`, { batchId: 'h2' });
    expect(r2.hash).toBe(hashState((await readState()).state));
    await db().execute(dsql`select 1`);
  });
});
