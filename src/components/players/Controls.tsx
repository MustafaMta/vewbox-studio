'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cls } from '@/components/ui/kit/cls';
import { IconMuted, IconReplay, IconSound, IconWarn } from '@/components/ui/icons';
import { SeekBar, TrackButton, useTrackState, usePlayer, fmtClock, type Track } from './PlayerProvider';
import { Waveform } from './Waveform';

/** THE PLAYER PIECES (docs/design/VISUAL-STANDARD-V5.1.md §5.24) — volume, the audio row, the song player, the compact
 *  player that follows it and the line that says what a player is doing. Every audio piece drives the same shared
 *  source (PlayerProvider), so they always agree. Transports are LTR. */

/** Mute and volume: a 32 px quiet icon button, the slider beside it (or, with `popover`, behind it). */
export function VolumeControl({ volume, muted, onVolume, onMute, popover }: { volume: number; muted: boolean; onVolume: (v: number) => void; onMute: () => void; popover?: boolean; /** kept for old callers */ tone?: 'dark' | 'on-video' }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  const level = muted ? 0 : volume;
  const icon = muted || volume === 0 ? <IconMuted aria-hidden /> : <IconSound aria-hidden />;
  const slider = <input type="range" className="seek pvol-slider" data-tone="docked" style={{ '--p': `${level * 100}%`, '--b': '0%' } as React.CSSProperties} min={0} max={1} step={0.05} value={level} aria-label="Volume" aria-valuetext={`${Math.round(level * 100)}%`} onChange={(e) => onVolume(Number(e.target.value))} />;
  if (!popover) return (
    <div className="pvol" dir="ltr">
      <button type="button" className="pt-btn" aria-label={muted ? 'Unmute' : 'Mute'} aria-pressed={muted} onClick={onMute}>{icon}</button>
      <span className="pvol-track">{slider}</span>
    </div>
  );
  return (
    <div ref={wrap} className="pvol menu-wrap" dir="ltr">
      <button type="button" className="pt-btn" aria-label="Volume" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>{icon}</button>
      {open && (
        <div id={id} className="menu pvol-pop" data-side="top" data-align="end" role="group" aria-label="Volume">
          <button type="button" className="pt-btn" aria-label={muted ? 'Unmute' : 'Mute'} aria-pressed={muted} onClick={onMute}>{icon}</button>
          {slider}
        </div>
      )}
    </div>
  );
}

/** Volume for the shared audio player. */
export function SharedVolume({ popover }: { popover?: boolean }) {
  const p = usePlayer();
  return <VolumeControl volume={p.volume} muted={p.muted} onVolume={p.setVolume} onMute={p.toggleMute} popover={popover} />;
}

/** A line under a player saying what is happening when it is not simply playing: loading, blocked, failed. */
export function PlayerNotice({ track, idleText }: { track: Track | null; idleText?: ReactNode }) {
  const st = useTrackState(track);
  if (!track) return idleText ? <p className="pnotice">{idleText}</p> : null;
  if (st.error) return <p role="alert" className="pnotice" data-tone="bad"><IconWarn aria-hidden />{st.error}</p>;
  if (st.notice) return <p role="status" className="pnotice" data-tone="wait">{st.notice}</p>;
  if (st.loading) return <p role="status" className="pnotice">Loading the file…</p>;
  return null;
}

/** THE AUDIO ROW (§5.24): 64 high, surface-1, radius 14, padding 12 — the 40 px play (primary fill), the title 14/20
 *  500 and a meta line 12/16 text-3, the waveform 32 high (2 px bars, 2 px gaps; played text-1, unplayed #3A3A3A; click
 *  or the arrow keys seek), and the time in mono 12 text-3. `waveform={false}` draws the seek track instead. */
export function AudioRow({ track, meta, waveform = true, className }: { track: Track; meta?: ReactNode; waveform?: boolean; className?: string }) {
  const p = usePlayer();
  const st = useTrackState(track);
  const progress = st.duration ? st.time / st.duration : 0;
  const seekTo = (f: number) => { const t = f * (st.duration || 0); if (st.mine) p.seek(t); else p.play(track, t); };
  return (
    <div className={cls('arow', className)} role="group" aria-label={track.title} dir="ltr">
      <TrackButton track={track} primary labelPlay={`Play ${track.title}`} labelPause={`Pause ${track.title}`} />
      <span className="arow-words">
        <span className="arow-title"><bdi>{track.title}</bdi></span>
        {(meta ?? track.subtitle) && <span className="arow-meta">{meta ?? track.subtitle}</span>}
      </span>
      {waveform
        ? <Waveform src={track.src} progress={progress} onSeek={seekTo} height={32} pitch={4} className="arow-wave" label={`Seek ${track.title}`} unavailableText="No waveform for this file" duration={st.duration} showLabel={false} />
        : <SeekBar track={track} className="arow-wave" label={`Seek ${track.title}`} showTimes={false} />}
      <span className="arow-time" title={st.provisional ? 'Length from the record; confirmed when the file loads' : undefined}>{fmtClock(st.time)} / {st.provisional ? '~' : ''}{fmtClock(st.duration)}</span>
    </div>
  );
}

/** A one-line player for a file (a song upload, an audio asset) through the shared source: the audio row. */
export function AudioPlayer({ src, title, duration, className = '', meta, waveform }: { src: string; title?: string; duration?: number; className?: string; meta?: ReactNode; waveform?: boolean }) {
  const track: Track = { id: `file-${src}`, src, title: title ?? 'Audio', duration };
  return <AudioRow track={track} meta={meta} waveform={waveform} className={className} />;
}

/** THE SONG PLAYER — the cover, the song and who sings it, the transport, a seek bar with elapsed and total time,
 *  replay and volume. With no track it says why, and plays nothing. */
export function SongPlayer({ track, title, performer, artworkSrc, action, className = '' }: { track: Track | null; title: string; performer: string; artworkSrc?: string; action?: ReactNode; className?: string }) {
  const p = usePlayer();
  return (
    <div className={cls('card splayer', className)} role="group" aria-label={`Song: ${title}`}>
      <div className="splayer-art">{/* eslint-disable-next-line @next/next/no-img-element */}{artworkSrc ? <img src={artworkSrc} alt="" /> : null}</div>
      <div className="splayer-words">
        <p className="splayer-title"><bdi>{title}</bdi></p>
        <p className="splayer-meta"><bdi>{performer}</bdi></p>
        <PlayerNotice track={track} idleText="No audio yet. The song plays once a track exists." />
      </div>
      {action && <div className="splayer-action">{action}</div>}
      {track ? (
        <div className="splayer-transport" dir="ltr">
          <button type="button" className="pt-btn" aria-label="Replay" onClick={() => p.replay(track)}><IconReplay aria-hidden /></button>
          <TrackButton track={track} primary />
          <SeekBar track={track} className="splayer-seek" label="Seek" />
          <SharedVolume popover />
        </div>
      ) : null}
    </div>
  );
}

/** The compact player: shown once the full player has scrolled away, for the same track, from the same state. */
export function MiniPlayer({ track, show }: { track: Track; show: boolean }) {
  const st = useTrackState(track);
  if (!show || !st.mine) return null;
  return (
    <div className="miniplayer" role="region" aria-label="Player">
      <div className="miniplayer-bar animate-rise" dir="ltr">
        <div className="miniplayer-art">{/* eslint-disable-next-line @next/next/no-img-element */}{track.artworkSrc ? <img src={track.artworkSrc} alt="" /> : null}</div>
        <div className="miniplayer-words"><p className="splayer-title"><bdi>{track.title}</bdi></p>{track.subtitle && <p className="splayer-meta"><bdi>{track.subtitle}</bdi></p>}</div>
        <TrackButton track={track} size="sm" />
        <SeekBar track={track} className="splayer-seek" label="Seek" />
        <SharedVolume popover />
      </div>
    </div>
  );
}

export { fmtClock };
