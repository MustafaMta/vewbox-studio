import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { identitySeedFor, seedFromId } from '@/server/workflows';
import { FACE_DETECTION_NOTE, REFERENCE_RULES, judgeReference, laplacianVariance, validateReferenceImage, type GrayImage } from '@/server/media/image-check';

describe('identity seeds', () => {
  it('derives a stable 31-bit seed from the id and prefers a stored one', () => {
    expect(seedFromId('char-69c05af166')).toBe(seedFromId('char-69c05af166'));
    expect(seedFromId('char-69c05af166')).not.toBe(seedFromId('char-7d1a3d6880'));
    for (const id of ['a', 'char-69c05af166', 'char-7d1a3d6880']) { const s = seedFromId(id); expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThan(2 ** 31); expect(Number.isInteger(s)).toBe(true); }
    expect(identitySeedFor({ id: 'x', canon: { identitySeed: 123 } })).toBe(123);
    expect(identitySeedFor({ id: 'x', canon: { identitySeed: -5 } })).toBe(seedFromId('x'));
    expect(identitySeedFor({ id: 'x' })).toBe(seedFromId('x'));
  });
});

const gray = (w: number, h: number, f: (x: number, y: number) => number): GrayImage => { const data = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = f(x, y); return { data, width: w, height: h }; };

describe('reference image validation', () => {
  it('measures sharpness as Laplacian variance: flat is 0, a checkerboard is high, a smooth ramp is low', () => {
    expect(laplacianVariance(gray(32, 32, () => 128))).toBe(0);
    const board = laplacianVariance(gray(32, 32, (x, y) => ((x + y) % 2 ? 255 : 0)));
    const ramp = laplacianVariance(gray(32, 32, (x) => Math.round((x / 31) * 255)));
    expect(board).toBeGreaterThan(10_000);
    expect(ramp).toBeLessThan(5);
    expect(laplacianVariance(gray(2, 2, () => 0))).toBe(0);
  });
  it('judges size, sharpness and (when measured) faces, with every reason spelled out', () => {
    const small = judgeReference({ width: 400, height: 900, sharpness: 80 });
    expect(small.ok).toBe(false);
    expect(small.reasons.some((r) => r.startsWith('too small: 400×900'))).toBe(true);
    expect(small.reasons).toContain(FACE_DETECTION_NOTE);
    expect(small.faces).toBeUndefined();
    const blurry = judgeReference({ width: 1024, height: 1024, sharpness: 3 });
    expect(blurry.ok).toBe(false);
    expect(blurry.reasons.some((r) => r.startsWith('blurry'))).toBe(true);
    const fine = judgeReference({ width: 1024, height: 1280, sharpness: 120 });
    expect(fine.ok).toBe(true);
    expect(fine.reasons).toEqual([FACE_DETECTION_NOTE]);
    expect(judgeReference({ width: 1024, height: 1280, sharpness: 120, faces: 0 })).toMatchObject({ ok: false, faces: 0 });
    expect(judgeReference({ width: 1024, height: 1280, sharpness: 120, faces: 2 }).reasons[0]).toContain('one person only');
    expect(judgeReference({ width: 1024, height: 1280, sharpness: 120, faces: 1, faceBoxHeight: 0.1 }).ok).toBe(false);
    expect(judgeReference({ width: 1024, height: 1280, sharpness: 120, faces: 1, faceBoxHeight: 0.3 })).toMatchObject({ ok: true, reasons: [] });
    expect(judgeReference({ width: 1024, height: 1280, sharpness: NaN }).reasons.some((r) => r.includes('could not be decoded'))).toBe(true);
    expect(REFERENCE_RULES.minSide).toBe(512);
  });
  it('validates the fixture plate on the CPU: too small, sharpness measured, no face detection', async () => {
    const v = await validateReferenceImage(path.resolve('tests/fixtures/plate.png'));
    expect(v).toMatchObject({ ok: false, width: 256, height: 256, faces: undefined });
    expect(Number.isFinite(v.sharpness)).toBe(true);
    expect(v.reasons.some((r) => r.startsWith('too small'))).toBe(true);
    expect(v.reasons).toContain(FACE_DETECTION_NOTE);
  });
});
