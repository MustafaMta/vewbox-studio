'use client';

import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { cls } from '@/components/ui/kit';
import { IconCaptions, IconExitFullscreen, IconFullscreen, IconMuted, IconPause, IconPlay, IconSound } from '@/components/ui/icons';
import { coreKeys, MediaFailure, SeekBar, TimeReadout, usePlayerCore } from '@/components/players/PlayerCore';
import { useShortcutScope } from '@/components/players/useShortcutScope';
import type { CaptionFile } from './model';

/** THE FILM'S PLAYER on its title page (docs/design/VISUAL-STANDARD-V5.1.md §5.24): the cut at 16:9 on black, the
 *  transport DOCKED under the picture inside the same rounded box — play/pause (the region's primary), the time in
 *  Geist Mono, the seek bar, captions, sound and full screen. Nothing is drawn over the picture: no centre disc, no
 *  scrim. Built on the players' shared core (usePlayerCore: one sound at a time, captions on by default, the keyboard
 *  map of §5.12 while the player has focus).
 *
 *  TEMPORARY page-local wrapper: the Design System Engineer is lifting the docked "video player chrome" into the kit;
 *  this file is replaced by it when it reaches main. */

export interface FilmPlayerHandle { seek: (t: number) => void; play: () => void }

export const FilmPlayer = forwardRef<FilmPlayerHandle, { src: string; poster?: string; title: string; captions?: CaptionFile[]; fps?: number; onTime?: (t: number) => void; className?: string }>(
  function FilmPlayer({ src, poster, title, captions = [], fps, onTime, className }, ref) {
    const c = usePlayerCore({ src, fps, aspect: '16 / 9' });
    useImperativeHandle(ref, () => ({ seek: c.seek, play: c.play }), [c.seek, c.play]);
    useEffect(() => { onTime?.(c.time); }, [c.time, onTime]);
    const keys = useShortcutScope(coreKeys(c));
    return (
      <div ref={c.wrap} className={cls('film-player', className)} data-full={c.full || undefined} data-playing={c.playing || undefined} role="group" aria-label={`${title}, the film`} onKeyDown={keys}>
        <div className="film-player-pic">
          <video {...c.videoProps} poster={poster} className="film-player-video" onClick={c.toggle} aria-label={title}>
            {captions.map((x) => <track key={x.src} kind="captions" src={x.src} srcLang={x.lang} label={x.label} />)}
          </video>
          {c.failed && <MediaFailure onRetry={c.retry} fileHref={src} />}
        </div>
        <div className="film-transport" dir="ltr" role="group" aria-label="Transport">
          <button type="button" className="btn btn-primary btn-icon film-play" aria-label={c.playing ? `Pause ${title}` : `Play ${title}`} onClick={c.toggle} disabled={c.failed}>
            {c.playing ? <IconPause aria-hidden /> : <IconPlay aria-hidden />}
          </button>
          <TimeReadout time={c.time} duration={c.duration} className="film-time" />
          <SeekBar time={c.time} duration={c.duration} step={c.frame} onSeek={c.seek} label={`Seek in ${title}`} tone="quiet" disabled={!c.ready} className="film-seek" />
          {(c.hasCaptions || captions.length > 0) && (
            <button type="button" className="btn btn-quiet btn-icon btn-sm" aria-label="Captions" aria-pressed={c.cc} title={c.cc ? 'Captions on' : 'Captions off'} onClick={c.toggleCc}><IconCaptions aria-hidden /></button>
          )}
          <button type="button" className="btn btn-quiet btn-icon btn-sm" aria-label={c.muted ? 'Turn the sound on' : 'Mute'} aria-pressed={c.muted} onClick={c.toggleMute}>{c.muted ? <IconMuted aria-hidden /> : <IconSound aria-hidden />}</button>
          <button type="button" className="btn btn-quiet btn-icon btn-sm" aria-label={c.full ? 'Exit full screen' : 'Full screen'} onClick={c.fullscreen}>{c.full ? <IconExitFullscreen aria-hidden /> : <IconFullscreen aria-hidden />}</button>
        </div>
      </div>
    );
  },
);
