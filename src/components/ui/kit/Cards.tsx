'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { IconChevronLeft, IconChevronRight } from '../icons';
import { cls } from './cls';

/** SECTION HEADS AND THE CARDS WITHOUT PICTURES (docs/design/VISUAL-STANDARD-V5.1.md §5.4, §5.8, §5.9; the approved
 *  Home is the visual reference) — props, no page logic. The cards that draw pictures live in the media kit
 *  (src/components/media/Cards.tsx); the shelf in ./Shelf.
 *
 *    SectionHead   min 32 high, 16 above the content: h2 (.t-section) + count (mono; the needs-you count in --wait),
 *                  an optional description under it (.t-body, 2 px), and at the end a quiet link with a chevron and/or
 *                  the prev/next buttons of a shelf (hidden on phones, where the shelf is swiped), or one action.
 *                  On phones the rail readout "1 of 4" sits beside the title.
 *    ToolCard      a level-1 card that is one link, 112 high (104 on phones): the object's shape glyph at the top
 *                  start, a title and one line at the bottom (Home's tool cards). `chevron` adds the §5.8 chevron.
 *    PanelCard     a level-1 panel, padding 20 (16 on phones), optionally a title and a definition grid of facts
 *    ShapeGlyph    the object's own shape drawn with the viewfinder's four corners, 20 px, decorative */

export interface SectionHeadArrows {
  onPrev: () => void;
  onNext: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  /** what the buttons move through, for their names: "shows" → "Previous shows" / "Next shows" */
  label?: string;
}

export function SectionHead({ title, id, count, countTone, description, link, arrows, action, position, level = 2, className }: {
  title: ReactNode;
  /** the heading's id, for aria-labelledby on the section */
  id?: string;
  count?: number | null;
  /** the needs-you count is tungsten (§3.1); every other count is text-3 */
  countTone?: 'wait';
  description?: ReactNode;
  link?: { href: string; label: string; /** the shorter label for phones ("All") */ short?: string };
  /** a shelf's previous / next buttons; shown beside the link (Home), hidden on phones */
  arrows?: SectionHeadArrows | null;
  /** one secondary sm button instead of the link */
  action?: ReactNode;
  /** the rail position readout on phones: "1 of 4" */
  position?: string;
  level?: 2 | 3;
  className?: string;
}) {
  const H = level === 2 ? 'h2' : 'h3';
  const what = arrows?.label ?? (typeof title === 'string' ? title.toLowerCase() : 'items');
  return (
    <div className={cls('shead', className)}>
      <div className="shead-start">
        <div className="shead-line">
          <H id={id} className="t-section shead-title">{title}</H>
          {count != null && <span className="shead-count" data-tone={countTone}>{count}</span>}
          {position && <span className="shead-pos">{position}</span>}
        </div>
        {description != null && <p className="t-body shead-desc">{description}</p>}
      </div>
      {(link || arrows || action) && (
        <div className="shead-end">
          {link && (
            <Link href={link.href} className="shead-link">
              <span className={link.short ? 'shead-link-long' : undefined}>{link.label}</span>
              {link.short && <span className="shead-link-short" aria-hidden>{link.short}</span>}
              <IconChevronRight aria-hidden />
            </Link>
          )}
          {!link && action}
          {arrows && (
            <span className="shead-arrows">
              <button type="button" className="btn btn-secondary btn-icon btn-sm" aria-label={`Previous ${what}`} disabled={arrows.prevDisabled} onClick={arrows.onPrev}><IconChevronLeft aria-hidden /></button>
              <button type="button" className="btn btn-secondary btn-icon btn-sm" aria-label={`Next ${what}`} disabled={arrows.nextDisabled} onClick={arrows.onNext}><IconChevronRight aria-hidden /></button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export type ShapeName = 'show' | 'short' | 'music' | 'character' | 'location' | 'studio';
const corners = (x0: number, y0: number, x1: number, y1: number, arm = 3) =>
  `M${x0} ${y0 + arm}V${y0}H${x0 + arm}M${x1 - arm} ${y0}H${x1}V${y0 + arm}M${x1} ${y1 - arm}V${y1}H${x1 - arm}M${x0 + arm} ${y1}H${x0}V${y1 - arm}`;
const DRAW: Record<ShapeName, ReactNode> = {
  show: (<><path d={corners(2, 6.5, 22, 17.5)} /><path d="M10.5 9.75v4.5l3.75-2.25z" /></>),
  short: (<><path d={corners(6, 2.5, 18, 21.5)} /><path d="M9.5 17h5" /></>),
  music: (<><path d={corners(3, 3, 21, 21)} /><circle cx="12" cy="12" r="4.25" /><circle cx="12" cy="12" r="0.9" /></>),
  character: (<><path d={corners(5, 2, 19, 22)} /><circle cx="12" cy="7.75" r="2.25" /><path d="M8.75 18.5v-3.25a3.25 3.25 0 0 1 6.5 0v3.25" /></>),
  location: (<><path d={corners(1.5, 7, 22.5, 17)} /><path d="M5 14.5l4-4 3 3 2.5-2.5 4.5 3.5" /></>),
  studio: (<><path d={corners(3, 3, 21, 21)} /><circle cx="12" cy="8.5" r="1.75" /><circle cx="8" cy="15" r="1.75" /><circle cx="16" cy="15" r="1.75" /><path d="M11 10l-2 3.5M13 10l2 3.5M9.75 15h4.5" /></>),
};

/** The object's shape (§5.8), 20 px in the current colour; decorative. */
export function ShapeGlyph({ shape, size = 20, className }: { shape: ShapeName; size?: number; className?: string }) {
  return (
    <svg className={cls('shape-glyph', className)} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {DRAW[shape]}
    </svg>
  );
}

/** A compact action card (§5.8; Home's tool cards): one link, 112 high (104 on phones), the glyph at the top start
 *  and the title and one line at the bottom. `disabledReason` makes it inert and says why in the line. */
export function ToolCard({ href, shape, icon, title, line, chevron, disabledReason, className, onClick }: {
  href: string; shape?: ShapeName; icon?: ReactNode; title: ReactNode; line?: ReactNode;
  /** the chevron at the top end (§5.8) */ chevron?: boolean;
  /** inert, and the reason replaces the line */ disabledReason?: string;
  className?: string; onClick?: () => void;
}) {
  const body = (
    <>
      <span className="tool-card-top" aria-hidden>
        {icon ?? (shape ? <ShapeGlyph shape={shape} /> : null)}
        {chevron && <IconChevronRight className="tool-card-chev" />}
      </span>
      <span className="tool-card-words">
        <span className="tool-card-title">{title}</span>
        {(disabledReason ?? line) != null && <span className="tool-card-line">{disabledReason ?? line}</span>}
      </span>
    </>
  );
  if (disabledReason) return <span className={cls('card tool-card', className)} aria-disabled="true">{body}</span>;
  return <Link href={href} className={cls('card tool-card', className)} onClick={onClick}>{body}</Link>;
}

/** The §5.8 name of the tool card, with its chevron. */
export function ActionCard(props: Parameters<typeof ToolCard>[0]) { return <ToolCard chevron {...props} />; }

export interface PanelFact { label: ReactNode; value: ReactNode; sub?: ReactNode }

/** A level-1 panel (§5.9). With `facts`, a definition grid: `columns` across from 1024, two below, and on phones one —
 *  or two with `phoneColumns={2}` where the cells are short. Labels .t-label, values 14/20 text-1, a second line text-2;
 *  cells 24 apart, no lines. */
export function PanelCard({ title, facts, columns = 4, phoneColumns = 1, children, className, labelledBy }: { title?: ReactNode; facts?: PanelFact[]; columns?: 2 | 3 | 4; /** < 640 px */ phoneColumns?: 1 | 2; children?: ReactNode; className?: string; labelledBy?: string }) {
  return (
    <section className={cls('card pcard', className)} aria-labelledby={labelledBy}>
      {title && <h3 className="t-title pcard-title">{title}</h3>}
      {facts && (
        <dl className="pcard-grid" data-cols={columns} data-phone={phoneColumns === 2 ? 2 : undefined}>
          {facts.map((f, i) => (
            <div key={i} className="pcard-cell">
              <dt className="t-label">{f.label}</dt>
              <dd className="pcard-value">{f.value}</dd>
              {f.sub != null && <dd className="pcard-sub">{f.sub}</dd>}
            </div>
          ))}
        </dl>
      )}
      {children}
    </section>
  );
}
