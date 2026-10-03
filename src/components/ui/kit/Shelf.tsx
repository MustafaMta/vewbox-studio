'use client';

import { Children, isValidElement, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { SectionHead } from './Cards';
import { cls } from './cls';

/** THE SHELF (Home's media rows, the approved reference; docs/design/VISUAL-STANDARD-V5.1.md §5.4, §3.5): a section
 *  head and one row of cards that never wraps. The row snaps card by card and runs past the content column to the
 *  viewport's end edge, so the next card shows; on phones it bleeds to both edges. Previous / next buttons sit at the
 *  head's end only while the row is wider than the column (disabled at each end); on phones the row is swiped.
 *
 *  `kind` sets the card width (one place for every page): wide 288 (16:9) · poster 184 (2:3) · sleeve 216 (1:1) ·
 *  figure 168 (928:1664) · tool 240; phones 240 · 150 · 170 · 136 · 200. `cardWidth` overrides it. Each child is one
 *  card; the shelf wraps it in its list item. */

export type ShelfKind = 'wide' | 'poster' | 'sleeve' | 'figure' | 'tool';

/** The scroll state of a row and its paging: overflowing at all, at the start, at the end. */
export function useShelfScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ overflow: false, start: true, end: true });
  const measure = useCallback(() => {
    const el = ref.current; if (!el) return;
    const overflow = el.scrollWidth > el.clientWidth + 2;
    const next = { overflow, start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 };
    setEdges((e) => (e.overflow === next.overflow && e.start === next.start && e.end === next.end ? e : next));
  }, []);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const c of Array.from(el.children)) ro.observe(c);
    return () => ro.disconnect();
  }, [measure]);
  const page = useCallback((dir: 1 | -1) => {
    const el = ref.current; if (!el) return;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * Math.max(200, el.clientWidth * 0.8), behavior: reduce ? 'auto' : 'smooth' });
  }, []);
  return { ref, edges, measure, page };
}

export function Shelf({ id, title, description, count, countTone, link, kind = 'wide', cardWidth, label, children, className, headless }: {
  /** the section's id; the heading is `${id}-h` */
  id: string;
  title: ReactNode;
  description?: ReactNode;
  count?: number | null;
  countTone?: 'wait';
  link?: { href: string; label: string; short?: string };
  kind?: ShelfKind;
  /** px: a card width the kinds do not cover */
  cardWidth?: number;
  /** what the arrows move through ("shows"); default: the title in lower case */
  label?: string;
  children: ReactNode;
  className?: string;
  /** only the row (the page draws its own head) */
  headless?: boolean;
}) {
  const { ref, edges, measure, page } = useShelfScroll<HTMLUListElement>();
  const items = Children.toArray(children).filter(Boolean);
  const style = cardWidth ? ({ '--card-w': `${cardWidth}px` } as CSSProperties) : undefined;
  return (
    <section className={cls('shelf', className)} aria-labelledby={headless ? undefined : `${id}-h`} aria-label={headless && typeof title === 'string' ? title : undefined} data-kind={kind}>
      {!headless && (
        <SectionHead id={`${id}-h`} title={title} description={description} count={count} countTone={countTone} link={link}
          arrows={edges.overflow ? { onPrev: () => page(-1), onNext: () => page(1), prevDisabled: edges.start, nextDisabled: edges.end, label: label ?? (typeof title === 'string' ? title.toLowerCase() : undefined) } : null} />
      )}
      <ul ref={ref} className="shelf-track" role="list" style={style} onScroll={measure}>
        {items.map((child, i) => <li key={isValidElement(child) && child.key != null ? child.key : i}>{child}</li>)}
      </ul>
    </section>
  );
}
