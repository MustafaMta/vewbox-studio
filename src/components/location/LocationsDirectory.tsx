'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useStudio } from '@/studio/store';
import { search } from '@/studio/selectors';
import { CatalogueBar, MenuButton, MenuLink } from '@/components/ui/kit';
import { StartCard } from '@/components/media';
import { IconChevronDown } from '@/components/ui/icons';
import { LocationCard } from '@/components/library/LocationCard';
import { CastSection, PageHead } from '@/components/character/parts';

/** LOCATIONS — the scouting board (v5 §8.13): every place as a 16:9 plate tile, three across on desktop, two on a
 *  tablet, one on a phone; the last tile starts a new one. "New location" is the page's primary, a split: Auto by
 *  default, Manual from its menu. Search appears once the board is larger than six. */
export function NewLocationSplit() {
  return (
    <div className="btn-split">
      <Link className="btn btn-primary" href="/locations/new">New location</Link>
      <MenuButton label="More ways to create a location" iconOnly icon={<IconChevronDown aria-hidden />} variant="primary" align="end">
        <MenuLink href="/locations/new" description="Describe the place in one line; the studio draws the plates">Auto</MenuLink>
        <MenuLink href="/locations/new?start=manual" description="Name, kind, landmarks, props and lighting">Manual</MenuLink>
      </MenuButton>
    </div>
  );
}

export function LocationsDirectory() {
  const { state } = useStudio();
  const [q, setQ] = useState('');
  const all = state.locations;
  const shown = search(all, q);
  return (
    <div className="pc-page">
      <PageHead title="Locations" count={all.length || undefined} description="Every place your productions are filmed in, as plates the studio draws from." actions={<NewLocationSplit />} />
      {all.length === 0 ? (
        <CastSection id="loc-first" title="Scout your first place" description="Describe it in one line, or write it down field by field.">
          <ul className="pc-plates" role="list">
            <li><StartCard href="/locations/new" ratio="16/9" title="Auto" line="Describe the place in one line" /></li>
            <li><StartCard href="/locations/new?start=manual" ratio="16/9" title="Manual" line="Write it field by field" /></li>
          </ul>
        </CastSection>
      ) : (
        <>
          {all.length > 6 && <div className="pc-bar"><CatalogueBar q={q} onQ={setQ} placeholder="Search the locations" /></div>}
          {shown.length === 0 ? <p className="t-body pc-empty-line pc-none">No location matches “{q}”.</p> : (
            <ul className="pc-plates" aria-label="The locations" role="list">
              {shown.map((l, i) => <li key={l.id}><LocationCard l={l} priority={i < 6} /></li>)}
              {!q && <li><StartCard href="/locations/new" ratio="16/9" title="New location" line="Auto or manual" /></li>}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** The board's skeleton lives in ./skeletons (drawn synchronously by the shell); re-exported for the page. */
export { LocationsSkeleton } from './skeletons';
