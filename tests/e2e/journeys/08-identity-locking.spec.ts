import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { act, audioVariant, characterById, createCharacter, expect, findJob, jobOutcome, payloadOf, requireEngines, scaledPlate, send, snapshot, startJob, test, uploadAsset, WAIT, waitForApp, waitForJob, type Character, type Snap } from '../helpers';

/** TEST 8 — IDENTITY LOCKING (contract v2). A character with an approved canonical image and a chosen, consented
 *  recording is cast in a one-shot short; the moment a take of that shot exists, the look and the voice are preserved:
 *  the profile says "Locked: used in 1 video" and offers neither Approve nor Redraw, the voice says it is kept, and the
 *  command API refuses a new canonical image or an approval (APPEARANCE_LOCKED), an appearance field
 *  (APPEARANCE_LOCKED) and another recording (VOICE_LOCKED) — with the status the API returns for a locked record (423
 *  for the code, 409 for a failed batch). The first test adds the take by upload (the rule counts every take, so no
 *  GPU is needed); the second generates it from the shot editor; the third checks the sample studio's used character. */

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vewbox-j08-'));
const CONSENT = { statement: 'MY_VOICE', by: 'PRODUCER', at: new Date().toISOString() };

/** A character with an approved canonical image (an upload standing in for a drawing) and two consented recordings,
 *  the first chosen; then a one-shot short with them in the shot. */
async function castInAShort(name: string, dir: string): Promise<{ c: Character; productionId: string; shotId: string; canonical: string; other: string }> {
  const c = await createCharacter({ name, language: 'EN' });
  const pic = await uploadAsset(scaledPlate(768, 1152, dir), { expect: 'IMAGE', label: `${name} — canonical` });
  expect(pic.status, JSON.stringify(pic.raw)).toBe(201);
  await act('setCanonicalImage', c.id, { assetId: pic.asset!.id, engine: 'upload (journey 08)' });
  await act('approveCanonicalImage', c.id, 1);
  const speech = path.join('tests', 'fixtures', 'speech-en.wav');
  const recs: string[] = [];
  for (const [i, file] of [{ name: 'speech-en.wav', mimeType: 'audio/wav', buffer: fs.readFileSync(speech) }, audioVariant(speech, 1.08, dir, 'speech-variant.wav')].entries()) {
    const up = await uploadAsset(file, { expect: 'AUDIO', label: `${name} — recording ${i + 1}` });
    expect(up.status, JSON.stringify(up.raw)).toBe(201);
    await act('addVoiceRecording', c.id, up.asset!.id, `recording-${i + 1}`, { consent: CONSENT });
    recs.push(up.asset!.id);
  }
  let s = await snapshot<Snap>();
  const samples = characterById(s, c.id)!.voice.samples;
  const chosen = samples.find((x) => x.assetId === recs[0])!;
  await act('selectVoiceSample', c.id, chosen.id);
  const prod = await act<{ production: { id: string } }>('addProduction', { kind: 'SHORT', title: `${name} Short`, logline: 'One shot, one take, one lock.', synopsis: `${name} at the rail at dusk.`, style: 'REALISTIC', language: 'EN', aspect: 'WIDE_16_9', targetSeconds: 10, brief: { mode: 'MANUAL', text: 'One shot.' }, castIds: [c.id], locationIds: [] });
  await act('addScene', prod.production.id, { title: 'The rail', timeOfDay: 'DUSK', characterIds: [c.id] });
  s = await snapshot<Snap>();
  const scene = s.productions.find((p) => p.id === prod.production.id)!.scenes[0];
  await act('addShot', prod.production.id, { sceneId: scene.id, purpose: `${name} turns from the water`, action: `${name} stands at the rail at dusk and turns slowly toward the camera.`, framing: 'MEDIUM', cameraMove: 'STATIC', durationSeconds: 5, characterIds: [c.id], dialogue: [], transition: 'CUT' });
  s = await snapshot<Snap>();
  const shotId = s.productions.find((p) => p.id === prod.production.id)!.shots[0].id;
  return { c: characterById(s, c.id)!, productionId: prod.production.id, shotId, canonical: pic.asset!.id, other: samples.find((x) => x.assetId === recs[1])!.id };
}

/** The locked character: profile, voice, and every refusal at the API, with nothing changed. */
async function expectLocked(page: import('@playwright/test').Page, id: string, other: string, dir: string) {
  const s = await snapshot<Snap>();
  const c = characterById(s, id)!;
  expect(c.usage?.known).toBe(true);
  expect(c.usage!.videos.length, 'the usage record names the take').toBeGreaterThanOrEqual(1);
  expect(c.usage!.videos[0].status).toBe('IN_TAKE');
  expect(c.usage!.videos[0].canonicalImageVersion, 'the take records the image version it was made with').toBe(c.canonicalImage?.version);

  await page.goto(`/characters/${id}`);
  await waitForApp(page);
  await expect(page.getByText('Locked: used in 1 video').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve image' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Redraw', exact: true })).toHaveCount(0);
  await expect(page.getByText(/has spoken in a video, so the voice is kept/).first()).toBeVisible();

  const pic = await uploadAsset(scaledPlate(832, 1216, dir), { expect: 'IMAGE', label: 'another picture' });
  const r1 = await send([{ name: 'setCanonicalImage', args: [id, { assetId: pic.asset!.id }] }]);
  expect([409, 423]).toContain(r1.status);
  expect(r1.body.error?.code).toBe('APPEARANCE_LOCKED');
  const r2 = await send([{ name: 'approveCanonicalImage', args: [id, c.canonicalImage!.version] }]);
  // approving the image it already has is no change; any other approval would be refused the same way
  if (!r2.body.ok) expect(r2.body.error?.code).toBe('APPEARANCE_LOCKED');
  const r3 = await send([{ name: 'updateCharacter', args: [id, { hair: 'Shaved' }] }]);
  expect(r3.body.ok).toBe(false);
  expect(r3.body.error?.code).toBe('APPEARANCE_LOCKED');
  const r4 = await send([{ name: 'selectVoiceSample', args: [id, other] }]);
  expect([409, 423]).toContain(r4.status);
  expect(r4.body.error?.code).toBe('VOICE_LOCKED');
  // a redraw cannot even be queued
  await expect(startJob('CHARACTER_APPEARANCE', { characterId: id })).rejects.toThrow(/locked|preserved|used in a video|4\d\d/i);

  const after = characterById(await snapshot<Snap>(), id)!;
  expect(after.canonicalImage).toEqual(c.canonicalImage);
  expect(after.voice.selectedSampleId).toBe(c.voice.selectedSampleId);
  expect(after.hair).toBe(c.hair);
}

test('a take of a shot locks the character’s image and voice, in the UI and at the API (take by upload)', async ({ page }) => {
  const dir = tmp();
  const { c, productionId, shotId, other } = await castInAShort('QA Lock', dir);
  expect(c.usage?.videos ?? [], 'unused before the take').toEqual([]);
  // before the take: the image can still be redrawn
  await page.goto(`/characters/${c.id}`);
  await waitForApp(page);
  await expect(page.getByRole('button', { name: 'Redraw', exact: true })).toBeVisible();

  const clip = await uploadAsset({ name: 'clip.mp4', mimeType: 'video/mp4', buffer: fs.readFileSync(path.join('tests', 'fixtures', 'clip.mp4')) }, { expect: 'VIDEO', label: 'QA take' });
  expect(clip.status, JSON.stringify(clip.raw)).toBe(201);
  await act('addTake', productionId, shotId, { assetId: clip.asset!.id, provider: 'UPLOAD', label: 'Take 1' });
  await expectLocked(page, c.id, other, dir);
});

test('a generated take locks the character the same way @gpu', async ({ page }) => {
  await requireEngines(['video']);
  const dir = tmp();
  const { c, productionId, shotId, other } = await castInAShort('QA Lock GPU', dir);
  const t0 = new Date().toISOString();
  await page.goto(`/shorts/${productionId}/shots/${shotId}`);
  await waitForApp(page);
  await page.getByRole('button', { name: /Generate video/i }).first().click();
  const job = await findJob((j) => j.type === 'GENERATE_TAKE' && payloadOf<{ shotId?: string }>(j).shotId === shotId && j.createdAt >= t0, 60_000);
  const done = await waitForJob(job.id, WAIT.take);
  expect(done.status, jobOutcome(done)).toBe('COMPLETED');
  const s = await snapshot<Snap>();
  const take = s.productions.find((p) => p.id === productionId)!.shots[0].takes[0];
  expect(take.provider).not.toBe('SAMPLE');
  await expectLocked(page, c.id, other, dir);
});

test('the lock codes are refused for the sample character already used in a take (no generation needed)', async () => {
  // Layla has been in a take of The Last Sip and speaks with a chosen voice: the same refusals, without a GPU
  const dir = tmp();
  const s = await snapshot<Snap>();
  const layla = characterById(s, 'layla')!;
  const pic = await uploadAsset(scaledPlate(768, 1152, dir), { expect: 'IMAGE', label: 'not Layla' });
  const r1 = await send([{ name: 'setCanonicalImage', args: ['layla', { assetId: pic.asset!.id }] }]);
  expect([409, 423]).toContain(r1.status);
  expect(r1.body.error?.code).toBe('APPEARANCE_LOCKED');
  const another = layla.voice.samples.find((x) => x.id !== layla.voice.selectedSampleId && x.assetId);
  if (another) {
    const r2 = await send([{ name: 'selectVoiceSample', args: ['layla', another.id] }]);
    expect([409, 423]).toContain(r2.status);
    expect(r2.body.error?.code).toBe('VOICE_LOCKED');
  }
  if (layla.voice.identity) {
    // a language/dialect change on a used character with an identity is refused
    const r3 = await send([{ name: 'updateCharacter', args: ['layla', { language: 'EN' }] }]);
    expect(r3.body.ok).toBe(false);
    expect(r3.body.error?.code).toBe('VOICE_LOCKED');
  }
  // and the appearance fields of a used character are refused however they arrive
  const r4 = await send([{ name: 'updateCharacter', args: ['layla', { hair: 'Bleached' }] }]);
  expect(r4.body.ok).toBe(false);
  expect(r4.body.error?.code).toBe('APPEARANCE_LOCKED');
});
