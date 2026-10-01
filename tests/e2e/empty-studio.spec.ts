import { expect, tab, test } from './helpers';

/** FROM NOTHING — the studio emptied from Settings, then everything essential created without a fixture to lean on:
 *  a show with its first season and first episode, a short, a music video with a written song, a character, a
 *  location. Every creation must be reachable from an empty page, and every empty state must name its action. */

async function startEmpty(page: import('@playwright/test').Page) {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Start with an empty studio' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Start with an empty studio' }).click();
  await expect(page.getByText('The studio is empty.').first()).toBeVisible();
}
const next = (page: import('@playwright/test').Page) => page.getByRole('button', { name: 'Next', exact: true }).click();

test('the empty studio shows empty states with their actions everywhere', async ({ page }) => {
  await startEmpty(page);
  await page.goto('/');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  await expect(page.getByText('Start your first production.')).toBeVisible();
  for (const [path, empty, action] of [['/shows', 'No shows yet.', 'Add Show'], ['/shorts', 'No shorts yet.', 'Add Short'], ['/music-videos', 'No music videos yet.', 'Add Music Video'], ['/characters', 'No characters yet.', 'Add Character'], ['/locations', 'No locations yet.', 'Add Location']]) {
    await page.goto(path);
    await expect(page.getByText(empty)).toBeVisible();
    await expect(page.getByRole('link', { name: action })).toBeVisible();
  }
  await page.goto('/assets');
  await expect(page.getByText('The library is empty.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('The library is empty.')).toBeVisible();
});

test('show → season 1 → episode 1, with a character and a location created inline', async ({ page }) => {
  await startEmpty(page);
  await page.goto('/shows');
  await page.getByRole('link', { name: 'Add Show' }).click();
  await page.getByRole('button', { name: 'Write my brief' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Bread at Four');
  await page.getByRole('textbox', { name: 'Description' }).fill('A baker who wakes the street each dawn.');
  await next(page);
  await next(page);
  // no characters or locations exist: only "Create new" is offered, and it works
  await expect(page.getByRole('button', { name: 'Create new' })).toHaveCount(2);
  await page.getByRole('button', { name: 'Create new' }).first().click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox', { name: /^Name/ }).fill('Warda');
  await dlg.getByLabel('Role').fill('The baker');
  await dlg.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Warda/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Create new' }).last().click();
  await page.getByRole('dialog').getByRole('textbox', { name: /^Name/ }).fill('The bakery');
  await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('button', { name: /^The bakery/ })).toHaveAttribute('aria-pressed', 'true');
  await next(page);
  await expect(page.getByText('Warda', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create Project' }).click();
  await expect(page).toHaveURL(/\/shows\/show-[a-z0-9]+\/seasons\/season-[a-z0-9]+\/episodes\/ep-[a-z0-9]+/);
  await expect(page.getByRole('heading', { level: 1, name: 'Episode 1' })).toBeVisible();
  // back to the show: season 1 with the episode, and the canon we created
  await page.getByRole('link', { name: /Back to Bread at Four/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Bread at Four/ })).toBeVisible();
  await expect(tab(page, 'Seasons')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Season 1', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Episode 1/ })).toBeVisible();
  await tab(page, 'Characters').click();
  await expect(page.getByRole('link', { name: /Warda/ })).toBeVisible();
  await tab(page, 'Locations').click();
  await expect(page.getByRole('link', { name: /The bakery/ })).toBeVisible();
  // a second episode from the header; it inherits the show's cast
  await page.getByRole('link', { name: 'Add Episode' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'New Episode' })).toBeVisible();
  await page.getByRole('button', { name: 'Write my brief' }).click();
  await expect(page.getByText('Inherits the show’s look')).toBeVisible();
  await page.getByLabel('Title', { exact: true }).fill('Second Loaf');
  await next(page); await next(page); await next(page);
  await page.getByRole('button', { name: 'Create Project' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Second Loaf' })).toBeVisible();
  await expect(page.getByText(/Episode 2/).first()).toBeVisible();
  await tab(page, 'Characters').click();
  await expect(page.getByRole('link', { name: /Warda/ })).toBeVisible();
  await expect(page.getByText('from the show').first()).toBeVisible();
});

test('a short from an empty studio, then a scene and a shot', async ({ page }) => {
  await startEmpty(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'New Short' }).click();
  await page.getByRole('button', { name: 'Write my brief' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Late Bus');
  await next(page); await next(page); await next(page);
  await page.getByRole('button', { name: 'Create Project' }).click();
  await expect(page).toHaveURL(/\/shorts\/short-/);
  await tab(page, 'Storyboard').click();
  await expect(page.getByText('No shots yet.')).toBeVisible();
  await page.getByRole('link', { name: /Story →/ }).click();
  await page.getByRole('button', { name: 'Add Scene' }).click();
  await page.getByRole('dialog').getByLabel('Title').fill('The stop');
  await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Scene 1', { exact: true })).toBeVisible();
  await tab(page, 'Storyboard').click();
  await page.getByRole('button', { name: 'Add Shot' }).click();
  await page.getByRole('dialog').getByLabel('Purpose').fill('The bus arrives');
  await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('1 planned')).toBeVisible();
  await expect(page.getByText('No opening frame')).toBeVisible();
});

test('a music video from an empty studio with a written song and a new singer', async ({ page }) => {
  await startEmpty(page);
  await page.goto('/music-videos');
  await page.getByRole('link', { name: 'Add Music Video' }).click();
  await page.getByRole('button', { name: 'Write my brief' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Salt');
  await next(page);
  // the song is optional; an upload with nothing chosen is refused, the empty studio offers no sample track
  await page.getByRole('radio', { name: /Upload Song/ }).check({ force: true });
  await expect(page.getByRole('button', { name: /Sample content/ })).toHaveCount(0);
  await next(page);
  await expect(page.getByText('Upload a track — or choose “Add it later”.')).toBeVisible();
  await page.getByRole('radio', { name: /Generate Song/ }).check({ force: true });
  await page.getByRole('textbox', { name: 'Describe the song' }).fill('Slow, warm, piano and strings.');
  await page.getByRole('textbox', { name: 'Lyrics' }).fill('[verse]\nSalt on the wind\n\n[chorus]\nStay, stay');
  await next(page);
  await page.getByRole('radio', { name: /Narrative/ }).check({ force: true });
  await next(page);
  await page.getByRole('button', { name: 'Create new' }).first().click();
  await page.getByRole('dialog').getByRole('textbox', { name: /^Name/ }).fill('Rami');
  await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click();
  await next(page);
  await expect(page.getByText('Narrative', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create Project' }).click();
  await expect(page).toHaveURL(/\/music-videos\/mv-/);
  await expect(page.getByRole('heading', { level: 1, name: 'Salt' })).toBeVisible();
  await expect(page.getByText('Rami', { exact: true }).first()).toBeVisible();
  await tab(page, 'Song & Lyrics').click();
  await expect(page.getByText('Example song')).toBeVisible();
  // the section list on the side names them too, so the first is the lyric card's own label
  await expect(page.getByText('Verse', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Chorus', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('No audio yet').first()).toBeVisible();
  await tab(page, 'Visual Story').click();
  await expect(page.getByRole('radio', { name: /Narrative/ })).toBeChecked();
});

test('a character and a location from their empty libraries', async ({ page }) => {
  await startEmpty(page);
  await page.goto('/characters');
  await page.getByRole('link', { name: 'Add Character' }).click();
  await page.getByRole('textbox', { name: /^Name/ }).fill('Zeina');
  await page.getByLabel('Role').fill('A courier');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/characters\/char-/);
  await expect(page.getByRole('heading', { level: 1, name: 'Zeina' })).toBeVisible();
  await expect(page.getByText('No reference views yet.')).toBeVisible();
  await tab(page, 'Voice').click();
  await expect(page.getByText('No voice samples yet.')).toBeVisible();
  await page.goto('/locations');
  await page.getByRole('link', { name: 'Add Location' }).click();
  await page.getByRole('textbox', { name: /^Name/ }).fill('The depot');
  await page.getByRole('radio', { name: 'Exterior' }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/locations\/loc-/);
  await expect(page.getByRole('heading', { level: 1, name: 'The depot' })).toBeVisible();
  await expect(page.getByText('Exterior', { exact: true }).first()).toBeVisible();
  await tab(page, 'Props').click();
  await page.getByLabel('Add prop').fill('A red bicycle');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('A red bicycle')).toBeVisible();
});
