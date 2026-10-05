import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
// the capture harness's page preparation: no write ever reaches the studio (commands are answered in the browser)
import { prepare } from '../../../scripts/lib/capture.mjs';

/** THE PIXEL FOCUS TEST (DS-1 gate; docs/design/DESIGN-QA-PROTOTYPES-2026-10-03.md §10.0 F1; DESIGN-SYSTEM-V5 §5.0,
 *  §10; WCAG 2.4.7, 2.4.11, 2.4.13). On representative pages at 1440 and 390 it presses Tab through the page and, at
 *  every stop:
 *    1. reads the ring's geometry (outline width and offset) from the focused element;
 *    2. captures the region around the focused element and samples the centre line of the 2 px ring band on each of
 *       the four sides (8 points along the middle 20 % of the side): a side shows the ring when ≥ 60 % of its
 *       points are drawn in the ring's own colour AND contrast ≥ 3:1 with the pixel 3 px beyond the band or 3 px
 *       inside it (the ground it sits on, or the gap / control it surrounds) — a ring clipped by a scroll container,
 *       masked, or painted over by a neighbour fails that side;
 *    3. hit-tests a 5 × 5 grid inside the element: a point that lands on a fixed or sticky element outside it means
 *       the focused control sits under a bar (2.4.11).
 *  Sides outside the viewport are not judged (the element is larger than the screen). Read-only: no reset, no write.
 *  Run: $env:STUDIO_URL='http://localhost:4241'; pnpm exec playwright test tests/e2e/v5/ds1-focus.spec.ts --project=desktop
 *  The summary (every stop, every side) is written to docs/evidence/v5-ds1/focus-<page>-<width>.json. */

const PAGES: Array<[string, string]> = [
  ['home', '/'],
  ['short', '/shorts/short-28bdb3342b'],
  ['characters', '/characters'],
  ['character', '/characters/char-56c47abc59'],
  ['studio', '/studio'],
  ['screening', '/screening'],
];
const WIDTHS = [1440, 390];
const MAX_STOPS = Number(process.env.FOCUS_MAX_STOPS ?? 60);
// the summaries go to test-results by default; E2E_EVIDENCE_DIR=docs/evidence/v5-ds1 refreshes the committed evidence
const OUT = process.env.E2E_EVIDENCE_DIR ?? path.join('test-results', 'evidence', 'v5-ds1');

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

type Side = 'top' | 'right' | 'bottom' | 'left';
type Stop = { n: number; tag: string; name: string; box: { x: number; y: number; w: number; h: number }; outline: string; offset: number; sides: Partial<Record<Side, { changed: number; contrast: number; ok: boolean } | 'offscreen'>>; covered: string | null; ok: boolean };

async function open(browser: Browser, width: number, url: string) {
  const phone = width < 768;
  const context = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, colorScheme: 'dark', reducedMotion: 'reduce', ...(phone ? { hasTouch: true, isMobile: true } : {}) });
  const page = await context.newPage();
  await (prepare as (p: Page, o: { lang?: string; motion?: string }) => Promise<void>)(page, { lang: 'en', motion: 'reduce' });
  for (let attempt = 1; ; attempt++) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    try { await page.waitForFunction(() => document.querySelector('main h1') && !/Reconnecting/.test(document.body.innerText), null, { timeout: 60_000 }); break; } catch (e) { if (attempt >= 3) throw e; }
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
  return { context, page };
}

/** Decode a PNG in the page (no image library on the test side) and return its RGBA bytes. */
async function pixels(page: Page, png: Buffer): Promise<{ w: number; h: number; data: number[] }> {
  return page.evaluate(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bmp = await createImageBitmap(blob);
    const c = new OffscreenCanvas(bmp.width, bmp.height); const g = c.getContext('2d')!; g.drawImage(bmp, 0, 0);
    return { w: bmp.width, h: bmp.height, data: Array.from(g.getImageData(0, 0, bmp.width, bmp.height).data) };
  }, png.toString('base64'));
}
const lum = (r: number, g: number, b: number) => { const f = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrast = (a: number[], b: number[]) => { const [x, y] = [lum(a[0], a[1], a[2]), lum(b[0], b[1], b[2])].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

async function measure(page: Page, n: number): Promise<Stop | null> {
  // wait until the focused element stops moving (focus scrolling, scroll snap)
  await page.evaluate(async () => {
    const el = document.activeElement; if (!el) return;
    let last = ''; let same = 0; const t0 = performance.now();
    while (same < 3 && performance.now() - t0 < 1500) { await new Promise((done) => requestAnimationFrame(() => done(null))); const r = el.getBoundingClientRect(); const k = `${r.x},${r.y}`; same = k === last ? same + 1 : 0; last = k; }
  });
  const info = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body || el.getAttribute('tabindex') === '-1' || !el.matches(':focus-visible')) return null;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (r.width < 1 || r.height < 1) return null;
    // hit-test a 5 × 5 grid inside the element (2.4.11): what is on top at each point?
    let covered: string | null = null;
    const vw = innerWidth, vh = innerHeight;
    for (let i = 1; i <= 5 && !covered; i++) for (let j = 1; j <= 5 && !covered; j++) {
      const x = r.left + (r.width * i) / 6, y = r.top + (r.height * j) / 6;
      if (x < 0 || y < 0 || x >= vw || y >= vh) continue;
      const hit = document.elementFromPoint(x, y);
      if (!hit || el.contains(hit) || hit.contains(el)) continue;
      // something else is on top: a fixed or sticky bar (or anything positioned over the control)
      let a: Element | null = hit; let bar: Element | null = null;
      while (a && a !== document.body) { const p = getComputedStyle(a).position; if (p === 'fixed' || p === 'sticky') { bar = a; break; } a = a.parentElement; }
      if (bar) covered = `${bar.tagName.toLowerCase()}.${(bar.className && typeof bar.className === 'string' ? bar.className : '').split(' ').slice(0, 2).join('.')}`;
    }
    const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    return { tag: `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''}`, name, box: { x: r.left, y: r.top, w: r.width, h: r.height }, outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, colour: (cs.outlineColor.match(/\d+(\.\d+)?/g) ?? ['0', '0', '0']).slice(0, 3).map(Number), width: parseFloat(cs.outlineWidth) || 0, offset: parseFloat(cs.outlineOffset) || 0, covered, vw, vh };
  });
  if (!info) return null;
  const pad = 10;
  // the screenshot's frame is the emulated viewport (a page wider than the screen widens innerWidth, not the image)
  const vp = page.viewportSize()!; const vw = Math.min(info.vw, vp.width), vh = Math.min(info.vh, vp.height);
  const clip = { x: Math.max(0, Math.floor(info.box.x - pad)), y: Math.max(0, Math.floor(info.box.y - pad)), width: 0, height: 0 };
  clip.width = Math.min(vw, Math.ceil(info.box.x + info.box.w + pad)) - clip.x;
  clip.height = Math.min(vh, Math.ceil(info.box.y + info.box.h + pad)) - clip.y;
  const sides: Stop['sides'] = {};
  const inView = clip.width > 2 && clip.height > 2 && clip.x < vw && clip.y < vh;
  if (inView) {
    const A = await pixels(page, await page.screenshot({ clip, animations: 'disabled', caret: 'hide' }));
    const px = (x: number, y: number) => { const xi = Math.min(A.w - 1, Math.max(0, Math.floor(x))), yi = Math.min(A.h - 1, Math.max(0, Math.floor(y))); const i = (yi * A.w + xi) * 4; return [A.data[i], A.data[i + 1], A.data[i + 2]]; };
    const ring = info.colour;
    // the ring band's centre line: `offset + width/2` outside the border box (inside when the offset is negative);
    // its neighbours 3 px further out and 3 px further in
    const mid = info.offset + info.width / 2;
    const judge = (pts: Array<{ x: number; y: number; dx: number; dy: number }>) => {
      const inside = pts.filter(({ x, y }) => x >= 0 && y >= 0 && x < A.w && y < A.h);
      if (inside.length < pts.length * 0.5) return 'offscreen' as const;
      let good = 0; const ratios: number[] = [];
      for (const { x, y, dx, dy } of inside) {
        // the band is 2 px wide and the browser snaps it to device pixels: look one pixel either side of its centre
        let best = 0; let hit = false;
        for (const t of [-1, 0, 1]) {
          const bxp = x + dx * t, byp = y + dy * t;
          const band = px(bxp, byp), out = px(bxp + dx * 3, byp + dy * 3), inn = px(bxp - dx * 3, byp - dy * 3);
          const isRing = Math.max(...band.map((v, k) => Math.abs(v - ring[k]))) <= 48;
          const c = Math.max(contrast(band, out), contrast(band, inn));
          if (isRing) best = Math.max(best, c);
          if (isRing && c >= 3) hit = true;
        }
        ratios.push(best);
        if (hit) good++;
      }
      ratios.sort((p, q) => p - q);
      const share = good / inside.length;
      return { changed: Number(share.toFixed(2)), contrast: Number(ratios[Math.floor(ratios.length / 2)].toFixed(2)), ok: share >= 0.6 };
    };
    const span = (a: number, b: number, k = 12) => Array.from({ length: k }, (_, i) => a + ((b - a) * (i + 0.5)) / k);
    const bx = info.box.x - clip.x, by = info.box.y - clip.y;
    // the middle 20 % of each side, so a round or pill-shaped ring (it follows the border radius) is sampled where it
    // runs straight
    const xs = span(bx + info.box.w * 0.4, bx + info.box.w * 0.6, 8), ys = span(by + info.box.h * 0.4, by + info.box.h * 0.6, 8);
    const offTop = info.box.y - mid - 4 < 0, offBottom = info.box.y + info.box.h + mid + 4 > vh, offLeft = info.box.x - mid - 4 < 0, offRight = info.box.x + info.box.w + mid + 4 > vw;
    sides.top = offTop ? 'offscreen' : judge(xs.map((x) => ({ x, y: by - mid, dx: 0, dy: -1 })));
    sides.bottom = offBottom ? 'offscreen' : judge(xs.map((x) => ({ x, y: by + info.box.h + mid, dx: 0, dy: 1 })));
    sides.left = offLeft ? 'offscreen' : judge(ys.map((y) => ({ x: bx - mid, y, dx: -1, dy: 0 })));
    sides.right = offRight ? 'offscreen' : judge(ys.map((y) => ({ x: bx + info.box.w + mid, y, dx: 1, dy: 0 })));
  }  if (!inView) return { n, tag: info.tag, name: info.name, box: info.box, outline: info.outline, offset: info.offset, sides, covered: 'not scrolled into view', ok: false };
  const ok = !info.covered && Object.values(sides).every((s) => s === 'offscreen' || s.ok) && Object.values(sides).some((s) => s !== 'offscreen');
  return { n, tag: info.tag, name: info.name, box: info.box, outline: info.outline, offset: info.offset, sides, covered: info.covered, ok };
}

/** KNOWN FINDINGS: page/width pairs that fail this gate today, each with what the measurement shows. They run and keep
 *  writing their evidence; they are expected to fail, so an unexpected pass (the page was fixed) fails the test and
 *  the entry is removed. The page owners fix the pages, not this list (docs/TESTING.md "Known findings").
 *  Cleared on 2026-10-05 (the design system's fixes, all in the kit's focus rules):
 *   - home 1440: the Shelf track clipped the ring's start side at the column's left edge → the track keeps 8 px of
 *     padding on every side, given back as margin (kit.css .shelf-track);
 *   - short 1440: the credits' one-line names clipped their link's ring → `data-clips` (base.css: overflow clip with an
 *     8 px margin while focused); short 390: the strip's scroller and the player's box clipped the shots' and the
 *     Fullscreen button's rings → the strip pads 8 px like the kit's strips, `.iplayer` joins the clip-margin rule;
 *   - characters 1440 and 390: the split button's parts hid the ring's edge between them (1.39:1 against the
 *     neighbour's fill) → a split part draws its ring just inside its edge (an ink ring 4 px in on the primary fill).
 *  (The profile at 390 — the "Notes for the writers" textarea under nav.bottom-nav, WCAG 2.4.11 — was on this list
 *  until main's QA page fixes of 2026-10-05 moved it clear; the unexpected pass removed the entry.) */
const KNOWN: Record<string, string> = {
  'short-390': 'the docked transport is wider than the phone column (the Fullscreen button past the player’s clip) and the strip’s last shot stops 9 px short of the scroller’s end',
};

for (const width of WIDTHS) {
  for (const [name, url] of PAGES) {
    test(`focus ring on every Tab stop: ${name} at ${width}`, async ({ browser }) => {
      test.setTimeout(240_000);
      test.fail(Boolean(KNOWN[`${name}-${width}`]), `known DS-1 finding: ${KNOWN[`${name}-${width}`]}`);
      const { context, page } = await open(browser, width, url);
      const stops: Stop[] = [];
      const seen = new Set<string>();
      try {
        for (let n = 1; n <= MAX_STOPS; n++) {
          await page.keyboard.press('Tab');
          await page.waitForTimeout(60);
          const key = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return 'body'; const all = Array.from(document.querySelectorAll('*')); return String(all.indexOf(e)); });
          if (seen.has(key) && key !== 'body') break; // wrapped around
          seen.add(key);
          const s = await measure(page, n);
          if (s) stops.push(s);
        }
      } finally {
        fs.mkdirSync(OUT, { recursive: true });
        fs.writeFileSync(path.join(OUT, `focus-${name}-${width}.json`), `${JSON.stringify({ page: url, width, stops: stops.length, failures: stops.filter((s) => !s.ok).length, results: stops }, null, 2)}\n`);
        await context.close();
      }
      expect(stops.length, 'the page has Tab stops').toBeGreaterThan(3);
      const failures = stops.filter((s) => !s.ok).map((s) => `#${s.n} ${s.tag} "${s.name}" ${s.covered ? `covered by ${s.covered} ` : ''}${Object.entries(s.sides).filter(([, v]) => v !== 'offscreen' && !v.ok).map(([k, v]) => `${k} ${JSON.stringify(v)}`).join(', ')}`);
      expect(failures).toEqual([]);
    });
  }
}
