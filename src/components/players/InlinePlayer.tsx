'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useT } from '@/components/ui/locale';
import { cls } from '@/components/ui/kit';
import { IconCaptions, IconExitFullscreen, IconFullscreen, IconNextFrame, IconPause, IconPlay, IconPrevFrame } from '@/components/ui/icons';
import { VolumeControl } from './Controls';
import { coreKeys, MediaFailure, SeekBar, TimeReadout, usePlayerCore } from './PlayerCore';
import type { SyncBus } from './sync';
import { useShortcutScope } from './useShortcutScope';

/** THE INLINE PLAYER (docs/DESIGN-SYSTEM-V4.md §5.12) — the lobby shell: `--media` ground, radius 12, the clip at its
 *  native ratio (letterboxed, never cropped), at most 70vh. Before the first play: the poster and one solid play disc.
 *  Then the picture alone, with the overlay bar (on the bottom scrim) returning on any movement, touch or focus, and
 *  hiding 2.5 s after the last one while playing; always there while paused or focused. The transport is LTR in both
 *  languages. Used in hero slots, the Overview cut and approval cards. */

export interface PlayerHandle { play: () => void; pause: () => void; seek: (t: number) => void; el: () => HTMLVideoElement | null }
export interface CaptionTrack { src: string; label: string; lang: string }

export interface InlinePlayerProps { src: string; poster?: string; fps?: number | null; title?: string; sync?: SyncBus; className?: string; muted?: boolean; compact?: boolean; aspect?: string; captions?: CaptionTrack[]; maxHeight?: string; fileHref?: string }

export const InlinePlayer = forwardRef<PlayerHandle, InlinePlayerProps>(function InlinePlayer({ src, poster, fps, title, sync, className, muted, compact, aspect, captions, maxHeight, fileHref }, ref) {
  const T = useT();
  const c = usePlayerCore({ src, fps, sync, muted, aspect });
  const [awake, setAwake] = useState(true);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useImperativeHandle(ref, () => ({ play: c.play, pause: c.pause, seek: c.seek, el: () => c.video.current }), [c.play, c.pause, c.seek, c.video]);
  const wake = useCallback(() => { setAwake(true); if (idle.current) clearTimeout(idle.current); idle.current = setTimeout(() => setAwake(false), 2500); }, []);
  useEffect(() => () => { if (idle.current) clearTimeout(idle.current); }, []);
  const keys = useShortcutScope(coreKeys(c));
  const show = !c.playing || awake;
  const box = c.full ? undefined : { aspectRatio: c.ratio ?? '16 / 9', maxBlockSize: maxHeight ?? (compact ? '40vh' : '70vh') };
  return (
    <div ref={c.wrap} className={cls('iplayer vplayer', className)} data-awake={show || undefined} data-full={c.full || undefined} tabIndex={0} role="group" aria-label={title ?? T('player.video')}
      onKeyDown={(e) => { wake(); keys(e); }} onPointerMove={wake} onPointerDown={wake} onFocus={wake}>
      <div className="iplayer-box" style={box}>
        <video {...c.videoProps} poster={poster} className="pvideo" onClick={c.toggle}>
          {captions?.map((x) => <track key={x.src} kind="captions" src={x.src} srcLang={x.lang} label={x.label} />)}
        </video>
        {c.failed ? <MediaFailure onRetry={c.retry} fileHref={fileHref ?? src} />
          : !c.started && <button type="button" className="pdisc iplayer-start" data-size={56} data-tone="chip" aria-hidden tabIndex={-1} onClick={c.toggle}><IconPlay className="pdisc-play" /></button>}
      </div>
      <div className="iplayer-controls" dir="ltr" role="group" aria-label={T('media.player.transport')}>
        <SeekBar time={c.time} duration={c.duration} step={c.frame} onSeek={c.seek} label={T('misc.seek')} tone="video" disabled={!c.ready} />
        <div className="iplayer-row">
          <button type="button" className="vbtn" aria-label={c.playing ? T('misc.pause') : T('misc.play')} onClick={c.toggle} disabled={c.failed}>{c.playing ? <IconPause aria-hidden /> : <IconPlay aria-hidden />}</button>
          {!compact && <>
            <button type="button" className="vbtn" aria-label={T('player.prevFrame')} onClick={() => c.step(-1)}><IconPrevFrame aria-hidden /></button>
            <button type="button" className="vbtn" aria-label={T('player.nextFrame')} onClick={() => c.step(1)}><IconNextFrame aria-hidden /></button>
          </>}
          <TimeReadout time={c.time} duration={c.duration} className="ptime-on-video" />
          <span className="prow-spacer" />
          <VolumeControl volume={c.volume} muted={c.muted} onVolume={c.setVolume} onMute={c.toggleMute} popover={compact} tone="on-video" />
          {(c.hasCaptions || (captions && captions.length > 0)) && <button type="button" className="vbtn" aria-label={T('player.captions')} aria-pressed={c.cc} onClick={c.toggleCc}><IconCaptions aria-hidden /></button>}
          <button type="button" className="vbtn" aria-label={c.full ? T('player.exitFullscreen') : T('player.fullscreen')} onClick={c.fullscreen}>{c.full ? <IconExitFullscreen aria-hidden /> : <IconFullscreen aria-hidden />}</button>
        </div>
      </div>
    </div>
  );
});
