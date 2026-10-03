'use client';

import { PlayDisc } from '@/components/players/PlayDisc';
import { usePlayer, useTrackState, type Track } from '@/components/players/PlayerProvider';
import { Waveform } from '@/components/players/Waveform';
import { fmtClock } from '@/components/players/time';

/** THE AUDIO ROW (docs/design/VISUAL-STANDARD-V5.1.md §5.24) — TEMPORARY page-local wrapper over the existing player
 *  parts (PlayDisc, Waveform, the studio's one audio source) until the Design System Engineer's shared audio row lands
 *  in the kit; then this file is deleted and the pages import the kit's. 64 high on a level-1 card: the play button
 *  (40, primary fill) · the song's title and performers · the waveform drawn from the file (32 high; it seeks) · the
 *  time in Geist Mono. Always left to right; the play glyph never mirrors. */
export function AudioRow({ track, title, meta, className }: { track: Track; title: string; meta?: string; className?: string }) {
  const p = usePlayer();
  const st = useTrackState(track);
  const progress = st.duration ? st.time / st.duration : 0;
  const problem = st.error ?? st.notice;
  return (
    <div className={['mv-audio-wrap', className].filter(Boolean).join(' ')}>
      <div className="card mv-audio" dir="ltr" role="group" aria-label={`Song: ${title}`}>
        <PlayDisc track={track} size={40} tone="ivory" labelPlay={`Play ${title}`} labelPause={`Pause ${title}`} />
        <span className="mv-audio-words">
          <span className="name t-body mv-audio-title" title={title}><bdi>{title}</bdi></span>
          {meta && <span className="name t-label mv-audio-meta"><bdi>{meta}</bdi></span>}
        </span>
        <Waveform src={track.src} progress={progress} height={32} className="mv-audio-wave" showLabel={false} label={`Seek in ${title}`}
          unavailableText="The waveform could not be drawn from this file." duration={st.duration}
          onSeek={(f) => { const t = f * (st.duration || track.duration || 0); if (st.mine) p.seek(t); else p.play(track, t); }} />
        <span className="t-ro mv-audio-time" aria-label={`${fmtClock(st.time)} of ${fmtClock(st.duration)}`}>{fmtClock(st.time)} / {fmtClock(st.duration)}</span>
      </div>
      <p className="t-meta mv-audio-note" role="status">{problem ?? ''}</p>
    </div>
  );
}
