'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BrandTile } from '@/components/ui/brand';
import { IconHelp, IconPlus, IconSearch } from '@/components/ui/icons';
import { HOME, PHONE_TABS, areaLabel, currentTab, type PhoneTab } from './nav-model';
import { useShell } from './context';
import { ShellDialog } from './ShellDialog';
import { NAV_ICONS, NavLink, needsYouLabel, useNeedsYou } from './Sidebar';

/** THE PHONE'S NAVIGATION (below 768 px). Two bars on the page ground:
 *  - the top bar (56, sticky): the mark (Home), the name of the area the page belongs to, Search and New;
 *  - the bottom bar (64 + the safe area, fixed, `data-bottom-nav` so tokens.css pads the scroll for it): Home ·
 *    Productions · Characters · Studio · More. Productions opens a sheet of Shows | Shorts | Music Videos; More holds
 *    Locations, Production (with the needs-you count, which also badges the More tab), Screening Room, Files,
 *    Settings and Help & shortcuts. The places and their order come from nav-model.ts. */

export function PhoneBar() {
  const pathname = usePathname() ?? '/';
  const { openPalette } = useShell();
  const area = areaLabel(pathname);
  return (
    <header className="phone-bar">
      <Link href={HOME} className="phone-brand" aria-label="Vewbox Studio, Home"><BrandTile /></Link>
      <p className="phone-area">{area ?? 'Vewbox Studio'}</p>
      <button type="button" className="phone-action" aria-label="Search the studio" onClick={openPalette}><IconSearch aria-hidden /></button>
      <Link href="/new" className="phone-action" aria-label="New"><IconPlus aria-hidden /></Link>
    </header>
  );
}

function SheetTab({ tab, current, count, onOpen }: { tab: Extract<PhoneTab, { items: unknown }>; current: boolean; count: number; onOpen: () => void }) {
  const Icon = NAV_ICONS[tab.icon];
  return (
    <button type="button" className="bottom-tab" aria-haspopup="dialog" onClick={onOpen} data-current={current || undefined}
      aria-label={count > 0 ? `${tab.label}, ${needsYouLabel(count)}` : undefined}>
      <span className="bottom-tab-icon" aria-hidden><Icon aria-hidden />{count > 0 && <span className="nav-badge" />}</span>
      <span className="bottom-tab-label">{tab.label}</span>
    </button>
  );
}

export function BottomNav() {
  const pathname = usePathname() ?? '/';
  const { openShortcuts } = useShell();
  const [sheet, setSheet] = useState<'productions' | 'more' | null>(null);
  useEffect(() => { setSheet(null); }, [pathname]);
  const tab = currentTab(pathname);
  const needs = useNeedsYou({ needsYou: true });
  const close = () => setSheet(null);
  const open = sheet ? PHONE_TABS.find((t) => t.id === sheet) : undefined;
  return (
    <nav className="bottom-nav" aria-label="Studio" data-bottom-nav>
      <ul role="list">
        {PHONE_TABS.map((t) => (
          <li key={t.id}>
            {'item' in t ? (
              <Link href={t.item.href} className="bottom-tab" aria-current={tab === t.id ? 'page' : undefined}>
                <span className="bottom-tab-icon" aria-hidden>{(() => { const Icon = NAV_ICONS[t.icon]; return <Icon aria-hidden />; })()}</span>
                <span className="bottom-tab-label">{t.label}</span>
              </Link>
            ) : (
              <SheetTab tab={t} current={tab === t.id} count={t.id === 'more' ? needs : 0} onOpen={() => setSheet(t.id)} />
            )}
          </li>
        ))}
      </ul>
      <ShellDialog open={open !== undefined} onClose={close} title={open?.label} placement="sheet" className="phone-sheet">
        {open && 'items' in open && (
          <ul role="list" className="sheet-list">
            {open.items.map((item) => <li key={item.href}><NavLink item={item} onNavigate={close} className="nav-item sheet-item" /></li>)}
            {open.id === 'more' && (
              <li>
                <button type="button" className="nav-item sheet-item" onClick={() => { close(); openShortcuts(); }}>
                  <span className="nav-icon" aria-hidden><IconHelp aria-hidden /></span><span className="nav-label">Help &amp; shortcuts</span>
                </button>
              </li>
            )}
          </ul>
        )}
      </ShellDialog>
    </nav>
  );
}
