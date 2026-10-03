'use client';

import { useCallback, useRef, type CSSProperties } from 'react';
import { Captions, Crosshair, FastForward, Maximize2, Minimize2, Pause, Play, Rewind } from 'lucide-react';
import type { CutNote } from '@/domain/types';
import { VolumeControl } from '@/components/players/Controls';
import { MediaFailure, SeekBar, coreKeys, type PlayerCore } from '@/components/players/PlayerCore';
import { useShortcutScope } from '@/components/players/useShortcutScope';
import { clock, type CutView } from './model';

/** THE THEATRE (docs/DESIGN-SYSTEM-V5.md §5.13 "Theatre transport", §8.12) — the cut at its native ratio on the black
 *  surround, never larger than the screen allows, with the transport DOCKED UNDER THE PICTURE: it is always visible and
 *  never covers the frame or its captions (soft English captions from the cut's own VTT sidecar, or the words burned
 *  into an export). Nothing is drawn over the frame except a note's pin. The transport: play, ±5 s, the time, the seek
 *  bar with the shot marks and the note ticks, English subtitles, volume and fullscreen; it stays LTR.
 *
 *  Keyboard, while focus is in the theatre (single keys obey the shortcut preference): Space/K play · J/L ±5 s ·
 *  ←/→ one frame · Shift+←/→ one second · Home/End · M mute · S subtitles · F fullscreen · C a note at this time ·
 *  [ ] the previous / next shot.
 *
 *  This is a page-local composition of the shared player core (src/components/players): the docked theatre chrome is
 *  being lifted into the kit; once it lands this wrapper is replaced by it. */

export interface PinView { note: CutNote; n: number }

export function Theatre({ core: c, cut, title, pins, activeId, onSelectNote, pinMode, draftPin, onPlacePin, onNote, onShot }: {
  core: PlayerCore;
  cut: CutView;
  title: string;
  /** the pinned notes of this cut, numbered as the notes list numbers them */
  pins: PinView[];
  activeId: string | null;
  onSelectNote: (id: string) => void;
  /** the composer asked for a pin: the next click on the frame places it instead of playing */
  pinMode: boolean;
  draftPin: { x: number; y: number } | null;
  onPlacePin: (p: { x: number; y: number }) => void;
  onNote: () => void;
  onShot: (dir: -1 | 1) => void;
}) {
  const pic = useRef<HTMLDivElement>(null);
  const keys = useShortcutScope(coreKeys(c, { c: () => onNote(), s: () => { if (c.hasCaptions) c.toggleCc(); }, '[': () => onShot(-1), ']': () => onShot(1) }), { scope: 'theatre' });

  const place = useCallback((e: React.MouseEvent) => {
    const r = pic.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const round = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
    onPlacePin({ x: round((e.clientX - r.left) / r.width), y: round((e.clientY - r.top) / r.height) });
  }, [onPlacePin]);

  // a pin shows while the playhead is on its note (± 1.5 s, or inside its range) and while its note is selected
  const near = (n: CutNote) => n.id === activeId || (c.time >= n.timecode - 1.5 && c.time <= Math.max(n.rangeEnd ?? n.timecode, n.timecode) + 1.5);
  const ticks = [
    ...cut.timeline.filter((s) => s.start > 0).map((s) => ({ at: s.start, label: `Shot ${s.label}`, kind: 'mark' as const })),
    ...pins.map(({ note }) => ({ at: note.timecode, label: note.text, kind: 'note' as const })),
  ];
  const style = { '--tw': cut.width, '--th': cut.height } as CSSProperties;

  return (
    <div ref={c.wrap} className="theatre-stage" style={style} data-full={c.full || undefined} data-pinning={pinMode || undefined}
      tabIndex={0} role="group" aria-label={`${title}, cut ${cut.version.version}`} onKeyDown={keys}>
      <div ref={pic} className="theatre-pic">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- the English track is below when the cut has one */}
        <video {...c.videoProps} poster={cut.poster} className="theatre-video" onClick={c.toggle} aria-label={`${title}, cut ${cut.version.version}`}>
          {cut.captions.map((t) => <track key={t.src} kind="subtitles" src={t.src} srcLang={t.lang} label={t.label} />)}
        </video>
        {pinMode && <button type="button" className="theatre-pinlayer" aria-label="Place the pin here (click on the frame)" onClick={place} />}
        <div className="theatre-pins">
          {pins.filter((p) => p.note.pin && near(p.note)).map(({ note, n }) => (
            <button key={note.id} type="button" className="theatre-pin" data-active={note.id === activeId || undefined} data-resolved={note.status === 'resolved' || undefined}
              style={{ insetInlineStart: `${note.pin!.x * 100}%`, insetBlockStart: `${note.pin!.y * 100}%` }}
              aria-label={`Note ${n} at ${clock(note.timecode)}: ${note.text}`} onClick={() => onSelectNote(note.id)}>{n}</button>
          ))}
          {draftPin && <span className="theatre-pin" data-draft style={{ insetInlineStart: `${draftPin.x * 100}%`, insetBlockStart: `${draftPin.y * 100}%` }} aria-hidden><Crosshair /></span>}
        </div>
        {c.failed && <MediaFailure onRetry={c.retry} fileHref={cut.src} />}
      </div>

      <div className="theatre-transport" dir="ltr" role="group" aria-label="Transport">
        <button type="button" className="btn btn-primary btn-icon theatre-play" aria-label={c.playing ? 'Pause' : 'Play'} onClick={c.toggle} disabled={c.failed}>
          {c.playing ? <Pause aria-hidden /> : <Play aria-hidden />}
        </button>
        <button type="button" className="btn btn-quiet btn-icon btn-sm theatre-wide" aria-label="Back 5 seconds" onClick={() => c.nudge(-5)} disabled={!c.ready}><Rewind aria-hidden /></button>
        <button type="button" className="btn btn-quiet btn-icon btn-sm theatre-wide" aria-label="Forward 5 seconds" onClick={() => c.nudge(5)} disabled={!c.ready}><FastForward aria-hidden /></button>
        <span className="theatre-time t-ro" aria-hidden>{clock(c.time)}<span className="theatre-time-total"> / {clock(c.duration || cut.duration)}</span></span>
        <SeekBar time={c.time} duration={c.duration} step={c.frame} onSeek={c.seek} label="Seek" tone="video" disabled={!c.ready} ticks={ticks} className="theatre-seek" />
        {cut.captions.length > 0 && (
          <button type="button" className="btn btn-quiet btn-sm theatre-cc" aria-pressed={c.cc} aria-label="English subtitles" onClick={c.toggleCc} disabled={!c.hasCaptions}>
            <Captions aria-hidden /><span className="t-ro" aria-hidden>EN</span>
          </button>
        )}
        <span className="theatre-wide"><VolumeControl volume={c.volume} muted={c.muted} onVolume={c.setVolume} onMute={c.toggleMute} popover /></span>
        <button type="button" className="btn btn-quiet btn-icon btn-sm" aria-label={c.full ? 'Exit full screen' : 'Full screen'} onClick={c.fullscreen}>{c.full ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}</button>
      </div>
    </div>
  );
}
