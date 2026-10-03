'use client';

import type { CSSProperties, ReactNode } from 'react';
import { T } from '@/lib/copy';
import { cls } from '@/components/ui/kit';
import { cssRatio, type FrameRatio } from './art';

/** THE TITLE CARD (docs/DESIGN-SYSTEM-V4.md §1.2 principle 6, §5.4) — the typographic placeholder of anything that has
 *  no picture yet, in the content's own shape: the name in the title voice at the lower start on the field tone, the
 *  state in 12/16 faint at the top start, and for episodes a large decorative number at the top end. Never a
 *  silhouette, a gradient, a stock picture or an icon tile. A 16:9 card 320 px or wider sets the name at `.t-card-lg`
 *  (container query in media.css). */

export type TitleState = 'notDrawn' | 'drawing' | 'noKeyArt' | 'noPoster' | 'noSleeve' | 'noImage' | 'notMade' | 'unavailable';
const STATE_KEY = { notDrawn: 'media.state.notDrawn', drawing: 'media.state.drawing', noKeyArt: 'media.state.noKeyArt', noPoster: 'media.state.noPoster', noSleeve: 'media.state.noSleeve', noImage: 'media.state.noImage', notMade: 'media.state.notMade', unavailable: 'media.state.unavailable' } as const;

export interface TitleCardProps {
  title: string;
  /** the name's language when known (`ar` for an Arabic name) */
  lang?: string;
  ratio?: FrameRatio;
  /** the fixed state words; `stateLabel` replaces them (a job's phase, "Your first show") */
  state?: TitleState;
  stateLabel?: ReactNode;
  /** episodes: the number, set large at the top end (decorative; the "Episode 3" label under the frame carries it) */
  number?: number;
  /** `lg` forces `.t-card-lg` (empty-state cards); the default follows the card's width */
  size?: 'auto' | 'lg';
  /** a small tile: 12 px inset instead of 16 */
  small?: boolean;
  /** inside a tile whose link already names it: hidden from assistive technology */
  decorative?: boolean;
  radius?: 'media' | 'precise' | 'none';
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export function TitleCard({ title, lang, ratio = '16/9', state, stateLabel, number, size = 'auto', small, decorative, radius = 'media', className, style, children }: TitleCardProps) {
  const label = stateLabel ?? (state ? T(STATE_KEY[state]) : null);
  const live = state === 'drawing';
  return (
    <div className={cls('tcard', small && 'tcard-sm', className)} data-ratio={ratio} data-size={size} data-radius={radius} style={{ aspectRatio: cssRatio(ratio), ...style }}
      role={decorative ? undefined : 'img'} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : [title, typeof label === 'string' ? label : null].filter(Boolean).join(' · ')}>
      {label && <span className="tcard-state">{live && <span className="m-tally" aria-hidden />}{label}</span>}
      {number !== undefined && <span className="tcard-num" aria-hidden>{number}</span>}
      <span className={cls('tcard-title', size === 'lg' ? 't-card-lg' : 't-card')} dir="auto" lang={lang}>{title}</span>
      {children}
    </div>
  );
}
