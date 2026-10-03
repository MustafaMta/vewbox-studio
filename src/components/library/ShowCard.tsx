'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Production, Show } from '@/domain/types';
import { STAGES } from '@/domain/vocabulary';
import { useStudio } from '@/studio/store';
import { assetById, episodesOfShow, primaryImageSrc, seasonsOf, stageIndex } from '@/studio/selectors';
import { T } from '@/lib/copy';
import { CastStack, ProgressBar } from '@/components/ui/page';
import { aspectShort } from '@/lib/format';

/** How far a production is, as a fraction of its stages. */
export const stageFraction = (p: Production) => stageIndex(p.stage) / (STAGES.length - 1);

/** SHOWS: wide key art, the series in numbers, its premise, its cast, how far along it is. (Owned by P1a; split out
 *  of library/Cards.tsx by F0 unchanged.) */
export function ShowCard({ show, menu }: { show: Show; menu?: ReactNode }) {
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
