'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { cls } from '@/components/ui/kit';
import { IconChevronLeft } from '@/components/ui/icons';
import { useRootVarContribution } from '@/components/players/rootVars';

/** THE COMPACT HEADER'S THUMBNAIL (docs/DESIGN-SYSTEM-V4.md §5.2) — 32 px tall in the content's own shape: key art
 *  57 × 32, poster 21 × 32, sleeve 32 × 32, figure 18 × 32, plate 57 × 32. This is what F3 supplies to the kit's
 *  CompactHeader (`thumb` slot, src/components/ui/kit/CompactHeader.tsx on main). Decorative: the title names it. */
const THUMB = { keyart: '57 / 32', poster: '21 / 32', sleeve: '1 / 1', figure: '18 / 32', plate: '57 / 32' } as const;
export type ThumbShape = keyof typeof THUMB;

export function CompactThumb({ src, shape }: { src?: string | null; shape: ThumbShape }) {
  return (
    <span className="chead-thumb" style={{ aspectRatio: THUMB[shape] }} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" /> : null}
    </span>
  );
}

/** A standalone compact header, built before the kit's landed. Pages should use the kit's CompactHeader with
 *  `thumb={<CompactThumb … />}`; this one stays for the specimens and goes in Q1. Lobby: it appears when `watch` leaves
 *  the viewport (root margin −48 px) and takes no room while hidden; cutting room: permanent. While shown it adds 48 px
 *  (92 with tabs under it) to `--sticky-extra` through the kit's contribution hook (players/rootVars.ts until the
 *  merge), so sticky bars never hide the focused element (2.4.11). Ground `--page` at 96 %, a bottom hairline, no blur.
 *  From the inline start: back · thumbnail · title (15/20 600) · status · [tabs] · spacer · [SaveState] · primary · More. */
export function CompactHeader({ back, thumb, title, titleLang, status, tabs, tabsBelow, saveState, primary, more, mode = 'lobby', watch, contained, className }: { back?: { href: string; label: string }; thumb?: { src?: string | null; shape: ThumbShape }; title: string; titleLang?: string; status?: ReactNode; tabs?: ReactNode; tabsBelow?: boolean; saveState?: ReactNode; primary?: ReactNode; more?: ReactNode; mode?: 'lobby' | 'cutting'; watch?: RefObject<HTMLElement | null>; /** a specimen in its own box: adds nothing to the page's sticky offsets */ contained?: boolean; className?: string }) {
  const [shown, setShown] = useState(mode === 'cutting');
  useEffect(() => {
    if (mode === 'cutting') { setShown(true); return; }
    const el = watch?.current; if (!el) { setShown(false); return; }
    const io = new IntersectionObserver(([e]) => setShown(!e.isIntersecting), { rootMargin: '-48px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [mode, watch]);
  useRootVarContribution('--sticky-extra', tabsBelow ? 92 : 48, shown && !contained);
  return (
    <div className={cls('chead', className)} data-mode={mode} data-shown={shown || undefined} data-tabs-below={tabsBelow || undefined} aria-hidden={!shown || undefined} inert={!shown || undefined}>
      {back && <Link href={back.href} className="btn btn-quiet btn-sm btn-icon" aria-label={back.label}><IconChevronLeft aria-hidden className="rtl:rotate-180" /></Link>}
      {thumb && <CompactThumb src={thumb.src} shape={thumb.shape} />}
      <span className="chead-title" dir="auto" lang={titleLang}>{title}</span>
      {status && <span className="chead-status">{status}</span>}
      {tabs && <div className="chead-tabs">{tabs}</div>}
      <span className="prow-spacer" />
      {saveState && <span className="chead-save">{saveState}</span>}
      {primary}
      {more}
    </div>
  );
}
