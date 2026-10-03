'use client';

import type { CSSProperties, ReactNode } from 'react';
import { cls } from '@/components/ui/kit/cls';
import { cssRatio, type FrameRatio } from './art';

/** THE TITLE CARD (docs/design/VISUAL-STANDARD-V5.1.md §5.11) — an object without a picture, in the object's own
 *  shape: surface-1, radius 14, four viewfinder corners, the state at the top start (12/16 text-3; "Drawing…" with the
 *  running dot), the name at the bottom start (15/20, 20/26 on a 16:9 card 320 px or wider; never larger, never serif,
 *  never an empty card without a name). The name is isolated on the start edge (§4.4). */

export type TitleState = 'notDrawn' | 'drawing' | 'noKeyArt' | 'noPoster' | 'noSleeve' | 'noImage' | 'notMade' | 'unavailable';
const STATE_WORDS: Record<TitleState, string> = {
  notDrawn: 'Not drawn yet', drawing: 'Drawing…', noKeyArt: 'No key art yet', noPoster: 'No poster yet', noSleeve: 'No cover art yet',
  noImage: 'No image yet', notMade: 'Not made yet', unavailable: 'Unavailable',
};

export interface TitleCardProps {
  title: string;
  /** the name's language when known (`ar` for an Arabic name) */
  lang?: string;
  ratio?: FrameRatio;
  /** the fixed state words; `stateLabel` replaces them (a job's phase, "Your first show") */
  state?: TitleState;
  stateLabel?: ReactNode;
  /** episodes: the number, set at the top end (decorative; the "Episode 3" label under the frame carries it) */
  number?: number;
  /** `lg` forces the 20/26 name (empty-state cards); the default follows the card's width */
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
  const label = stateLabel ?? (state ? STATE_WORDS[state] : null);
  const live = state === 'drawing';
  return (
    <div className={cls('tcard', small && 'tcard-sm', className)} data-ratio={ratio} data-size={size} data-radius={radius} style={{ aspectRatio: cssRatio(ratio), ...style }}
      role={decorative ? undefined : 'img'} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : [title, typeof label === 'string' ? label : null].filter(Boolean).join(' · ')}>
      {label && <span className="tcard-state">{live && <span className="m-tally" aria-hidden />}{label}</span>}
      {number !== undefined && <span className="tcard-num" aria-hidden>{number}</span>}
      <span className="tcard-title"><bdi lang={lang}>{title}</bdi></span>
      {children}
    </div>
  );
}
