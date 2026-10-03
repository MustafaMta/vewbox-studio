'use client';

import type { ReactNode } from 'react';
import { useT } from '@/components/ui/locale';
import { cls } from '@/components/ui/kit';
import { IconClose } from '@/components/ui/icons';
import { SharedVolume } from './Controls';
import { PlayDisc } from './PlayDisc';
import { SeekBar, TimeReadout } from './PlayerCore';
import { usePlayer, useTrackState, type Track } from './PlayerProvider';
import { useRootVarContribution } from './rootVars';

/** THE PLAYER BAR (docs/DESIGN-SYSTEM-V4.md §5.12; replaces MiniPlayer) — the compact player, fixed at the bottom,
 *  64 px, radius 16, `--raised-2` with the float shadow, inset 12 px from the content edges so it never covers the
 *  sidebar or the rail. Anatomy: a 40 px thumbnail in the content's shape · title and subtitle · play (40) · seek ·
 *  time · [music] Song | Video · close. While it is shown (fixed) it contributes 76 px to `--bottom-bars` on <html>
 *  (the §2.1 sum of contributions, through the kit's useRootVarContribution — players/rootVars.ts until the merge), so
 *  the root's scroll padding keeps toasts and the focused element above it (WCAG 2.4.11). It plays the studio's one
 *  audio source; close stops it. */

export function PlayerBar({ track, show = true, persistent, placement = 'fixed', shape = 'square', mode, onClose, className }: { track: Track; show?: boolean; /** shown even before this track is loaded (play starts it) */ persistent?: boolean; /** `inline`: drawn in the flow (the specimen page) */ placement?: 'fixed' | 'inline'; shape?: 'square' | 'poster' | 'wide' | 'figure'; mode?: ReactNode; onClose?: () => void; className?: string }) {
  const T = useT();
  const p = usePlayer();
  const st = useTrackState(track);
  const visible = show && (st.mine || Boolean(persistent));
  useRootVarContribution('--bottom-bars', 76, visible && placement === 'fixed');
  if (!visible) return null;
  return (
    <div className={cls('playerbar', className)} role="region" aria-label={T('media.bar.label')} data-shape={shape} data-placement={placement}>
      <span className="playerbar-thumb" aria-hidden>{track.artworkSrc ? <img src={track.artworkSrc} alt="" /> : null}</span>
      <span className="playerbar-text">
        <span className="playerbar-title" dir="auto">{track.title}</span>
        {track.subtitle && <span className="playerbar-sub" dir="auto">{track.subtitle}</span>}
      </span>
      <div className="playerbar-transport" dir="ltr" role="group" aria-label={T('media.player.transport')}>
        <PlayDisc track={track} size={40} tone="ivory" labelPlay={T.f('media.play', { title: track.title })} labelPause={T.f('media.pause', { title: track.title })} />
        <SeekBar time={st.time} duration={st.duration} step={0.1} onSeek={(t) => { if (st.mine) p.seek(t); else p.play(track, t); }} label={T('misc.seek')} tone="quiet" className="playerbar-seek" />
        <TimeReadout time={st.time} duration={st.duration} className="playerbar-time" />
      </div>
      {mode && <div className="playerbar-mode">{mode}</div>}
      <span className="playerbar-vol"><SharedVolume popover /></span>
      <button type="button" className="btn btn-quiet btn-sm btn-icon" aria-label={T('media.bar.close')} onClick={() => { if (st.mine) p.stop(); onClose?.(); }}><IconClose aria-hidden /></button>
    </div>
  );
}
