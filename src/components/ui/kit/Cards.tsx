'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { IconChevronLeft, IconChevronRight } from '../icons';
import { cls } from './cls';

/** SECTION HEADS AND CARDS (docs/design/VISUAL-STANDARD-V5.1.md §5.4, §5.8, §5.9) — reusable parts with props and no
 *  page logic. The decision card and the media tile, which draw pictures, live in the media kit
 *  (src/components/media/Cards.tsx).
 *
 *    SectionHead   one 32 px row: h2 (.t-section) + count (mono; the needs-you count in --wait) · an optional
 *                  description under it · at the end ONE of: a quiet link with a chevron, two carousel buttons, or one
 *                  secondary sm action. On phones the "1 of 4" readout sits between title and link.
 *    ActionCard    a level-1 card that is one link, 112 high (104 on phones): the object's shape glyph, a title, one line
 *    PanelCard     a level-1 panel, padding 20 (16 on phones), optionally a title and a definition grid of facts
 *    ShapeGlyph    the object's own shape drawn with the viewfinder's four corners (show 16:9, short 2:3, music 1:1,
 *                  character a standing figure, location a 2.39 strip), 20 px, decorative */

export function SectionHead({ title, id, count, countTone, description, link, arrows, action, position, level = 2, className }: {
  title: ReactNode;
  /** the heading's id, for aria-labelledby on the section */
  id?: string;
  count?: number | null;
  /** the needs-you count is tungsten (§3.1); every other count is text-3 */
  countTone?: 'wait';
  description?: ReactNode;
  link?: { href: string; label: string; /** the shorter label for phones ("All") */ short?: string };
  arrows?: { onPrev: () => void; onNext: () => void; prevDisabled?: boolean; nextDisabled?: boolean; label?: string };
  action?: ReactNode;
  /** the rail position readout on phones: "1 of 4" */
  position?: string;
  level?: 2 | 3;
  className?: string;
}) {
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <div className={cls('shead', description != null && 'shead-has-desc', className)}>
      <div className="shead-row">
        <div className="shead-start">
          <H id={id} className="t-section shead-title">{title}</H>
          {count != null && <span className="shead-count" data-tone={countTone}>{count}</span>}
          {position && <span className="strip-pos shead-pos">{position}</span>}
        </div>
        {(link || arrows || action) && (
          <div className="shead-end">
            {link ? (
              <Link href={link.href} className="shead-link">
                <span className={link.short ? 'shead-link-long' : undefined}>{link.label}</span>
                {link.short && <span className="shead-link-short" aria-hidden>{link.short}</span>}
                <IconChevronRight aria-hidden />
              </Link>
            ) : arrows ? (
              <span className="shead-arrows" role="group" aria-label={arrows.label ?? 'Scroll'}>
                <button type="button" className="btn btn-secondary btn-sm btn-icon" aria-label="Previous" onClick={arrows.onPrev} disabled={arrows.prevDisabled}><IconChevronLeft aria-hidden /></button>
                <button type="button" className="btn btn-secondary btn-sm btn-icon" aria-label="Next" onClick={arrows.onNext} disabled={arrows.nextDisabled}><IconChevronRight aria-hidden /></button>
              </span>
            ) : action}
          </div>
        )}
      </div>
      {description != null && <p className="shead-desc t-body">{description}</p>}
    </div>
  );
}

export type ShapeName = 'show' | 'short' | 'music' | 'character' | 'location';
const corners = (x0: number, y0: number, x1: number, y1: number, arm = 3) =>
  `M${x0} ${y0 + arm}V${y0}H${x0 + arm}M${x1 - arm} ${y0}H${x1}V${y0 + arm}M${x1} ${y1 - arm}V${y1}H${x1 - arm}M${x0 + arm} ${y1}H${x0}V${y1 - arm}`;
const DRAW: Record<ShapeName, ReactNode> = {
  show: (<><path d={corners(2, 6.5, 22, 17.5)} /><path d="M10.5 9.75v4.5l3.75-2.25z" /></>),
  short: (<><path d={corners(6, 2.5, 18, 21.5)} /><path d="M9.5 17h5" /></>),
  music: (<><path d={corners(3, 3, 21, 21)} /><circle cx="12" cy="12" r="4.25" /><circle cx="12" cy="12" r="0.9" /></>),
  character: (<><path d={corners(5, 2, 19, 22)} /><circle cx="12" cy="7.75" r="2.25" /><path d="M8.75 18.5v-3.25a3.25 3.25 0 0 1 6.5 0v3.25" /></>),
  location: (<><path d={corners(1.5, 7.5, 22.5, 16.5)} /><path d="M5 14l4-3.5 3 2.5 2.5-2 4.5 3" /></>),
};

/** The object's shape (§5.8), 20 px in the current colour; decorative. */
export function ShapeGlyph({ shape, size = 20, className }: { shape: ShapeName; size?: number; className?: string }) {
  return (
    <svg className={cls('shape-glyph', className)} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {DRAW[shape]}
    </svg>
  );
}

/** A start action (§5.8): one link, 112 high; the glyph at the top start, the chevron at the top end, the title and
 *  one line at the bottom. */
export function ActionCard({ href, shape, icon, title, line, className, onClick }: { href: string; shape?: ShapeName; icon?: ReactNode; title: ReactNode; line?: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <Link href={href} className={cls('acard', className)} onClick={onClick}>
      <span className="acard-top" aria-hidden>
        {icon ?? (shape ? <ShapeGlyph shape={shape} /> : null)}
        <IconChevronRight className="acard-chev" aria-hidden />
      </span>
      <span className="acard-text">
        <span className="t-card acard-title">{title}</span>
        {line && <span className="t-body acard-line">{line}</span>}
      </span>
    </Link>
  );
}

export interface PanelFact { label: ReactNode; value: ReactNode; sub?: ReactNode }

/** A level-1 panel (§5.9). With `facts`, a definition grid (`columns` across on desktop, 2 on phones): labels
 *  .t-label, values 14/20 text-1, a second line text-2; cells 24 apart, no lines. */
export function PanelCard({ title, facts, columns = 4, children, className, labelledBy }: { title?: ReactNode; facts?: PanelFact[]; columns?: 2 | 3 | 4; children?: ReactNode; className?: string; labelledBy?: string }) {
  return (
    <section className={cls('pcard', className)} aria-labelledby={labelledBy}>
      {title && <h3 className="t-title pcard-title">{title}</h3>}
      {facts && (
        <dl className="pcard-grid" data-cols={columns}>
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
