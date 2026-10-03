'use client';

import { forwardRef, useImperativeHandle } from 'react';
import { cls } from '@/components/ui/kit/cls';
import { IconCaptions, IconExitFullscreen, IconFullscreen, IconPause, IconPlay } from '@/components/ui/icons';
import { VolumeControl } from './Controls';
import { coreKeys, MediaFailure, SeekBar, TimeReadout, usePlayerCore } from './PlayerCore';
import type { SyncBus } from './sync';
import { useShortcutScope } from './useShortcutScope';

/** THE INLINE PLAYER (docs/design/VISUAL-STANDARD-V5.1.md §5.24) — the lobby's video player: the picture on black at
 *  its native ratio (letterboxed, never cropped, at most 70vh), and the transport DOCKED UNDER the picture inside the
 *  same rounded box (radius 14; 20 when it is the page's hero): 52 high on surface-1, padding 0 12, items 8 apart —
 *  the 36 px play/pause (primary fill), the time in mono "0:30 / 0:56", the seek bar (flex 1: a 4 px track on
 *  surface-3, played text-1, buffered #3A3A3A, a 12 px thumb on hover, focus and drag, a 24 px hit area), then
 *  captions, volume and fullscreen as 32 px quiet icon buttons. Nothing is drawn over the picture: no centre play
 *  disc, no scrim; captions sit on the picture's lower area. The transport is LTR. Keyboard (when the player has
 *  focus): Space/K play, J/L ±5 s, ←/→ a frame, Shift+←/→ 1 s, Home/End, M mute, C captions, F fullscreen. */

export interface PlayerHandle { play: () => void; pause: () => void; seek: (t: number) => void; el: () => HTMLVideoElement | null }
export interface CaptionTrack { src: string; label: string; lang: string }

export interface InlinePlayerProps {
  src: string; poster?: string; fps?: number | null; title?: string; sync?: SyncBus; className?: string; muted?: boolean;
  /** a tighter transport: the volume behind its button */ compact?: boolean;
  aspect?: string; captions?: CaptionTrack[]; maxHeight?: string; fileHref?: string;
  /** the page's hero: radius 20 */ hero?: boolean;
}

export const InlinePlayer = forwardRef<PlayerHandle, InlinePlayerProps>(function InlinePlayer({ src, poster, fps, title, sync, className, muted, compact, aspect, captions, maxHeight, fileHref, hero }, ref) {
  const c = usePlayerCore({ src, fps, sync, muted, aspect });
  useImperativeHandle(ref, () => ({ play: c.play, pause: c.pause, seek: c.seek, el: () => c.video.current }), [c.play, c.pause, c.seek, c.video]);
  const keys = useShortcutScope(coreKeys(c));
  const box = c.full ? undefined : { aspectRatio: c.ratio ?? '16 / 9', maxBlockSize: maxHeight ?? (compact ? '40vh' : '70vh') };
  const cc = c.hasCaptions || Boolean(captions && captions.length > 0);
  return (
    <div ref={c.wrap} className={cls('iplayer vplayer', className)} data-hero={hero || undefined} data-full={c.full || undefined} data-playing={c.playing || undefined}
      tabIndex={0} role="group" aria-label={title ?? 'Video'} onKeyDown={keys}>
      <div className="iplayer-box" style={box}>
        <video {...c.videoProps} poster={poster} className="pvideo" onClick={c.toggle}>
          {captions?.map((x) => <track key={x.src} kind="captions" src={x.src} srcLang={x.lang} label={x.label} />)}
        </video>
        {c.failed && <MediaFailure onRetry={c.retry} fileHref={fileHref ?? src} />}
      </div>
      <div className="ptransport" dir="ltr" role="group" aria-label="Playback controls">
        <button type="button" className="pt-play" aria-label={c.playing ? 'Pause' : 'Play'} onClick={c.toggle} disabled={c.failed}>{c.playing ? <IconPause aria-hidden /> : <IconPlay aria-hidden />}</button>
        <TimeReadout time={c.time} duration={c.duration} className="pt-time" />
        <SeekBar time={c.time} duration={c.duration} buffered={c.buffered} step={c.frame} onSeek={c.seek} label="Seek" tone="docked" disabled={!c.ready || c.failed} className="pt-seek" />
        {cc && <button type="button" className="pt-btn" aria-label="Captions" aria-pressed={c.cc} onClick={c.toggleCc}><IconCaptions aria-hidden /></button>}
        <VolumeControl volume={c.volume} muted={c.muted} onVolume={c.setVolume} onMute={c.toggleMute} popover={compact} />
        <button type="button" className="pt-btn" aria-label={c.full ? 'Exit fullscreen' : 'Fullscreen'} onClick={c.fullscreen}>{c.full ? <IconExitFullscreen aria-hidden /> : <IconFullscreen aria-hidden />}</button>
      </div>
    </div>
  );
});
