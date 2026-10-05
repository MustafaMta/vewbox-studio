import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray, sql as dsql } from 'drizzle-orm';
import type { Asset, Character, Location, Production, Shot, StudioState, Take } from '@/domain/types';
import type { Job } from '@/domain/jobs';
import { assertNotLiveDatabase } from '@/server/test-guard';

/** THE WORLD BIBLE AND THE AUDIO TIMELINE ON A REAL DATABASE AND REAL MEDIA — no GPU. The worker suite's test database
 *  (vitest.worker.config.ts: TEST_DATABASE_URL, else DATABASE_URL renamed to `vewbox_test`; the live `vewbox` is refused
 *  by src/server/test-guard.ts before anything runs) gets a fixture show with two episodes, written beside whatever the
 *  other suites left (never replacing it; every id carries this run's tag), and the real code runs: revisions appended
 *  under the scope lock, the pin at the story's approval and its safe re-pin, the real ASSEMBLE handler on ffmpeg-made
 *  takes (the cut, its audio timeline, the join report), the real EXPORT handler on the approved cut registering the
 *  established frames, episode 2 returning to the place and being filmed against them by id, the finished episode's
 *  facts appended to the show's bible once. The fixture is removed again at the end.
 *  Run: pnpm test:worker -- tests/worker/world-bible.test.ts */

const url = process.env.DATABASE_URL ?? '';
assertNotLiveDatabase(url, 'world bible test');
const enqueued = vi.hoisted(() => [] as Array<Record<string, unknown>>);
// nothing is queued from this suite, not even into the test database
vi.mock('@/server/jobs/queue', async (orig) => ({ ...(await orig<typeof import('@/server/jobs/queue')>()), enqueue: async (r: Record<string, unknown>) => { enqueued.push(r); return { job: { id: 'not-queued' }, created: true }; } }));

let lib = '';
const ff = (...args: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args]);
const NOW = new Date().toISOString();
const TAG = `wb${Math.random().toString(36).slice(2, 8)}`;
const id = (s: string) => `${TAG}-${s}`;

describe('World Bible + audio timeline on the test database', () => {
  let m: {
    db: typeof import('@/server/db/client'); env: typeof import('@/server/env'); snap: typeof import('@/server/studio/snapshot'); persist: typeof import('@/server/studio/persist'); engine: typeof import('@/server/studio/engine');
    world: typeof import('@/server/world'); store: typeof import('@/server/world/store'); runs: typeof import('@/server/org/runs'); assemble: typeof import('@/worker/handlers/assemble'); pack: typeof import('@/server/production/shot-pack'); domain: typeof import('@/domain/world'); media: typeof import('@/server/media');
  };
  const ids = { show: id('show'), season: id('s1'), e1: id('e1'), e2: id('e2'), c1: id('c1'), c2: id('c2'), L: id('pharmacy'), street: id('street') };
  const mine = (x: { id: string }) => x.id.startsWith(`${TAG}-`);
  const jobIds = new Set<string>();
  const read = async () => (await m.engine.readState()).state;
  const prod = (s: StudioState, pid: string) => s.productions.find((p) => p.id === pid)!;
  /** write a studio state as the saver does (a fixture write, under the studio lock, the studio version moved on so
   *  readState() serves the written state, not the read model it kept) */
  const write = async (next: StudioState) => m.db.db().transaction(async (tx) => {
    await tx.execute(dsql`select pg_advisory_xact_lock(hashtext('vewbox-studio'))`);
    const s = await m.snap.loadSnapshot(tx);
    await m.persist.persistState(tx, s.hashes, next);
    const now = new Date().toISOString();
    const { schema } = m.db;
    await tx.insert(schema.studioMeta).values({ id: 'studio', version: 1, updatedAt: now }).onConflictDoUpdate({ target: schema.studioMeta.id, set: { version: dsql`${schema.studioMeta.version} + 1`, updatedAt: now } });
  });
  const ctx = (type: Job['type'], payload: Record<string, unknown>) => {
    const jobId = `job-${TAG}-${type}-${Date.now()}`; jobIds.add(jobId);
    return { job: { id: jobId, type, status: 'PREPARING', attempts: 0, payload } as unknown as Job, agent: { id: 'test' }, tool: (_id: string, fn: () => unknown) => fn(), gpu: (_f: string, _mb: number, fn: () => unknown) => fn(), checkpoint: async () => {}, progress: async () => {}, activity: async () => {}, event: async () => {} } as never;
  };

  beforeAll(async () => {
    lib = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-world-lib-'));
    process.env.LIBRARY_ROOT = lib; process.env.TMP_ROOT = path.join(lib, 'tmp');
    m = {
      db: await import('@/server/db/client'), env: await import('@/server/env'), snap: await import('@/server/studio/snapshot'), persist: await import('@/server/studio/persist'), engine: await import('@/server/studio/engine'),
      world: await import('@/server/world'), store: await import('@/server/world/store'), runs: await import('@/server/org/runs'), assemble: await import('@/worker/handlers/assemble'), pack: await import('@/server/production/shot-pack'), domain: await import('@/domain/world'), media: await import('@/server/media'),
    };
    // the guard, again, on what the code will really use
    assertNotLiveDatabase(m.env.env().DATABASE_URL, 'world bible test (env)');
    if (m.env.env().DATABASE_URL !== url) throw new Error('the server reads another database than the worker config set');
    // MEDIA: plates and canonical images (flat colours), three takes whose luma carries the frame number
    const png = (name: string, color: string) => { ff('-f', 'lavfi', '-i', `color=c=${color}:s=320x180:d=0.1`, '-frames:v', '1', path.join(lib, `${name}.png`)); return name; };
    const take = (name: string, seconds: number, lum: string, cb: number, hz: number) => { ff('-f', 'lavfi', '-i', `color=c=black:s=160x90:r=24:d=${seconds.toFixed(6)},format=yuv444p,geq=lum='${lum}':cb=${cb}:cr=128,format=yuv420p`, '-f', 'lavfi', '-i', `aevalsrc=exprs='0.3*sin(2*PI*${hz}*t)':s=48000:d=${seconds.toFixed(6)}`, '-c:v', 'libx264', '-crf', '10', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(lib, `${name}.mp4`)); return name; };
    const image = (name: string): Asset => ({ id: name, kind: 'IMAGE', src: `/api/media/${name}`, label: name, tags: [], sample: false, origin: 'GENERATED', mimeType: 'image/png', width: 320, height: 180, provenance: { path: `${name}.png` }, createdAt: NOW });
    const clip = (name: string, seconds: number): Asset => ({ id: name, kind: 'VIDEO', src: `/api/media/${name}`, label: name, tags: ['take'], sample: false, origin: 'GENERATED', mimeType: 'video/mp4', durationSeconds: seconds, fps: 24, provenance: { path: `${name}.mp4`, probe: { hasAudio: true, hasVideo: true } }, createdAt: NOW });
    const A = { c1: id('canon-c1'), c1v2: id('canon-c1-v2'), c2: id('canon-c2'), master: id('plate-master'), dusk: id('plate-dusk'), street: id('plate-street'), master2: id('plate-master-2'), v11: id('v11'), v12: id('v12'), v13: id('v13') };
    png(A.c1, 'red'); png(A.c1v2, 'orange'); png(A.c2, 'blue'); png(A.master, 'gray'); png(A.dusk, 'purple'); png(A.street, 'green'); png(A.master2, 'white');
    // 1.2 continues 1.1 smoothly (picture and a steady 440 Hz room tone); 2.1 is somewhere else
    take(A.v11, 5, '120+50*sin(2*PI*(N-119)/40+PI/2)', 70, 440);
    take(A.v12, 158 / 24, '120+50*sin(2*PI*(N-21)/40+PI/2)', 70, 440);
    take(A.v13, 5, '10+N*1.5', 170, 660);
    // THE STUDIO: a show, its season, two episodes; episode 1 filmed (the pharmacy in the morning, the street at night),
    // episode 2 returns to the pharmacy in the morning and at night
    const { seed } = await import('@/domain/sample');
    const base = seed();
    const tmpl = base.characters[0];
    const character = (cid: string, name: string, canon: string): Character => ({ ...tmpl, id: cid, name, nameAr: undefined, refs: [], portraitAssetId: undefined, pendingReference: undefined, usage: { known: true, videos: [] }, voice: { ...tmpl.voice, samples: [], selectedSampleId: undefined, identity: undefined, designs: [] }, canonicalImage: { assetId: canon, status: 'APPROVED', version: 1, generatedAt: NOW, approvedAt: NOW }, createdAt: NOW, updatedAt: NOW });
    const place = (lid: string, name: string, refs: Location['refs'], master: string): Location => ({ id: lid, name, kind: 'INTERIOR', description: `${name}, a test place`, style: 'CARTOON', lighting: ['MORNING', 'DUSK'], landmarks: ['a green cross sign'], props: ['a cash register'], refs, masterAssetId: master, createdAt: NOW, updatedAt: NOW });
    const takeOf = (tid: string, asset: string, seconds: number, extra: Partial<Take> = {}): Take => ({ id: tid, label: 'Take 1', assetId: asset, createdAt: NOW, status: 'READY', provider: 'MINIMAX', durationSeconds: seconds, fps: 24, qa: { ok: true, checks: [{ name: 'decodable', ok: true }] }, ...extra });
    const shot = (sid: string, sceneId: string, number: number, extra: Partial<Shot>): Shot => ({ id: sid, sceneId, number, purpose: 'p', action: 'She sets a box on the counter', framing: 'MEDIUM', cameraMove: 'STATIC', durationSeconds: 5, characterIds: [ids.c1], dialogue: [], transition: 'CUT', takes: [], ...extra });
    const episode = base.productions.find((p) => p.kind === 'EPISODE')!;
    const e1: Production = { ...episode, id: ids.e1, showId: ids.show, seasonId: ids.season, episodeNumber: 1, title: 'Episode One', titleAr: undefined, stage: 'PRODUCE', castIds: [ids.c1, ids.c2], locationIds: [ids.L, ids.street], song: undefined, cutAssetId: undefined, exports: [], coverAssetId: undefined, posterAssetId: undefined, language: 'EN', dialect: undefined,
      scenes: [{ id: id('e1-sc1'), number: 1, title: 'Opening', locationId: ids.L, timeOfDay: 'MORNING', characterIds: [ids.c1, ids.c2], beats: [], exitState: 'the box is on the counter' }, { id: id('e1-sc2'), number: 2, title: 'Outside', locationId: ids.street, timeOfDay: 'NIGHT', characterIds: [ids.c1], beats: [] }],
      shots: [
        shot(id('e1s1'), id('e1-sc1'), 1, { framing: 'WIDE', characterIds: [ids.c1, ids.c2], takes: [takeOf(id('t11'), A.v11, 5)], selectedTakeId: id('t11'), continuity: { version: 1, characters: [{ characterId: ids.c1, wardrobe: 'green coat, red scarf' }], props: [{ name: 'a parcel', ownerCharacterId: ids.c1, state: 'taped', position: 'on the counter' }], environment: { timeOfDay: 'MORNING', lighting: 'low sun from the door' }, camera: {}, relationToPrevious: 'STORY_TRANSITION' } }),
        shot(id('e1s2'), id('e1-sc1'), 2, { characterIds: [ids.c1, ids.c2], takes: [takeOf(id('t12'), A.v12, 158 / 24, { trimStartFrames: 22, relation: 'CONTINUATION', continuesTakeId: id('t11'), params: { timeline: { newFrames: 100 } } })], selectedTakeId: id('t12'), continuity: { version: 1, characters: [], props: [], environment: { timeOfDay: 'MORNING' }, camera: {}, relationToPrevious: 'CONTINUATION' } }),
        shot(id('e1s3'), id('e1-sc2'), 1, { takes: [takeOf(id('t13'), A.v13, 5)], selectedTakeId: id('t13'), continuity: { version: 1, characters: [], props: [], environment: { timeOfDay: 'NIGHT' }, camera: {}, relationToPrevious: 'STORY_TRANSITION' } }),
      ] };
    const e2: Production = { ...e1, id: ids.e2, episodeNumber: 2, title: 'Episode Two', stage: 'STORY', castIds: [ids.c1], locationIds: [ids.L],
      scenes: [{ id: id('e2-sc1'), number: 1, title: 'Back', locationId: ids.L, timeOfDay: 'MORNING', characterIds: [ids.c1], beats: [] }, { id: id('e2-sc2'), number: 2, title: 'Late', locationId: ids.L, timeOfDay: 'NIGHT', characterIds: [ids.c1], beats: [] }],
      shots: [shot(id('e2s1'), id('e2-sc1'), 1, {}), shot(id('e2s2'), id('e2-sc2'), 1, {})] };
    const s0 = await read();
    await write({ ...s0,
      shows: [...s0.shows, { ...base.shows[0], id: ids.show, title: `World Test ${TAG}`, titleAr: undefined, coverAssetId: undefined, posterAssetId: undefined, castIds: [ids.c1, ids.c2], locationIds: [ids.L, ids.street], bible: { worldRules: ['Nobody pays at the pharmacy.'], relationships: ['Ada is Bo’s aunt.'] }, createdAt: NOW, updatedAt: NOW }],
      seasons: [...s0.seasons, { id: ids.season, showId: ids.show, number: 1, title: 'One', arc: '', createdAt: NOW }],
      characters: [...s0.characters, character(ids.c1, 'Ada', A.c1), character(ids.c2, 'Bo', A.c2)],
      locations: [...s0.locations, place(ids.L, 'Corner Pharmacy', [{ id: 'r1', role: 'MASTER', assetId: A.master, label: 'Master plate', timeOfDay: 'MORNING' }, { id: 'r2', role: 'STATE', assetId: A.dusk, label: 'dusk', timeOfDay: 'DUSK' }], A.master), place(ids.street, 'Street', [{ id: 'r3', role: 'MASTER', assetId: A.street, label: 'Master plate' }], A.street)],
      productions: [...s0.productions, e1, e2],
      assets: [...s0.assets, image(A.c1), image(A.c1v2), image(A.c2), image(A.master), image(A.dusk), image(A.street), image(A.master2), clip(A.v11, 5), clip(A.v12, 158 / 24), clip(A.v13, 5)],
    });
  }, 300_000);

  afterAll(async () => {
    // the fixture leaves the shared test database as it found it (best effort; every row carried this run's tag)
    try {
      const s = await read();
      const myJob = (a: Asset) => Boolean(a.jobId && jobIds.has(a.jobId));
      await write({ ...s, shows: s.shows.filter((x) => !mine(x)), seasons: s.seasons.filter((x) => !mine(x)), characters: s.characters.filter((x) => !mine(x)), locations: s.locations.filter((x) => !mine(x)), productions: s.productions.filter((x) => !mine(x)), assets: s.assets.filter((a) => !mine(a) && !myJob(a)) });
      const { schema, db } = m.db;
      const scope = `show:${ids.show}`;
      await db().delete(schema.worldPins).where(eq(schema.worldPins.scopeKey, scope));
      await db().delete(schema.worldReads).where(inArray(schema.worldReads.productionId, [ids.e1, ids.e2]));
      await db().delete(schema.worldRevisions).where(eq(schema.worldRevisions.scopeKey, scope));
      await db().delete(schema.audioTimelines).where(inArray(schema.audioTimelines.productionId, [ids.e1, ids.e2]));
      await db().delete(schema.approvals).where(inArray(schema.approvals.productionId, [ids.e1, ids.e2]));
      await db().delete(schema.qaReports).where(inArray(schema.qaReports.productionId, [ids.e1, ids.e2]));
      await db().delete(schema.handoffs).where(inArray(schema.handoffs.productionId, [ids.e1, ids.e2]));
    } catch (e) { console.warn(`[world-bible] cleanup skipped: ${(e as Error).message}`); }
    await m?.db.closeDb();
    if (lib) fs.rmSync(lib, { recursive: true, force: true });
  });

  it('revisions are appended per scope, numbered under its lock, and nothing new writes nothing', async () => {
    const s = await read();
    const r1 = await m.world.syncWorld(s, prod(s, ids.e1), { reason: 'fixture' });
    expect(r1.revision.scopeKey).toBe(`show:${ids.show}`);
    expect(r1.revision.bible.rules[0].text).toBe('Nobody pays at the pharmacy.');
    expect((await m.world.syncWorld(s, prod(s, ids.e2), { reason: 'again' })).created).toBe(false);
    // six writers at once, each adding a producer rule on top of what it finds: six revisions in order, nothing lost
    const scope = m.domain.worldScopeOf(prod(s, ids.e1));
    const before = r1.revision.number;
    const out = await Promise.all(Array.from({ length: 6 }, (_, i) => m.store.appendRevision(scope, (latest) => ({ ...latest!.bible, rules: [...latest!.bible.rules, { id: `rule-c${i}`, text: `Rule ${i}.`, scope: 'WORLD', source: 'PRODUCER' }] }), { author: { kind: 'HUMAN', id: 'test' }, reason: `rule ${i}` })));
    expect(out.map((o) => o.revision.number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6].map((k) => before + k));
    const last = await m.store.latestRevision(m.domain.scopeKey(scope));
    expect(last!.bible.rules.filter((r) => r.source === 'PRODUCER')).toHaveLength(6);
    // the producer's rules survive the next derivation from the studio
    expect((await m.world.syncWorld(s, prod(s, ids.e1), { reason: 'after rules' })).revision.bible.rules.filter((r) => r.source === 'PRODUCER')).toHaveLength(6);
  });

  it('a production is pinned at its story’s approval, follows a safe change, stays put on an unsafe one', async () => {
    let s = await read();
    expect((await m.world.ensurePin(s, prod(s, ids.e1), { by: 'test' })).action).toBe('UNPINNED');
    const approval = await m.runs.recordApproval({ productionId: ids.e1, stage: 'STORY', subjectKind: 'STAGE', subjectId: 'STORY', decision: 'APPROVED', by: 'test' });
    const pinned = await m.world.ensurePin(s, prod(s, ids.e1), { by: 'test' });
    expect(pinned).toMatchObject({ action: 'PINNED', view: { pinned: true, pin: { approvalId: approval, reason: 'STORY_APPROVAL' } } });
    expect((await m.world.ensurePin(s, prod(s, ids.e1), { by: 'test' })).action).toBe('KEPT');
    // a new plate for the filmed pharmacy: an addition — the pin follows it
    await write({ ...s, locations: s.locations.map((l) => (l.id === ids.L ? { ...l, refs: [...l.refs, { id: 'r4', role: 'VIEW' as const, assetId: id('plate-master-2'), label: 'Reverse angle' }] } : l)) });
    s = await read();
    const repinned = await m.world.ensurePin(s, prod(s, ids.e1), { by: 'test' });
    expect(repinned).toMatchObject({ action: 'REPINNED', view: { pin: { reason: 'SAFE_REPIN' } } });
    expect(repinned.view.pin!.diff).toEqual([expect.objectContaining({ op: 'ADD', path: `locations/${ids.L}/plates/${id('plate-master-2')}` })]);
    // Ada (filmed) is redrawn: the pin stays, the change is named, and her shots keep the pinned image
    await write({ ...s, characters: s.characters.map((c) => (c.id === ids.c1 ? { ...c, canonicalImage: { ...c.canonicalImage!, assetId: id('canon-c1-v2'), version: 2 } } : c)) });
    s = await read();
    const kept = await m.world.ensurePin(s, prod(s, ids.e1), { by: 'test' });
    expect(kept).toMatchObject({ action: 'KEPT', blocking: [expect.objectContaining({ path: `characters/${ids.c1}/canonical` })] });
    const shotWorld = await m.world.worldForShot(s, prod(s, ids.e1), prod(s, ids.e1).shots[0], { by: 'test' });
    const pack = m.pack.resolveShotPack(shotWorld.state, prod(s, ids.e1), prod(s, ids.e1).shots[0], { backend: 'local' });
    expect(pack.subjects.find((x) => x.characterId === ids.c1)?.assetId).toBe(id('canon-c1'));
    expect(shotWorld.read.characters.find((c) => c.characterId === ids.c1)).toMatchObject({ pinnedVersion: 1, currentVersion: 2, usedPinned: true });
    // the redraw is undone: the pin follows again
    await write({ ...s, characters: s.characters.map((c) => (c.id === ids.c1 ? { ...c, canonicalImage: { ...c.canonicalImage!, assetId: id('canon-c1'), version: 1 } } : c)) });
    s = await read();
    expect(['KEPT', 'REPINNED']).toContain((await m.world.ensurePin(s, prod(s, ids.e1), { by: 'test' })).action);
    expect((await m.store.pinHistory(ids.e1)).map((x) => x.reason).reverse().slice(0, 2)).toEqual(['STORY_APPROVAL', 'SAFE_REPIN']);
  });

  it('the real ASSEMBLE cuts episode 1 on its audio timeline, stores the timeline and reports the continuation join', async () => {
    const r = await m.assemble.assemble(ctx('ASSEMBLE', { productionId: ids.e1 })) as Record<string, unknown>;
    expect(r).toMatchObject({ shots: 3, joins: 1, joinJumps: 0, audioTimelineRevision: 1 });
    expect(Math.abs((r.durationSeconds as number) - (120 + 100 + 120) / 24)).toBeLessThan(0.05);
    const s = await read();
    const cut = s.assets.find((a) => a.id === prod(s, ids.e1).cutAssetId)!;
    const prov = cut.provenance as { shots: Array<{ startFrame: number; frames: number; trimStartFrames: number }>; timeline: { clock: string; totalFrames: number }; world: { pinned: boolean } };
    expect(prov.shots.map((x) => [x.startFrame, x.frames, x.trimStartFrames])).toEqual([[0, 120, 0], [120, 100, 22], [220, 120, 0]]);
    expect(prov.timeline).toMatchObject({ clock: 'DIALOGUE', totalFrames: 340 });
    expect(prov.world.pinned).toBe(true);
    expect(fs.existsSync(m.media.assetFile(cut))).toBe(true);
    expect((await m.store.latestAudioTimeline(ids.e1))?.revision).toBe(1);
    const reports = await m.runs.listQaReports({ productionId: ids.e1, limit: 100 });
    const join = reports.find((x) => x.subjectKind === 'TAKE' && x.subjectId === id('t12') && x.checks.some((c) => c.name === 'join-picture'));
    expect(join).toMatchObject({ inspectorId: 'visual-quality-inspector', decision: 'ACCEPT' });
    expect(enqueued.map((e) => e.type)).toEqual(['EPISODE_CONTINUITY']);
  }, 300_000);

  it('the real EXPORT of the approved cut registers what it establishes: the pharmacy in the morning and the street at night, by id, and locks them', async () => {
    await m.runs.recordApproval({ productionId: ids.e1, stage: 'EDIT', subjectKind: 'STAGE', subjectId: 'EDIT', decision: 'APPROVED', by: 'test' });
    const r = await m.assemble.exportCut(ctx('EXPORT', { productionId: ids.e1, format: 'mp4-h264', resolution: '720', subtitles: 'none' })) as Record<string, unknown>;
    expect(r.establishedFrames).toBe(2);
    const s = await read();
    const latest = (await m.store.latestRevision(`show:${ids.show}`))!;
    const L = latest.bible.locations.find((l) => l.locationId === ids.L)!;
    const est = L.plates.filter((x) => x.role === 'ESTABLISHED');
    expect(L.locked).toBe(true);
    expect(est).toEqual([expect.objectContaining({ timeOfDay: 'MORNING', framing: 'WIDE', source: expect.objectContaining({ kind: 'FROM_TAKE', productionId: ids.e1, takeId: id('t11'), frame: 6 }) })]);
    const frame = s.assets.find((a) => a.id === est[0].assetId)!;
    expect(frame).toMatchObject({ kind: 'IMAGE', origin: 'DERIVED', tags: ['location', 'established'] });
    expect(fs.existsSync(m.media.assetFile(frame))).toBe(true);
    // the same audio timeline: no new revision; a second registration adds nothing
    expect((await m.store.latestAudioTimeline(ids.e1))?.revision).toBe(1);
    expect((await m.world.establishFromApprovedCut(s, prod(s, ids.e1), {})).added).toBe(0);
    // the pharmacy is locked: a redraw of its plates adds, never replaces
    await write({ ...s, locations: s.locations.map((l) => (l.id === ids.L ? { ...l, refs: [{ id: 'r9', role: 'MASTER' as const, assetId: id('plate-master-2'), label: 'Master plate' }], masterAssetId: id('plate-master-2') } : l)) });
    const after = await m.world.syncWorld(await read(), prod(s, ids.e1), { reason: 'redraw' });
    expect(after.revision.bible.locations.find((l) => l.locationId === ids.L)!.plates.map((x) => x.assetId)).toEqual(expect.arrayContaining([id('plate-master'), id('plate-dusk'), est[0].assetId, id('plate-master-2')]));
  }, 300_000);

  it('episode 2 returns to the pharmacy: pinned at its approval, each shot filmed against the established frame by id, the read recorded', async () => {
    await m.runs.recordApproval({ productionId: ids.e2, stage: 'STORY', subjectKind: 'STAGE', subjectId: 'STORY', decision: 'APPROVED', by: 'test' });
    let s = await read();
    expect((await m.world.establishApprovedCuts(s, prod(s, ids.e2), {})).every((x) => x.added === 0)).toBe(true);
    s = await read();
    const pin = await m.world.ensurePin(s, prod(s, ids.e2), { by: 'test' });
    expect(pin).toMatchObject({ action: 'PINNED', view: { pinned: true } });
    const established = pin.view.revision.bible.locations.find((l) => l.locationId === ids.L)!.plates.find((x) => x.role === 'ESTABLISHED')!;
    // morning: the established frame of the morning; night (no night plate): the established frame, the light set by the prompt
    for (const shotId of [id('e2s1'), id('e2s2')]) {
      const sh = prod(s, ids.e2).shots.find((x) => x.id === shotId)!;
      const w = await m.world.worldForShot(s, prod(s, ids.e2), sh, { by: 'test' });
      expect(w.read.location).toMatchObject({ locationId: ids.L, assetId: established.assetId, role: 'ESTABLISHED' });
      expect(m.pack.resolveShotPack(w.state, prod(s, ids.e2), sh, { backend: 'local' }).location?.assetId).toBe(established.assetId);
      await m.store.recordWorldRead({ productionId: ids.e2, read: w.read, jobType: 'GENERATE_TAKE', shotId, takeId: `take-of-${shotId}` });
    }
    const reads = await m.store.worldReads({ takeId: `take-of-${id('e2s2')}` });
    expect(reads).toEqual([expect.objectContaining({ revisionId: pin.view.revision.id, pinned: true, read: expect.objectContaining({ location: expect.objectContaining({ why: expect.stringMatching(/the light is set by the prompt/) }) }) })]);
  }, 120_000);

  it('the producer’s audio policy is a revision by a person; the productions follow it (it changes no filmed picture)', async () => {
    const s = await read();
    const r = await m.world.setAudioPolicy(s, prod(s, ids.e2), { dialogue: 'RECORDED_VOICE', songBed: 'INSTRUMENTAL_WHEN_AVAILABLE' }, 'producer');
    expect(r).toMatchObject({ author: { kind: 'HUMAN', id: 'producer' }, changes: [{ op: 'UPDATE', path: 'audio' }] });
    const e1 = await m.world.ensurePin(s, prod(s, ids.e1), { by: 'test' });
    expect(e1).toMatchObject({ action: 'REPINNED', view: { revision: { bible: { audio: { dialogue: 'RECORDED_VOICE' } } } } });
    expect((await m.world.worldOfProduction(s, prod(s, ids.e1))).revision.id).toBe(r.id);
  });

  it('finishing episode 1 appends its facts and open storylines to the show’s bible once; episode 2 follows them (a safe re-pin); finishing it again writes nothing', async () => {
    let s = await read();
    const facts = { events: ['Ada left the parcel on the counter.'], unresolved: ['Who sent the parcel?'], relationships: ['Bo owes Ada a favour.'] };
    const first = await m.world.recordEpisode(prod(s, ids.e1), facts);
    expect(first).toMatchObject({ tag: 'S1E1', bibleChanged: true, created: true });
    s = await read();
    expect(s.shows.find((x) => x.id === ids.show)!.bible).toMatchObject({ timeline: ['S1E1: Ada left the parcel on the counter.'], unresolved: ['Who sent the parcel?'], relationships: ['Ada is Bo’s aunt.', 'Bo owes Ada a favour.'], worldRules: ['Nobody pays at the pharmacy.'] });
    expect(first.revision.bible.openStorylines).toEqual(['Who sent the parcel?']);
    expect(first.revision.bible.timeline.find((e) => e.source === 'SHOW_BIBLE')).toMatchObject({ text: 'S1E1: Ada left the parcel on the counter.' });
    // episode 2 (pinned at its story's approval) follows: timeline facts and storylines change nothing it filmed
    const e2 = await m.world.ensurePin(s, prod(s, ids.e2), { by: 'test' });
    expect(e2).toMatchObject({ action: 'REPINNED', view: { revision: { id: first.revision.id } } });
    expect(m.domain.worldForStory(e2.view.revision.bible)).toMatchObject({ openStorylines: ['Who sent the parcel?'], timeline: expect.arrayContaining(['S1E1: Ada left the parcel on the counter.']) });
    // the same finish again: the bible is unchanged and no revision is written
    const again = await m.world.recordEpisode(prod(s, ids.e1), facts);
    expect(again).toMatchObject({ bibleChanged: false, created: false, revision: { id: first.revision.id } });
    expect((await m.world.ensurePin(await read(), prod(s, ids.e2), { by: 'test' })).action).toBe('KEPT');
  });
});
