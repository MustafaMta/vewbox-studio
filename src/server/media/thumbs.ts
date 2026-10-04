import fsp from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_FOCAL, type Presentation } from '@/domain/presentation';
import { ffmpeg } from './ffmpeg';
import { oklchToRgb8, parseOklch, probeImage } from './presentation';

// ffmpeg/ffprobe with a timeout, killed when the job is cancelled or times out (src/server/media/exec.ts)

/** DISPLAY-SIZE DERIVATIVES (docs/CONTRACTS-REDESIGN-BACKEND.md B7; docs/DESIGN-SYSTEM-V5.md §5.9, §8.13 Files) — the
 *  thumbnail every picture gets beside its original (a JPEG at most 2× of a 480 px long side, ≤ 120 KB for a figure
 *  and ≤ 160 KB for a still) and the composed frame poster of a production (a 2:3 crop of its best frame around the
 *  focal point, no text). ffmpeg does the pixels, as every other transformation in src/server/media; the originals are
 *  opened read-only and never changed. The maths is pure and tested; only the two `make…` calls touch disk. */

export const THUMB_RULES = {
  /** 2× of the 480 px display long side */
  maxSide: 960,
  figureBytes: 120 * 1024,
  stillBytes: 160 * 1024,
  /** JPEG quality steps tried until the file fits (ffmpeg -q:v, 2 best … 31 worst) */
  qualities: [3, 4, 5, 7, 9, 12, 15, 20, 25, 31],
  poster: { width: 960, height: 1440, maxBytes: 320 * 1024 },
  /** what a transparent picture is flattened onto when its edge colour is unknown */
  fallbackBackground: '#141414',
} as const;

/** A figure (a character picture: full body, portrait) gets the smaller budget: its tier says so, else its tags, else
 *  a portrait orientation (taller than wide). A still is everything else. At ingest only the orientation is known. */
export function isFigureLike(a: { tier?: string | null; tags?: string[]; width?: number; height?: number }): boolean {
  if (a.tier) return true;
  const tags = a.tags ?? [];
  if (tags.some((t) => ['character', 'canonical', 'portrait', 'identity', 'full-body', 'figure', 'sheet', 'face'].includes(t))) return true;
  return Boolean(a.width && a.height && a.height > a.width);
}
export const thumbBudget = (figure: boolean): number => (figure ? THUMB_RULES.figureBytes : THUMB_RULES.stillBytes);

/** The thumbnail's size: the long side at most `maxSide`, never upscaled, both sides even (JPEG 4:2:0). */
export function thumbSize(width: number, height: number, maxSide: number = THUMB_RULES.maxSide): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const even = (v: number) => Math.max(2, Math.round(v * scale / 2) * 2);
  return { width: even(width), height: even(height) };
}

/** The 2:3 window of a picture around a focal point (0–1): as tall as the picture when it is wider than 2:3, as wide
 *  as the picture otherwise, slid so the focal point is centred and the window stays inside. Integer pixels. */
export function portraitCrop(width: number, height: number, focal: { x: number; y: number } = DEFAULT_FOCAL, aspect = 2 / 3): { x: number; y: number; w: number; h: number } {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const fx = clamp(focal.x, 0, 1), fy = clamp(focal.y, 0, 1);
  let w: number, h: number;
  if (width / height > aspect) { h = height; w = Math.round(height * aspect); } else { w = width; h = Math.round(width / aspect); }
  w = Math.max(2, Math.min(width, w - (w % 2))); h = Math.max(2, Math.min(height, h - (h % 2)));
  const x = Math.round(clamp(fx * width - w / 2, 0, width - w));
  const y = Math.round(clamp(fy * height - h / 2, 0, height - h));
  return { x, y, w, h };
}

/** The poster's output size: 960×1440 at most, smaller (same 2:3) when the crop is smaller, never upscaled. */
export function posterSize(crop: { w: number; h: number }, max = THUMB_RULES.poster): { width: number; height: number } {
  const scale = Math.min(1, max.width / crop.w, max.height / crop.h);
  const width = Math.max(2, Math.round(crop.w * scale / 2) * 2);
  return { width, height: Math.max(2, Math.round(width * 1.5 / 2) * 2) };
}

/** The flatten colour for a picture with transparency: its measured edge colour (the figure field), else neutral. */
export function backgroundFor(presentation?: Presentation): string {
  const c = parseOklch(presentation?.edge);
  if (!c) return THUMB_RULES.fallbackBackground;
  return `#${oklchToRgb8(c).map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** The library path of a picture's thumbnail: beside the original, `.thumb.jpg` in place of the extension. */
export const thumbPathFor = (relPath: string): string => relPath.replace(/\.[^./\\]+$/, '') + '.thumb.jpg';

interface EncodeOpts { width: number; height: number; maxBytes: number; /** flatten transparency onto this colour (hex) */ background?: string; hasAlpha?: boolean; /** crop the source first (pixels) */ crop?: { x: number; y: number; w: number; h: number } }

/** The ffmpeg arguments of one JPEG encode at quality `q`. Pure. */
export function jpegArgs(input: string, out: string, q: number, o: EncodeOpts): string[] {
  const crop = o.crop ? `crop=${o.crop.w}:${o.crop.h}:${o.crop.x}:${o.crop.y},` : '';
  const scale = `scale=${o.width}:${o.height}:flags=lanczos`;
  const bg = (o.background ?? THUMB_RULES.fallbackBackground).replace('#', '0x');
  const filter = o.hasAlpha
    ? `color=c=${bg}:s=${o.width}x${o.height}:d=1[bg];[0:v]${crop}${scale},format=rgba[fg];[bg][fg]overlay=shortest=1,format=yuvj420p`
    : `[0:v]${crop}${scale},format=yuvj420p`;
  return ['-v', 'error', '-i', input, '-frames:v', '1', '-filter_complex', filter, '-q:v', String(q), '-update', '1', out];
}

/** Encode until the file fits its budget: quality steps first, then a smaller picture (85 % a side) when even the
 *  worst quality is too large. Returns what was written. */
export async function encodeToBudget(input: string, out: string, o: EncodeOpts): Promise<{ width: number; height: number; bytes: number; q: number }> {
  let { width, height } = o;
  for (let shrink = 0; shrink < 4; shrink++) {
    let last: { bytes: number; q: number } = { bytes: Infinity, q: THUMB_RULES.qualities[0] };
    for (const q of THUMB_RULES.qualities) {
      await ffmpeg(jpegArgs(input, out, q, { ...o, width, height }), { timeoutMs: 120_000 });
      const { size } = await fsp.stat(out);
      last = { bytes: size, q };
      if (size <= o.maxBytes) return { width, height, bytes: size, q };
    }
    width = Math.max(2, Math.round(width * 0.85 / 2) * 2); height = Math.max(2, Math.round(height * 0.85 / 2) * 2);
    if (shrink === 3) return { width, height, bytes: last.bytes, q: last.q };
  }
  throw new Error('unreachable');
}

/** Pixel format with an alpha channel (rgba, bgra, ya8, pal8 with transparency, …). */
export const hasAlphaFormat = (pixFmt?: string): boolean => Boolean(pixFmt && /a|pal8/.test(pixFmt.replace(/^gray/, '')) && !/^yuv(j)?4\d\dp(\d+)?(le|be)?$/.test(pixFmt));

export interface MadeFile { width: number; height: number; bytes: number }

/** The display-size thumbnail of a picture, written to `out` (the original is only read). */
export async function makeThumbnail(input: string, out: string, opts: { width?: number; height?: number; pixFmt?: string; figure: boolean; presentation?: Presentation }): Promise<MadeFile> {
  const probed = opts.width && opts.height ? { width: opts.width, height: opts.height, pixFmt: opts.pixFmt } : await probeImage(input);
  if (!probed.width || !probed.height) throw new Error('the picture has no dimensions');
  const size = thumbSize(probed.width, probed.height);
  await fsp.mkdir(path.dirname(out), { recursive: true });
  const r = await encodeToBudget(input, out, { ...size, maxBytes: thumbBudget(opts.figure), hasAlpha: hasAlphaFormat(probed.pixFmt ?? opts.pixFmt), background: backgroundFor(opts.presentation) });
  return { width: r.width, height: r.height, bytes: r.bytes };
}

/** The composed frame poster: the 2:3 window around the focal point, at display size, no text. */
export async function makeFramePoster(input: string, out: string, opts: { width?: number; height?: number; pixFmt?: string; focal?: { x: number; y: number }; presentation?: Presentation }): Promise<MadeFile & { crop: { x: number; y: number; w: number; h: number }; focal: { x: number; y: number } }> {
  const probed = opts.width && opts.height ? { width: opts.width, height: opts.height, pixFmt: opts.pixFmt } : await probeImage(input);
  if (!probed.width || !probed.height) throw new Error('the picture has no dimensions');
  const focal = opts.focal ?? opts.presentation?.portraitFocal ?? opts.presentation?.focal ?? { ...DEFAULT_FOCAL };
  const crop = portraitCrop(probed.width, probed.height, focal);
  const size = posterSize(crop);
  await fsp.mkdir(path.dirname(out), { recursive: true });
  const r = await encodeToBudget(input, out, { ...size, crop, maxBytes: THUMB_RULES.poster.maxBytes, hasAlpha: hasAlphaFormat(probed.pixFmt ?? opts.pixFmt), background: backgroundFor(opts.presentation) });
  return { width: r.width, height: r.height, bytes: r.bytes, crop, focal };
}
