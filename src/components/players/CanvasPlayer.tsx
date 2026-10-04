'use client';

import { forwardRef, useImperativeHandle, useState } from 'react';
import { cls } from '@/components/ui/kit/cls';
import { IconAddNote, IconBack5, IconClose, IconFit, IconForward5, IconNextFrame, IconPause, IconPlay, IconPrevFrame } from '@/components/ui/icons';
import { VolumeControl } from './Controls';
import type { PlayerHandle } from './InlinePlayer';
import { coreKeys, handleOf, MediaFailure, SeekBar, usePlayerCore } from './PlayerCore';
import type { SyncBus } from './sync';
import { timecode } from './time';
import { useShortcutScope } from './useShortcutScope';

/** THE CANVAS PLAYER (the cutting room; VISUAL-STANDARD-V5.1 §5.24 transport, v5 §5.13 behaviour) — the clip at its
 *  native ratio on the achromatic canvas, radius 0, letterboxed, and the same DOCKED transport as the lobby player
 *  under it (52 high, surface-1, never over the picture, never hidden): ‹ frame · play · frame › · the timecode in
 *  mono · the seek track (the marked range on it) · −5 s / +5 s · mark in / mark out (I/O) and Clear · Add a note (N,
 *  when notes exist) · volume · fit / actual size. 32 px quiet icon buttons, 36 px play. Below 768 px the seek track
 *  takes its own row above the buttons. The transport is LTR. */

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
    useImperativeHandle(ref, () => handleOf(c), [c]);
    const keys = useShortcutScope(coreKeys(c, { k: () => c.pause(), i: markIn, o: markOut, ...(onAddNote ? { n: () => onAddNote(c.time) } : {}) }));
    const fps0 = fps && fps > 0 ? fps : 24;
    const ticks = [marks.in, marks.out].filter((x): x is number => x !== undefined).map((at) => ({ at, kind: 'mark' as const }));
    const marked = marks.in !== undefined || marks.out !== undefined;
    return (
      <div ref={c.wrap} className={cls('cplayer', className)} tabIndex={0} role="group" aria-label={title ?? 'Video'} onKeyDown={keys}>
        <div className="cplayer-canvas canvas" data-zoom={zoom}>
          <div className="cplayer-box" style={zoom === 'fit' ? ({ '--cp-ratio': c.ratio ?? '16 / 9' } as React.CSSProperties) : c.natural ? { inlineSize: `${c.natural.w}px`, aspectRatio: c.ratio } : undefined}>
            <video {...c.videoProps} poster={poster} className="pvideo" onClick={c.toggle} />
            {c.failed && <MediaFailure onRetry={c.retry} fileHref={fileHref ?? src} />}
          </div>
        </div>
        <div className="ptransport ptransport-edit" dir="ltr" role="group" aria-label="Playback controls">
          <span className="pt-group">
            <button type="button" className="pt-btn" aria-label="Previous frame" onClick={() => c.step(-1)}><IconPrevFrame aria-hidden /></button>
            <button type="button" className="pt-play" aria-label={c.playing ? 'Pause' : 'Play'} onClick={c.toggle} disabled={c.failed}>{c.playing ? <IconPause aria-hidden /> : <IconPlay aria-hidden />}</button>
            <button type="button" className="pt-btn" aria-label="Next frame" onClick={() => c.step(1)}><IconNextFrame aria-hidden /></button>
          </span>
          <span className="ptime pt-tc" aria-label="Timecode" role="timer">{timecode(c.time, fps0)}<span className="pt-tc-total"> / {timecode(c.duration, fps0)}</span></span>
          <SeekBar time={c.time} duration={c.duration} buffered={c.buffered} step={c.frame} onSeek={c.seek} label="Seek" tone="docked" disabled={!c.ready} ticks={ticks} range={marked ? { from: marks.in, to: marks.out } : undefined} className="pt-seek" />
          <span className="pt-group pt-nudge">
            <button type="button" className="pt-btn" aria-label="Back 5 seconds" onClick={() => c.nudge(-5)}><IconBack5 aria-hidden /></button>
            <button type="button" className="pt-btn" aria-label="Forward 5 seconds" onClick={() => c.nudge(5)}><IconForward5 aria-hidden /></button>
          </span>
          <span className="pt-group">
            <button type="button" className="btn btn-quiet btn-sm pt-mark" aria-label="Mark in" aria-pressed={marks.in !== undefined} onClick={markIn}>In</button>
            <button type="button" className="btn btn-quiet btn-sm pt-mark" aria-label="Mark out" aria-pressed={marks.out !== undefined} onClick={markOut}>Out</button>
            {marked && <button type="button" className="pt-btn" aria-label="Clear marks" onClick={() => setMarks({})}><IconClose aria-hidden /></button>}
          </span>
          {onAddNote && <button type="button" className="pt-btn" aria-label="Add a note at the playhead" onClick={() => onAddNote(c.time)}><IconAddNote aria-hidden /></button>}
          <VolumeControl volume={c.volume} muted={c.muted} onVolume={c.setVolume} onMute={c.toggleMute} popover />
          <button type="button" className="pt-btn" aria-label={zoom === 'fit' ? 'Actual size' : 'Fit'} aria-pressed={zoom === 'actual'} onClick={() => setZoom(zoom === 'fit' ? 'actual' : 'fit')}><IconFit aria-hidden /></button>
        </div>
      </div>
    );
  },
);
