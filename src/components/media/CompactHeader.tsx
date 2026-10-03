'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { cls } from '@/components/ui/kit';
import { IconChevronLeft } from '@/components/ui/icons';

/** THE COMPACT HEADER (docs/DESIGN-SYSTEM-V4.md §5.2, §5 media kit) — the 48 px sticky slate header.
 *  Lobby: it appears when the hero (`watch`) leaves the viewport (IntersectionObserver, root margin −48 px at the top)
 *  and leaves when the hero returns; it takes no room while hidden. Cutting room: permanent, with the workspace tabs
 *  inside it at ≥ 1280 (`tabs`), or under it as a second sticky row below that (`tabsBelow`). While shown it sets
 *  `--sticky-extra` to 48 px (92 px with the tabs under it) through an `html:has()` rule in media.css, so sticky bars
 *  never hide the focused element (2.4.11). Ground: `--page` at 96 %, a bottom hairline, no blur. From the inline start:
 *  back · a 32 px-tall thumbnail in the content's own shape · the title (15/20 600, UI voice) · status · [tabs] ·
 *  spacer · [SaveState] · the page primary (small) · More. Arabic mirrors it. */

const THUMB = { keyart: '57 / 32', poster: '21 / 32', sleeve: '1 / 1', figure: '18 / 32', plate: '57 / 32' } as const;

export function CompactHeader({ back, thumb, title, titleLang, status, tabs, tabsBelow, saveState, primary, more, mode = 'lobby', watch, className }: { back?: { href: string; label: string }; thumb?: { src?: string | null; shape: keyof typeof THUMB }; title: string; titleLang?: string; status?: ReactNode; tabs?: ReactNode; tabsBelow?: boolean; saveState?: ReactNode; primary?: ReactNode; more?: ReactNode; mode?: 'lobby' | 'cutting'; watch?: RefObject<HTMLElement | null>; className?: string }) {
  const [shown, setShown] = useState(mode === 'cutting');
  useEffect(() => {
    if (mode === 'cutting') { setShown(true); return; }
    const el = watch?.current; if (!el) { setShown(false); return; }
    const io = new IntersectionObserver(([e]) => setShown(!e.isIntersecting), { rootMargin: '-48px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [mode, watch]);
  return (
    <div className={cls('chead', className)} data-mode={mode} data-shown={shown || undefined} data-tabs-below={tabsBelow || undefined} aria-hidden={!shown || undefined} inert={!shown || undefined}>
      {back && <Link href={back.href} className="btn btn-quiet btn-sm btn-icon" aria-label={back.label}><IconChevronLeft aria-hidden className="rtl:rotate-180" /></Link>}
      {thumb && (
        <span className="chead-thumb" style={{ aspectRatio: THUMB[thumb.shape] }} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {thumb.src ? <img src={thumb.src} alt="" /> : null}
        </span>
      )}
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
