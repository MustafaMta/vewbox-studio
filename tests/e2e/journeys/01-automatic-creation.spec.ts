import { act, assetOf, characterByName, childrenOf, control, expect, expectRealAsset, findJob, isType, jobOutcome, payloadOf, psql, requireEngines, snapshot, test, WAIT, waitForApp, waitForJob, type Snap } from '../helpers';

/** TEST 1 — AUTOMATIC CHARACTER CREATION. A name and nothing else: Casting writes the sheet, draws the portrait and
 *  the reference sheet; the voice step is skipped with its reason because no reference recording exists. The
 *  profile then shows real pictures (never a placeholder), the refs carry their view labels, the database holds
 *  exactly one new character and every job in the chain completed. Drives the real creation page (contract §1.1,
 *  UX strategy §D1, design system §8.7). */

const NAME = 'Warda Al-Qaisi';

test('automatic creation from a name only: design → appearance → sheet, voice skipped with the reason @gpu', async ({ page }) => {
  await requireEngines(['story', 'images']);
  const before = await snapshot<Snap>();
  const mediaFailures: string[] = [];
  page.on('response', (r) => { if (/\/api\/media\//.test(r.url()) && r.status() >= 400) mediaFailures.push(`${r.status()} ${r.url()}`); });

  await page.goto('/characters/new');
  await waitForApp(page);
  // TODO(copy): the three starts of §8.7 — "Describe them" (Auto) is preselected; click it anyway so the test does not depend on the default
  await control(page, /Describe them|Describe|Auto/i).click({ force: true });
  await page.getByRole('textbox', { name: /^Name/ }).fill(NAME);
  // TODO(copy): the primary action of the Auto start ("Design character")
  const design = page.getByRole('button', { name: /Design character|Design$/i }).first();
  await expect(design).toBeEnabled();
  await design.click();

  // the orchestrating job of contract §1.1, found through the jobs API, not through the page
  const parent = await findJob((j) => isType(j, 'CREATE_CHARACTER') && String(payloadOf<{ name?: string }>(j).name ?? '') === NAME, 60_000);
  expect(payloadOf<{ mode?: string }>(parent).mode, 'the page starts an AUTO creation').toBe('AUTO');
  // the stepper reports the real phases in place (no "progress shows in Activity" detour) — TODO(copy): phase names
  await expect.soft(page.getByText(/Writing the (sheet|profile)|Designing|Drawing|Reference views|Checking the image engine/i).first()).toBeVisible({ timeout: WAIT.design });

  const done = await waitForJob(parent.id, WAIT.create);
  expect(done.status, jobOutcome(done)).toBe('COMPLETED');
  const result = done.result as { characterId: string; steps: Array<{ step: string; status: string; jobId?: string; reason?: string }> };
  expect(result.characterId).toBeTruthy();
  const stepOf = (s: string) => result.steps.find((x) => x.step === s);
  expect(stepOf('design')?.status, 'design step').toBe('done');
  expect(stepOf('appearance')?.status, 'appearance step').toBe('done');
  expect(stepOf('sheet')?.status, 'sheet step').toBe('done');
  expect(stepOf('voice')?.status, 'voice step is skipped, not failed').toBe('skipped');
  expect(stepOf('voice')?.reason ?? '', 'the voice step states why').toMatch(/no (voice )?reference|no recording|upload/i);
  const children = await childrenOf(parent.id);
  expect(children.length, 'children carry parentId').toBeGreaterThanOrEqual(3);
  for (const c of children) expect(c.status, jobOutcome(c)).toBe('COMPLETED');
  expect(children.some((c) => c.type === 'VOICE_BUILD'), 'no voice job was started').toBe(false);
  expect(done.progress?.total ?? 0, 'step/total reported').toBeGreaterThanOrEqual(3);

  // the handoff: the page opens the profile (or offers it) with the "just created" banner
  // TODO(copy): "Open profile" / "Just created" banner / the voice chip
  const open = page.getByRole('button', { name: /Open profile/i }).or(page.getByRole('link', { name: /Open profile/i })).first();
  if (await open.isVisible({ timeout: 15_000 }).catch(() => false)) await open.click();
  await expect(page).toHaveURL(new RegExp(`/characters/${result.characterId}`), { timeout: 30_000 });
  await waitForApp(page);
  await expect(page.getByRole('heading', { level: 1, name: NAME })).toBeVisible();
  await expect.soft(page.getByText(/Just created/i).first()).toBeVisible();
  await expect.soft(page.getByText(/No voice yet|Add a voice/i).first()).toBeVisible();

  // the record: one new character, a real portrait, a sheet whose refs name their view, nothing sample
  const after = await snapshot<Snap>();
  expect(after.characters.length).toBe(before.characters.length + 1);
  const c = characterByName(after, NAME);
  expect(c, 'the character persisted').toBeTruthy();
  expect(c!.id).toBe(result.characterId);
  expect(c!.role.length, 'the design filled the role').toBeGreaterThan(0);
  expect(c!.personality.length, 'the design filled the personality').toBeGreaterThan(0);
  expect(c!.voice.identity, 'no voice identity was invented').toBeUndefined();
  await expectRealAsset(assetOf(after, c!.portraitAssetId), 'portrait');
  expect(c!.refs.length, 'the reference sheet').toBeGreaterThanOrEqual(3);
  for (const r of c!.refs) {
    const view = (r as { view?: string }).view;
    expect(view, `ref ${r.id} (${r.role}) carries a view label`).toBeTruthy();
    await expectRealAsset(assetOf(after, r.assetId), `ref ${view ?? r.role}`);
  }
  const portrait = assetOf(after, c!.portraitAssetId)!;
  expect(portrait.origin).toBe('GENERATED');
  expect(portrait.jobId, 'the portrait names the job that drew it').toBeTruthy();

  // the page loaded those pictures (every media response was 200) and shows them as images with the character's name
  await expect(page.getByRole('img', { name: new RegExp(NAME) }).first()).toBeVisible();
  const loaded = await page.locator('img[src^="/api/media/"]').evaluateAll((imgs) => imgs.map((i) => ({ src: (i as HTMLImageElement).src, ok: (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0 })));
  expect(loaded.length, 'library pictures on the profile').toBeGreaterThan(0);
  expect(loaded.filter((x) => !x.ok), 'every picture decoded').toEqual([]);
  expect(mediaFailures, 'media responses').toEqual([]);

  // the database row, read directly when the container is reachable from the runner
  const rows = psql(`select count(*) from characters where name = '${NAME.replace(/'/g, "''")}'`);
  if (rows) expect(rows[0][0]).toBe('1');

  // cleanup is the next test's reset; a deliberate second creation with the same name must not be silently merged
  await act('updateCharacter', c!.id, { notes: 'created by tests/e2e/journeys/01' });
});
