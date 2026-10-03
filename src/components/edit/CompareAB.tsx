'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { cls } from '@/components/ui/kit';
import { IconNextFrame, IconPause, IconPlay, IconPrevFrame } from '@/components/ui/icons';
import { claimPlayback, onOtherPlayback } from '@/components/players/coordinator';
import { SeekBar } from '@/components/players/PlayerCore';
import { timecode } from '@/components/players/time';
import { useShortcutScope } from '@/components/players/useShortcutScope';
import { useMediaQuery } from './useMediaQuery';

/** COMPARE A/B (docs/DESIGN-SYSTEM-V4.md §5.12) — two sources on one timeline (two takes, two cut versions). At 1280 px
 *  and wider they sit side by side under one linked transport; narrower, one frame with an A/B switch (keys 1 and 2).
 *  Switching keeps the playhead. Labels say which is which ("A · Take 2 (chosen)", "B · Take 3"), and *Choose A* /
 *  *Choose B* decide. Only one side is heard: the one shown, or the one picked with the switch side by side (the
 *  engine normalises both for loudness). Transport LTR. */

export interface CompareSource { src: string; poster?: string; label: string; chosen?: boolean }

export function CompareAB({ a, b, onChoose, fps, aspect = '16/9', className }: { a: CompareSource; b: CompareSource; onChoose?: (which: 'A' | 'B') => void; fps?: number | null; aspect?: string; className?: string }) {
  const id = useId();
  const wide = useMediaQuery('(min-width: 1280px)');
  const va = useRef<HTMLVideoElement>(null);
  const vb = useRef<HTMLVideoElement>(null);
  const [side, setSide] = useState<'A' | 'B'>('A');
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const f = 1 / (fps && fps > 0 ? fps : 24);
  const both = () => [va.current, vb.current].filter((v): v is HTMLVideoElement => Boolean(v));
  const lead = () => (side === 'A' ? va.current : vb.current) ?? va.current;

  useEffect(() => { if (va.current) va.current.muted = side !== 'A'; if (vb.current) vb.current.muted = side !== 'B'; }, [side]);
  useEffect(() => onOtherPlayback(`cmp-${id}`, () => { both().forEach((v) => v.pause()); setPlaying(false); }), [id]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => { const v = lead(); if (v) { setTime(v.currentTime); const o = v === va.current ? vb.current : va.current; if (o && Math.abs(o.currentTime - v.currentTime) > 0.1) o.currentTime = v.currentTime; } raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, side]);

  const seek = useCallback((t: number) => { const c = Math.max(0, Math.min(t, duration || t)); both().forEach((v) => { v.currentTime = c; }); setTime(c); }, [duration]);
  const toggle = () => {
    if (playing) { both().forEach((v) => v.pause()); setPlaying(false); return; }
    claimPlayback(`cmp-${id}`);
    const t = lead()?.currentTime ?? time;
    both().forEach((v) => { v.currentTime = t; void v.play().catch(() => null); });
    setPlaying(true);
  };
  const step = (n: number) => { both().forEach((v) => v.pause()); setPlaying(false); seek(time + n * f); };
  const show = (s: 'A' | 'B') => { const t = lead()?.currentTime ?? time; setSide(s); both().forEach((v) => { if (Math.abs(v.currentTime - t) > 0.04) v.currentTime = t; }); };
  const keys = useShortcutScope({ Space: toggle, k: toggle, ArrowLeft: () => step(-1), ArrowRight: () => step(1), '1': () => show('A'), '2': () => show('B'), Home: () => seek(0), End: () => seek(duration) }, { scope: 'compare' });

  const pane = (s: 'A' | 'B', src: CompareSource, ref: React.RefObject<HTMLVideoElement | null>) => (
    <figure className="cmp-pane" data-side={s} hidden={!wide && side !== s}>
      <div className="cmp-frame canvas" style={{ aspectRatio: aspect.replace('/', ' / ') }}>
        <video ref={ref} src={src.src} poster={src.poster} playsInline preload="metadata" muted={side !== s}
          onLoadedMetadata={(e) => { const d0 = e.currentTarget.duration || 0; setDuration((d) => Math.max(d, d0)); }} onEnded={() => setPlaying(false)} />
      </div>
      <figcaption className="cmp-cap">
        <span className="cmp-label"><span className="tc">{s}</span> · <span dir="auto">{src.label}</span>{src.chosen && <span className="cmp-chosen"> ({'chosen'})</span>}</span>
        {onChoose && <button type="button" className={cls('btn btn-sm', src.chosen ? 'btn-quiet' : 'btn-secondary')} disabled={src.chosen} onClick={() => onChoose(s)}>{`Choose ${s}`}</button>}
      </figcaption>
    </figure>
  );
  return (
    <div className={cls('cmp', className)} data-layout={wide ? 'side' : 'one'} tabIndex={0} role="group" aria-label={`Compare ${a.label} and ${b.label}`} onKeyDown={keys}>
      <div className="cmp-panes">{pane('A', a, va)}{pane('B', b, vb)}</div>
      <div className="cmp-bar" dir="ltr" role="group" aria-label={'Playback controls'}>
        <SeekBar time={time} duration={duration} step={f} onSeek={seek} label={'Seek'} tone="edit" />
        <div className="cplayer-row">
          <div className="cplayer-group">
            <button type="button" className="ebtn ebtn-icon" aria-label={'Previous frame'} onClick={() => step(-1)}><IconPrevFrame aria-hidden /></button>
            <button type="button" className="ebtn ebtn-icon ebtn-play" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>{playing ? <IconPause aria-hidden /> : <IconPlay aria-hidden />}</button>
            <button type="button" className="ebtn ebtn-icon" aria-label={'Next frame'} onClick={() => step(1)}><IconNextFrame aria-hidden /></button>
          </div>
          <span className="tc cplayer-tc">{timecode(time, fps ?? 24)}</span>
          <span className="prow-spacer" />
          <span role="radiogroup" aria-label={wide ? `Sound from ${side}` : 'Show'} className="seg cmp-switch">
            {(['A', 'B'] as const).map((s) => <button key={s} type="button" role="radio" aria-checked={side === s} tabIndex={side === s ? 0 : -1} onClick={() => show(s)}
              onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); const o = s === 'A' ? 'B' : 'A'; show(o); (e.currentTarget.parentElement?.querySelector(`[data-s="${o}"]`) as HTMLElement | null)?.focus(); } }} data-s={s}>
              <span className="tc">{s}</span><span className="sr-only"> · {s === 'A' ? a.label : b.label}</span><kbd className="kbd cmp-key" aria-hidden>{s === 'A' ? 1 : 2}</kbd>
            </button>)}
          </span>
        </div>
      </div>
    </div>
  );
}
