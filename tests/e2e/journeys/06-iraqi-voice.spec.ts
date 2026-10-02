import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { BASE, assetOf, characterById, characterErrorRate, coverage, createCharacter, expect, expectAudioLoaded, expectRealAsset, findJob, jobOutcome, payloadOf, requireEngines, snapshot, test, WAIT, waitForApp, waitForJob, type Snap } from '../helpers';

/** TEST 6 — IRAQI ARABIC VOICE. An Iraqi-Baghdadi character built from a REAL, AUTHORISED Arabic recording, then the
 *  preview «شلونك حبيبي، شخبارك؟».
 *
 *  Contract §1.5: the reference must be a real person's recording with consent, never engine output. The studio has
 *  none yet (docs/evidence/iraqi-suite-phase2-plan.md): the clips in docs/evidence/iraqi-suite/ are synthesised, and
 *  the upload route now refuses the studio's own engine output (finding 7). So the generation half NEEDS A RECORDING —
 *  put a 6–20 s authorised Iraqi recording at tests/fixtures/voice/iraqi-reference.wav (or point QA_IRAQI_REFERENCE at
 *  one) with its consent note beside it; until then it is skipped and says why. Nothing here fakes a recording.
 *  The first test needs no GPU: engine output uploaded as a "recording" is refused before anything is cloned. */

const NAME = 'Abu Haider';
const LINE = 'شلونك حبيبي، شخبارك؟';
const REFERENCE = process.env.QA_IRAQI_REFERENCE || path.join('tests', 'fixtures', 'voice', 'iraqi-reference.wav');
const CONSENT = `${REFERENCE.replace(/\.[a-z0-9]+$/i, '')}.consent.md`;

/** Upload to the voice-reference endpoint the Voice tab uses; never throws. */
async function uploadVoiceReference(characterId: string, file: { name: string; mimeType: string; buffer: Buffer }) {
  const fd = new FormData();
  fd.set('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }), file.name);
  const r = await fetch(`${BASE}/api/characters/${encodeURIComponent(characterId)}/voice-reference`, { method: 'POST', body: fd });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as { ok?: boolean; code?: string; message?: string } };
}

test('a line the studio synthesised, uploaded back as a "recording", is refused before anything is cloned', async ({}, info) => {
  const c = await createCharacter({ name: 'Umm Ali', nameAr: 'أم علي', language: 'AR', dialect: 'IRAQI_BAGHDADI', role: 'Runs the corner bakery', sex: 'FEMALE', ageYears: 55 });
  // the provenance tag docker/tts/app.py writes on every synthesised line (WAV INFO ICMT → ffprobe "comment")
  const out = path.join(info.outputDir, 'engine-line.wav');
  fs.mkdirSync(info.outputDir, { recursive: true });
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', "aevalsrc='0.2*sin(220*2*PI*t)*(0.6+0.4*sin(3*2*PI*t))':s=24000:d=6", '-metadata', 'comment=synthetic speech; engine=habibi; seed=7; not a voice reference', '-c:a', 'pcm_s16le', out]);
  const r = await uploadVoiceReference(c.id, { name: 'engine-line.wav', mimeType: 'audio/wav', buffer: fs.readFileSync(out) });
  expect(r.status).toBe(400);
  expect(r.body).toMatchObject({ ok: false, code: 'BAD_FORMAT' });
  expect(r.body.message).toMatch(/engine output/i);
  const s = await snapshot<Snap>();
  expect(characterById(s, c.id)!.voice.samples.filter((x) => x.source === 'UPLOADED'), 'nothing is kept').toHaveLength(0);
});

test('an Iraqi voice from an authorised Arabic recording speaks the greeting intelligibly and the preview plays @gpu', async ({ page }, info) => {
  test.skip(!fs.existsSync(REFERENCE), `NEEDS A RECORDING: no authorised Iraqi reference at ${REFERENCE} (contract §1.5 — engine output is refused; see docs/evidence/iraqi-suite-phase2-plan.md)`);
  test.skip(!fs.existsSync(CONSENT), `NEEDS A CONSENT NOTE: ${CONSENT} (who recorded it, who authorised its use for synthesis, when)`);
  await requireEngines(['voice', 'transcription']);
  info.annotations.push({ type: 'reference', description: `${REFERENCE} — authorised recording (${CONSENT}); intelligibility is asserted, dialect authenticity is a listening review` });
  const c = await createCharacter({ name: NAME, nameAr: 'أبو حيدر', language: 'AR', dialect: 'IRAQI_BAGHDADI', role: 'A taxi driver who knows every street in Karrada', sex: 'MALE', ageYears: 48 });
  let t0 = new Date().toISOString();

  await page.goto(`/characters/${c.id}?tab=voice`);
  await waitForApp(page);
  // the Iraqi path names the engine and asks for an Arabic recording — TODO(copy)
  await expect.soft(page.getByText(/Arabic recording|Iraqi/i).first()).toBeVisible();
  await page.getByLabel(/Upload a recording|recording/i).first().setInputFiles({ name: path.basename(REFERENCE), mimeType: 'audio/wav', buffer: fs.readFileSync(REFERENCE) });
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
  expect(typeof identity.proof?.cer, 'the proof carries its CER (the gate)').toBe('number');

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
  expect(cer, 'character error rate after the fold (the gate)').toBeLessThanOrEqual(0.15);

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
