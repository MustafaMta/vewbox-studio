import type { CSSProperties } from 'react';
import { cls } from '@/components/ui/kit';
import { faceBoxOf, faceCrop, initials, type Picture } from './art';

/** THE FACE CIRCLE (docs/DESIGN-SYSTEM-V4.md §5.5) — 24, 28, 40, 56, 64 or 88 px. The crop comes from
 *  `presentation.faceBox`, else the top 18 % of the figure's framing box in the asset's provenance; with neither, the
 *  picture is centred near its top (portraits put the face there). No crop is ever generated. With no picture: the
 *  initials (40 % of the size, 600, muted) on the field tone. Rings: 2 px iris while speaking or singing now; 1.5 px
 *  ivory for the director in the company. The picture is never mirrored (the circle is laid out left to right). */

export type FaceSize = 24 | 28 | 40 | 56 | 64 | 88;

export function FaceCircle({ name, src, asset, size = 40, ring, lang, decorative, className }: { name: string; src?: string | null; asset?: (Picture & { width?: number; height?: number }) | null; size?: FaceSize; ring?: 'speaking' | 'director'; lang?: string; decorative?: boolean; className?: string }) {
  const url = asset?.src ?? src ?? null;
  const box = asset ? faceBoxOf(asset) : null;
  const crop = box ? faceCrop(box, asset?.width ?? 928, asset?.height ?? 1664) : null;
  const imgStyle: CSSProperties | undefined = crop
    ? { position: 'absolute', inlineSize: `${crop.size}%`, blockSize: 'auto', maxInlineSize: 'none', insetInlineStart: `${crop.x}%`, insetBlockStart: `${crop.y}%` }
    : undefined;
  return (
    <span className={cls('face', className)} data-size={size} data-ring={ring} dir="ltr"
      role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : name} aria-hidden={decorative || undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" loading="lazy" decoding="async" data-crop={crop ? 'face' : undefined} style={imgStyle} />
        : <span className="face-initials" lang={lang}>{initials(name)}</span>}
    </span>
  );
}
