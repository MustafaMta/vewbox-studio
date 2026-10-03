'use client';

import Link from 'next/link';
import { useT } from '@/components/ui/locale';
import { MobileBar, SideNav } from '@/components/ui/nav';
import { VewboxLogo } from '@/components/ui/brand';
import { IconPlus } from '@/components/ui/icons';
import { SyncErrors } from '@/components/ui/jobs';
import { useStudio } from '@/studio/store';
import { isActiveStatus } from '@/domain/jobs';

/** THE SHELL — a 240 px sidebar on the ground (an end hairline, not a raised panel): the brand, "New…" as a
 *  secondary action (so the page's own primary is the only ivory one on screen), the grouped navigation, and at the
 *  foot the live state of the studio in a dot and words. The work happens in a start-aligned column, 1280 px at
 *  most, with the page gutter (16 / 24 / 40). */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const T = useT();
  const { ready, connected, jobs, saving } = useStudio();
  const running = jobs.filter((j) => isActiveStatus(j.status)).length;
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <SyncErrors />
      <a href="#main" className="sr-only-focusable fixed start-3 top-3 z-50 rounded-[var(--r-2)] bg-primary px-3 py-2 text-[13px] font-semibold text-on-primary">{T('nav.skip')}</a>
      <aside className="sticky top-0 hidden h-dvh flex-col border-e border-line bg-bg lg:flex">
        <Link href="/studio" className="flex items-center rounded-[var(--r-2)] px-5 pb-4 pt-5" aria-label={T('app.name')}><VewboxLogo /></Link>
        <div className="px-3 pb-4"><Link href="/new" className="btn btn-secondary btn-block"><IconPlus aria-hidden />{T('nav.new')}</Link></div>
        <SideNav />
        <div className="space-y-0.5 border-t border-line p-3">
          <Link href="/production" className="flex items-center gap-2 rounded-[var(--r-2)] px-3 py-2 text-xs text-faint transition-colors hover:bg-input hover:text-fg">
            <span className={`dot ${connected ? (running ? 'bg-accent dot-live' : 'bg-ok') : 'bg-warn'}`} aria-hidden />{connected ? (running ? `${running} ${T('jobs.running')}` : T('status.connected')) : T('status.disconnected')}
          </Link>
          {/* what the store's queue says, never assumed: saved only when nothing is waiting or failing (audit D1) */}
          <p className={`px-3 pb-1 text-xs ${saving === 'unsaved' ? 'text-warn' : 'text-faint'}`}>{!ready ? '…' : saving === 'saved' ? T('app.saved') : saving === 'saving' ? T('app.saving') : T('app.unsaved')}</p>
        </div>
      </aside>
      <div className="min-w-0">
        <MobileBar />
        <main id="main" className="w-full max-w-[calc(1280px+2*var(--gutter))] px-[var(--gutter)] pb-16 pt-6 sm:pt-8 lg:pt-10">
          {ready ? children : <div aria-busy className="space-y-4 pt-2"><div className="skeleton h-9 w-72" /><div className="skeleton h-4 w-96" /><div className="grid-shows mt-8">{[0, 1, 2].map((i) => <div key={i} className="skeleton aspect-[16/10]" />)}</div></div>}
        </main>
      </div>
    </div>
  );
}
