'use client';

import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/kit/Loading';
import { cls } from '@/components/ui/kit/cls';
import type { ShelfKind } from '@/components/ui/kit/Shelf';

/** THE SKELETON OF EVERY CARD SHAPE (docs/design/VISUAL-STANDARD-V5.1.md §5.22) — each one is drawn with the SAME classes
 *  that size the real card, so swapping in the content moves nothing: media cards at their ratio, figures as figures
 *  with their name and badge rows, tool and featured cards at their heights, decision cards with their reserved lines,
 *  section heads with the title's line box, shelves with their real card widths. Silent for assistive technology:
 *  wrap a page's skeleton in <SkeletonRegion label="…">. */

const RATIO: Record<Exclude<ShelfKind, 'figure' | 'tool'>, '16/9' | '2/3' | '1/1'> = { wide: '16/9', poster: '2/3', sleeve: '1/1' };

/** A media card (and a start card) at its ratio. */
export function MediaCardSkeleton({ ratio = '16/9', className }: { ratio?: '16/9' | '2/3' | '1/1'; className?: string }) {
  return <span aria-hidden className={cls('mcard mcard-sk', className)}><Skeleton.Media ratio={ratio} /></span>;
}

/** A figure card: the 928:1664 frame, the name line, the badge row. */
export function FigureCardSkeleton({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cls('fcard', className)}>
      <Skeleton.Media ratio="928/1664" className="fcard-frame" />
      <span className="t-card fcard-name"><Skeleton.Line width="60%" /></span>
      <span className="fcard-state" />
    </span>
  );
}

/** A tool card: the card at its height, the glyph and two lines on surface-2. */
export function ToolCardSkeleton({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cls('card tool-card tool-card-sk', className)}>
      <span className="tool-card-top"><Skeleton.Block width={20} height={20} radius="xs" /></span>
      <span className="tool-card-words"><span className="tool-card-title"><Skeleton.Line width="56%" /></span><span className="tool-card-line"><Skeleton.Line width="80%" /></span></span>
    </span>
  );
}

/** The featured card: the chip, the title, two lines, the button, and `thumbs` squares (0–4). */
export function FeaturedCardSkeleton({ thumbs = 4, className }: { thumbs?: 0 | 1 | 2 | 3 | 4; className?: string }) {
  return (
    <span aria-hidden className={cls('card feat-card feat-card-sk', className)}>
      <span className="feat-words">
        <Skeleton.Block width={72} height={22} radius="pill" />
        <span className="feat-title"><Skeleton.Line size="title" width="62%" /></span>
        <span className="t-body feat-body"><Skeleton.Line width="88%" /><br /><Skeleton.Line width="54%" /></span>
        <Skeleton.Block width={96} height="var(--control-h-sm)" radius="pill" className="feat-btn" />
      </span>
      {thumbs > 0 && <span className="feat-thumbs" data-count={thumbs}>{Array.from({ length: thumbs }, (_, i) => <Skeleton.Block key={i} className="feat-thumb" width="100%" height="100%" radius="sm" />)}</span>}
    </span>
  );
}

/** A decision card: the 16:9 picture, the kind line, the heading, two reserved lines and the verb. */
export function DecisionCardSkeleton({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cls('dcard dcard-sk', className)}>
      <Skeleton.Media ratio="16/9" className="dcard-media" />
      <span className="dcard-body">
        <span className="dcard-kind t-label"><Skeleton.Line width="48%" /></span>
        <span className="t-card dcard-title"><Skeleton.Line width="70%" /></span>
        <span className="dcard-desc t-body"><Skeleton.Line width="92%" /><br /><Skeleton.Line width="60%" /></span>
        <Skeleton.Block width={136} height="var(--control-h-sm)" radius="pill" className="dcard-verb" />
      </span>
    </span>
  );
}

/** A media tile (catalogue grids): the frame, the name, the meta line. */
export function MediaTileSkeleton({ ratio = '16/9', className }: { ratio?: '16/9' | '2/3' | '1/1' | '928/1664' | '2.39/1'; className?: string }) {
  return (
    <div aria-hidden className={cls('mtile', className)}>
      <div className="mtile-link">
        <Skeleton.Media ratio={ratio} className="mtile-frame" />
        <span className="mtile-title"><Skeleton.Line width="60%" /></span>
        <span className="mtile-meta"><Skeleton.Line width="40%" /></span>
      </div>
    </div>
  );
}

/** A panel card with `cells` facts in `columns` across (as the PanelCard it stands for; default: min(4, cells)). */
export function PanelCardSkeleton({ cells = 4, columns, phoneColumns = 1, title, className }: { cells?: number; columns?: 2 | 3 | 4; phoneColumns?: 1 | 2; title?: boolean; className?: string }) {
  return (
    <span aria-hidden className={cls('card pcard', className)}>
      {title && <span className="t-title pcard-title"><Skeleton.Line width="9rem" /></span>}
      <span className="pcard-grid" data-cols={columns ?? Math.min(4, cells)} data-phone={phoneColumns === 2 ? 2 : undefined}>
        {Array.from({ length: cells }, (_, i) => (
          <span key={i} className="pcard-cell"><span className="t-label"><Skeleton.Line width="40%" /></span><span className="pcard-value"><Skeleton.Line width="72%" /></span></span>
        ))}
      </span>
    </span>
  );
}

/** A section head: the title's line box, an optional description line. */
export function SectionHeadSkeleton({ titleWidth = '8rem', description, className }: { titleWidth?: string; description?: boolean; className?: string }) {
  return (
    <span aria-hidden className={cls('shead', className)}>
      <span className="shead-start">
        <span className="shead-line"><span className="t-section shead-title"><Skeleton.Line size="title" width={titleWidth} /></span></span>
        {description && <span className="t-body shead-desc"><Skeleton.Line width="18rem" /></span>}
      </span>
    </span>
  );
}

/** A shelf: its head and `count` cards of its kind at their real widths. */
export function ShelfSkeleton({ kind = 'wide', count = 6, description = true, titleWidth, className }: { kind?: ShelfKind; count?: number; description?: boolean; titleWidth?: string; className?: string }) {
  const card = (i: number): ReactNode => kind === 'figure' ? <FigureCardSkeleton key={i} /> : kind === 'tool' ? <ToolCardSkeleton key={i} /> : <MediaCardSkeleton key={i} ratio={RATIO[kind]} />;
  return (
    <div aria-hidden className={cls('shelf', className)} data-kind={kind}>
      <SectionHeadSkeleton titleWidth={titleWidth} description={description} />
      <div className="shelf-track">{Array.from({ length: count }, (_, i) => <div key={i}>{card(i)}</div>)}</div>
    </div>
  );
}
