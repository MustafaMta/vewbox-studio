import { assetOf, characterByName, childrenOf, control, expect, expectRealAsset, findJob, isType, jobOutcome, payloadOf, requireEngines, scaledPlate, snapshot, test, uploadAsset, WAIT, waitForApp, waitForJob, type Snap } from '../helpers';

/** TEST 3 — REFERENCE-BASED CREATION. A picture first. tests/fixtures/plate.png scaled with ffmpeg to 768×960 stands
 *  in for a real photograph (so the face check, when it runs, may legitimately report no face — the assertions below
 *  are on the size rule and on the record, not on a face being found); a 100×100 picture must be refused with the
 *  shortest-side reason. The pending reference and its validation are shown on the page and stored on the record
 *  (contract §1.2). The drawing itself is the `@gpu` half. */

const NAME = 'Maysoon Hadi';

test('a reference picture is validated before anything is generated: the small one is refused, the usable one is recorded with its measurements', async ({ page }, info) => {
  const small = scaledPlate(100, 100, info.outputDir);
  const usable = scaledPlate(768, 960, info.outputDir);

  // the server rule, through the API: min side 512, stated in the reasons (refused outright, or accepted with ok:false — both name 512)
  const r1 = await uploadAsset(small, { expect: 'IMAGE', purpose: 'character-reference' });
  const reasons = ((r1.validation?.reasons as string[] | undefined) ?? []).join(' ') + ' ' + (r1.error?.message ?? '');
  expect([201, 400, 422]).toContain(r1.status);
  if (r1.status === 201) expect(r1.validation?.ok, 'a 100×100 picture is not usable').toBe(false);
  expect(reasons, 'the reason names the minimum side').toMatch(/512|shortest side|too small/i);
  const r2 = await uploadAsset(usable, { expect: 'IMAGE', purpose: 'character-reference' });
  expect(r2.status).toBe(201);
  expect(r2.validation, 'the usable upload carries its validation').toBeTruthy();
  expect(r2.validation!.width).toBe(768);
  expect(r2.validation!.height).toBe(960);
  expect(Array.isArray(r2.validation!.reasons)).toBe(true);
  expect(typeof r2.validation!.sharpness).toBe('number');
  expect(typeof r2.validation!.faces).toBe('number');

  // the same rule in the browser, on the Appearance tab of an unused sample character (the reference stays pending
  // until a drawing replaces the portrait — it never becomes the appearance)
  await page.goto('/characters/nour');
  await waitForApp(page);
  // TODO(copy): the reference dropzone label ("Upload a reference")
  await page.getByLabel(/Upload a reference/i).setInputFiles(small);
  await expect(page.getByRole('alert').or(page.getByRole('status')).filter({ hasText: /512|shortest side|too small/i }).first()).toBeVisible();
  let s = await snapshot<Snap>();
  expect(s.characters.find((c) => c.id === 'nour')!.pendingReference, 'a refused picture is not recorded').toBeUndefined();

  await page.getByLabel(/Upload a reference|Replace/i).first().setInputFiles(usable);
  await expect(page.getByRole('img', { name: /Your reference/i })).toBeVisible();
  await expect.poll(async () => (await snapshot<Snap>()).characters.find((c) => c.id === 'nour')!.pendingReference?.assetId ?? null).not.toBeNull();
  s = await snapshot<Snap>();
  const nour = s.characters.find((c) => c.id === 'nour')!;
  const pending = nour.pendingReference as { assetId: string; validation?: { ok: boolean; width: number; height: number; reasons: string[] } };
  expect(pending.validation, 'the validation is stored on the record').toBeTruthy();
  expect(pending.validation!.width).toBe(768);
  expect(pending.validation!.height).toBe(960);
  expect(nour.portraitAssetId, 'the reference is not the appearance').toBe('portrait-nour');
  // the page shows the measurements it stored — TODO(copy): the validation badges
  await expect.soft(page.getByText(/768\s*[×x]\s*960/).first()).toBeVisible();
  const a = assetOf(s, pending.assetId)!;
  expect(a.width).toBe(768); expect(a.height).toBe(960); expect(a.sample).toBe(false);
  await page.reload();
  await waitForApp(page);
  await expect(page.getByRole('img', { name: /Your reference/i })).toBeVisible();
});

test('creation from a picture draws the appearance from the validated reference and shows the pair @gpu', async ({ page }, info) => {
  await requireEngines(['images']);
  const before = await snapshot<Snap>();
  const small = scaledPlate(100, 100, info.outputDir);
  const usable = scaledPlate(768, 960, info.outputDir);
  await page.goto('/characters/new');
  await waitForApp(page);
  // TODO(copy): the "From a picture" start and its dropzone
  await control(page, /From a picture|picture|reference/i).click({ force: true });
  const drop = page.locator('input[type=file]').first();
  await drop.setInputFiles(small);
  await expect(page.getByRole('alert').or(page.getByRole('status')).filter({ hasText: /512|shortest side|too small/i }).first()).toBeVisible();
  await drop.setInputFiles(usable);
  await expect(page.getByRole('img', { name: /Your reference/i })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('textbox', { name: /^Name/ }).fill(NAME);
  // TODO(copy): "Design from picture"
  await page.getByRole('button', { name: /Design from picture|Draw|Design/i }).first().click();

  const parent = await findJob((j) => isType(j, 'CREATE_CHARACTER') && payloadOf<{ mode?: string }>(j).mode === 'REFERENCE', 60_000);
  const referenceAssetId = payloadOf<{ referenceAssetId?: string }>(parent).referenceAssetId;
  expect(referenceAssetId, 'the job carries the validated upload').toBeTruthy();
  const done = await waitForJob(parent.id, WAIT.create);
  expect(done.status, jobOutcome(done)).toBe('COMPLETED');
  const result = done.result as { characterId: string; steps: Array<{ step: string; status: string; reason?: string }> };
  expect(result.steps.find((x) => x.step === 'appearance')?.status).toBe('done');
  for (const c of await childrenOf(parent.id)) expect(c.status, jobOutcome(c)).toBe('COMPLETED');

  const after = await snapshot<Snap>();
  expect(after.characters.length).toBe(before.characters.length + 1);
  const c = characterByName(after, NAME)!;
  expect(c.id).toBe(result.characterId);
  await expectRealAsset(assetOf(after, c.portraitAssetId), 'portrait from reference');
  const prov = assetOf(after, c.portraitAssetId)!.provenance ?? {};
  expect(JSON.stringify(prov), 'the provenance names the reference actually used').toContain(referenceAssetId!);
  // the handoff: profile with the reference → result pair; the reference asset itself is kept (never deleted)
  const open = page.getByRole('button', { name: /Open profile|Use this look/i }).or(page.getByRole('link', { name: /Open profile/i })).first();
  if (await open.isVisible({ timeout: 15_000 }).catch(() => false)) await open.click();
  await expect(page).toHaveURL(new RegExp(`/characters/${c.id}`), { timeout: 30_000 });
  await waitForApp(page);
  await expect(page.getByRole('img', { name: new RegExp(NAME) }).first()).toBeVisible();
  expect(assetOf(after, referenceAssetId), 'the uploaded reference stays in the library').toBeTruthy();
});
