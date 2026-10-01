'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Style } from '@/domain/vocabulary';
import { useStudio } from '@/demo/store';
import { search } from '@/demo/selectors';
import { deleteShow } from '@/demo/actions';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { LinkButton, Menu, MenuItem, MenuLink } from '@/components/ui/kit';
import { Empty } from '@/components/ui/cinema';
import { PageHeader } from '@/components/ui/page';
import { LibraryBar, NoMatches } from '@/components/library/Library';
import { ShowCard } from '@/components/library/Cards';
import { sortItems } from '@/components/library/ProductionTile';
import { IconDelete, IconEdit, IconPlus, IconShows } from '@/components/ui/icons';

/** SHOWS — the series library: wide key art, the numbers, the cast, the progress. One action: Add show. */
export default function ShowsPage() {
  const T = useT();
  const { state, update } = useStudio();
  const toast = useToast();
  const router = useRouter();
  const [q, setQ] = useState(''); const [style, setStyle] = useState<Style | ''>(''); const [sort, setSort] = useState<'recent' | 'title'>('recent');
  const items = sortItems(search(state.shows, q).filter((s) => !style || s.style === style), sort);
  const add = <LinkButton href="/new/show" variant="primary" icon={<IconPlus />}>{T('lib.addShow')}</LinkButton>;
  return (
    <>
      <PageHeader title={T('nav.shows')} subtitle={T('empty.shows.hint')} action={state.shows.length > 0 ? add : undefined} />
      {state.shows.length === 0 ? <Empty icon={<IconShows />} title={T('empty.shows')} hint={T('empty.shows.hint')} action={add} /> : (
        <>
          <LibraryBar q={q} onQ={setQ} style={style} onStyle={setStyle} sort={sort} onSort={setSort} />
          {items.length === 0 ? <NoMatches onClear={() => { setQ(''); setStyle(''); }} /> : (
            <ul className="grid-shows">
              {items.map((s) => <ShowCard key={s.id} show={s} menu={
                <Menu label={`${s.title}: ${T('nav.more')}`}>
                  <MenuLink href={`/shows/${s.id}?tab=settings`} icon={<IconEdit />}>{T('btn.edit')}</MenuLink>
                  <MenuItem icon={<IconDelete />} tone="danger" onClick={() => { if (window.confirm(`${T('btn.delete')} “${s.title}”?`)) { update((st) => deleteShow(st, s.id)); toast.ok(T('toast.deleted')); router.refresh(); } }}>{T('btn.delete')}</MenuItem>
                </Menu>} />)}
            </ul>
          )}
        </>
      )}
    </>
  );
}
