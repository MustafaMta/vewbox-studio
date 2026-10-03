'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { IconPause, IconPlay } from '@/components/ui/icons';
import { claimPlayback, fmtClock, onOtherPlayback, readVolume, writeVolume } from './coordinator';

export { fmtClock };

/** ONE AUDIO SOURCE FOR THE STUDIO — a single <audio> element plays songs, voice lines and files. The song header,
 *  the compact player, a lyric section, a voice preview and a library card all drive it, so their state can never
 *  disagree and two sounds never overlap. A video starting pauses it (see coordinator.ts), and it pauses videos.
 *
 *  A track may carry a `duration` known from its record; that is shown as provisional until the file's own metadata
 *  arrives, and the file's figure then wins. Loading, unavailable files and playback errors are states, not silence. */

export interface Track { id: string; src: string; title: string; subtitle?: string; artworkSrc?: string; /** From the record; provisional until the file loads. */ duration?: number }
export type PlayerStatus = 'idle' | 'loading' | 'ready' | 'error';

interface Api {
  current: Track | null;
  playing: boolean;
  status: PlayerStatus;
  /** Why playback failed, in words. */
  error: string | null;
  time: number;
  /** The file's own duration, 0 until its metadata has loaded. */
  duration: number;
  volume: number;
  muted: boolean;
  /** Start (or resume) a track; with `at`, from that second. */
  play: (track: Track, at?: number) => void;
  pause: () => void;
  /** Play/pause this track; a different track replaces the current one. */
  toggle: (track: Track) => void;
  seek: (t: number) => void;
  /** From the start. */
  replay: (track: Track) => void;
  stop: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
}

const Ctx = createContext<Api | null>(null);
const OWNER = 'studio-audio';

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [current, setCurrent] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState<PlayerStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [{ volume, muted }, setVol] = useState({ volume: 0.9, muted: false });
  const currentRef = useRef<Track | null>(null); currentRef.current = current;
  const pendingSeek = useRef<number | null>(null);

  useEffect(() => { const v = readVolume(); setVol(v); if (audio.current) { audio.current.volume = v.volume; audio.current.muted = v.muted; } }, []);
  useEffect(() => onOtherPlayback(OWNER, () => audio.current?.pause()), []);

  const start = useCallback((a: HTMLAudioElement) => {
    claimPlayback(OWNER);
    void a.play().catch((e: unknown) => {
      setPlaying(false);
      const name = (e as { name?: string })?.name;
      if (name === 'NotAllowedError') setError('The browser blocked playback. Press play again.');
      else if (name !== 'AbortError') { setStatus('error'); setError('This file could not be played.'); }
    });
  }, []);

  const play = useCallback((track: Track, at?: number) => {
    const a = audio.current; if (!a) return;
    const cur = currentRef.current;
    if (!cur || cur.id !== track.id || cur.src !== track.src) {
      a.src = track.src; setCurrent(track); setTime(at ?? 0); setDuration(0); setStatus('loading'); setError(null);
    }
    if (at !== undefined) { try { a.currentTime = at; } catch { /* before metadata: applied on load */ } setTime(at); pendingSeek.current = at; }
    start(a);
  }, [start]);
  const pause = useCallback(() => audio.current?.pause(), []);
  const toggle = useCallback((track: Track) => { const cur = currentRef.current; if (cur?.id === track.id && cur.src === track.src && !audio.current?.paused) pause(); else play(track); }, [play, pause]);
  const seek = useCallback((t: number) => { const a = audio.current; if (!a) return; const c = Math.max(0, Math.min(t, a.duration || t)); a.currentTime = c; setTime(c); }, []);
  const replay = useCallback((track: Track) => play(track, 0), [play]);
  const stop = useCallback(() => { const a = audio.current; if (a) { a.pause(); a.removeAttribute('src'); a.load(); } setCurrent(null); setPlaying(false); setTime(0); setDuration(0); setStatus('idle'); setError(null); }, []);
  const setVolume = useCallback((v: number) => { const c = Math.min(1, Math.max(0, v)); if (audio.current) { audio.current.volume = c; audio.current.muted = c === 0; } setVol(() => { const next = { volume: c, muted: c === 0 }; writeVolume(next); return next; }); }, []);
  const toggleMute = useCallback(() => setVol((x) => { const next = { volume: x.volume || 0.9, muted: !x.muted }; if (audio.current) { audio.current.muted = next.muted; audio.current.volume = next.volume; } writeVolume(next); return next; }), []);

  // a track whose source disappears (its file deleted) stops quietly
  useEffect(() => { if (current && !current.src) stop(); }, [current, stop]);

  const api = useMemo<Api>(() => ({ current, playing, status, error, time, duration, volume, muted, play, pause, toggle, seek, replay, stop, setVolume, toggleMute }), [current, playing, status, error, time, duration, volume, muted, play, pause, toggle, seek, replay, stop, setVolume, toggleMute]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <audio ref={audio} preload="metadata" className="hidden"
        onPlay={() => { setPlaying(true); setError(null); }} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onWaiting={() => setStatus((s) => (s === 'error' ? s : 'loading'))} onCanPlay={() => setStatus((s) => (s === 'error' ? s : 'ready'))}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration || 0); if (pendingSeek.current !== null) { e.currentTarget.currentTime = pendingSeek.current; pendingSeek.current = null; } }}
        onDurationChange={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        onError={() => { if (!currentRef.current) return; setPlaying(false); setStatus('error'); setError('This file could not be loaded. It may have been removed from this browser.'); }} />
    </Ctx.Provider>
  );
}

export function usePlayer(): Api {
  const api = useContext(Ctx);
  if (!api) throw new Error('usePlayer outside PlayerProvider');
  return api;
}

/** The state of one track as the shared player sees it: whether it is the current one, playing, loading or failed,
 *  its time, and its duration — the file's once known, otherwise the record's, marked provisional. */
export function useTrackState(track: Track | null) {
  const p = usePlayer();
  const mine = Boolean(track && p.current?.id === track.id && p.current.src === track.src);
  const fileDuration = mine ? p.duration : 0;
  const duration = fileDuration || track?.duration || 0;
  return { mine, playing: mine && p.playing, loading: mine && p.status === 'loading' && p.playing === false, error: mine && p.status === 'error' ? p.error : null, notice: mine && p.status !== 'error' ? p.error : null, time: mine ? Math.min(p.time, duration || p.time) : 0, duration, provisional: !fileDuration && Boolean(track?.duration) };
}

/** A play/pause control for one track. `primary` is the large violet transport in a header; `onArt` sits on a
 *  picture; the default is a quiet round button. While the file loads after a press, it shows a spinner. */
export function TrackButton({ track, primary, onArt, size, className = '', labelPlay = 'Play', labelPause = 'Pause' }: { track: Track; primary?: boolean; onArt?: boolean; size?: 'xs' | 'sm'; className?: string; labelPlay?: string; labelPause?: string }) {
  const p = usePlayer();
  const st = useTrackState(track);
  const busy = st.mine && p.status === 'loading' && !p.playing;
  const icon = busy ? <span aria-hidden className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : st.playing ? <IconPause /> : <IconPlay className="translate-x-px" />;
  const common = { type: 'button' as const, 'aria-label': st.playing ? labelPause : labelPlay, 'aria-pressed': st.playing, 'aria-busy': busy || undefined };
  if (onArt) return <button {...common} className={`play-on-art ${className}`} onClick={(e) => { e.preventDefault(); p.toggle(track); }}>{icon}</button>;
  if (primary) return <button {...common} className={`transport transport-primary ${className}`} onClick={() => p.toggle(track)}>{icon}</button>;
  return <button {...common} className={`transport ${size === 'xs' ? 'transport-xs' : size === 'sm' ? 'transport-sm' : ''} ${className}`} onClick={() => p.toggle(track)}>{icon}</button>;
}

/** A seek bar bound to the current track when it is this one; otherwise it shows the track's known length at zero,
 *  and dragging it starts the track from that point. */
export function SeekBar({ track, className = '', label = 'Seek', showTimes = true }: { track: Track; className?: string; label?: string; showTimes?: boolean }) {
  const p = usePlayer();
  const st = useTrackState(track);
  const pct = st.duration ? (st.time / st.duration) * 100 : 0;
  return (
    <div className={`flex items-center gap-3 ${className}`} dir="ltr">
      {showTimes && <span className="mono w-10 flex-none text-end text-[11.5px] text-muted num">{fmtClock(st.time)}</span>}
      <input type="range" className="seek flex-1" style={{ '--p': `${pct}%` } as React.CSSProperties} min={0} max={st.duration || 1} step={0.01} value={st.time} disabled={!st.duration}
        aria-label={label} aria-valuetext={`${fmtClock(st.time)} / ${fmtClock(st.duration)}`}
        onChange={(e) => { if (st.mine) p.seek(Number(e.target.value)); else p.play(track, Number(e.target.value)); }} />
      {showTimes && <span className="mono w-11 flex-none text-[11.5px] text-muted num" title={st.provisional ? 'Length from the record; confirmed when the file loads' : undefined}>{st.provisional ? '~' : ''}{fmtClock(st.duration)}</span>}
    </div>
  );
}
