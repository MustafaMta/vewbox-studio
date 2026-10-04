import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { Asset } from '@/domain/types';
import { canonical } from '@/domain/hash';
import { artVars, ART_CHROMA_MAX, parseOklch } from '@/studio/presentation';

/** IMAGE PRESENTATION (docs/DESIGN-SYSTEM-V4.md §2.4, package B1). Every picture is drawn here, pixel by pixel: a
 *  figure on a grey studio backdrop, a saturated key art, a white-bordered still, pictures built to sit on each side
 *  of a rule. The measures run on the pixels, then on PNG files ffmpeg writes from the same pixels (the decode path
 *  the server uses), then through the library's ingest (adoptFile) — no fixtures, no GPU, no database. */

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-presentation-'));
vi.stubEnv('LIBRARY_ROOT', path.join(dir, 'library'));
vi.stubEnv('DATABASE_URL', 'postgres://unused@127.0.0.1:1/unused');
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const P = await import('@/server/media/presentation');
const { adoptFile, assetFromStored } = await import('@/server/media');
const { assetRow } = await import('@/server/studio/persist');
const { assetFromRow } = await import('@/server/studio/snapshot');

type Rgb = [number, number, number];
type Rgba = [number, number, number, number];
interface Img { data: Uint8Array; width: number; height: number }

const canvas = (width: number, height: number, fill: Rgb | Rgba): Img => {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(fill.length === 4 ? fill : [...fill, 255], i * 4);
  return { data, width, height };
};
const paint = (img: Img, inside: (x: number, y: number) => boolean, color: Rgb | Rgba | ((x: number, y: number) => Rgb)) => {
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (!inside(x, y)) continue;
    const c = typeof color === 'function' ? color(x, y) : color;
    img.data.set(c.length === 4 ? c : [...c, 255], (y * img.width + x) * 4);
  }
  return img;
};
/** deterministic grain */
const lcg = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const lchOf = ([r, g, b]: Rgb) => P.labToLch(P.linearToOklab(...([r, g, b].map((v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }) as Rgb)));
const hueDistance = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
const writePng = (img: Img, name: string) => {
  const file = path.join(dir, name);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${img.width}x${img.height}`, '-i', 'pipe:0', '-frames:v', '1', file], { input: Buffer.from(img.data) });
  return file;
};

/** A canonical-style figure, 160×288: mid-grey studio backdrop with grain, a charcoal suit, a small skin-toned head
 *  (two of the 256 cells carry colour). */
function greyFigure(grey = 128): Img {
  const rnd = lcg(7);
  const img = canvas(160, 288, [grey, grey, grey]);
  paint(img, () => true, () => { const n = Math.round((rnd() - 0.5) * 6); return [grey + n, grey + n, grey + n]; });
  paint(img, (x, y) => x >= 64 && x < 96 && y >= 62 && y < 270, [38, 38, 40]);
  paint(img, (x, y) => (x - 80) ** 2 + (y - 44) ** 2 <= 64, [205, 160, 130]);
  return img;
}

/** A 16:9 key art, 320×180: an orange dusk sky, a white sun, a near-neutral dark ground. */
function keyArt(): Img {
  const img = canvas(320, 180, [12, 12, 13]);
  paint(img, (_x, y) => y < 130, (_x, y) => { const t = y / 130; return [Math.round(240 - 40 * t), Math.round(120 - 50 * t), Math.round(40 - 10 * t)]; });
  paint(img, (x, y) => (x - 230) ** 2 + (y - 60) ** 2 <= 225, [255, 250, 240]);
  return img;
}

describe('§2.4 measured from the pixels', () => {
  it('the colour maths matches the OKLab reference values', () => {
    const red = lchOf([255, 0, 0]);
    expect(red.L).toBeCloseTo(0.628, 3); expect(red.C).toBeCloseTo(0.2577, 3); expect(red.H).toBeCloseTo(29.23, 1);
    const white = lchOf([255, 255, 255]);
    expect(white.L).toBeCloseTo(1, 4); expect(white.C).toBeLessThan(1e-4);
    expect(P.oklchToRgb8({ L: 0.628, C: 0.2577, H: 29.23 })).toEqual([255, 0, 0]);
    expect(P.formatOklch({ L: 0.6, C: 0.00001, H: 248.7 })).toBe('oklch(0.600 0.000 0.0)'); // no hue noise on a grey
    expect(P.formatOklch({ L: 0.5, C: 0.1, H: 359.97 })).toBe('oklch(0.500 0.100 0.0)');
  });

  it('a grey-backdrop figure yields no dominant and an edge ≈ its grey', () => {
    for (const grey of [96, 128, 160]) {
      const p = P.presentationFromPixels(greyFigure(grey));
      expect(p.dominant).toBeUndefined();
      const edge = parseOklch(p.edge)!;
      expect(edge.C).toBeLessThan(0.003);
      expect(edge.L).toBeCloseTo(lchOf([grey, grey, grey]).L, 2);
      for (const v of P.oklchToRgb8(edge)) expect(Math.abs(v - grey)).toBeLessThanOrEqual(1);
      expect(p.lightBackdrop).toBe(false);
    }
    // the same figure in a red coat is not neutral: the backdrop rule drops greys, not figures
    const coat = paint(greyFigure(), (x, y) => x >= 56 && x < 104 && y >= 62 && y < 200, [190, 30, 35]);
    expect(hueDistance(parseOklch(P.presentationFromPixels(coat).dominant)!.H, lchOf([190, 30, 35]).H)).toBeLessThan(2);
  });

  it('a saturated key art yields its hue, stored unclamped (the measured L and C)', () => {
    const p = P.presentationFromPixels(keyArt());
    const d = parseOklch(p.dominant)!;
    expect(d).toBeDefined();
    const sky = lchOf([220, 95, 35]);
    expect(hueDistance(d.H, sky.H)).toBeLessThan(10);
    expect(d.C).toBeGreaterThan(0.12); // well above the 0.045 wash cap: the record keeps the real chroma
    expect(d.L).toBeGreaterThan(0.5); expect(d.L).toBeLessThan(0.75);
    expect(p.edge).toBeDefined();
    expect(p.lightBackdrop).toBe(false);
  });

  it('the heaviest chroma-weighted bucket wins over the larger area, averaged in OKLab', () => {
    const teal: Rgb = [70, 140, 150], red: Rgb = [220, 30, 40];
    expect(lchOf(teal).C * 0.6).toBeLessThan(lchOf(red).C * 0.4); // the premise: red is heavier though smaller
    const img = canvas(160, 160, teal);
    paint(img, (x) => x >= 96, red);
    const d = parseOklch(P.presentationFromPixels(img).dominant)!;
    expect(hueDistance(d.H, lchOf(red).H)).toBeLessThan(1);
    expect(d.C).toBeCloseTo(lchOf(red).C, 2);
  });

  it('fewer than 8 surviving cells store nothing; near-white, near-black and grey cells never count', () => {
    const grid = (n: number) => paint(canvas(16, 16, [128, 128, 128]), (x, y) => y * 16 + x < n, [220, 30, 40]);
    expect(P.presentationFromPixels(grid(7)).dominant).toBeUndefined();
    expect(parseOklch(P.presentationFromPixels(grid(8)).dominant)).toBeDefined();
    const pale: Rgb = [255, 235, 235], ink: Rgb = [0, 0, 8], greyish: Rgb = [130, 128, 126];
    expect(lchOf(pale).L).toBeGreaterThan(0.92); expect(lchOf(pale).C).toBeGreaterThan(0.02);
    expect(lchOf(ink).L).toBeLessThan(0.12); expect(lchOf(ink).C).toBeGreaterThan(0.02);
    expect(lchOf(greyish).C).toBeLessThan(0.02);
    const img = canvas(48, 48, pale);
    paint(img, (x) => x >= 16 && x < 32, ink);
    paint(img, (x) => x >= 32, greyish);
    expect(P.presentationFromPixels(img).dominant).toBeUndefined();
  });

  it('lightBackdrop is set for white borders (relative luminance > 0.8), not for darker ones', () => {
    const framed = (border: number) => paint(canvas(200, 120, [border, border, border]), (x, y) => x >= 20 && x < 180 && y >= 20 && y < 100, [30, 60, 200]);
    const white = P.presentationFromPixels(framed(255));
    expect(white.lightBackdrop).toBe(true);
    expect(parseOklch(white.edge)!.L).toBeCloseTo(1, 2);
    expect(hueDistance(parseOklch(white.dominant)!.H, lchOf([30, 60, 200]).H)).toBeLessThan(1);
    expect(P.presentationFromPixels(framed(240)).lightBackdrop).toBe(true); // Y 0.87
    expect(P.presentationFromPixels(framed(225)).lightBackdrop).toBe(false); // Y 0.75
  });

  it('the edge is the 4 px ring only, and a transparent ring is not read as black', () => {
    const img = canvas(64, 64, [40, 90, 200]);
    paint(img, (x, y) => x < 4 || y < 4 || x >= 60 || y >= 60, [200, 40, 40]);
    for (const v of P.oklchToRgb8(parseOklch(P.presentationFromPixels(img).edge)!)) expect([200, 40].some((c) => Math.abs(v - c) <= 1)).toBe(true);
    const cut = canvas(64, 64, [0, 0, 0, 0]);
    paint(cut, (x, y) => x >= 8 && x < 56 && y >= 8 && y < 56, [40, 90, 200]);
    const p = P.presentationFromPixels(cut);
    expect(p.edge).toBeUndefined(); expect(p.lightBackdrop).toBeUndefined();
    expect(parseOklch(p.dominant)).toBeDefined();
    const half = canvas(64, 64, [255, 255, 255, 0]);
    paint(half, (x, y) => (x < 4 || y < 4 || x >= 60 || y >= 60) && x < 32, [128, 128, 128]);
    expect(P.oklchToRgb8(parseOklch(P.presentationFromPixels(half).edge)!)).toEqual([128, 128, 128]);
  });
});

// real ffmpeg decodes: generous time, so a busy machine (parallel dev servers, builds) never fails them spuriously
describe('decoded by ffmpeg, measured at ingest', { timeout: 30_000 }, () => {
  it('a PNG on disk measures exactly as its pixels do', async () => {
    for (const [name, img] of [['figure.png', greyFigure()], ['key-art.png', keyArt()]] as const) {
      expect(await P.measurePresentation(writePng(img, name))).toEqual(P.presentationFromPixels(img));
    }
  });

  it('a picture larger than 2048 px is decoded at 2048 and its ring scales with it', async () => {
    const big = paint(canvas(4096, 64, [200, 40, 40]), (x, y) => x >= 8 && x < 4088 && y >= 8 && y < 56, [40, 90, 200]);
    const px = await P.rgbaPixels(writePng(big, 'wide.png'));
    expect([px.width, px.height, px.scale]).toEqual([2048, 32, 0.5]);
    const edge = parseOklch((await P.measurePresentation(writePng(big, 'wide.png'))).edge)!;
    expect(P.oklchToRgb8(edge)).toEqual([200, 40, 40]); // the 8 px border is 4 px at half size: the ring is 2 px
  });

  it('adoptFile measures a picture once and assetFromStored carries it; a sound has none', async () => {
    const stored = await adoptFile('gen-b1-figure', writePng(keyArt(), 'adopt.png'), { expectKind: 'IMAGE' });
    expect(stored.presentation).toEqual(P.presentationFromPixels(keyArt()));
    expect(stored.presentationError).toBeUndefined();
    expect(assetFromStored('gen-b1-figure', stored, { label: 'key art', tags: [], origin: 'GENERATED' }).presentation).toEqual(stored.presentation);
    const wav = path.join(dir, 'tone.wav');
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5', wav]);
    const sound = await adoptFile('gen-b1-tone', wav, { expectKind: 'AUDIO' });
    expect(sound.presentation).toBeUndefined(); expect(sound.presentationError).toBeUndefined();
    expect('presentation' in assetFromStored('gen-b1-tone', sound, { label: 'tone', tags: [], origin: 'GENERATED' })).toBe(false);
  });

  it('a picture that cannot be measured is still stored, with the field empty and the reason kept', async () => {
    const png = fs.readFileSync(writePng(keyArt(), 'whole.png'));
    const broken = path.join(dir, 'broken.png');
    fs.writeFileSync(broken, png.subarray(0, 60)); // the signature and header survive; the pixels do not
    const stored = await adoptFile('gen-b1-broken', broken, { expectKind: 'IMAGE' });
    expect(fs.existsSync(stored.absPath)).toBe(true);
    expect(stored.presentation).toBeUndefined();
    expect(stored.presentationError).toBeTruthy();
    expect('presentation' in assetFromStored('gen-b1-broken', stored, { label: 'broken', tags: [], origin: 'UPLOAD' })).toBe(false);
  });
});

describe('faceBox only from a face box the studio measured on that image', { timeout: 30_000 }, () => {
  const reading = (boxes: unknown) => ({ reading: { boxes } });
  it('one MediaPipe box on the picture becomes 0–1 fractions', () => {
    expect(P.faceBoxFromReading(reading([{ x: 337, y: 154, width: 240, height: 240, score: 0.93 }]), { width: 928, height: 1664 })).toEqual({ x: 0.3631, y: 0.0925, w: 0.2586, h: 0.1442 });
  });
  it('no reading, several faces, a box off the picture or no size: none (nothing is estimated)', () => {
    expect(P.faceBoxFromReading(undefined, { width: 928, height: 1664 })).toBeUndefined();
    expect(P.faceBoxFromReading({ faceBox: { x: 337, y: 154, width: 240, height: 240 } }, { width: 928, height: 1664 })).toBeUndefined(); // a canonical image's crop of its reference
    expect(P.faceBoxFromReading(reading([{ x: 1, y: 1, width: 50, height: 50 }, { x: 300, y: 1, width: 40, height: 40 }]), { width: 928, height: 1664 })).toBeUndefined();
    expect(P.faceBoxFromReading(reading([{ x: 900, y: 10, width: 200, height: 200 }]), { width: 928, height: 1664 })).toBeUndefined();
    expect(P.faceBoxFromReading(reading([{ x: 10, y: 10, width: 20, height: 20 }]), {})).toBeUndefined();
    expect(P.faceBoxFromReading(reading([{ x: 'a', y: 10, width: 20, height: 20 }]), { width: 100, height: 100 })).toBeUndefined();
  });
  it('a picture with a reading gets its face box with its measures', async () => {
    const file = writePng(greyFigure(), 'read.png');
    const p = await P.presentationOfAsset({ width: 160, height: 288, provenance: reading([{ x: 72, y: 36, width: 16, height: 16 }]) }, file);
    expect(p).toEqual({ ...P.presentationFromPixels(greyFigure()), faceBox: { x: 0.45, y: 0.125, w: 0.1, h: 0.0556 } });
    expect((await P.presentationOfAsset({ width: 160, height: 288 }, file)).faceBox).toBeUndefined();
  });
});

describe('artVars (src/studio/presentation.ts)', () => {
  it('the clamp keeps L and C: the wash and placeholder at L 0.20 / 0.24, C′ = min(C, 0.045), the hue kept', () => {
    expect(artVars({ presentation: { dominant: 'oklch(0.640 0.180 50.0)', edge: 'oklch(0.600 0.000 0.0)' } })).toEqual({ '--art': 'oklch(0.20 0.045 50.0)', '--art-ph': 'oklch(0.24 0.045 50.0)', '--art-edge': 'oklch(0.600 0.000 0.0)' });
    for (let h = 0; h < 360; h += 15) for (const c of [0.021, 0.03, 0.045, 0.1, 0.37]) {
      const v = artVars({ presentation: { dominant: `oklch(0.700 ${c.toFixed(3)} ${h.toFixed(1)})` } });
      const wash = parseOklch(v['--art'])!, ph = parseOklch(v['--art-ph'])!;
      expect([wash.L, ph.L]).toEqual([0.2, 0.24]);
      expect(wash.C).toBe(Math.min(c, ART_CHROMA_MAX)); expect(ph.C).toBe(wash.C);
      expect(wash.H).toBe(h); expect(ph.H).toBe(h);
    }
    // the record itself is never clamped: what the key art measured is what is stored
    const stored = parseOklch(P.presentationFromPixels(keyArt()).dominant)!;
    expect(stored.C).toBeGreaterThan(ART_CHROMA_MAX);
    expect(parseOklch(artVars({ presentation: { dominant: P.formatOklch(stored) } })['--art'])!.H).toBeCloseTo(stored.H, 1);
  });

  it('omits every key whose data is absent, and never passes a malformed value to a style', () => {
    expect(artVars(undefined)).toEqual({});
    expect(artVars(null)).toEqual({});
    expect(artVars({})).toEqual({});
    expect(artVars({ presentation: {} })).toEqual({});
    expect(artVars({ presentation: { edge: 'oklch(0.512 0.004 90.0)' } })).toEqual({ '--art-edge': 'oklch(0.512 0.004 90.0)' });
    expect(artVars({ presentation: { dominant: 'oklch(0.640 0.180 50.0)' } })).toEqual({ '--art': 'oklch(0.20 0.045 50.0)', '--art-ph': 'oklch(0.24 0.045 50.0)' });
    expect(artVars({ presentation: { dominant: 'red', edge: 'oklch(0.5 0.1 20); background: url(x)' } })).toEqual({});
    expect(artVars({ presentation: { dominant: 'oklch(1.5 0.1 20)', edge: '#808080' } })).toEqual({});
    // a figure on the grey backdrop: no wash at all, only its field
    expect(Object.keys(artVars({ presentation: P.presentationFromPixels(greyFigure()) }))).toEqual(['--art-edge']);
  });
});

describe('stored on the asset row and read back', () => {
  const base: Asset = { id: 'gen-b1', kind: 'IMAGE', src: '/api/media/gen-b1', label: 'x', tags: [], sample: false, origin: 'GENERATED', provenance: { path: 'image/2026/10/gen-b1.png' }, createdAt: '2026-10-03T00:00:00.000Z' };
  const viaDb = <T>(row: T): T => JSON.parse(JSON.stringify(row)) as T;
  it('round-trips through the column; an asset without it fingerprints as before', () => {
    const withP: Asset = { ...base, presentation: { dominant: 'oklch(0.640 0.180 50.0)', edge: 'oklch(0.600 0.000 0.0)', lightBackdrop: false, faceBox: { x: 0.36, y: 0.09, w: 0.26, h: 0.14 } } };
    expect(viaDb(assetRow(withP)).presentation).toEqual(withP.presentation);
    expect(canonical(assetFromRow(viaDb(assetRow(withP)) as never))).toBe(canonical(withP));
    expect(viaDb(assetRow(base)).presentation).toBeNull();
    const back = assetFromRow(viaDb(assetRow(base)) as never);
    expect(back.presentation).toBeUndefined();
    expect(canonical(back)).toBe(canonical(base));
  });
});
