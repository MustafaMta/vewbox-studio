'use client';

import { T } from '@/lib/copy';

/** THE VEWBOX GLYPH — a lens opened by a V: the frame you view through. In the product it is monochrome ivory on a
 *  `--raised-2` tile (docs/DESIGN-SYSTEM-V4.md §2.5, V4-08): the work stays the brightest, most colourful thing on
 *  screen. The violet gradient mark survives only as the favicon (src/components/shell/brand-mark.ts). */
export function VewboxGlyph({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" focusable="false">
      <path d="M17.79 5.11A9 9 0 1 0 20.69 9.67" strokeWidth="1.6" />
      <path d="M8.2 8.6 12 15.9l3.8-7.3" strokeWidth="2.2" />
    </svg>
  );
}

/** The glyph on its 32 px tile (the sidebar's brand row, the phone bar). */
export function BrandTile({ className = '' }: { className?: string }) {
  return <span className={`brand-tile ${className}`} aria-hidden="true"><VewboxGlyph /></span>;
}

/** The tile and the wordmark. */
export function VewboxLogo({ className = '' }: { className?: string }) {
  return (
    <span className={`brand-logo ${className}`}>
      <BrandTile />
      <span className="brand-wordmark">{T('app.name')}</span>
    </span>
  );
}
