import { describe, expect, it } from 'vitest';
import { edgeMap, measuredDissolves } from '@/server/media/continuity-qa';

/** The dissolve RESEARCH measure (not a take check: see its header in src/server/media/continuity-qa.ts). On synthetic
 *  frames it finds a cross-dissolve between two different pictures and leaves a light fade on one picture alone. */
const W = 64, H = 36;
const picture = (seed: number) => Uint8Array.from({ length: W * H }, (_, i) => { const x = i % W, y = Math.floor(i / W); return 40 + ((((x * (seed + 3)) ^ (y * (seed * 7 + 1))) & 31) * 5); });
const mix = (a: Uint8Array, b: Uint8Array, t: number) => Uint8Array.from(a, (v, k) => Math.round(v * (1 - t) + b[k] * t));
const scale = (a: Uint8Array, g: number) => Uint8Array.from(a, (v) => Math.min(255, Math.round(v * g)));

describe('measuredDissolves', () => {
  it('finds a cross-dissolve between two pictures', () => {
    const a = picture(1), b = picture(5);
    const frames = [...Array(30).fill(a), ...Array.from({ length: 8 }, (_, i) => mix(a, b, (i + 1) / 9)), ...Array(30).fill(b)];
    const ds = measuredDissolves(frames, 24);
    expect(ds.length).toBe(1);
    // within the dissolve (frames 30–38), give or take the window's half
    expect(ds[0]).toBeGreaterThanOrEqual(27 / 24);
    expect(ds[0]).toBeLessThanOrEqual(41 / 24);
  });
  it('leaves a light dimming on the same picture (its edges stay put)', () => {
    const a = picture(2);
    const frames = Array.from({ length: 60 }, (_, i) => scale(a, 1 - Math.min(0.6, Math.max(0, (i - 20) / 30))));
    expect(measuredDissolves(frames, 24)).toEqual([]);
    expect(edgeMap(a, W).length).toBe(W * H);
  });
});
