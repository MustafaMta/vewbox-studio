import { evidencePath, expect, overflowPx, setUiLanguage, test, waitForApp } from '../helpers';

/** TEST 10 — THE PREMIUM UX WALK. The five product areas with the sample studio's content, at four widths, in
 *  English and Arabic (set through the commands API, as Settings does): no console errors (the fixture fails the
 *  test on any), no horizontal overflow, the primary navigation reachable in order with Tab, and a screenshot of
 *  every page under docs/evidence/qa/ for the reviewer. */

const PAGES: Array<{ path: string; slug: string; heading: RegExp }> = [
  { path: '/shows', slug: 'shows', heading: /^Shows|المسلسلات/ },
  { path: '/shorts', slug: 'shorts', heading: /^Shorts|الأفلام القصيرة/ },
  { path: '/music-videos', slug: 'music-videos', heading: /^Music Videos|الفيديوهات الموسيقية/ },
  { path: '/characters', slug: 'characters', heading: /^Characters|الشخصيات/ },
  { path: '/studio', slug: 'studio-company', heading: /^Studio Company|شركة الاستوديو/ },
];
const WIDTHS = [1440, 1024, 768, 390];
// the primary five, in order (contract §1.8: Shows · Shorts · Music Videos · Characters · Studio Company)
const PRIMARY = [/^Shows$|^المسلسلات$/, /^Shorts$|^الأفلام القصيرة$/, /^Music Videos$|^الفيديوهات الموسيقية$/, /^Characters$|^الشخصيات$/, /^Studio Company$|^شركة الاستوديو$/];
const NAV = /Studio areas|أقسام الاستوديو/;

for (const lang of ['en', 'ar'] as const) {
  test(`the five areas render with the sample studio in ${lang.toUpperCase()} at every width, no overflow, keyboard order through the primary nav`, async ({ page }) => {
    await setUiLanguage(lang);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      for (const p of PAGES) {
        await page.goto(p.path);
        await waitForApp(page);
        await expect(page.getByRole('heading', { level: 1, name: p.heading }).first()).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.dir), 'direction').toBe(lang === 'ar' ? 'rtl' : 'ltr');
        expect(await page.evaluate(() => document.documentElement.lang), 'lang').toBe(lang);
        // realistic content: the sample studio's items are listed (not an empty state) on the catalogues
        if (p.slug !== 'studio-company') await expect(page.getByRole('link', { name: /Last Sip|Night Tray|Paper Boats|River Lights|Rooftop Radio|Layla|Nour|Karim|السيب|صينية|قوارب|أضواء|راديو|ليلى|نور|كريم/ }).first()).toBeVisible();
        await page.waitForTimeout(400); // fonts and pictures settle before the overflow measure and the screenshot
        expect(await overflowPx(page), `horizontal overflow on ${p.path} at ${width} (${lang})`).toBeLessThanOrEqual(1);
        await page.screenshot({ path: evidencePath(`ux-${p.slug}-${lang}-${width}.png`), fullPage: true });
      }
      // the primary navigation: the five links in order, and Tab moves through them in that order (sidebar at lg+)
      if (width >= 1024) {
        await page.goto('/shows');
        await waitForApp(page);
        const nav = page.getByRole('navigation', { name: NAV }).first();
        const links = nav.getByRole('link');
        for (let i = 0; i < PRIMARY.length; i++) await expect(links.nth(i), `nav link ${i}`).toHaveAccessibleName(PRIMARY[i]);
        await links.nth(0).focus();
        await expect(links.nth(0)).toBeFocused();
        for (let i = 1; i < PRIMARY.length; i++) { await page.keyboard.press('Tab'); await expect(links.nth(i), `Tab ${i} lands on ${PRIMARY[i]}`).toBeFocused(); }
        // the focused link has a visible ring (the outline is not removed)
        const outline = await links.nth(PRIMARY.length - 1).evaluate((el) => getComputedStyle(el).outlineStyle);
        expect.soft(outline, 'focus outline').not.toBe('none');
        // Enter opens the area
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/\/studio$/);
      } else {
        // phone / tablet-portrait: the areas are reachable from the mobile bar or its menu — TODO(copy): the menu button's name
        await page.goto('/shows');
        await waitForApp(page);
        const menu = page.getByRole('button', { name: /Menu|Areas|القائمة|الأقسام/i }).first();
        if (await menu.isVisible().catch(() => false)) {
          await menu.click();
          const nav = page.getByRole('navigation', { name: NAV }).last();
          for (const name of PRIMARY) await expect(nav.getByRole('link', { name }).first()).toBeVisible();
          await page.keyboard.press('Escape');
        } else {
          const nav = page.getByRole('navigation', { name: NAV }).first();
          await expect(nav.getByRole('link', { name: PRIMARY[0] }).first()).toBeVisible();
        }
      }
    }
  });
}

test('the character profile and the creation page keep their composition at phone width in both languages', async ({ page }) => {
  for (const lang of ['en', 'ar'] as const) {
    await setUiLanguage(lang);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [path, slug] of [['/characters/layla', 'character-layla'], ['/characters/nour?tab=voice', 'character-nour-voice'], ['/characters/new', 'character-new']] as const) {
      await page.goto(path);
      await waitForApp(page);
      await page.waitForTimeout(400);
      expect(await overflowPx(page), `horizontal overflow on ${path} (${lang})`).toBeLessThanOrEqual(1);
      await page.screenshot({ path: evidencePath(`ux-${slug}-${lang}-390.png`), fullPage: true });
    }
  }
  await setUiLanguage('en');
});
