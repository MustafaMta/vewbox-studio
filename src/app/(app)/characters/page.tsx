'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Language, Style } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { assetById, assignmentsOf, primaryImageOf, search } from '@/studio/selectors';
import { appearanceLock } from '@/domain/rules';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { LinkButton, Menu, MenuItem, MenuLink, Select, Status } from '@/components/ui/kit';
import { ArtRow } from '@/components/ui/cinema';
import { PageHeader } from '@/components/ui/page';
import { LibraryBar, NoMatches, useView } from '@/components/library/Library';
import { CastCard } from '@/components/character/CastCard';
import { identityStatus, statusWords } from '@/components/character/identity';
import { IconDelete, IconOpen, IconPlus, IconVoice } from '@/components/ui/icons';
import { dialectLabel } from '@/lib/format';

type Usage = '' | 'used' | 'unused' | 'unknown';
type Identity = '' | 'DRAFT' | 'APPROVED' | 'LOCKED' | 'NONE';
type Sort = 'recent' | 'name' | 'mostUsed';

/** CHARACTERS — the studio's cast (DESIGN-SYSTEM-V3 §9.4): a wall of canonical full-body images with the name and
 *  role beneath and one line of state (identity: Draft · Approved · Locked, and the voice). Search; filters for style,
 *  where they belong, language, usage and identity; sort; grid or list. An empty studio is invited in three ways. */
export default function CharactersPage() {
  const T = useT();
  const { state, act } = useStudio();
  const toast = useToast();
  const router = useRouter();
  const [q, setQ] = useState(''); const [style, setStyle] = useState<Style | ''>(''); const [home, setHome] = useState(''); const [language, setLanguage] = useState<Language | ''>(''); const [usage, setUsage] = useState<Usage>(''); const [identity, setIdentity] = useState<Identity>(''); const [sort, setSort] = useState<Sort>('recent');
  const [view, setView] = useView('characters');
  const usageOf = (c: (typeof state.characters)[number]): Usage => { const l = appearanceLock(c); return !l.locked ? 'unused' : l.reason === 'UNKNOWN' ? 'unknown' : 'used'; };
  const videosOf = (c: (typeof state.characters)[number]) => new Set(appearanceLock(c).videos.map((v) => v.productionId)).size;
  const inHome = (id: string) => { if (!home) return true; const a = assignmentsOf(state, id); return home.startsWith('show:') ? a.shows.some((s) => `show:${s.id}` === home) : a.productions.some((p) => `p:${p.id}` === home); };
  const filtered = search(state.characters, q).filter((c) => (!style || c.style === style) && (!language || c.language === language) && (!usage || usageOf(c) === usage) && (!identity || identityStatus(c).kind === identity) && inHome(c.id));
  const items = [...filtered].sort((a, b) => sort === 'recent' ? b.updatedAt.localeCompare(a.updatedAt) : sort === 'mostUsed' ? videosOf(b) - videosOf(a) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
  const homes = [...state.shows.map((s) => ({ value: `show:${s.id}`, label: s.title })), ...state.productions.filter((p) => !p.showId).map((p) => ({ value: `p:${p.id}`, label: p.title }))];
  const add = <LinkButton href="/characters/new" variant="primary" icon={<IconPlus />}>{T('lib.addCharacter')}</LinkButton>;
  const clear = () => { setQ(''); setStyle(''); setHome(''); setLanguage(''); setUsage(''); setIdentity(''); };
  const menuFor = (c: (typeof state.characters)[number]) => (
    <Menu label={`${c.name}: ${T('nav.more')}`}>
      <MenuLink href={`/characters/${c.id}`} icon={<IconOpen />}>{T('btn.open')}</MenuLink>
      <MenuLink href={`/characters/${c.id}#voice`} icon={<IconVoice />}>{T('tab.voice')}</MenuLink>
      <MenuItem icon={<IconDelete />} tone="danger" onClick={() => { if (window.confirm(`${T('btn.delete')} “${c.name}”? ${T('char.deleteConfirm')}`)) { act('deleteCharacter', c.id); toast.ok(T('toast.deleted')); router.refresh(); } }}>{T('btn.delete')}</MenuItem>
    </Menu>
  );
  const n = state.characters.length;
  return (
    <>
      <PageHeader title={<>{T('nav.characters')}{n > 0 && <span className="num ms-3 align-baseline text-base font-normal text-faint">{n}</span>}</>} subtitle={T('cast.dir.lead')} action={n > 0 ? add : undefined} />
      {n === 0 ? <CastingCall /> : (
        <>
          <LibraryBar q={q} onQ={setQ} style={style} onStyle={setStyle} view={view} onView={setView} placeholder={T('lib.searchCharacters')}
            extra={<>
              <Select aria-label={T('lib.filterProduction')} value={home} onChange={(e) => setHome(e.target.value)} placeholder={`${T('lib.filterProduction')}: ${T('label.all')}`} options={homes} className="w-auto max-w-[14rem] flex-none" />
              <Select aria-label={T('lib.filterLanguage')} value={language} onChange={(e) => setLanguage(e.target.value as Language | '')} placeholder={`${T('lib.filterLanguage')}: ${T('label.all')}`} options={[{ value: 'EN', label: T('label.english') }, { value: 'AR', label: T('label.arabic') }]} className="w-auto flex-none" />
              <Select aria-label={T('cast.dir.filterIdentity')} value={identity} onChange={(e) => setIdentity(e.target.value as Identity)} placeholder={`${T('cast.dir.filterIdentity')}: ${T('label.all')}`} options={[{ value: 'DRAFT', label: T('cast.status.draft') }, { value: 'APPROVED', label: T('cast.status.approved') }, { value: 'LOCKED', label: T('cast.status.locked') }, { value: 'NONE', label: T('cast.status.none') }]} className="w-auto flex-none" />
              <Select aria-label={T('lib.filterUsage')} value={usage} onChange={(e) => setUsage(e.target.value as Usage)} placeholder={`${T('lib.filterUsage')}: ${T('label.all')}`} options={[{ value: 'unused', label: T('char.usage.unused') }, { value: 'used', label: T('char.usage.inVideos') }, { value: 'unknown', label: T('char.usage.unknown') }]} className="w-auto flex-none" />
              <Select aria-label={T('lib.sort')} value={sort} onChange={(e) => setSort(e.target.value as Sort)} options={[{ value: 'recent', label: T('lib.sortRecent') }, { value: 'name', label: T('lib.sortName') }, { value: 'mostUsed', label: T('lib.sortMostUsed') }]} className="w-auto flex-none" />
            </>} />
          {items.length === 0 ? <NoMatches onClear={clear} /> : view === 'grid' ? (
            <ul className="grid-portraits" aria-label={T('nav.characters')}>
              {items.map((c) => <CastCard key={c.id} c={c} menu={menuFor(c)} />)}
            </ul>
          ) : (
            <ul className="rows" aria-label={T('nav.characters')}>
              {items.map((c) => {
                const s = identityStatus(c); const w = statusWords(s); const a = assignmentsOf(state, c.id);
                const homeName = a.shows[0]?.title ?? a.productions.find((p) => !p.showId)?.title ?? '—';
                return <ArtRow key={c.id} href={`/characters/${c.id}`} src={assetById(state, primaryImageOf(c))?.src} ratio="portrait" title={c.name} titleAr={c.nameAr}
                  cells={[c.role, homeName, `${c.language === 'EN' ? T('label.english') : T('label.arabic')}${c.dialect ? ` · ${dialectLabel(c.dialect, T.locale)}` : ''}`, c.voice.identity || c.voice.selectedSampleId ? T('cast.card.voice') : T('cast.card.noVoice')]}
                  status={<Status tone={w.tone === 'warn' ? 'warn' : w.tone === 'ok' ? 'ok' : 'neutral'}>{s.kind === 'LOCKED' && s.lock.reason === 'USED' ? (s.videos === 1 ? T('cast.card.inVideo') : T('cast.card.inVideos').replace('{n}', String(s.videos))) : T(w.short)}</Status>} menu={menuFor(c)} />;
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}

/** The empty directory (§9.4): the three ways in, as portrait-shaped frames set in type — no fake faces. Each opens
 *  the creation page on that method. */
function CastingCall() {
  const T = useT();
  const ways = [
    { start: 'describe', title: T('cast.start.describe'), hint: T('cast.start.describe.hint') },
    { start: 'sheet', title: T('cast.start.sheet'), hint: T('cast.start.sheet.hint') },
    { start: 'picture', title: T('cast.start.picture'), hint: T('cast.start.picture.hint') },
  ];
  return (
    <section aria-labelledby="first-h">
      <h2 id="first-h" className="section-title mb-4">{T('cast.dir.first')}</h2>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6 lg:max-w-[52rem]">
        {ways.map((w) => (
          <li key={w.start}>
            <Link href={`/characters/new?start=${w.start}`} className="poster-link group block outline-none">
              <div className="poster flex aspect-[4/5] items-end bg-input p-5 max-sm:aspect-auto max-sm:min-h-16 max-sm:items-center max-sm:p-4">
                <span className="text-[20px] font-medium leading-[26px] text-fg">{w.title}</span>
              </div>
              <p className="mt-2 text-[13px] leading-5 text-muted">{w.hint}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
