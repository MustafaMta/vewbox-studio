import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { assetOf, characterById, createCharacter, expect, expectRealAsset, findJob, jobOutcome, media, payloadOf, requireEngines, scaledPlate, send, snapshot, test, uploadAsset, WAIT, waitForApp, waitForJob, type Snap } from '../helpers';

/** TEST 4 — THE CANONICAL IMAGE OF AN UNUSED CHARACTER: DRAFT → APPROVE → REDRAW (contract v2). A character has one
 *  canonical front full-body image. A new drawing is a DRAFT one version further; the producer approves it by version
 *  (an approval for a version that has since changed is refused CONFLICT); a redraw makes the next version a DRAFT
 *  again, and the picture it replaces stays in the library (RAW, still served) — the studio never deletes a picture
 *  it drew. The first test drives the lifecycle with uploaded pictures standing in for drawings (no GPU); the second
 *  redraws for real from the profile's Redraw dialog (docs/CONTRACTS-IDENTITY-PACK.md v2). */

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vewbox-j04-'));

/** An uploaded picture recorded as the character's canonical image, as the worker records a drawing. */
async function canonicalFromUpload(characterId: string, width: number, height: number, dir: string): Promise<string> {
  const up = await uploadAsset(scaledPlate(width, height, dir), { expect: 'IMAGE', label: `canonical ${width}x${height}` });
  expect(up.status, JSON.stringify(up.raw)).toBe(201);
  const r = await send([{ name: 'setCanonicalImage', args: [characterId, { assetId: up.asset!.id, engine: 'upload (journey 04)' }] }]);
  expect(r.body.ok, JSON.stringify(r.body.error)).toBe(true);
  return up.asset!.id;
}

test('draft → approve by version → a new draft keeps the previous picture; a stale approval is refused', async ({ page }) => {
  const dir = tmp();
  const c = await createCharacter({ name: 'QA Canonical', language: 'EN' });
  expect(characterById(await snapshot<Snap>(), c.id)!.canonicalImage, 'no image yet').toBeUndefined();

  // version 1, a DRAFT: the profile says so once and offers Approve
  const first = await canonicalFromUpload(c.id, 768, 1152, dir);
  let s = await snapshot<Snap>();
  expect(characterById(s, c.id)!.canonicalImage).toMatchObject({ assetId: first, status: 'DRAFT', version: 1 });
  expect(assetOf(s, first)!.tier).toBe('CANONICAL');
  await page.goto(`/characters/${c.id}`);
  await waitForApp(page);
  await expect(page.getByText('Draft — awaiting your approval').first()).toBeVisible();
  await page.getByRole('button', { name: 'Approve image' }).click();
  await expect.poll(async () => characterById(await snapshot<Snap>(), c.id)!.canonicalImage?.status, { timeout: 15_000 }).toBe('APPROVED');
  await expect(page.getByRole('button', { name: 'Approve image' })).toHaveCount(0);

  // version 2 replaces it as a DRAFT; version 1 stays in the library, demoted to RAW, still served
  const second = await canonicalFromUpload(c.id, 832, 1216, dir);
  s = await snapshot<Snap>();
  expect(characterById(s, c.id)!.canonicalImage).toMatchObject({ assetId: second, status: 'DRAFT', version: 2 });
  expect(assetOf(s, first), 'the previous picture is kept').toBeTruthy();
  expect(assetOf(s, first)!.tier, 'and never shown as the identity again').toBe('RAW');
  expect((await media(assetOf(s, first)!.src)).status, 'still served').toBe(200);

  // approving the version that was reviewed earlier is refused: never approve a stale image
  const stale = await send([{ name: 'approveCanonicalImage', args: [c.id, 1] }]);
  expect(stale.body.ok).toBe(false);
  expect(stale.body.error?.code).toBe('CONFLICT');
  expect(characterById(await snapshot<Snap>(), c.id)!.canonicalImage?.status).toBe('DRAFT');

  // the page follows: version 2 is the draft on screen, and approving it is the producer's act
  await page.reload();
  await waitForApp(page);
  await expect.poll(async () => page.locator(`img[src*="${second}"]`).count()).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Approve image' }).click();
  await expect.poll(async () => characterById(await snapshot<Snap>(), c.id)!.canonicalImage, { timeout: 15_000 }).toMatchObject({ status: 'APPROVED', version: 2 });
});

test('Redraw draws the next version as a draft and keeps the approved one @gpu', async ({ page }) => {
  await requireEngines(['images']);
  const dir = tmp();
  const c = await createCharacter({ name: 'QA Redraw', language: 'EN' });
  const first = await canonicalFromUpload(c.id, 768, 1152, dir);
  expect((await send([{ name: 'approveCanonicalImage', args: [c.id, 1] }])).body.ok).toBe(true);

  const t0 = new Date().toISOString();
  await page.goto(`/characters/${c.id}`);
  await waitForApp(page);
  await expect(page.getByText(/preserved for continuity/i)).toHaveCount(0);
  await page.getByRole('button', { name: 'Redraw', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Redraw image' }).click();
  const job = await findJob((j) => j.type === 'CHARACTER_APPEARANCE' && payloadOf<{ characterId?: string }>(j).characterId === c.id && j.createdAt >= t0, 60_000);
  // the phase is shown in the frame while it draws
  await expect.soft(page.getByText(/Drawing/).first()).toBeVisible({ timeout: 60_000 });
  const done = await waitForJob(job.id, WAIT.image);
  expect(done.status, jobOutcome(done)).toBe('COMPLETED');

  const s = await snapshot<Snap>();
  const img = characterById(s, c.id)!.canonicalImage!;
  expect(img.status, 'a redraw is a draft until approved').toBe('DRAFT');
  expect(img.version).toBe(2);
  expect(img.assetId).not.toBe(first);
  expect(img.jobId).toBe(job.id);
  await expectRealAsset(assetOf(s, img.assetId), 'redrawn canonical image');
  expect(assetOf(s, img.assetId)!.jobId).toBe(job.id);
  expect(assetOf(s, first)!.tier, 'the approved picture is kept, as RAW').toBe('RAW');
  expect((await media(assetOf(s, first)!.src)).status).toBe(200);
  // nothing else was drawn: no portrait, no reference views
  expect(characterById(s, c.id)!.portraitAssetId).toBeUndefined();
  expect(characterById(s, c.id)!.refs).toEqual([]);
  // the page shows the new draft, not the old picture
  await expect.poll(async () => page.locator(`img[src*="${img.assetId}"]`).count(), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(page.getByText('Draft — awaiting your approval').first()).toBeVisible();
});
