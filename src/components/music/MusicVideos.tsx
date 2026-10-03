'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useStudio } from '@/studio/store';
import { MenuButton, MenuLink, Skeleton, SkeletonRegion } from '@/components/ui/kit';
import { IconAuto, IconChevronDown, IconUpload } from '@/components/ui/icons';
import { MusicVideoCard } from '@/components/library/MusicVideoCard';
import { MusicVideoMenu } from './MusicVideoMenu';
import { StartSleeve } from './pending';
import { catalogue, filterItems, type CatalogueFilter } from './model';

/** MUSIC VIDEOS — the catalogue (docs/design/PAGE-ENGINEERING-BRIEF.md; VISUAL-STANDARD-V5.1 §5.6, §5.15, §5.23): a
 *  record shelf of square sleeves, five across on desktop, three on a tablet, two on a phone; each with the song's
 *  title, who sings it, its length and its status, and the real song to preview on hover, focus or touch. One primary
 *  action starts a new one, by the studio (Auto) or from the producer's own song (Manual). An empty studio shows the
 *  two ways in, in the sleeve's own shape. */

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
  const byId = useMemo(() => new Map(state.productions.map((p) => [p.id, p])), [state.productions]);

  return (
    <div className="mv-cat" data-state={empty ? 'empty' : 'list'}>
      <header className="mv-cat-head">
        <div className="mv-cat-words">
          <h1 className="t-page mv-cat-title">Music videos</h1>
          <p className="t-body mv-cat-desc">{empty ? 'It starts with its song.' : 'Each one starts with its song.'}</p>
        </div>
        {!empty && <NewMusicVideo />}
      </header>

      {empty ? (
        <section className="mv-empty" aria-labelledby="mv-empty-h">
          <h2 id="mv-empty-h" className="sr-only">Make your first music video</h2>
          <ul className="mv-grid" role="list">
            <li><StartSleeve href={NEW_AUTO} title="Write the song" line="From one line of yours" glyph={<IconAuto />} /></li>
            <li><StartSleeve href={NEW_MANUAL} title="Bring your own song" line="Upload your own track" glyph={<IconUpload />} /></li>
          </ul>
          <ol className="mv-steps" role="list">
            <li><span className="t-ro mv-step-n">1</span><span className="t-card">The song</span><span className="t-body">Lyrics, music and the voices that sing it, section by section.</span></li>
            <li><span className="t-ro mv-step-n">2</span><span className="t-card">The performers</span><span className="t-body">Your characters sing it: each section has its singer.</span></li>
            <li><span className="t-ro mv-step-n">3</span><span className="t-card">The video</span><span className="t-body">Storyboarded to the song’s sections and cut to its beat.</span></li>
          </ol>
        </section>
      ) : (
        <>
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
            <p className="t-body mv-none">Nothing here yet. <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFilter('all')}>Show all</button></p>
          ) : (
            <ul className="mv-grid" role="list" aria-label="Music videos">
              {items.map((it) => { const p = byId.get(it.id); return <li key={it.id}><MusicVideoCard item={it} menu={p ? <MusicVideoMenu p={p} /> : undefined} /></li>; })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** The catalogue while the studio's first snapshot loads (§5.22): the head and a full first screen of sleeve tiles in
 *  their exact shapes (the same classes size them), so nothing moves when the music videos arrive. */
export function MusicVideosSkeleton() {
  return (
    <SkeletonRegion label="Opening the music videos…" className="mv-cat mv-sk">
      <div className="mv-cat-head">
        <div className="mv-cat-words">
          <div className="t-page mv-cat-title"><Skeleton.Line size="title" width="11rem" /></div>
          <div className="t-body mv-cat-desc"><Skeleton.Line width="14rem" /></div>
        </div>
        <Skeleton.Block className="mv-new" width={176} height={40} radius="pill" />
      </div>
      <div className="mv-grid">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="mtile mv-tile">
            <span className="mtile-link">
              <Skeleton.Media ratio="1/1" className="mtile-frame" />
              <span className="mtile-title"><Skeleton.Line width="68%" /></span>
              <span className="mtile-sub"><Skeleton.Line width="44%" /></span>
              <span className="slate mslate slate-sm"><Skeleton.Line width="36%" /></span>
            </span>
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}
