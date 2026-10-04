'use client';

import { forwardRef, useCallback } from 'react';
import { Crosshair } from 'lucide-react';
import type { CutNote } from '@/domain/types';
import { IconBack5, IconForward5 } from '@/components/ui/icons';
import { InlinePlayer, type PlayerHandle } from '@/components/players/InlinePlayer';
import type { PlayerCore } from '@/components/players/PlayerCore';
import { clock, type CutView } from './model';

/** THE THEATRE (docs/DESIGN-SYSTEM-V5.md §5.13 "Theatre transport", §8.12) — the kit's InlinePlayer in its theatre
 *  mode (the cut at its native ratio on black, the transport docked under the picture: it never covers the frame or
 *  its captions), with what only the Screening Room adds:
 *    - the note pins, the one thing drawn over the frame (the `overlay` slot), and the click that places a new pin;
 *    - the shot marks and note ticks on the seek bar (`ticks`);
 *    - ±5 s and the subtitles' language readout in the dock (`transportStart` / `transportEnd`);
 *    - the keys C (a note at this time), S (subtitles) and [ ] (the previous / next shot), over the player's own
 *      Space/K, J/L, arrows, Home/End, M and F (single keys obey the shortcut preference). */

export interface PinView { note: CutNote; n: number }

/** Where the picture really is inside the player's box (the video is letterboxed when the box is capped), in % of the
 *  box: pins are placed and drawn relative to the picture, never to the black bars. */
function pictureRect(c: PlayerCore): { left: number; top: number; width: number; height: number } {
  const v = c.video.current;
  const box = v?.parentElement?.getBoundingClientRect();
  if (!v || !box || !v.videoWidth || !v.videoHeight || box.width === 0 || box.height === 0) return { left: 0, top: 0, width: 100, height: 100 };
  const scale = Math.min(box.width / v.videoWidth, box.height / v.videoHeight);
  const w = (v.videoWidth * scale) / box.width, h = (v.videoHeight * scale) / box.height;
  return { left: ((1 - w) / 2) * 100, top: ((1 - h) / 2) * 100, width: w * 100, height: h * 100 };
}

export const Theatre = forwardRef<PlayerHandle, {
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
  onShot: (dir: -1 | 1, c: PlayerCore) => void;
  onState: (s: { time: number; duration: number; playing: boolean }) => void;
}>(function Theatre({ cut, title, pins, activeId, onSelectNote, pinMode, draftPin, onPlacePin, onNote, onShot, onState }, ref) {
  const place = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width === 0) return;
    const round = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
    onPlacePin({ x: round((e.clientX - r.left) / r.width), y: round((e.clientY - r.top) / r.height) });
  }, [onPlacePin]);

  const ticks = [
    ...cut.timeline.filter((s) => s.start > 0).map((s) => ({ at: s.start, label: `Shot ${s.label}`, kind: 'mark' as const })),
    ...pins.map(({ note }) => ({ at: note.timecode, label: note.text, kind: 'note' as const })),
  ];
  // a pin shows while the playhead is on its note (± 1.5 s, or inside its range) and while its note is selected
  const near = (n: CutNote, t: number) => n.id === activeId || (t >= n.timecode - 1.5 && t <= Math.max(n.rangeEnd ?? n.timecode, n.timecode) + 1.5);

  return (
    <div className="theatre-stage" data-pinning={pinMode || undefined}>
      <InlinePlayer ref={ref} theatre src={cut.src} poster={cut.poster} fps={24} aspect={`${cut.width} / ${cut.height}`} title={`${title}, cut ${cut.version.version}`}
        captions={cut.captions} fileHref={cut.src} ticks={ticks} onState={onState} className="theatre-player"
        keys={(c) => ({ c: () => onNote(), s: () => { if (c.hasCaptions) c.toggleCc(); }, '[': () => onShot(-1, c), ']': () => onShot(1, c) })}
        overlay={(c) => {
          const r = pictureRect(c);
          return (
            <div className="theatre-pins" style={{ insetInlineStart: `${r.left}%`, insetBlockStart: `${r.top}%`, inlineSize: `${r.width}%`, blockSize: `${r.height}%` }}>
              {pinMode && <button type="button" className="theatre-pinlayer" aria-label="Place the pin here (click on the frame)" onClick={place} />}
              {pins.filter((p) => p.note.pin && near(p.note, c.time)).map(({ note, n }) => (
                <button key={note.id} type="button" className="theatre-pin" data-active={note.id === activeId || undefined} data-resolved={note.status === 'resolved' || undefined}
                  style={{ insetInlineStart: `${note.pin!.x * 100}%`, insetBlockStart: `${note.pin!.y * 100}%` }}
                  aria-label={`Note ${n} at ${clock(note.timecode)}: ${note.text}`} onClick={() => onSelectNote(note.id)}>{n}</button>
              ))}
              {draftPin && <span className="theatre-pin" data-draft style={{ insetInlineStart: `${draftPin.x * 100}%`, insetBlockStart: `${draftPin.y * 100}%` }} aria-hidden><Crosshair /></span>}
            </div>
          );
        }}
        transportStart={(c) => (
          <span className="theatre-wide">
            <button type="button" className="pt-btn" aria-label="Back 5 seconds" onClick={() => c.nudge(-5)} disabled={!c.ready}><IconBack5 aria-hidden /></button>
            <button type="button" className="pt-btn" aria-label="Forward 5 seconds" onClick={() => c.nudge(5)} disabled={!c.ready}><IconForward5 aria-hidden /></button>
          </span>
        )}
        transportEnd={cut.captions.length > 0 ? (c) => <span className="t-ro theatre-cc" title="Subtitles: English" data-on={c.cc || undefined}>EN</span> : undefined} />
    </div>
  );
});
