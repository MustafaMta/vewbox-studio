'use client';

import { useEffect, useRef, useState } from 'react';

/** A WAVEFORM FROM THE FILE ITSELF — the audio is fetched and decoded with the Web Audio API and its peaks are drawn.
 *  Nothing is invented: if the file cannot be decoded, nothing is drawn and the caption says so. Peaks are cached
 *  per source for the session. */

const cache = new Map<string, Float32Array>();

export async function peaksFor(src: string, buckets: number): Promise<Float32Array> {
  const key = `${src}#${buckets}`;
  const hit = cache.get(key); if (hit) return hit;
  const res = await fetch(src);
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

export function Waveform({ src, progress, onSeek, height = 56, buckets = 160, className = '', label, unavailableText }: { src: string; progress: number; onSeek?: (fraction: number) => void; height?: number; buckets?: number; className?: string; label: string; unavailableText: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setPeaks(null); setFailed(false);
    peaksFor(src, buckets).then((p) => { if (alive) setPeaks(p); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [src, buckets]);

  useEffect(() => {
    const c = canvas.current; if (!c || !peaks) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = height;
    c.width = Math.floor(w * dpr); c.height = Math.floor(h * dpr);
    const g = c.getContext('2d'); if (!g) return;
    g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
    const n = peaks.length; const gap = 1.5; const bw = Math.max(1, (w - gap * (n - 1)) / n);
    const styles = getComputedStyle(document.documentElement);
    const played = styles.getPropertyValue('--ivory').trim() || '#f4f3ee';
    const rest = styles.getPropertyValue('--line-strong').trim() || '#364861';
    const rtl = document.documentElement.dir === 'rtl';
    for (let i = 0; i < n; i++) {
      const v = Math.max(0.06, peaks[i]);
      const bh = Math.max(2, v * (h - 4));
      const frac = (i + 0.5) / n;
      const x = rtl ? w - (i * (bw + gap)) - bw : i * (bw + gap);
      g.fillStyle = frac <= progress ? played : rest;
      g.beginPath(); g.roundRect(x, (h - bh) / 2, bw, bh, 1); g.fill();
    }
  }, [peaks, progress, height]);

  if (failed) return <p className={`text-xs text-faint ${className}`}>{unavailableText}</p>;
  return (
    <div className={className}>
      <canvas ref={canvas} role={onSeek ? 'slider' : 'img'} aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} tabIndex={onSeek ? 0 : -1}
        className={`block w-full ${onSeek ? 'cursor-pointer' : ''} ${peaks ? '' : 'skeleton'}`} style={{ height }}
        onClick={(e) => { if (!onSeek) return; const r = e.currentTarget.getBoundingClientRect(); let f = (e.clientX - r.left) / r.width; if (document.documentElement.dir === 'rtl') f = 1 - f; onSeek(Math.max(0, Math.min(1, f))); }}
        onKeyDown={(e) => { if (!onSeek) return; if (e.key === 'ArrowRight') onSeek(Math.min(1, progress + 0.02)); if (e.key === 'ArrowLeft') onSeek(Math.max(0, progress - 0.02)); }} />
      <p className="mt-1 text-[11px] text-faint">{label}</p>
    </div>
  );
}
