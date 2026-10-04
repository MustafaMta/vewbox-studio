// `tsx scripts/bench-studio.ts [--scale 1,10] [--runs 40]` — THE PERSISTENCE BENCHMARK (docs/BACKEND-AUDIT-2026-10.md
// step 13). On the TEST database only (TEST_DATABASE_URL, else DATABASE_URL renamed to `vewbox_test`; the live `vewbox`
// is refused): it replaces the test studio with the sample fixture copied `scale` times (scale 1 is about the live
// studio's size: 7 productions, 22 shots, 14 takes, 7 characters, 129 assets) and measures
//   - a typical command: one `updateShot` (a producer's edit of one shot) and one `updateCharacter`, sent the way the
//     command route sends them (applyCommands with a client id and a batch id) — median and p95 of `runs`;
//   - eight producers editing eight different productions at once: the wall time of the eight batches;
//   - the snapshot: `readState()` (what GET /api/studio and every worker read call) — right after a write (cold), and
//     again while nothing changed (warm; and warm without the caller's copy, as the route reads it) — median and p95,
//     and the size of the JSON GET /api/studio sends ({ state, version, hash }).
// STUDIO_STORE=v1|v2 picks the saver (src/server/studio/engine.ts), so the same script measures before and after.
// Output: one JSON object per scale on stdout.
import { assertNotLiveDatabase } from '../src/server/test-guard';
import { resolveTestDatabaseUrl, ensureTestDatabase, migrateTestDatabase } from './lib/test-db';

const arg = (name: string, dflt: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : dflt; };
const scales = arg('scale', '1,10').split(',').map(Number);
const runs = Number(arg('runs', '40'));

process.env.DATABASE_URL = resolveTestDatabaseUrl();
assertNotLiveDatabase(process.env.DATABASE_URL, 'bench-studio');
await ensureTestDatabase(process.env.DATABASE_URL);
await migrateTestDatabase(process.env.DATABASE_URL);

const { seed: sampleState } = await import('../src/domain/sample');
const { db, schema, closeDb } = await import('../src/server/db/client');
const { persistState } = await import('../src/server/studio/persist');
const { applyCommands, readState } = await import('../src/server/studio/engine');
const { hashState } = await import('../src/domain/hash');
type StudioState = import('../src/domain/types').StudioState;
type Command = import('../src/domain/commands').Command;

/** The sample studio `k` times over: every id of every copy gets the suffix `-k<k>` (references follow). */
function scaled(k: number): StudioState {
  const base = sampleState();
  const ids = new Set<string>();
  for (const x of [...base.shows, ...base.seasons, ...base.characters, ...base.locations, ...base.assets]) ids.add(x.id);
  for (const p of base.productions) { ids.add(p.id); for (const sc of p.scenes) ids.add(sc.id); for (const sh of p.shots) { ids.add(sh.id); for (const t of sh.takes) ids.add(t.id); } }
  const { settings, version, ...rest } = base;
  const json = JSON.stringify(rest);
  const pattern = new RegExp(`"(${[...ids].map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})"|/api/media/(${[...ids].map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  const out: StudioState = { version, settings, shows: [], seasons: [], productions: [], characters: [], locations: [], assets: [] };
  for (let i = 0; i < k; i++) {
    const copy = JSON.parse(json.replace(pattern, (_m, a, b) => (a ? `"${a}-k${i}"` : `/api/media/${b}-k${i}`))) as Omit<StudioState, 'settings' | 'version'>;
    for (const key of ['shows', 'seasons', 'productions', 'characters', 'locations', 'assets'] as const) (out[key] as unknown[]).push(...(copy[key] as unknown[]));
  }
  return out;
}

async function load(state: StudioState) {
  await db().transaction(async (tx) => {
    await tx.delete(schema.commandLog);
    await tx.delete(schema.characterUsage);
    await tx.delete(schema.takes); await tx.delete(schema.shots); await tx.delete(schema.scenes);
    await tx.delete(schema.productions); await tx.delete(schema.seasons); await tx.delete(schema.shows);
    await tx.update(schema.characters).set({ canonicalAssetId: null });
    await tx.delete(schema.characters); await tx.delete(schema.locations); await tx.delete(schema.assets);
    const none = () => new Map<string, string>();
    await persistState(tx, { shows: none(), seasons: none(), productions: none(), scenes: none(), shots: none(), takes: none(), characters: none(), locations: none(), assets: none(), usage: none(), settings: '' }, state);
  });
}

const stats = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return { median: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), n: s.length }; };
const time = async (fn: () => Promise<unknown>) => { const t = performance.now(); await fn(); return performance.now() - t; };
let seq = 0;
const cmd = (name: string, args: unknown[]): Command => ({ name, args, seed: `bench-${Date.now().toString(36)}-${++seq}`, at: new Date().toISOString() } as unknown as Command);

const results: unknown[] = [];
for (const k of scales) {
  const state = scaled(k);
  await load(state);
  const shotsOf = state.productions.filter((p) => p.shots.length > 0);
  const p0 = shotsOf[0]; const sh0 = p0.shots[0]; const c0 = state.characters[0];
  // warm-up (connections, JIT)
  for (let i = 0; i < 5; i++) { await readState(); await applyCommands([cmd('updateShot', [p0.id, sh0.id, { notes: `warm ${i}` }])], 'bench-client', { batchId: `warm-${k}-${i}-${seq}` }); }
  const shot: number[] = []; const character: number[] = []; const snap: number[] = [];
  for (let i = 0; i < runs; i++) {
    shot.push(await time(() => applyCommands([cmd('updateShot', [p0.id, sh0.id, { notes: `bench ${i}` }])], 'bench-client', { batchId: `b-${k}-${i}-${seq}` })));
    character.push(await time(() => applyCommands([cmd('updateCharacter', [c0.id, { notes: `bench ${i}` }])], 'bench-client', { batchId: `c-${k}-${i}-${seq}` })));
    snap.push(await time(() => readState()));
  }
  // eight producers on eight productions at once
  const eight = shotsOf.slice(0, 8);
  const parallel: number[] = [];
  for (let r = 0; r < Math.max(5, Math.floor(runs / 4)); r++) {
    parallel.push(await time(() => Promise.all(eight.map((p, i) => applyCommands([cmd('updateShot', [p.id, p.shots[0].id, { notes: `parallel ${r}.${i}` }])], `bench-client-${i}`, { batchId: `p-${k}-${r}-${i}-${seq}` })))));
  }
  // the snapshot while nothing changes: GET /api/studio read again at the same version (warm), shared as the route reads it
  const warm: number[] = []; const warmShared: number[] = [];
  await readState();
  for (let i = 0; i < runs; i++) { warm.push(await time(() => readState())); warmShared.push(await time(() => readState({ shared: true } as never))); }
  const r = await readState();
  const body = JSON.stringify({ state: r.state, version: r.version, hash: r.hash });
  const ok = r.hash === hashState(r.state);
  const counts = { productions: r.state.productions.length, shots: r.state.productions.reduce((n, p) => n + p.shots.length, 0), takes: r.state.productions.reduce((n, p) => n + p.shots.reduce((m, s) => m + s.takes.length, 0), 0), characters: r.state.characters.length, assets: r.state.assets.length };
  const out = { store: process.env.STUDIO_STORE ?? 'default', scale: k, counts, updateShotMs: stats(shot), updateCharacterMs: stats(character), eightParallelBatchesMs: stats(parallel), parallelProductions: eight.length, readStateMs: stats(snap), readStateWarmMs: stats(warm), readStateWarmSharedMs: stats(warmShared), snapshotBytes: Buffer.byteLength(body), hashConsistent: ok };
  console.log(JSON.stringify(out));
  results.push(out);
}
// leave the test studio empty (the copies share creation times, which other suites' order-sensitive checks dislike)
await (await import('../src/server/studio/seed')).replaceStudio('empty');
await closeDb();
