import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { identityLine, identitySeedFor, seedFromId, sheetPrompt, viewPrompt, VIEW_SEED_OFFSET } from '@/server/workflows';
import { FACE_DETECTION_NOTE, REFERENCE_RULES, facesFromMask, judgeReference, laplacianVariance, validateReferenceImage, type GrayImage } from '@/server/media/image-check';

const samir = { id: 'char-samir', hair: 'short grey', eyes: 'dark brown', skin: 'olive', build: 'wiry, hunched', wardrobe: 'a patchwork jacket of brown, teal, ochre and brick squares over a white shirt, brown sandals', distinguishing: ['full white beard', 'small brass pendant'], canon: { accessories: ['brass pendant', 'walking stick'], visualRestrictions: ['No glasses'] } };

describe('identityLine', () => {
  it('is deterministic and names the tokens that drifted (hair, eyes, wardrobe, distinguishing, accessories, restrictions)', () => {
    const line = identityLine(samir);
    expect(line).toBe(identityLine({ ...samir }));
    expect(line.startsWith('Identity: ')).toBe(true);
    expect(line.endsWith('.')).toBe(true);
    for (const t of ['short grey hair', 'dark brown eyes', 'olive skin', 'wiry, hunched build', 'wearing a patchwork jacket', 'full white beard', 'accessories: brass pendant, walking stick', 'no glasses']) expect(line).toContain(t);
    expect(line).not.toMatch(/\s{2,}/);
  });
  it('skips empty and placeholder fields and de-duplicates', () => {
    expect(identityLine({ id: 'x', hair: '', eyes: '', skin: '—', build: '', wardrobe: '', distinguishing: [] })).toBe('');
    const line = identityLine({ id: 'x', hair: 'black', eyes: '', skin: '', build: '', wardrobe: '', distinguishing: ['Black hair', 'scar'] });
    expect(line.match(/black hair/gi)).toHaveLength(1);
    expect(line).toContain('scar');
  });
  it('prefers a line stored on the record', () => {
    expect(identityLine({ ...samir, canon: { identityLine: 'Identity: fixed by the producer.' } })).toBe('Identity: fixed by the producer.');
  });
});

describe('identity seeds', () => {
  it('derives a stable 31-bit seed from the id and prefers a stored one', () => {
    expect(seedFromId('char-69c05af166')).toBe(seedFromId('char-69c05af166'));
    expect(seedFromId('char-69c05af166')).not.toBe(seedFromId('char-7d1a3d6880'));
    for (const id of ['a', 'char-69c05af166', 'char-7d1a3d6880']) { const s = seedFromId(id); expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThan(2 ** 31); expect(Number.isInteger(s)).toBe(true); }
    expect(identitySeedFor({ id: 'x', canon: { identitySeed: 123 } })).toBe(123);
    expect(identitySeedFor({ id: 'x', canon: { identitySeed: -5 } })).toBe(seedFromId('x'));
    expect(identitySeedFor({ id: 'x' })).toBe(seedFromId('x'));
  });
  it('gives the sheet tiles the identity seed and each derived view a distinct offset', () => {
    for (const r of ['FRONT', 'THREE_QUARTER', 'SIDE', 'BACK', 'FACE'] as const) expect(VIEW_SEED_OFFSET[r]).toBe(0);
    const derived = [VIEW_SEED_OFFSET.FULL_BODY, VIEW_SEED_OFFSET.EXPRESSION, VIEW_SEED_OFFSET.OUTFIT];
    expect(new Set(derived).size).toBe(3);
    for (const o of derived) expect(o).toBeGreaterThan(0);
  });
});

describe('prompts', () => {
  it('puts the sheet layout first, the identity line verbatim, the direction last', () => {
    const line = identityLine(samir);
    const p = sheetPrompt({ identityLine: line, direction: 'DIRECTION TEXT.' });
    expect(p.indexOf('Character turnaround reference sheet')).toBe(0);
    expect(p).toContain('front view, three-quarter view turned 45 degrees to the left, exact left profile side view, back view');
    expect(p.indexOf(line.replace(/\.$/, ''))).toBeGreaterThan(0);
    expect(p.indexOf('DIRECTION TEXT')).toBeGreaterThan(p.indexOf('no labels'));
  });
  it('leads with the camera tokens only when the LoRA is on, and names the three references by role', () => {
    const on = viewPrompt({ view: 'SIDE', identityLine: 'Identity: x.', angleLora: true });
    expect(on.startsWith('<sks> left side view eye-level shot medium shot. ')).toBe(true);
    expect(on).toContain('image 1, with the face exactly as in image 2 and the outfit exactly as in image 3');
    const off = viewPrompt({ view: 'SIDE', identityLine: 'Identity: x.' });
    expect(off).not.toContain('<sks>');
    expect(off).toContain('exact profile side view facing left');
    const grid = viewPrompt({ view: 'EXPRESSION', identityLine: 'Identity: x.', angleLora: true });
    expect(grid).not.toContain('<sks>');
    expect(grid).toContain('joy, worry, anger and surprise');
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
  it('counts face blobs in a mask, largest first, ignoring specks', () => {
    const mask = gray(100, 100, (x, y) => ((x >= 10 && x < 40 && y >= 10 && y < 50) || (x >= 60 && x < 70 && y >= 60 && y < 70) || (x === 90 && y === 90) ? 255 : 0));
    const boxes = facesFromMask(mask);
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toMatchObject({ x: 10, y: 10, w: 30, h: 40, area: 1200 });
    expect(boxes[1]).toMatchObject({ x: 60, y: 60, w: 10, h: 10 });
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
