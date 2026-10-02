'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useT } from './locale';
import type { Key } from '@/lib/i18n';
import { VewboxMark } from './brand';
import { IconAssets, IconCharacters, IconChevronRight, IconClose, IconLocations, IconMenu, IconMusicVideos, IconPlus, IconProduce, IconSettings, IconShorts, IconShows, IconStudio } from './icons';

/** THE STUDIO'S NAVIGATION — the product first: Shows, Shorts, Music Videos, Characters and the Studio Company
 *  that makes them. Then the Library (the places and the files, the same kind of thing as Characters) and the
 *  Studio (where productions stand and what runs, and Settings). One primary action above it all: New…, a sheet
 *  with five starts. */
export type NavItem = { href: string; key: Key; icon: React.ComponentType<{ className?: string }>; /** other routes that belong to this area */ also?: string[]; group?: Key };
export const NAV: NavItem[] = [
  { href: '/shows', key: 'nav.shows', icon: IconShows, also: ['/new/show', '/new/season', '/new/episode'] },
  { href: '/shorts', key: 'nav.shorts', icon: IconShorts, also: ['/new/short'] },
  { href: '/music-videos', key: 'nav.musicVideos', icon: IconMusicVideos, also: ['/new/music-video'] },
  { href: '/characters', key: 'nav.characters', icon: IconCharacters },
  { href: '/studio', key: 'nav.company', icon: IconStudio },
  { href: '/locations', key: 'nav.locations', icon: IconLocations, group: 'nav.libraryArea' },
  { href: '/assets', key: 'nav.files', icon: IconAssets, group: 'nav.libraryArea' },
  { href: '/production', key: 'nav.production', icon: IconProduce, also: ['/jobs'], group: 'nav.studioArea' },
  { href: '/settings', key: 'nav.settings', icon: IconSettings, group: 'nav.studioArea' },
];

export function isActive(pathname: string, href: string, also: string[] = []): boolean {
  const hit = (h: string) => (h === '/' ? pathname === '/' : pathname === h || pathname.startsWith(`${h}/`));
  return hit(href) || also.some(hit);
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const T = useT();
  const groups: Array<[Key | undefined, NavItem[]]> = [];
  for (const item of NAV) { const g = groups.find((x) => x[0] === item.group); if (g) g[1].push(item); else groups.push([item.group, [item]]); }
  return (
    <>
      {groups.map(([group, items]) => (
        <div key={group ?? 'primary'} className={group ? 'nav-secondary' : undefined}>
          {group && <div className="nav-group">{T(group)}</div>}
          <div className="space-y-0.5">
            {items.map((n) => { const Icon = n.icon; return (
              <Link key={n.href} href={n.href} className="nav-link" aria-current={isActive(pathname, n.href, n.also) ? 'page' : undefined} onClick={onNavigate}>
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
  return <nav aria-label={T('nav.areas')} className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-2">
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
    <div className="sticky top-0 z-40 border-b border-line bg-bg lg:hidden">
      <div className="flex h-14 items-center justify-between px-[var(--gutter)]">
        <Link href="/shows" className="flex items-center gap-2.5 rounded-[var(--r-2)]" onClick={() => setOpen(false)}>
          <VewboxMark size={28} /><span className="text-[15px] font-semibold tracking-[-0.01em] text-fg">{T('app.name')}</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/new" className="btn btn-secondary btn-sm btn-icon" aria-label={T('nav.new')}><IconPlus aria-hidden /></Link>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-label={open ? T('nav.closeMenu') : T('nav.openMenu')} aria-expanded={open} aria-controls="mobile-nav" className="btn btn-quiet btn-sm btn-icon">
            {open ? <IconClose aria-hidden /> : <IconMenu aria-hidden />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label={T('nav.areas')} className="animate-fade max-h-[80dvh] space-y-5 overflow-y-auto border-t border-line px-3 pb-4 pt-3">
          <Link href="/new" className="btn btn-secondary btn-block" onClick={() => setOpen(false)}><IconPlus aria-hidden />{T('nav.new')}</Link>
          <NavLinks onNavigate={() => setOpen(false)} />
        </nav>
      )}
    </div>
  );
}

export function Crumbs({ items }: { items: Array<{ href?: string; label: string }> }) {
  const T = useT();
  return (
    <nav aria-label={T('v3.breadcrumb')} className="mb-2 text-sm text-muted">
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
