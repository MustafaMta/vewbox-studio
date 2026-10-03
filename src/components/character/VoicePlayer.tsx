'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconPause, IconPlay } from '@/components/ui/icons';
import { usePlayer, useTrackState, fmtClock, type Track } from '@/components/players/PlayerProvider';
import { peaksFor } from '@/components/players/Waveform';

/** THE VOICE ROW (docs/design/VISUAL-STANDARD-V5.1.md §5.24, the audio row) — 64 high on --surface-1, radius 14: the
 *  40 px primary play button, the line in quotes (14/20 500) over one meta line (12/16 text-3), the waveform decoded
 *  from the file itself (played bars text-1, the rest charcoal) as a seek slider, and the time in Geist Mono. It drives
 *  the studio's one shared <audio>, so it never overlaps another sound and nothing autoplays. Keyboard: the button
 *  toggles; on the waveform ←/→ move one second, Home/End jump to the ends, Space/Enter toggle. All transports LTR.
 *  TEMPORARY local version of the kit's audio row (the Design System Engineer is lifting it). */
export function VoicePlayer({ track, name, detail, source, selected, action, unavailableText = 'Recording unavailable', className = '' }: {
  track: Track | null; name: string; detail?: ReactNode; source?: 'SAMPLE' | 'UPLOADED' | 'GENERATED'; selected?: boolean; action?: ReactNode; unavailableText?: string; className?: string;
}) {
  const p = usePlayer();
  const st = useTrackState(track);
  const sourceWord = source === 'UPLOADED' ? 'Recording' : source === 'GENERATED' ? 'Spoken by the studio' : source === 'SAMPLE' ? 'Sample' : null;
  const meta = [track ? detail : unavailableText, sourceWord].filter(Boolean);
  return (
    <div className={`vrow ${className}`} data-selected={selected || undefined} role="group" aria-label={`Voice: ${name}`} dir="ltr">
      {track ? (
        <button type="button" className={`btn btn-icon vrow-play ${st.playing ? 'btn-secondary' : 'btn-primary'}`} onClick={() => p.toggle(track)} aria-label={`${st.playing ? 'Pause' : 'Play'} ${name}`} aria-pressed={st.playing} aria-busy={st.loading || undefined}>
          {st.playing ? <IconPause aria-hidden /> : <IconPlay aria-hidden />}
        </button>
      ) : <span className="btn btn-icon btn-secondary vrow-play" data-off aria-hidden><IconPlay /></span>}
      <span className="vrow-words">
        <span className="vrow-title" dir="auto" title={name}>{name}</span>
        {meta.length > 0 && <span className="vrow-meta">{meta.map((m, i) => <span key={i}>{i > 0 && ' · '}{m}</span>)}</span>}
      </span>
      {track && <span className="vrow-wave"><Wave track={track} label={name} /><span className="vrow-time">{fmtClock(st.time)} / {st.provisional ? '~' : ''}{fmtClock(st.duration)}</span></span>}
      {action && <span className="vrow-end">{action}</span>}
      {track && st.error && <p role="alert" className="vrow-error">{st.error}</p>}
    </div>
  );
}

const BARS = 64;
const HEIGHT = 32;

/** The waveform as a seek slider: 2 px bars with 2 px gaps where they fit; the peaks come from the decoded file; while
 *  they load (or if the file cannot be decoded) a plain line stands in, still seekable — nothing is invented. */
function Wave({ track, label }: { track: Track; label: string }) {
  const p = usePlayer();
  const st = useTrackState(track);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [width, setWidth] = useState(0);
  const progress = st.duration ? Math.min(1, st.time / st.duration) : 0;
  useEffect(() => {
    let alive = true; setPeaks(null);
    peaksFor(track.src, BARS).then((x) => { if (alive) setPeaks(x); }).catch(() => { /* the line stands in */ });
    return () => { alive = false; };
  }, [track.src]);
  useEffect(() => {
    const el = canvas.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth)); ro.observe(el); setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const c = canvas.current; if (!c || !width) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.floor(width * dpr); c.height = Math.floor(HEIGHT * dpr);
    const g = c.getContext('2d'); if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, width, HEIGHT);
    const css = getComputedStyle(document.documentElement);
    const played = css.getPropertyValue('--text-1').trim() || '#F5F5F4';
    const rest = css.getPropertyValue('--surface-3').trim() || '#2E2E2E';
    if (!peaks) {
      g.fillStyle = rest; g.fillRect(0, HEIGHT / 2 - 1, width, 2);
      g.fillStyle = played; g.fillRect(0, HEIGHT / 2 - 1, width * progress, 2);
      return;
    }
    const n = Math.max(1, Math.min(peaks.length, Math.floor((width + 2) / 4)));
    const step = peaks.length / n;
    for (let i = 0; i < n; i++) {
      let v = 0; for (let k = Math.floor(i * step); k < Math.floor((i + 1) * step); k++) v = Math.max(v, peaks[k] ?? 0);
      const bh = Math.max(2, Math.max(0.08, v) * (HEIGHT - 2));
      g.fillStyle = (i + 0.5) / n <= progress ? played : rest;
      g.fillRect(i * 4, (HEIGHT - bh) / 2, 2, bh);
    }
  }, [peaks, progress, width]);

  const seekTo = (t: number) => { const d = st.duration; if (!d) { p.play(track, 0); return; } const c = Math.max(0, Math.min(d, t)); if (st.mine) p.seek(c); else p.play(track, c); };
  const onKey = (e: React.KeyboardEvent) => {
    const fwd = e.key === 'ArrowRight'; const back = e.key === 'ArrowLeft';
    if (fwd || back) { e.preventDefault(); seekTo(st.time + (fwd ? 1 : -1)); }
    else if (e.key === 'Home') { e.preventDefault(); seekTo(0); }
    else if (e.key === 'End') { e.preventDefault(); seekTo(st.duration); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); p.toggle(track); }
  };
  return (
    <canvas ref={canvas} role="slider" tabIndex={0} aria-label={`Seek ${label}`} aria-valuemin={0} aria-valuemax={Math.round(st.duration) || 0} aria-valuenow={Math.round(st.time)} aria-valuetext={`${fmtClock(st.time)} of ${fmtClock(st.duration)}`}
      onKeyDown={onKey} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seekTo(((e.clientX - r.left) / r.width) * (st.duration || 0)); }} />
  );
}
