'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useStudio } from '@/studio/store';
import { useShell } from '@/components/shell/context';
import { ShapeGlyph, Skeleton, SkeletonRegion } from '@/components/ui/kit';
import { MediaTileSkeleton } from '@/components/media';
import { IconSearch } from '@/components/ui/icons';
import { filterShows, showCards, waitingProductions, type ShowFilter } from './model';
import { NewShowButton, ShowTile } from './parts';

/** SHOWS — the series catalogue: a wall of 16:9 key art (3 · 2 · 1 columns), each show's name, its seasons and
 *  episodes and where it stands. New show is the page's one primary (Auto, or Manual from the split). Filters appear only
 *  when there are more than six shows. An empty studio gets the first show's start, in the key art's own shape. */

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

  return (
    <div className="shows" data-state={cards.length ? 'shows' : 'empty'}>
      <header className="shows-page-head">
        <div className="shows-page-title">
          <h1 className="t-page shows-head-h">Shows{cards.length > 0 && <span className="shows-count t-ro t-ro-md">{cards.length}</span>}</h1>
          <p className="t-body">Series with seasons and episodes that share one cast and one world.</p>
        </div>
        {cards.length > 0 && <div className="shows-page-acts"><NewShowButton /></div>}
      </header>

      {cards.length === 0 ? <EmptyShows /> : (
        <>
          {filters && (
            <div className="shows-filters" role="search">
              <label className="shows-search">
                <IconSearch aria-hidden />
                <span className="sr-only">Search shows</span>
                <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search shows" dir="auto" />
              </label>
              <div className="shows-chips" role="group" aria-label="Show status">
                {FILTERS.map((x) => (
                  <button key={x.id} type="button" className="chip" aria-pressed={f === x.id} onClick={() => setF(x.id)}>
                    {x.label}<span className="count">{counts[x.id]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {shown.length === 0 ? (
            <div className="show-empty-line">
              <p className="t-body">No show matches {q.trim() ? `“${q.trim()}”` : 'this filter'}.</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setQ(''); setF('all'); }}>Clear the filters</button>
            </div>
          ) : (
            <ul className="shows-grid" role="list" aria-label="Shows">
              {shown.map((c, i) => <li key={c.id}><ShowTile c={c} priority={i < 3} /></li>)}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** No show yet: the first show's start in the key art's shape (two ways in), beside how a show is made. */
function EmptyShows() {
  return (
    <section className="shows-empty" aria-labelledby="shows-empty-h">
      <div className="shows-empty-start">
        <span className="corners" aria-hidden />
        <div className="shows-empty-words">
          <ShapeGlyph shape="show" size={24} />
          <h2 id="shows-empty-h" className="t-section">Your first show</h2>
          <p className="t-lead">One line is enough: the studio proposes a premise, a cast and Season 1, and you approve each step.</p>
          <div className="shows-empty-acts">
            <Link className="btn btn-primary" href="/new/show?mode=auto">Let the studio propose</Link>
            <Link className="btn btn-secondary" href="/new/show?mode=manual">Write it yourself</Link>
          </div>
        </div>
      </div>
      <ol className="card shows-empty-steps" aria-label="How a show is made">
        <li><span className="count shows-step-n">1</span><span><span className="t-card">A premise and a world</span><span className="t-body">The rules, the places and the people every episode shares.</span></span></li>
        <li><span className="count shows-step-n">2</span><span><span className="t-card">Seasons of episodes</span><span className="t-body">Each episode is a film: story, storyboard, filming and the cut.</span></span></li>
        <li><span className="count shows-step-n">3</span><span><span className="t-card">One cast throughout</span><span className="t-body">Characters keep their canonical look and voice in every episode.</span></span></li>
      </ol>
    </section>
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
