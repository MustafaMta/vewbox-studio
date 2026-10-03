'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { cls } from './kit';
import { IconChevronLeft } from './icons';

/** THE PAGE FURNITURE — the same header on every page (context, title, one line of purpose, the primary action in
 *  the same place), titled sections, a metric tile, a list of facts, a progress bar, a stack of faces. */

/** The page header (§6), in this order: back link → eyebrow → title → lead → meta line (status first) → actions on
 *  the end side, level with the title on desktop and wrapping under it on a phone. One language per title: a second
 *  name (`titleAr`, or `titleAlt`) is a quiet line under it, never beside it. `size="display"` is the large title of
 *  the company page and a character profile. No band or gradient behind it, ever. */
export function PageHeader({ title, titleAr, titleAlt, subtitle, eyebrow, meta, action, back, className = '', size, lead = true }: { title: ReactNode; titleAr?: string; titleAlt?: string; subtitle?: ReactNode; eyebrow?: ReactNode; meta?: ReactNode; action?: ReactNode; back?: { href: string; label: string }; className?: string; size?: 'display'; /** false: the subtitle is ordinary small text, not the lead */ lead?: boolean }) {
  const alt = titleAlt ?? titleAr;
  return (
    <header className={cls('mb-8 lg:mb-10', className)}>
      {back && <Link href={back.href} className="mb-4 inline-flex items-center gap-1 rounded-[var(--r-1)] text-[13px] font-medium text-muted transition-colors hover:text-fg"><IconChevronLeft className="size-3.5 rtl:rotate-180" aria-hidden />{back.label}</Link>}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-x-8">
        <div className="min-w-0 flex-1">
          {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
          <h1 className={size === 'display' ? 'display-xl' : 'page-title'} dir="auto">{title}</h1>
          {alt && <p className="mt-1 text-sm text-muted" dir="auto">{alt}</p>}
          {subtitle && <p className={lead ? 'lead mt-2' : 'mt-2 text-sm text-muted'} dir="auto">{subtitle}</p>}
          {meta && <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-5 text-muted">{meta}</div>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2 md:pt-1">{action}</div>}
      </div>
    </header>
  );
}

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

/** Term / value pairs for production facts. */
export function FactList({ items }: { items: Array<{ label: ReactNode; value: ReactNode; icon?: ReactNode }> }) {
  return (
    <dl className="facts">
      {items.map((it, i) => <div key={i}><dt>{it.icon}{it.label}</dt><dd dir="auto">{it.value}</dd></div>)}
    </dl>
  );
}

export function ProgressBar({ value, label, className = '' }: { value: number; label: string; className?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return <div className={cls('progress', className)} role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${pct}%` }} /></div>;
}

/** A row of faces for a cast: portraits where they exist, an initial otherwise. */
export function CastStack({ cast, max = 5, emptyLabel }: { cast: Array<{ id: string; name: string; src?: string }>; max?: number; emptyLabel?: ReactNode }) {
  if (!cast.length) return emptyLabel ? <span className="text-[12px] text-faint">{emptyLabel}</span> : null;
  return (
    <span className="flex items-center">
      {cast.slice(0, max).map((c) => <span key={c.id} title={c.name} className="stack-face">{c.src ? <img src={c.src} alt="" className="object-top" /> : c.name.slice(0, 1)}</span>)}
      {cast.length > max && <span className="ms-1.5 text-[12px] text-faint">+{cast.length - max}</span>}
    </span>
  );
}

