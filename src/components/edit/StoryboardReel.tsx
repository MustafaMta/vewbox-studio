'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { T } from '@/lib/copy';
import { cls } from '@/components/ui/kit';
import { IconPause, IconPlay } from '@/components/ui/icons';
import { claimPlayback, onOtherPlayback } from '@/components/players/coordinator';
import { SeekBar, TimeReadout } from '@/components/players/PlayerCore';
import { useShortcutScope } from '@/components/players/useShortcutScope';

/** THE STORYBOARD REEL (docs/DESIGN-SYSTEM-V4.md §5.12; client-only) — an honest stand-in for a cut: it shows each
 *  shot's storyboard frame for the shot's duration and plays the recorded dialogue line when one exists. The frame is
 *  labelled "Storyboard reel · not a cut", always. A shot with no frame shows its number on the field tone, never a
 *  picture it does not have. Used in the DiptychHero and the SleeveHero (Video mode) before a cut exists. Its clock
 *  is its own; `onShot` tells a FilmStrip which shot is up. Transport LTR. */

export interface ReelShot { id: string; number: number; src?: string | null; duration: number; audio?: string | null; label?: string }

export function reelIndexAt(shots: ReelShot[], t: number): { index: number; start: number } {
  let start = 0;
  for (let i = 0; i < shots.length; i++) { const d = Math.max(0.1, shots[i].duration); if (t < start + d || i === shots.length - 1) return { index: i, start }; start += d; }
  return { index: 0, start: 0 };
}

export function StoryboardReel({ shots, aspect = '16/9', onShot, title, className }: { shots: ReelShot[]; aspect?: '16/9' | '9/16'; onShot?: (index: number) => void; title?: string; className?: string }) {
  const id = useId();
  const owner = `reel-${id}`;
  const total = useMemo(() => shots.reduce((s, x) => s + Math.max(0.1, x.duration), 0), [shots]);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const clock = useRef<{ t0: number; at: number } | null>(null);
  const { index, start } = reelIndexAt(shots, time);
  const shot = shots[index];
  const lastIndex = useRef(-1);

  const stopAudio = () => { audio.current?.pause(); };
  const startAudio = useCallback((i: number, offset: number) => {
    const s = shots[i]; if (!s?.audio) { stopAudio(); return; }
    if (!audio.current) audio.current = new Audio();
    const a = audio.current;
    if (a.getAttribute('src') !== s.audio) a.src = s.audio;
    try { a.currentTime = Math.max(0, offset); } catch { /* before metadata */ }
    void a.play().catch(() => null);
  }, [shots]);

  useEffect(() => onOtherPlayback(owner, () => setPlaying(false)), [owner]);
  useEffect(() => () => { audio.current?.pause(); }, []);
  // the reel's clock: frame-accurate enough for a storyboard, from performance.now()
  useEffect(() => {
    if (!playing) { stopAudio(); clock.current = null; return; }
    claimPlayback(owner);
    clock.current = { t0: performance.now(), at: time >= total ? 0 : time };
    if (time >= total) setTime(0);
    let raf = 0;
    const tick = () => {
      const c = clock.current; if (!c) return;
      const t = c.at + (performance.now() - c.t0) / 1000;
      if (t >= total) { setTime(total); setPlaying(false); return; }
      setTime(t); raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, total, owner]);
  // entering a shot: tell the strip; start its line when playing
  useEffect(() => {
    if (index === lastIndex.current) return;
    lastIndex.current = index;
    onShot?.(index);
    if (playing) startAudio(index, time - start);
  }, [index, playing, start, time, onShot, startAudio]);

  const seek = (t: number) => {
    const c = Math.max(0, Math.min(total, t)); setTime(c);
    if (clock.current) clock.current = { t0: performance.now(), at: c };
    const r = reelIndexAt(shots, c); lastIndex.current = r.index; onShot?.(r.index);
    if (playing) startAudio(r.index, c - r.start);
  };
  const toggle = () => { if (!playing && shot) startAudio(index, time - start); setPlaying((p) => !p); };
  const goShot = (d: number) => { let s = 0; const k = Math.max(0, Math.min(shots.length - 1, index + d)); for (let i = 0; i < k; i++) s += Math.max(0.1, shots[i].duration); seek(s); };
  const keys = useShortcutScope({ Space: toggle, k: toggle, ArrowLeft: () => goShot(-1), ArrowRight: () => goShot(1), Home: () => seek(0), End: () => seek(total) }, { scope: 'reel' });

  return (
    <div className={cls('reel', className)} data-aspect={aspect} tabIndex={0} role="group" aria-label={title ?? T('media.reel.player')} onKeyDown={keys}>
      <div className="reel-frame" style={{ aspectRatio: aspect.replace('/', ' / ') }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {shot?.src ? <img src={shot.src} alt={`${T.f('media.shot', { n: shot.number })}${shot.label ? `: ${shot.label}` : ''}`} />
          : shot ? <span className="reel-missing" role="img" aria-label={T.f('media.strip.noFrame', { n: shot.number })}><span className="tc" aria-hidden>{shot.number}</span></span> : null}
        <span className="reel-label">{T('media.reel.label')}</span>
        {shot && <span className="reel-shot tc" aria-hidden>{T.f('media.shot', { n: shot.number })}</span>}
      </div>
      <div className="reel-bar" dir="ltr" role="group" aria-label={T('media.player.transport')}>
        <button type="button" className="ebtn ebtn-icon ebtn-play" aria-label={playing ? T('misc.pause') : T('misc.play')} onClick={toggle} disabled={shots.length === 0}>{playing ? <IconPause aria-hidden /> : <IconPlay aria-hidden />}</button>
        <SeekBar time={time} duration={total} step={0.1} onSeek={seek} label={T('misc.seek')} tone="edit" ticks={shots.slice(1).map((_, i) => ({ at: shots.slice(0, i + 1).reduce((s, x) => s + Math.max(0.1, x.duration), 0), kind: 'mark' as const }))} />
        <TimeReadout time={time} duration={total} />
      </div>
    </div>
  );
}
