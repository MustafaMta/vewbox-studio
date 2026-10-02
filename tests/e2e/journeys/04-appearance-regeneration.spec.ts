import { assetOf, expect, expectRealAsset, findJob, jobOutcome, media, payloadOf, requireEngines, snapshot, test, WAIT, waitForApp, waitForJob, type Snap } from '../helpers';

/** TEST 4 — APPEARANCE REGENERATION OF AN UNUSED CHARACTER. Nour (sample, never in a video) gets a new portrait
 *  from the sheet ("Regenerate appearance", automatic) and then one view redrawn from the reference sheet ("Redraw
 *  this view"). New assets appear; every previous asset still exists in the library and is still served — the
 *  studio never deletes a picture it drew (contract §1.3, UX §D3.3). */

const ID = 'nour';
const nour = (s: Snap) => s.characters.find((c) => c.id === ID)!;
const pictureIds = (s: Snap) => [nour(s).portraitAssetId, ...nour(s).refs.map((r) => r.assetId)].filter((x): x is string => Boolean(x));

async function stillThere(s: Snap, ids: string[]) {
  for (const id of ids) {
    const a = assetOf(s, id);
    expect(a, `previous asset ${id} still recorded`).toBeTruthy();
    expect((await media(a!.src)).status, `previous asset ${id} still served`).toBe(200);
  }
}

test('regenerating an unused character draws a new portrait and keeps every previous picture @gpu', async ({ page }) => {
  await requireEngines(['images']);
  const t0 = new Date().toISOString();
  const before = await snapshot<Snap>();
  const previous = pictureIds(before);
  expect(nour(before).usage?.videos ?? [], 'Nour is unused').toEqual([]);

  await page.goto(`/characters/${ID}`);
  await waitForApp(page);
  await expect(page.getByText(/preserved for continuity/i)).toHaveCount(0);
  // TODO(copy): "Regenerate appearance" (no reference pending → automatic, from the written sheet)
  const regenerate = page.getByRole('button', { name: /Regenerate appearance|Regenerate/i }).first();
  await expect(regenerate).toBeEnabled();
  await regenerate.click();
  const job = await findJob((j) => j.type === 'CHARACTER_APPEARANCE' && payloadOf<{ characterId?: string }>(j).characterId === ID && j.createdAt >= t0, 60_000);
  // the phase is shown in place, in the result frame — TODO(copy)
  await expect.soft(page.getByText(/Drawing|Checking the image engine|waiting behind/i).first()).toBeVisible({ timeout: 60_000 });
  const done = await waitForJob(job.id, WAIT.portrait);
  expect(done.status, jobOutcome(done)).toBe('COMPLETED');

  const after = await snapshot<Snap>();
  expect(nour(after).portraitAssetId, 'a new portrait').not.toBe(nour(before).portraitAssetId);
  await expectRealAsset(assetOf(after, nour(after).portraitAssetId), 'new portrait');
  expect(assetOf(after, nour(after).portraitAssetId)!.jobId).toBe(job.id);
  await stillThere(after, previous);
  // the page shows the new picture, not the old one
  await expect.poll(async () => page.getByRole('img', { name: /^Nour/ }).first().getAttribute('src')).toContain(nour(after).portraitAssetId!);
});

test('"Redraw this view" replaces one sheet view and keeps the previous one as an asset @gpu', async ({ page }) => {
  await requireEngines(['images']);
  let t0 = new Date().toISOString();
  await page.goto(`/characters/${ID}`);
  await waitForApp(page);
  // TODO(copy): the per-tile action of the identity sheet ("Redraw this view"); when the sample character has no
  // drawn sheet yet, the sheet is drawn first ("Draw reference views")
  let redraw = page.getByRole('button', { name: /Redraw this view|Redraw/i }).first();
  if (!(await redraw.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /Draw reference views|Draw the sheet|Reference views/i }).first().click();
    const sheet = await findJob((j) => j.type === 'CHARACTER_REFS' && payloadOf<{ characterId?: string }>(j).characterId === ID && j.createdAt >= t0, 60_000);
    const d = await waitForJob(sheet.id, WAIT.sheet);
    expect(d.status, jobOutcome(d)).toBe('COMPLETED');
    await page.reload();
    await waitForApp(page);
    redraw = page.getByRole('button', { name: /Redraw this view|Redraw/i }).first();
  }
  const before = await snapshot<Snap>();
  const previous = pictureIds(before);
  expect(nour(before).refs.length, 'a sheet exists').toBeGreaterThan(0);
  for (const r of nour(before).refs) expect((r as { view?: string }).view, `ref ${r.id} has a view label`).toBeTruthy();

  t0 = new Date().toISOString();
  await expect(redraw).toBeVisible();
  const tileName = (await redraw.getAttribute('aria-label')) ?? (await redraw.textContent()) ?? '';
  await redraw.click();
  const job = await findJob((j) => j.type === 'CHARACTER_REFS' && payloadOf<{ characterId?: string }>(j).characterId === ID && j.createdAt >= t0, 60_000);
  const roles = payloadOf<{ roles?: string[] }>(job).roles ?? [];
  expect.soft(roles.length, `one view requested (${tileName.trim()})`).toBe(1);
  const done = await waitForJob(job.id, WAIT.sheet);
  expect(done.status, jobOutcome(done)).toBe('COMPLETED');

  const after = await snapshot<Snap>();
  const beforeIds = new Set(nour(before).refs.map((r) => r.assetId));
  const added = nour(after).refs.filter((r) => !beforeIds.has(r.assetId));
  expect(added.length, 'a new view asset').toBeGreaterThanOrEqual(1);
  for (const r of added) { await expectRealAsset(assetOf(after, r.assetId), `redrawn view ${(r as { view?: string }).view ?? r.role}`); expect(assetOf(after, r.assetId)!.jobId).toBe(job.id); }
  expect(nour(after).refs.length, 'the sheet keeps its size (one view replaced, not appended)').toBe(nour(before).refs.length);
  await stillThere(after, previous);
  expect(nour(after).portraitAssetId, 'the portrait is untouched by a view redraw').toBe(nour(before).portraitAssetId);
  // provenance says which references were actually used (contract §1.3)
  const prov = assetOf(after, added[0].assetId)!.provenance ?? {};
  expect.soft(JSON.stringify(prov), 'provenance lists references and seed').toMatch(/reference|seed/i);
});
