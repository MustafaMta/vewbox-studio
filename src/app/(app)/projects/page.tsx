'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useStudio } from '@/studio/store';
import { musicVideos, shorts } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { PageHeader, Section } from '@/components/ui/page';
import { TabBar } from '@/components/ui/kit';
import { Empty } from '@/components/ui/cinema';
import { ShowCard } from '@/components/library/ShowCard';
import { ShortCard } from '@/components/library/ShortCard';
import { MusicVideoCard } from '@/components/library/MusicVideoCard';
import { ProductionMenu } from '@/components/library/ProductionTile';
import { IconMusicVideos, IconPlus, IconShorts, IconShows } from '@/components/ui/icons';

/** PROJECTS — everything the studio is making: shows, shorts and music videos on one page, newest first, with the
 *  three ways to start a new one. The dedicated libraries (/shows, /shorts, /music-videos) keep their filters. */
export default function ProjectsPage() {
  const T = useT();
  const { state } = useStudio();
  const sp = useSearchParams();
  const tab = (sp.get('tab') ?? 'all') as 'all' | 'shows' | 'shorts' | 'music';
  const byDate = <X extends { updatedAt: string }>(xs: X[]) => [...xs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const allShorts = byDate(shorts(state)); const allMvs = byDate(musicVideos(state)); const allShows = byDate(state.shows);
  const any = allShows.length + allShorts.length + allMvs.length > 0;
  const start = (
    <ul className="grid grid-cols-3 gap-2 sm:gap-3">
      {[['/new/show', <IconShows key="s" />, T('wizard.newShow'), T('empty.shows.hint')], ['/new/short', <IconShorts key="f" />, T('wizard.newShort'), T('empty.shorts.hint')], ['/new/music-video', <IconMusicVideos key="m" />, T('wizard.newMusicVideo'), T('empty.musicVideos.hint')]].map(([href, icon, title, hint]) => (
        <li key={String(href)} className="min-w-0"><Link href={String(href)} className="card card-hover group flex h-full flex-col items-center gap-2 px-3 py-4 text-center sm:flex-row sm:gap-4 sm:px-4 sm:py-3.5 sm:text-start">
          <span aria-hidden className="grid size-10 flex-none place-items-center rounded-xl bg-raised-2 text-accent transition-colors group-hover:bg-primary group-hover:text-on-primary [&>svg]:size-5">{icon}</span>
          <span className="min-w-0"><span className="block text-[13.5px] font-semibold text-fg sm:text-[14px]">{title}</span><span className="mt-0.5 hidden truncate text-[12.5px] text-faint sm:block">{hint}</span></span>
        </Link></li>
      ))}
    </ul>
  );
  return (
    <>
      <PageHeader title={T('projects.title')} subtitle={T('projects.lead')} action={any ? <Link href="/new" className="btn btn-primary"><IconPlus aria-hidden />{T('nav.newProduction')}</Link> : undefined} />
      {!any ? <Section title={T('home.startNew')} description={T('home.startFirst')}>{start}</Section> : (
        <>
          <TabBar ariaLabel={T('projects.title')} current={tab} hrefFor={(id) => (id === 'all' ? '/projects' : `/projects?tab=${id}`)} className="mb-8" tabs={[{ id: 'all', label: T('label.all') }, { id: 'shows', label: T('nav.shows'), count: allShows.length }, { id: 'shorts', label: T('nav.shorts'), count: allShorts.length }, { id: 'music', label: T('nav.musicVideos'), count: allMvs.length }]} />
          {(tab === 'all' || tab === 'shows') && allShows.length > 0 && <Section title={T('nav.shows')} count={allShows.length} className="mb-12" action={<Link href="/shows" className="btn btn-subtle btn-sm">{T('home.viewAll')}</Link>}><ul className="grid-shows">{allShows.slice(0, tab === 'all' ? 3 : undefined).map((s) => <ShowCard key={s.id} show={s} />)}</ul></Section>}
          {(tab === 'all' || tab === 'shorts') && allShorts.length > 0 && <Section title={T('nav.shorts')} count={allShorts.length} className="mb-12" action={<Link href="/shorts" className="btn btn-subtle btn-sm">{T('home.viewAll')}</Link>}><ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">{allShorts.slice(0, tab === 'all' ? 4 : undefined).map((p) => <ShortCard key={p.id} p={p} menu={<ProductionMenu p={p} />} />)}</ul></Section>}
          {(tab === 'all' || tab === 'music') && allMvs.length > 0 && <Section title={T('nav.musicVideos')} count={allMvs.length} className="mb-12" action={<Link href="/music-videos" className="btn btn-subtle btn-sm">{T('home.viewAll')}</Link>}><ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{allMvs.slice(0, tab === 'all' ? 4 : undefined).map((p) => <MusicVideoCard key={p.id} p={p} menu={<ProductionMenu p={p} />} />)}</ul></Section>}
          {tab !== 'all' && ((tab === 'shows' && !allShows.length) || (tab === 'shorts' && !allShorts.length) || (tab === 'music' && !allMvs.length)) && <Empty title={T(tab === 'shows' ? 'empty.shows' : tab === 'shorts' ? 'empty.shorts' : 'empty.musicVideos')} action={<Link href={tab === 'shows' ? '/new/show' : tab === 'shorts' ? '/new/short' : '/new/music-video'} className="btn btn-primary"><IconPlus aria-hidden />{T('nav.newProduction')}</Link>} />}
          <Section title={T('home.startNew')}>{start}</Section>
        </>
      )}
    </>
  );
}
