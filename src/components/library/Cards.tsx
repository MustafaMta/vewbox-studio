'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Location, Production, Show } from '@/domain/types';
import { STAGES } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { assetById, castOf, episodesOfShow, primaryImageSrc, productionHref, progressOf, seasonsOf, stageIndex } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { TrackButton } from '@/components/players/PlayerProvider';
import { trackOf } from '@/components/workspace/MusicWorkspace';
import { CastStack, ProgressBar } from '@/components/ui/page';
import { IconArrowRight, IconDuration } from '@/components/ui/icons';
import { StageStatus } from './ProductionTile';
import { aspectShort, fmtSeconds } from '@/lib/format';

/** THE LIBRARY CARDS — each kind of thing the studio keeps, in the shape that suits it: a show as wide key art
 *  with its numbers and cast, a short as a poster, a music video as a record sleeve with a play button, a
 *  location as a wide plate (a character is a cast card: src/components/character/CastCard.tsx). All of them share
 *  one surface, one radius, one hover. */

/** How far a production is, as a fraction of its stages. */
export const stageFraction = (p: Production) => stageIndex(p.stage) / (STAGES.length - 1);

/** Bundled pictures carry their own SAMPLE tag in the corner; nothing is drawn over them. */
function Sample({ on }: { on?: boolean }) { void on; return null; }

/** SHOWS: wide key art, the series in numbers, its premise, its cast, how far along it is. */
export function ShowCard({ show, menu }: { show: Show; menu?: ReactNode }) {
  const T = useT();
  const { state } = useStudio();
  const cover = assetById(state, show.coverAssetId) ?? assetById(state, show.posterAssetId);
  const seasons = seasonsOf(state, show.id).length;
  const episodes = episodesOfShow(state, show.id);
  const progress = episodes.length ? episodes.reduce((a, p) => a + stageFraction(p), 0) / episodes.length : 0;
  const cast = state.characters.filter((c) => show.castIds.includes(c.id)).map((c) => ({ id: c.id, name: c.name, src: primaryImageSrc(state, c) }));
  return (
    <li className="card card-hover group relative flex min-w-0 flex-col overflow-hidden">
      <Link href={`/shows/${show.id}`} className="flex flex-1 flex-col outline-none">
        <div className="relative aspect-[16/9] overflow-hidden bg-input">
          {cover && !cover.unavailable ? <img src={cover.src} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" /> : <div className="poster-text absolute inset-0 items-start" aria-hidden><span dir="auto">{show.title}</span></div>}
          <span className="scrim" aria-hidden />
          <Sample on={cover?.sample} />
          <div className="absolute inset-x-0 bottom-0 p-5">
            <h3 className="bi text-[20px] font-semibold tracking-[-0.015em] text-white" dir="auto"><span>{show.title}</span>{show.titleAr && <span className="bi-ar !text-white/80" dir="rtl">{show.titleAr}</span>}</h3>
            <p className="mt-1 text-[12.5px] text-ink-200">{seasons} {T(seasons === 1 ? 'meta.season' : 'meta.seasons')} · {episodes.length} {T(episodes.length === 1 ? 'meta.episode' : 'meta.episodes')} · {aspectShort(show.aspect)}</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          <p className="line-clamp-2 min-h-[2.6em] text-[12.5px] leading-relaxed text-faint" dir="auto">{show.logline || show.synopsis || '—'}</p>
          <div className="flex items-center justify-between gap-3"><CastStack cast={cast} emptyLabel={T('lib.castBy')} /><span className="truncate text-[12px] text-muted">{T.dyn(`style.${show.style}`)}{show.genre ? ` · ${show.genre}` : ''}</span></div>
          <ProgressBar value={progress} label={`${show.title}: ${T('meta.progress')}`} />
        </div>
      </Link>
      {menu && <div className="card-tools absolute end-2 top-2 z-10">{menu}</div>}
    </li>
  );
}

/** SHORTS: a poster, the length on the art, the cast and where it stands along the lower edge. */
export function ShortCard({ p, menu }: { p: Production; menu?: ReactNode }) {
  const T = useT();
  const { state } = useStudio();
  const poster = assetById(state, p.posterAssetId); const cover = assetById(state, p.coverAssetId);
  const art = poster ?? cover;
  const vertical = !poster && p.aspect === 'VERTICAL_9_16';
  const pr = progressOf(p);
  const cast = castOf(state, p).map((c) => ({ id: c.id, name: c.name, src: primaryImageSrc(state, c) }));
  return (
    <li className="poster-card group relative min-w-0">
      <Link href={productionHref(p)} className="poster-link block outline-none">
        <div className={`poster ${vertical ? 'aspect-[9/16]' : 'aspect-[2/3]'}`}>
          {art && !art.unavailable ? <img src={art.src} alt="" loading="lazy" className={poster ? '' : 'opacity-80'} /> : <div className="poster-text absolute inset-0" aria-hidden><span dir="auto" className="line-clamp-4">{p.title}</span></div>}
          <span className="scrim-strong" aria-hidden />
          <Sample on={art?.sample} />
          <span className="badge badge-glass absolute start-3 top-3"><IconDuration aria-hidden />{fmtSeconds(pr.runtime || p.targetSeconds)}</span>
          <div className="absolute inset-x-0 bottom-0 p-4">
            <h3 className="line-clamp-2 text-[16px] font-semibold leading-snug text-white" dir="auto">{p.title}</h3>
            <p className="mt-1 truncate text-[12px] text-ink-200">{T.dyn(`style.${p.style}`)}{p.genre ? ` · ${p.genre}` : ''}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <CastStack cast={cast} max={3} />
              <span className="badge badge-glass shrink-0">{T.dyn(`stage.${p.stage}`)}</span>
            </div>
          </div>
        </div>
      </Link>
      {menu && <div className="card-tools absolute end-2 top-2 z-10">{menu}</div>}
    </li>
  );
}

/** A typographic cover for a track without artwork: a deterministic colour field from the title. */
export function TrackCover({ title, artist, className = '' }: { title: string; artist?: string | null; className?: string }) {
  let h = 0; for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: `radial-gradient(120% 90% at 20% 10%, hsl(${h} 60% 50% / 0.9), transparent 60%), radial-gradient(90% 80% at 90% 100%, hsl(${(h + 140) % 360} 55% 40% / 0.85), transparent 60%), #0e0f14` }}>
      <div className="absolute inset-0 flex flex-col justify-end p-4">
        <span className="line-clamp-2 text-[18px] font-bold leading-tight tracking-[-0.02em] text-white drop-shadow" dir="auto">{title}</span>
        {artist && <span className="mt-1 truncate text-[11px] font-medium uppercase tracking-[0.12em] text-white/80" dir="auto">{artist}</span>}
      </div>
    </div>
  );
}

export function artistOf(state: ReturnType<typeof useStudio>['state'], p: Production, fallback: string): string {
  return p.artist || castOf(state, p).filter((c) => p.song?.singerIds.includes(c.id)).map((c) => c.name).join(' & ') || fallback;
}

/** MUSIC VIDEOS: cover, song and artist first; play the track in place; treatment and format as music metadata. */
export function MusicVideoCard({ p, menu }: { p: Production; menu?: ReactNode }) {
  const T = useT();
  const { state } = useStudio();
  const art = assetById(state, p.posterAssetId) ?? assetById(state, p.coverAssetId);
  const audio = assetById(state, p.song?.assetId);
  const track = trackOf(p, audio && !audio.unavailable ? audio.src : undefined, art?.src);
  const title = p.song?.title || p.title;
  const artist = artistOf(state, p, T('meta.noArtist'));
  return (
    <li className="card card-hover group relative flex min-w-0 flex-col overflow-hidden">
      <Link href={productionHref(p)} className="absolute inset-0 z-0 rounded-[inherit] outline-none" aria-label={`${title} — ${artist}`} />
      <div className="relative aspect-square bg-input">
        {art && !art.unavailable ? <img src={art.src} alt="" loading="lazy" className="h-full w-full object-cover" /> : <TrackCover title={title} artist={artist} className="h-full w-full" />}
        <Sample on={art?.sample} />
        {track && <div className="absolute bottom-3 end-3 z-10"><TrackButton track={track} onArt labelPlay={T('misc.play')} labelPause={T('misc.pause')} /></div>}
      </div>
      <div className="pointer-events-none relative p-4">
        <div className="bi truncate text-[15px] font-semibold text-fg" dir="auto"><span>{title}</span>{p.titleAr && <span className="bi-ar" dir="rtl">{p.titleAr}</span>}</div>
        <div className="truncate text-[12.5px] text-faint" dir="auto">{artist}</div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="badge"><IconDuration aria-hidden />{fmtSeconds(p.song?.durationSeconds ?? p.targetSeconds)}</span>
          {p.concept && <span className="badge">{T.dyn(`mv.concept.${p.concept}`)}</span>}
          <span className="badge">{aspectShort(p.aspect)}</span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 text-[12px]"><span className="truncate text-muted">{T.dyn(`style.${p.style}`)}</span><StageStatus p={p} /></div>
      </div>
      {menu && <div className="card-tools absolute end-2 top-2 z-10">{menu}</div>}
    </li>
  );
}

/** LOCATIONS: a wide plate, the name of the place, what kind of place it is and how many views it has. */
export function LocationCard({ l }: { l: Location }) {
  const T = useT();
  const { state } = useStudio();
  const plate = assetById(state, l.masterAssetId);
  return (
    <li className="card card-hover group relative min-w-0 overflow-hidden">
      <Link href={`/locations/${l.id}`} className="block outline-none">
        <div className="relative aspect-video overflow-hidden bg-input">
          {plate && !plate.unavailable ? <img src={plate.src} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" /> : <div className="poster-text absolute inset-0" aria-hidden><span dir="auto">{l.name}</span></div>}
          <Sample on={plate?.sample} />
        </div>
        <div className="flex items-start justify-between gap-3 p-3.5">
          <div className="min-w-0">
            <div className="bi truncate text-[14px] font-semibold text-fg" dir="auto"><span>{l.name}</span>{l.nameAr && <span className="bi-ar" dir="rtl">{l.nameAr}</span>}</div>
            <div className="mt-0.5 truncate text-[12px] text-faint">{l.kind === 'INTERIOR' ? T('label.interior') : T('label.exterior')} · {T.dyn(`style.${l.style}`)} · {l.refs.length} {T('meta.views')}</div>
          </div>
          <IconArrowRight aria-hidden className="mt-1 size-4 shrink-0 text-ink-500 transition-transform group-hover:translate-x-0.5 group-hover:text-fg rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
        </div>
      </Link>
    </li>
  );
}

/** A way to start, as a picture card: art on top, the name and one line beneath, an arrow that leans in. */
export function StartCard({ href, icon, title, hint, art }: { href: string; icon: ReactNode; title: string; hint: string; art?: string }) {
  return (
    <Link href={href} className="card card-hover group relative flex flex-col overflow-hidden">
      <div className="relative aspect-[16/8] overflow-hidden bg-input">
        {art ? <img src={art} alt="" className="h-full w-full object-cover opacity-70 transition-transform duration-500 group-hover:scale-[1.03]" /> : <div className="grid h-full w-full place-items-center bg-gradient-to-br from-raised-2 to-input text-ink-600 transition-colors group-hover:text-accent [&>svg]:size-10" aria-hidden>{icon}</div>}
        <span className="scrim" aria-hidden />
      </div>
      <div className="flex flex-1 items-start justify-between gap-3 p-5 pt-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-fg"><span className="text-accent [&>svg]:size-4">{icon}</span>{title}</div>
          <p className="mt-1 text-[13px] leading-relaxed text-faint">{hint}</p>
        </div>
        <IconArrowRight aria-hidden className="mt-1 size-4 shrink-0 text-ink-500 transition-transform group-hover:translate-x-0.5 group-hover:text-fg rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
      </div>
    </Link>
  );
}
