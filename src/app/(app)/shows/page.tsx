'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Style } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { search } from '@/studio/selectors';
import { T } from '@/lib/copy';
import { useToast } from '@/components/ui/toast';
import { LinkButton, Menu, MenuItem, MenuLink, Select } from '@/components/ui/kit';
import { Empty } from '@/components/ui/cinema';
import { PageHeader } from '@/components/ui/page';
import { LibraryBar, NoMatches } from '@/components/library/Library';
import { ShowCard } from '@/components/library/ShowCard';
import { sortItems } from '@/components/library/ProductionTile';
import { IconDelete, IconEdit, IconPlus, IconShows } from '@/components/ui/icons';

/** SHOWS — the series library: wide key art, the numbers, the cast, the progress. One action: Add show. */
export default function ShowsPage() {
  const { state, act } = useStudio();
  const toast = useToast();
  const router = useRouter();
  const [q, setQ] = useState(''); const [style, setStyle] = useState<Style | ''>(''); const [sort, setSort] = useState<'recent' | 'title'>('recent');
  const [language, setLanguage] = useState<'' | 'EN' | 'AR'>(''); const [genre, setGenre] = useState(''); const [status, setStatus] = useState<'' | 'active' | 'complete'>('');
  const genres = Array.from(new Set(state.shows.map((s) => s.genre.trim()).filter(Boolean))).sort();
  const statusOf = (showId: string) => { const eps = state.productions.filter((p) => p.showId === showId); return eps.length > 0 && eps.every((p) => p.stage === 'COMPLETE') ? 'complete' : 'active'; };
  const items = sortItems(search(state.shows, q).filter((s) => (!style || s.style === style) && (!language || s.language === language) && (!genre || s.genre.trim() === genre) && (!status || statusOf(s.id) === status)), sort);
  const add = <LinkButton href="/new/show" variant="primary" icon={<IconPlus />}>{T('lib.addShow')}</LinkButton>;
  return (
    <>
      <PageHeader title={T('nav.shows')} subtitle={T('empty.shows.hint')} action={state.shows.length > 0 ? add : undefined} />
      {state.shows.length === 0 ? <Empty icon={<IconShows />} title={T('empty.shows')} hint={T('empty.shows.hint')} action={add} /> : (
        <>
          <LibraryBar q={q} onQ={setQ} style={style} onStyle={setStyle} sort={sort} onSort={setSort} extra={<>
            {genres.length > 1 && <Select aria-label={T('lib.filterGenre')} value={genre} onChange={(e) => setGenre(e.target.value)} placeholder={`${T('lib.filterGenre')}: ${T('label.all')}`} options={genres.map((g) => ({ value: g, label: g }))} className="w-auto max-w-[12rem]" />}
            <Select aria-label={T('lib.filterLanguage')} value={language} onChange={(e) => setLanguage(e.target.value as '' | 'EN' | 'AR')} placeholder={`${T('lib.filterLanguage')}: ${T('label.all')}`} options={[{ value: 'EN', label: T('label.english') }, { value: 'AR', label: T('label.arabic') }]} className="w-auto" />
            <Select aria-label={T('label.status')} value={status} onChange={(e) => setStatus(e.target.value as '' | 'active' | 'complete')} placeholder={`${T('label.status')}: ${T('label.all')}`} options={[{ value: 'active', label: T('home.inProduction') }, { value: 'complete', label: T.dyn('stage.COMPLETE') }]} className="w-auto" />
          </>} />
          {items.length === 0 ? <NoMatches onClear={() => { setQ(''); setStyle(''); setLanguage(''); setGenre(''); setStatus(''); }} /> : (
            <ul className="grid-shows">
              {items.map((s) => <ShowCard key={s.id} show={s} menu={
                <Menu label={`${s.title}: ${T('nav.more')}`}>
                  <MenuLink href={`/shows/${s.id}?tab=settings`} icon={<IconEdit />}>{T('btn.edit')}</MenuLink>
                  <MenuItem icon={<IconDelete />} tone="danger" onClick={() => { if (window.confirm(`${T('btn.delete')} “${s.title}”?`)) { act('deleteShow', s.id); toast.ok(T('toast.deleted')); router.refresh(); } }}>{T('btn.delete')}</MenuItem>
                </Menu>} />)}
            </ul>
          )}
        </>
      )}
    </>
  );
}
