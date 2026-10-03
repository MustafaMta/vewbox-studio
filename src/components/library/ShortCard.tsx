'use client';

import Link from 'next/link';
import { artVars } from '@/studio/presentation';
import { Frame } from '@/components/media/Frame';
import { IconPlay } from '@/components/ui/icons';
import type { PosterCard } from '@/components/film/model';

/** A SHORT IN THE CATALOGUE (docs/DESIGN-SYSTEM-V5.md §8.4; Home's poster shelf card, the approved reference): the 2:3
 *  poster — key art, else the composed frame poster, else a title card in the poster's shape — with the title and
 *  "runtime · status" on the poster scrim. The whole poster is one link to the film's page; a finished film also has a
 *  play button (shown on hover and focus, always on touch) that opens it in the Screening Room in one click.
 *
 *  The card's look comes from Home's media card classes until the kit's PosterCard reaches main. */
export function ShortCard({ card, priority }: { card: PosterCard; priority?: boolean }) {
  return (
    <div className="short-card">
      <Link className="home-media short-card-link" href={card.href} title={card.title}>
        <Frame asset={card.asset} src={card.src} ratio="2/3" fit="cover" alt="" radius="none" className="home-media-frame" art={artVars(card.asset)}
          title={card.title} titleLang={card.lang} titleState="noPoster" decorative priority={priority} style={{ aspectRatio: '2 / 3' }}>
          <span className="home-media-words">
            <span className="home-media-title name"><bdi lang={card.lang}>{card.title}</bdi></span>
            <span className="home-media-meta">{card.meta}</span>
          </span>
        </Frame>
      </Link>
      {card.screenHref && (
        <Link className="btn btn-secondary btn-icon short-card-play" href={card.screenHref} aria-label={`Screen ${card.title}`} title="Screen it"><IconPlay aria-hidden /></Link>
      )}
    </div>
  );
}
