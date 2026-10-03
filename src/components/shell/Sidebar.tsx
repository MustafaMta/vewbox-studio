'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore, type ComponentType } from 'react';
import { BrandTile } from '@/components/ui/brand';
import {
  IconAssets, IconCharacters, IconCollapse, IconExpand, IconHelp, IconHome, IconLocations, IconMore, IconMusicVideos, IconPlus, IconProduce, IconScreening, IconSearch, IconSettings, IconShorts, IconShows, IconStudio,
} from '@/components/ui/icons';
import { HOME, NAV_GROUPS, SETTINGS_ITEM, isActive, type NavIcon, type NavItem } from './nav-model';
import { useShell } from './context';
import { ConnectionState, SaveState } from './SaveState';
import { isMac } from './shortcuts';

/** THE SIDEBAR (the v5.1 shell: one compact left sidebar, the producer's decision after the Krea reference) — one
 *  navigation in two shapes, chosen by the shell (`data-nav` on .shell; styles/shell.css):
 *  - expanded (≥ 1024, the default): brand row, New and Search, the primary places, the Production group, and the
 *    footer — Settings, Help & shortcuts, the connection and the save state only while they are abnormal, Collapse;
 *  - collapsed, an icon rail (768–1023 always; ≥ 1024 by Ctrl/⌘ \ or Collapse, remembered per room kind): the same
 *    items as icons, each named in a tooltip on hover and on focus (`data-tip`; one shared tooltip, fixed, so the
 *    scrolling rail never clips it; Esc dismisses it, and the pointer can move onto it, WCAG 1.4.13).
 *  Below 768 the phone's top bar and bottom bar carry the same places (PhoneNav.tsx). */

type IconC = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
export const NAV_ICONS: Record<NavIcon | 'more', IconC> = {
  home: IconHome, shows: IconShows, shorts: IconShorts, musicVideos: IconMusicVideos, characters: IconCharacters, company: IconStudio,
  production: IconProduce, screening: IconScreening, locations: IconLocations, files: IconAssets, settings: IconSettings, more: IconMore,
};

const noSubscribe = () => () => {};
/** "Ctrl", or "⌘" on a Mac (after hydration; the server cannot know). */
export const useModLabel = () => useSyncExternalStore(noSubscribe, () => (isMac(navigator.platform) ? '⌘' : 'Ctrl'), () => 'Ctrl');

/** The needs-you count on an item: only when it is known (the pipeline answered) and above zero; never a placeholder. */
export function useNeedsYou(item: { needsYou?: boolean }): number {
  const { decisions } = useShell();
  return item.needsYou && decisions.complete ? decisions.count : 0;
}
export const needsYouLabel = (n: number) => `${n} decision${n === 1 ? '' : 's'} waiting for you`;

export function NavLink({ item, onNavigate, className = 'nav-item' }: { item: NavItem; onNavigate?: () => void; className?: string }) {
  const pathname = usePathname() ?? '/';
  const n = useNeedsYou(item);
  const Icon = NAV_ICONS[item.icon];
  return (
    <Link href={item.href} className={className} aria-current={isActive(pathname, item.href, item.also) ? 'page' : undefined} onClick={onNavigate}
      aria-label={n > 0 ? `${item.label}, ${needsYouLabel(n)}` : undefined} data-tip={item.label}>
      <span className="nav-icon" aria-hidden><Icon aria-hidden />{n > 0 && <span className="nav-badge num" />}</span>
      <span className="nav-label">{item.label}</span>
      {n > 0 && <span className="nav-count num" aria-hidden>{n}</span>}
    </Link>
  );
}

type Tip = { text: string; y: number; x: number };

/** The sidebar, or the rail: the shell says which (`nav`). */
export function Sidebar() {
  const { nav, toggleNav, openPalette, openShortcuts, serverDown } = useShell();
  const mod = useModLabel();
  const [tip, setTip] = useState<Tip | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => { if (hide.current) clearTimeout(hide.current); hide.current = null; };
  const later = () => { cancel(); hide.current = setTimeout(() => setTip(null), 150); };
  useEffect(() => { if (nav !== 'rail') setTip(null); }, [nav]);
  useEffect(() => cancel, []);
  const show = (target: EventTarget | null) => {
    cancel();
    if (target instanceof Element && target.closest('.rail-tip')) return; // the pointer moved onto the tooltip itself
    const el = target instanceof Element ? target.closest<HTMLElement>('[data-tip]') : null;
    if (nav !== 'rail' || !el?.dataset.tip) { setTip(null); return; }
    const r = el.getBoundingClientRect();
    setTip({ text: el.dataset.tip, y: r.top + r.height / 2, x: r.right + 8 });
  };
  const toggleName = nav === 'rail' ? 'Expand the sidebar' : 'Collapse the sidebar';
  return (
    <nav className="shell-nav" aria-label="Studio" data-focus-inset
      onFocus={(e) => show(e.target)} onBlur={() => setTip(null)} onMouseOver={(e) => show(e.target)} onMouseLeave={later} onScroll={() => setTip(null)}
      onKeyDown={(e) => { if (e.key === 'Escape' && tip) { e.stopPropagation(); setTip(null); } }}>
      <Link href={HOME} className="nav-brand" aria-label="Vewbox Studio, Home" data-tip="Home">
        <BrandTile /><span className="nav-wordmark" aria-hidden>Vewbox Studio</span>
      </Link>

      <div className="nav-actions">
        <Link href="/new" className="nav-new" data-tip="New" aria-label="New">
          <IconPlus aria-hidden /><span className="nav-label" aria-hidden>New</span>
        </Link>
        <button type="button" className="nav-search" onClick={openPalette} aria-label="Search the studio" aria-keyshortcuts="Control+K Meta+K" data-tip={`Search · ${mod}+K`}>
          <IconSearch aria-hidden />
        </button>
      </div>

      <div className="nav-groups">
        {NAV_GROUPS.map((g) => (
          <div key={g.id} className="nav-group" role="group" aria-label={g.label ?? 'Places'}>
            {g.label && <p className="nav-group-label" aria-hidden>{g.label}</p>}
            <ul role="list">{g.items.map((item) => <li key={item.href}><NavLink item={item} /></li>)}</ul>
          </div>
        ))}
      </div>

      <div className="nav-foot">
        {serverDown && <ConnectionState />}
        <SaveState onlyWhenAbnormal focusable={nav === 'rail'} />
        <NavLink item={SETTINGS_ITEM} />
        <button type="button" className="nav-item" onClick={openShortcuts} aria-keyshortcuts="Shift+?" data-tip="Help & shortcuts">
          <span className="nav-icon" aria-hidden><IconHelp aria-hidden /></span>
          <span className="nav-label">Help &amp; shortcuts</span>
        </button>
        <button type="button" className="nav-item nav-collapse" onClick={toggleNav} aria-keyshortcuts="Control+\ Meta+\" aria-label={toggleName} data-tip={`${toggleName} · ${mod}+\\`}>
          <span className="nav-icon" aria-hidden>{nav === 'rail' ? <IconExpand aria-hidden /> : <IconCollapse aria-hidden />}</span>
          <span className="nav-label" aria-hidden>Collapse</span>
          <kbd className="nav-kbd" aria-hidden>{mod}+\</kbd>
        </button>
      </div>
      {tip && <div className="rail-tip" aria-hidden style={{ insetBlockStart: tip.y, insetInlineStart: tip.x }} onMouseEnter={cancel} onMouseLeave={() => setTip(null)}>{tip.text}</div>}
    </nav>
  );
}
