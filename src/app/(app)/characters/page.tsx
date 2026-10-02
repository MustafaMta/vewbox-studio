'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Language, Style } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { assetById, assignmentsOf, search } from '@/studio/selectors';
import { appearanceLock } from '@/domain/rules';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { LinkButton, Menu, MenuItem, MenuLink, Select, Status } from '@/components/ui/kit';
import { ArtRow, Empty } from '@/components/ui/cinema';
import { PageHeader } from '@/components/ui/page';
import { LibraryBar, NoMatches, useView } from '@/components/library/Library';
import { CharacterCard } from '@/components/library/Cards';
import { IconCharacters, IconDelete, IconImageAdd, IconOpen, IconPlus, IconVoice } from '@/components/ui/icons';
import { dialectLabel } from '@/lib/format';

type Usage = '' | 'used' | 'unused' | 'unknown';
type Sort = 'recent' | 'name' | 'mostUsed';

/** CHARACTERS — the studio's cast directory: a wall of portraits with the name and role beneath, nothing on the
 *  picture. Search; filters for style, where they belong, language and usage; sort by recent, name or most used;
 *  grid or list. Each character keeps one look and one voice across every production they appear in. */
export default function CharactersPage() {
  const T = useT();
  const { state, act } = useStudio();
  const toast = useToast();
  const router = useRouter();
  const [q, setQ] = useState(''); const [style, setStyle] = useState<Style | ''>(''); const [home, setHome] = useState(''); const [language, setLanguage] = useState<Language | ''>(''); const [usage, setUsage] = useState<Usage>(''); const [sort, setSort] = useState<Sort>('name');
  const [view, setView] = useView('characters');
  const usageOf = (c: (typeof state.characters)[number]): Usage => { const l = appearanceLock(c); return !l.locked ? 'unused' : l.reason === 'UNKNOWN' ? 'unknown' : 'used'; };
  const videosOf = (c: (typeof state.characters)[number]) => new Set(appearanceLock(c).videos.map((v) => v.productionId)).size;
  const inHome = (id: string) => { if (!home) return true; const a = assignmentsOf(state, id); return home.startsWith('show:') ? a.shows.some((s) => `show:${s.id}` === home) : a.productions.some((p) => `p:${p.id}` === home); };
  const filtered = search(state.characters, q).filter((c) => (!style || c.style === style) && (!language || c.language === language) && (!usage || usageOf(c) === usage) && inHome(c.id));
  const items = [...filtered].sort((a, b) => sort === 'recent' ? b.updatedAt.localeCompare(a.updatedAt) : sort === 'mostUsed' ? videosOf(b) - videosOf(a) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
  const homes = [...state.shows.map((s) => ({ value: `show:${s.id}`, label: s.title })), ...state.productions.filter((p) => !p.showId).map((p) => ({ value: `p:${p.id}`, label: p.title }))];
  const add = <LinkButton href="/characters/new" variant="primary" icon={<IconPlus />}>{T('lib.addCharacter')}</LinkButton>;
  const clear = () => { setQ(''); setStyle(''); setHome(''); setLanguage(''); setUsage(''); };
  const menuFor = (c: (typeof state.characters)[number]) => (
    <Menu label={`${c.name}: ${T('nav.more')}`}>
      <MenuLink href={`/characters/${c.id}`} icon={<IconOpen />}>{T('btn.open')}</MenuLink>
      <MenuLink href={`/characters/${c.id}?tab=appearance`} icon={<IconImageAdd />}>{T('tab.appearance')}</MenuLink>
      <MenuLink href={`/characters/${c.id}?tab=voice`} icon={<IconVoice />}>{T('tab.voice')}</MenuLink>
      <MenuItem icon={<IconDelete />} tone="danger" onClick={() => { if (window.confirm(`${T('btn.delete')} “${c.name}”? ${T('char.deleteConfirm')}`)) { act('deleteCharacter', c.id); toast.ok(T('toast.deleted')); router.refresh(); } }}>{T('btn.delete')}</MenuItem>
    </Menu>
  );
  return (
    <>
      <PageHeader title={<>{T('nav.characters')}{state.characters.length > 0 && <span className="num ms-3 font-sans text-base font-normal text-accent">{state.characters.length}</span>}</>} subtitle={T('char.libraryLead')} action={state.characters.length > 0 ? add : undefined} />
      {state.characters.length === 0 ? <Empty icon={<IconCharacters />} title={T('empty.characters')} hint={T('char.libraryLead')} action={add} /> : (
        <>
          <LibraryBar q={q} onQ={setQ} style={style} onStyle={setStyle} view={view} onView={setView} placeholder={T('lib.searchCharacters')}
            extra={<>
              <Select aria-label={T('lib.filterProduction')} value={home} onChange={(e) => setHome(e.target.value)} placeholder={`${T('lib.filterProduction')}: ${T('label.all')}`} options={homes} className="w-auto max-w-[14rem]" />
              <Select aria-label={T('lib.filterLanguage')} value={language} onChange={(e) => setLanguage(e.target.value as Language | '')} placeholder={`${T('lib.filterLanguage')}: ${T('label.all')}`} options={[{ value: 'EN', label: T('label.english') }, { value: 'AR', label: T('label.arabic') }]} className="w-auto" />
              <Select aria-label={T('lib.filterUsage')} value={usage} onChange={(e) => setUsage(e.target.value as Usage)} placeholder={`${T('lib.filterUsage')}: ${T('label.all')}`} options={[{ value: 'unused', label: T('char.usage.unused') }, { value: 'used', label: T('char.usage.inVideos') }, { value: 'unknown', label: T('char.usage.unknown') }]} className="w-auto" />
              <Select aria-label={T('lib.sort')} value={sort} onChange={(e) => setSort(e.target.value as Sort)} options={[{ value: 'recent', label: T('lib.sortRecent') }, { value: 'name', label: T('lib.sortName') }, { value: 'mostUsed', label: T('lib.sortMostUsed') }]} className="w-auto" />
            </>} />
          {items.length === 0 ? <NoMatches onClear={clear} /> : view === 'grid' ? (
            <ul className="grid-portraits" aria-label={T('nav.characters')}>
              {items.map((c) => <CharacterCard key={c.id} c={c} menu={menuFor(c)} />)}
            </ul>
          ) : (
            <ul className="rows" aria-label={T('nav.characters')}>
              {items.map((c) => {
                const lock = appearanceLock(c); const a = assignmentsOf(state, c.id);
                const homeName = a.shows[0]?.title ?? a.productions.find((p) => !p.showId)?.title ?? '—';
                return <ArtRow key={c.id} href={`/characters/${c.id}`} src={assetById(state, c.portraitAssetId)?.src} ratio="portrait" title={c.name} titleAr={c.nameAr}
                  cells={[c.role, homeName, `${c.language === 'EN' ? T('label.english') : T('label.arabic')}${c.dialect ? ` · ${dialectLabel(c.dialect, T.locale)}` : ''}`, c.voice.identity || c.voice.selectedSampleId ? T('lib.voiceSelected') : T('lib.noVoice')]}
                  status={!lock.locked ? <Status tone="neutral">{T('char.usage.unused')}</Status> : lock.reason === 'UNKNOWN' ? <Status tone="warn">{T('char.usage.unknown')}</Status> : <Status tone="accent">{T('char.usage.used')} · {videosOf(c)}</Status>} menu={menuFor(c)} />;
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}
