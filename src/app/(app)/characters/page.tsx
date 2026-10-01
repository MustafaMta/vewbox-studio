'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Style } from '@/domain/vocabulary';
import { useStudio } from '@/demo/store';
import { assignmentsOf, search } from '@/demo/selectors';
import { deleteCharacter } from '@/demo/actions';
import { appearanceLock } from '@/demo/rules';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { LinkButton, Menu, MenuItem, MenuLink, Select } from '@/components/ui/kit';
import { Empty } from '@/components/ui/cinema';
import { PageHeader } from '@/components/ui/page';
import { LibraryBar, NoMatches } from '@/components/library/Library';
import { sortItems } from '@/components/library/ProductionTile';
import { CharacterCard } from '@/components/library/Cards';
import { IconCharacters, IconDelete, IconEdit, IconOpen, IconPlus, IconVoice } from '@/components/ui/icons';

type Usage = '' | 'used' | 'unused' | 'unknown';

/** CHARACTERS — the studio's cast directory: portraits with their role, style, where they belong, whether they have
 *  been in a video, and their voice. Search, and three compact filters: style, production, usage. */
export default function CharactersPage() {
  const T = useT();
  const { state, update } = useStudio();
  const toast = useToast();
  const router = useRouter();
  const [q, setQ] = useState(''); const [style, setStyle] = useState<Style | ''>(''); const [home, setHome] = useState(''); const [usage, setUsage] = useState<Usage>(''); const [sort, setSort] = useState<'recent' | 'title'>('title');
  const usageOf = (c: (typeof state.characters)[number]): Usage => { const l = appearanceLock(c); return !l.locked ? 'unused' : l.reason === 'UNKNOWN' ? 'unknown' : 'used'; };
  const inHome = (id: string) => { if (!home) return true; const a = assignmentsOf(state, id); return home.startsWith('show:') ? a.shows.some((s) => `show:${s.id}` === home) : a.productions.some((p) => `p:${p.id}` === home); };
  const items = sortItems(search(state.characters, q).filter((c) => (!style || c.style === style) && (!usage || usageOf(c) === usage) && inHome(c.id)), sort);
  const homes = [...state.shows.map((s) => ({ value: `show:${s.id}`, label: s.title })), ...state.productions.filter((p) => !p.showId).map((p) => ({ value: `p:${p.id}`, label: p.title }))];
  const add = <LinkButton href="/characters/new" variant="primary" icon={<IconPlus />}>{T('lib.addCharacter')}</LinkButton>;
  const clear = () => { setQ(''); setStyle(''); setHome(''); setUsage(''); };
  return (
    <>
      <PageHeader title={T('nav.characters')} subtitle={T('char.libraryLead')} action={state.characters.length > 0 ? add : undefined} />
      {state.characters.length === 0 ? <Empty icon={<IconCharacters />} title={T('empty.characters')} hint={T('char.libraryLead')} action={add} /> : (
        <>
          <LibraryBar q={q} onQ={setQ} style={style} onStyle={setStyle} sort={sort} onSort={setSort} placeholder={T('lib.searchCharacters')}
            extra={<>
              <Select aria-label={T('lib.filterProduction')} value={home} onChange={(e) => setHome(e.target.value)} placeholder={`${T('lib.filterProduction')}: ${T('label.all')}`} options={homes} className="w-auto max-w-[14rem]" />
              <Select aria-label={T('lib.filterUsage')} value={usage} onChange={(e) => setUsage(e.target.value as Usage)} placeholder={`${T('lib.filterUsage')}: ${T('label.all')}`} options={[{ value: 'used', label: T('char.usage.used') }, { value: 'unused', label: T('char.usage.unused') }, { value: 'unknown', label: T('char.usage.unknown') }]} className="w-auto" />
            </>} />
          {items.length === 0 ? <NoMatches onClear={clear} /> : (
            <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {items.map((c) => <CharacterCard key={c.id} c={c} menu={
                <Menu label={`${c.name}: ${T('nav.more')}`}>
                  <MenuLink href={`/characters/${c.id}`} icon={<IconOpen />}>{T('btn.open')}</MenuLink>
                  <MenuLink href={`/characters/${c.id}?tab=voice`} icon={<IconVoice />}>{T('tab.voice')}</MenuLink>
                  <MenuLink href={`/characters/${c.id}?tab=profile`} icon={<IconEdit />}>{T('tab.profile')}</MenuLink>
                  <MenuItem icon={<IconDelete />} tone="danger" onClick={() => { if (window.confirm(`${T('btn.delete')} “${c.name}”? ${T('char.deleteConfirm')}`)) { update((s) => deleteCharacter(s, c.id)); toast.ok(T('toast.deleted')); router.refresh(); } }}>{T('btn.delete')}</MenuItem>
                </Menu>} />)}
            </ul>
          )}
        </>
      )}
    </>
  );
}
