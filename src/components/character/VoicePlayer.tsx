'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { T } from '@/lib/copy';
import { cls } from '@/components/ui/kit';
import { IconPause, IconPlay } from '@/components/ui/icons';
import { usePlayer, useTrackState, fmtClock, type Track } from '@/components/players/PlayerProvider';
import { peaksFor } from '@/components/players/Waveform';

/** THE VOICE PLAYER (DESIGN-SYSTEM-V3 §6) — one row: the ivory play disc, the name and one line of detail, the
 *  waveform decoded from the file itself (played part in ivory, the rest in the strong hairline), the time, and where
 *  the sound came from. It drives the studio's one shared <audio>, so it never overlaps another sound and nothing
 *  autoplays. Keyboard: the disc toggles; on the waveform ←/→ move one second along the reading direction (mirrored in
 *  Arabic), Home/End jump to the ends, Space/Enter toggle. `compact` is the small variant for a header or a card. */
export function VoicePlayer({ track, name, detail, source, compact, selected, action, unavailableText, className = '' }: {
  track: Track | null; name: string; detail?: ReactNode; source?: 'SAMPLE' | 'UPLOADED' | 'GENERATED'; compact?: boolean; selected?: boolean; action?: ReactNode; unavailableText?: string; className?: string;
}) {
  const p = usePlayer();
  const st = useTrackState(track);
  const busy = st.mine && p.status === 'loading' && !p.playing;
  const sourceWord = source === 'UPLOADED' ? T('cast.voice.src.recording') : source === 'GENERATED' ? T('cast.voice.src.generated') : source === 'SAMPLE' ? T('cast.voice.src.sample') : null;
  const disc = track ? (
    <button type="button" onClick={() => p.toggle(track)} aria-label={`${st.playing ? T('misc.pause') : T('misc.play')} ${name}`} aria-pressed={st.playing} aria-busy={busy || undefined}
      className={cls('grid flex-none place-items-center rounded-full bg-primary text-on-primary transition-colors hover:bg-[var(--primary-hover)] active:bg-[var(--primary-active)]', compact ? 'size-8 [&>svg]:size-3.5' : 'size-10 [&>svg]:size-4')}>
      {busy ? <span aria-hidden className="inline-block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : st.playing ? <IconPause aria-hidden /> : <IconPlay aria-hidden className="translate-x-px" />}
    </button>
  ) : <span aria-hidden className={cls('grid flex-none place-items-center rounded-full border border-line text-disabled', compact ? 'size-8 [&>svg]:size-3.5' : 'size-10 [&>svg]:size-4')}><IconPlay /></span>;
  const time = <span className="num flex-none text-[12px] text-faint" dir="ltr">{fmtClock(st.time)} / {st.provisional ? '~' : ''}{fmtClock(st.duration)}</span>;

  if (compact) return (
    <div className={cls('flex min-w-0 items-center gap-3', className)} role="group" aria-label={`${T('cast.voice.title')}: ${name}`}>
      {disc}
      {track ? <><Wave track={track} bars={40} height={20} className="w-24 flex-none sm:w-32" label={name} />{time}</> : null}
      <span className="min-w-0 truncate text-[12.5px] text-muted" dir="auto">{track ? detail : unavailableText}</span>
    </div>
  );
  return (
    <div className={cls('flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[var(--r-2)] py-1', selected && 'bg-accent-soft ps-3 shadow-[inset_2px_0_0_var(--accent)] rtl:shadow-[inset_-2px_0_0_var(--accent)]', className)} role="group" aria-label={`${T('cast.voice.title')}: ${name}`}>
      {disc}
      <div className="min-w-0 flex-1 basis-40">
        <p className="line-clamp-2 text-[14px] font-semibold leading-5 text-fg" dir="auto">{name}</p>
        {(detail || !track) && <p className="truncate text-[13px] leading-5 text-muted" dir="auto">{track ? detail : unavailableText}</p>}
      </div>
      {track && <div className="flex min-w-0 flex-[2] basis-56 items-center gap-3"><Wave track={track} bars={96} height={28} className="min-w-0 flex-1" label={name} />{time}</div>}
      {sourceWord && <span className="status flex-none">{sourceWord}</span>}
      {action}
      {track && st.error && <p role="alert" className="basis-full text-[12px] text-bad">{st.error}</p>}
    </div>
  );
}

/** The waveform as a seek slider: the peaks come from the decoded file; while they load (or if the file cannot be
 *  decoded) a plain line stands in, still seekable — nothing is invented. */
function Wave({ track, bars, height, className = '', label }: { track: Track; bars: number; height: number; className?: string; label: string }) {
  const p = usePlayer();
  const st = useTrackState(track);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(0);
  const progress = st.duration ? Math.min(1, st.time / st.duration) : 0;
  useEffect(() => {
    let alive = true; setPeaks(null); setFailed(false);
    peaksFor(track.src, bars).then((x) => { if (alive) setPeaks(x); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [track.src, bars]);
  useEffect(() => {
    const el = canvas.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth)); ro.observe(el); setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const c = canvas.current; if (!c || !width) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.floor(width * dpr); c.height = Math.floor(height * dpr);
    const g = c.getContext('2d'); if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, width, height);
    const css = getComputedStyle(document.documentElement);
    const played = css.getPropertyValue('--fg').trim() || '#f3eee6';
    const rest = css.getPropertyValue('--ink-600').trim() || '#4a4640';
    const rtl = document.documentElement.dir === 'rtl';
    if (!peaks) { // the line that stands in
      g.fillStyle = rest; g.fillRect(0, height / 2 - 1, width, 2);
      g.fillStyle = played; const w = width * progress; g.fillRect(rtl ? width - w : 0, height / 2 - 1, w, 2);
      return;
    }
    const n = peaks.length; const gap = 1.5; const bw = Math.max(1, (width - gap * (n - 1)) / n);
    for (let i = 0; i < n; i++) {
      const bh = Math.max(2, Math.max(0.08, peaks[i]) * (height - 2));
      const x = rtl ? width - i * (bw + gap) - bw : i * (bw + gap);
      g.fillStyle = (i + 0.5) / n <= progress ? played : rest;
      g.beginPath(); g.roundRect(x, (height - bh) / 2, bw, bh, 1); g.fill();
    }
  }, [peaks, progress, width, height]);

  const seekTo = (t: number) => { const d = st.duration; if (!d) { p.play(track, 0); return; } const c = Math.max(0, Math.min(d, t)); if (st.mine) p.seek(c); else p.play(track, c); };
  const onKey = (e: React.KeyboardEvent) => {
    const rtl = document.documentElement.dir === 'rtl';
    const fwd = e.key === (rtl ? 'ArrowLeft' : 'ArrowRight'); const back = e.key === (rtl ? 'ArrowRight' : 'ArrowLeft');
    if (fwd || back) { e.preventDefault(); seekTo(st.time + (fwd ? 1 : -1)); }
    else if (e.key === 'Home') { e.preventDefault(); seekTo(0); }
    else if (e.key === 'End') { e.preventDefault(); seekTo(st.duration); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); p.toggle(track); }
  };
  return (
    <canvas ref={canvas} role="slider" tabIndex={0} aria-label={`${T('misc.seek')} ${label}`} aria-valuemin={0} aria-valuemax={Math.round(st.duration) || 0} aria-valuenow={Math.round(st.time)} aria-valuetext={`${fmtClock(st.time)} / ${fmtClock(st.duration)}`}
      title={failed ? T('cast.voice.noWave') : undefined}
      className={cls('block cursor-pointer rounded-[2px]', className)} style={{ height }} onKeyDown={onKey}
      onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); let f = (e.clientX - r.left) / r.width; if (document.documentElement.dir === 'rtl') f = 1 - f; seekTo(f * (st.duration || 0)); }} />
  );
}
