'use client';

import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { useT } from '@/components/ui/locale';
import { cls } from '@/components/ui/kit';
import { IconCaptions, IconExitFullscreen, IconFullscreen, IconNextFrame, IconPause, IconPlay, IconPrevFrame, IconTake, IconWarn } from '@/components/ui/icons';
import { claimPlayback, onOtherPlayback, readVolume, writeVolume } from './coordinator';
import { VolumeControl } from './Controls';

export { AudioPlayer } from './Controls';

/** THE VIDEO PLAYER — the poster with one clear play button; once playing, the picture alone, with the controls
 *  returning on any movement, touch or keyboard focus (and always there while paused). Play/pause, seek with elapsed
 *  and total time, frame steps, volume, captions when the clip has them, fullscreen. The clip keeps its own aspect
 *  ratio inside the frame — letterboxed, never stretched or cropped. Keyboard: space/k, ←/→ (frame; with shift, a
 *  second), m, f, Home, End. Starting it pauses every other sound in the studio. */

export interface PlayerHandle { play: () => void; pause: () => void; seek: (t: number) => void; el: () => HTMLVideoElement | null }
type SyncEvent = { type: 'play' | 'pause' | 'seek'; time: number; from: string };
export interface SyncBus { on: (fn: (e: SyncEvent) => void) => () => void; emit: (e: SyncEvent) => void }

export function createSyncBus(): SyncBus {
  const subs = new Set<(e: SyncEvent) => void>();
  return { on: (fn) => { subs.add(fn); return () => subs.delete(fn); }, emit: (e) => { for (const s of subs) s(e); } };
}

const fmt = (t: number) => { if (!Number.isFinite(t) || t < 0) t = 0; const m = Math.floor(t / 60); const s = t - m * 60; return `${m}:${s.toFixed(1).padStart(4, '0')}`; };

export interface CaptionTrack { src: string; label: string; lang: string }

export const VideoPlayer = forwardRef<PlayerHandle, { src: string; poster?: string; fps?: number | null; title?: string; sync?: SyncBus; className?: string; muted?: boolean; compact?: boolean; aspect?: string; captions?: CaptionTrack[]; maxHeight?: string }>(
  function VideoPlayer({ src, poster, fps, title, sync, className = '', muted: mutedInit, compact, aspect, captions, maxHeight }, ref) {
    const T = useT();
    const video = useRef<HTMLVideoElement>(null);
    const wrap = useRef<HTMLDivElement>(null);
    const [playing, setPlaying] = useState(false);
    const [started, setStarted] = useState(false);
    const [time, setTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [{ volume, muted }, setVol] = useState({ volume: 0.9, muted: Boolean(mutedInit) });
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);
    const [full, setFull] = useState(false);
    const [ratio, setRatio] = useState<string | undefined>(aspect);
    const [awake, setAwake] = useState(true);
    const [cc, setCc] = useState(false);
    const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const id = useId();
    const frame = 1 / (fps && fps > 0 ? fps : 24);
    const applying = useRef(false);

    const emit = useCallback((type: SyncEvent['type'], t: number) => { if (!applying.current) sync?.emit({ type, time: t, from: id }); }, [sync, id]);
    useImperativeHandle(ref, () => ({ play: () => { void video.current?.play(); }, pause: () => video.current?.pause(), seek: (t) => { if (video.current) video.current.currentTime = t; }, el: () => video.current }));

    useEffect(() => { if (!mutedInit) { const v = readVolume(); setVol(v); } }, [mutedInit]);
    useEffect(() => { const v = video.current; if (v) { v.volume = volume; v.muted = muted; } }, [volume, muted]);
    useEffect(() => onOtherPlayback(`video-${id}`, () => video.current?.pause()), [id]);
    useEffect(() => { setFailed(false); setReady(false); setStarted(false); setTime(0); setDuration(0); setRatio(aspect); }, [src, aspect]);
    useEffect(() => {
      if (!sync) return;
      return sync.on((e) => {
        if (e.from === id || !video.current) return;
        applying.current = true;
        const v = video.current;
        if (e.type === 'play') { if (Math.abs(v.currentTime - e.time) > 0.08) v.currentTime = e.time; void v.play().catch(() => null); }
        else if (e.type === 'pause') { v.pause(); if (Math.abs(v.currentTime - e.time) > 0.04) v.currentTime = e.time; }
        else if (Math.abs(v.currentTime - e.time) > 0.04) v.currentTime = e.time;
        setTimeout(() => { applying.current = false; }, 0);
      });
    }, [sync, id]);
    useEffect(() => { const on = () => setFull(document.fullscreenElement === wrap.current); document.addEventListener('fullscreenchange', on); return () => document.removeEventListener('fullscreenchange', on); }, []);
    useEffect(() => () => { if (idleTimer.current) clearTimeout(idleTimer.current); }, []);

    // controls: awake while paused; after a movement or a key, awake for 2.5 s while playing
    const wake = useCallback(() => { setAwake(true); if (idleTimer.current) clearTimeout(idleTimer.current); idleTimer.current = setTimeout(() => setAwake(false), 2500); }, []);
    const show = !playing || awake;

    const toggle = () => { const v = video.current; if (!v || failed) return; if (v.paused) { claimPlayback(`video-${id}`); void v.play().catch(() => null); } else v.pause(); };
    const seekTo = (t: number) => { const v = video.current; if (!v) return; const c = Math.max(0, Math.min(t, v.duration || 0)); v.currentTime = c; setTime(c); emit('seek', c); };
    const step = (n: number) => { const v = video.current; if (!v) return; v.pause(); seekTo(v.currentTime + n * frame); };
    const fullscreen = () => { const el = wrap.current; if (!el) return; if (document.fullscreenElement) void document.exitFullscreen(); else void el.requestFullscreen?.(); };
    const setVolume = (v: number) => setVol(() => { const next = { volume: v, muted: v === 0 }; writeVolume(next); return next; });
    const toggleMute = () => setVol((x) => { const next = { volume: x.volume || 0.9, muted: !x.muted }; writeVolume(next); return next; });
    const toggleCc = () => { const v = video.current; if (!v) return; const on = !cc; for (const tr of Array.from(v.textTracks)) tr.mode = on && tr === v.textTracks[0] ? 'showing' : 'hidden'; setCc(on); };

    const onKey = (e: React.KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      wake();
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); toggle(); break;
        case 'ArrowLeft': e.preventDefault(); if (e.shiftKey) seekTo((video.current?.currentTime ?? 0) - 1); else step(-1); break;
        case 'ArrowRight': e.preventDefault(); if (e.shiftKey) seekTo((video.current?.currentTime ?? 0) + 1); else step(1); break;
        case 'm': toggleMute(); break;
        case 'f': fullscreen(); break;
        case 'Home': seekTo(0); break;
        case 'End': seekTo(duration); break;
        default: return;
      }
    };

    const pct = duration ? (Math.min(time, duration) / duration) * 100 : 0;
    const boxStyle: React.CSSProperties = full ? {} : { aspectRatio: ratio ?? '16 / 9', maxHeight: maxHeight ?? (compact ? '40vh' : '70vh') };
    return (
      <div ref={wrap} className={cls('vplayer group/v relative overflow-hidden rounded-xl bg-black text-white', full && 'flex items-center', className)} tabIndex={0} onKeyDown={onKey} onPointerMove={wake} onPointerDown={wake} onFocus={wake} aria-label={title ?? T('player.video')} role="group" data-awake={show || undefined}>
        <div className="relative mx-auto w-full" style={boxStyle}>
          <video ref={video} src={src} poster={poster} playsInline preload="metadata" className="absolute inset-0 h-full w-full object-contain" onClick={toggle}
            onLoadedMetadata={(e) => { const v = e.currentTarget; setDuration(v.duration || 0); setReady(true); if (!aspect && v.videoWidth && v.videoHeight) setRatio(`${v.videoWidth} / ${v.videoHeight}`); }}
            onDurationChange={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)} onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onPlay={(e) => { setPlaying(true); setStarted(true); wake(); emit('play', e.currentTarget.currentTime); }} onPause={(e) => { setPlaying(false); setAwake(true); emit('pause', e.currentTarget.currentTime); }}
            onSeeked={(e) => { if (e.currentTarget.paused) emit('seek', e.currentTarget.currentTime); }} onEnded={() => setPlaying(false)} onError={() => { setFailed(true); setPlaying(false); }}>
            {captions?.map((c) => <track key={c.src} kind="captions" src={c.src} srcLang={c.lang} label={c.label} />)}
          </video>
          {failed ? (
            <div role="alert" className="absolute inset-0 grid place-items-center bg-black/80 p-6 text-center"><span><IconWarn aria-hidden className="mx-auto mb-2 size-6 text-warn" /><span className="block text-[14px] font-semibold">{T('player.videoFailed')}</span><span className="mt-1 block text-[12.5px] text-white/70">{T('player.videoFailed.hint')}</span></span></div>
          ) : !started && (
            <button type="button" onClick={toggle} className="absolute inset-0 grid place-items-center bg-gradient-to-t from-black/50 via-transparent to-transparent" aria-hidden="true" tabIndex={-1}>
              <span className="grid size-16 place-items-center rounded-full bg-black/55 text-white ring-1 ring-white/25 backdrop-blur-md transition-transform duration-200 group-hover/v:scale-105 [&>svg]:size-7"><IconPlay className="translate-x-0.5" /></span>
            </button>
          )}
        </div>
        <div className={cls('vcontrols absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-3 pb-2 pt-8 transition-opacity duration-200', show ? 'opacity-100' : 'pointer-events-none opacity-0')} dir="ltr">
          <input type="range" className="seek seek-light" style={{ '--p': `${pct}%` } as React.CSSProperties} min={0} max={duration || 0} step={frame / 2} value={Math.min(time, duration || 0)} disabled={!ready} aria-label={T('misc.seek')} aria-valuetext={`${fmt(time)} / ${fmt(duration)}`} onChange={(e) => seekTo(Number(e.target.value))} />
          <div className="flex items-center gap-1 text-xs">
            <button type="button" className="vbtn" aria-label={playing ? T('misc.pause') : T('misc.play')} aria-pressed={playing} onClick={toggle} disabled={failed}>{playing ? <IconPause /> : <IconPlay />}</button>
            {!compact && <><button type="button" className="vbtn" aria-label={T('player.prevFrame')} onClick={() => step(-1)}><IconPrevFrame /></button><button type="button" className="vbtn" aria-label={T('player.nextFrame')} onClick={() => step(1)}><IconNextFrame /></button></>}
            <span className="mono ms-1.5 whitespace-nowrap text-[11.5px] text-white/85">{fmt(time)} <span className="text-white/50">/</span> {fmt(duration)}</span>
            <span className="flex-1" />
            <VolumeControl volume={volume} muted={muted} onVolume={setVolume} onMute={toggleMute} popover={compact} tone="on-video" />
            {captions && captions.length > 0 && <button type="button" className="vbtn" aria-label={T('player.captions')} aria-pressed={cc} onClick={toggleCc}><IconCaptions /></button>}
            <button type="button" className="vbtn" aria-label={full ? T('player.exitFullscreen') : T('player.fullscreen')} onClick={fullscreen}>{full ? <IconExitFullscreen /> : <IconFullscreen />}</button>
          </div>
        </div>
      </div>
    );
  },
);

/** Where a clip would be: the frame at the right shape, a quiet icon, what is missing and — when it is generation
 *  that would fill it — the button that says so. Never a broken player. */
export function VideoPlaceholder({ ratio = '16 / 9', title, hint, action, posterSrc, className = '' }: { ratio?: string; title: ReactNode; hint?: ReactNode; action?: ReactNode; posterSrc?: string; className?: string }) {
  return (
    <div className={cls('relative overflow-hidden rounded-xl border border-line bg-media', className)} style={{ aspectRatio: ratio }}>
      {posterSrc && <img src={posterSrc} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35 blur-[2px]" />}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(111,95,240,0.12),transparent_65%)]" />
      <div className="relative flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <span className="grid size-12 place-items-center rounded-full border border-white/15 bg-black/40 text-white/80 [&>svg]:size-5"><IconTake /></span>
        <p className="text-[14px] font-semibold text-fg">{title}</p>
        {hint && <p className="max-w-sm text-[12.5px] text-muted">{hint}</p>}
        {action && <div className="mt-1">{action}</div>}
      </div>
    </div>
  );
}
