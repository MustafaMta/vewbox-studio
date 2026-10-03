'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '@/components/ui/locale';
import { PlayDisc } from '@/components/players/PlayDisc';
import type { Track } from '@/components/players/PlayerProvider';
import { prefersReducedMotion } from '@/components/players/prefs';
import { TileShell, type TileProps } from './TileShell';

/** THE SEVEN TILES BY SHAPE (docs/DESIGN-SYSTEM-V4.md §0 decision 2, §4.3, §5.5). Shape is identity: from the
 *  silhouette alone you can tell which content type a page belongs to. Every tile is the shared anatomy of TileShell
 *  with its own ratio, title size and extra. Pages pass words and status; tiles invent nothing. */

/** Show: 16:9 key art, title 16/22; hover and focus reveal the 2-line logline (always in the accessible name). */
export function KeyArtTile({ logline, ...p }: TileProps & { logline?: ReactNode }) {
  return <TileShell {...p} kind="keyart" ratio="16/9" titleState={p.titleState ?? 'noKeyArt'} reveal={logline} />;
}

/** Short: 2:3 poster. A vertical short with no poster shows its 9:16 cover inside the frame (`contain`). */
export function PosterTile({ contain, ...p }: TileProps & { contain?: boolean }) {
  return <TileShell {...p} kind="poster" ratio="2/3" fit={contain ? 'contain' : 'cover'} titleState={p.titleState ?? 'noPoster'} />;
}

/** Music video: 1:1 sleeve; the performers on a second line; the play disc previews the song on the shared player. */
export function SleeveTile({ performers, performersLang, track, ...p }: TileProps & { performers?: ReactNode; performersLang?: string; track?: Track | null }) {
  const T = useT();
  return (
    <TileShell {...p} kind="sleeve" ratio="1/1" titleState={p.titleState ?? 'noSleeve'} sub={performers} subLang={performersLang}
      disc={track ? <PlayDisc track={track} size={40} labelPlay={T.f('media.play', { title: p.title })} labelPause={T.f('media.pause', { title: p.title })} /> : undefined} />
  );
}

/** Character: the full-length figure at its native 928:1664 on `--art-edge` (no black bars, V4-02); the role on one
 *  line; the voice disc plays the identity sample when a voice exists. */
export function FigureTile({ role, roleLang, voice, ...p }: TileProps & { role?: ReactNode; roleLang?: string; voice?: Track | null }) {
  const T = useT();
  return (
    <TileShell {...p} kind="figure" ratio="928/1664" fit="contain" titleState={p.titleState ?? 'noImage'} sub={role} subLang={roleLang}
      disc={voice ? <PlayDisc track={voice} size={40} labelPlay={T.f('media.cast.voice', { name: p.title })} labelPause={T.f('media.cast.voicePause', { name: p.title })} /> : undefined} />
  );
}

/** Location: a 16:9 focal crop of the 7:4 plate. Hover crossfades through the lighting states, one second each; not
 *  under reduced motion. */
export function PlateTile({ lighting = [], ...p }: TileProps & { lighting?: Array<{ src: string; label?: string }> }) {
  const [i, setI] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; setI(0); };
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  const start = () => {
    if (lighting.length === 0 || timer.current || prefersReducedMotion()) return;
    timer.current = setInterval(() => setI((x) => (x + 1) % (lighting.length + 1)), 1000);
  };
  const layers = lighting.length > 0 && (p.asset?.src ?? p.src) ? lighting.map((l, k) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img key={l.src} src={l.src} alt="" aria-hidden className="mtile-light" data-on={i === k + 1 || undefined} loading="lazy" decoding="async" />
  )) : undefined;
  return <TileShell {...p} kind="plate" ratio="16/9" titleState={p.titleState ?? 'noImage'} frameLayers={layers} onPointerEnter={start} onPointerLeave={stop} />;
}

/** A 16:9 still standing for an episode, a cut or a trailer: the kind label above the title ("Episode 3", "Cut 4"),
 *  two lines of synopsis, the slate, and the duration chip on the frame. */
export function StillCard({ kindLabel, synopsis, duration, number, ...p }: TileProps & { kindLabel?: ReactNode; synopsis?: ReactNode; duration?: string; number?: number }) {
  const T = useT();
  return (
    <TileShell {...p} kind="still" ratio="16/9" kindLabel={kindLabel} synopsis={synopsis} number={number} titleState={p.titleState ?? 'notMade'}
      chip={duration ? <><span className="tc" aria-hidden>{duration}</span><span className="sr-only">{T.f('media.duration', { t: duration })}</span></> : undefined} />
  );
}
