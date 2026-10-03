'use client';

import { useMemo, useState } from 'react';
import { useStudio } from '@/studio/store';
import { Skeleton, SkeletonRegion } from '@/components/ui/kit';
import { ShortCard } from '@/components/library/ShortCard';
import { shortsCatalogue, type PosterCard } from './model';
import { NewShortButton, StartPosterCard } from './parts';

/** SHORTS — the catalogue of single films (docs/DESIGN-SYSTEM-V5.md §8.4 under docs/design/VISUAL-STANDARD-V5.1.md):
 *  the page title with the count and one line, New short as the page's primary (split: let the studio propose, or
 *  write it yourself), then the films as cinematic 2:3 posters — five across on a desktop, three on a tablet, two on a
 *  phone — each with its runtime (from the cut) and where it stands; a finished film opens in the Screening Room in one
 *  click. The grid ends with a start card in the poster's own shape; an empty studio shows only that card. Filters
 *  appear only when there are more than six films. */

type Filter = 'all' | 'working' | 'finished';
const FILTERS: Array<{ id: Filter; label: string; keep: (c: PosterCard) => boolean }> = [
  { id: 'all', label: 'All', keep: () => true },
  { id: 'working', label: 'In production', keep: (c) => c.status.tone !== 'ok' },
  { id: 'finished', label: 'Finished', keep: (c) => c.status.tone === 'ok' },
];

export function ShortsCatalogue() {
  const { state } = useStudio();
  const cards = useMemo(() => shortsCatalogue(state), [state]);
  const [filter, setFilter] = useState<Filter>('all');
  const shown = cards.filter(FILTERS.find((f) => f.id === filter)!.keep);
  return (
    <div className="shorts">
      <header className="shorts-head">
        <div className="shorts-head-words">
          <h1 className="t-page shorts-title">Shorts</h1>
          <p className="t-body shorts-lead">Single films, each from one line.</p>
        </div>
        <NewShortButton />
      </header>
      {cards.length > 6 && (
        <div className="shorts-filters" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}<span className="count">{cards.filter(f.keep).length}</span>
            </button>
          ))}
        </div>
      )}
      <ul className="shorts-grid" role="list" aria-label="Short films">
        {shown.map((c, i) => <li key={c.id}><ShortCard card={c} priority={i < 10} /></li>)}
        {filter !== 'finished' && <li><StartPosterCard title={cards.length ? 'New short' : 'Your first short'} line={cards.length ? 'Your next film' : 'A line is enough to start'} /></li>}
      </ul>
    </div>
  );
}

/** The catalogue while the studio's first snapshot loads: the head and ten posters in the grid's exact sizes. */
export function ShortsSkeleton() {
  return (
    <SkeletonRegion label="Opening the shorts…" className="shorts shorts-skeleton">
      <div className="shorts-head">
        <div className="shorts-head-words">
          <div className="t-page shorts-title"><Skeleton.Line size="title" width="7rem" /></div>
          <div className="t-body shorts-lead"><Skeleton.Line width="15rem" /></div>
        </div>
        <Skeleton.Block width={152} height={40} radius="pill" />
      </div>
      <div className="shorts-grid">
        {Array.from({ length: 10 }, (_, i) => <div key={i}><Skeleton.Media ratio="2/3" className="short-skel" /></div>)}
      </div>
    </SkeletonRegion>
  );
}
