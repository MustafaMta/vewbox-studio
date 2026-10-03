'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import type { Character } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { search } from '@/studio/selectors';
import { useShell } from '@/components/shell/context';
import { Button, CatalogueBar, MenuButton, MenuLink, Skeleton, SkeletonRegion, useCatalogueParams, type Facet } from '@/components/ui/kit';
import { IconChevronDown } from '@/components/ui/icons';
import { identityStatus, voiceState } from './identity';
import { CastSection, FigureCard, FigureCardSkeleton, PageHead, StartCard, figureOf, voiceTrackOf } from './parts';

/** CHARACTERS — the casting directory (docs/DESIGN-SYSTEM-V5.md §8.7 on the v5.1 standard): one refined grid of the
 *  studio's cast, 5 across on desktop, 3 on a tablet, 2 on a phone. Each card is the ONE canonical front full-body
 *  figure on its own field (never cropped), the name, and a voice disc that plays the real proof line or sample;
 *  "Needs approval" only when the producer is waited on. Search always; filters and sorting only once the cast is
 *  larger than six. "New character" is the page's primary, a split: Auto by default, Manual or From a picture from its
 *  menu. An empty directory shows the three ways in, each in the figure's own shape. */

const SORTS = [{ value: 'studio', label: 'Studio order' }, { value: 'name', label: 'Name' }, { value: 'recent', label: 'Recently changed' }] as const;
type Sort = (typeof SORTS)[number]['value'];
const FACETS: Facet[] = [
  { id: 'state', label: 'Image', options: [{ value: 'waiting', label: 'Needs approval' }, { value: 'approved', label: 'Approved' }, { value: 'locked', label: 'Filmed' }, { value: 'none', label: 'No image yet' }], kind: 'many' },
  { id: 'style', label: 'Style', options: [{ value: 'CARTOON', label: 'Cartoon' }, { value: 'ANIME', label: 'Anime' }, { value: 'REALISTIC', label: 'Realistic' }] },
  { id: 'language', label: 'Language', options: [{ value: 'EN', label: 'English' }, { value: 'AR', label: 'Arabic' }] },
  { id: 'voice', label: 'Voice', options: [{ value: 'yes', label: 'Has a voice' }, { value: 'no', label: 'No voice yet' }] },
];
/** Filters appear only when the cast is larger than this (v5 §5.10, v5.1 §5.15). */
const FILTER_FROM = 7;

/** The character ids an image or character decision waits on (the shared decision selector, as Home reads it). */
export function useWaitingCharacters(): Set<string> {
  const { decisions } = useShell();
  return useMemo(() => new Set(decisions.items.filter((d) => (d.kind === 'image' || d.kind === 'character') && d.subject.characterId).map((d) => d.subject.characterId!)), [decisions]);
}

export function NewCharacterSplit() {
  return (
    <div className="btn-split pc-split">
      <Link className="btn btn-primary" href="/characters/new">New character</Link>
      <MenuButton label="More ways to create a character" iconOnly icon={<IconChevronDown aria-hidden />} variant="primary" align="end">
        <MenuLink href="/characters/new?start=describe" description="Describe them in one line; the studio drafts the rest">Auto</MenuLink>
        <MenuLink href="/characters/new?start=sheet" description="Name, role, style and language; the rest on demand">Manual</MenuLink>
        <MenuLink href="/characters/new?start=picture" description="Upload a reference picture to draw them from">From a picture</MenuLink>
      </MenuButton>
    </div>
  );
}

export function CastDirectory() {
  const { state } = useStudio();
  const waiting = useWaitingCharacters();
  const cat = useCatalogueParams<Sort>({ sorts: SORTS.map((s) => s.value), defaultSort: 'studio', facets: FACETS });
  const all = state.characters;
  const large = all.length >= FILTER_FROM;
  const stateOf = (c: Character) => { const s = identityStatus(c); return waiting.has(c.id) ? 'waiting' : s.kind === 'LOCKED' ? 'locked' : s.kind === 'APPROVED' ? 'approved' : s.kind === 'DRAFT' ? 'waiting' : 'none'; };
  const shown = useMemo(() => {
    const f = large ? cat.filters : {};
    const hit = (id: string, v: string) => !f[id]?.length || f[id].includes(v);
    const list = search(all, cat.q).filter((c) => hit('state', stateOf(c)) && hit('style', c.style) && hit('language', c.language) && hit('voice', voiceState(c) !== 'NONE' || c.voice.selectedSampleId ? 'yes' : 'no'));
    const sort = large ? cat.sort : 'studio';
    return sort === 'name' ? [...list].sort((a, b) => a.name.localeCompare(b.name)) : sort === 'recent' ? [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : list;
  }, [all, cat.q, cat.filters, cat.sort, large, waiting]); // eslint-disable-line react-hooks/exhaustive-deps
  const waitingCount = all.filter((c) => waiting.has(c.id)).length;

  return (
    <div className="pc-page">
      <PageHead title="Characters" count={all.length || undefined}
        description={all.length ? `One canonical figure and one voice each, across every production.${waitingCount ? ` ${waitingCount === 1 ? 'One waits' : `${waitingCount} wait`} for your approval.` : ''}` : 'Your studio’s cast: one canonical figure and one voice each.'}
        actions={<NewCharacterSplit />} />
      {all.length === 0 ? (
        <CastSection id="pc-first" title="Cast someone new" description="Three ways in. The studio drafts; you approve the figure.">
          <ul className="pc-calls" role="list">
            <li><StartCard href="/characters/new?start=describe" shape="figure" title="Auto" line="Describe them in one line" /></li>
            <li><StartCard href="/characters/new?start=sheet" shape="figure" title="Manual" line="Write a short brief" /></li>
            <li><StartCard href="/characters/new?start=picture" shape="figure" title="From a picture" line="Upload a reference" /></li>
          </ul>
        </CastSection>
      ) : (
        <>
          <div className="pc-bar">
            <CatalogueBar q={cat.q} onQ={cat.setQ} placeholder="Search the cast"
              {...(large ? { facets: FACETS, filters: cat.filters, onFilters: cat.setFilters, sort: cat.sort, sorts: SORTS.map((s) => ({ ...s })), onSort: cat.setSort } : {})} />
          </div>
          {shown.length === 0 ? (
            <div className="pc-none">
              <p className="t-body pc-empty-line">{cat.q ? `No character matches “${cat.q}”.` : 'No character matches these filters.'}</p>
              <Button size="sm" variant="secondary" onClick={cat.clear}>Clear the search</Button>
            </div>
          ) : (
            <ul className="pc-grid" aria-label="The cast" role="list">
              {shown.map((c, i) => <li key={c.id}><FigureCard c={c} asset={figureOf(state, c)} track={voiceTrackOf(state, c)} waiting={waiting.has(c.id)} priority={i < 10} /></li>)}
              {!cat.q && <li><StartCard href="/characters/new" shape="figure" title="New character" line="Auto or manual" /></li>}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** The directory while the studio's first snapshot loads: the head, the search field and a row of figure cards in
 *  their final shapes (the same classes size them), so nothing moves when the cast arrives. */
export function CharactersSkeleton() {
  return (
    <SkeletonRegion label="Opening the cast…" className="pc-page pc-skeleton">
      <div className="pc-head">
        <div className="pc-head-words">
          <div className="t-page pc-head-title"><Skeleton.Line size="title" width="10rem" /></div>
          <div className="t-body pc-head-desc"><Skeleton.Line width="24rem" /></div>
        </div>
        <div className="pc-head-acts"><Skeleton.Block width={168} height={40} radius="pill" /></div>
      </div>
      <div className="pc-bar"><Skeleton.Block width="min(28rem, 100%)" height={40} radius="md" /></div>
      <div className="pc-grid">{Array.from({ length: 6 }, (_, i) => <div key={i}><FigureCardSkeleton /></div>)}</div>
    </SkeletonRegion>
  );
}
