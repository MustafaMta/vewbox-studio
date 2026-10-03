'use client';

import type { ReactNode } from 'react';
import { cls } from '@/components/ui/kit';
import { IconTake } from '@/components/ui/icons';

/** LEGACY SHIM (docs/DESIGN-SYSTEM-V4.md §8.2 rule 6; deleted in Q1). `VideoPlayer` is now the v4 InlinePlayer — the
 *  same props and handle — so every page that used it keeps working until its page package migrates. The violet
 *  radial, the blur and the gradient utilities of the old player are gone (§1.5). */

export { InlinePlayer as VideoPlayer, type PlayerHandle, type CaptionTrack } from './InlinePlayer';
export type { SyncBus } from './sync';
export { AudioPlayer } from './Controls';

/** Where a clip would be: the frame at the right shape, a quiet glyph, what is missing and — when it is generation that
 *  would fill it — the button that says so. Never a broken player, never a fake picture: a poster, when given, is
 *  shown dimmed underneath. */
export function VideoPlaceholder({ ratio = '16 / 9', title, hint, action, posterSrc, className = '' }: { ratio?: string; title: ReactNode; hint?: ReactNode; action?: ReactNode; posterSrc?: string; className?: string }) {
  return (
    <div className={cls('vplaceholder', className)} style={{ aspectRatio: ratio }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {posterSrc && <img src={posterSrc} alt="" className="vplaceholder-poster" />}
      <div className="vplaceholder-body">
        <span className="vplaceholder-glyph" aria-hidden><IconTake /></span>
        <p className="vplaceholder-title">{title}</p>
        {hint && <p className="vplaceholder-hint">{hint}</p>}
        {action && <div className="vplaceholder-action">{action}</div>}
      </div>
    </div>
  );
}
