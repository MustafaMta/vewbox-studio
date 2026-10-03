'use client';

import type { CSSProperties, ReactNode } from 'react';
import { cls } from './cls';

/** LOADING PRIMITIVES (v5.1; docs/DESIGN-SYSTEM-V5.md §5.16, §5.18) — calm placeholders that hold a page's real layout
 *  while its data or pictures arrive, and the three progress marks.
 *
 *    Skeleton.Line / .Text / .Block / .Media / .Tile   placeholders in the page's own shapes, on the placeholder tone
 *                                                       (`--art-ph`; a picture's own tint when the caller sets it),
 *                                                       with one slow, faint shimmer that stops under reduced motion
 *    Progress                                           a determinate bar (`value` 0–1, only when the engine reports a
 *                                                       real fraction) or an indeterminate one (`value` omitted)
 *    JobDot                                             the running dot: something is working right now (static under
 *                                                       reduced motion; its word carries it)
 *
 *  Placeholders are hidden from assistive technology: the region that waits says so once (`aria-busy` and a sentence,
 *  e.g. <SkeletonRegion label="Loading the shows…">). Nothing here spins without a sentence beside it. */

/** The content ratios of the studio (§5.8): key art and stills, posters, sleeves, figures, plates in heroes. */
export type SkeletonRatio = '16/9' | '2/3' | '1/1' | '928/1664' | '2.39/1';
const ratioCss = (r: SkeletonRatio) => r.replace('/', ' / ');

/** One line of text: `size` matches the type role it stands for. */
function Line({ width = '100%', size = 'body', className, style }: { width?: string; size?: 'title' | 'body' | 'small'; className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={cls('sk sk-line', className)} data-size={size} style={{ inlineSize: width, ...style }} />;
}

/** A few lines of text, the last one shorter, as a paragraph or a slate settles. */
function Text({ lines = 2, size = 'body', className }: { lines?: number; size?: 'title' | 'body' | 'small'; className?: string }) {
  const widths = ['92%', '78%', '64%', '84%', '56%'];
  return (
    <span aria-hidden className={cls('sk-text', className)}>
      {Array.from({ length: lines }, (_, i) => <Line key={i} size={size} width={i === lines - 1 && lines > 1 ? '58%' : widths[i % widths.length]} />)}
    </span>
  );
}

/** A block of any size (a button, a field, a panel). */
function Block({ width = '100%', height = 44, radius = 'md', className, style }: { width?: string | number; height?: string | number; radius?: 'media' | 'md' | 'lg' | 'pill'; className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={cls('sk sk-block', className)} data-radius={radius} style={{ inlineSize: width, blockSize: height, ...style }} />;
}

/** A picture's place at its true ratio, so nothing moves when it arrives. `tint` is the picture's own placeholder
 *  colour when it is known (an `--art-ph` value from the record). */
function Media({ ratio = '16/9', tint, className, style, children }: { ratio?: SkeletonRatio; tint?: string | null; className?: string; style?: CSSProperties; children?: ReactNode }) {
  return (
    <span aria-hidden className={cls('sk sk-media', className)} data-ratio={ratio} style={{ aspectRatio: ratioCss(ratio), ...(tint ? ({ '--art-ph': tint } as CSSProperties) : null), ...style }}>
      {children}
    </span>
  );
}

/** A tile while it loads: the frame at its ratio, then its name and slate. */
function Tile({ ratio = '16/9', lines = 2, className }: { ratio?: SkeletonRatio; lines?: 0 | 1 | 2; className?: string }) {
  return (
    <span aria-hidden className={cls('sk-tile', className)}>
      <Media ratio={ratio} />
      {lines > 0 && <span className="sk-tile-text"><Line size="body" width="72%" />{lines > 1 && <Line size="small" width="44%" />}</span>}
    </span>
  );
}

export const Skeleton = { Line, Text, Block, Media, Tile };
export { Line as SkeletonLine, Text as SkeletonText, Block as SkeletonBlock, Media as SkeletonMedia, Tile as SkeletonTile };

/** The region that waits: `aria-busy` and one sentence for assistive technology; the placeholders inside are silent. */
export function SkeletonRegion({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div aria-busy="true" className={cls('sk-region', className)}>
      <span className="sr-only" role="status">{label}</span>
      {children}
    </div>
  );
}

/** A progress bar. With `value` (0–1) it is determinate and says its percentage; without, it is indeterminate (a
 *  short segment travels; under reduced motion it rests at the start, and the label carries the state). */
export function Progress({ value, label, className, size = 'md' }: { value?: number | null; label: string; className?: string; size?: 'sm' | 'md' }) {
  const known = typeof value === 'number' && Number.isFinite(value);
  const pct = known ? Math.round(Math.min(1, Math.max(0, value as number)) * 100) : null;
  return (
    <span role="progressbar" aria-label={label} aria-valuemin={known ? 0 : undefined} aria-valuemax={known ? 100 : undefined} aria-valuenow={pct ?? undefined}
      className={cls('pbar', className)} data-size={size} data-indeterminate={known ? undefined : true}>
      <span className="pbar-fill" style={known ? { inlineSize: `${pct}%` } : undefined} />
    </span>
  );
}

/** The running dot, with its words: "Drawing Elias", "Rendering shot 2.3". `children` is optional only when the
 *  surrounding text already says what runs. */
export function JobDot({ children, className, tone = 'running' }: { children?: ReactNode; className?: string; tone?: 'running' | 'waiting' | 'idle' }) {
  return (
    <span className={cls('job-dot', className)} data-tone={tone}>
      <span className="job-dot-mark" aria-hidden />
      {children}
    </span>
  );
}
