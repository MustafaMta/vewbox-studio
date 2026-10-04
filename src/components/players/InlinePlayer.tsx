'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from 'react';
import { cls } from '@/components/ui/kit/cls';
import { IconCaptions, IconExitFullscreen, IconFullscreen, IconPause, IconPlay } from '@/components/ui/icons';
import { VolumeControl } from './Controls';
import { coreKeys, handleOf, MediaFailure, SeekBar, TimeReadout, usePlayerCore, type PlayerCore } from './PlayerCore';
import type { SyncBus } from './sync';
import { useShortcutScope, type ShortcutMap } from './useShortcutScope';

/** THE INLINE PLAYER (docs/design/VISUAL-STANDARD-V5.1.md §5.24) — the video player of the lobby and the Screening
 *  Room: the picture on black at its native ratio (letterboxed, never cropped, at most 70vh; 76vh in the theatre), and
 *  the transport DOCKED UNDER the picture inside the same box (radius 14; 20 when it is the page's hero; 0 and black in
 *  the theatre): 52 high, padding 0 12, items 8 apart — the 36 px play/pause (primary fill), the time in mono
 *  "0:30 / 0:56", the seek bar (flex 1: a 4 px track on surface-3, played text-1, buffered #3A3A3A, a 12 px thumb on
 *  hover, focus and drag, a 24 px hit area; `ticks` mark shots and notes on it), then captions, volume and fullscreen
 *  as 32 px quiet icon buttons. Nothing is drawn over the picture by the player itself: no centre play disc, no scrim;
 *  captions sit on the picture's lower area. The transport is LTR, and never moves over the frame.
 *
 *  Extending it (the Screening Room): `overlay` draws inside the picture box (note pins); `transportStart` /
 *  `transportEnd` add controls to the dock (±5 s, the CC language readout); `keys` adds to or overrides the keyboard
 *  map; each of these may be a function of the player's state (`PlayerCore`: time, duration, playing, seek, pause …),
 *  which re-renders as the playhead moves. `onState` reports time and play state to the page; the ref exposes the
 *  controls and a snapshot (`state()`). Keyboard (when the player has focus): Space/K play, J/L ±5 s, ←/→ a frame,
 *  Shift+←/→ 1 s, Home/End, M mute, C captions, F fullscreen — plus `keys`. */

export interface PlayerHandle {
  play: () => void; pause: () => void; toggle: () => void; seek: (t: number) => void; nudge: (s: number) => void;
  el: () => HTMLVideoElement | null;
  /** the current state, read when called */
  state: () => { time: number; duration: number; playing: boolean };
}
export interface CaptionTrack { src: string; label: string; lang: string }
export type PlayerTick = { at: number; label?: string; kind?: 'note' | 'mark' };
type Slot = ReactNode | ((c: PlayerCore) => ReactNode);
const slot = (s: Slot | undefined, c: PlayerCore) => (typeof s === 'function' ? s(c) : s);

export interface InlinePlayerProps {
  src: string; poster?: string; fps?: number | null; title?: string; sync?: SyncBus; className?: string; muted?: boolean;
  /** a tighter transport: the volume behind its button */ compact?: boolean;
  aspect?: string; captions?: CaptionTrack[]; maxHeight?: string; fileHref?: string;
  /** the page's hero: radius 20 */ hero?: boolean;
  /** the Screening Room: radius 0, black dock, the picture up to 76vh; the transport stays docked under the picture */ theatre?: boolean;
  /** drawn inside the picture box, above the video (note pins); absolutely positioned by the caller */ overlay?: Slot;
  /** marks on the seek track: shots (`mark`), notes (`note`) */ ticks?: PlayerTick[];
  /** keys added to (or replacing) the player's own map, while it has focus: `{ c: () => addNote(), s: … , '[': prevShot }` */
  keys?: ShortcutMap | ((c: PlayerCore) => ShortcutMap);
  /** controls in the dock: after the time readout (±5 s) and before fullscreen (the CC language readout) */
  transportStart?: Slot; transportEnd?: Slot;
  /** the playhead and the play state, as they change */ onState?: (s: { time: number; duration: number; playing: boolean }) => void;
}

export const InlinePlayer = forwardRef<PlayerHandle, InlinePlayerProps>(function InlinePlayer({ src, poster, fps, title, sync, className, muted, compact, aspect, captions, maxHeight, fileHref, hero, theatre, overlay, ticks, keys: extra, transportStart, transportEnd, onState }, ref) {
  const c = usePlayerCore({ src, fps, sync, muted, aspect });
  useImperativeHandle(ref, () => handleOf(c), [c]);
  const report = useRef(onState); report.current = onState;
  useEffect(() => { report.current?.({ time: c.time, duration: c.duration, playing: c.playing }); }, [c.time, c.duration, c.playing]);
  const keys = useShortcutScope(coreKeys(c, typeof extra === 'function' ? extra(c) : extra));
  const box = c.full ? undefined : { aspectRatio: c.ratio ?? '16 / 9', maxBlockSize: maxHeight ?? (theatre ? '76vh' : compact ? '40vh' : '70vh') };
  const cc = c.hasCaptions || Boolean(captions && captions.length > 0);
  return (
    <div ref={c.wrap} className={cls('iplayer vplayer', className)} data-hero={hero || undefined} data-theatre={theatre || undefined} data-full={c.full || undefined} data-playing={c.playing || undefined}
      tabIndex={0} role="group" aria-label={title ?? 'Video'} onKeyDown={keys}>
      <div className="iplayer-box" style={box}>
        <video {...c.videoProps} poster={poster} className="pvideo" onClick={c.toggle}>
          {captions?.map((x) => <track key={x.src} kind="captions" src={x.src} srcLang={x.lang} label={x.label} />)}
        </video>
        {overlay != null && <div className="iplayer-overlay">{slot(overlay, c)}</div>}
        {c.failed && <MediaFailure onRetry={c.retry} fileHref={fileHref ?? src} />}
      </div>
      <div className="ptransport" dir="ltr" role="group" aria-label="Playback controls">
        <button type="button" className="pt-play" aria-label={c.playing ? 'Pause' : 'Play'} onClick={c.toggle} disabled={c.failed}>{c.playing ? <IconPause aria-hidden /> : <IconPlay aria-hidden />}</button>
        <TimeReadout time={c.time} duration={c.duration} className="pt-time" />
        {transportStart != null && <span className="pt-group">{slot(transportStart, c)}</span>}
        <SeekBar time={c.time} duration={c.duration} buffered={c.buffered} step={c.frame} onSeek={c.seek} label="Seek" tone="docked" disabled={!c.ready || c.failed} ticks={ticks} className="pt-seek" />
        {cc && <button type="button" className="pt-btn" aria-label="Captions" aria-pressed={c.cc} onClick={c.toggleCc}><IconCaptions aria-hidden /></button>}
        {transportEnd != null && <span className="pt-group">{slot(transportEnd, c)}</span>}
        <VolumeControl volume={c.volume} muted={c.muted} onVolume={c.setVolume} onMute={c.toggleMute} popover={compact} />
        <button type="button" className="pt-btn" aria-label={c.full ? 'Exit fullscreen' : 'Fullscreen'} onClick={c.fullscreen}>{c.full ? <IconExitFullscreen aria-hidden /> : <IconFullscreen aria-hidden />}</button>
      </div>
    </div>
  );
});
