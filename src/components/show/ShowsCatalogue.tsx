'use client';

import { useMemo, useState } from 'react';
import { useStudio } from '@/studio/store';
import { useShell } from '@/components/shell/context';
import { EmptyState, FilterChips, SearchField, Skeleton, SkeletonRegion } from '@/components/ui/kit';
import { MediaTileSkeleton, StartCard } from '@/components/media';
import { filterShows, showCards, waitingProductions, type ShowFilter } from './model';
import { NewShowButton, ShowTile } from './parts';

/** SHOWS — the series catalogue: a wall of 16:9 key art (3 · 2 · 1 columns), each show's name, its seasons and
 *  episodes and where it stands. New show is the page's one primary (Auto, or Manual from the split). Filters appear only
 *  when there are more than six shows. An empty studio gets the title, one sentence and the two start cards (§5.23). */

const FILTERS: Array<{ id: ShowFilter; label: string }> = [
  { id: 'all', label: 'All' }, { id: 'working', label: 'In production' }, { id: 'waiting', label: 'Waiting for you' }, { id: 'finished', label: 'Finished' },
];

export function ShowsCatalogue() {
  const { state } = useStudio();
  const { decisions } = useShell();
  const waiting = useMemo(() => waitingProductions(decisions.items), [decisions]);
  const cards = useMemo(() => showCards(state, waiting), [state, waiting]);
  const [q, setQ] = useState('');
  const [f, setF] = useState<ShowFilter>('all');
  const shown = useMemo(() => filterShows(cards, q, f), [cards, q, f]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((x) => [x.id, filterShows(cards, '', x.id).length])) as Record<ShowFilter, number>, [cards]);
  const filters = cards.length > 6;

  if (cards.length === 0) return <div className="shows" data-state="empty"><EmptyShows /></div>;
  return (
    <div className="shows" data-state="shows">
      <header className="shows-page-head">
        <div className="shows-page-title">
          <h1 className="t-page shows-head-h">Shows{cards.length > 0 && <span className="shows-count t-ro t-ro-md">{cards.length}</span>}</h1>
          <p className="t-body">Series with seasons and episodes that share one cast and one world.</p>
        </div>
        <div className="shows-page-acts"><NewShowButton /></div>
      </header>

      {filters && (
        <div className="shows-filters">
          <SearchField value={q} onChange={setQ} label="Search shows" className="shows-search" />
          <FilterChips label="Show status" value={f === 'all' ? [] : [f]} onChange={(v) => setF((v[0] as ShowFilter | undefined) ?? 'all')}
            options={FILTERS.filter((x) => x.id !== 'all').map((x) => ({ value: x.id, label: x.label, count: counts[x.id] }))} />
        </div>
      )}
      {shown.length === 0 ? (
        <EmptyState action={<button type="button" className="btn btn-secondary btn-sm" onClick={() => { setQ(''); setF('all'); }}>Clear the filters</button>}>
          No show matches {q.trim() ? `“${q.trim()}”` : 'this filter'}.
        </EmptyState>
      ) : (
        <ul className="shows-grid" role="list" aria-label="Shows">
          {shown.map((c, i) => <li key={c.id}><ShowTile c={c} priority={i < 3} /></li>)}
        </ul>
      )}
    </div>
  );
}

/** No show yet (§5.23 empty page): the page title, one sentence, and the two ways in as start cards in the key art's
 *  own shape — no steps, no illustration (the Create page explains Auto and Manual). */
function EmptyShows() {
  return (
    <EmptyState kind="page" title="Shows" className="shows-empty"
      cards={<><StartCard href="/new/show?mode=auto" ratio="16/9" title="Let the studio propose" line="From one line of yours" /><StartCard href="/new/show?mode=manual" ratio="16/9" title="Write it yourself" line="Your premise, your world, your cast" /></>}>
      A show is seasons of episodes with one cast and one world; start the first one from a line of yours, or write it, and approve each step.
    </EmptyState>
  );
}

/** /shows while the studio's first snapshot loads: the head, then a 3 · 2 · 1 grid of key-art tiles in their final
 *  sizes (the same classes size them). */
export function ShowsSkeleton() {
  return (
    <SkeletonRegion label="Opening the shows…" className="shows shows-skeleton">
      <div className="shows-page-head">
        <div className="shows-page-title">
          <div className="t-page"><Skeleton.Line size="title" width="7rem" /></div>
          <div className="t-body"><Skeleton.Line width="22rem" /></div>
        </div>
        <div className="shows-page-acts"><Skeleton.Block width={144} height={40} radius="pill" /></div>
      </div>
      <div className="shows-grid">
        {Array.from({ length: 6 }, (_, i) => <div key={i}><MediaTileSkeleton ratio="16/9" /></div>)}
      </div>
    </SkeletonRegion>
  );
}
