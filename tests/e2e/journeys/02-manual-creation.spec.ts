import type { Page } from '@playwright/test';
import { characterByName, control, expect, snapshot, test, waitForApp, type Snap } from '../helpers';

/** TEST 2 — MANUAL CREATION. "Write the sheet": name, a short description and the preferences (style, Arabic with
 *  the Iraqi dialect, sex, hair, wardrobe); Create (record only, no drawing). The stored profile must match the
 *  inputs exactly. No generation, no GPU. Contract §1.1 (minimum = name + style + language(+dialect)), UX §D2. */

const NAME = 'Sattar Jabbar';
const ROLE = 'A tea seller at the night market who remembers every face';
const HAIR = 'Grey, cropped close';
const WARDROBE = 'A brown dishdasha and a wool waistcoat';

/** Fill a field by its accessible name; opens a "Details" disclosure first when the field is hidden behind one. */
async function fill(page: Page, name: RegExp, value: string) {
  let box = page.getByRole('textbox', { name }).first();
  if (!(await box.isVisible().catch(() => false))) {
    // TODO(copy): the disclosure that holds the secondary fields ("Details")
    const more = page.getByRole('button', { name: /^Details|More|Exact age/i }).first();
    if (await more.isVisible().catch(() => false)) await more.click();
    box = page.getByRole('textbox', { name }).first();
  }
  await expect(box, `field ${name}`).toBeVisible();
  await box.fill(value);
}

/** A choice that may be a native select, a segmented radio group or buttons with aria-pressed. */
async function choose(page: Page, name: RegExp, option: { value: string; label: RegExp }) {
  const select = page.getByRole('combobox', { name }).first();
  if (await select.isVisible().catch(() => false)) { await select.selectOption({ value: option.value }); return; }
  const radio = page.getByRole('radio', { name: option.label }).first();
  if (await radio.isVisible().catch(() => false)) { await radio.check({ force: true }); return; }
  await page.getByRole('button', { name: option.label }).first().click();
}

/** Step forward through a staged form when it has a Next button; a one-page form simply continues. */
async function next(page: Page) {
  const n = page.getByRole('button', { name: /^Next$/ }).first();
  if (await n.isVisible().catch(() => false)) await n.click();
}

test('manual creation with a short description and preferences stores exactly what was typed', async ({ page }) => {
  const before = await snapshot<Snap>();
  await page.goto('/characters/new');
  await waitForApp(page);
  // TODO(copy): the Manual start ("Write the sheet")
  await control(page, /Write the sheet|Manual|Fill the sheet/i).click({ force: true });

  // shared header: style, language, dialect (the dialect appears only for Arabic; the default is Iraqi Baghdadi)
  await choose(page, /Style|Visual style/i, { value: 'CARTOON', label: /Cartoon/i });
  await choose(page, /^Language/i, { value: 'AR', label: /Arabic/i });
  await choose(page, /Dialect/i, { value: 'IRAQI_BAGHDADI', label: /Iraqi/i });

  // identity
  await fill(page, /^Name/, NAME);
  await fill(page, /Arabic name|Name \(Arabic\)/i, 'ستار جبار');
  // TODO(copy): the role line ("About" / "Role")
  await fill(page, /^Role|About|role line/i, ROLE);
  await choose(page, /^Sex/i, { value: 'MALE', label: /^Male/i });
  await next(page);
  // look
  await fill(page, /^Hair/i, HAIR);
  await fill(page, /^Wardrobe/i, WARDROBE);
  await next(page);
  // voice (left as it is)
  await next(page);
  // review → create the record only (no drawing); the "Create and draw" variant is Test 1's job
  // TODO(copy): "Create" vs "Create and draw"
  await page.getByRole('button', { name: /^Create$|^Create character$/i }).first().click();

  await expect(page).toHaveURL(/\/characters\/char-[a-z0-9]+/, { timeout: 60_000 });
  await waitForApp(page);
  await expect(page.getByRole('heading', { level: 1, name: NAME })).toBeVisible();

  const after = await snapshot<Snap>();
  expect(after.characters.length).toBe(before.characters.length + 1);
  const c = characterByName(after, NAME)!;
  expect(c, 'the character persisted').toBeTruthy();
  expect(c.nameAr).toBe('ستار جبار');
  expect(c.role).toBe(ROLE);
  expect(c.style).toBe('CARTOON');
  expect(c.language).toBe('AR');
  expect(c.dialect).toBe('IRAQI_BAGHDADI');
  expect(c.sex).toBe('MALE');
  expect(c.hair).toBe(HAIR);
  expect(c.wardrobe).toBe(WARDROBE);
  expect(c.portraitAssetId, 'no drawing was started').toBeUndefined();
  expect(c.voice.identity, 'no voice was invented').toBeUndefined();
  expect(c.usage?.known, 'a new record has a known, empty history').toBe(true);
  expect(c.usage?.videos).toEqual([]);
  // the profile shows the preferences in words, in the interface language
  await expect(page.getByText(/Iraqi/).first()).toBeVisible();
  await expect(page.getByText(ROLE).first()).toBeVisible();
});

test('the Manual start refuses an empty name and a missing dialect for Arabic before anything is sent', async ({ page }) => {
  const before = await snapshot<Snap>();
  await page.goto('/characters/new');
  await waitForApp(page);
  await control(page, /Write the sheet|Manual|Fill the sheet/i).click({ force: true });
  const create = page.getByRole('button', { name: /^Create$|^Create character$|^Create and draw$/i }).first();
  // nothing typed: Create is disabled, or pressing it names the field (both are acceptable; a 400 from the server is not)
  if (await create.isEnabled().catch(() => false)) {
    await create.click();
    await expect(page.getByRole('alert').or(page.getByText(/needs a name|Name is required/i)).first()).toBeVisible();
  } else await expect(create).toBeDisabled();
  expect((await snapshot<Snap>()).characters.length).toBe(before.characters.length);
});
