'use client';

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { Frame } from '@/components/media/Frame';
import { cls } from './kit/cls';
import { SectionHead } from './kit/Cards';
import { EmptyState } from './kit/States';
import { IconChevronLeft } from './icons';

/** LEGACY NAMES, KIT IMPLEMENTATION — the v3 "cinema" parts that pages written before the redesign still import (Art,
 *  ArtRow, Hero, Dots, Empty, Block). Each is now a thin wrapper over the one v5.1 implementation, so there is a single
 *  visual system: Art → the media Frame (title card without a picture), Hero → a page header with the picture in a
 *  rounded frame and the words under it (nothing set over a picture, §2 C7), Dots → the slate facts, Empty → the
 *  section's EmptyState, Block → a SectionHead and its content. New code imports the kit directly; these go when their
 *  last page migrates. */

export type Ratio = 'poster' | 'square' | 'portrait' | 'wide' | 'vertical';
export const RATIO: Record<Ratio, string> = { poster: 'aspect-[2/3]', square: 'aspect-square', portrait: 'aspect-[4/5]', wide: 'aspect-video', vertical: 'aspect-[9/16]' };
const CSS_RATIO: Record<Ratio, string> = { poster: '2 / 3', square: '1 / 1', portrait: '4 / 5', wide: '16 / 9', vertical: '9 / 16' };

/** A picture in its frame; with no picture, the title card — never a fake image. */
export function Art({ src, alt = '', ratio = 'poster', title, sample, className = '', unavailable, children, top }: { src?: string | null; alt?: string; ratio?: Ratio | string; title?: string; sample?: boolean; className?: string; unavailable?: boolean; children?: ReactNode; /** faces first: crop from the top (portraits) */ top?: boolean }) {
  void sample;
  const known = (CSS_RATIO as Record<string, string>)[ratio];
  const style: CSSProperties | undefined = known ? { aspectRatio: known } : undefined;
  return (
    <Frame src={src ?? null} alt={alt} ratio="2/3" title={title ?? 'No artwork yet'} titleState="noImage" state={unavailable ? 'unavailable' : undefined}
      position={top ? '50% 0%' : undefined} className={cls(!known && ratio, className)} style={style}>
      {children}
    </Frame>
  );
}

/** A list row for the same item, for management: the picture small at the start, columns after. */
export function ArtRow({ href, src, ratio = 'poster', title, titleAr, cells, status, menu, sample }: { href: string; src?: string | null; ratio?: Ratio; title: string; titleAr?: string; cells?: ReactNode[]; status?: ReactNode; menu?: ReactNode; sample?: boolean }) {
  const w = ratio === 'poster' ? 40 : ratio === 'square' ? 48 : ratio === 'portrait' ? 44 : 80;
  return (
    <li className="row art-row">
      <Link href={href} className="art-row-link">
        <span className="art-row-pic" style={{ inlineSize: w }}><Art src={src} ratio={ratio} title={title} /></span>
        <span className="art-row-words">
          <span className="art-row-title"><bdi>{title}</bdi>{titleAr && <> <bdi lang="ar" className="art-row-alt">{titleAr}</bdi></>}</span>
          {sample && <span className="t-meta">Sample</span>}
        </span>
        {cells?.map((c, i) => <span key={i} className="art-row-cell">{c}</span>)}
        {status && <span className="art-row-status">{status}</span>}
      </Link>
      {menu}
    </li>
  );
}

/** The page header of a detail page: back, the picture in a rounded frame (wide: the key art across the column; object:
 *  the poster / sleeve / portrait beside the words), then the eyebrow, the title, a short synopsis, one line of facts and
 *  the actions — all under or beside the picture, never on it. */
export function Hero({ backdropSrc, art, eyebrow, title, titleAr, description, meta, actions, back, children, compact, layout = 'object' }: { backdropSrc?: string | null; art?: ReactNode; eyebrow?: ReactNode; title: string; titleAr?: string; description?: ReactNode; meta?: ReactNode; actions?: ReactNode; back?: { href: string; label: string }; children?: ReactNode; compact?: boolean; /** `wide`: the key art across the column, the words under it (shows); `object` (default): the art object beside the words */ layout?: 'object' | 'wide' }) {
  const wide = layout === 'wide';
  const words = (
    <div className="lhero-words">
      {eyebrow && <p className="t-label lhero-eyebrow">{eyebrow}</p>}
      <h1 className={compact ? 't-hero lhero-title' : 't-page lhero-title'}><bdi>{title}</bdi>{titleAr && <> <bdi lang="ar" className="lhero-alt">{titleAr}</bdi></>}</h1>
      {description && <p className="t-lead lhero-lead">{description}</p>}
      {meta && <p className="t-meta lhero-meta">{meta}</p>}
      {actions && <div className="lhero-actions">{actions}</div>}
    </div>
  );
  return (
    <header className="lhero" data-layout={wide ? 'wide' : 'object'} data-compact={compact || undefined}>
      {back && <Link href={back.href} className="page-back"><IconChevronLeft aria-hidden />{back.label}</Link>}
      {wide ? (
        <>
          {backdropSrc && <div className="lhero-wide"><Frame src={backdropSrc} ratio="21/9" alt="" radius="hero" priority title={title} /></div>}
          {words}
        </>
      ) : (
        <div className="lhero-row">
          {art && <div className="lhero-art">{art}</div>}
          {words}
        </div>
      )}
      {children}
    </header>
  );
}

/** Facts in one line, the separator kept with the fact before it. */
export function Dots({ items }: { items: Array<ReactNode | false | null | undefined> }) {
  const xs = items.filter((x) => x !== null && x !== undefined && x !== false && x !== '');
  return <span className="t-facts">{xs.map((x, i) => <span key={i}>{x}</span>)}</span>;
}

/** A section's empty state: one honest sentence (and its hint) at the section's start edge and the one action. */
export function Empty({ title, hint, action, art, className = '' }: { title: ReactNode; hint?: ReactNode; action?: ReactNode; art?: ReactNode; icon?: ReactNode; compact?: boolean; className?: string }) {
  return (
    <div className={cls('legacy-empty', className)}>
      {art}
      <EmptyState action={action}>{title}{hint && <span className="legacy-empty-hint">{hint}</span>}</EmptyState>
    </div>
  );
}

/** A titled block inside a workspace tab: the section head (title, count, description, actions), then the content. */
export function Block({ title, count, actions, description, children, className = '' }: { title?: ReactNode; count?: number; actions?: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cls('legacy-block', className)}>
      {(title || actions) && <SectionHead title={title ?? ''} count={count} description={description} action={actions ? <span className="legacy-block-actions">{actions}</span> : undefined} />}
      {children}
    </section>
  );
}
