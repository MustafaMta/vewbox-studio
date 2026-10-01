'use client';

import Link from 'next/link';
import type { Production } from '@/domain/types';
import { useStudio } from '@/demo/store';
import { assetById, musicVideos, nextStep, productionHref, recentProductions, shorts, showById } from '@/demo/selectors';
import { useT } from '@/components/ui/locale';
import { PageHeader, Section } from '@/components/ui/page';
import { MusicVideoCard, ShortCard, ShowCard } from '@/components/library/Cards';
import { StageStatus } from '@/components/library/ProductionTile';
import { Thumb } from '@/components/ui/kit';
import { IconArrowRight, IconChevronRight, IconMusicVideos, IconShorts, IconShows } from '@/components/ui/icons';
import { fmtAgo, fmtSeconds } from '@/lib/format';

/** HOME — a calm landing: what you were working on first, three compact ways to start, then a small selection of
 *  the newest shows, shorts and music videos with a way to see all of them. Nothing about machines, no counters. */
export default function HomePage() {
  const T = useT();
  const { state } = useStudio();
  const any = state.shows.length + state.productions.length > 0;
  const recent = recentProductions(state, 8).filter((p) => p.stage !== 'COMPLETE').slice(0, 4);
  const byDate = <X extends { updatedAt: string }>(xs: X[]) => [...xs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const allShorts = shorts(state); const allMvs = musicVideos(state);
  const viewAll = (href: string) => <Link href={href} className="btn btn-subtle btn-sm">{T('home.viewAll')}<IconChevronRight aria-hidden className="rtl:rotate-180" /></Link>;
  const start = (
    <ul className="grid grid-cols-3 gap-2 sm:gap-3">
      <StartTile href="/new/show" icon={<IconShows />} title={T('wizard.newShow')} hint={T('empty.shows.hint')} />
      <StartTile href="/new/short" icon={<IconShorts />} title={T('wizard.newShort')} hint={T('empty.shorts.hint')} />
      <StartTile href="/new/music-video" icon={<IconMusicVideos />} title={T('wizard.newMusicVideo')} hint={T('empty.musicVideos.hint')} />
    </ul>
  );

  if (!any) {
    return (
      <>
        <PageHeader title={T('home.welcomeNew')} subtitle={T('home.emptyLead')} />
        <Section title={T('home.startNew')} description={T('home.startFirst')}>{start}</Section>
      </>
    );
  }

  return (
    <>
      <PageHeader title={T('home.welcome')} subtitle={T('home.lead')} className="mb-6" />

      {recent.length > 0 && (
        <Section title={T('home.continue')} className="mb-10">
          <ol className="card divide-y divide-line/70">{recent.map((p) => <ContinueRow key={p.id} p={p} />)}</ol>
        </Section>
      )}

      <Section title={T('home.startNew')} className="mb-12">{start}</Section>

      {state.shows.length > 0 && (
        <Section title={T('nav.shows')} className="mb-12" action={viewAll('/shows')}>
          <ul className="grid-shows">{byDate(state.shows).slice(0, 3).map((s) => <ShowCard key={s.id} show={s} />)}</ul>
        </Section>
      )}
      {allShorts.length > 0 && (
        <Section title={T('nav.shorts')} className="mb-12" action={viewAll('/shorts')}>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">{byDate(allShorts).slice(0, 4).map((p) => <ShortCard key={p.id} p={p} />)}</ul>
        </Section>
      )}
      {allMvs.length > 0 && (
        <Section title={T('nav.musicVideos')} className="mb-4" action={viewAll('/music-videos')}>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{byDate(allMvs).slice(0, 4).map((p) => <MusicVideoCard key={p.id} p={p} />)}</ul>
        </Section>
      )}
    </>
  );
}

/** A compact way to start: an icon, a name and, where there is room, one line. Three of them fit a phone's width. */
function StartTile({ href, icon, title, hint }: { href: string; icon: React.ReactNode; title: string; hint: string }) {
  return (
    <li className="min-w-0">
      <Link href={href} className="card card-hover group flex h-full flex-col items-center gap-2 px-3 py-4 text-center sm:flex-row sm:items-center sm:gap-4 sm:px-4 sm:py-3.5 sm:text-start">
        <span aria-hidden className="grid size-10 flex-none place-items-center rounded-xl bg-raised-2 text-accent transition-colors group-hover:bg-primary group-hover:text-on-primary [&>svg]:size-5">{icon}</span>
        <span className="min-w-0"><span className="block text-[13.5px] font-semibold text-fg sm:text-[14px]">{title}</span><span className="mt-0.5 hidden truncate text-[12.5px] text-faint sm:block">{hint}</span></span>
        <IconArrowRight aria-hidden className="ms-auto hidden size-4 flex-none text-ink-500 transition-transform group-hover:translate-x-0.5 group-hover:text-fg sm:block rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
      </Link>
    </li>
  );
}

/** One production you were working on: its picture, its name and where it belongs, its stage, and the next step. */
function ContinueRow({ p }: { p: Production }) {
  const T = useT();
  const { state } = useStudio();
  const isMusic = p.kind === 'MUSIC_VIDEO';
  const show = showById(state, p.showId);
  const art = assetById(state, p.coverAssetId) ?? assetById(state, p.posterAssetId) ?? assetById(state, show?.coverAssetId);
  const next = nextStep(p);
  const nextTab = isMusic ? (next.tab === 'story' ? 'song' : next.tab === 'cast' ? 'performers' : next.tab) : next.tab === 'cast' ? 'characters' : next.tab;
  return (
    <li>
      <Link href={`${productionHref(p)}?tab=${nextTab}`} className="group flex items-center gap-3 px-3 py-3 transition-colors hover:bg-input sm:gap-4 sm:px-4">
        <div className="w-20 flex-none sm:w-32"><Thumb src={art?.src} alt="" ratio={isMusic ? 'aspect-square' : 'aspect-video'} className={isMusic ? 'mx-auto w-12 rounded-md sm:w-16' : 'rounded-md'} unavailable={art?.unavailable} empty={T('misc.noArtwork')} /></div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11.5px] text-faint" dir="auto">{p.kind === 'EPISODE' && show ? `${show.title} · ${T('misc.episodeOf')} ${p.episodeNumber}` : T.dyn(`kind.${p.kind}`)} · {fmtSeconds(p.targetSeconds)}</p>
          <p className="bi mt-0.5 truncate text-[14.5px] font-semibold text-fg sm:text-[15px]" dir="auto"><span>{p.title}</span>{p.titleAr && <span className="bi-ar" dir="rtl">{p.titleAr}</span>}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1"><StageStatus p={p} /><span className="hidden text-[11.5px] text-faint sm:inline">{fmtAgo(p.updatedAt, T.locale)}</span></div>
        </div>
        <span className="hidden items-center gap-1.5 text-[12.5px] font-medium text-muted transition-colors group-hover:text-fg sm:inline-flex">{T.dyn(next.key)}<IconArrowRight aria-hidden className="size-4 rtl:rotate-180" /></span>
        <IconChevronRight aria-hidden className="size-4 flex-none text-ink-500 sm:hidden rtl:rotate-180" />
      </Link>
    </li>
  );
}
