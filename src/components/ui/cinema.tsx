'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useT } from './locale';
import { cls } from './kit';
import { IconChevronLeft, IconAuto } from './icons';

/** THE OBJECTS OF EACH SECTION — a poster for a film, a square for a record, a portrait for a person, a wide plate
 *  for a place — and the banner header they sit in. Shared by the libraries and the detail pages. */

export type Ratio = 'poster' | 'square' | 'portrait' | 'wide' | 'vertical';
export const RATIO: Record<Ratio, string> = { poster: 'aspect-[2/3]', square: 'aspect-square', portrait: 'aspect-[4/5]', wide: 'aspect-video', vertical: 'aspect-[9/16]' };

/** A picture in its frame; with no picture, the title set as type — never a fake image. */
export function Art({ src, alt = '', ratio = 'poster', title, sample, className = '', unavailable, children }: { src?: string | null; alt?: string; ratio?: Ratio | string; title?: string; sample?: boolean; className?: string; unavailable?: boolean; children?: ReactNode }) {
  const T = useT();
  void sample;
  const r = (RATIO as Record<string, string>)[ratio] ?? ratio;
  return (
    <div className={cls('poster', r, className)}>
      {unavailable ? <div className="poster-text absolute inset-0 items-center justify-center text-center text-sm !font-sans !font-medium">{T('media.unavailable')}</div>
        : src ? <img src={src} alt={alt} loading="lazy" decoding="async" className="absolute inset-0" />
        : <div className="poster-text absolute inset-0" aria-hidden><span dir="auto" className="line-clamp-4">{title ?? T('misc.noArtwork')}</span></div>}
      {children}
    </div>
  );
}

/** A library item: the art, then the title and one line. The whole thing is one link; a menu may sit beside it. */
export function ArtCard({ href, src, ratio = 'poster', title, titleAr, meta, status, sample, badge, menu, unavailable }: { href: string; src?: string | null; ratio?: Ratio; title: string; titleAr?: string; meta?: ReactNode; status?: ReactNode; sample?: boolean; badge?: ReactNode; menu?: ReactNode; unavailable?: boolean }) {
  return (
    <li className="poster-card relative min-w-0">
      <Link href={href} className="poster-link block outline-none">
        <Art src={src} ratio={ratio} title={title} sample={sample} unavailable={unavailable}>{badge && <span className="absolute start-2 top-2">{badge}</span>}</Art>
        <p className={cls('poster-title bi', Boolean(menu) && 'pe-9')} dir="auto"><span>{title}</span>{titleAr && <span className="bi-ar" dir="rtl">{titleAr}</span>}</p>
        {meta && <p className="poster-meta">{meta}</p>}
        {status && <div className="mt-1.5">{status}</div>}
      </Link>
      {menu && <div className="card-tools absolute end-0 top-[calc(100%-4.25rem)]">{menu}</div>}
    </li>
  );
}

/** A list row for the same item, for management: art small on the start side, columns after. */
export function ArtRow({ href, src, ratio = 'poster', title, titleAr, cells, status, menu, sample }: { href: string; src?: string | null; ratio?: Ratio; title: string; titleAr?: string; cells?: ReactNode[]; status?: ReactNode; menu?: ReactNode; sample?: boolean }) {
  const w = ratio === 'poster' ? 'w-10' : ratio === 'square' ? 'w-12' : ratio === 'portrait' ? 'w-11' : 'w-20';
  return (
    <li className="row row-hover -mx-2 px-2">
      <Link href={href} className="flex min-w-0 flex-1 items-center gap-3">
        <div className={cls(w, 'flex-none')}><Art src={src} ratio={ratio} title={title} sample={false} className="!rounded-md !shadow-none" /></div>
        <span className="min-w-0 flex-1"><span className="bi block truncate text-sm font-medium" dir="auto"><span>{title}</span>{titleAr && <span className="bi-ar" dir="rtl">{titleAr}</span>}</span>{sample && <span className="text-[11px] text-faint">Sample</span>}</span>
        {cells?.map((c, i) => <span key={i} className="hidden min-w-0 flex-none text-sm text-muted sm:block sm:w-28 md:w-36 truncate">{c}</span>)}
        {status && <span className="hidden flex-none sm:block">{status}</span>}
      </Link>
      {menu}
    </li>
  );
}

/** THE BANNER HEADER — a wide picture bleeding to the edges of the page and fading into the canvas; on its lower
 *  edge the object, the eyebrow, the title, a short synopsis, one line of facts, and one primary action. Compact on
 *  a phone: the art shrinks, the text stacks. */
export function Hero({ backdropSrc, art, eyebrow, title, titleAr, description, meta, actions, back, children, compact }: { backdropSrc?: string | null; art: ReactNode; eyebrow?: ReactNode; title: string; titleAr?: string; description?: ReactNode; meta?: ReactNode; actions?: ReactNode; back?: { href: string; label: string }; children?: ReactNode; compact?: boolean }) {
  return (
    <header className={cls('hero -mx-5 -mt-6 mb-8 px-5 sm:-mx-8 sm:-mt-8 sm:px-8 lg:-mt-10', compact ? 'pt-6 lg:pt-8' : 'pt-10 sm:pt-16 lg:pt-20')}>
      <div className="hero-backdrop">{backdropSrc ? <img src={backdropSrc} alt="" aria-hidden /> : <div className="hero-plain h-full w-full" />}</div>
      {back && <Link href={back.href} className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-muted hover:text-fg"><IconChevronLeft className="size-3.5 rtl:rotate-180" aria-hidden />{back.label}</Link>}
      <div className={cls('flex gap-5 sm:gap-7', compact ? 'items-center' : 'items-end')}>
        <div className={cls('flex-none', compact ? 'w-20 sm:w-28' : 'w-28 sm:w-40 lg:w-44')}>{art}</div>
        <div className="min-w-0 flex-1 pb-1">
          {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
          <h1 className={cls('page-title bi', compact ? 'text-[1.5rem] sm:text-[1.9rem]' : 'text-[1.6rem] sm:text-[2.1rem] lg:text-[2.25rem]')} dir="auto"><span>{title}</span>{titleAr && <span className="bi-ar" dir="rtl">{titleAr}</span>}</h1>
          {description && <p className="mt-2 hidden max-w-3xl text-[14px] leading-relaxed text-body sm:block" dir="auto">{description}</p>}
          {meta && <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">{meta}</p>}
          {actions && <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
      {description && <p className="mt-3 text-[13.5px] leading-relaxed text-body sm:hidden" dir="auto">{description}</p>}
      {children}
    </header>
  );
}

/** Metadata as dots between words. */
export function Dots({ items }: { items: Array<ReactNode | false | null | undefined> }) {
  const xs = items.filter(Boolean);
  return <>{xs.map((x, i) => <span key={i} className="contents">{i > 0 && <span className="text-ink-500" aria-hidden>·</span>}<span>{x}</span></span>)}</>;
}

/** A section's empty state: what is missing, in words, and the one action that fixes it. */
export function Empty({ title, hint, action, art, icon, compact }: { title: ReactNode; hint?: ReactNode; action?: ReactNode; art?: ReactNode; icon?: ReactNode; compact?: boolean }) {
  return (
    <div className={cls('rounded-2xl border border-dashed border-line bg-raised/40 text-center', compact ? 'px-6 py-10' : 'px-8 py-16')}>
      {art ? <div className="mb-4 flex justify-center opacity-70">{art}</div> : (
        <div className={cls('mx-auto mb-4 grid place-items-center rounded-2xl border border-line bg-input text-muted', compact ? 'size-11 [&>svg]:size-[18px]' : 'size-14 [&>svg]:size-[22px]')}>{icon ?? <IconAuto />}</div>
      )}
      <p className={cls('font-semibold text-fg', compact ? 'text-[14px]' : 'text-[16px]')}>{title}</p>
      {hint && <p className={cls('mx-auto mt-2 max-w-md leading-relaxed text-faint', compact ? 'text-[12.5px]' : 'text-[13.5px]')}>{hint}</p>}
      {action && <div className={cls('flex flex-wrap justify-center gap-2', compact ? 'mt-5' : 'mt-6')}>{action}</div>}
    </div>
  );
}

/** A quiet section heading inside a workspace tab. */
export function Block({ title, count, actions, description, children, className = '' }: { title?: ReactNode; count?: number; actions?: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cls('mb-8', className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">{title && <h2 className="section-title">{title}{count !== undefined && <span className="num ms-2 text-[13px] font-medium text-faint">{count}</span>}</h2>}{description && <p className="mt-1 text-[12.5px] text-faint">{description}</p>}</div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
