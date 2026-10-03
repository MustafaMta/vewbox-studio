'use client';

import { useEffect, useId, useState } from 'react';
import { cls } from '@/components/ui/kit';
import { fmtClock } from './time';

/** THE WAVEFORM (docs/DESIGN-SYSTEM-V4.md §2.6, §5.13; kept and corrected) — drawn from the file itself: the audio is
 *  fetched and decoded with the Web Audio API and its peaks become bars. Nothing is invented: until the peaks exist
 *  nothing is drawn, and a file that cannot be decoded says so in words. 120 bars (64 on a phone), 2 wide with a 1
 *  gap and a 1 radius at the nominal width, stretched to the row. Played bars are `--fg`; unplayed bars are
 *  `--ink-550` (3.77:1 on the ground; v3's `--ink-600` measured 2.09:1). Playhead: a 1 px ivory line and an 8 px iris
 *  handle. Click or tap seeks; the keyboard drives it as a slider. ALWAYS LEFT TO RIGHT, in both languages (it is
 *  time). In edit, section boundaries show as 1 px strong-hairline ticks with their labels above. */

const cache = new Map<string, Float32Array>();

export async function peaksFor(src: string, buckets: number): Promise<Float32Array> {
  const key = `${src}#${buckets}`;
  const hit = cache.get(key); if (hit) return hit;
  const res = await fetch(src);
  if (!res.ok) throw new Error(`audio ${res.status}`);
  const buf = await res.arrayBuffer();
  const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctor) throw new Error('no audio context');
  const ctx = new Ctor();
  try {
    const audio = await ctx.decodeAudioData(buf.slice(0));
    const data = audio.getChannelData(0);
    const per = Math.max(1, Math.floor(data.length / buckets));
    const out = new Float32Array(buckets);
    let max = 0;
    for (let i = 0; i < buckets; i++) {
      let peak = 0;
      const start = i * per;
      for (let j = start; j < start + per && j < data.length; j += 4) { const v = Math.abs(data[j]); if (v > peak) peak = v; }
      out[i] = peak; if (peak > max) max = peak;
    }
    if (max > 0) for (let i = 0; i < buckets; i++) out[i] = out[i] / max;
    cache.set(key, out);
    return out;
  } finally { void ctx.close(); }
}

/** Bars for a viewBox of (3n − 1) × 100: 2-unit bars, 1-unit gaps, centred, at least 6 % tall. */
export function barsOf(peaks: ArrayLike<number>): Array<{ x: number; y: number; h: number }> {
  return Array.from({ length: peaks.length }, (_, i) => { const h = Math.max(6, Math.min(1, peaks[i]) * 96); return { x: i * 3, y: (100 - h) / 2, h }; });
}

export function Waveform({ src, progress, onSeek, height = 56, buckets, className = '', label, unavailableText, duration, sections, showLabel = true }: { src: string; progress: number; onSeek?: (fraction: number) => void; height?: number; buckets?: number; className?: string; label: string; unavailableText: string; duration?: number; sections?: Array<{ at: number; label: string }>; showLabel?: boolean }) {
  const id = useId();
  const [n, setN] = useState(buckets ?? 120);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { if (buckets) setN(buckets); else { try { setN(window.matchMedia('(max-width: 639px)').matches ? 64 : 120); } catch { setN(120); } } }, [buckets]);
  useEffect(() => {
    let alive = true;
    setPeaks(null); setFailed(false);
    peaksFor(src, n).then((p) => { if (alive) setPeaks(p); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [src, n]);

  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  if (failed) return <p className={cls('wave-failed caption', className)}>{unavailableText}</p>;
  const W = n * 3 - 1;
  const bars = peaks ? barsOf(peaks) : [];
  const rects = bars.map((b, i) => <rect key={i} x={b.x} y={b.y} width={2} height={b.h} rx={1} />);
  const stepBy = duration ? Math.min(1, 1 / duration) : 0.02;
  const onKey = (e: React.KeyboardEvent) => {
    if (!onSeek) return;
    const k = e.key;
    const next = k === 'ArrowRight' || k === 'ArrowUp' ? p + stepBy : k === 'ArrowLeft' || k === 'ArrowDown' ? p - stepBy : k === 'PageUp' ? p + 0.1 : k === 'PageDown' ? p - 0.1 : k === 'Home' ? 0 : k === 'End' ? 1 : null;
    if (next === null) return;
    e.preventDefault(); onSeek(Math.max(0, Math.min(1, next)));
  };
  const valueText = duration ? `${fmtClock(p * duration)} / ${fmtClock(duration)}` : `${Math.round(p * 100)}%`;
  return (
    <div className={cls('wave', className)} dir="ltr" data-ready={peaks ? '' : undefined}>
      {sections && sections.length > 0 && (
        <div className="wave-sections" aria-hidden>{sections.map((s, i) => <span key={i} className="wave-section" style={{ insetInlineStart: `${Math.min(1, Math.max(0, s.at)) * 100}%` }}><span className="wave-section-label caption">{s.label}</span></span>)}</div>
      )}
      <div className="wave-body" style={{ blockSize: height }}>
        <svg className="wave-svg" viewBox={`0 0 ${W} 100`} preserveAspectRatio="none" aria-hidden focusable="false">
          <defs><clipPath id={`${id}-c`}><rect x={0} y={0} width={W * p} height={100} /></clipPath></defs>
          <g className="wave-rest">{rects}</g>
          <g className="wave-played" clipPath={`url(#${id}-c)`}>{rects}</g>
        </svg>
        {peaks && <span className="wave-head" aria-hidden style={{ insetInlineStart: `${p * 100}%` }} />}
        <div className={cls('wave-hit', onSeek && 'wave-hit-on')} role={onSeek ? 'slider' : 'img'} tabIndex={onSeek ? 0 : undefined} aria-label={label}
          aria-valuemin={onSeek ? 0 : undefined} aria-valuemax={onSeek ? 100 : undefined} aria-valuenow={onSeek ? Math.round(p * 100) : undefined} aria-valuetext={onSeek ? valueText : undefined}
          onClick={(e) => { if (!onSeek) return; const r = e.currentTarget.getBoundingClientRect(); onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))); }}
          onKeyDown={onKey} />
      </div>
      {showLabel && <p className="wave-label caption">{label}</p>}
    </div>
  );
}
