import { expect, test, type Page, type Route } from '@playwright/test';
import { prepare } from '../../../scripts/lib/capture.mjs';

/** THE WORLD BIBLE, THE CONTINUITY LOG AND THE LOCATION BIBLE in the pages (read-only: every write is answered here and
 *  never reaches the server). The World Bible's GET is the server's own; its POST is routed. */

const FILM = 'short-28bdb3342b';
const LOCATION = 'loc-cde19129ca';
type Prep = (p: Page, o: { motion?: string }) => Promise<void>;
const commands: Array<{ name: string; args: unknown[] }> = [];
const posts: Array<Record<string, unknown>> = [];

async function open(page: Page, path: string, ready: string, width = 1440) {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  await (prepare as Prep)(page, { motion: 'reduce' });
  await page.route('**/api/commands', async (route: Route) => { try { commands.push(...(route.request().postDataJSON()?.commands ?? [])); } catch { /* beacon */ } await route.fulfill({ json: { ok: true, version: 1, hash: 'test', results: [] } }); });
  await page.route(`**/api/productions/${FILM}/world`, async (route: Route) => {
    if (route.request().method() === 'POST') { posts.push(route.request().postDataJSON()); return route.fulfill({ status: 201, json: { revision: 99, created: true } }); }
    return route.continue();
  });
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(ready, { timeout: 120_000 });
}

test.beforeEach(() => { commands.length = 0; posts.length = 0; });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

test('Cast & World: the World Bible says which revision is read, lists the places with their plates, and adds a rule as a new revision', async ({ page }) => {
  await open(page, `/shorts/${FILM}/production?tab=cast`, '.ws-world h2, .ws-world .shead');
  const world = page.locator('.ws-world');
  await expect(world).toContainText('World Bible');
  await expect(world).toContainText(/Revision \d+|Not recorded yet/);
  await expect(world.getByRole('heading', { name: 'Places' })).toBeVisible();
  await world.getByLabel('Add a rule').fill('It always rains on Thursdays.');
  await world.getByRole('button', { name: 'Add a rule' }).click();
  await expect.poll(() => posts).toContainEqual(expect.objectContaining({ action: 'addRule', text: 'It always rains on Thursdays.' }));
  await world.getByRole('radio', { name: 'The recorded line' }).click();
  await expect.poll(() => posts.map((x) => x.action)).toContain('audio');
});

test('Produce: the continuity log lists the shots with their flags; accepting one records it on the shot', async ({ page }) => {
  await open(page, `/shorts/${FILM}/production?tab=produce`, '.ws-clog');
  const log = page.locator('.ws-clog');
  await expect(log.getByRole('heading', { name: /Continuity log/ })).toBeVisible();
  await log.getByRole('radio', { name: /All shots/ }).click();
  await expect(log.locator('.ws-clog-entry').first()).toBeVisible();
  const accept = log.getByRole('button', { name: 'Accept as intended' }).first();
  if (await accept.count()) {
    await accept.click();
    await expect.poll(() => commands.filter((c) => c.name === 'setShotContinuity').map((c) => JSON.stringify(c.args[2]))).toContainEqual(expect.stringContaining('"acknowledged"'));
  }
});

test('a location: the Location Bible saves its layout and light rules through updateLocation', async ({ page }) => {
  await open(page, `/locations/${LOCATION}`, '#bible');
  const bible = page.locator('#bible');
  await expect(bible.getByRole('button', { name: 'Save the Location Bible' })).toBeDisabled();
  await bible.getByLabel('Key light').fill('a single bulb over the bench');
  await bible.getByLabel('Practical lights').fill('the bench lamp\nthe radio dial');
  await bible.getByRole('button', { name: 'Save the Location Bible' }).click();
  await expect.poll(() => commands.filter((c) => c.name === 'updateLocation').map((c) => JSON.stringify(c.args[1]))).toContainEqual(expect.stringContaining('"practicals":["the bench lamp","the radio dial"]'));
});

test('phone 390: the World Bible and the Location Bible have no horizontal overflow @mobile', async ({ page }) => {
  await open(page, `/shorts/${FILM}/production?tab=cast`, '.ws-world', 390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.goto(`/locations/${LOCATION}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#bible', { timeout: 120_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
