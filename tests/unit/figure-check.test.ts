import { describe, expect, it } from 'vitest';
import { figureMask, fullBodyInFrame } from '@/server/media/figure-check';
import type { GrayImage } from '@/server/media/image-check';

/** A studio background with a radial vignette (bright centre, darker edges — the realistic photographs' look) and a
 *  dark textured figure in the given columns and rows. */
function picture(width: number, height: number, figure: [number, number] | null, rows: [number, number] = [0.06, 0.94]): GrayImage {
  const data = new Uint8Array(width * height);
  const cx = width / 2, cy = height / 2, r = Math.hypot(cx, cy);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = Math.round(165 - 50 * (Math.hypot(x - cx, y - cy) / r));
  if (figure) for (let y = Math.floor(height * rows[0]); y < Math.floor(height * rows[1]); y++) for (let x = figure[0]; x < figure[1]; x++) data[y * width + x] = 40 + ((x * 7 + y * 3) % 30);
  return { data, width, height };
}

describe('full body in frame', () => {
  it('floods a vignetted background from the border and keeps the figure', () => {
    const m = figureMask(picture(300, 400, [100, 200]));
    expect(m[0]).toBe(0);
    expect(m[200 * 300 + 150]).toBe(1);
  });
  it('passes a whole figure with margins on all sides', () => {
    const r = fullBodyInFrame(picture(464, 832, [150, 310]));
    expect(r.ok).toBe(true);
    expect(r.box!.h).toBeGreaterThan(0.85);
    expect(r.margins!.top).toBeGreaterThan(0.05);
    expect(r.margins!.bottom).toBeGreaterThan(0.05);
  });
  it('fails a figure whose head leaves the top edge, or whose feet leave the bottom', () => {
    expect(fullBodyInFrame(picture(464, 832, [150, 310], [0, 0.94])).reasons).toContain('the head touches or leaves the top edge');
    expect(fullBodyInFrame(picture(464, 832, [150, 310], [0.06, 1])).reasons).toContain('the feet touch or leave the bottom edge');
  });
  it('does not flood into a figure cut by the frame (seeds only near the backdrop grey)', () => {
    const r = fullBodyInFrame(picture(464, 832, [150, 310], [0.06, 1]));
    expect(r.margins!.bottom).toBe(0);
  });
  it('ignores specks of grain near the edges', () => {
    const img = picture(464, 832, [150, 310]);
    for (let x = 20; x < 23; x++) img.data[831 * 464 + x] = 20; // three dark pixels in the last row
    expect(fullBodyInFrame(img).ok).toBe(true);
  });
  it('fails a tiny figure, a figure filling the whole height, and an empty picture', () => {
    expect(fullBodyInFrame(picture(464, 832, [200, 260], [0.4, 0.7])).reasons[0]).toContain('fills only');
    expect(fullBodyInFrame(picture(464, 832, [150, 310], [0.005, 0.993])).ok).toBe(false);
    expect(fullBodyInFrame(picture(464, 832, null)).reasons).toEqual(['no figure found on the background']);
  });
});
