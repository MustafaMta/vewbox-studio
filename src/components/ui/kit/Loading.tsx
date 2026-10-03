'use client';

import type { CSSProperties, ReactNode } from 'react';
import { cls } from './cls';

/** LOADING PRIMITIVES (docs/design/VISUAL-STANDARD-V5.1.md §5.21, §5.22) — placeholders that hold a page's real
 *  layout while its data or pictures arrive, and the progress marks. The skeletons of every card shape are in
 *  src/components/media/Skeletons.tsx and are built from these.
 *
 *    Skeleton.Line / .Text / .Block / .Media / .Tile   placeholders in the page's own shapes: surface-1 (surface-2 on a
 *                                                       card), text bars radius 6, 12 high (titles 16) set inside the
 *                                                       real line box, so the line keeps its height; they appear after
 *                                                       150 ms (no flash on fast loads) and pulse 1 → .55 → 1 over
 *                                                       1.4 s — never a shimmer; static under reduced motion
 *    Progress                                           determinate (`value` 0–1, only with a real fraction; the phase
 *                                                       words and "2 of 8" above it when given) or indeterminate
 *    JobRunning                                         a job running: the running dot, its phase words, the elapsed
 *                                                       time and Cancel from the first second (§5.21)
 *    JobDot                                             the running dot with its words
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
function Block({ width = '100%', height = 44, radius = 'md', className, style }: { width?: string | number; height?: string | number; radius?: 'xs' | 'sm' | 'media' | 'md' | 'lg' | 'pill'; className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={cls('sk sk-block', className)} data-radius={radius} style={{ inlineSize: width, blockSize: height, ...style }} />;
}

/** A picture's place at its true ratio, so nothing moves when it arrives. `tint` is the picture's own placeholder
 *  colour when it is known (an `--art-ph` value from the record). */
function Media({ ratio = '16/9', tint, className, style, children }: { ratio?: SkeletonRatio; tint?: string | null; className?: string; style?: CSSProperties; children?: ReactNode }) {
  return (
    <span aria-hidden className={cls('sk sk-media', className)} data-ratio={ratio} style={{ aspectRatio: ratioCss(ratio), ...(tint ? ({ '--sk-fill': tint } as CSSProperties) : null), ...style }}>
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

/** A progress bar (§5.21): a 4 px track on surface-3, the fill text-1. With `value` (0–1) it is determinate; without,
 *  a 30 % fill travels (static under reduced motion; the words carry the state). `phase` and `count` draw the label
 *  row above it: the phase words at the start, "2 of 8" in mono at the end. */
export function Progress({ value, label, phase, count, className, size = 'md' }: { value?: number | null; label: string; phase?: ReactNode; count?: ReactNode; className?: string; size?: 'sm' | 'md' }) {
  const known = typeof value === 'number' && Number.isFinite(value);
  const pct = known ? Math.round(Math.min(1, Math.max(0, value as number)) * 100) : null;
  const bar = (
    <span role="progressbar" aria-label={label} aria-valuemin={known ? 0 : undefined} aria-valuemax={known ? 100 : undefined} aria-valuenow={pct ?? undefined}
      aria-valuetext={known && typeof count === 'string' ? count : undefined}
      className={cls('pbar', !(phase || count) && className)} data-size={size} data-indeterminate={known ? undefined : true}>
      <span className="pbar-fill" style={known ? { inlineSize: `${pct}%` } : undefined} />
    </span>
  );
  if (!(phase || count)) return bar;
  return (
    <span className={cls('pbar-wrap', className)}>
      <span className="pbar-label"><span className="pbar-phase">{phase}</span>{count != null && <span className="pbar-count">{count}</span>}</span>
      {bar}
    </span>
  );
}

/** A job running (§5.21): the running dot, the phase words ("Drawing frame 13 of 20"), the elapsed time in mono and a
 *  quiet sm Cancel, available from the first second. `elapsed` is seconds; the caller ticks it from the job's start. */
export function JobRunning({ phase, elapsed, onCancel, cancelling, cancelLabel = 'Cancel', className }: { phase: ReactNode; elapsed?: number | null; onCancel?: () => void; cancelling?: boolean; cancelLabel?: string; className?: string }) {
  const t = typeof elapsed === 'number' && Number.isFinite(elapsed) ? `${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}` : null;
  return (
    <span className={cls('job-run', className)} role="status">
      <span className="job-dot-mark" aria-hidden />
      <span className="job-run-phase">{phase}</span>
      {t && <span className="job-run-time" aria-label={`${t} elapsed`}>{t}</span>}
      {onCancel && <button type="button" className="btn btn-quiet btn-sm job-run-cancel" onClick={onCancel} disabled={cancelling} aria-busy={cancelling || undefined}>{cancelling ? 'Cancelling…' : cancelLabel}</button>}
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
