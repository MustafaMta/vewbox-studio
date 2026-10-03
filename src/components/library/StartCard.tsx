'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { IconArrowRight } from '@/components/ui/icons';

/** A way to start, as a picture card: art on top, the name and one line beneath, an arrow that leans in. (Owned by
 *  P1a; split out of library/Cards.tsx by F0 unchanged. Its `bg-gradient-to-br` is refused by v4 §1.5; P1a removes
 *  it.) */
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
        <IconArrowRight aria-hidden className="mt-1 size-4 shrink-0 text-ink-500 transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
      </div>
    </Link>
  );
}
