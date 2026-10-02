import fs from 'node:fs';
import path from 'node:path';
import { act, characterById, expect, findJob, jobOutcome, payloadOf, requireEngines, send, snapshot, test, uploadAsset, WAIT, waitForApp, waitForJob, type Snap } from '../helpers';

/** TEST 8 — IDENTITY LOCKING. Nour (unused, with a portrait and sheet) is given a chosen recording, cast in a new
 *  one-shot short, and a take is generated for that shot from the shot editor. From that moment her look and voice
 *  are preserved: the Appearance regenerate control and the Voice build are disabled with the notice, and the
 *  command API refuses `setCharacterAppearance` (APPEARANCE_LOCKED) and `selectVoiceSample` (VOICE_LOCKED) with the
 *  status the API returns for a locked record (423 for the code, 409 for a failed batch) — contract §1.6. */

const ID = 'nour';
const REFERENCE = path.join('docs', 'evidence', 'iraqi-suite', 'male-long.wav');

test('a character used in a generated take is locked in the UI and at the API @gpu', async ({ page }) => {
  await requireEngines(['video']);
  const before = await snapshot<Snap>();
  expect(characterById(before, ID)!.usage?.videos ?? [], 'Nour starts unused').toEqual([]);

  // a chosen recording so the voice lock has something to protect (the voice rule locks only when a voice exists)
  const clip = fs.existsSync(REFERENCE) ? { name: 'nour-reference.wav', mimeType: 'audio/wav', buffer: fs.readFileSync(REFERENCE) } : { name: 'nour-reference.wav', mimeType: 'audio/wav', buffer: fs.readFileSync(path.join('tests', 'fixtures', 'speech-en.wav')) };
  const up = await uploadAsset(clip, { expect: 'AUDIO', label: 'Nour — reference' });
  expect(up.status, JSON.stringify(up.raw)).toBe(201);
  await act('addVoiceRecording', ID, up.asset!.id, 'nour-reference');
  let s = await snapshot<Snap>();
  const recording = characterById(s, ID)!.voice.samples.find((x) => x.assetId === up.asset!.id)!;
  await act('selectVoiceSample', ID, recording.id);

  // a one-shot short with Nour in it
  const prod = await act<{ production: { id: string } }>('addProduction', { kind: 'SHORT', title: 'QA Lock Short', logline: 'One shot, one take, one lock.', synopsis: 'Nour at the rail at dusk.', style: 'REALISTIC', language: 'AR', dialect: 'MSA', aspect: 'WIDE_16_9', targetSeconds: 10, brief: { mode: 'MANUAL', text: 'Nour at the rail at dusk, one shot.' }, castIds: [ID], locationIds: ['riverbank'] });
  s = await snapshot<Snap>();
  const production = s.productions.find((p) => p.title === 'QA Lock Short') ?? s.productions.find((p) => p.id === prod?.production?.id);
  expect(production, 'the short persisted').toBeTruthy();
  await act('addScene', production!.id, { title: 'The rail', timeOfDay: 'DUSK', locationId: 'riverbank', characterIds: [ID] });
  s = await snapshot<Snap>();
  const scene = s.productions.find((p) => p.id === production!.id)!.scenes[0];
  await act('addShot', production!.id, { sceneId: scene.id, purpose: 'Nour turns from the water', action: 'Nour stands at the embankment rail at dusk and turns slowly toward the camera; string lights come on behind her.', framing: 'MEDIUM', cameraMove: 'STATIC', durationSeconds: 5, characterIds: [ID], dialogue: [], transition: 'CUT' });
  s = await snapshot<Snap>();
  const shot = s.productions.find((p) => p.id === production!.id)!.shots[0];
  expect(shot).toBeTruthy();

  // the take, from the real shot editor; the lock is announced before it happens (UX §F1) — TODO(copy)
  const t0 = new Date().toISOString();
  await page.goto(`/shorts/${production!.id}/shots/${shot.id}`);
  await waitForApp(page);
  await expect.soft(page.getByText(/will fix the look and voice|fix the look/i).first()).toBeVisible();
  await page.getByRole('button', { name: /Generate video/i }).first().click();
  const job = await findJob((j) => j.type === 'GENERATE_TAKE' && payloadOf<{ shotId?: string }>(j).shotId === shot.id && j.createdAt >= t0, 60_000);
  const done = await waitForJob(job.id, WAIT.take);
  expect(done.status, jobOutcome(done)).toBe('COMPLETED');

  s = await snapshot<Snap>();
  const nour = characterById(s, ID)!;
  const takes = s.productions.find((p) => p.id === production!.id)!.shots[0].takes;
  expect(takes.length, 'a take exists').toBeGreaterThanOrEqual(1);
  expect(takes[0].provider).not.toBe('SAMPLE');
  expect(nour.usage?.known).toBe(true);
  expect(nour.usage?.videos.some((v) => v.productionId === production!.id && v.shotId === shot.id), 'the usage record names the short, the shot and the take').toBe(true);

  // the UI: hero status, Appearance tab, Voice tab
  await page.goto(`/characters/${ID}`);
  await waitForApp(page);
  await expect(page.getByText(/used in a video|preserved for continuity/i).first()).toBeVisible();
  const regenerate = page.getByRole('button', { name: /Regenerate appearance|Generate appearance|Regenerate/i }).first();
  await expect(regenerate).toBeDisabled();
  await expect(regenerate).toHaveAttribute('aria-describedby', /.+/);
  await expect(page.getByText('QA Lock Short').first()).toBeVisible();
  await page.goto(`/characters/${ID}?tab=voice`);
  await waitForApp(page);
  await expect(page.getByText(/spoken in a video|voice .*preserved/i).first()).toBeVisible();
  const build = page.getByRole('button', { name: /Build the voice|Rebuild the voice|Build/i }).first();
  await expect(build).toBeDisabled();
  await expect(build).toHaveAttribute('aria-describedby', /.+/);
  const other = page.getByRole('radio', { name: /^Select /, checked: false }).first();
  if (await other.isVisible().catch(() => false)) await expect(other).toBeDisabled();

  // the API: the appearance and the chosen recording are refused with the lock codes, atomically
  const r1 = await send([{ name: 'setCharacterAppearance', args: [ID, { portraitAssetId: 'portrait-layla' }] }]);
  expect([409, 423]).toContain(r1.status);
  expect(r1.body.ok).toBe(false);
  expect(r1.body.error?.code).toBe('APPEARANCE_LOCKED');
  const another = nour.voice.samples.find((x) => x.id !== nour.voice.selectedSampleId && x.assetId);
  expect(another, 'another sample to try').toBeTruthy();
  const r2 = await send([{ name: 'selectVoiceSample', args: [ID, another!.id] }]);
  expect([409, 423]).toContain(r2.status);
  expect(r2.body.ok).toBe(false);
  expect(r2.body.error?.code).toBe('VOICE_LOCKED');
  const r3 = await send([{ name: 'updateCharacter', args: [ID, { hair: 'Shaved' }] }]);
  expect(r3.body.ok).toBe(false);
  expect(r3.body.error?.code).toBe('APPEARANCE_LOCKED');
  const after = await snapshot<Snap>();
  expect(characterById(after, ID)!.portraitAssetId).toBe(nour.portraitAssetId);
  expect(characterById(after, ID)!.voice.selectedSampleId).toBe(nour.voice.selectedSampleId);
  expect(characterById(after, ID)!.hair).toBe(nour.hair);
  // the lock reason reaches the snapshot through the usage record (contract §1.6)
  expect(characterById(after, ID)!.usage!.videos[0].status).toBe('IN_TAKE');
});

test('the lock codes are refused for the sample character already used in a take (no generation needed)', async () => {
  // Layla has been in a take of The Last Sip and speaks with a chosen voice: the same refusals, without a GPU
  const s = await snapshot<Snap>();
  const layla = characterById(s, 'layla')!;
  const r1 = await send([{ name: 'setCharacterAppearance', args: ['layla', { portraitAssetId: 'portrait-nour' }] }]);
  expect([409, 423]).toContain(r1.status);
  expect(r1.body.error?.code).toBe('APPEARANCE_LOCKED');
  const another = layla.voice.samples.find((x) => x.id !== layla.voice.selectedSampleId && x.assetId);
  if (another) {
    const r2 = await send([{ name: 'selectVoiceSample', args: ['layla', another.id] }]);
    expect([409, 423]).toContain(r2.status);
    expect(r2.body.error?.code).toBe('VOICE_LOCKED');
  }
  if (layla.voice.identity) {
    // contract §1.1: a language/dialect change on a used character with an identity is refused
    const r3 = await send([{ name: 'updateCharacter', args: ['layla', { language: 'EN' }] }]);
    expect(r3.body.ok).toBe(false);
    expect(r3.body.error?.code).toBe('VOICE_LOCKED');
  }
  // and the appearance fields of a used character are refused however they arrive
  const r4 = await send([{ name: 'updateCharacter', args: ['layla', { hair: 'Bleached' }] }]);
  expect(r4.body.ok).toBe(false);
  expect(r4.body.error?.code).toBe('APPEARANCE_LOCKED');
});
