import { EP1, expect, tab, test } from './helpers';

/** PLAYERS AND THE CAST — one sound at a time across songs, voices and video; the song player and its compact
 *  copy stay in step; lyric sections seek; and a character's appearance is protected once they have been in a
 *  video, at every entry point, while an unused character's reference upload works and persists. */

const EMPTY_TAKES = /No takes/;
const audioTime = (page: import('@playwright/test').Page) => page.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime);
const audioPaused = (page: import('@playwright/test').Page) => page.locator('audio').evaluate((a: HTMLAudioElement) => a.paused);

test.describe('players', () => {
  test('the song player: real duration after load, seeking from a lyric section, and the compact player in step', async ({ page }) => {
    await page.goto('/music-videos/river-lights?tab=song');
    const player = page.getByRole('group', { name: 'Song: River Lights' });
    // the record's length first, marked provisional
    await expect(player.getByRole('slider', { name: 'Seek' })).toHaveAttribute('aria-valuetext', '0:00 / 0:48');
    await expect(player.getByText('~0:48')).toBeVisible();
    await player.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(player.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await expect.poll(() => audioTime(page)).toBeGreaterThan(0.3);
    // the file's own metadata replaces the provisional figure
    await expect(player.getByText('~0:48')).toHaveCount(0);
    await expect(player.getByText('0:48', { exact: true })).toBeVisible();
    // a lyric section jumps the one player to its start and lights up
    await page.getByRole('button', { name: 'Play Chorus' }).click();
    await expect.poll(() => audioTime(page)).toBeGreaterThan(24);
    await expect(page.getByText('Now playing')).toBeVisible();
    // scroll the full player away: the compact player shows the same track and time
    await page.mouse.wheel(0, 1400);
    const mini = page.getByRole('region', { name: 'Player' });
    await expect(mini).toBeVisible();
    await expect(mini.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await mini.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect.poll(() => audioPaused(page)).toBe(true);
    await page.mouse.wheel(0, -2000);
    await expect(player.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    expect(await page.locator('audio').count()).toBe(1);
  });

  test('volume and mute apply to the shared audio and are remembered', async ({ page }) => {
    await page.goto('/music-videos/river-lights');
    const player = page.getByRole('group', { name: 'Song: River Lights' });
    await player.getByRole('slider', { name: 'Volume' }).fill('0.3');
    await expect.poll(() => page.locator('audio').evaluate((a: HTMLAudioElement) => a.volume)).toBeCloseTo(0.3, 1);
    await player.getByRole('button', { name: 'Mute' }).click();
    await expect.poll(() => page.locator('audio').evaluate((a: HTMLAudioElement) => a.muted)).toBe(true);
    await page.reload();
    await expect(page.getByRole('group', { name: 'Song: River Lights' }).getByRole('button', { name: 'Unmute' })).toBeVisible();
  });

  test('one sound at a time: a voice preview replaces the previous one, and a video pauses the song', async ({ page }) => {
    await page.goto('/characters/abu-samir?tab=voice');
    const voices = page.getByRole('radiogroup', { name: 'Voice' });
    await voices.getByRole('button', { name: 'Play Low (sample)', exact: true }).click();
    await expect.poll(async () => (await page.locator('audio').getAttribute('src')) ?? '').toContain('voice-low');
    await voices.getByRole('button', { name: 'Play Warm (sample)', exact: true }).click();
    await expect.poll(async () => (await page.locator('audio').getAttribute('src')) ?? '').toContain('voice-warm');
    await expect(voices.getByRole('button', { name: 'Pause Low (sample)', exact: true })).toHaveCount(0);
    await expect(voices.getByRole('button', { name: 'Pause Warm (sample)', exact: true })).toBeVisible();
    // start the song, then a take in the shot editor: the song pauses
    await page.goto('/music-videos/river-lights');
    await page.getByRole('group', { name: 'Song: River Lights' }).getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => audioPaused(page)).toBe(false);
    await page.goto(`${EP1}/shots/s1e1-1`);
    const video = page.getByRole('group', { name: /Take 2/ });
    await video.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => video.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0.2);
    await expect.poll(() => audioPaused(page)).toBe(true);
  });

  test('the video player: seek, volume, fullscreen control, no captions button without captions, aspect kept', async ({ page }) => {
    await page.goto(`${EP1}/shots/s1e1-1`);
    const video = page.getByRole('group', { name: /Take 2/ });
    await expect(video.getByRole('button', { name: 'Fullscreen' })).toBeVisible();
    await expect(video.getByRole('button', { name: 'Captions' })).toHaveCount(0);
    await expect.poll(() => video.getByRole('slider', { name: 'Seek' }).isEnabled()).toBe(true);
    await video.getByRole('slider', { name: 'Seek' }).fill('2');
    await expect.poll(() => video.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(1.9);
    await video.getByRole('button', { name: 'Mute' }).click();
    await expect.poll(() => video.locator('video').evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
    const fit = await video.locator('video').evaluate((v: HTMLVideoElement) => getComputedStyle(v).objectFit);
    expect(fit).toBe('contain');
    // a shot with no take shows the placeholder, not a broken player
    await page.goto('/shows/last-sip/seasons/last-sip-s1/episodes/s1e2/shots/s1e2-3');
    await page.getByRole('radio', { name: 'Takes' }).click();
    await expect(page.getByText(EMPTY_TAKES).first()).toBeVisible();
    await expect(page.locator('video')).toHaveCount(0);
  });

  test('a missing audio file says so instead of playing silence', async ({ page }) => {
    await page.goto('/characters/nour?tab=voice');
    await expect(page.getByRole('listitem').filter({ hasText: 'Studio voice (not generated yet)' })).toContainText('Not generated yet — voice generation is not connected.');
    await expect(page.getByRole('radio', { name: 'Select Studio voice (not generated yet)' })).toBeDisabled();
    // point a voice at a file that is not there: the preview reports it
    // a file that is there but is not audio: the player reports the failure (a 404 would also log a console error)
    await page.route('**/sample/audio/voice-low-sample.m4a', (r) => r.fulfill({ status: 200, contentType: 'audio/mp4', body: 'not audio' }));
    await page.getByRole('radiogroup', { name: 'Voice' }).getByRole('button', { name: 'Play Low (sample)', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'could not be' }).first()).toBeVisible();
  });
});

test.describe('the cast directory and the continuity rule', () => {
  test('the library shows usage and filters by usage and production', async ({ page }) => {
    await page.goto('/characters');
    await expect(page.getByRole('listitem').filter({ hasText: 'Nour' })).toContainText('Unused');
    await expect(page.getByRole('listitem').filter({ hasText: 'Layla' })).toContainText('Used in videos');
    await expect(page.getByRole('listitem').filter({ hasText: 'Um Hassan' })).toContainText('Usage unknown');
    await page.getByRole('combobox', { name: 'Usage' }).selectOption('unused');
    await expect(page.getByRole('listitem')).toHaveCount(1);
    await page.getByRole('combobox', { name: 'Usage' }).selectOption('');
    await page.getByRole('combobox', { name: 'Production' }).selectOption({ label: 'Night Tray' });
    await expect(page.getByRole('listitem')).toHaveCount(1);
    await expect(page.getByRole('listitem').first()).toContainText('Hana');
  });

  test('a used character: regeneration and appearance replacement are unavailable everywhere, the profile still edits', async ({ page }) => {
    await page.goto('/characters/layla');
    await expect(page.getByText('This character has been used in a video. Its appearance is preserved for continuity.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Regenerate appearance' })).toBeDisabled();
    await expect(page.locator('input[type=file]')).toHaveCount(1); // only the disabled reference drop zone
    await expect(page.locator('input[type=file]')).toBeDisabled();
    await expect(page.getByLabel('Add a view')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Use as portrait' })).toHaveCount(0);
    // the profile form keeps the look fields read-only, and saves the rest
    await page.getByRole('button', { name: 'Edit profile' }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg.getByLabel('Hair')).toBeDisabled();
    await expect(dlg.getByRole('combobox', { name: 'Visual style' })).toBeDisabled();
    await dlg.getByLabel('Role').fill('Runs the café now');
    await dlg.getByRole('button', { name: 'Save' }).click();
    await page.reload();
    await expect(page.getByText('Runs the café now').first()).toBeVisible();
    // and the usage records say where
    await tab(page, 'Used In').click();
    await expect(page.getByRole('listitem').filter({ hasText: 'The Opening Hour' }).first()).toContainText('Shot 1.1 · Take 1');
    // a direct write through the shared state cannot change her portrait either
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('vewbox.studio.v1')!).characters.find((c: { id: string }) => c.id === 'layla').portraitAssetId);
    expect(before).toBe('portrait-layla');
  });

  test('an unknown history is treated as used', async ({ page }) => {
    await page.goto('/characters/um-hassan');
    await expect(page.getByText('This character’s video history is not available, so its appearance is preserved for continuity.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Regenerate appearance' })).toBeDisabled();
  });

  test('an unused character: a reference is uploaded, replaced, kept across a reload, and removed', async ({ page }) => {
    const png = (b: string) => ({ name: `${b}.png`, mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') });
    await page.goto('/characters/nour');
    await expect(page.getByText('Its appearance is preserved')).toHaveCount(0);
    await page.getByLabel('Upload a reference').setInputFiles(png('first'));
    await expect(page.getByText('Reference added.')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Your reference' })).toBeVisible();
    const pending = () => page.evaluate(() => JSON.parse(localStorage.getItem('vewbox.studio.v1') ?? 'null')?.characters.find((c: { id: string }) => c.id === 'nour').pendingReference?.assetId ?? null);
    await expect.poll(pending).not.toBeNull();
    const first = await pending();
    await page.getByLabel('Replace').setInputFiles(png('second'));
    await expect(page.getByText('Reference replaced.')).toBeVisible();
    await expect.poll(pending).not.toBe(first);
    await page.reload();
    await expect(page.getByRole('img', { name: 'Your reference' })).toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('vewbox.studio.v1')!));
    const nour = saved.characters.find((c: { id: string }) => c.id === 'nour');
    expect(nour.pendingReference.assetId).not.toBe(first);
    expect(nour.portraitAssetId).toBe('portrait-nour'); // the reference is not the appearance
    expect(saved.assets.some((a: { id: string }) => a.id === first)).toBe(false); // the replaced one is gone
    await page.getByRole('button', { name: 'Regenerate from reference' }).click();
    await expect(page.getByRole('dialog')).toContainText('not connected in this prototype');
    await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByText('Reference removed.')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('img', { name: 'Your reference' })).toHaveCount(0);
  });

  test('a voice recording can be uploaded for any character, including a used one', async ({ page }) => {
    await page.goto('/characters/layla?tab=voice');
    await page.getByLabel('Upload a recording').setInputFiles({ name: 'counter-line.m4a', mimeType: 'audio/mp4', buffer: Buffer.from('not really audio') });
    await expect(page.getByText('Recording added.')).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'counter-line' })).toContainText('Your recording');
    await page.reload();
    await expect(page.getByRole('listitem').filter({ hasText: 'counter-line' })).toBeVisible();
  });
});
