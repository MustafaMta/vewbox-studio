'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { IconChevronLeft } from '../icons';
import { cls } from './cls';
import { useMediaQuery, useRootVarContribution } from './layout';

/** THE COMPACT HEADER (docs/DESIGN-SYSTEM-V4.md §5.2) — a 48 px sticky slate header: back · a 32 px-tall thumbnail in
 *  the content's own shape (F3 supplies it: key art 57 × 32, poster 21 × 32, sleeve 32 × 32, figure 18 × 32, plate
 *  57 × 32) · the title (15/20 600, interface voice) · status (a StateWord) · [cutting room] the tabs · a spacer ·
 *  [cutting room] the save state · the page primary (btn-sm) · More. Ground --page at 96 %, a bottom hairline, no
 *  blur. RTL mirrors it.
 *  - `mode="lobby"`: it appears when `watch` (the hero, or a sentinel at its end) has scrolled out of view (an
 *    IntersectionObserver with rootMargin -48px 0 0 0) and leaves when it returns: a fade and an 8 px slide, in
 *    --t, out --t-exit-fast. Hidden, it is inert.
 *  - `mode="cutting"`: permanent. At ≥ 1280 the tabs sit inside it, centred; below that they are a second 44 px
 *    row under it.
 *  While shown it adds 48 px to --sticky-extra (92 px when tabs stick under it), so scroll-padding keeps focused
 *  elements clear (2.4.11), and sets --sticky-header so a sticky TabBar parks under it. */
export function CompactHeader({ mode, watch, scrollRoot, contained, back, thumb, title, status, tabs, save, primary, more, tabsStick, className = '' }: {
  mode: 'lobby' | 'cutting';
  /** lobby: the element whose leaving shows the header */ watch?: RefObject<Element | null>;
  /** the scrolling element, when it is not the page (a contained demo) */ scrollRoot?: RefObject<Element | null>;
  /** inside its own scroll box: it adds nothing to the page's sticky offsets */ contained?: boolean;
  /** an icon button named "Back to Shows" */ back?: { href: string; label: string };
  thumb?: ReactNode; title: ReactNode; status?: ReactNode;
  /** cutting room: the workspace TabBar */ tabs?: ReactNode;
  /** cutting room: the save state (SaveWord) */ save?: ReactNode;
  primary?: ReactNode; more?: ReactNode;
  /** lobby: the page's TabBar sticks under the header (92 px of sticky bars instead of 48) */ tabsStick?: boolean;
  className?: string;
}) {
  const [past, setPast] = useState(false);
  const wide = useMediaQuery('(min-width: 1280px)');
  useEffect(() => {
    if (mode !== 'lobby') return;
    const el = watch?.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const root = scrollRoot?.current ?? null;
    const io = new IntersectionObserver(([e]) => setPast(!e.isIntersecting && e.boundingClientRect.top < (e.rootBounds?.top ?? 0) + 48), { root, rootMargin: '-48px 0px 0px 0px', threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [mode, watch, scrollRoot]);
  const shown = mode === 'cutting' || past;
  const tabsRow = mode === 'cutting' && Boolean(tabs) && !wide;
  useRootVarContribution('--sticky-header', tabsRow ? 92 : 48, shown && !contained);
  useRootVarContribution('--sticky-extra', tabsRow || (mode === 'lobby' && tabsStick) ? 92 : 48, shown && !contained);
  return (
    <div className={cls('compact-header', className)} data-mode={mode} data-shown={shown ? 'true' : 'false'} data-tabs={tabs && mode === 'cutting' ? 'true' : undefined} data-contained={contained ? 'true' : undefined} inert={!shown}>
      <div className="compact-start">
        {back && <Link href={back.href} className="btn btn-quiet btn-sm btn-icon" aria-label={back.label} title={back.label}><IconChevronLeft aria-hidden className="rtl:rotate-180" /></Link>}
        {thumb && <span className="compact-thumb" aria-hidden>{thumb}</span>}
        <span className="compact-title" dir="auto">{title}</span>
        {status && <span className="compact-status">{status}</span>}
      </div>
      {tabs && mode === 'cutting' && <div className="compact-tabs">{tabs}</div>}
      <div className="compact-end">{save && <span className="compact-save">{save}</span>}{primary}{more}</div>
    </div>
  );
}
