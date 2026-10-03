import { act, assetOf, characterByName, childrenOf, control, expect, expectRealAsset, findJob, isType, jobOutcome, payloadOf, psql, requireEngines, snapshot, test, WAIT, waitForApp, waitForJob, type Snap } from '../helpers';

/** TEST 1 — AUTOMATIC CHARACTER CREATION (contract v2: one canonical image + one voice identity). A name and nothing
 *  else: Casting writes the profile, the studio draws ONE canonical front full-body image, which waits as a DRAFT for
 *  the producer's approval; the voice step is skipped with its reason because no voice was asked for. There is no
 *  sheet step and no reference views: the chain is design → image → voice. The ready card offers "Review and
 *  approve"; approving on the profile makes the image the character's identity. Drives the real creation page
 *  (docs/CONTRACTS-IDENTITY-PACK.md v2, design system §9.5). */

const NAME = 'Warda Al-Qaisi';

test('automatic creation from a name only: design → one canonical image (draft) → voice skipped; approve on the profile @gpu', async ({ page }) => {
  await requireEngines(['story', 'images']);
  const before = await snapshot<Snap>();
  const mediaFailures: string[] = [];
  page.on('response', (r) => { if (/\/api\/media\//.test(r.url()) && r.status() >= 400) mediaFailures.push(`${r.status()} ${r.url()}`); });

  await page.goto('/characters/new');
  await waitForApp(page);
  await control(page, /Describe them/i, ['radio', 'button']).click({ force: true });
  await page.getByRole('textbox', { name: /^Name/ }).fill(NAME);
  const design = page.getByRole('button', { name: /^Design character$/ }).first();
  await expect(design).toBeEnabled();
  await design.click();

  // the orchestrating job, found through the jobs API, not through the page
  const parent = await findJob((j) => isType(j, 'CREATE_CHARACTER') && String(payloadOf<{ name?: string }>(j).name ?? '') === NAME, 60_000);
  expect(payloadOf<{ mode?: string }>(parent).mode, 'the page starts an AUTO creation').toBe('AUTO');
  // the stepper shows the chain's real steps in place
  await expect.soft(page.getByText(/Writing the sheet|Drawing the image/).first()).toBeVisible({ timeout: WAIT.design });

  const done = await waitForJob(parent.id, WAIT.create);
  expect(done.status, jobOutcome(done)).toBe('COMPLETED');
  const result = done.result as { characterId: string; awaitingApproval?: boolean; canonicalAssetId?: string; steps: Array<{ step: string; status: string; jobId?: string; reason?: string }> };
  expect(result.characterId).toBeTruthy();
  expect(result.steps.map((s) => s.step), 'the v2 chain: no sheet step').toEqual(['design', 'appearance', 'voice']);
  const stepOf = (s: string) => result.steps.find((x) => x.step === s)!;
  expect(stepOf('design').status, 'design step').toBe('done');
  expect(stepOf('appearance').status, 'image step').toBe('done');
  expect(stepOf('appearance').reason ?? '', 'the image waits for the producer').toMatch(/awaiting your approval/);
  expect(stepOf('voice').status, 'voice step is skipped, not failed').toBe('skipped');
  expect(stepOf('voice').reason ?? '', 'the voice step states why').toMatch(/no voice requested/);
  expect(result.awaitingApproval, 'the chain ends awaiting the approval').toBe(true);
  const children = await childrenOf(parent.id);
  expect(children.map((c) => c.type).sort(), 'exactly the design and the image').toEqual(['CHARACTER_APPEARANCE', 'DESIGN_CHARACTER']);
  for (const c of children) expect(c.status, jobOutcome(c)).toBe('COMPLETED');
  expect(done.progress?.total ?? 0, 'step/total over the three steps').toBe(3);

  // the record: one new character, one canonical image (DRAFT, version 1), nothing else drawn, nothing sample
  const after = await snapshot<Snap>();
  expect(after.characters.length).toBe(before.characters.length + 1);
  const c = characterByName(after, NAME)!;
  expect(c, 'the character persisted').toBeTruthy();
  expect(c.id).toBe(result.characterId);
  expect(c.role.length, 'the design filled the role').toBeGreaterThan(0);
  expect(c.personality.length, 'the design filled the personality').toBeGreaterThan(0);
  expect(c.voice.identity, 'no voice identity was invented').toBeUndefined();
  expect(c.canonicalImage, 'the canonical image').toBeTruthy();
  expect(c.canonicalImage!.status).toBe('DRAFT');
  expect(c.canonicalImage!.version).toBe(1);
  expect(c.canonicalImage!.assetId).toBe(result.canonicalAssetId);
  expect(c.portraitAssetId, 'no portrait is drawn any more').toBeUndefined();
  expect(c.refs, 'no reference views are drawn by creation').toEqual([]);
  const image = assetOf(after, c.canonicalImage!.assetId)!;
  await expectRealAsset(image, 'canonical image');
  expect(image.origin).toBe('GENERATED');
  expect(image.tier).toBe('CANONICAL');
  expect(image.jobId, 'the image names the job that drew it').toBe(stepOf('appearance').jobId);

  // the ready card: the draft said once, and the way to review it
  await expect(page.getByText('Draft — awaiting your approval').first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('link', { name: /Review and approve/ }).click();
  await expect(page).toHaveURL(new RegExp(`/characters/${c.id}`), { timeout: 30_000 });
  await waitForApp(page);
  await expect(page.getByRole('heading', { level: 1, name: NAME })).toBeVisible();

  // the profile shows the image (decoded, from the library), and approving it makes it the identity
  const loaded = await page.locator('img[src^="/api/media/"]').evaluateAll((imgs) => imgs.map((i) => ({ src: (i as HTMLImageElement).src, ok: (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0 })));
  expect(loaded.some((x) => x.src.includes(c.canonicalImage!.assetId)), 'the canonical image is on the profile').toBe(true);
  expect(loaded.filter((x) => !x.ok), 'every picture decoded').toEqual([]);
  expect(mediaFailures, 'media responses').toEqual([]);
  await page.getByRole('button', { name: 'Approve image' }).click();
  await expect.poll(async () => characterByName(await snapshot<Snap>(), NAME)!.canonicalImage?.status, { timeout: 15_000 }).toBe('APPROVED');
  await expect(page.getByRole('button', { name: 'Approve image' })).toHaveCount(0);

  // the database row, read directly when the container is reachable from the runner
  const rows = psql(`select count(*) from characters where name = '${NAME.replace(/'/g, "''")}'`);
  if (rows) expect(rows[0][0]).toBe('1');

  // cleanup is the next test's reset; a deliberate second creation with the same name must not be silently merged
  await act('updateCharacter', c.id, { notes: 'created by tests/e2e/journeys/01' });
});
