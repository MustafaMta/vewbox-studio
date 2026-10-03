'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { T } from '@/lib/copy';
import { cls } from '@/components/ui/kit';
import { Slate } from '../Slate';

/** THE HERO TEXT BLOCK (docs/DESIGN-SYSTEM-V4.md §5.3, §4.4) — at the inline start, at most 640 px:
 *    1 slate · 2 title (title voice; the page's h1) · 3 second-language line · 4 lead (two lines, then *More*) ·
 *    5 action row (one ivory primary, ≤ 2 secondaries, More) · 6 status strip (only when something waits).
 *  Spacing: slate → title 8, title → second language 4, title → lead 12, lead → actions 24. On a picture the text uses
 *  `--fg`, `--on-art-muted` and `--fg-body` only (`onArt`). Heroes pass their own extras (performers, transport, voice
 *  reel, anchor navigation) as children, after the actions. */

export interface HeroTextProps {
  slate?: Array<ReactNode | false | null | undefined>;
  status?: ReactNode;
  title: string;
  titleLang?: string;
  titleSize?: 'hero' | 'hero-sm';
  /** the second-language name: a quiet line under the title, with its own language */
  altTitle?: { text: string; lang: string } | null;
  lead?: ReactNode;
  leadLang?: string;
  actions?: ReactNode;
  statusStrip?: ReactNode;
  onArt?: boolean;
  /** the hero title is the page's h1; a specimen page shows several heroes under lower levels */
  headingLevel?: 1 | 2 | 3 | 4;
  children?: ReactNode;
  className?: string;
}

function Lead({ children, lang, onArt }: { children: ReactNode; lang?: string; onArt?: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const m = () => setOver(el.scrollHeight > el.clientHeight + 1);
    m(); const ro = new ResizeObserver(m); ro.observe(el);
    return () => ro.disconnect();
  }, [children]);
  return (
    <div className="mhero-leadwrap">
      <p ref={ref} className={cls('lead mhero-lead', onArt && 'mhero-on-art-body')} data-open={open || undefined} dir="auto" lang={lang}>{children}</p>
      {(over || open) && <button type="button" className="mhero-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? T('media.hero.less') : T('media.hero.more')}</button>}
    </div>
  );
}

export function HeroText({ slate, status, title, titleLang, titleSize = 'hero', altTitle, lead, leadLang, actions, statusStrip, onArt, headingLevel = 1, children, className }: HeroTextProps) {
  const H = (`h${headingLevel}`) as 'h1' | 'h2' | 'h3' | 'h4';
  return (
    <div className={cls('mhero-text', onArt && 'mhero-text-on-art', className)}>
      <Slate size="hero" items={slate ?? []} status={status} onArt={onArt} className="mhero-slate" />
      {title && <H className={cls(titleSize === 'hero' ? 't-hero' : 't-hero-sm', 'mhero-title')} dir="auto" lang={titleLang}>{title}</H>}
      {altTitle && <p className="mhero-alt text-sm" dir="auto" lang={altTitle.lang}>{altTitle.text}</p>}
      {lead && <Lead lang={leadLang} onArt={onArt}>{lead}</Lead>}
      {actions && <div className="mhero-actions">{actions}</div>}
      {statusStrip && <div className="mhero-status">{statusStrip}</div>}
      {children}
    </div>
  );
}
