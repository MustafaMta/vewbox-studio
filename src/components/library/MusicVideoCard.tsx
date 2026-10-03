'use client';

import type { Production } from '@/domain/types';
import type { useStudio } from '@/studio/store';
import { SleeveCard, TitleCard } from '@/components/media';
import { PlayDisc } from '@/components/players/PlayDisc';
import { performersLine, type SleeveItem } from '@/components/music/model';

/** A music video in the catalogue: the kit's SleeveCard (the 1:1 sleeve with the song's title and one line over the
 *  poster scrim — Home's shelf cards) with the performers, the length and the status in that line. The play disc
 *  previews the real song on the studio's one audio source; it is a sibling of the card's link (never inside it),
 *  shows on hover, focus and touch, and exists only when the song's file does. */
export function MusicVideoCard({ item, priority }: { item: SleeveItem; priority?: boolean }) {
  const meta = [item.performers || 'No performers yet', item.duration, item.status.words].filter(Boolean).join(' · ');
  return (
    <div className="mv-item" data-playable={item.track ? '' : undefined}>
      <SleeveCard href={item.href} title={item.title} titleLang={item.lang} meta={meta} asset={item.asset} src={item.src} priority={priority} className="mv-card" />
      {item.track && (
        <span className="mv-disc">
          <PlayDisc track={item.track} size={40} tone="chip" labelPlay={`Play ${item.title}`} labelPause={`Pause ${item.title}`} />
        </span>
      )}
    </div>
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
