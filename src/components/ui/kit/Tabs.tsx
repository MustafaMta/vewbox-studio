'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cls } from './cls';
import { rovingIndex, rovingStep } from './focus';
import { useRootVarContribution } from './layout';
import { MenuButton, MenuLink } from './Overlay';

/** IN-PAGE NAVIGATION (docs/DESIGN-SYSTEM-V4.md §5.11) — TabBar, TabPanel, AnchorNav and Crumbs. Switching is
 *  instant: no fade on a panel, only the 2 px iris underline moves (§4.8). */

export interface TabItem { id: string; label: ReactNode; count?: number; icon?: ReactNode; disabled?: boolean }

/** 44 px, 14/20 500 muted; the selected tab is --fg 600 with a 2 px iris underline; counts are faint numbers, never
 *  a chip. One Tab stop: ←/→, Home and End move between tabs and select (selection follows
 *  focus). Two forms:
 *  - `hrefFor`: tabs are links and the URL is the state (`?tab=`), so reload and Back behave (§7.4);
 *  - `onSelect`: tabs are buttons that control TabPanels with the same `idBase`.
 *  `sticky` keeps the bar under the compact header while the page scrolls. */
export function TabBar({ tabs, current, hrefFor, onSelect, ariaLabel, className = '', sticky, idBase, replace }: {
  tabs: TabItem[]; current: string; hrefFor?: (id: string) => string; onSelect?: (id: string) => void; ariaLabel: string; className?: string; sticky?: boolean;
  /** with `onSelect`: the prefix that ties each tab to its TabPanel (`${idBase}-tab-${id}`, `${idBase}-panel-${id}`) */ idBase?: string;
  /** with `hrefFor`: replace the history entry instead of pushing one (switching between workspace tabs, §7.4) */ replace?: boolean;
}) {
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const els = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'));
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (i === -1) return;
    const step = rovingStep(e.key);
    if (!step) return;
    const next = rovingIndex(step, i, tabs.map((t) => Boolean(t.disabled)), false);
    if (next < 0 || next === i) { if (step) e.preventDefault(); return; }
    e.preventDefault();
    els[next].focus();
    els[next].click();
  };
  return (
    <div role="tablist" aria-label={ariaLabel} className={cls('tabs -mx-4 px-4 sm:mx-0 sm:px-0', sticky && 'tabs-sticky', className)} onKeyDown={onKey}>
      {tabs.map((x) => {
        const on = x.id === current;
        const inner = <>{x.icon}{x.label}{x.count !== undefined && x.count > 0 && <span className="count">{x.count}</span>}</>;
        if (hrefFor) return <Link key={x.id} role="tab" aria-selected={on} aria-disabled={x.disabled || undefined} tabIndex={on ? 0 : -1} href={hrefFor(x.id)} replace={replace} className="tab" scroll={false}>{inner}</Link>;
        return (
          <button key={x.id} type="button" role="tab" id={idBase ? `${idBase}-tab-${x.id}` : undefined} aria-controls={idBase ? `${idBase}-panel-${x.id}` : undefined} aria-selected={on} tabIndex={on ? 0 : -1} disabled={x.disabled} className="tab" onClick={() => onSelect?.(x.id)}>{inner}</button>
        );
      })}
    </div>
  );
}

/** The panel a button TabBar controls. Rendered only while selected; no fade-in. */
export function TabPanel({ idBase, id, current, children, className = '' }: { idBase: string; id: string; current: string; children: ReactNode; className?: string }) {
  if (id !== current) return null;
  return <div role="tabpanel" id={`${idBase}-panel-${id}`} aria-labelledby={`${idBase}-tab-${id}`} tabIndex={0} className={cls('tabpanel', className)}>{children}</div>;
}

/** The id of the last section whose top has passed `offset` px from the viewport top (the scrollspy's rule). */
export function sectionInView(tops: ReadonlyArray<{ id: string; top: number }>, offset: number): string | null {
  let cur: string | null = tops[0]?.id ?? null;
  for (const t of tops) if (t.top - offset <= 1) cur = t.id;
  return cur;
}

/** One-page profiles (Character, Location): a sticky row of in-page links, 40 px, 13/20, styled like tabs. The
 *  section in view gets aria-current="true" (scrollspy). Jumps respect scroll-padding (§2.1). On a phone it is a
 *  row of chips that scrolls sideways. */
export function AnchorNav({ items, label, className = '', sticky = true }: { items: ReadonlyArray<{ id: string; label: ReactNode }>; label?: string; className?: string; sticky?: boolean }) {
  const [current, setCurrent] = useState<string | null>(items[0]?.id ?? null);
  // while it sticks, its height joins --sticky-extra, so a jump to a section lands below it (scroll-padding, §2.1)
  const nav = useRef<HTMLElement>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const el = nav.current;
    if (!el || !sticky || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setHeight(Math.round(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [sticky]);
  useRootVarContribution('--sticky-extra', height, sticky);
  const key = items.map((i) => i.id).join('|');
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingBlockStart) || 0;
      const tops = items.map((i) => ({ id: i.id, top: document.getElementById(i.id)?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY }));
      // at the very end of the page the last section is the one in view, however short it is
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      setCurrent(atEnd ? items[items.length - 1]?.id ?? null : sectionInView(tops, pad + 48));
    };
    const on = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); if (frame) cancelAnimationFrame(frame); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <nav ref={nav} aria-label={label ?? 'On this page'} className={cls('anchor-nav', sticky && 'anchor-nav-sticky', className)}>
      <ul>
        {items.map((it) => <li key={it.id}><a href={`#${it.id}`} className="anchor-link" aria-current={current === it.id ? 'true' : undefined} onClick={() => setCurrent(it.id)}>{it.label}</a></li>)}
      </ul>
    </nav>
  );
}

/** Deep paths: Show › Season 1 › Episode 3 › Shot 12. The last item is the current page (no link). On a phone the
 *  middle collapses into a "…" menu. */
export function Crumbs({ items, className = '' }: { items: ReadonlyArray<{ href?: string; label: string }>; className?: string }) {
  const last = items.length - 1;
  const item = (it: { href?: string; label: string }, i: number) => (
    <li key={i}>
      {i === last || !it.href ? <span aria-current={i === last ? 'page' : undefined} dir="auto">{it.label}</span> : <Link href={it.href} dir="auto">{it.label}</Link>}
    </li>
  );
  const middle = items.slice(1, -1);
  return (
    <nav aria-label={'Breadcrumb'} className={cls('crumbs', className)}>
      <ol className={cls('crumbs-full', middle.length > 0 && 'crumbs-collapsible')}>{items.map(item)}</ol>
      {middle.length > 0 && (
        <ol className="crumbs-short">
          {item(items[0], 0)}
          <li>
            <MenuButton label={'The rest of the path'} iconOnly variant="quiet" size="xs" align="start">
              {middle.map((m, i) => (m.href ? <MenuLink key={i} href={m.href}>{m.label}</MenuLink> : null))}
            </MenuButton>
          </li>
          {item(items[last], last)}
        </ol>
      )}
    </nav>
  );
}
