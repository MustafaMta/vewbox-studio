import { execFileP } from './exec';
import type { Presentation } from '@/domain/presentation';

// ffmpeg/ffprobe with a timeout, killed when the job is cancelled or times out (src/server/media/exec.ts)

/** IMAGE PRESENTATION, MEASURED ON THE CPU — docs/DESIGN-SYSTEM-V4.md §2.4. Every value comes from the picture's own
 *  pixels (decoded by ffmpeg, as `image-check.ts` does, into raw RGBA and read by a small pure-JS pass):
 *
 *  - `dominant`: the picture is reduced to 16×16 by area average; each cell goes to OKLCH; near-white (L > 0.92),
 *    near-black (L < 0.12) and grey (C < 0.02) cells are dropped; the rest fall into 24 hue buckets of 15°, each
 *    weighted by its cells' chroma; the heaviest bucket is averaged in OKLab. Fewer than 8 surviving cells: nothing
 *    (a grey studio backdrop is correctly neutral).
 *  - `edge`: the mean colour of the 4 px border ring (the letterbox fill and the figure-frame field).
 *  - `lightBackdrop`: the edge's relative luminance (WCAG, linear sRGB) is above 0.8.
 *
 *  Averages are taken in linear light (what the eye sees when the pixels blend), alpha-weighted, so a transparent
 *  border never reads as black. `focal` is never measured (the producer sets it; absent means DEFAULT_FOCAL) and
 *  `faceBox` only comes from a face box the studio already measured for the same image (`faceBoxFromReading`). */

export const PRESENTATION_RULES = {
  grid: 16, ring: 4, buckets: 24, minSurvivors: 8,
  nearWhiteL: 0.92, nearBlackL: 0.12, greyC: 0.02, lightLuminance: 0.8,
  /** a cell counts once at least half of it is opaque */
  minCoverage: 0.5,
  /** larger pictures are decoded at this long side (area average); the ring scales with them */
  maxDecodeSide: 2048,
} as const;

/** 8-bit RGBA, row-major, 4 bytes per pixel. */
export interface RgbaImage { data: Uint8Array; width: number; height: number }

// ------------------------------------------------------------------------------------------------- colour maths

/** sRGB 8-bit → linear light, as a lookup table. */
const LINEAR = (() => { const t = new Float64Array(256); for (let i = 0; i < 256; i++) { const c = i / 255; t[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; } return t; })();
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export interface Lab { L: number; a: number; b: number }
export interface Lch { L: number; C: number; H: number }

/** Linear sRGB → OKLab (Björn Ottosson's matrices). */
export function linearToOklab(r: number, g: number, b: number): Lab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return { L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s };
}

/** OKLab → linear sRGB (unclamped). */
export function oklabToLinear({ L, a, b }: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}

export const labToLch = ({ L, a, b }: Lab): Lch => { const H = (Math.atan2(b, a) * 180) / Math.PI; return { L, C: Math.hypot(a, b), H: H < 0 ? H + 360 : H }; };
export const lchToLab = ({ L, C, H }: Lch): Lab => ({ L, a: C * Math.cos((H * Math.PI) / 180), b: C * Math.sin((H * Math.PI) / 180) });

/** The CSS colour the record stores: `oklch(L C H)`, L and C to 3 decimals, H to 1; a colour whose chroma rounds to
 *  zero is written with hue 0 (its hue is noise). */
export function formatOklch({ L, C, H }: Lch): string {
  const l = Math.min(1, Math.max(0, L)), c = Math.max(0, C);
  const cs = c.toFixed(3);
  const h = Number(cs) === 0 ? 0 : ((H % 360) + 360) % 360;
  return `oklch(${l.toFixed(3)} ${cs} ${Number(h.toFixed(1)) === 360 ? '0.0' : h.toFixed(1)})`;
}

/** Read back an `oklch(L C H)` string this module wrote (the client's parser: one rule for both sides). */
export { parseOklch } from '@/studio/presentation';

/** An OKLCH colour as 8-bit sRGB (clipped): for reports and tests. */
export function oklchToRgb8(c: Lch): [number, number, number] {
  return oklabToLinear(lchToLab(c)).map((v) => Math.round(Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, v))))) * 255)) as [number, number, number];
}

/** WCAG relative luminance of a linear-light colour. */
export const relativeLuminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// ------------------------------------------------------------------------------------------------- the measures

interface LinearMean { r: number; g: number; b: number; coverage: number }

/** The alpha-weighted linear-light mean of the pixels in [x0, x1) × [y0, y1). */
function meanOf(img: RgbaImage, x0: number, x1: number, y0: number, y1: number, include?: (x: number, y: number) => boolean): LinearMean | undefined {
  const { data, width } = img;
  let r = 0, g = 0, b = 0, w = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (include && !include(x, y)) continue;
      const i = (y * width + x) * 4;
      const a = data[i + 3] / 255;
      n++;
      if (a === 0) continue;
      r += a * LINEAR[data[i]]; g += a * LINEAR[data[i + 1]]; b += a * LINEAR[data[i + 2]]; w += a;
    }
  }
  return w > 0 ? { r: r / w, g: g / w, b: b / w, coverage: w / n } : undefined;
}

/** The picture reduced to `n`×`n` cells by area average (cell edges at floor(i·W/n); a picture narrower than `n`
 *  repeats its columns). Cells with nothing opaque are undefined. */
export function areaCells(img: RgbaImage, n: number = PRESENTATION_RULES.grid): Array<LinearMean | undefined> {
  const cells: Array<LinearMean | undefined> = [];
  const edge = (i: number, size: number) => Math.floor((i * size) / n);
  for (let cy = 0; cy < n; cy++) {
    const y0 = Math.min(edge(cy, img.height), img.height - 1), y1 = Math.max(y0 + 1, edge(cy + 1, img.height));
    for (let cx = 0; cx < n; cx++) {
      const x0 = Math.min(edge(cx, img.width), img.width - 1), x1 = Math.max(x0 + 1, edge(cx + 1, img.width));
      cells.push(meanOf(img, x0, x1, y0, y1));
    }
  }
  return cells;
}

/** §2.4 dominant: the heaviest chroma-weighted hue bucket of the 16×16 cells, averaged in OKLab; undefined when fewer
 *  than 8 cells survive the white, black and grey cut. */
export function dominantOf(cells: Array<LinearMean | undefined>, rules = PRESENTATION_RULES): Lch | undefined {
  const bucketSize = 360 / rules.buckets;
  const buckets = Array.from({ length: rules.buckets }, () => ({ weight: 0, cells: [] as Lab[] }));
  let survivors = 0;
  for (const c of cells) {
    if (!c || c.coverage < rules.minCoverage) continue;
    const lab = linearToOklab(c.r, c.g, c.b);
    const { L, C, H } = labToLch(lab);
    if (L > rules.nearWhiteL || L < rules.nearBlackL || C < rules.greyC) continue;
    survivors++;
    const k = Math.floor(H / bucketSize) % rules.buckets;
    buckets[k].weight += C;
    buckets[k].cells.push(lab);
  }
  if (survivors < rules.minSurvivors) return undefined;
  let best = buckets[0];
  for (const b of buckets) if (b.weight > best.weight) best = b;
  const mean = best.cells.reduce((s, x) => ({ L: s.L + x.L, a: s.a + x.a, b: s.b + x.b }), { L: 0, a: 0, b: 0 });
  const k = best.cells.length;
  return labToLch({ L: mean.L / k, a: mean.a / k, b: mean.b / k });
}

/** The mean colour of the `ring`-px border (all of a picture too small to have an inside), linear light. */
export function ringMean(img: RgbaImage, ring: number = PRESENTATION_RULES.ring): LinearMean | undefined {
  const { width: w, height: h } = img;
  const r = Math.max(1, Math.round(ring));
  return meanOf(img, 0, w, 0, h, (x, y) => x < r || y < r || x >= w - r || y >= h - r);
}

/** Everything §2.4 measures from pixels. `ring` is the border width in this image's pixels (4 at full size). */
export function presentationFromPixels(img: RgbaImage, opts: { ring?: number } = {}): Presentation {
  if (img.width < 1 || img.height < 1 || img.data.length < img.width * img.height * 4) throw new Error(`bad pixel buffer for ${img.width}×${img.height}`);
  const out: Presentation = {};
  const dominant = dominantOf(areaCells(img));
  if (dominant) out.dominant = formatOklch(dominant);
  const edge = ringMean(img, opts.ring ?? PRESENTATION_RULES.ring);
  if (edge) {
    out.edge = formatOklch(labToLch(linearToOklab(edge.r, edge.g, edge.b)));
    out.lightBackdrop = relativeLuminance(edge.r, edge.g, edge.b) > PRESENTATION_RULES.lightLuminance;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------- decoding

async function probeSize(file: string): Promise<{ width: number; height: number }> {
  const { stdout } = await execFileP('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file], { maxBuffer: 1024 * 1024, timeout: 30_000 });
  const s = (JSON.parse(stdout) as { streams?: Array<{ width?: number; height?: number }> }).streams?.[0];
  return { width: Number(s?.width) || 0, height: Number(s?.height) || 0 };
}

/** Decode the first frame of a picture to RGBA with ffmpeg, scaled (area average) so the long side is at most
 *  `maxSide`; the size is always given to the scaler, so the buffer has exactly the size asked for. */
export async function rgbaPixels(file: string, opts: { size?: { width?: number; height?: number }; maxSide?: number } = {}): Promise<RgbaImage & { scale: number }> {
  const known = opts.size?.width && opts.size?.height ? { width: opts.size.width, height: opts.size.height } : await probeSize(file);
  const { width: w0, height: h0 } = known;
  if (!w0 || !h0) throw new Error('the picture has no dimensions');
  const scale = Math.min(1, (opts.maxSide ?? PRESENTATION_RULES.maxDecodeSide) / Math.max(w0, h0));
  const width = Math.max(1, Math.round(w0 * scale)), height = Math.max(1, Math.round(h0 * scale));
  const { stdout } = await execFileP('ffmpeg', ['-v', 'error', '-nostdin', '-i', file, '-frames:v', '1', '-vf', `scale=${width}:${height}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, timeout: 60_000 });
  const need = width * height * 4;
  if (stdout.length < need) throw new Error(`decoded ${stdout.length} bytes for ${width}×${height}`);
  return { data: new Uint8Array(stdout.buffer, stdout.byteOffset, need), width, height, scale };
}

/** Measure a picture file (dominant, edge, lightBackdrop). Throws when it cannot be decoded. */
export async function measurePresentation(file: string, size?: { width?: number; height?: number }): Promise<Presentation> {
  const img = await rgbaPixels(file, { size });
  return presentationFromPixels(img, { ring: PRESENTATION_RULES.ring * img.scale });
}

// ------------------------------------------------------------------------------------------------- face box

/** The face box the studio already measured for this very image, as 0–1 fractions: the MediaPipe reading the vision
 *  step stores on an uploaded reference (`provenance.reading.boxes`, pixels), when it found exactly one face. A box
 *  that does not fit the picture's recorded size (beyond 2 %) is not trusted; nothing is ever estimated here. Note
 *  `provenance.faceBox` on a canonical image is the crop of the REFERENCE picture, not a box on that image. */
export function faceBoxFromReading(provenance: Record<string, unknown> | undefined, size: { width?: number; height?: number }): Presentation['faceBox'] {
  const boxes = (provenance?.reading as { boxes?: unknown } | undefined)?.boxes;
  const W = Number(size.width) || 0, H = Number(size.height) || 0;
  if (!Array.isArray(boxes) || boxes.length !== 1 || !W || !H) return undefined;
  const o = boxes[0] as Record<string, unknown> | null;
  const [x, y, w, h] = [o?.x, o?.y, o?.width, o?.height].map(Number);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return undefined;
  const tol = 0.02;
  if (x < -tol * W || y < -tol * H || x + w > (1 + tol) * W || y + h > (1 + tol) * H) return undefined;
  const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(W, x + w), y1 = Math.min(H, y + h);
  const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
  return { x: r4(x0 / W), y: r4(y0 / H), w: r4((x1 - x0) / W), h: r4((y1 - y0) / H) };
}

/** What a picture asset gets when it has no presentation yet (the backfill, MEDIA_PROBE): the measures from its
 *  file, plus the face box already measured for it, if any. */
export async function presentationOfAsset(asset: { width?: number; height?: number; provenance?: Record<string, unknown> }, file: string): Promise<Presentation> {
  const measured = await measurePresentation(file, { width: asset.width, height: asset.height });
  const faceBox = faceBoxFromReading(asset.provenance, asset);
  return faceBox ? { ...measured, faceBox } : measured;
}
