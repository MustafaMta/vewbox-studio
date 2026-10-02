import { EP1, expect, snapshot, tab, test } from './helpers';

/** THE PROTOTYPE, USED — navigation, the stepped wizard's validation, demo persistence and reset, storyboard
 *  editing, take selection, media playback, unsaved-change handling, empty states, Arabic and the phone layout. */

test.describe('navigation', () => {
  test('every area opens from the sidebar and shows its content', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    for (const [name, heading] of [['Shows', 'Shows'], ['Shorts', 'Shorts'], ['Music Videos', 'Music Videos'], ['Characters', 'Characters'], ['Locations', 'Locations'], ['Asset Library', 'Asset Library'], ['Settings', 'Settings']]) {
      await page.getByRole('navigation', { name: 'Studio areas' }).getByRole('link', { name, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: new RegExp(`^${heading}`) })).toBeVisible();
    }
    await expect(page.getByRole('link', { name: /queue/i })).toHaveCount(0);
  });

  test('shows → show (Seasons tab, season selector) → episode → its tabs → shot editor → back to the show', async ({ page }) => {
    await page.goto('/shows');
    await page.getByRole('link', { name: /The Last Sip/ }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: /The Last Sip/ })).toBeVisible();
    await tab(page, 'Seasons').click();
    await expect(page).toHaveURL(/tab=seasons/);
    await page.getByRole('link', { name: 'Season 1', exact: true }).click();
    await expect(page).toHaveURL(/season=last-sip-s1/);
    await expect(page.getByRole('link', { name: /The Opening Hour/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /The Debt/ })).toBeVisible();
    await page.getByRole('link', { name: 'Season 2', exact: true }).click();
    await expect(page.getByRole('link', { name: /New Management/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /The Debt/ })).toHaveCount(0);
    // a reload keeps the tab and the season
    await page.reload();
    await expect(tab(page, 'Seasons')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('link', { name: /New Management/ })).toBeVisible();
    await page.getByRole('link', { name: 'Season 1', exact: true }).click();
    await page.getByRole('link', { name: /The Opening Hour/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: /The Opening Hour/ })).toBeVisible();
    for (const name of ['Story', 'Characters', 'Locations', 'Storyboard', 'Produce', 'Final Cut', 'Overview']) {
      await tab(page, name).click();
      await expect(tab(page, name)).toHaveAttribute('aria-selected', 'true');
    }
    await tab(page, 'Storyboard').click();
    await expect(tab(page, 'Storyboard')).toHaveAttribute('aria-selected', 'true');
    await page.locator('li.tile').filter({ hasText: 'Establish the alley at dawn' }).getByRole('link').first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Shot 1.1' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What happens' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to storyboard' }).click();
    await page.getByRole('link', { name: /Back to The Last Sip · Season 1/ }).click();
    await expect(page).toHaveURL(/\/shows\/last-sip\?tab=seasons&season=last-sip-s1/);
  });

  test('the show workspace keeps its header across tabs, and Characters/Locations manage the canon in place', async ({ page }) => {
    await page.goto('/shows/last-sip?tab=characters');
    await expect(page.getByRole('heading', { level: 1, name: /The Last Sip/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Abu Samir/ })).toBeVisible();
    await page.getByRole('button', { name: 'Add Character' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^Nour/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('link', { name: /Nour/ })).toBeVisible();
    await tab(page, 'Locations').click();
    await expect(page.getByRole('heading', { level: 1, name: /The Last Sip/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Al-Mutanabbi Alley/ })).toBeVisible();
    await tab(page, 'Settings').click();
    await expect(page.getByRole('heading', { level: 1, name: /The Last Sip/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Delete show' })).toBeVisible();
  });

  test('a missing item shows the not-found page', async ({ page }) => {
    await page.goto('/shorts/does-not-exist');
    await expect(page.getByText('Not here')).toBeVisible();
  });
});

test.describe('creating', () => {
  test('Manual Brief: a title is the only requirement; a short is created and persists', async ({ page }) => {
    await page.goto('/shorts');
    await page.getByRole('link', { name: 'Add Short' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'New Short' })).toBeVisible();
    await page.getByRole('button', { name: 'Write my brief' }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText('Give it a title or describe the idea.')).toBeVisible();
    await page.getByLabel('Title', { exact: true }).fill('The Waiting Bus');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('radio', { name: /Anime/ }).check({ force: true });
    await page.getByRole('radiogroup', { name: 'Language' }).getByRole('radio', { name: 'English' }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: /^Layla/ }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText('The Waiting Bus', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Layla', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Create Project' }).click();
    await expect(page).toHaveURL(/\/shorts\/short-/);
    await expect(page.getByRole('heading', { level: 1, name: 'The Waiting Bus' })).toBeVisible();
    await expect(page.getByText('Anime', { exact: true }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'The Waiting Bus' })).toBeVisible();
    await page.goto('/shorts');
    await expect(page.getByRole('link', { name: /The Waiting Bus/ })).toBeVisible();
  });

  test('Manual Brief: a short description alone is enough', async ({ page }) => {
    await page.goto('/new/short');
    await page.getByRole('button', { name: 'Write my brief' }).click();
    await page.getByRole('textbox', { name: 'Description' }).fill('A lift that stops between floors for exactly one minute every night.');
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Create Project' }).click();
    await expect(page).toHaveURL(/\/shorts\/short-/);
    await expect(page.getByRole('heading', { level: 1, name: /A lift that stops between floors/ })).toBeVisible();
    await tab(page, 'Story').click();
    await expect(page.getByRole('textbox', { name: /brief/i }).first()).toHaveValue(/exactly one minute every night/);
  });

  test('Auto Idea from a written example: an editable labelled review, and a project that persists on the server', async ({ page }) => {
    await page.goto('/new/short');
    await page.getByRole('button', { name: 'Use a written example instead' }).click();
    await expect(page.getByText('Sample proposal — a written example')).toBeVisible();
    const title = page.getByRole('textbox', { name: 'Title', exact: true });
    const proposed = await title.inputValue();
    expect(proposed.length).toBeGreaterThan(0);
    await title.fill(`${proposed} (edited)`);
    // new characters are proposed; one is dropped before creating
    const firstNew = page.getByRole('checkbox', { name: /^Include / }).first();
    await expect(firstNew).toBeChecked();
    await firstNew.uncheck();
    await page.getByRole('button', { name: 'Create Project' }).click();
    await expect(page).toHaveURL(/\/shorts\/short-/);
    await expect(page.getByRole('heading', { level: 1, name: `${proposed} (edited)` })).toBeVisible();
    await tab(page, 'Story').click();
    await expect(page.getByText(/Started from Auto Idea \(a sample proposal\)/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: `${proposed} (edited)` })).toBeVisible();
    const saved = await snapshot<{ productions: Array<{ title: string; brief: unknown; scenes: unknown[] }> }>();
    const created = saved.productions.find((p) => p.title === `${proposed} (edited)`)!;
    expect(created.brief).toMatchObject({ mode: 'AUTO_IDEA', fromSampleProposal: true });
    expect(created.scenes.length).toBeGreaterThan(0);
  });

  // "Create an idea for me" runs the real story engine (a local language model here: about a minute per proposal)
  const ENGINE = 300_000;

  test('Auto Idea honours optional constraints: the chosen character and place are in the proposal and the project', async ({ page }) => {
    test.setTimeout(ENGINE + 60_000);
    await page.goto('/new/short');
    await page.getByText('Optional preferences').click();
    await page.getByRole('radiogroup', { name: 'Visual style' }).getByRole('radio', { name: 'Realistic' }).click();
    await page.getByRole('button', { name: /^Karim Regular/ }).click();
    await page.getByRole('button', { name: /^Karim’s Rooftop/ }).click();
    await page.getByRole('button', { name: 'Create an idea for me' }).click();
    await expect(page.getByRole('combobox', { name: 'Visual style' })).toHaveValue('REALISTIC', { timeout: ENGINE });
    const karim = page.getByRole('listitem').filter({ hasText: 'Regular customer, aspiring poet' }).filter({ hasText: 'Your choice' });
    await expect(karim).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Karim’s Rooftop' }).filter({ hasText: 'Your choice' })).toBeVisible();
    await page.getByRole('button', { name: 'Create Project' }).click();
    await tab(page, 'Characters').click();
    await expect(page.getByRole('link', { name: /Karim/ }).first()).toBeVisible();
    await tab(page, 'Locations').click();
    await expect(page.getByRole('link', { name: /Karim’s Rooftop/ }).first()).toBeVisible();
  });

  test('an Auto Idea episode inherits the show’s context: returning cast and places, plus a proposed newcomer', async ({ page }) => {
    test.setTimeout(ENGINE + 60_000);
    await page.goto('/new/episode?show=last-sip&season=last-sip-s2');
    await expect(page.getByText(/Uses the world of The Last Sip/)).toBeVisible();
    await page.getByRole('button', { name: 'Create an idea for me' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Returning cast of The Last Sip.' }).first()).toBeVisible({ timeout: ENGINE });
    // a reason may mention another regular by name, so match the row that starts with the name
    for (const name of ['Abu Samir', 'Layla', 'Karim', 'Basbousa']) await expect(page.getByRole('listitem').filter({ hasText: new RegExp(`^${name}`) }).filter({ hasText: 'Returning cast of The Last Sip.' }).first()).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'New' }).first()).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Language' })).toHaveValue('AR');
    await page.getByRole('button', { name: 'Create Project' }).click();
    await expect(page).toHaveURL(/\/shows\/last-sip\/seasons\/last-sip-s2\/episodes\//);
    await expect(page.getByText(/Episode 2/).first()).toBeVisible();
  });

  test('a music video’s song is optional in a manual brief; Upload Song accepts the labelled sample track', async ({ page }) => {
    await page.goto('/new/music-video');
    await page.getByRole('button', { name: 'Write my brief' }).click();
    await page.getByLabel('Title', { exact: true }).fill('Salt');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('radio', { name: /Upload Song/ }).check({ force: true });
    await page.getByRole('button', { name: /Sample content: uploaded track/i }).click();
    await expect(page.getByRole('group', { name: 'Uploaded track (example)' })).toBeVisible();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: /^Nour/ }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Create Project' }).click();
    await expect(page).toHaveURL(/\/music-videos\/mv-/);
    await expect(page.getByRole('heading', { level: 1, name: 'Salt' })).toBeVisible();
    await expect(page.getByText('Nour', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play', exact: true }).first()).toBeVisible();
    await tab(page, 'Song & Lyrics').click();
    await expect(page.getByText('Uploaded track')).toBeVisible();
  });

  test('a character can be created inline while choosing a show’s cast', async ({ page }) => {
    await page.goto('/shows/paper-kites?tab=characters');
    await page.getByRole('button', { name: 'Add Character' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Create new' }).click();
    await dialog.getByRole('textbox', { name: /^Name/ }).fill('Zeina');
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('link', { name: /Zeina/ })).toBeVisible();
    await page.goto('/characters');
    await expect(page.getByRole('link', { name: /Zeina/ })).toBeVisible();
  });
});

test.describe('editing', () => {
  test('storyboard: add a shot, move it, delete it', async ({ page }) => {
    await page.goto(`${EP1}?tab=storyboard`);
    await expect(page.getByText('7 planned')).toBeVisible();
    await page.getByRole('button', { name: 'Add Shot' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Scene').selectOption({ label: 'Scene 1 · Before the door' });
    await dialog.getByLabel('Purpose').fill('A new beat');
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('8 planned')).toBeVisible();
    const card = page.getByRole('listitem').filter({ hasText: 'A new beat' });
    await expect(card.getByText('1.4')).toBeVisible();
    await card.locator('summary').click();
    await page.getByRole('menuitem', { name: 'Move up' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'A new beat' }).getByText('1.3')).toBeVisible();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('listitem').filter({ hasText: 'A new beat' }).locator('summary').click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(page.getByText('7 planned')).toBeVisible();
  });

  test('produce: choosing a take updates the count', async ({ page }) => {
    await page.goto('/shows/last-sip/seasons/last-sip-s1/episodes/s1e2?tab=produce');
    const lead = page.locator('p', { hasText: 'shots with a chosen take' });
    await expect(lead).toContainText('1/5');
    const row = page.getByRole('listitem').filter({ hasText: 'Karim reacts' });
    await row.getByRole('button', { name: 'Select', exact: true }).first().click();
    await expect(lead).toContainText('2/5');
    await expect(row.getByText(/Selected take: Take/)).toBeVisible();
  });

  test('shot editor: unsaved edits warn on leaving, then save', async ({ page }) => {
    await page.goto(`${EP1}/shots/s1e1-1`);
    await expect(page.getByRole('button', { name: 'Saved' })).toBeDisabled();
    await page.getByLabel('Purpose').fill('Establish the alley — changed');
    await expect(page.getByText('Unsaved changes')).toBeVisible();
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('link', { name: 'Back to storyboard' }).click();
    await expect(page).toHaveURL(/shots\/s1e1-1/);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Saved' })).toBeDisabled();
    await page.reload();
    await expect(page.getByLabel('Purpose')).toHaveValue('Establish the alley — changed');
  });

  test('story: a draft survives switching tabs; the synopsis saves; beats can be added', async ({ page }) => {
    await page.goto(`${EP1}?tab=story`);
    const synopsis = page.getByRole('textbox', { name: 'Synopsis' });
    await synopsis.fill('A new synopsis.');
    await expect(page.getByText('Unsaved changes')).toBeVisible();
    await tab(page, 'Storyboard').click();
    await tab(page, 'Story').click();
    await expect(page.getByRole('textbox', { name: 'Synopsis' })).toHaveValue('A new synopsis.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Synopsis' })).toHaveValue('A new synopsis.');
    await page.getByRole('button', { name: 'Add beat' }).first().click();
    await expect(page.getByLabel('Action 1.3')).toBeVisible();
  });

  test('character voice: a sample is chosen and the library shows it', async ({ page }) => {
    await page.goto('/characters/karim?tab=voice');
    await page.getByRole('radio', { name: /Select Mid/ }).click();
    await expect(page.getByRole('radio', { name: /Select Mid/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Mid (sample)').first()).toBeVisible();
    await page.goto('/characters');
    await expect(page.getByRole('listitem').filter({ hasText: 'Karim' }).filter({ hasText: 'Mid (sample)' })).toBeVisible();
  });
});

test.describe('media, generation, persistence', () => {
  test('a sample take plays in the player', async ({ page }) => {
    await page.goto(`${EP1}/shots/s1e1-1`);
    const player = page.getByRole('group', { name: /Take 2/ });
    await expect(player).toBeVisible();
    await player.getByRole('button', { name: 'Play' }).click();
    await expect(player.getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect.poll(async () => player.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0.2);
  });

  test('the music video header plays the song through one player, and the lyric section lights up', async ({ page }) => {
    await page.goto('/music-videos/river-lights?tab=song');
    await expect(page.getByRole('img', { name: 'Waveform, from the audio file' }).or(page.getByRole('slider', { name: 'Waveform, from the audio file' }))).toBeVisible();
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Pause', exact: true }).first()).toBeVisible();
    await expect.poll(async () => page.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(0.3);
    expect(await page.locator('audio').count()).toBe(1);
    // selecting a section reveals singers and timing
    await page.getByRole('button', { name: /Chorus/ }).first().click();
    await expect(page.getByRole('checkbox', { name: 'Nour' })).toBeChecked();
    await expect(page.getByRole('spinbutton', { name: 'From' })).toHaveValue('24');
  });

  test('generation buttons start real jobs that appear in Activity, and never invent progress', async ({ page }) => {
    await page.goto(`${EP1}?tab=produce`);
    await page.getByRole('button', { name: 'Prepare frames' }).first().click();
    await expect(page.getByRole('status').filter({ hasText: 'Started. Progress shows in Activity.' })).toBeVisible();
    await page.goto('/jobs');
    await expect(page.getByRole('listitem').filter({ hasText: 'Prepare frames' }).first()).toContainText(/The Opening Hour · Shot 1\.1/);
    // no percentage is shown for a step whose progress the engine does not report
    await expect(page.getByRole('progressbar')).toHaveCount(0);
  });

  test('sample content is labelled and the demo state resets from Settings', async ({ page }) => {
    await page.goto('/shows/last-sip');
    await expect(page.getByText(/· Sample$/)).toBeVisible();
    await page.goto('/assets');
    await page.getByRole('listitem').filter({ hasText: 'Take 1' }).getByRole('button').click();
    await expect(page.getByRole('dialog').getByText('Sample content')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.goto('/settings');
    await expect(page.getByText('The sample data is untouched.')).toBeVisible();
    await page.goto('/characters/hana');
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('dialog').getByLabel('Role').fill('Night nurse, changed');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await page.goto('/settings');
    await expect(page.getByText('The sample data has been changed since the last reset.')).toBeVisible();
    await page.getByRole('button', { name: 'Reset sample data' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reset sample data' }).click();
    await expect(page.getByText('The sample data is untouched.')).toBeVisible();
    await page.goto('/characters/hana');
    await expect(page.getByText('Night nurse', { exact: true }).first()).toBeVisible();
  });

  test('empty state: a show with no episodes says so and offers the action', async ({ page }) => {
    await page.goto('/shows/paper-kites?tab=seasons');
    await expect(page.getByText('No episodes in this season yet.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add Episode' }).first()).toBeVisible();
  });
});

test.describe('arabic and phone', () => {
  test('the Arabic interface flips direction and translates the whole shell @rtl', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('radio', { name: 'العربية' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('link', { name: 'المسلسلات' })).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'أهلاً بعودتك' })).toBeVisible();
    await page.goto(EP1);
    await expect(page.getByRole('tab', { name: /اللوحة القصصية/ })).toBeVisible();
    await page.goto('/music-videos/river-lights');
    await expect(page.getByRole('tab', { name: /الأغنية والكلمات/ })).toBeVisible();
  });

  test('the phone layout has a top bar with a menu sheet, a scrollable tab bar and no horizontal overflow @mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Studio areas' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Open menu' }).click();
    const nav = page.getByRole('navigation', { name: 'Studio areas' });
    await expect(nav.getByRole('link', { name: 'Shows' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'New production' })).toBeVisible();
    await nav.getByRole('link', { name: 'Characters' }).click();
    await expect(page.getByRole('navigation', { name: 'Studio areas' })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: /Characters/ })).toBeVisible();
    for (const path of ['/shows/last-sip?tab=seasons', '/music-videos/river-lights?tab=song', `${EP1}/shots/s1e1-1`, `${EP1}?tab=storyboard`]) {
      await page.goto(path);
      const width = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(width, `no horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
    }
    await expect(tab(page, 'Storyboard')).toHaveAttribute('aria-selected', 'true');
  });
});
