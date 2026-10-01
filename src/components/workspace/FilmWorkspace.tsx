'use client';

import Link from 'next/link';
import type { Production } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { assetById, nextStep, productionHref, progressOf, seasonById, showById } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { useToast } from '@/components/ui/toast';
import { useTab } from '@/lib/hooks';
import { TabBar } from '@/components/ui/kit';
import { Art, Dots, Hero } from '@/components/ui/cinema';
import { StageStatus } from '@/components/library/ProductionTile';
import { CanonPicker } from '@/components/library/CanonPicker';
import { IconChevronRight } from '@/components/ui/icons';
import { aspectShort, dialectLabel, fmtSeconds } from '@/lib/format';
import { OverviewTab } from './tabs/OverviewTab';
import { StoryTab } from './tabs/StoryTab';
import { StoryboardTab } from './tabs/StoryboardTab';
import { ProduceTab } from './tabs/ProduceTab';
import { FinalCutTab } from './tabs/FinalCutTab';

/** A FILM — a short, or an episode inside its show. A film-style header (artwork, synopsis, the essentials, one
 *  action), then seven tabs: Overview · Story · Characters · Locations · Storyboard · Produce · Final Cut.
 *  Every tab stays mounted while another is shown, so a half-written synopsis survives a look at the storyboard. */

export const FILM_TABS = ['overview', 'story', 'characters', 'locations', 'storyboard', 'produce', 'final'] as const;
type Tab = (typeof FILM_TABS)[number];
/** Old links used one Cast & World tab. */
const ALIAS: Record<string, Tab> = { cast: 'characters' };

export function FilmWorkspace({ p }: { p: Production }) {
  const T = useT();
  const { state, act } = useStudio();
  const toast = useToast();
  const [rawTab] = useTab([...FILM_TABS, 'cast'] as const, 'overview');
  const tab: Tab = (ALIAS[rawTab] ?? rawTab) as Tab;
  const base = productionHref(p);
  const pr = progressOf(p);
  const next = nextStep(p);
  const nextTab = next.tab === 'cast' ? 'characters' : next.tab;
  const show = showById(state, p.showId); const season = seasonById(state, p.seasonId);
  const poster = assetById(state, p.posterAssetId) ?? assetById(state, show?.posterAssetId);
  const cover = assetById(state, p.coverAssetId) ?? assetById(state, show?.coverAssetId);
  const vertical = p.aspect === 'VERTICAL_9_16';
  const back = p.kind === 'EPISODE' && show ? { href: `/shows/${show.id}?tab=seasons${season ? `&season=${season.id}` : ''}`, label: `${T('show.backTo')} ${show.title}${season ? ` · ${T('kind.SEASON')} ${season.number}` : ''}` } : { href: '/shorts', label: T('nav.shorts') };
  const eyebrow = p.kind === 'EPISODE' ? <>{show?.title}{season ? ` · ${T('kind.SEASON')} ${season.number}` : ''} · {T('kind.EPISODE')} {p.episodeNumber}</> : <>{T('kind.SHORT')}{p.genre ? ` · ${p.genre}` : ''}</>;

  return (
    <>
      <Hero backdropSrc={cover?.src} art={<Art src={poster?.src ?? cover?.src} ratio={poster ? 'poster' : vertical ? 'vertical' : 'wide'} title={p.title} sample={(poster ?? cover)?.sample} />}
        eyebrow={eyebrow} title={p.title} titleAr={p.titleAr} description={p.synopsis || p.logline}
        meta={<><StageStatus p={p} /><span className="text-faint" aria-hidden>·</span><Dots items={[T.dyn(`style.${p.style}`), `${p.language}${p.dialect ? ` · ${dialectLabel(p.dialect, T.locale)}` : ''}`, aspectShort(p.aspect), `${fmtSeconds(pr.runtime || p.targetSeconds)}${pr.runtime ? ` ${T('misc.of')} ${fmtSeconds(p.targetSeconds)}` : ''}`, pr.shots ? `${pr.shots} ${T('label.shots').toLowerCase()}` : null]} /></>}
        actions={p.stage !== 'COMPLETE' && <Link href={`${base}?tab=${nextTab}`} className="btn btn-primary">{T.dyn(next.key)}<IconChevronRight className="rtl:rotate-180" /></Link>}
        back={back} />

      <TabBar ariaLabel={p.title} current={tab} hrefFor={(id) => `${base}?tab=${id}`} className="mb-6" tabs={[
        { id: 'overview', label: T('tab.overview') }, { id: 'story', label: T('tab.story'), count: pr.scenes }, { id: 'characters', label: T('tab.characters'), count: p.castIds.length + (show?.castIds.length ?? 0) },
        { id: 'locations', label: T('tab.locations'), count: p.locationIds.length + (show?.locationIds.length ?? 0) }, { id: 'storyboard', label: T('tab.storyboard'), count: pr.shots }, { id: 'produce', label: T('tab.produce'), count: pr.withTake }, { id: 'final', label: T('tab.finalCut') },
      ]} />

      <div role="tabpanel" hidden={tab !== 'overview'}><OverviewTab p={p} /></div>
      <div role="tabpanel" hidden={tab !== 'story'}><StoryTab p={p} /></div>
      <div role="tabpanel" hidden={tab !== 'characters'}><CanonPicker only="cast" castIds={p.castIds} locationIds={p.locationIds} inheritedCast={show?.castIds} inheritedLocations={show?.locationIds} style={p.style} onChange={(patch) => { act('updateProduction', p.id, patch); toast.ok(T('toast.saved')); }} /></div>
      <div role="tabpanel" hidden={tab !== 'locations'}><CanonPicker only="locations" castIds={p.castIds} locationIds={p.locationIds} inheritedCast={show?.castIds} inheritedLocations={show?.locationIds} style={p.style} onChange={(patch) => { act('updateProduction', p.id, patch); toast.ok(T('toast.saved')); }} /></div>
      <div role="tabpanel" hidden={tab !== 'storyboard'}>{tab === 'storyboard' && <StoryboardTab p={p} />}</div>
      <div role="tabpanel" hidden={tab !== 'produce'}>{tab === 'produce' && <ProduceTab p={p} />}</div>
      <div role="tabpanel" hidden={tab !== 'final'}>{tab === 'final' && <FinalCutTab p={p} />}</div>
    </>
  );
}
