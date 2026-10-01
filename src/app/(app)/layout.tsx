'use client';

import Link from 'next/link';
import { useT } from '@/components/ui/locale';
import { MobileBar, SideNav } from '@/components/ui/nav';
import { VewboxLogo } from '@/components/ui/brand';
import { IconPlus } from '@/components/ui/icons';
import { useStudio } from '@/studio/store';

/** THE SHELL — a fixed 244px sidebar in the panel colour: the brand, one primary action, the grouped navigation,
 *  and at the foot the one honest line about this build (generation is not connected; changes live in this
 *  browser). The work happens on the canvas to the side, in a column capped at a comfortable reading width. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const T = useT();
  const { ready, modified } = useStudio();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[244px_minmax(0,1fr)]">
      <a href="#main" className="sr-only-focusable fixed start-3 top-3 z-50 rounded-lg bg-primary px-3 py-2 text-[13px] font-semibold text-on-primary">{T('nav.skip')}</a>
      <aside className="sticky top-0 hidden h-dvh flex-col border-e border-line/70 bg-surface lg:flex">
        <Link href="/" className="flex items-center px-5 pb-4 pt-5" aria-label={T('app.name')}><VewboxLogo /></Link>
        <div className="px-3 pb-3"><Link href="/new" className="btn btn-primary btn-block"><IconPlus aria-hidden />{T('nav.newProduction')}</Link></div>
        <SideNav />
        <div className="space-y-1 border-t border-line/70 p-3">
          <Link href="/settings#generation" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] text-muted transition-colors hover:bg-raised-2 hover:text-fg">
            <span className="dot bg-warn" aria-hidden />{T('app.notConnected')}
          </Link>
          <p className="px-3 pb-1 text-[11px] leading-relaxed text-faint">{T('app.prototype')}{ready && modified ? ` · ${T('app.yourChanges')}` : ` · ${T('app.sampleData')}`}</p>
        </div>
      </aside>
      <div className="min-w-0">
        <MobileBar />
        <main id="main" className="mx-auto w-full max-w-[1320px] px-5 pb-16 pt-6 sm:px-8 sm:pt-8 lg:pt-10">
          {ready ? children : <div aria-busy className="space-y-4 pt-2"><div className="skeleton h-9 w-72" /><div className="skeleton h-4 w-96" /><div className="grid-shows mt-8">{[0, 1, 2].map((i) => <div key={i} className="skeleton aspect-[16/10]" />)}</div></div>}
        </main>
      </div>
    </div>
  );
}
