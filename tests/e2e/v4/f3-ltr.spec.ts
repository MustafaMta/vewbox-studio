import { expect, test } from '@playwright/test';
import { openKit } from './f3-helpers';

/** DESIGN-SYSTEM-V4 §5.12–5.14, §8.5 F3: in the Arabic interface every transport, seek bar, waveform, strip and
 *  timeline is laid out left to right (computed), and the play glyph is never mirrored. Read-only (writes are refused
 *  in the page, tests/e2e/v4/f3-helpers.ts). */

const TIME_PARTS = ['.iplayer-controls', '.cplayer-bar', '.tplayer-transport', '.stransport', '.playerbar-transport', '.reel-bar', '.cmp-bar', '.seekwrap', '.wave', '.fstrip', '.tl', '.dstrip', '.vreel-row', '.lyric-edit-time'];

test('Arabic: every media-time part is LTR inside an RTL page', async ({ page }) => {
  await openKit(page, 'ar');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).direction)).toBe('rtl');
  const report = await page.evaluate((sels) => sels.map((s) => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(s));
    return { s, n: els.length, rtl: els.filter((e) => getComputedStyle(e).direction !== 'ltr' || e.closest('[dir]')?.getAttribute('dir') !== 'ltr').length };
  }), TIME_PARTS);
  for (const r of report) {
    expect(r.n, `${r.s} is on the specimen page`).toBeGreaterThan(0);
    expect(r.rtl, `${r.s}: every one is LTR`).toBe(0);
  }
  // the rest of the page follows Arabic: the slate and the hero text are RTL
  expect(await page.locator('.mhero-text').first().evaluate((e) => getComputedStyle(e).direction)).toBe('rtl');
});

test('Arabic: the play glyph is not mirrored, and → moves forward in media time', async ({ page }) => {
  await openKit(page, 'ar', '#players');
  const glyphs = page.locator('.pdisc-play, .ebtn-play svg, .vbtn svg.lucide-play, .iplayer-start svg');
  expect(await glyphs.count()).toBeGreaterThan(3);
  const transforms = await glyphs.evaluateAll((xs) => xs.map((x) => { const m = new DOMMatrix(getComputedStyle(x).transform === 'none' ? undefined : getComputedStyle(x).transform); let a = m.a; for (let p = x.parentElement; p; p = p.parentElement) { const t = getComputedStyle(p).transform; if (t !== 'none') a *= new DOMMatrix(t).a; } return a; }));
  for (const a of transforms) expect(a, 'no horizontal flip on the glyph or its ancestors').toBeGreaterThan(0);
  // the triangle points right: its rightmost point is its tip
  const tip = await page.locator('.stransport .pdisc-play path').first().evaluate((p: SVGPathElement) => { const b = p.getBBox(); const pts = [0, 0.25, 0.5, 0.75, 1].map((f) => p.getPointAtLength(f * p.getTotalLength())); const right = pts.reduce((m, q) => (q.x > m.x ? q : m)); return { right: right.x, centre: b.x + b.width / 2 }; });
  expect(tip.right).toBeGreaterThan(tip.centre);
  // the evidence: the song transport in Arabic
  const st = page.locator('#players .stransport').first();
  await st.scrollIntoViewIfNeeded();
  const box = (await st.boundingBox())!;
  await page.screenshot({ path: 'docs/evidence/v4-f3-players-transport-ar-play-glyph.png', clip: { x: Math.max(0, box.x - 16), y: box.y - 16, width: box.width + 32, height: box.height + 32 } });
  // keyboard: on the canvas player, → steps forward (time grows), whatever the page direction
  const canvas = page.locator('#players .cplayer').first();
  await canvas.scrollIntoViewIfNeeded();
  await canvas.locator('video').evaluate((v: HTMLVideoElement) => new Promise<void>((r) => { if (v.readyState >= 1) r(); else v.addEventListener('loadedmetadata', () => r(), { once: true }); }));
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const t = await canvas.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime);
  expect(t).toBeGreaterThan(0);
});
