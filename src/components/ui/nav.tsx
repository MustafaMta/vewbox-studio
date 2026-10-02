'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useT } from './locale';
import type { Key } from '@/lib/i18n';
import { VewboxMark } from './brand';
import { IconAssets, IconChevronRight, IconClose, IconFilm, IconMenu, IconPlus, IconProduce, IconSettings, IconStudio, IconTv } from './icons';

/** THE STUDIO'S NAVIGATION — six areas and nothing else: the Studio (the company and its departments), Projects
 *  (what is being made), the Library (who and where), Production (where each production stands and what runs),
 *  the Screening Room (what is finished) and Settings. One primary action above it all: New production. */
export type NavItem = { href: string; key: Key; icon: React.ComponentType<{ className?: string }>; /** other routes that belong to this area */ also?: string[] };
export const NAV: NavItem[] = [
  { href: '/studio', key: 'nav.studioArea', icon: IconStudio },
  { href: '/projects', key: 'nav.projects', icon: IconFilm, also: ['/shows', '/shorts', '/music-videos', '/new'] },
  { href: '/library', key: 'nav.libraryArea', icon: IconAssets, also: ['/characters', '/locations', '/assets'] },
  { href: '/production', key: 'nav.production', icon: IconProduce, also: ['/jobs'] },
  { href: '/screening', key: 'nav.screening', icon: IconTv },
  { href: '/settings', key: 'nav.settings', icon: IconSettings },
];

export function isActive(pathname: string, href: string, also: string[] = []): boolean {
  const hit = (h: string) => (h === '/' ? pathname === '/' : pathname === h || pathname.startsWith(`${h}/`));
  return hit(href) || also.some(hit);
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const T = useT();
  return (
    <div className="space-y-0.5">
      {NAV.map((n) => { const Icon = n.icon; return (
        <Link key={n.href} href={n.href} className="nav-link" aria-current={isActive(pathname, n.href, n.also) ? 'page' : undefined} onClick={onNavigate}>
          <Icon aria-hidden /><span className="flex-1 truncate">{T(n.key)}</span>
        </Link>
      ); })}
    </div>
  );
}

/** The desktop sidebar's navigation. */
export function SideNav() {
  const T = useT();
  return <nav aria-label={T('nav.areas')} className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-2">
    <NavLinks />
  </nav>;
}

/** Below the desktop breakpoint the sidebar becomes a bar and a sheet: same navigation, same brand, same action. */
export function MobileBar() {
  const T = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <div className="sticky top-0 z-40 border-b border-line/60 bg-bg/85 backdrop-blur-xl lg:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/studio" className="flex items-center gap-2.5 rounded-lg" onClick={() => setOpen(false)}>
          <VewboxMark size={28} /><span className="text-[15px] font-semibold tracking-[-0.01em] text-fg">{T('app.name')}</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/new" className="btn btn-primary btn-sm btn-icon" aria-label={T('nav.newProduction')}><IconPlus aria-hidden /></Link>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-label={open ? T('nav.closeMenu') : T('nav.openMenu')} aria-expanded={open} aria-controls="mobile-nav" className="btn btn-ghost btn-sm btn-icon">
            {open ? <IconClose aria-hidden /> : <IconMenu aria-hidden />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label={T('nav.areas')} className="animate-fade max-h-[80dvh] space-y-4 overflow-y-auto border-t border-line/60 px-3 pb-4 pt-3">
          <Link href="/new" className="btn btn-primary btn-block" onClick={() => setOpen(false)}><IconPlus aria-hidden />{T('nav.newProduction')}</Link>
          <NavLinks onNavigate={() => setOpen(false)} />
        </nav>
      )}
    </div>
  );
}

export function Crumbs({ items }: { items: Array<{ href?: string; label: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2 text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((c, i) => (
          <li key={i} className="flex min-w-0 items-center gap-1">
            {i > 0 && <IconChevronRight aria-hidden className="size-3.5 flex-none text-faint rtl:rotate-180" />}
            {c.href ? <Link href={c.href} className="truncate rounded-sm hover:text-fg" dir="auto">{c.label}</Link> : <span aria-current="page" className="truncate text-fg" dir="auto">{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
