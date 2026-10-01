import { EP1, expect, tab, test } from './helpers';

/** EVERY VISIBLE INTERACTION — duplication, deletion, filtering, grid/list, drag reorder, playback, dialogs,
 *  keyboard, and files kept in the browser across a reload. Generation stays unavailable and says so. */

test.describe('duplicate and delete', () => {
  test('a production is duplicated from its poster menu and deleted with a typed title', async ({ page }) => {
    await page.goto('/shorts');
    const card = page.getByRole('listitem').filter({ hasText: 'Night Tray' });
    await card.locator('summary').click();
    await page.getByRole('menuitem', { name: 'Duplicate' }).click();
    await expect(page.getByRole('link', { name: /Night Tray \(copy\)/ })).toBeVisible();
    await page.getByRole('link', { name: /Night Tray \(copy\)/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Night Tray (copy)' })).toBeVisible();
    await tab(page, 'Storyboard').click();
    await expect(page.getByText('4 planned')).toBeVisible();
    await expect(page.getByText('0 chosen')).toBeVisible();
    await tab(page, 'Overview').click();
    await page.getByRole('button', { name: 'Delete' }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg.getByRole('button', { name: 'Delete' })).toBeDisabled();
    await dlg.getByPlaceholder('Night Tray (copy)').fill('Night Tray (copy)');
    await dlg.getByRole('button', { name: 'Delete' }).click();
    await expect(page).toHaveURL(/\/shorts$/);
    await expect(page.getByRole('link', { name: /Night Tray \(copy\)/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Night Tray/ })).toHaveCount(1);
  });

  test('a shot is duplicated and the copy is deleted from the editor', async ({ page }) => {
    await page.goto(`${EP1}?tab=storyboard`);
    const card = page.getByRole('listitem').filter({ hasText: 'The refusal' });
    await card.locator('summary').click();
    await page.getByRole('menuitem', { name: 'Duplicate' }).click();
    await expect(page.getByText('8 planned')).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'The refusal' })).toHaveCount(2);
    await page.getByRole('listitem').filter({ hasText: 'The refusal' }).last().getByRole('link').first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Shot 2.5' })).toBeVisible();
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page).toHaveURL(/tab=storyboard/);
    await expect(page.getByText('7 planned')).toBeVisible();
  });

  test('deleting a character removes them from every cast list', async ({ page }) => {
    await page.goto('/characters/the-cat');
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByPlaceholder('Basbousa').fill('Basbousa');
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page).toHaveURL(/\/characters$/);
    await expect(page.getByRole('link', { name: /Basbousa/ })).toHaveCount(0);
    await page.goto(`${EP1}?tab=characters`);
    await expect(page.getByRole('link', { name: /Basbousa/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Layla/ })).toBeVisible();
  });

  test('a show is deleted from its Settings tab', async ({ page }) => {
    await page.goto('/shows/paper-kites?tab=settings');
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByPlaceholder('Paper Kites').fill('Paper Kites');
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page).toHaveURL(/\/shows$/);
    await expect(page.getByRole('link', { name: /Paper Kites/ })).toHaveCount(0);
  });
});

test.describe('search, filter, sort, views', () => {
  test('the characters library searches by name or role and lists the cast alphabetically', async ({ page }) => {
    await page.goto('/characters');
    await expect(page.getByRole('listitem')).toHaveCount(7);
    const names = await page.locator('li.card .bi > span:first-child').allTextContents();
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    await page.getByLabel('Search').fill('poet');
    await expect(page.getByRole('listitem')).toHaveCount(1);
    await expect(page.getByRole('link', { name: /Karim/ })).toBeVisible();
    await page.getByLabel('Search').fill('zzz');
    await expect(page.getByText('Nothing matches your search.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(page.getByRole('listitem')).toHaveCount(7);
    await page.goto('/shorts');
    await expect(page.getByRole('listitem')).toHaveCount(2);
    await expect(page.getByRole('link', { name: /Night Tray/ })).toBeVisible();
  });

  test('the music library plays a track from its sleeve through one shared audio element', async ({ page }) => {
    await page.goto('/music-videos');
    await expect(page.getByRole('link', { name: /River Lights/ }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Play' }).first().click();
    await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(1);
    await page.getByRole('button', { name: 'Play' }).first().click();
    await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(1);
    expect(await page.locator('audio').count()).toBe(1);
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0);
  });

  test('the asset library filters by kind and previews in a dialog', async ({ page }) => {
    await page.goto('/assets');
    await page.getByRole('radio', { name: /^Sound/ }).click();
    await expect(page.getByRole('listitem').first()).toContainText('Sound');
    await page.getByRole('radio', { name: /^Clips/ }).click();
    await page.getByRole('listitem').filter({ hasText: 'Take 1' }).getByRole('button').click();
    await expect(page.getByRole('dialog').getByRole('group', { name: 'Take 1' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('storyboard and takes', () => {
  test('a shot is dragged before another within its scene, never across scenes', async ({ page }) => {
    await page.goto(`${EP1}?tab=storyboard`);
    const third = page.getByRole('listitem').filter({ hasText: 'Karim’s answer' });
    const first = page.getByRole('listitem').filter({ hasText: 'Establish the alley' });
    await third.dragTo(first);
    await expect(page.getByRole('listitem').filter({ hasText: 'Karim’s answer' }).getByText('1.1')).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Establish the alley' }).getByText('1.2')).toBeVisible();
    const other = page.getByRole('listitem').filter({ hasText: 'The café wakes' });
    await other.dragTo(page.getByRole('listitem').filter({ hasText: 'Karim’s answer' }));
    await expect(page.getByRole('listitem').filter({ hasText: 'The café wakes' }).getByText('2.1')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('listitem').filter({ hasText: 'Karim’s answer' }).getByText('1.1')).toBeVisible();
  });

  test('the shot editor previews another take, selects it, notes it and removes one', async ({ page }) => {
    await page.goto(`${EP1}/shots/s1e1-1`);
    await expect(page.getByRole('group', { name: /Take 2/ })).toBeVisible();
    await page.getByRole('radio', { name: /^Take 1/ }).click();
    await expect(page.getByRole('group', { name: /Take 1/ })).toBeVisible();
    await page.getByRole('button', { name: 'Select', exact: true }).click();
    await expect(page.getByRole('radio', { name: /Take 1 \(Selected\)/ })).toBeVisible();
    await page.getByLabel('Take 2 Notes').fill('Too flat.');
    page.once('dialog', (d) => d.accept());
    await page.getByRole('listitem').filter({ hasText: 'Take 2' }).getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByRole('radio', { name: /^Take 2/ })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('radio', { name: /Take 1 \(Selected\)/ })).toBeVisible();
  });

  test('a voice sample plays through the shared player and the frame view switches', async ({ page }) => {
    await page.goto('/characters/abu-samir?tab=voice');
    await page.getByRole('button', { name: 'Play' }).first().click();
    await expect.poll(async () => page.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(0.2);
    await page.goto(`${EP1}/shots/s1e1-1`);
    await page.getByRole('radio', { name: 'Frames' }).click();
    await expect(page.getByRole('img', { name: 'Opening frame' }).first()).toHaveAttribute('src', /frame-01-a/);
    await page.getByRole('radio', { name: 'Ending frame' }).click();
    await expect(page.getByRole('img', { name: 'Ending frame' }).first()).toHaveAttribute('src', /frame-01-b/);
  });
});

test.describe('dialogs, keyboard, files', () => {
  test('dialogs cancel and close on Escape without changing anything', async ({ page }) => {
    await page.goto('/shows/last-sip?tab=seasons');
    await page.getByRole('button', { name: 'Add Season' }).first().click();
    await page.getByRole('dialog').getByLabel('Title').fill('Season that never was');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Season that never was')).toHaveCount(0);
    await page.getByRole('button', { name: 'Add Season' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Season 1', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Season 2', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Season 3', exact: true })).toHaveCount(0);
  });

  test('the interface works from the keyboard: tabs move with arrows, menus close on Escape, the player answers keys', async ({ page }) => {
    await page.goto('/');
    // skip link → brand → New production → Home → Shows
    for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
    await expect(page.getByRole('navigation', { name: 'Studio areas' }).first().getByRole('link', { name: 'Shows' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: /^Shows/ })).toBeVisible();
    await page.goto('/shows/last-sip');
    await tab(page, 'Overview').focus();
    await page.keyboard.press('ArrowRight');
    await expect(tab(page, 'Seasons')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(tab(page, 'Settings')).toHaveAttribute('aria-selected', 'true');
    await page.goto(`${EP1}?tab=storyboard`);
    const card = page.getByRole('listitem').filter({ hasText: 'The discovery' });
    await card.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: 'Edit shot' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menuitem', { name: 'Edit shot' })).toBeHidden();
    await page.goto(`${EP1}/shots/s1e1-1`);
    const player = page.getByRole('group', { name: /Take 2/ });
    await player.focus();
    await page.keyboard.press('Space');
    await expect(player.getByRole('button', { name: 'Pause' })).toBeVisible();
    await page.keyboard.press('m');
    await expect(player.getByRole('button', { name: 'Unmute' })).toBeVisible();
  });

  test('a file added to a character is kept in the browser and survives a reload', async ({ page }) => {
    await page.goto('/characters/nour');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    await page.getByLabel('Kind of view').selectOption('BACK');
    await page.getByLabel('Add a view').setInputFiles({ name: 'nour-back.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByText('File added.')).toBeVisible();
    await expect(page.locator('.poster-title', { hasText: 'Back' })).toBeVisible();
    await page.reload();
    await expect(page.locator('img[src^="blob:"]').first()).toBeVisible();
    await page.goto('/assets');
    await expect(page.getByRole('listitem').filter({ hasText: 'Nour — Back' })).toContainText('Kept in this browser');
    await page.evaluate(() => new Promise<void>((res) => { const r = indexedDB.open('vewbox-media', 1); r.onsuccess = () => { const tx = r.result.transaction('blobs', 'readwrite'); tx.objectStore('blobs').clear(); tx.oncomplete = () => res(); }; }));
    await page.reload();
    await expect(page.getByRole('listitem').filter({ hasText: 'Nour — Back' })).toContainText('File not available in this browser');
    await page.getByRole('listitem').filter({ hasText: 'Nour — Back' }).getByRole('button').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Nour — Back' })).toHaveCount(0);
    await page.goto('/characters/nour');
    await expect(page.locator('.poster-title', { hasText: /^Back$/ })).toHaveCount(0);
    await expect(page.locator('.poster-title', { hasText: /^Front$/ })).toBeVisible();
  });

  test('reset from Settings clears kept files as well as records', async ({ page }) => {
    await page.goto('/assets');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    await page.locator('input[type=file]').setInputFiles({ name: 'added.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByRole('listitem').filter({ hasText: 'added.png' })).toBeVisible();
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Reset sample data' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reset sample data' }).click();
    await page.goto('/assets');
    await expect(page.getByRole('listitem').filter({ hasText: 'added.png' })).toHaveCount(0);
    const blobs = await page.evaluate(() => new Promise<number>((res) => { const r = indexedDB.open('vewbox-media', 1); r.onsuccess = () => { const db = r.result; if (!db.objectStoreNames.contains('blobs')) { res(0); return; } const c = db.transaction('blobs').objectStore('blobs').count(); c.onsuccess = () => res(c.result); }; r.onerror = () => res(-1); }));
    expect(blobs).toBe(0);
  });

  test('generation stays unavailable everywhere it is offered', async ({ page }) => {
    for (const [path, button] of [[`${EP1}?tab=story`, 'Write the script'], [`${EP1}?tab=storyboard`, 'Plan the shots'], [`${EP1}?tab=final`, 'Export'], ['/characters/layla?tab=voice', 'Generate voice'], ['/characters/nour', /Regenerate appearance/], ['/locations/cafe?tab=views', /Create view/], ['/music-videos/river-lights?tab=song', 'Generate Song']] as Array<[string, string | RegExp]>) {
      await page.goto(path);
      await page.getByRole('button', { name: button }).first().click();
      await expect(page.getByRole('dialog')).toContainText('not connected in this prototype');
      await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
    }
  });

  test('long titles and missing artwork stay composed', async ({ page }) => {
    await page.goto('/new/short');
    await page.getByRole('button', { name: 'Write my brief' }).click();
    await page.getByLabel('Title', { exact: true }).fill('An Unreasonably Long Title For A Short Film That Keeps Going Past Any Sensible Width Of A Poster Card');
    await page.getByRole('button', { name: 'Next', exact: true }).click(); await page.getByRole('button', { name: 'Next', exact: true }).click(); await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Create Project' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // no artwork: the title is set as type in the poster's frame, never a broken image
    await expect(page.locator('.poster-text').first()).toContainText('An Unreasonably Long Title');
    await page.goto('/shorts');
    const width = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(width).toBeLessThanOrEqual(1);
    await expect(page.getByRole('link', { name: /An Unreasonably Long Title/ })).toBeVisible();
  });
});
