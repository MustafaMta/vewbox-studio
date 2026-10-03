'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { IconChevronLeft } from '../icons';
import { cls } from './cls';

/** THE PAGE HEADER of an art-less page (docs/DESIGN-SYSTEM-V4.md §5.2), in fixed positions:
 *    1 back link (13/18 muted, a mirrored chevron) · 2 eyebrow or slate · 3 title (.page-title, or .display-xl with
 *    `size="display"`), then a count when the page is a collection · 4 lead (≤ 64ch).
 *  Actions sit at the end of the title row in this order: the primary, up to two secondaries, then More (always
 *  last). On a phone they wrap under the lead and the primary goes full width. Nothing sits behind it: no band, no
 *  gradient. One language per title: a second name (`titleAlt`, or `titleAr`) is a quiet line under it. */
export function PageHeader({ title, titleAr, titleAlt, subtitle, eyebrow, slate, meta, action, primary, secondary, more, back, count, className = '', size, lead = true }: {
  title: ReactNode; titleAr?: string; titleAlt?: string;
  /** the lead: the page's one purpose line */ subtitle?: ReactNode;
  eyebrow?: ReactNode; /** a slate instead of the eyebrow (F3's <Slate>) */ slate?: ReactNode;
  meta?: ReactNode;
  /** v3: the actions as one node, in the order the caller wrote them */ action?: ReactNode;
  /** v4: the page's ivory action */ primary?: ReactNode; /** at most two */ secondary?: ReactNode; /** a MenuButton, always last */ more?: ReactNode;
  back?: { href: string; label: string };
  /** a collection's size, after the title (faint, tabular) */ count?: number;
  className?: string; size?: 'display';
  /** false: the subtitle is small text rather than the lead */ lead?: boolean;
}) {
  const alt = titleAlt ?? titleAr;
  const actions = primary || secondary || more ? <>{primary}{secondary}{more}</> : action;
  return (
    <header className={cls('page-header mb-8 lg:mb-10', className)}>
      {back && <Link href={back.href} className="page-back"><IconChevronLeft className="size-3.5 rtl:rotate-180" aria-hidden />{back.label}</Link>}
      {(slate || eyebrow) && <div className={slate ? 'page-slate' : 'eyebrow page-eyebrow'}>{slate ?? eyebrow}</div>}
      <h1 className={cls('page-header-title', size === 'display' ? 'display-xl' : 'page-title')} dir="auto">
        {title}{count !== undefined && <span className="page-count num">{count}</span>}
      </h1>
      {actions && <div className="page-actions">{actions}</div>}
      {alt && <p className="page-alt text-sm text-muted" dir="auto">{alt}</p>}
      {subtitle && <p className={cls('page-lead', lead ? 'lead' : 'text-sm text-muted')} dir="auto">{subtitle}</p>}
      {meta && <div className="page-meta">{meta}</div>}
    </header>
  );
}

/** A titled section (v3): heading (+ a faint count), an optional description and actions at the end. */
export function Section({ title, description, action, count, children, className = '', id, as: As = 'h2' }: { title: ReactNode; description?: ReactNode; action?: ReactNode; count?: number; children: ReactNode; className?: string; id?: string; as?: 'h2' | 'h3' }) {
  return (
    <section className={className} id={id} aria-labelledby={id ? `${id}-h` : undefined}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <As className={As === 'h2' ? 'section-title' : 'h3'} id={id ? `${id}-h` : undefined}>{title}{count !== undefined && <span className="num ms-2 text-[13px] font-medium text-faint">{count}</span>}</As>
          {description && <p className="mt-1 text-sm text-faint">{description}</p>}
        </div>
        {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** Term / value pairs for production facts (v3). */
export function FactList({ items }: { items: Array<{ label: ReactNode; value: ReactNode; icon?: ReactNode }> }) {
  return (
    <dl className="facts">
      {items.map((it, i) => <div key={i}><dt>{it.icon}{it.label}</dt><dd dir="auto">{it.value}</dd></div>)}
    </dl>
  );
}

/** A row of faces for a cast (v3; F3's CastRow replaces it): portraits where they exist, an initial otherwise. */
export function CastStack({ cast, max = 5, emptyLabel }: { cast: Array<{ id: string; name: string; src?: string }>; max?: number; emptyLabel?: ReactNode }) {
  if (!cast.length) return emptyLabel ? <span className="text-[12px] text-faint">{emptyLabel}</span> : null;
  return (
    <span className="flex items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {cast.slice(0, max).map((c) => <span key={c.id} title={c.name} className="stack-face">{c.src ? <img src={c.src} alt="" className="object-top" /> : c.name.slice(0, 1)}</span>)}
      {cast.length > max && <span className="ms-1.5 text-[12px] text-faint">+{cast.length - max}</span>}
    </span>
  );
}
