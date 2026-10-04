'use client';

import type { ReactNode } from 'react';
import { IconPlay } from '@/components/ui/icons';
import { AudioRow } from '@/components/players/Controls';
import type { Track } from '@/components/players/PlayerProvider';

/** A VOICE LINE as the kit's audio row (docs/design/VISUAL-STANDARD-V5.1.md §5.24): play, the line in quotes over one
 *  meta line, the waveform as a seek slider and the time — on the studio's one shared source, so nothing overlaps and
 *  nothing autoplays. `action` sits at the row's end (Choose, Use as reference); a line without a playable file is the
 *  same row, its play button inert and the reason in the meta line. */
export function VoicePlayer({ track, name, detail, source, selected, action, unavailableText = 'Recording unavailable', className = '' }: {
  track: Track | null; name: string; detail?: ReactNode; source?: 'SAMPLE' | 'UPLOADED' | 'GENERATED'; selected?: boolean; action?: ReactNode; unavailableText?: string; className?: string;
}) {
  const sourceWord = source === 'UPLOADED' ? 'Recording' : source === 'GENERATED' ? 'Spoken by the studio' : source === 'SAMPLE' ? 'Sample' : null;
  const meta = [track ? detail : unavailableText, sourceWord].filter(Boolean);
  const metaNode = meta.length ? <>{meta.map((m, i) => <span key={i}>{i > 0 && ' · '}{m}</span>)}</> : undefined;
  const row = track
    ? <AudioRow track={{ ...track, title: name }} meta={metaNode} className="pc-arow-row" />
    : (
      <div className="arow pc-arow-row" role="group" aria-label={name} dir="ltr" data-off>
        <span className="btn btn-icon btn-secondary pc-arow-off" aria-hidden><IconPlay /></span>
        <span className="arow-words"><span className="arow-title"><bdi>{name}</bdi></span>{metaNode && <span className="arow-meta">{metaNode}</span>}</span>
      </div>
    );
  if (!action && !selected) return className ? <div className={className}>{row}</div> : row;
  return <div className={`pc-arow ${className}`} data-selected={selected || undefined}>{row}{action && <span className="pc-arow-end">{action}</span>}</div>;
}
