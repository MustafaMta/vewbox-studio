'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Production } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { assetById, castOf, primaryImageSrc, productionHref, progressOf } from '@/studio/selectors';
import { T } from '@/lib/copy';
import { CastStack } from '@/components/ui/page';
import { IconDuration } from '@/components/ui/icons';
import { fmtSeconds } from '@/lib/format';

/** SHORTS: a poster, the length on the art, the cast and where it stands along the lower edge. (Owned by P1b; split
 *  out of library/Cards.tsx by F0 unchanged.) */
export function ShortCard({ p, menu }: { p: Production; menu?: ReactNode }) {
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
