'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { cls } from './kit';
import { IconChevronLeft } from './icons';

/** THE PAGE FURNITURE — the same header on every page (context, title, one line of purpose, the primary action in
 *  the same place), titled sections, a metric tile, a list of facts, a progress bar, a stack of faces. */

export function PageHeader({ title, titleAr, subtitle, eyebrow, action, back, className = '' }: { title: ReactNode; titleAr?: string; subtitle?: ReactNode; eyebrow?: ReactNode; action?: ReactNode; back?: { href: string; label: string }; className?: string }) {
  return (
    <header className={cls('mb-8', className)}>
      {back && <Link href={back.href} className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-faint transition-colors hover:text-fg"><IconChevronLeft className="size-3.5 rtl:rotate-180" aria-hidden />{back.label}</Link>}
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-x-6">
        <div className="min-w-0 flex-1">
          {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
          <h1 className="page-title bi" dir="auto"><span>{title}</span>{titleAr && <span className="bi-ar" dir="rtl">{titleAr}</span>}</h1>
          {subtitle && <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">{subtitle}</p>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
    </header>
  );
}

export function Section({ title, description, action, count, children, className = '', id }: { title: ReactNode; description?: ReactNode; action?: ReactNode; count?: number; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={className} id={id}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="section-title">{title}{count !== undefined && <span className="num ms-2 text-[13px] font-medium text-faint">{count}</span>}</h2>
          {description && <p className="mt-1 text-[12.5px] text-faint">{description}</p>}
        </div>
        {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** A studio metric: the number leads. */
export function Stat({ label, value, hint, href, icon }: { label: ReactNode; value: ReactNode; hint?: ReactNode; href?: string; icon?: ReactNode }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2"><span className="text-[12.5px] font-medium text-muted">{label}</span>{icon && <span className="text-ink-500 [&>svg]:size-4">{icon}</span>}</div>
      <div className="num mt-3 text-[28px] font-semibold leading-none tracking-[-0.02em] text-fg">{value}</div>
      {hint && <div className="mt-2 text-[12px] text-faint">{hint}</div>}
    </>
  );
  return href ? <Link href={href} className="card card-hover block px-5 py-4">{body}</Link> : <div className="card px-5 py-4">{body}</div>;
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
      {cast.slice(0, max).map((c) => <span key={c.id} title={c.name} className="stack-face">{c.src ? <img src={c.src} alt="" /> : c.name.slice(0, 1)}</span>)}
      {cast.length > max && <span className="ms-1.5 text-[12px] text-faint">+{cast.length - max}</span>}
    </span>
  );
}

/** A quiet piece of text that says "everything you see here is a sample" — used once per page where it matters. */
export function Kicker({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={cls('kicker', className)}>{children}</div>;
}
