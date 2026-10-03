import type { ArtVars, Presentation } from '@/domain/presentation';

/** THE ART TINT — the one helper that turns a picture's measured presentation into the CSS variables a lobby hero
 *  or tile paints with (docs/DESIGN-SYSTEM-V4.md §2.4). The wash keeps the artwork's hue at a fixed dark lightness
 *  with its chroma capped, so every text role stays AA on it (§2.6); the placeholder is the same hue a step lighter;
 *  the edge is the picture's own border colour. A key is absent when its data is absent or unreadable: neutral. */

/** Lightness of `--art` and `--art-ph`, and the chroma cap C′ = min(C, 0.045) (§2.6's worst case). */
export const ART_WASH_L = '0.20';
export const ART_PLACEHOLDER_L = '0.24';
export const ART_CHROMA_MAX = 0.045;

const OKLCH = /^oklch\(\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*\)$/;

/** Read an `oklch(L C H)` colour as the server writes it (L 0–1, C ≥ 0, H 0–360); anything else is undefined, so a
 *  malformed record can never reach a style. */
export function parseOklch(s: string | undefined | null): { L: number; C: number; H: number } | undefined {
  const m = typeof s === 'string' ? OKLCH.exec(s.trim()) : null;
  if (!m) return undefined;
  const [L, C, H] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return L <= 1 && C <= 0.5 && H <= 360 ? { L, C, H } : undefined;
}

/** `{ '--art': 'oklch(0.20 C′ H)', '--art-ph': 'oklch(0.24 C′ H)', '--art-edge': edge }` for an asset (or nothing). */
export function artVars(asset: { presentation?: Presentation | null } | null | undefined): ArtVars {
  const p = asset?.presentation;
  const out: ArtVars = {};
  const d = parseOklch(p?.dominant);
  if (d) {
    const c = Math.min(d.C, ART_CHROMA_MAX).toFixed(3), h = d.H.toFixed(1);
    out['--art'] = `oklch(${ART_WASH_L} ${c} ${h})`;
    out['--art-ph'] = `oklch(${ART_PLACEHOLDER_L} ${c} ${h})`;
  }
  if (p?.edge && parseOklch(p.edge)) out['--art-edge'] = p.edge.trim();
  return out;
}
