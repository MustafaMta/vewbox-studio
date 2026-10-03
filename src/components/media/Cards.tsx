'use client';

import Link from 'next/link';
import { Children, type CSSProperties, type ReactNode } from 'react';
import type { ArtVars, Presentation } from '@/domain/presentation';
import { cls } from '@/components/ui/kit';
import { IconCheck } from '@/components/ui/icons';
import { RATIO_VALUE, portraitPosition, type FrameRatio, type Picture } from './art';
import { Frame, type FrameProps } from './Frame';

/** THE DECISION CARD AND THE MEDIA TILE (docs/design/VISUAL-STANDARD-V5.1.md §5.6, §5.7) — props, no page logic.
 *
 *    DecisionCard  a level-1 card that is ONE link: a 16:9 picture edge to edge (a figure is portrait-cropped so its
 *                  face sits at 38 % of the visible height), then the kind line with a tungsten dot, the heading
 *                  (one line), the description (exactly two lines reserved) and the verb as a secondary sm button
 *                  drawn inside the link. Cards in a grid row stretch, so their buttons align.
 *    MediaTile     no card box: frame → 12 → name (one line, isolated, on the start edge) → 2 → meta (one line,
 *                  facts with their separators, status last). One link wraps both. Pickers use `onSelect`. */

type PictureProps = { asset?: Picture | null; src?: string | null; art?: ArtVars | null; presentation?: Presentation | null };

/** A content name (§4.4): isolated inside an LTR line, on the start edge, one line with an ellipsis. */
export function ContentName({ children, lang, className }: { children: string; lang?: string; className?: string }) {
  return <span className={cls('name', className)} title={children}><bdi lang={lang}>{children}</bdi></span>;
}

/** Facts in one line, each kept whole; the separator belongs to the fact before it (§4.3). */
export function Facts({ items, className }: { items: Array<ReactNode | false | null | undefined>; className?: string }) {
  const shown = items.filter((x) => x !== null && x !== undefined && x !== false && x !== '');
  return <span className={cls('t-facts', className)}>{Children.map(shown, (x) => <span>{x}</span>)}</span>;
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
  const position = figure ? portraitPosition(pic.asset ?? null, '16/9') : undefined;
  return (
    <Link href={href} className={cls('dcard', className)} onClick={onClick}>
      <Frame {...pic} ratio="16/9" fit="cover" alt="" decorative title={title} titleLang={titleLang} radius="none" position={position} priority={priority} className="dcard-media">
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
  const position = figure && ratio !== '928/1664' ? portraitPosition(pic.asset ?? null, ratio) : undefined;
  const facts = [...(meta ?? []), status];
  const body = (
    <>
      <Frame {...pic} ratio={ratio} fit={fit ?? (ratio === '928/1664' ? 'contain' : 'cover')} alt="" decorative title={title} titleLang={titleLang} position={position} priority={priority} state={frameState} phase={phase} className="mtile-frame">
        {chip && <span className="art-chip" data-end>{chip}</span>}
        {selected && <span className="mtile-check" aria-hidden><IconCheck /></span>}
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
