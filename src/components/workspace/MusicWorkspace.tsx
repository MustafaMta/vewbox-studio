'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { Production } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { assetById, castOf, nextStep, productionHref, progressOf } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { useTab } from '@/lib/hooks';
import { TabBar } from '@/components/ui/kit';
import { Art, Dots, Hero } from '@/components/ui/cinema';
import { StageStatus } from '@/components/library/ProductionTile';
import { usePlayer, type Track } from '@/components/players/PlayerProvider';
import { MiniPlayer, SongPlayer } from '@/components/players/Controls';
import { IconChevronRight } from '@/components/ui/icons';
import { fmtSeconds } from '@/lib/format';
import { OverviewTab } from './tabs/OverviewTab';
import { SongLyricsTab } from './tabs/SongLyricsTab';
import { PerformersTab } from './tabs/PerformersTab';
import { VisualStoryTab } from './tabs/VisualStoryTab';
import { StoryboardTab } from './tabs/StoryboardTab';
import { ProduceTab } from './tabs/ProduceTab';
import { FinalCutTab } from './tabs/FinalCutTab';

/** A MUSIC VIDEO — music first: a record-style header (square art, track and artist, genre and mood, transport),
 *  a compact player that follows once the header scrolls away, and seven tabs:
 *  Overview · Song & Lyrics · Performers · Visual Story · Storyboard · Produce · Final Cut. One audio source. */

export const MUSIC_TABS = ['overview', 'song', 'performers', 'visual', 'storyboard', 'produce', 'final'] as const;
type Tab = (typeof MUSIC_TABS)[number];
// "story" links (next-step buttons) land on the Visual Story tab, where a music video's scenes and script live
const ALIAS: Record<string, Tab> = { story: 'visual', cast: 'performers', characters: 'performers', locations: 'visual' };

export function trackOf(p: Production, src: string | undefined, artworkSrc?: string): Track | null {
  if (!p.song || !src) return null;
  return { id: `song-${p.id}`, src, title: p.song.title || p.title, subtitle: p.artist, artworkSrc, duration: p.song.durationSeconds };
}

export function MusicWorkspace({ p }: { p: Production }) {
  const T = useT();
  const { state } = useStudio();
  const [rawTab] = useTab([...MUSIC_TABS, 'story', 'cast', 'characters', 'locations'] as const, 'overview');
  const tab: Tab = (ALIAS[rawTab] ?? rawTab) as Tab;
  const base = productionHref(p);
  const pr = progressOf(p);
  const next = nextStep(p);
  const nextTab: Tab = next.tab === 'story' ? 'song' : next.tab === 'cast' ? 'performers' : (next.tab as Tab);
  const art = assetById(state, p.posterAssetId); const cover = assetById(state, p.coverAssetId);
  const audio = assetById(state, p.song?.assetId);
  const track = trackOf(p, audio && !audio.unavailable ? audio.src : undefined, art?.src ?? cover?.src);
  const performers = castOf(state, p).filter((c) => p.song?.singerIds.includes(c.id) || p.castIds.includes(c.id));
  const artist = p.artist || performers.map((c) => c.name).join(' & ') || T('meta.noArtist');
  const player = usePlayer();
  // the song was replaced or removed while it was the one loaded: stop it rather than play a stale file
  useEffect(() => { const cur = player.current; if (cur && cur.id === `song-${p.id}` && (!track || cur.src !== track.src)) player.stop(); }, [player, p.id, track]);

  // the compact player appears once the header's transport has scrolled away
  const sentinel = useRef<HTMLDivElement>(null);
  const [headerGone, setHeaderGone] = useState(false);
  useEffect(() => { const el = sentinel.current; if (!el) return; const io = new IntersectionObserver(([e]) => setHeaderGone(!e.isIntersecting), { rootMargin: '-48px 0px 0px 0px' }); io.observe(el); return () => io.disconnect(); }, []);

  return (
    <>
      <Hero backdropSrc={cover?.src ?? art?.src} art={<Art src={art?.src ?? cover?.src} ratio="square" title={p.title} sample={(art ?? cover)?.sample} />}
        eyebrow={<>{T('kind.MUSIC_VIDEO')}{p.genre ? ` · ${p.genre}` : ''}{p.mood ? ` · ${p.mood}` : ''}</>} title={p.song?.title || p.title} titleAr={p.titleAr}
        description={<span className="text-base text-fg" dir="auto">{artist}</span>}
        meta={<><StageStatus p={p} /><span className="text-faint" aria-hidden>·</span><Dots items={[T.dyn(`style.${p.style}`), p.concept ? T.dyn(`mv.concept.${p.concept}`) : null, p.song ? fmtSeconds(p.song.durationSeconds) : fmtSeconds(p.targetSeconds), p.song ? `${p.song.sections.length} ${T('mv.sections')}` : null]} /></>}
        back={{ href: '/music-videos', label: T('nav.musicVideos') }}>
        <div ref={sentinel} className="mt-5"><SongPlayer track={track} title={p.song?.title || p.title} performer={artist} artworkSrc={art?.src ?? cover?.src} action={p.stage !== 'COMPLETE' && <Link href={`${base}?tab=${nextTab}`} className="btn btn-primary">{T.dyn(next.key)}<IconChevronRight className="rtl:rotate-180" /></Link>} /></div>
      </Hero>

      <TabBar ariaLabel={p.title} current={tab} hrefFor={(id) => `${base}?tab=${id}`} className="mb-6" tabs={[
        { id: 'overview', label: T('tab.overview') }, { id: 'song', label: T('tab.song'), count: p.song?.sections.length }, { id: 'performers', label: T('tab.performers'), count: performers.length },
        { id: 'visual', label: T('tab.visual') }, { id: 'storyboard', label: T('tab.storyboard'), count: pr.shots }, { id: 'produce', label: T('tab.produce'), count: pr.withTake }, { id: 'final', label: T('tab.finalCut') },
      ]} />

      <div role="tabpanel" hidden={tab !== 'overview'}><OverviewTab p={p} /></div>
      <div role="tabpanel" hidden={tab !== 'song'}><SongLyricsTab p={p} track={track} /></div>
      <div role="tabpanel" hidden={tab !== 'performers'}><PerformersTab p={p} /></div>
      <div role="tabpanel" hidden={tab !== 'visual'}><VisualStoryTab p={p} /></div>
      <div role="tabpanel" hidden={tab !== 'storyboard'}>{tab === 'storyboard' && <StoryboardTab p={p} />}</div>
      <div role="tabpanel" hidden={tab !== 'produce'}>{tab === 'produce' && <ProduceTab p={p} />}</div>
      <div role="tabpanel" hidden={tab !== 'final'}>{tab === 'final' && <FinalCutTab p={p} />}</div>

      {track && <MiniPlayer track={track} show={headerGone} />}
    </>
  );
}
