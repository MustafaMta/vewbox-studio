'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useT } from './locale';
import type { Key } from '@/lib/i18n';
import { VewboxMark } from './brand';
import { IconAssets, IconCharacters, IconChevronRight, IconClose, IconHome, IconLocations, IconMenu, IconMusicVideos, IconPlus, IconSettings, IconShorts, IconShows } from './icons';

/** THE STUDIO'S NAVIGATION — grouped by what each place is for: the productions first, then the library that
 *  serves them, then the studio itself. One primary action above it all: New production. */
export type NavItem = { href: string; key: Key; icon: React.ComponentType<{ className?: string }>; group?: Key };
export const NAV: NavItem[] = [
  { href: '/', key: 'nav.home', icon: IconHome },
  { href: '/shows', key: 'nav.shows', icon: IconShows, group: 'nav.productions' },
  { href: '/shorts', key: 'nav.shorts', icon: IconShorts, group: 'nav.productions' },
  { href: '/music-videos', key: 'nav.musicVideos', icon: IconMusicVideos, group: 'nav.productions' },
  { href: '/characters', key: 'nav.characters', icon: IconCharacters, group: 'nav.library' },
  { href: '/locations', key: 'nav.locations', icon: IconLocations, group: 'nav.library' },
  { href: '/assets', key: 'nav.assets', icon: IconAssets, group: 'nav.library' },
  { href: '/settings', key: 'nav.settings', icon: IconSettings, group: 'nav.studio' },
];

export function isActive(pathname: string, href: string): boolean { return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`); }

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const T = useT();
  const groups: Array<[Key | undefined, NavItem[]]> = [];
  for (const item of NAV) { const g = groups.find((x) => x[0] === item.group); if (g) g[1].push(item); else groups.push([item.group, [item]]); }
  return (
    <>
      {groups.map(([group, items]) => (
        <div key={group ?? 'top'}>
          {group && <div className="nav-group">{T(group)}</div>}
          <div className="space-y-0.5">
            {items.map((n) => { const Icon = n.icon; return (
              <Link key={n.href} href={n.href} className="nav-link" aria-current={isActive(pathname, n.href) ? 'page' : undefined} onClick={onNavigate}>
                <Icon aria-hidden /><span className="flex-1 truncate">{T(n.key)}</span>
              </Link>
            ); })}
          </div>
        </div>
      ))}
    </>
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
        <Link href="/" className="flex items-center gap-2.5 rounded-lg" onClick={() => setOpen(false)}>
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
