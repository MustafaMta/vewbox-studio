'use client';

import { forwardRef, useImperativeHandle, useState } from 'react';
import { cls } from '@/components/ui/kit';
import { IconAddNote, IconBack5, IconFit, IconForward5, IconNextFrame, IconPause, IconPlay, IconPrevFrame } from '@/components/ui/icons';
import { VolumeControl } from './Controls';
import type { PlayerHandle } from './InlinePlayer';
import { coreKeys, MediaFailure, SeekBar, usePlayerCore } from './PlayerCore';
import type { SyncBus } from './sync';
import { timecode } from './time';
import { useShortcutScope } from './useShortcutScope';

/** THE CANVAS PLAYER (docs/DESIGN-SYSTEM-V4.md §5.12) — the cutting-room shell: the clip at its native ratio on the
 *  achromatic `--canvas`, radius 0, letterboxed; a DOCKED transport under the frame (never over it, never hidden —
 *  the editor needs it): ‹ frame · play · frame ›, −5 s / +5 s (J/L), mark in / mark out (I/O), the timecode in `.tc`,
 *  volume and zoom-to-fit. The seek fill is iris on `--ink-700`; the marked range shows on the track. The transport
 *  is LTR. `onAddNote` (N) appears only when timecoded notes exist in the backend (B2). */

export interface Marks { in?: number; out?: number }

export const CanvasPlayer = forwardRef<PlayerHandle, { src: string; poster?: string; fps?: number | null; title?: string; sync?: SyncBus; aspect?: string; marks?: Marks; onMarks?: (m: Marks) => void; onAddNote?: (t: number) => void; fileHref?: string; className?: string }>(
  function CanvasPlayer({ src, poster, fps, title, sync, aspect, marks: given, onMarks, onAddNote, fileHref, className }, ref) {
    const c = usePlayerCore({ src, fps, sync, aspect });
    const [own, setOwn] = useState<Marks>({});
    const [zoom, setZoom] = useState<'fit' | 'actual'>('fit');
    const marks = given ?? own;
    const setMarks = (m: Marks) => { if (onMarks) onMarks(m); else setOwn(m); };
    const markIn = () => setMarks({ ...marks, in: c.time, out: marks.out !== undefined && marks.out < c.time ? undefined : marks.out });
    const markOut = () => setMarks({ ...marks, out: c.time, in: marks.in !== undefined && marks.in > c.time ? undefined : marks.in });
    useImperativeHandle(ref, () => ({ play: c.play, pause: c.pause, seek: c.seek, el: () => c.video.current }), [c.play, c.pause, c.seek, c.video]);
    const keys = useShortcutScope(coreKeys(c, { k: () => c.pause(), i: markIn, o: markOut, ...(onAddNote ? { n: () => onAddNote(c.time) } : {}) }));
    const fps0 = fps && fps > 0 ? fps : 24;
    const ticks = [marks.in, marks.out].filter((x): x is number => x !== undefined).map((at) => ({ at, kind: 'mark' as const }));
    return (
      <div ref={c.wrap} className={cls('cplayer', className)} tabIndex={0} role="group" aria-label={title ?? 'Video'} onKeyDown={keys}>
        <div className="cplayer-canvas canvas" data-zoom={zoom}>
          <div className="cplayer-box" style={zoom === 'fit' ? ({ '--cp-ratio': c.ratio ?? '16 / 9' } as React.CSSProperties) : c.natural ? { inlineSize: `${c.natural.w}px`, aspectRatio: c.ratio } : undefined}>
            <video {...c.videoProps} poster={poster} className="pvideo" onClick={c.toggle} />
            {c.failed && <MediaFailure onRetry={c.retry} fileHref={fileHref ?? src} />}
          </div>
        </div>
        <div className="cplayer-bar" dir="ltr" role="group" aria-label={'Playback controls'}>
          <SeekBar time={c.time} duration={c.duration} step={c.frame} onSeek={c.seek} label={'Seek'} tone="edit" disabled={!c.ready} ticks={ticks} range={marks.in !== undefined || marks.out !== undefined ? { from: marks.in, to: marks.out } : undefined} />
          <div className="cplayer-row">
            <div className="cplayer-group">
              <button type="button" className="ebtn ebtn-icon" aria-label={'Previous frame'} onClick={() => c.step(-1)}><IconPrevFrame aria-hidden /></button>
              <button type="button" className="ebtn ebtn-icon ebtn-play" aria-label={c.playing ? 'Pause' : 'Play'} onClick={c.toggle} disabled={c.failed}>{c.playing ? <IconPause aria-hidden /> : <IconPlay aria-hidden />}</button>
              <button type="button" className="ebtn ebtn-icon" aria-label={'Next frame'} onClick={() => c.step(1)}><IconNextFrame aria-hidden /></button>
            </div>
            <div className="cplayer-group">
              <button type="button" className="ebtn ebtn-icon" aria-label={'Back 5 seconds'} onClick={() => c.nudge(-5)}><IconBack5 aria-hidden /></button>
              <button type="button" className="ebtn ebtn-icon" aria-label={'Forward 5 seconds'} onClick={() => c.nudge(5)}><IconForward5 aria-hidden /></button>
            </div>
            <div className="cplayer-group">
              <button type="button" className="ebtn" aria-pressed={marks.in !== undefined} onClick={markIn}>Mark in</button>
              <button type="button" className="ebtn" aria-pressed={marks.out !== undefined} onClick={markOut}>Mark out</button>
              {(marks.in !== undefined || marks.out !== undefined) && <button type="button" className="ebtn ebtn-quiet" onClick={() => setMarks({})}>Clear marks</button>}
            </div>
            <span className="tc cplayer-tc" aria-label={'Timecode'} role="timer">{timecode(c.time, fps0)}<span className="cplayer-tc-total"> / {timecode(c.duration, fps0)}</span></span>
            <span className="prow-spacer" />
            {onAddNote && <button type="button" className="ebtn" onClick={() => onAddNote(c.time)}><IconAddNote aria-hidden />Add a note at the playhead</button>}
            <VolumeControl volume={c.volume} muted={c.muted} onVolume={c.setVolume} onMute={c.toggleMute} popover />
            <button type="button" className="ebtn" onClick={() => setZoom(zoom === 'fit' ? 'actual' : 'fit')}><IconFit aria-hidden />{zoom === 'fit' ? 'Actual size' : 'Fit'}</button>
          </div>
        </div>
      </div>
    );
  },
);
