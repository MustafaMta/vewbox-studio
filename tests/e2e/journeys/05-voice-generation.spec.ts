import { assetOf, characterById, createCharacter, expect, expectAudioLoaded, expectRealAsset, findJob, fixture, jobOutcome, payloadOf, requireEngines, snapshot, test, WAIT, waitForApp, waitForJob, type Snap } from '../helpers';

/** TEST 5 — VOICE GENERATION. A fresh English character; tests/fixtures/speech-en.wav uploaded as the reference on
 *  the Voice tab (validated there), "Build the voice", the proof line played back in the browser. The identity
 *  carries its proof, its `referenceAssetId` is the ORIGINAL upload, and the selected sample is the upload — the
 *  generated proof line is added as a sample but never selected (contract §1.4). */

const NAME = 'Hollis Grant';
const PROOF_TEXT_RE = /my name is/i;

test('upload a reference, build the voice, play the proof line; the identity points at the upload, never the generated line @gpu', async ({ page }) => {
  await requireEngines(['voice', 'transcription']);
  const c = await createCharacter({ name: NAME, language: 'EN', role: 'A night-shift radio host', sex: 'MALE', ageYears: 52, hair: 'Grey, swept back', wardrobe: 'A corduroy jacket' });
  const t0 = new Date().toISOString();

  await page.goto(`/characters/${c.id}?tab=voice`);
  await waitForApp(page);
  // identity card first (empty state with the two actions), the lock note absent for an unused character without a voice
  await expect(page.getByText(/spoken in a video/i)).toHaveCount(0);
  // TODO(copy): the reference dropzone on the Voice tab ("Upload a recording")
  await page.getByLabel(/Upload a recording|recording/i).first().setInputFiles(fixture('speech-en.wav'));
  await expect(page.getByRole('status').or(page.getByRole('alert')).filter({ hasText: /Recording added|added|validated|Reference/i }).first()).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => characterById(await snapshot<Snap>(), c.id)!.voice.samples.filter((s) => s.source === 'UPLOADED' && s.assetId).length, { timeout: 60_000 }).toBe(1);
  let s = await snapshot<Snap>();
  const upload = characterById(s, c.id)!.voice.samples.find((x) => x.source === 'UPLOADED')!;
  const uploadAsset = assetOf(s, upload.assetId)!;
  expect(uploadAsset.sample).toBe(false);
  expect(uploadAsset.durationSeconds ?? 0, 'the upload was probed').toBeGreaterThan(5);
  // the measured badges (duration, loudness, detected language) and the ASR transcript stored as the sample's text — TODO(copy)
  await expect.soft(page.getByText(/6[.,]\d\s*s|0:06/).first()).toBeVisible();
  expect.soft(upload.text ?? '', 'the reference transcript is stored on the sample').toMatch(/bus|Karrada|midnight|driver/i);

  // TODO(copy): "Build the voice"
  const build = page.getByRole('button', { name: /Build the voice|Build/i }).first();
  await expect(build).toBeEnabled();
  await build.click();
  const job = await findJob((j) => j.type === 'VOICE_BUILD' && payloadOf<{ characterId?: string }>(j).characterId === c.id && j.createdAt >= t0, 60_000);
  expect.soft(['REFERENCE', 'AUTOMATIC', undefined]).toContain(payloadOf<{ mode?: string }>(job).mode);
  // phases shown in place: reference → speaking → listening back — TODO(copy)
  await expect.soft(page.getByText(/Reference recording|Speaking a proof line|Listening back|Cloning/i).first()).toBeVisible({ timeout: 90_000 });
  const done = await waitForJob(job.id, WAIT.voice);
  expect(done.status, jobOutcome(done)).toBe('COMPLETED');

  s = await snapshot<Snap>();
  const voice = characterById(s, c.id)!.voice;
  const identity = voice.identity as (NonNullable<typeof voice.identity> & { proof?: { sampleId: string; assetId: string; text: string; wer?: number; coverage?: number; heard?: string }; status?: string; mode?: string; referenceSampleId?: string; jobId?: string }) | undefined;
  expect(identity, 'a voice identity exists').toBeTruthy();
  expect(identity!.revision).toBe(1);
  expect(identity!.language).toBe('EN');
  expect(identity!.referenceAssetId, 'the identity references the ORIGINAL upload').toBe(upload.assetId);
  expect(identity!.proof, 'the identity carries its proof').toBeTruthy();
  expect(identity!.proof!.text).toMatch(PROOF_TEXT_RE);
  expect(identity!.proof!.text).toContain(NAME);
  expect(identity!.jobId ?? job.id).toBe(job.id);
  expect(['ACTIVE', 'REVIEW']).toContain(identity!.status ?? 'ACTIVE');
  if (identity!.status === 'ACTIVE') { expect(identity!.proof!.coverage ?? 1).toBeGreaterThanOrEqual(0.85); }
  const proofSample = voice.samples.find((x) => x.id === identity!.proof!.sampleId)!;
  expect(proofSample, 'the proof line is a sample').toBeTruthy();
  expect(proofSample.source).toBe('GENERATED');
  expect(proofSample.assetId).toBe(identity!.proof!.assetId);
  await expectRealAsset(assetOf(s, proofSample.assetId), 'proof line');
  // the selection: the upload, never the generated line
  expect(voice.selectedSampleId, 'a sample is selected').toBeTruthy();
  const selected = voice.samples.find((x) => x.id === voice.selectedSampleId)!;
  expect(selected.source, 'the selected sample is the upload').toBe('UPLOADED');
  expect(selected.assetId).toBe(upload.assetId);
  expect(voice.selectedSampleId).not.toBe(proofSample.id);

  // play the proof line on the identity card: the shared <audio> loads the proof file with a real duration
  await page.reload();
  await waitForApp(page);
  // TODO(copy): the identity card's play control; the first Play on the card is the proof line
  const card = page.getByRole('region', { name: /Voice identity|voice/i }).first();
  const play = (await card.isVisible().catch(() => false)) ? card.getByRole('button', { name: /^Play/ }).first() : page.getByRole('button', { name: /^Play/ }).first();
  await play.click();
  await expectAudioLoaded(page, proofSample.assetId!);
  // the engine is named in words, the verified/needs-a-listen result is visible — TODO(copy)
  await expect.soft(page.getByText(/Bilingual studio engine|IndexTTS|MiniMax clone|Iraqi dialect engine/i).first()).toBeVisible();
  await expect.soft(page.getByText(/Verified|Needs a listen|Heard/i).first()).toBeVisible();
});
