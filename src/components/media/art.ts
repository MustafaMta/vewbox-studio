import type { CSSProperties } from 'react';
import { DEFAULT_FOCAL, type ArtVars, type Presentation } from '@/domain/presentation';

/** THE PICTURE CONTRACT OF THE MEDIA KIT (docs/DESIGN-SYSTEM-V4.md §2.4, §5.4).
 *
 *  A `Picture` is what every frame, tile and hero draws: a domain `Asset` satisfies it as it is, and B1's
 *  `presentation` is read when it is there. Nothing here computes colour from pixels (that is B1's server job); these
 *  helpers only turn the measured facts into CSS, and with no facts they return nothing, so the picture is neutral. */

export interface Picture {
  src: string;
  width?: number;
  height?: number;
  /** the record exists but its file is missing */
  unavailable?: boolean;
  poster?: string;
  presentation?: Presentation | null;
  provenance?: Record<string, unknown>;
}

/** The ratios of the system (§0 decision 2, §4.3). */
export type FrameRatio = '16/9' | '2/3' | '1/1' | '928/1664' | '2.39/1' | '21/9' | '9/16';
export const RATIO_VALUE: Record<FrameRatio, number> = { '16/9': 16 / 9, '2/3': 2 / 3, '1/1': 1, '928/1664': 928 / 1664, '2.39/1': 2.39, '21/9': 21 / 9, '9/16': 9 / 16 };
export const cssRatio = (r: FrameRatio) => r.replace('/', ' / ');

type ArtKey = '--art' | '--art-ph' | '--art-edge';
const ALL: ArtKey[] = ['--art', '--art-ph', '--art-edge'];

/** The runtime art variables for one element, limited to the keys the element may take (§2.4: only four lobby heroes
 *  take `--art`; a figure frame takes only `--art-edge`). Absent or empty values are left out, so the tokens' neutral
 *  defaults apply. */
export function artStyle(art: ArtVars | null | undefined, keys: readonly ArtKey[] = ALL): CSSProperties {
  const out: Record<string, string> = {};
  if (!art) return out;
  for (const k of keys) { const v = art[k]; if (typeof v === 'string' && v.trim()) out[k] = v; }
  return out as CSSProperties;
}

/** A focal point, clamped to 0–1, from the presentation first, then an explicit one, then the default. */
export function focalOf(presentation?: Presentation | null, focal?: { x: number; y: number } | null): { x: number; y: number } {
  const f = presentation?.focal ?? focal ?? DEFAULT_FOCAL;
  const c = (n: number, d: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : d);
  return { x: c(f.x, DEFAULT_FOCAL.x), y: c(f.y, DEFAULT_FOCAL.y) };
}

/** `object-position` for a focal crop (§2.4): `calc(focal.x * 100%) calc(focal.y * 100%)`. */
export function objectPosition(presentation?: Presentation | null, focal?: { x: number; y: number } | null): string {
  const f = focalOf(presentation, focal);
  return `${+(f.x * 100).toFixed(2)}% ${+(f.y * 100).toFixed(2)}%`;
}

/** The light-backdrop rule (§2.4): lobby tiles and lobby heroes dim a light-backed image to 0.9; never where the
 *  producer judges the true pixels (cutting room, theatre, approval — `judge`). The CSS also refuses it in those rooms. */
export const dimsLight = (presentation?: Presentation | null, judge?: boolean) => Boolean(presentation?.lightBackdrop) && !judge;

/** The face crop of a figure (§5.5 FaceCircle): `presentation.faceBox`, else the top 18 % of the framing box stored in
 *  the asset's provenance (`provenance.framing.box`), squared on its centre. Fractions of the picture. */
export function faceBoxOf(p: Pick<Picture, 'presentation' | 'provenance' | 'width' | 'height'> | null | undefined): { x: number; y: number; w: number; h: number } | null {
  if (!p) return null;
  const fb = p.presentation?.faceBox;
  if (fb && fb.w > 0 && fb.h > 0) return fb;
  const box = (p.provenance as { framing?: { box?: { x: number; y: number; w: number; h: number } | null } } | undefined)?.framing?.box;
  if (!box || !(box.w > 0) || !(box.h > 0)) return null;
  const W = p.width ?? 928, H = p.height ?? 1664;
  const side = 0.18 * box.h * H; // px: the head and shoulders band
  const w = Math.min(1, side / W), h = Math.min(1, side / H);
  return { x: Math.max(0, box.x + box.w / 2 - w / 2), y: box.y, w, h };
}

/** Where to place the image inside a circle so the face box fills it: width and offsets in % of the circle. */
export function faceCrop(box: { x: number; y: number; w: number; h: number }, width = 1, height = 1): { size: number; x: number; y: number; aspect: number } {
  const bw = box.w * width, bh = box.h * height;
  const m = Math.max(bw, bh) || 1;
  const size = (width / m) * 100; // image width in % of the circle
  const ih = (height / m) * 100;
  const x = 50 - (box.x + box.w / 2) * size;
  const y = 50 - (box.y + box.h / 2) * ih;
  return { size, x, y, aspect: width / height };
}

/** Initials for a face with no picture: the first letter of the first two words (any script). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => Array.from(p)[0] ?? '').join('');
}
