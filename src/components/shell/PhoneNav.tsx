'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { VewboxGlyph } from '@/components/ui/brand';
import { IconHelp, IconPlus, IconSearch } from '@/components/ui/icons';
import { HOME, PHONE_TABS, PRODUCTION_ITEMS, currentTab } from './nav-model';
import { useShell } from './context';
import { ShellDialog } from './ShellDialog';
import { NAV_ICONS, NavLink, StudioStateItem, needsYouLabel, useNeedsYou } from './Sidebar';

/** THE PHONE AND TABLET NAVIGATION (docs/design/VISUAL-STANDARD-V5.1.md §5.2; below 1024 px). Two bars on --bg-nav:
 *  - the top bar (56, sticky, no border): the mark and "Vewbox" (Home); Search and New as 40 px quiet icon buttons.
 *    No hamburger: everything lives in the bottom bar and More.
 *  - the bottom bar (64 + the safe area, fixed, a 1 px top edge; `data-bottom-nav`, so tokens.css pads the scroll for
 *    it): Home · Productions · Characters · Studio · More. Productions opens Shows (Shows | Shorts | Music Videos are a
 *    segmented control at the top of those pages: ProductionsSwitch); More opens a sheet with the three productions
 *    first (so every catalogue is reachable from the bars, Design QA M4), then Locations, Production (the count, which
 *    also badges the More tab), Screening Room, Files, Settings, Help & shortcuts and the studio's state. */

export function PhoneBar() {
  const { openPalette } = useShell();
  return (
    <header className="phone-bar">
      <Link href={HOME} className="phone-brand" aria-label="Vewbox Studio, Home"><VewboxGlyph size={22} /><span aria-hidden>Vewbox</span></Link>
      <button type="button" className="phone-action" aria-label="Search the studio" onClick={openPalette}><IconSearch aria-hidden /></button>
      <Link href="/new" className="phone-action" aria-label="New"><IconPlus aria-hidden /></Link>
    </header>
  );
}

export function BottomNav() {
  const pathname = usePathname() ?? '/';
  const { openShortcuts } = useShell();
  const [more, setMore] = useState(false);
  useEffect(() => { setMore(false); }, [pathname]);
  const tab = currentTab(pathname);
  const needs = useNeedsYou({ needsYou: true });
  const close = () => setMore(false);
  return (
    <nav className="bottom-nav" aria-label="Studio" data-bottom-nav>
      <ul role="list">
        {PHONE_TABS.map((t) => {
          const Icon = NAV_ICONS[t.icon];
          return (
            <li key={t.id}>
              {'item' in t ? (
                <Link href={t.item.href} className="bottom-tab" aria-current={tab === t.id ? 'page' : undefined}>
                  <span className="bottom-tab-icon" aria-hidden><Icon aria-hidden /></span>
                  <span className="bottom-tab-label">{t.label}</span>
                </Link>
              ) : (
                <button type="button" className="bottom-tab" aria-haspopup="dialog" aria-expanded={more} onClick={() => setMore(true)} data-current={tab === t.id || undefined}
                  aria-label={needs > 0 ? `${t.label}, ${needsYouLabel(needs)}` : undefined}>
                  <span className="bottom-tab-icon" aria-hidden><Icon aria-hidden />{needs > 0 && <span className="bottom-badge">{needs}</span>}</span>
                  <span className="bottom-tab-label">{t.label}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <ShellDialog open={more} onClose={close} title="More" placement="sheet" className="phone-sheet">
        <ul role="list" className="sheet-list">
          <li className="sheet-group t-label" aria-hidden>Productions</li>
          {PRODUCTION_ITEMS.map((item) => <li key={item.href}><NavLink item={item} onNavigate={close} className="nav-item sheet-item" /></li>)}
          <li className="sheet-group t-label" aria-hidden>Workspace</li>
          {PHONE_TABS.flatMap((t) => ('items' in t ? t.items : [])).map((item) => <li key={item.href}><NavLink item={item} onNavigate={close} className="nav-item sheet-item" /></li>)}
          <li>
            <button type="button" className="nav-item sheet-item" onClick={() => { close(); openShortcuts(); }}>
              <span className="nav-icon" aria-hidden><IconHelp aria-hidden /></span><span className="nav-label">Help &amp; shortcuts</span>
            </button>
          </li>
          <li className="sheet-state"><StudioStateItem onNavigate={close} className="nav-item sheet-item" /></li>
        </ul>
      </ShellDialog>
    </nav>
  );
}
