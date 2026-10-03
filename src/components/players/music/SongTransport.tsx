'use client';

import { useId, type ReactNode } from 'react';
import { cls } from '@/components/ui/kit';
import { IconPause, IconPlay } from '@/components/ui/icons';
import { SharedVolume } from '../Controls';
import { PlayDisc } from '../PlayDisc';
import { SeekBar } from '../PlayerCore';
import { usePlayer, useTrackState, type Track } from '../PlayerProvider';
import { fmtClock } from '../time';

/** THE SONG TRANSPORT (docs/DESIGN-SYSTEM-V4.md §5.13, §6.8) — in the SleeveHero:
 *
 *    (▶)  [ Song | Video ]   0:42 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 3:42   🔊   [ Continue: Storyboard › ]
 *
 *  The 56 px ivory disc is the hero's primary. Song | Video is a radiogroup over ONE transport: in Video mode the page
 *  hands the transport the video's controller, so the same disc and seek bar drive the picture (the playhead is
 *  handed over with `handOff`, players/sync.ts). Video is disabled, with its reason as text, until a cut or a
 *  storyboard exists. The whole transport is LTR; the play glyph is never mirrored. On a phone the
 *  disc and the switch share a row and the seek bar takes the next. */

export interface MediaController { playing: boolean; time: number; duration: number; toggle: () => void; seek: (t: number) => void }
export type SongMode = 'song' | 'video';

export function SongVideoSwitch({ value, onChange, videoDisabledReason, className }: { value: SongMode; onChange: (m: SongMode) => void; videoDisabledReason?: ReactNode; className?: string }) {
  const id = useId();
  const opts: Array<{ v: SongMode; label: string; disabled?: boolean }> = [{ v: 'song', label: 'Song' }, { v: 'video', label: 'Video', disabled: Boolean(videoDisabledReason) }];
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const enabled = opts.filter((o) => !o.disabled);
    const i = enabled.findIndex((o) => o.v === value);
    const n = ['ArrowRight', 'ArrowDown'].includes(e.key) ? i + 1 : ['ArrowLeft', 'ArrowUp'].includes(e.key) ? i - 1 : null;
    if (n === null || enabled.length < 2) return;
    e.preventDefault();
    const next = enabled[(n + enabled.length) % enabled.length];
    onChange(next.v);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-v="${next.v}"]`)?.focus();
  };
  return (
    <span className={cls('smode', className)}>
      <span role="radiogroup" aria-label={'Song or video'} className="seg smode-seg" onKeyDown={onKey}>
        {opts.map((o) => (
          <button key={o.v} type="button" role="radio" data-v={o.v} aria-checked={value === o.v} tabIndex={value === o.v ? 0 : -1} disabled={o.disabled}
            aria-describedby={o.disabled ? `${id}-why` : undefined} onClick={() => onChange(o.v)}>{o.label}</button>
        ))}
      </span>
      {videoDisabledReason && <span id={`${id}-why`} className="smode-why caption">{videoDisabledReason}</span>}
    </span>
  );
}

export function SongTransport({ track, title, mode, onMode, videoDisabledReason, controller, action, noTrack, className }: { track: Track | null; title: string; mode?: SongMode; onMode?: (m: SongMode) => void; videoDisabledReason?: ReactNode; /** Video mode: the video's own state and actions drive the transport */ controller?: MediaController | null; action?: ReactNode; /** why nothing plays when there is no song file */ noTrack?: ReactNode; className?: string }) {
  const p = usePlayer();
  const st = useTrackState(track);
  const ctl: MediaController | null = controller ?? (track ? { playing: st.playing, time: st.time, duration: st.duration, toggle: () => p.toggle(track), seek: (t) => { if (st.mine) p.seek(t); else p.play(track, t); } } : null);
  return (
    <div className={cls('stransport', className)} dir="ltr" role="group" aria-label={'Playback controls'} data-mode={mode}>
      <div className="stransport-lead">
        {controller ? (
          <button type="button" className="pdisc" data-size={56} data-tone="ivory" aria-label={controller.playing ? `Pause ${title}` : `Play ${title}`} onClick={controller.toggle}>
            {controller.playing ? <IconPause aria-hidden /> : <IconPlay aria-hidden className="pdisc-play" />}
          </button>
        ) : track ? <PlayDisc track={track} size={56} tone="ivory" labelPlay={`Play ${title}`} labelPause={`Pause ${title}`} />
          : <button type="button" className="pdisc" data-size={56} data-tone="ivory" disabled aria-label={`Play ${title}`}><IconPlay aria-hidden className="pdisc-play" /></button>}
        {mode && onMode && <SongVideoSwitch value={mode} onChange={onMode} videoDisabledReason={videoDisabledReason} />}
      </div>
      {ctl ? (
        <div className="stransport-seek">
          <span className="mono stransport-t">{fmtClock(ctl.time)}</span>
          <SeekBar time={ctl.time} duration={ctl.duration} step={0.1} onSeek={ctl.seek} label={'Seek'} tone="quiet" />
          <span className="mono stransport-t">{fmtClock(ctl.duration)}</span>
          {!controller && <SharedVolume popover />}
        </div>
      ) : noTrack ? <p className="stransport-none caption">{noTrack}</p> : null}
      {action && <div className="stransport-action">{action}</div>}
    </div>
  );
}
