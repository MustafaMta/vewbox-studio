import { expect, test } from '@playwright/test';
import { resetStudio } from './helpers';

/** The continuity surfaces of the corrective pass: the World Bible on a show, the appearance lock on a used
 *  character, and the re-record control on a production's Produce tab. */

test.beforeEach(async () => { await resetStudio('sample'); });

test('the World Bible is edited on the show page and persists on the server', async ({ page }) => {
  await page.goto('/shows/last-sip');
  const rules = page.getByRole('textbox', { name: 'Rules of the world' });
  await expect(rules).toBeVisible();
  await rules.fill('The café counter is on the left.\nNobody owns a car.');
  await page.getByRole('textbox', { name: 'Relationships' }).fill('Layla is Abu Samir’s niece.');
  await page.getByRole('textbox', { name: 'What has happened' }).fill('S1E1: the café opens again.');
  await page.getByRole('textbox', { name: 'Art direction' }).fill('Warm tungsten inside, blue dusk outside.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Rules of the world' })).toHaveValue(/Nobody owns a car/);
  await expect(page.getByRole('textbox', { name: 'Relationships' })).toHaveValue(/niece/);
});

test('a character who has been in a video shows the preservation notice and cannot regenerate the appearance', async ({ page }) => {
  await page.goto('/characters/layla');
  await expect(page.getByText('This character has been used in a video. Its appearance is preserved for continuity.')).toBeVisible();
  const regenerate = page.getByRole('button', { name: /Regenerate appearance|Generate appearance/ });
  if (await regenerate.count()) await expect(regenerate.first()).toBeDisabled();
});

test('the Produce tab offers to re-record speaking shots whose takes were never checked against the script', async ({ page }) => {
  await page.goto('/shows/last-sip/seasons/last-sip-s1/episodes/s1e1?tab=produce');
  const respeak = page.getByRole('button', { name: /New takes for the speaking shots/ });
  await expect(respeak).toBeVisible();
  await expect(respeak).toContainText('Re-record speaking shots');
});
