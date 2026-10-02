import { expect, test } from '@playwright/test';
import { BASE, resetStudio } from './helpers';

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

test('a character who has spoken in a video keeps the voice: the notice shows, the build is disabled, another recording cannot be chosen', async ({ page }) => {
  await page.goto('/characters/layla?tab=voice');
  await expect(page.getByText('This character has spoken in a video. The voice identity is preserved for continuity')).toBeVisible();
  const build = page.getByRole('button', { name: 'Build the voice' });
  if (await build.count()) await expect(build.first()).toBeDisabled();
  const other = page.getByRole('radio', { name: /^Select / , checked: false });
  if (await other.count()) await expect(other.first()).toBeDisabled();
  // the server refuses too, whatever the client sends
  const snap = await (await fetch(`${BASE}/api/studio`)).json() as { state: { characters: Array<{ id: string; voice: { samples: Array<{ id: string; assetId?: string }>; selectedSampleId?: string } }> } };
  const layla = snap.state.characters.find((c) => c.id === 'layla')!;
  const another = layla.voice.samples.find((s) => s.id !== layla.voice.selectedSampleId && s.assetId);
  if (another) {
    const r = await fetch(`${BASE}/api/commands`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId: 'e2e', commands: [{ name: 'selectVoiceSample', args: ['layla', another.id], seed: 'e2e-voice-lock', at: new Date().toISOString() }] }) });
    const body = await r.json() as { ok: boolean; error?: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe('VOICE_LOCKED');
  }
});

test('the Produce tab offers to re-record speaking shots whose takes were never checked against the script', async ({ page }) => {
  await page.goto('/shows/last-sip/seasons/last-sip-s1/episodes/s1e1?tab=produce');
  const respeak = page.getByRole('button', { name: /New takes for the speaking shots/ });
  await expect(respeak).toBeVisible();
  await expect(respeak).toContainText('Re-record speaking shots');
});
