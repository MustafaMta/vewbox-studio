'use client';

import type { ReactNode } from 'react';
import type { Production } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { SleeveTile, TitleCard } from '@/components/media';
import { StateWord } from '@/components/ui/kit';
import { performersLine, type SleeveItem } from '@/components/music/model';
import { artVars } from '@/studio/presentation';

/** A music video in the catalogue (docs/design/VISUAL-STANDARD-V5.1.md §5.6 "Sleeve"): the square sleeve with no box,
 *  the song title on one line, the performers, then the length and the status word. The play disc previews the real
 *  song on the studio's one audio source; it appears on hover, focus and touch, and only when the file exists. The
 *  sleeve without art is the title card in the sleeve's own shape. */
export function MusicVideoCard({ item, menu }: { item: SleeveItem; menu?: ReactNode }) {
  return (
    <SleeveTile href={item.href} title={item.title} titleLang={item.lang} asset={item.asset} src={item.src} art={artVars(item.asset)}
      performers={item.performers || 'No performers yet'} performersLang={item.performersLang} track={item.track} titleState="noSleeve"
      slate={[item.duration && <span className="num">{item.duration}</span>]} status={<StateWord tone={item.status.tone}>{item.status.words}</StateWord>}
      menu={menu} className="mv-tile" />
  );
}

/** The sleeve of a song without cover art: its title card in the 1:1 shape (no colour field, no shouting). */
export function TrackCover({ title, className = '' }: { title: string; artist?: string | null; className?: string }) {
  return <TitleCard title={title} ratio="1/1" state="noSleeve" className={className} decorative />;
}

/** The performers of a music video as one line ("Layla & Karim"), or `fallback` when nobody is named. */
export function artistOf(state: ReturnType<typeof useStudio>['state'], p: Production, fallback: string): string {
  return performersLine(state, p) || fallback;
}
