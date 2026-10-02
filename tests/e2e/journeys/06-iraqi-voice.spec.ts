import fs from 'node:fs';
import path from 'node:path';
import { assetOf, characterById, characterErrorRate, coverage, createCharacter, expect, expectAudioLoaded, expectRealAsset, findJob, jobOutcome, payloadOf, requireEngines, snapshot, test, WAIT, waitForApp, waitForJob, type Snap } from '../helpers';

/** TEST 6 — IRAQI ARABIC VOICE. An Iraqi-Baghdadi character built from an Arabic reference clip, then the preview
 *  «شلونك حبيبي، شخبارك؟». The reference is docs/evidence/iraqi-suite/male-long.wav, which is ENGINE OUTPUT, not an
 *  authorised recording (contract §1.5): the test therefore asserts intelligibility only — the preview transcribes
 *  with coverage ≥ 0.85 after the dialect fold — and that the audio plays. Dialect authenticity is not judged here. */

const NAME = 'Abu Haider';
const LINE = 'شلونك حبيبي، شخبارك؟';
const REFERENCE = path.join('docs', 'evidence', 'iraqi-suite', 'male-long.wav');

test('an Iraqi voice from a (synthetic) Arabic reference speaks the greeting intelligibly and the preview plays @gpu', async ({ page }, info) => {
  await requireEngines(['voice', 'transcription']);
  info.annotations.push({ type: 'reference', description: `${REFERENCE} is engine output used as a stand-in; only intelligibility is asserted, not dialect authenticity` });
  test.skip(!fs.existsSync(REFERENCE), `${REFERENCE} is missing`);
  const c = await createCharacter({ name: NAME, nameAr: 'أبو حيدر', language: 'AR', dialect: 'IRAQI_BAGHDADI', role: 'A taxi driver who knows every street in Karrada', sex: 'MALE', ageYears: 48 });
  let t0 = new Date().toISOString();

  await page.goto(`/characters/${c.id}?tab=voice`);
  await waitForApp(page);
  // the Iraqi path names the engine and asks for an Arabic recording — TODO(copy)
  await expect.soft(page.getByText(/Arabic recording|Iraqi/i).first()).toBeVisible();
  await page.getByLabel(/Upload a recording|recording/i).first().setInputFiles({ name: 'male-long.wav', mimeType: 'audio/wav', buffer: fs.readFileSync(REFERENCE) });
  await expect.poll(async () => characterById(await snapshot<Snap>(), c.id)!.voice.samples.filter((s) => s.source === 'UPLOADED' && s.assetId).length, { timeout: 60_000 }).toBe(1);
  let s = await snapshot<Snap>();
  const upload = characterById(s, c.id)!.voice.samples.find((x) => x.source === 'UPLOADED')!;
  expect.soft(upload.text ?? '', 'the reference transcript is Arabic').toMatch(/[؀-ۿ]/);

  await page.getByRole('button', { name: /Build the voice|Build/i }).first().click();
  const build = await findJob((j) => j.type === 'VOICE_BUILD' && payloadOf<{ characterId?: string }>(j).characterId === c.id && j.createdAt >= t0, 60_000);
  const built = await waitForJob(build.id, WAIT.voice);
  expect(built.status, jobOutcome(built)).toBe('COMPLETED');
  s = await snapshot<Snap>();
  const identity = characterById(s, c.id)!.voice.identity!;
  expect(identity).toBeTruthy();
  expect(identity.model, 'the Iraqi dialect engine').toBe('habibi');
  expect(identity.dialect).toBe('IRAQI_BAGHDADI');
  expect(identity.referenceAssetId).toBe(upload.assetId);

  // the preview line, through the real dialog
  t0 = new Date().toISOString();
  await page.reload();
  await waitForApp(page);
  // TODO(copy): "Preview a line"
  await page.getByRole('button', { name: /Preview a line|Preview/i }).first().click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox').first().fill(LINE);
  await dlg.getByRole('button', { name: /Preview|Speak/i }).last().click();
  const preview = await findJob((j) => j.type === 'VOICE_PREVIEW' && payloadOf<{ characterId?: string; text?: string }>(j).characterId === c.id && j.createdAt >= t0, 60_000);
  expect(payloadOf<{ text?: string }>(preview).text).toBe(LINE);
  const done = await waitForJob(preview.id, WAIT.preview);
  expect(done.status, jobOutcome(done)).toBe('COMPLETED');
  const result = done.result as { assetId: string; engine: string; check?: { wer?: number; heard?: string; coverage?: number; cer?: number } | null };
  expect(result.engine, 'routing parity: an Arabic-script line goes to the Iraqi engine').toMatch(/habibi/i);
  expect(result.check, 'the line was heard back (ASR ran)').toBeTruthy();
  const heard = result.check!.heard ?? '';
  const cov = result.check!.coverage ?? coverage(LINE, heard);
  const cer = result.check!.cer ?? characterErrorRate(LINE, heard);
  info.annotations.push({ type: 'intelligibility', description: `heard «${heard}» — coverage ${cov.toFixed(2)}, CER ${cer.toFixed(2)}, WER ${(result.check!.wer ?? NaN).toFixed(2)}` });
  expect(cov, `coverage of «${LINE}» in «${heard}»`).toBeGreaterThanOrEqual(0.85);
  expect.soft(cer, 'character error rate after the fold').toBeLessThanOrEqual(0.15);

  s = await snapshot<Snap>();
  await expectRealAsset(assetOf(s, result.assetId), 'preview line');
  const voice = characterById(s, c.id)!.voice;
  expect(voice.selectedSampleId, 'a preview never becomes the selected voice').not.toBe(voice.samples.find((x) => x.assetId === result.assetId)?.id);
  expect(voice.identity!.revision, 'a preview does not touch the identity').toBe(identity.revision);

  // it plays: the latest preview on the identity card (or the sample row) loads with a real duration
  await page.reload();
  await waitForApp(page);
  // TODO(copy): "Latest preview" play control
  const play = page.getByRole('button', { name: /^Play.*(شلونك|Latest preview|preview)/i }).first().or(page.getByRole('button', { name: /^Play/ }).last());
  await play.first().click();
  await expectAudioLoaded(page, result.assetId);
});
