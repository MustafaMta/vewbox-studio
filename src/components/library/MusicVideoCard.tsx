'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Production } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { assetById, castOf, productionHref } from '@/studio/selectors';
import { T } from '@/lib/copy';
import { TrackButton } from '@/components/players/PlayerProvider';
import { trackOf } from '@/components/workspace/MusicWorkspace';
import { IconDuration } from '@/components/ui/icons';
import { StageStatus } from './ProductionTile';
import { aspectShort, fmtSeconds } from '@/lib/format';

/** A typographic cover for a track without artwork: a deterministic colour field from the title. (Refused by v4
 *  §1.5 — the radial colour field and the uppercase artist line; P1c replaces it with a TitleCard, Q1 deletes it.) */
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

/** MUSIC VIDEOS: cover, song and artist first; play the track in place; treatment and format as music metadata.
 *  (Owned by P1c; split out of library/Cards.tsx by F0 unchanged.) */
export function MusicVideoCard({ p, menu }: { p: Production; menu?: ReactNode }) {
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
