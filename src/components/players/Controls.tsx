'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useT } from '@/components/ui/locale';
import { cls } from '@/components/ui/kit';
import { IconMuted, IconReplay, IconSound, IconWarn } from '@/components/ui/icons';
import { SeekBar, TrackButton, useTrackState, usePlayer, fmtClock, type Track } from './PlayerProvider';

/** THE PLAYER PIECES — volume, the full song player, the compact player that follows it, a voice preview and a
 *  one-line file player. Every one of them drives the same shared audio source, so they always agree. */

/** Mute and volume. `popover` puts the slider behind the speaker button, for tight rows; otherwise it sits inline. */
export function VolumeControl({ volume, muted, onVolume, onMute, popover, tone = 'dark' }: { volume: number; muted: boolean; onVolume: (v: number) => void; onMute: () => void; popover?: boolean; tone?: 'dark' | 'on-video' }) {
  const T = useT();
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
  const slider = <input type="range" className={cls('seek', tone === 'on-video' && 'seek-light')} style={{ '--p': `${level * 100}%` } as React.CSSProperties} min={0} max={1} step={0.05} value={level} aria-label={T('player.volume')} aria-valuetext={`${Math.round(level * 100)}%`} onChange={(e) => onVolume(Number(e.target.value))} />;
  const btnCls = tone === 'on-video' ? 'vbtn' : 'btn btn-subtle btn-sm btn-icon';
  if (!popover) return (
    <div className="flex items-center gap-1.5" dir="ltr">
      <button type="button" className={btnCls} aria-label={muted ? T('player.unmute') : T('player.mute')} aria-pressed={muted} onClick={onMute}>{muted || volume === 0 ? <IconMuted /> : <IconSound />}</button>
      <div className="w-20">{slider}</div>
    </div>
  );
  return (
    <div ref={wrap} className="relative" dir="ltr">
      <button type="button" className={btnCls} aria-label={T('player.volume')} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>{muted || volume === 0 ? <IconMuted /> : <IconSound />}</button>
      {open && (
        <div id={id} className="menu !min-w-0 flex w-52 items-center gap-2 !p-2.5" role="group" aria-label={T('player.volume')}>
          <button type="button" className="btn btn-subtle btn-sm btn-icon" aria-label={muted ? T('player.unmute') : T('player.mute')} aria-pressed={muted} onClick={onMute}>{muted ? <IconMuted /> : <IconSound />}</button>
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
  const T = useT();
  const st = useTrackState(track);
  if (!track) return idleText ? <p className="text-[12px] text-faint">{idleText}</p> : null;
  if (st.error) return <p role="alert" className="flex items-center gap-1.5 text-[12px] text-bad"><IconWarn aria-hidden className="size-3.5" />{st.error}</p>;
  if (st.notice) return <p role="status" className="text-[12px] text-warn">{st.notice}</p>;
  if (st.loading) return <p role="status" className="text-[12px] text-faint">{T('player.loading')}</p>;
  return null;
}

/** THE SONG PLAYER — the cover, the song and who sings it, the transport, a seek bar with elapsed and total time,
 *  replay and volume. With no track it says why, and plays nothing. */
export function SongPlayer({ track, title, performer, artworkSrc, action, className = '' }: { track: Track | null; title: string; performer: string; artworkSrc?: string; action?: ReactNode; className?: string }) {
  const T = useT();
  const p = usePlayer();
  return (
    <div className={cls('card flex flex-wrap items-center gap-x-4 gap-y-3 p-3 sm:p-4', className)} role="group" aria-label={`${T('player.song')}: ${title}`}>
      <div className="size-14 flex-none overflow-hidden rounded-lg bg-media sm:size-16">{artworkSrc ? <img src={artworkSrc} alt="" className="h-full w-full object-cover" /> : null}</div>
      <div className="min-w-0 flex-1 basis-32">
        <p className="truncate text-[14.5px] font-semibold text-fg" dir="auto">{title}</p>
        <p className="truncate text-[12.5px] text-muted" dir="auto">{performer}</p>
        <div className="mt-1"><PlayerNotice track={track} idleText={T('mv.noAudio')} /></div>
      </div>
      {action && <div className="flex-none xl:order-last">{action}</div>}
      {track ? (
        <div className="flex min-w-0 basis-full items-center gap-2 sm:gap-3 xl:flex-[2] xl:basis-72">
          <button type="button" className="btn btn-subtle btn-sm btn-icon" aria-label={T('player.replay')} onClick={() => p.replay(track)}><IconReplay /></button>
          <TrackButton track={track} primary labelPlay={T('misc.play')} labelPause={T('misc.pause')} />
          <SeekBar track={track} className="min-w-0 flex-1" label={T('misc.seek')} />
          <div className="hidden xl:block"><SharedVolume /></div>
          <div className="xl:hidden"><SharedVolume popover /></div>
        </div>
      ) : null}
    </div>
  );
}

/** The compact player: shown once the full player has scrolled away, for the same track, from the same state. */
export function MiniPlayer({ track, show }: { track: Track; show: boolean }) {
  const T = useT();
  const st = useTrackState(track);
  if (!show || !st.mine) return null;
  return (
    <div className="fixed inset-x-0 bottom-3 z-30 px-3 lg:inset-x-auto lg:bottom-4 lg:end-6 lg:start-[calc(244px+1.5rem)]" role="region" aria-label={T('misc.player')}>
      <div className="panel-raised mx-auto flex max-w-4xl items-center gap-3 p-2.5 pe-3 animate-rise">
        <div className="size-11 flex-none overflow-hidden rounded-md bg-media">{track.artworkSrc ? <img src={track.artworkSrc} alt="" className="h-full w-full object-cover" /> : null}</div>
        <div className="hidden w-40 min-w-0 flex-none sm:block"><p className="truncate text-sm font-medium text-fg" dir="auto">{track.title}</p>{track.subtitle && <p className="truncate text-xs text-muted" dir="auto">{track.subtitle}</p>}</div>
        <TrackButton track={track} size="sm" labelPlay={T('misc.play')} labelPause={T('misc.pause')} />
        <SeekBar track={track} className="min-w-0 flex-1" label={T('misc.seek')} />
        <SharedVolume popover />
      </div>
    </div>
  );
}

/** A one-line player for a file (a song upload, an audio asset) through the shared source. */
export function AudioPlayer({ src, title, duration, className = '' }: { src: string; title?: string; duration?: number; className?: string }) {
  const T = useT();
  const track: Track = { id: `file-${src}`, src, title: title ?? T('player.audio'), duration };
  return (
    <div className={cls('flex items-center gap-2 rounded-xl border border-line bg-input px-2 py-1.5', className)} role="group" aria-label={title ?? T('player.audio')}>
      <TrackButton track={track} size="xs" labelPlay={T('misc.play')} labelPause={T('misc.pause')} />
      <SeekBar track={track} className="min-w-0 flex-1" label={T('misc.seek')} />
    </div>
  );
}

export { fmtClock };
