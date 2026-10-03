'use client';

import type { ReactNode } from 'react';
import { useT } from '@/components/ui/locale';
import { cls } from '@/components/ui/kit';
import { PlayDisc } from '../PlayDisc';
import { usePlayer, useTrackState, type Track } from '../PlayerProvider';
import { fmtClock } from '../time';
import { Waveform } from '../Waveform';

/** THE VOICE REEL (docs/DESIGN-SYSTEM-V4.md §5.13 VoicePreview; Character profile header, cast rows) — a 32 px ivory
 *  disc, the voice's name in words, a 64-bar mini waveform (LTR) drawn from the recording, the time, and the line it
 *  speaks in its own language. The origin label comes from the voice identity contract ("Studio-designed synthetic
 *  voice", "Recording — kitchen take 2"); no engine or model name ever appears (V4-10). */

export function VoicePreview({ track, name, line, lineLang, origin, className }: { track: Track; name: string; line?: string; lineLang?: string; origin?: ReactNode; className?: string }) {
  const T = useT();
  const p = usePlayer();
  const st = useTrackState(track);
  const progress = st.duration ? st.time / st.duration : 0;
  return (
    <div className={cls('vreel', className)}>
      <div className="vreel-row" dir="ltr">
        <PlayDisc track={track} size={32} tone="ivory" labelPlay={T.f('media.voice.play', { name })} labelPause={T.f('media.voice.pause', { name })} />
        <Waveform src={track.src} progress={progress} buckets={64} height={28} className="vreel-wave" showLabel={false} label={`${T('media.wave.label')}: ${name}`} unavailableText={T('media.wave.unavailable')} duration={st.duration}
          onSeek={(f) => { const t = f * (st.duration || track.duration || 0); if (st.mine) p.seek(t); else p.play(track, t); }} />
        <span className="mono vreel-time">{fmtClock(st.mine ? st.time : st.duration)}</span>
      </div>
      <p className="vreel-meta">
        <span className="vreel-name" dir="auto">{name}</span>
        {origin && <span className="vreel-origin"> · {origin}</span>}
      </p>
      {line && <p className="vreel-line" dir="auto" lang={lineLang}><q>{line}</q></p>}
    </div>
  );
}
