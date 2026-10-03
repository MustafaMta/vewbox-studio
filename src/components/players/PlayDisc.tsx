'use client';

import { cls } from '@/components/ui/kit/cls';
import { IconPause, IconPlay } from '@/components/ui/icons';
import { usePlayer, useTrackState, type Track } from './PlayerProvider';

/** THE PLAY DISC (docs/DESIGN-SYSTEM-V4.md §5.5, §5.8, §5.13) — a round play/pause for one track on the studio's one
 *  audio source. `chip`: on a picture, the solid `--chip-on-art` ground (never blurred) — the sleeve and voice discs of
 *  tiles (40), the cast disc (28). `ivory`: the primary of its region — the song transport (56), the voice reel (32). `secondary`: off the picture, beside a name (36; the figure card's voice disc).
 *  Its name says what it plays ("Play Rooftop Radio"); the play glyph is never mirrored. It never sits inside a link:
 *  tiles render it as a sibling of their link. */

export function PlayDisc({ track, size = 40, tone = 'chip', labelPlay, labelPause, className }: { track: Track; size?: 28 | 32 | 36 | 40 | 56; tone?: 'chip' | 'ivory' | 'secondary'; labelPlay: string; labelPause: string; className?: string }) {
  const p = usePlayer();
  const st = useTrackState(track);
  const busy = st.mine && p.status === 'loading' && !p.playing;
  return (
    <button type="button" className={cls('pdisc', className)} data-size={size} data-tone={tone} data-playing={st.playing || undefined}
      aria-label={st.playing ? labelPause : labelPlay} aria-busy={busy || undefined}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); p.toggle(track); }}>
      {busy ? <span aria-hidden className="pdisc-wait" /> : st.playing ? <IconPause aria-hidden /> : <IconPlay aria-hidden className="pdisc-play" />}
    </button>
  );
}
