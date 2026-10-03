'use client';

import Link from 'next/link';
import type { Location } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { assetById } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { IconArrowRight } from '@/components/ui/icons';

/** LOCATIONS: a wide plate, the name of the place, what kind of place it is and how many views it has. (Owned by
 *  P2; split out of library/Cards.tsx by F0 unchanged.) */
export function LocationCard({ l }: { l: Location }) {
  const T = useT();
  const { state } = useStudio();
  const plate = assetById(state, l.masterAssetId);
  return (
    <li className="card card-hover group relative min-w-0 overflow-hidden">
      <Link href={`/locations/${l.id}`} className="block outline-none">
        <div className="relative aspect-video overflow-hidden bg-input">
          {plate && !plate.unavailable ? <img src={plate.src} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" /> : <div className="poster-text absolute inset-0" aria-hidden><span dir="auto">{l.name}</span></div>}
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
