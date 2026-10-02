import { act, assetOf, BASE, characterById, createCharacter, expect, fixture, getJob, listJobs, psql, requireRestart, resetStudio, scaledPlate, snapshot, startJob, test, uploadAsset, type Snap } from '../helpers';

/** TEST 9 — PERSISTENCE ACROSS A RESTART. The runner cannot restart the server. The scenario makes a character with a
 *  pending reference picture and a chosen recording, records the snapshot, then waits for the operator (see
 *  `requireRestart` in helpers.ts and docs/TEST-RESULTS.md): restart web + worker, create `var/qa-restarted.flag`.
 *  Afterwards characters, assets, identities, usage and settings must read back identical. The API-only variant
 *  reads the rows straight from Postgres (`docker exec vewbox-db-1 psql`) to prove the columns hold the values. */

const NAME = 'Idris Mansour';

async function makeContent(outDir: string) {
  const c = await createCharacter({ name: NAME, language: 'AR', dialect: 'IRAQI_BAGHDADI', nameAr: 'إدريس منصور', role: 'A watchmaker', sex: 'MALE', ageYears: 58, hair: 'White, thin', wardrobe: 'A grey suit, a loupe on a cord' });
  const picture = await uploadAsset(scaledPlate(768, 960, outDir), { expect: 'IMAGE', purpose: 'character-reference', label: `${NAME} — reference` });
  expect(picture.status, JSON.stringify(picture.raw)).toBe(201);
  await act('setPendingReference', c.id, picture.asset!.id);
  const clip = await uploadAsset(fixture('speech-en.wav'), { expect: 'AUDIO', label: `${NAME} — recording` });
  expect(clip.status, JSON.stringify(clip.raw)).toBe(201);
  await act('addVoiceRecording', c.id, clip.asset!.id, 'speech-en');
  const s = await snapshot<Snap>();
  const sample = characterById(s, c.id)!.voice.samples.find((x) => x.assetId === clip.asset!.id)!;
  await act('selectVoiceSample', c.id, sample.id);
  return { id: c.id, pictureId: picture.asset!.id, clipId: clip.asset!.id, sampleId: sample.id };
}

/** What must survive a restart, as the API shows it. */
const projection = (s: Snap) => ({
  characters: s.characters,
  assets: s.assets.map((a) => ({ id: a.id, kind: a.kind, src: a.src, bytes: a.bytes, sha256: a.sha256, sample: a.sample, origin: a.origin, width: a.width, height: a.height, durationSeconds: a.durationSeconds, unavailable: a.unavailable ?? false })),
  identities: Object.fromEntries(s.characters.map((c) => [c.id, c.voice.identity ?? null])),
  usage: Object.fromEntries(s.characters.map((c) => [c.id, c.usage ?? null])),
  settings: s.settings,
});

test('characters, assets, identities and usage read back identically after the operator restarts web + worker', async ({}, info) => {
  await resetStudio('sample');
  const made = await makeContent(info.outputDir);
  const before = await snapshot<Snap>();
  const version = async () => ((await (await fetch(`${BASE}/api/studio`)).json()) as { version: number }).version;
  const beforeVersion = await version();
  const jobsBefore = (await listJobs()).map((j) => ({ id: j.id, type: j.type, status: j.status }));
  expect(characterById(before, made.id)!.pendingReference?.assetId).toBe(made.pictureId);
  expect(characterById(before, made.id)!.voice.selectedSampleId).toBe(made.sampleId);

  const { requestedAt, restartedAt } = await requireRestart();
  info.annotations.push({ type: 'restart', description: `requested ${requestedAt}, confirmed ${restartedAt}` });

  const after = await snapshot<Snap>();
  expect(await version(), 'no write happened across the restart').toBe(beforeVersion);
  expect(projection(after)).toEqual(projection(before));
  // the files are still served after the restart
  for (const id of [made.pictureId, made.clipId]) {
    const a = assetOf(after, id)!;
    const r = await fetch(`${BASE}${a.src}`);
    expect(r.status, `GET ${a.src}`).toBe(200);
    expect((await r.arrayBuffer()).byteLength).toBe(a.bytes);
  }
  // the job history survived, and the worker came back: a cheap job runs to completion
  const jobsAfter = (await listJobs()).map((j) => ({ id: j.id, type: j.type, status: j.status }));
  for (const j of jobsBefore) expect(jobsAfter.find((x) => x.id === j.id), `job ${j.id} still listed`).toBeTruthy();
  const probe = await startJob('MEDIA_PROBE', { assetId: made.clipId }, `qa-restart-${Date.now()}`);
  expect(probe.status).toBe(201);
  await expect.poll(async () => (await getJob(probe.job.id)).job.status, { timeout: 120_000, message: 'the worker picks up a job after the restart' }).toMatch(/COMPLETED|FAILED/);
  expect((await getJob(probe.job.id)).job.status, 'the probe of a real file completes').toBe('COMPLETED');
});

test('API-only: the database columns hold the values the API shows (rows read through docker exec psql)', async ({}, info) => {
  await resetStudio('sample');
  const made = await makeContent(info.outputDir);
  const s = await snapshot<Snap>();
  const c = characterById(s, made.id)!;
  const rows = psql(`select id, name, name_ar, language, dialect, hair, wardrobe, portrait_asset_id, pending_reference::text, voice::text, usage_known from characters where id = '${made.id}'`);
  test.skip(rows === null, 'docker exec vewbox-db-1 psql is not reachable from this runner (set QA_DB_CONTAINER if the container is named differently)');
  expect(rows!.length, 'one row for the character').toBe(1);
  const [id, name, nameAr, language, dialect, hair, wardrobe, portrait, pendingJson, voiceJson, usageKnown] = rows![0];
  expect(id).toBe(c.id); expect(name).toBe(c.name); expect(nameAr).toBe(c.nameAr); expect(language).toBe('AR'); expect(dialect).toBe('IRAQI_BAGHDADI');
  expect(hair).toBe(c.hair); expect(wardrobe).toBe(c.wardrobe); expect(portrait || '').toBe(c.portraitAssetId ?? '');
  expect(usageKnown).toBe('t');
  const pending = JSON.parse(pendingJson) as { assetId: string; validation?: { width: number; height: number } };
  expect(pending.assetId).toBe(made.pictureId);
  expect(pending.assetId).toBe(c.pendingReference!.assetId);
  if (pending.validation) { expect(pending.validation.width).toBe(768); expect(pending.validation.height).toBe(960); }
  const voice = JSON.parse(voiceJson) as { selectedSampleId?: string; samples: Array<{ id: string; assetId?: string; source: string }> ; identity?: unknown };
  expect(voice.selectedSampleId).toBe(made.sampleId);
  expect(voice.samples.find((x) => x.id === made.sampleId)?.source).toBe('UPLOADED');
  expect(voice.identity ?? null).toEqual(c.voice.identity ?? null);
  for (const assetId of [made.pictureId, made.clipId]) {
    const a = assetOf(s, assetId)!;
    const arow = psql(`select id, kind, storage, bytes, sha256, sample, origin, width, height from assets where id = '${assetId}'`)!;
    expect(arow.length).toBe(1);
    const [aid, kind, storage, bytes, sha, sample, origin, width, height] = arow[0];
    expect(aid).toBe(a.id); expect(kind).toBe(a.kind); expect(storage).toBe('LIBRARY'); expect(Number(bytes)).toBe(a.bytes); expect(sha).toBe(a.sha256); expect(sample).toBe('f'); expect(origin).toBe('UPLOAD');
    if (a.width) { expect(Number(width)).toBe(a.width); expect(Number(height)).toBe(a.height); }
  }
  const usage = psql(`select count(*) from character_usage where character_id = '${made.id}'`)!;
  expect(usage[0][0], 'no usage row was invented').toBe('0');
  const layla = psql(`select count(*) from character_usage where character_id = 'layla' and status = 'IN_TAKE'`)!;
  expect(Number(layla[0][0]), 'the sample usage rows back the lock the API shows').toBe(characterById(s, 'layla')!.usage!.videos.filter((v) => v.status === 'IN_TAKE').length);
});
