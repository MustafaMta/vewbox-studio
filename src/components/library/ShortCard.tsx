'use client';

import Link from 'next/link';
import { PosterCard } from '@/components/media';
import { IconPlay } from '@/components/ui/icons';
import type { PosterCard as PosterCardModel } from '@/components/film/model';

/** A SHORT IN THE CATALOGUE (docs/DESIGN-SYSTEM-V5.md §8.4): the kit's 2:3 PosterCard — key art, else the composed
 *  frame poster, else a title card in the poster's shape — with the title and "runtime · status" on the poster scrim;
 *  the whole poster is one link to the film's page. A finished film also has a play button beside it (shown on hover
 *  and focus, always on touch) that opens it in the Screening Room in one click. */
export function ShortCard({ card, priority }: { card: PosterCardModel; priority?: boolean }) {
  return (
    <div className="short-card">
      <PosterCard href={card.href} asset={card.asset} src={card.src} title={card.title} titleLang={card.lang} meta={card.meta} priority={priority} />
      {card.screenHref && (
        <Link className="btn btn-secondary btn-icon short-card-play" href={card.screenHref} aria-label={`Screen ${card.title}`} title="Screen it"><IconPlay aria-hidden /></Link>
      )}
    </div>
  );
}
