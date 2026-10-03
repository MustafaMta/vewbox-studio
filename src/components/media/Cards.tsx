'use client';

import Link from 'next/link';
import { Children, type CSSProperties, type ReactNode } from 'react';
import type { ArtVars, Presentation } from '@/domain/presentation';
import { artVars } from '@/studio/presentation';
import { cls } from '@/components/ui/kit/cls';
import { IconCheck, IconChevronRight, IconPlus } from '@/components/ui/icons';
import { RATIO_VALUE, cssRatio, portraitPosition, type FrameRatio, type Picture } from './art';
import { Frame, type FrameProps } from './Frame';

/** THE CARDS THAT DRAW PICTURES (docs/design/VISUAL-STANDARD-V5.1.md §5.5–§5.8; the approved Home is the visual
 *  reference) — props, no page logic. Every card is one link (or one toggle button in a picker), focus is the ring
 *  3 px outside, hover zooms the picture 1.03 inside its frame, and the skeletons in ./Skeletons have the same sizes.
 *
 *    MediaCard     a picture with its words ON it: the title and one meta line over the poster scrim at the bottom
 *                  (Home's shelf cards). PosterCard = 2:3, SleeveCard = 1:1; MediaCard defaults to 16:9.
 *    FigureCard    a character's whole canonical figure (928:1664, contain on its own field), the name below on the
 *                  start edge, and one badge row (only "Needs approval" when the producer is waited on).
 *    StartCard     the last card of a shelf: start a new one, in the shelf's own shape, with the viewfinder corners.
 *    FeaturedCard  the level-1 card that leads a page: a chip, a title, two lines, one primary action, and up to four
 *                  square pictures that open what they show.
 *    DecisionCard  a level-1 card that is one link: a 16:9 picture edge to edge, the kind line with a tungsten dot,
 *                  the heading, two reserved lines and the verb as a secondary sm button (§5.7).
 *    MediaTile     no card box: frame → 12 → name → 2 → meta (§5.6), for catalogue grids.
 *
 *  Pictures: `asset` (a domain Asset or any Picture), else `src`; `art` defaults to the asset's own placeholder colour
 *  (presentation.dominant). `position` is an explicit object-position (a figure cropped to its face). */

type PictureProps = { asset?: Picture | null; src?: string | null; art?: ArtVars | null; presentation?: Presentation | null; position?: string };
type CardRatio = '16/9' | '2/3' | '1/1';

const artOf = (p: PictureProps) => p.art ?? artVars(p.asset ?? null);

/** A content name (§4.4): isolated inside an LTR line, on the start edge, one line with an ellipsis. */
export function ContentName({ children, lang, className }: { children: string; lang?: string; className?: string }) {
  return <span className={cls('name', className)} title={children}><bdi lang={lang}>{children}</bdi></span>;
}

/** Facts in one line, each kept whole; the separator belongs to the fact before it (§4.3). */
export function Facts({ items, className }: { items: Array<ReactNode | false | null | undefined>; className?: string }) {
  const shown = items.filter((x) => x !== null && x !== undefined && x !== false && x !== '');
  return <span className={cls('t-facts', className)}>{Children.map(shown, (x) => <span>{x}</span>)}</span>;
}

/** The card's one interactive element: a link, a toggle (pickers), or an inert box that says why (disabled). */
function Hit({ href, onSelect, selected, disabledReason, className, title, children, onClick, style }: {
  href?: string; onSelect?: () => void; selected?: boolean; disabledReason?: string; className: string; title?: string; children: ReactNode; onClick?: () => void; style?: CSSProperties;
}) {
  if (disabledReason) return <div className={className} aria-disabled="true" title={disabledReason} style={style}>{children}</div>;
  if (onSelect) return <button type="button" className={className} aria-pressed={Boolean(selected)} onClick={onSelect} title={title} style={style}>{children}</button>;
  if (href) return <Link href={href} className={className} title={title} onClick={onClick} style={style}>{children}</Link>;
  return <div className={className} title={title} style={style}>{children}</div>;
}

export interface MediaCardProps extends PictureProps {
  href?: string;
  /** pickers: the card is a toggle button */
  onSelect?: () => void;
  selected?: boolean;
  /** inert; the reason replaces the meta line and is the tooltip */
  disabledReason?: string;
  title: string;
  titleLang?: string;
  /** one line under the title ("Short · 0:56", "Finished") */
  meta?: ReactNode;
  ratio?: CardRatio;
  /** one chip at the top end (a duration, "Draft") */
  chip?: ReactNode;
  /** a figure in a wider frame: crop it to the face */
  figure?: boolean;
  priority?: boolean;
  /** a job draws it now: its phase words on the picture */
  phase?: ReactNode;
  frameState?: FrameProps['state'];
  onClick?: () => void;
  className?: string;
}

/** A picture with its words on it (Home's shelf cards). */
export function MediaCard({ href, onSelect, selected, disabledReason, title, titleLang, meta, ratio = '16/9', chip, figure, priority, phase, frameState, onClick, className, ...pic }: MediaCardProps) {
  const position = pic.position ?? (figure ? portraitPosition(pic.asset ?? null, ratio) : undefined);
  return (
    <Hit href={href} onSelect={onSelect} selected={selected} disabledReason={disabledReason} title={title} onClick={onClick}
      className={cls('mcard', className)}>
      <Frame asset={pic.asset} src={pic.src} presentation={pic.presentation} art={artOf(pic)} position={position} ratio={ratio} fit="cover" alt="" radius="none"
        title={title} titleLang={titleLang} titleState="noImage" decorative priority={priority} state={phase ? 'drawing' : frameState} phase={phase} className="mcard-frame">
        {chip && <span className="art-chip mcard-chip">{chip}</span>}
        {selected && <span className="card-check" aria-hidden><IconCheck /></span>}
      </Frame>
      <span className="mcard-words">
        <span className="mcard-title name"><bdi lang={titleLang}>{title}</bdi></span>
        {(disabledReason ?? meta) != null && <span className="mcard-meta">{disabledReason ?? meta}</span>}
      </span>
    </Hit>
  );
}

/** A 2:3 poster with its words on it (Shorts). */
export function PosterCard(props: Omit<MediaCardProps, 'ratio'>) { return <MediaCard {...props} ratio="2/3" />; }
/** A 1:1 sleeve with its words on it (Music videos). */
export function SleeveCard(props: Omit<MediaCardProps, 'ratio'>) { return <MediaCard {...props} ratio="1/1" />; }

/** A character (Home's line-up; the casting directory): the whole figure, never cropped, the name below, one badge. */
export function FigureCard({ href, onSelect, selected, disabledReason, name, nameLang, badge, waiting, priority, onClick, className, ...pic }: PictureProps & {
  href?: string; onSelect?: () => void; selected?: boolean; disabledReason?: string;
  name: string; nameLang?: string;
  /** the one badge under the name; `waiting` is the "Needs approval" badge */
  badge?: ReactNode; waiting?: boolean;
  priority?: boolean; onClick?: () => void; className?: string;
}) {
  return (
    <Hit href={href} onSelect={onSelect} selected={selected} disabledReason={disabledReason} title={name} onClick={onClick} className={cls('fcard', className)}>
      <Frame asset={pic.asset} src={pic.src} presentation={pic.presentation} art={artOf(pic)} ratio="928/1664" fit="contain" alt="" title={name} titleLang={nameLang} titleState="noImage" decorative priority={priority} className="fcard-frame">
        {selected && <span className="card-check" aria-hidden><IconCheck /></span>}
      </Frame>
      <span className="t-card name fcard-name"><bdi lang={nameLang}>{name}</bdi></span>
      <span className="fcard-state">{disabledReason ? <span className="t-meta">{disabledReason}</span> : badge ?? (waiting ? <span className="badge badge-warn">Needs approval</span> : null)}</span>
    </Hit>
  );
}

/** Start a new one, in the shelf's own shape (§7 "each shelf ends with a start card"): the viewfinder corners, a plus
 *  in a circle, the title and one line. In a figure shelf it takes the figure card's frame and its empty name rows,
 *  so its height matches the characters beside it. */
export function StartCard({ href, onClick, ratio = '16/9', title, line, disabledReason, className }: {
  href?: string; onClick?: () => void;
  ratio?: CardRatio | '928/1664';
  title: string; line?: ReactNode;
  disabledReason?: string;
  className?: string;
}) {
  const inner = (
    <>
      <span className="corners" aria-hidden />
      <span className="start-plus" aria-hidden><IconPlus /></span>
      <span className="start-words">
        <span className="start-title">{title}</span>
        {(disabledReason ?? line) != null && <span className="start-line">{disabledReason ?? line}</span>}
      </span>
    </>
  );
  const shape = { aspectRatio: cssRatio(ratio) };
  const act = (cn: string, style?: CSSProperties) => (disabledReason
    ? <span className={cn} aria-disabled="true" style={style}>{inner}</span>
    : href ? <Link href={href} className={cn} style={style}>{inner}</Link>
      : <button type="button" className={cn} onClick={onClick} style={style}>{inner}</button>);
  if (ratio === '928/1664') {
    return (
      <span className={cls('fcard fcard-start', className)}>
        {act('start-card fcard-frame', shape)}
        <span className="t-card fcard-name" aria-hidden />
        <span className="fcard-state" aria-hidden />
      </span>
    );
  }
  return act(cls('start-card', className), shape);
}

export interface FeaturedThumb extends PictureProps { id: string; href: string; label: string }

/** The card that leads a page (Home's featured card): a chip, a 24/30 title, two lines, one primary action, and up to
 *  four square pictures (each a link with its own name). */
export function FeaturedCard({ id, chip, chipTone, title, body, action, thumbs = [], level = 2, className }: {
  id: string;
  chip?: ReactNode; chipTone?: 'wait' | 'ok' | 'neutral';
  title: ReactNode; body?: ReactNode;
  action?: { label: ReactNode; href?: string; onClick?: () => void };
  thumbs?: FeaturedThumb[];
  level?: 2 | 3;
  className?: string;
}) {
  const H = level === 2 ? 'h2' : 'h3';
  const shown = thumbs.slice(0, 4);
  return (
    <article className={cls('card feat-card', className)} aria-labelledby={`${id}-h`}>
      <div className="feat-words">
        {chip && <span className={cls('badge', chipTone === 'wait' ? 'badge-warn' : chipTone === 'ok' ? 'badge-ok' : 'badge-neutral')}>{chip}</span>}
        <H id={`${id}-h`} className="feat-title">{title}</H>
        {body && <p className="t-body feat-body">{body}</p>}
        {action && (action.href
          ? <Link className="btn btn-primary btn-sm feat-btn" href={action.href}>{action.label}<IconChevronRight aria-hidden /></Link>
          : <button type="button" className="btn btn-primary btn-sm feat-btn" onClick={action.onClick}>{action.label}<IconChevronRight aria-hidden /></button>)}
      </div>
      {shown.length > 0 && (
        <ul className="feat-thumbs" role="list" data-count={shown.length}>
          {shown.map((t) => (
            <li key={t.id}>
              <Link href={t.href} className="feat-thumb" aria-label={t.label} title={t.label}>
                <Frame asset={t.asset} src={t.src} presentation={t.presentation} art={artOf(t)} position={t.position} ratio="1/1" fit="cover" alt="" radius="none" title={t.label} decorative />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function DecisionCard({ href, kind, title, titleLang, description, verb, chip, figure, priority, onClick, className, ...pic }: PictureProps & {
  href: string;
  /** "Character image · version 2" */
  kind: ReactNode;
  title: string;
  titleLang?: string;
  description?: ReactNode;
  /** "Review and approve" */
  verb: ReactNode;
  /** one chip on the picture's bottom start (shot labels, take count) */
  chip?: ReactNode;
  /** a figure (928:1664): crop it to the face instead of the focal point */
  figure?: boolean;
  priority?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const position = pic.position ?? (figure ? portraitPosition(pic.asset ?? null, '16/9') : undefined);
  return (
    <Link href={href} className={cls('dcard', className)} onClick={onClick}>
      <Frame asset={pic.asset} src={pic.src} presentation={pic.presentation} art={artOf(pic)} ratio="16/9" fit="cover" alt="" decorative title={title} titleLang={titleLang} radius="none" position={position} priority={priority} className="dcard-media">
        {chip && <span className="art-chip">{chip}</span>}
      </Frame>
      <span className="dcard-body">
        <span className="dcard-kind t-label"><span className="dcard-dot" aria-hidden />{kind}</span>
        <ContentName lang={titleLang} className="t-card dcard-title">{title}</ContentName>
        <span className="dcard-desc t-body">{description}</span>
        <span className="btn btn-secondary btn-sm dcard-verb">{verb}</span>
      </span>
    </Link>
  );
}

export function MediaTile({ href, onSelect, selected, title, titleLang, meta, status, badge, ratio = '16/9', fit, chip, priority, figure, frameState, phase, className, ...pic }: PictureProps & {
  href?: string;
  /** pickers: the tile is a toggle button */
  onSelect?: () => void;
  selected?: boolean;
  title: string;
  titleLang?: string;
  /** facts, in order ("Short", "Final cut", "3 Oct") */
  meta?: Array<ReactNode | false | null | undefined>;
  /** a status word, always last in the meta line */
  status?: ReactNode;
  /** a badge under the name instead of the meta ("Needs approval" on a character) */
  badge?: ReactNode;
  ratio?: FrameRatio;
  fit?: 'cover' | 'contain';
  chip?: ReactNode;
  priority?: boolean;
  /** a figure shown in a wide frame: crop it to the face */
  figure?: boolean;
  frameState?: FrameProps['state'];
  phase?: ReactNode;
  className?: string;
}) {
  const position = pic.position ?? (figure && ratio !== '928/1664' ? portraitPosition(pic.asset ?? null, ratio) : undefined);
  const facts = [...(meta ?? []), status];
  const body = (
    <>
      <Frame asset={pic.asset} src={pic.src} presentation={pic.presentation} art={artOf(pic)} ratio={ratio} fit={fit ?? (ratio === '928/1664' ? 'contain' : 'cover')} alt="" decorative title={title} titleLang={titleLang} position={position} priority={priority} state={frameState} phase={phase} className="mtile-frame">
        {chip && <span className="art-chip" data-end>{chip}</span>}
        {selected && <span className="card-check" aria-hidden><IconCheck /></span>}
      </Frame>
      <ContentName lang={titleLang} className="mtile-title">{title}</ContentName>
      {badge ? <span className="mtile-badge">{badge}</span> : facts.some(Boolean) ? <Facts items={facts} className="mtile-meta" /> : <span className="mtile-meta" aria-hidden />}
    </>
  );
  const style = { '--tile-r': String(1 / RATIO_VALUE[ratio]) } as CSSProperties;
  return (
    <article className={cls('mtile', className)} data-selected={selected || undefined} style={style}>
      {onSelect ? <button type="button" className="mtile-link" aria-pressed={Boolean(selected)} onClick={onSelect}>{body}</button>
        : href ? <Link href={href} className="mtile-link">{body}</Link>
        : <div className="mtile-link">{body}</div>}
    </article>
  );
}
