import path from 'node:path';
import { assetOf, audioVariant, characterById, createCharacter, expect, expectRealAsset, findJob, FIXTURES, fixture, jobOutcome, media, payloadOf, requireEngines, snapshot, test, WAIT, waitForApp, waitForJob, type Snap } from '../helpers';

/** TEST 7 — VOICE REGENERATION OF AN UNUSED CHARACTER. Build once from speech-en.wav, replace the reference with a
 *  second recording (the same speech at 0.9× tempo: a different file and hash), rebuild. The identity moves to
 *  revision 2 and points at the new upload; the old proof-line asset still exists and is still served; the selected
 *  sample is the new upload (contract §1.4: the reference is the upload, never a generated line). */

const NAME = 'Perrin Vale';

test('replacing the reference and rebuilding yields a new identity revision; the old sample asset survives; the new upload is selected @gpu', async ({ page }, info) => {
  await requireEngines(['voice', 'transcription']);
  const c = await createCharacter({ name: NAME, language: 'EN', role: 'A lighthouse keeper', sex: 'FEMALE', ageYears: 61 });
  let t0 = new Date().toISOString();
  await page.goto(`/characters/${c.id}?tab=voice`);
  await waitForApp(page);

  // first build
  await page.getByLabel(/Upload a recording|recording/i).first().setInputFiles(fixture('speech-en.wav'));
  await expect.poll(async () => characterById(await snapshot<Snap>(), c.id)!.voice.samples.filter((s) => s.source === 'UPLOADED' && s.assetId).length, { timeout: 60_000 }).toBe(1);
  await page.getByRole('button', { name: /Build the voice|Build/i }).first().click();
  const first = await findJob((j) => j.type === 'VOICE_BUILD' && payloadOf<{ characterId?: string }>(j).characterId === c.id && j.createdAt >= t0, 60_000);
  const firstDone = await waitForJob(first.id, WAIT.voice);
  expect(firstDone.status, jobOutcome(firstDone)).toBe('COMPLETED');
  let s = await snapshot<Snap>();
  const v1 = characterById(s, c.id)!.voice;
  const id1 = v1.identity as NonNullable<typeof v1.identity> & { proof?: { sampleId: string; assetId: string } };
  expect(id1.revision).toBe(1);
  const upload1 = v1.samples.find((x) => x.source === 'UPLOADED')!;
  expect(id1.referenceAssetId).toBe(upload1.assetId);
  const proof1 = id1.proof!.assetId;
  await expectRealAsset(assetOf(s, proof1), 'first proof line');

  // replace the reference: a second recording, selected, then rebuild
  t0 = new Date().toISOString();
  await page.reload();
  await waitForApp(page);
  const second = audioVariant(path.join(FIXTURES, 'speech-en.wav'), 0.9, info.outputDir, 'speech-en-slower.wav');
  // TODO(copy): the "Replace" / add-another dropzone row under the existing reference
  await page.getByLabel(/Replace|Upload a recording|recording/i).first().setInputFiles(second);
  await expect.poll(async () => characterById(await snapshot<Snap>(), c.id)!.voice.samples.filter((x) => x.source === 'UPLOADED' && x.assetId).length, { timeout: 60_000 }).toBe(2);
  s = await snapshot<Snap>();
  const upload2 = characterById(s, c.id)!.voice.samples.find((x) => x.source === 'UPLOADED' && x.assetId !== upload1.assetId)!;
  expect(assetOf(s, upload2.assetId)!.sha256, 'a different recording').not.toBe(assetOf(s, upload1.assetId)!.sha256);
  // make it the chosen recording (an unused character may change it), then rebuild
  const select = page.getByRole('radio', { name: new RegExp(`Select .*${upload2.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).first();
  if (await select.isVisible().catch(() => false)) await select.click();
  await expect.poll(async () => characterById(await snapshot<Snap>(), c.id)!.voice.selectedSampleId, { timeout: 30_000 }).toBe(upload2.id);
  // TODO(copy): "Rebuild the voice" / "Build the voice"
  await page.getByRole('button', { name: /Rebuild the voice|Build the voice|Rebuild|Build/i }).first().click();
  const secondJob = await findJob((j) => j.type === 'VOICE_BUILD' && payloadOf<{ characterId?: string }>(j).characterId === c.id && j.createdAt >= t0, 60_000);
  expect(secondJob.id).not.toBe(first.id);
  const secondDone = await waitForJob(secondJob.id, WAIT.voice);
  expect(secondDone.status, jobOutcome(secondDone)).toBe('COMPLETED');

  s = await snapshot<Snap>();
  const v2 = characterById(s, c.id)!.voice;
  const id2 = v2.identity as NonNullable<typeof v2.identity> & { proof?: { sampleId: string; assetId: string } };
  expect(id2.revision, 'a new identity revision').toBe(2);
  expect(id2.referenceAssetId, 'the identity references the new upload').toBe(upload2.assetId);
  expect(id2.proof!.assetId, 'a new proof line').not.toBe(proof1);
  await expectRealAsset(assetOf(s, id2.proof!.assetId), 'second proof line');
  // the old sample asset still exists and is still served
  expect(assetOf(s, proof1), 'the first proof asset is kept').toBeTruthy();
  expect((await media(assetOf(s, proof1)!.src)).status).toBe(200);
  expect(assetOf(s, upload1.assetId), 'the first upload is kept').toBeTruthy();
  // the selection is the new upload, never a generated line
  const selected = v2.samples.find((x) => x.id === v2.selectedSampleId)!;
  expect(selected.source).toBe('UPLOADED');
  expect(selected.assetId).toBe(upload2.assetId);
  expect(v2.samples.filter((x) => x.source === 'GENERATED').length, 'both proof lines are listed, neither selected').toBeGreaterThanOrEqual(2);
  // the page reflects the revision — TODO(copy)
  await page.reload();
  await waitForApp(page);
  await expect.soft(page.getByText(/revision 2|rev\.? 2|v2/i).first()).toBeVisible();
});
