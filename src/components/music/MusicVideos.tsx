'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useStudio } from '@/studio/store';
import { ProductionsSwitch } from '@/components/shell/ProductionsSwitch';
import { EmptyState, MenuButton, MenuLink } from '@/components/ui/kit';
import { StartCard } from '@/components/media';
import { IconAuto, IconChevronDown, IconUpload } from '@/components/ui/icons';
import { MusicVideoCard } from '@/components/library/MusicVideoCard';
import { catalogue, filterItems, type CatalogueFilter } from './model';

/** MUSIC VIDEOS — the catalogue (docs/design/PAGE-ENGINEERING-BRIEF.md; VISUAL-STANDARD-V5.1 §5.6, §5.15, §5.23): a
 *  record shelf of square sleeves (the kit's SleeveCard, Home's shelf card), five across on desktop, three on a tablet,
 *  two on a phone; each with the song's title, who sings it, its length and its status, and the real song to preview
 *  on hover, focus or touch. One primary action starts a new one, by the studio (Auto) or from the producer's own song
 *  (Manual). An empty studio shows the title, one sentence and the two ways in, in the sleeve's own shape (§5.23). */

export const NEW_AUTO = '/new/music-video?mode=auto';
export const NEW_MANUAL = '/new/music-video?mode=manual';

function NewMusicVideo() {
  return (
    <div className="btn-split mv-new">
      <Link className="btn btn-primary" href={NEW_AUTO}>New music video</Link>
      <MenuButton label="Choose how to start" iconOnly icon={<IconChevronDown aria-hidden />} variant="primary" align="end">
        <MenuLink href={NEW_AUTO} icon={<IconAuto aria-hidden />} description="Lyrics, music and singers from one line">Let the studio write the song</MenuLink>
        <MenuLink href={NEW_MANUAL} icon={<IconUpload aria-hidden />} description="Upload a track; the studio listens to it">Bring your own song</MenuLink>
      </MenuButton>
    </div>
  );
}

const FILTERS: Array<{ id: CatalogueFilter; label: string }> = [{ id: 'all', label: 'All' }, { id: 'working', label: 'In progress' }, { id: 'finished', label: 'Finished' }];

export function MusicVideos() {
  const { state } = useStudio();
  const all = useMemo(() => catalogue(state), [state]);
  const [filter, setFilter] = useState<CatalogueFilter>('all');
  const items = filterItems(all, filter);
  const empty = all.length === 0;

  if (empty) {
    return (
      <div className="mv-cat" data-state="empty">
        <ProductionsSwitch />
        <EmptyState kind="page" title="Music videos" className="mv-empty"
          cards={<><StartCard href={NEW_AUTO} ratio="1/1" title="Write the song" line="From one line of yours" /><StartCard href={NEW_MANUAL} ratio="1/1" title="Bring your own song" line="Upload your own track" /></>}>
          It starts with its song. Write it with the studio from one line, or bring a track you already have.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="mv-cat" data-state="list">
      <ProductionsSwitch />
      <header className="mv-cat-head">
        <div className="mv-cat-words">
          <h1 className="t-page mv-cat-title">Music videos</h1>
          <p className="t-body mv-cat-desc">Each one starts with its song.</p>
        </div>
        <NewMusicVideo />
      </header>
      {all.length > 6 && (
        <div className="mv-filters" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}<span className="count">{filterItems(all, f.id).length}</span>
            </button>
          ))}
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState action={<button type="button" className="btn btn-secondary btn-sm" onClick={() => setFilter('all')}>Show all</button>}>Nothing here yet.</EmptyState>
      ) : (
        <ul className="mv-grid" role="list" aria-label="Music videos">
          {items.map((it, i) => <li key={it.id}><MusicVideoCard item={it} priority={i < 10} /></li>)}
        </ul>
      )}
    </div>
  );
}

/** The catalogue's skeleton lives in ./skeletons (drawn synchronously by the shell); re-exported for the page. */
export { MusicVideosSkeleton } from './skeletons';
