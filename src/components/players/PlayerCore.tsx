'use client';

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cls } from '@/components/ui/kit/cls';
import { IconRetry, IconOpen } from '@/components/ui/icons';
import { claimPlayback, onOtherPlayback, readVolume, writeVolume } from './coordinator';
import type { SyncBus, SyncEvent } from './sync';
import { fmtClock } from './time';
import type { ShortcutMap } from './useShortcutScope';

/** PLAYER CORE (docs/DESIGN-SYSTEM-V4.md §5.12) — the logic of the old VideoPlayer, extracted so five shells share it:
 *  the element's state (time, duration, native ratio, loading, failure), play/pause, seek, frame steps, ±5 s, volume
 *  and mute (remembered per viewer), captions (on by default when the clip has a subtitle track, 1.2.2), fullscreen,
 *  the sync bus (a comparison, a song and its video) and the playback coordinator (one sound at a time). Nothing
 *  starts on its own: only a press, or a muted preview the caller asks for. */

export interface CoreOptions { src: string; fps?: number | null; sync?: SyncBus; muted?: boolean; aspect?: string; onEnded?: () => void }

export function usePlayerCore({ src, fps, sync, muted: mutedInit, aspect, onEnded }: CoreOptions) {
  const video = useRef<HTMLVideoElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const id = useId();
  const owner = `video-${id}`;
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ratio, setRatio] = useState<string | undefined>(aspect);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [cc, setCc] = useState(false);
  const [hasCaptions, setHasCaptions] = useState(false);
  const [full, setFull] = useState(false);
  const [{ volume, muted }, setVol] = useState({ volume: 0.9, muted: Boolean(mutedInit) });
  const applying = useRef(false);
  const frame = 1 / (fps && fps > 0 ? fps : 24);

  const emit = useCallback((type: SyncEvent['type'], t: number) => { if (!applying.current) sync?.emit({ type, time: t, from: id }); }, [sync, id]);

  useEffect(() => { if (!mutedInit) setVol(readVolume()); }, [mutedInit]);
  useEffect(() => { const v = video.current; if (v) { v.volume = volume; v.muted = muted; } }, [volume, muted]);
  useEffect(() => onOtherPlayback(owner, () => { if (!video.current?.muted) video.current?.pause(); }), [owner]);
  useEffect(() => { setFailed(false); setReady(false); setStarted(false); setTime(0); setDuration(0); setBuffered(0); setRatio(aspect); setNatural(null); }, [src, aspect]);
  useEffect(() => { const on = () => setFull(document.fullscreenElement === wrap.current); document.addEventListener('fullscreenchange', on); return () => document.removeEventListener('fullscreenchange', on); }, []);
  // a smooth playhead while playing (timeupdate fires only ~4 times a second)
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => { const v = video.current; if (v) setTime(v.currentTime); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  // the other members of the bus drive this one; a member that mounts late starts from the shared playhead
  useEffect(() => {
    if (!sync) return;
    const apply = (e: SyncEvent) => {
      const v = video.current; if (!v || e.from === id) return;
      applying.current = true;
      if (e.type === 'play') { if (Math.abs(v.currentTime - e.time) > 0.08) v.currentTime = e.time; void v.play().catch(() => null); }
      else if (e.type === 'pause') { v.pause(); if (Math.abs(v.currentTime - e.time) > 0.04) v.currentTime = e.time; }
      else if (Math.abs(v.currentTime - e.time) > 0.04) v.currentTime = e.time;
      setTimeout(() => { applying.current = false; }, 0);
    };
    const last = sync.last?.();
    if (last && last.from !== id && video.current) { try { video.current.currentTime = last.time; } catch { /* before metadata */ } }
    return sync.on(apply);
  }, [sync, id]);

  const play = useCallback(() => { const v = video.current; if (!v || failed) return; if (!v.muted) claimPlayback(owner); void v.play().catch(() => null); }, [failed, owner]);
  const pause = useCallback(() => video.current?.pause(), []);
  const toggle = useCallback(() => { const v = video.current; if (!v) return; if (v.paused) play(); else v.pause(); }, [play]);
  const seek = useCallback((t: number) => { const v = video.current; if (!v) return; const c = Math.max(0, Math.min(t, v.duration || t)); v.currentTime = c; setTime(c); emit('seek', c); }, [emit]);
  const step = useCallback((n: number) => { const v = video.current; if (!v) return; v.pause(); seek(v.currentTime + n * frame); }, [seek, frame]);
  const nudge = useCallback((s: number) => { const v = video.current; if (v) seek(v.currentTime + s); }, [seek]);
  const setVolume = useCallback((x: number) => setVol(() => { const next = { volume: x, muted: x === 0 }; writeVolume(next); return next; }), []);
  const toggleMute = useCallback(() => setVol((x) => { const next = { volume: x.volume || 0.9, muted: !x.muted }; writeVolume(next); return next; }), []);
  const toggleCc = useCallback(() => {
    const v = video.current; if (!v) return;
    setCc((on) => { const next = !on; Array.from(v.textTracks).forEach((tr, i) => { tr.mode = next && i === 0 ? 'showing' : 'hidden'; }); return next; });
  }, []);
  const fullscreen = useCallback(() => { const el = wrap.current; if (!el) return; if (document.fullscreenElement) void document.exitFullscreen(); else void el.requestFullscreen?.(); }, []);
  const retry = useCallback(() => { const v = video.current; if (!v) return; setFailed(false); v.load(); }, []);

  const videoProps = {
    ref: video, src, playsInline: true, preload: 'metadata' as const,
    onLoadedMetadata: (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const v = e.currentTarget; setDuration(v.duration || 0); setReady(true);
      if (v.videoWidth && v.videoHeight) { setNatural({ w: v.videoWidth, h: v.videoHeight }); if (!aspect) setRatio(`${v.videoWidth} / ${v.videoHeight}`); }
      const tracks = Array.from(v.textTracks);
      setHasCaptions(tracks.length > 0);
      if (tracks.length > 0) { tracks.forEach((tr, i) => { tr.mode = i === 0 ? 'showing' : 'hidden'; }); setCc(true); }
    },
    onDurationChange: (e: React.SyntheticEvent<HTMLVideoElement>) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0),
    onTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement>) => setTime(e.currentTarget.currentTime),
    onProgress: (e: React.SyntheticEvent<HTMLVideoElement>) => { const v = e.currentTarget; const b = v.buffered; let end = 0; for (let i = 0; i < b.length; i++) if (b.start(i) <= v.currentTime + 0.5) end = Math.max(end, b.end(i)); setBuffered(end); },
    onPlay: (e: React.SyntheticEvent<HTMLVideoElement>) => { setPlaying(true); setStarted(true); emit('play', e.currentTarget.currentTime); },
    onPause: (e: React.SyntheticEvent<HTMLVideoElement>) => { setPlaying(false); emit('pause', e.currentTarget.currentTime); },
    onSeeked: (e: React.SyntheticEvent<HTMLVideoElement>) => { setTime(e.currentTarget.currentTime); if (e.currentTarget.paused) emit('seek', e.currentTarget.currentTime); },
    onEnded: () => { setPlaying(false); onEnded?.(); },
    onError: () => { setFailed(true); setPlaying(false); },
  };

  return { video, wrap, id, playing, started, time, duration, buffered, ready, failed, ratio, natural, cc, hasCaptions, full, volume, muted, frame, play, pause, toggle, seek, step, nudge, setVolume, toggleMute, toggleCc, fullscreen, retry, videoProps };
}
export type PlayerCore = ReturnType<typeof usePlayerCore>;

/** The imperative handle every player exposes (InlinePlayer, TheatrePlayer, CanvasPlayer): the controls, the element,
 *  and a snapshot of the state read from the element when called. */
export function handleOf(c: PlayerCore) {
  return {
    play: c.play, pause: c.pause, toggle: c.toggle, seek: c.seek, nudge: c.nudge, el: () => c.video.current,
    state: () => { const v = c.video.current; return { time: v?.currentTime ?? 0, duration: v && Number.isFinite(v.duration) ? v.duration : 0, playing: Boolean(v && !v.paused && !v.ended) }; },
  };
}

/** The keyboard map of §5.12, for one core: Space/K, J/L, ←/→ (frame), Shift+←/→ (1 s), Home/End, M, C, F. */
export function coreKeys(c: PlayerCore, extra: ShortcutMap = {}): ShortcutMap {
  return {
    Space: () => c.toggle(), k: () => c.toggle(),
    j: () => c.nudge(-5), l: () => c.nudge(5),
    ArrowLeft: () => c.step(-1), ArrowRight: () => c.step(1),
    'Shift+ArrowLeft': () => c.nudge(-1), 'Shift+ArrowRight': () => c.nudge(1),
    Home: () => c.seek(0), End: () => c.seek(c.duration),
    m: () => c.toggleMute(), c: () => { if (c.hasCaptions) c.toggleCc(); }, f: () => c.fullscreen(),
    ...extra,
  };
}

/** THE SEEK TRACK (VISUAL-STANDARD-V5.1 §5.24): a 4 px track on surface-3, the played part text-1, the buffered part
 *  #3A3A3A, a 12 px text-1 thumb shown on hover, focus and drag, a 24 px hit area. `docked` is the lobby transport;
 *  `edit` the cutting room; `video` over a picture (theatre). Click or tap seeks; the arrows step one frame. Ticks (notes,
 *  in/out marks) sit on the track. */
export function SeekBar({ time, duration, buffered = 0, step, onSeek, label, tone = 'docked', disabled, ticks, range, className }: { time: number; duration: number; /** seconds loaded ahead */ buffered?: number; step: number; onSeek: (t: number) => void; label: string; tone?: 'docked' | 'video' | 'edit' | 'quiet'; disabled?: boolean; ticks?: Array<{ at: number; label?: string; kind?: 'note' | 'mark' }>; range?: { from?: number; to?: number }; className?: string }) {
  const pct = (x: number) => (duration ? (Math.min(Math.max(x, 0), duration) / duration) * 100 : 0);
  const style = { '--p': `${pct(time)}%`, '--b': `${Math.max(pct(time), pct(buffered))}%` } as CSSProperties;
  return (
    <div className={cls('seekwrap', className)} data-tone={tone} dir="ltr">
      {range && (range.from !== undefined || range.to !== undefined) && (
        <span className="seek-range" aria-hidden style={{ insetInlineStart: `${pct(range.from ?? 0)}%`, inlineSize: `${pct(range.to ?? duration) - pct(range.from ?? 0)}%` }} />
      )}
      {ticks?.map((t, i) => <span key={i} className="seek-tick" data-kind={t.kind ?? 'note'} aria-hidden style={{ insetInlineStart: `${pct(t.at)}%` }} />)}
      <input type="range" className="seek" data-tone={tone} style={style} min={0} max={duration || 0} step={step} value={Math.min(time, duration || 0)} disabled={disabled || !duration}
        aria-label={label} aria-valuetext={`${fmtClock(time)} / ${fmtClock(duration)}`} onChange={(e) => onSeek(Number(e.target.value))} />
    </div>
  );
}

/** "1:12 / 6:12" in mono, LTR. */
export function TimeReadout({ time, duration, className }: { time: number; duration: number; className?: string }) {
  return <span className={cls('ptime mono', className)} dir="ltr">{fmtClock(time)}<span className="ptime-sep"> / </span>{fmtClock(duration)}</span>;
}

/** A failed clip (§5.12): the poster stays; on the solid chip, "This clip didn't load." with Try again and Open the
 *  file. Never a broken frame. */
export function MediaFailure({ onRetry, fileHref, children }: { onRetry: () => void; fileHref?: string; children?: ReactNode }) {
  return (
    <div className="pfail" role="alert">
      <p className="pfail-msg">This clip didn’t load.</p>
      {children}
      <div className="pfail-actions">
        <button type="button" className="btn btn-secondary btn-sm pfail-btn" onClick={onRetry}><IconRetry aria-hidden />Try again</button>
        {fileHref && <a className="btn btn-quiet btn-sm pfail-btn" href={fileHref} target="_blank" rel="noreferrer"><IconOpen aria-hidden />Open the file</a>}
      </div>
    </div>
  );
}
