'use client';

import Link from 'next/link';
import { useId, type CSSProperties, type ReactNode } from 'react';
import type { ArtVars, Presentation } from '@/domain/presentation';
import { T } from '@/lib/copy';
import { cls } from '@/components/ui/kit';
import { IconCheck } from '@/components/ui/icons';
import { RATIO_VALUE, type FrameRatio, type Picture } from '../art';
import { Frame, type FrameProps } from '../Frame';
import { Slate } from '../Slate';
import type { TitleState } from '../TitleCard';

/** THE TILE ANATOMY every tile shares (docs/DESIGN-SYSTEM-V4.md §5.5):
 *
 *    ┌ Frame (ratio) ─────────┐   duration chip (stills) and selected check sit inside the frame
 *    └────────────────────────┘   the play disc sits over it, as a sibling of the link (never inside it)
 *    Title, 2 lines max   [⋯]     the More menu is OUTSIDE the art, at the end of the title row (V4-09)
 *    slate · status last
 *
 *  One link wraps the frame, the title and the slate; the menu and the disc are its siblings. Hover: a 1 px inset
 *  strong hairline and the picture at 1.02 (tone only under reduced motion), the title in ivory. Focus: the two-colour
 *  ring around the frame and an underlined title. Selected (pickers, `onSelect`): a 2 px ivory outline and a 24 px
 *  check on the solid chip. The tile is a size container, so it needs a sized parent (a grid cell or a rail item). */

export interface TileProps {
  title: string;
  titleLang?: string;
  href?: string;
  /** pickers: the tile is a toggle button instead of a link */
  onSelect?: () => void;
  selected?: boolean;
  asset?: Picture | null;
  src?: string | null;
  state?: FrameProps['state'];
  phase?: ReactNode;
  titleState?: TitleState;
  /** slate facts in §3.4's order, without the status */
  slate?: Array<ReactNode | false | null | undefined>;
  /** the StateWord, always last */
  status?: ReactNode;
  /** the More menu (a kit Menu), placed at the end of the title row */
  menu?: ReactNode;
  art?: ArtVars | null;
  presentation?: Presentation | null;
  className?: string;
}

interface ShellProps extends TileProps {
  kind: 'keyart' | 'poster' | 'sleeve' | 'figure' | 'plate' | 'still';
  ratio: FrameRatio;
  fit?: 'cover' | 'contain';
  kindLabel?: ReactNode;
  sub?: ReactNode;
  subLang?: string;
  synopsis?: ReactNode;
  /** revealed on hover and focus, always shown on touch, always in the accessible name */
  reveal?: ReactNode;
  disc?: ReactNode;
  chip?: ReactNode;
  number?: number;
  frameLayers?: ReactNode;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}

export function TileShell(p: ShellProps) {
  const id = useId();
  const frame = (
    <Frame asset={p.asset} src={p.src} ratio={p.ratio} fit={p.fit} alt="" decorative title={p.title} titleLang={p.titleLang} titleState={p.titleState}
      state={p.state} phase={p.phase} number={p.number} art={p.art} presentation={p.presentation} className="mtile-frame">
      {p.frameLayers}
      {p.chip && <span className="mtile-chip">{p.chip}</span>}
      {p.selected && <span className="mtile-check" aria-hidden><IconCheck /></span>}
    </Frame>
  );
  const body = (
    <>
      {frame}
      {p.kindLabel && <span className="mtile-kind caption">{p.kindLabel}</span>}
      <span className="mtile-title tile-title" id={`${id}-t`} dir="auto" lang={p.titleLang}>{p.title}</span>
      {p.sub && <span className="mtile-sub" dir="auto" lang={p.subLang}>{p.sub}</span>}
      {p.synopsis && <span className="mtile-synopsis" dir="auto">{p.synopsis}</span>}
      <Slate items={p.slate ?? []} status={p.status} size="tile" />
      {p.reveal && <span className="mtile-reveal" dir="auto">{p.reveal}</span>}
      {p.onSelect && p.selected && <span className="sr-only">{T('media.selected')}</span>}
    </>
  );
  const style = { '--tile-r': String(1 / RATIO_VALUE[p.ratio]) } as CSSProperties;
  return (
    <article className={cls('mtile', p.className)} data-kind={p.kind} data-selected={p.selected || undefined} data-menu={p.menu ? '' : undefined} data-kindlabel={p.kindLabel ? '' : undefined}
      style={style} onPointerEnter={p.onPointerEnter} onPointerLeave={p.onPointerLeave}>
      {p.onSelect ? (
        <button type="button" className="mtile-link" data-rail-item aria-pressed={Boolean(p.selected)} onClick={p.onSelect}>{body}</button>
      ) : p.href ? (
        <Link href={p.href} className="mtile-link" data-rail-item>{body}</Link>
      ) : (
        <div className="mtile-link">{body}</div>
      )}
      {p.menu && <div className="mtile-menu">{p.menu}</div>}
      {p.disc && <div className="mtile-disc">{p.disc}</div>}
    </article>
  );
}

/** A loading tile: a ratio-true frame on the placeholder tone and two text bars; no shimmer (§5.5, §5.16). */
export function TileSkeleton({ ratio = '16/9', lines = 2, className }: { ratio?: FrameRatio; lines?: 1 | 2 | 3; className?: string }) {
  return (
    <div className={cls('mtile mtile-loading', className)} style={{ '--tile-r': String(1 / RATIO_VALUE[ratio]) } as CSSProperties} aria-busy="true" aria-label={T('media.loading')} role="status">
      <span className="mtile-skel-frame" style={{ aspectRatio: ratio.replace('/', ' / ') }} />
      {Array.from({ length: lines }, (_, i) => <span key={i} className="mtile-skel-line" data-i={i} />)}
    </div>
  );
}
