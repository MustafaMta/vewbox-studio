'use client';

import Link from 'next/link';
import { Children, isValidElement, useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cls } from '@/components/ui/kit';
import { IconChevronLeft, IconChevronRight } from '@/components/ui/icons';
import { prefersReducedMotion } from '@/components/players/prefs';

/** THE RAIL (docs/DESIGN-SYSTEM-V4.md §5.6) — a heading row (`.h2`, a faint count, optional controls such as the season
 *  picker, prev/next and *See all*) over a horizontal list whose first tile sits on the column start and whose last
 *  visible tile is partial (the cue; no edge fade). Scroll snaps by proximity. One Tab stop per rail: roving tabindex
 *  over the tiles; ←/→ move between tiles, Home and End go to the ends, Tab leaves. Prev/next and
 *  *See all* make drag-scrolling optional (2.5.7); *See all* is the vertical grid every rail offers (1.4.10). */

const FOCUSABLE = 'a[href], button, summary, input, select, textarea, [tabindex]';
type Item = 'still' | 'poster' | 'sleeve' | 'figure' | 'keyart' | 'plate' | 'face';

export function Rail({ title, count, controls, seeAll, item = 'still', children, className, headingLevel = 2 }: { title: ReactNode; count?: number; controls?: ReactNode; seeAll?: { href: string; label?: string }; item?: Item; children: ReactNode; className?: string; headingLevel?: 2 | 3 }) {
  const id = useId();
  const list = useRef<HTMLUListElement>(null);
  const current = useRef(0);
  const [ends, setEnds] = useState({ start: true, end: true });
  const items = Children.toArray(children).filter(isValidElement);

  const rove = useCallback(() => {
    const ul = list.current; if (!ul) return;
    const lis = Array.from(ul.children) as HTMLElement[];
    if (current.current >= lis.length) current.current = Math.max(0, lis.length - 1);
    lis.forEach((li, i) => li.querySelectorAll<HTMLElement>(FOCUSABLE).forEach((el) => el.setAttribute('tabindex', i === current.current ? '0' : '-1')));
  }, []);
  const measure = useCallback(() => {
    const ul = list.current; if (!ul) return;
    const max = ul.scrollWidth - ul.clientWidth;
    const at = Math.abs(ul.scrollLeft);
    const start = at <= 2, end = at >= max - 2;
    setEnds((x) => (x.start === start && x.end === end ? x : { start, end }));
  }, []);
  useEffect(() => { rove(); measure(); });
  useEffect(() => {
    const ul = list.current; if (!ul) return;
    const ro = new ResizeObserver(measure); ro.observe(ul);
    return () => ro.disconnect();
  }, [measure]);

  const focusItem = (i: number) => {
    const ul = list.current; if (!ul) return;
    const lis = Array.from(ul.children) as HTMLElement[];
    const n = Math.max(0, Math.min(lis.length - 1, i));
    current.current = n; rove();
    const target = lis[n]?.querySelector<HTMLElement>('[data-rail-item]') ?? lis[n]?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus({ preventScroll: true });
    lis[n]?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };
  const onKey = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if ((e.target as HTMLElement).closest('[role=menu], details[open]')) return;
    const n = e.currentTarget.children.length;
    const k = e.key === 'ArrowRight' ? current.current + 1 : e.key === 'ArrowLeft' ? current.current - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
    if (k === null) return;
    e.preventDefault(); focusItem(k);
  };
  const onFocus = (e: React.FocusEvent<HTMLUListElement>) => {
    const li = (e.target as HTMLElement).closest('li');
    const i = li ? Array.from(e.currentTarget.children).indexOf(li) : -1;
    if (i >= 0 && i !== current.current) { current.current = i; rove(); }
  };
  const page = (dir: 1 | -1) => {
    const ul = list.current; if (!ul) return;
    ul.scrollBy({ left: dir * ul.clientWidth * 0.85, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  const H = headingLevel === 3 ? 'h3' : 'h2';
  return (
    <section className={cls('rail', className)} data-item={item}>
      <div className="rail-head">
        <H id={`${id}-h`} className="h2 rail-title">{title}{count !== undefined && <span className="num rail-count">{count}</span>}</H>
        {controls && <div className="rail-controls">{controls}</div>}
        <span className="rail-spacer" />
        <div className="rail-nav">
          <button type="button" className="btn btn-quiet btn-sm btn-icon" aria-label={'Previous items'} aria-controls={`${id}-l`} disabled={ends.start} onClick={() => page(-1)}><IconChevronLeft aria-hidden /></button>
          <button type="button" className="btn btn-quiet btn-sm btn-icon" aria-label={'Next items'} aria-controls={`${id}-l`} disabled={ends.end} onClick={() => page(1)}><IconChevronRight aria-hidden /></button>
        </div>
        {seeAll && <Link href={seeAll.href} className="rail-all">{seeAll.label ?? 'See all'}</Link>}
      </div>
      <ul id={`${id}-l`} ref={list} className="rail-list" aria-labelledby={`${id}-h`} onKeyDown={onKey} onFocus={onFocus} onScroll={measure}>
        {items.map((c, i) => <li key={c.key ?? i} className="rail-item">{c}</li>)}
      </ul>
    </section>
  );
}
