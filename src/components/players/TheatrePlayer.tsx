'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type CSSProperties } from 'react';
import { cls } from '@/components/ui/kit';
import { IconCaptions, IconExitFullscreen, IconFullscreen, IconPause, IconPlay } from '@/components/ui/icons';
import { VolumeControl } from './Controls';
import type { CaptionTrack, PlayerHandle } from './InlinePlayer';
import { coreKeys, MediaFailure, SeekBar, TimeReadout, usePlayerCore } from './PlayerCore';
import { fmtClock } from './time';
import { useShortcutScope } from './useShortcutScope';

/** THE THEATRE PLAYER (docs/DESIGN-SYSTEM-V4.md §2.3, §5.12, §6.15) — the cut at its native ratio on the black
 *  surround, at most 76vh. The overlay transport sits on `rgb(0 0 0 / .55)` with a 12 px backdrop blur: the ONLY blur
 *  in the product (§1.5), and solid `--chip-on-art` under `prefers-reduced-transparency`. Notes appear as light ticks on
 *  the seek bar. Lights down: while playing, after 2 s idle, the transport fades and `onLights(true)` lets the page dim
 *  everything above the player; any pointer movement or focus brings them back (`onLights(false)`). Instant under
 *  reduced motion (the global rule). The transport is LTR. */

export const TheatrePlayer = forwardRef<PlayerHandle, { src: string; poster?: string; fps?: number | null; title?: string; captions?: CaptionTrack[]; notes?: Array<{ at: number; text: string }>; onAddNote?: (t: number) => void; onLights?: (down: boolean) => void; fileHref?: string; className?: string }>(
  function TheatrePlayer({ src, poster, fps, title, captions, notes, onAddNote, onLights, fileHref, className }, ref) {
    const c = usePlayerCore({ src, fps });
    const [down, setDown] = useState(false);
    const [solid, setSolid] = useState(false);
    const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
    useImperativeHandle(ref, () => ({ play: c.play, pause: c.pause, seek: c.seek, el: () => c.video.current }), [c.play, c.pause, c.seek, c.video]);
    useEffect(() => { try { setSolid(window.matchMedia('(prefers-reduced-transparency: reduce)').matches); } catch { /* unknown: keep the glass */ } }, []);
    const lights = useCallback((d: boolean) => { setDown((x) => { if (x !== d) onLights?.(d); return d; }); }, [onLights]);
    const wake = useCallback(() => {
      lights(false);
      if (idle.current) clearTimeout(idle.current);
      idle.current = setTimeout(() => { if (c.video.current && !c.video.current.paused && !c.wrap.current?.matches(':focus-visible, :has(:focus-visible)')) lights(true); }, 2000);
    }, [lights, c.video, c.wrap]);
    useEffect(() => { if (c.playing) wake(); else { if (idle.current) clearTimeout(idle.current); lights(false); } }, [c.playing, wake, lights]);
    useEffect(() => () => { if (idle.current) clearTimeout(idle.current); }, []);
    const keys = useShortcutScope(coreKeys(c, onAddNote ? { n: () => onAddNote(c.time) } : {}));
    // the one blur of the product, applied here only (scripts/v4-lint.mjs allows backdrop-filter in this file alone)
    const glass: CSSProperties | undefined = solid ? undefined : { backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' };
    return (
      <div ref={c.wrap} className={cls('tplayer', className)} data-lights={down ? 'down' : 'up'} data-solid={solid || undefined} tabIndex={0} role="group" aria-label={title ?? 'Video'}
        onKeyDown={(e) => { wake(); keys(e); }} onPointerMove={wake} onPointerDown={wake} onFocus={wake}>
        <div className="tplayer-box" style={c.full ? undefined : { aspectRatio: c.ratio ?? '16 / 9' }}>
          <video {...c.videoProps} poster={poster} className="pvideo" onClick={c.toggle}>
            {captions?.map((x) => <track key={x.src} kind="captions" src={x.src} srcLang={x.lang} label={x.label} />)}
          </video>
          {c.failed && <MediaFailure onRetry={c.retry} fileHref={fileHref ?? src} />}
        </div>
        <div className="tplayer-transport" style={glass} dir="ltr" role="group" aria-label={'Playback controls'}>
          <SeekBar time={c.time} duration={c.duration} step={c.frame} onSeek={c.seek} label={'Seek'} tone="video" disabled={!c.ready}
            ticks={notes?.map((n) => ({ at: n.at, label: n.text, kind: 'note' as const }))} />
          {notes && notes.length > 0 && <span className="sr-only">{'Notes on the timeline'}: {notes.map((n) => `${fmtClock(n.at)} ${n.text}`).join('; ')}</span>}
          <div className="iplayer-row">
            <button type="button" className="vbtn" aria-label={c.playing ? 'Pause' : 'Play'} onClick={c.toggle} disabled={c.failed}>{c.playing ? <IconPause aria-hidden /> : <IconPlay aria-hidden />}</button>
            <TimeReadout time={c.time} duration={c.duration} className="ptime-on-video" />
            <span className="prow-spacer" />
            <VolumeControl volume={c.volume} muted={c.muted} onVolume={c.setVolume} onMute={c.toggleMute} tone="on-video" />
            {(c.hasCaptions || (captions && captions.length > 0)) && <button type="button" className="vbtn" aria-label={'Captions'} aria-pressed={c.cc} onClick={c.toggleCc}><IconCaptions aria-hidden /></button>}
            <button type="button" className="vbtn" aria-label={c.full ? 'Exit fullscreen' : 'Fullscreen'} onClick={c.fullscreen}>{c.full ? <IconExitFullscreen aria-hidden /> : <IconFullscreen aria-hidden />}</button>
          </div>
        </div>
      </div>
    );
  },
);
