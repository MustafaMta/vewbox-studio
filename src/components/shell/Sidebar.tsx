'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore, type ComponentType } from 'react';
import { VewboxGlyph } from '@/components/ui/brand';
import {
  IconAssets, IconCharacters, IconHelp, IconHome, IconLocations, IconMore, IconMusicVideos, IconPanel, IconProduce, IconScreening, IconSearch, IconSettings, IconShorts, IconShows, IconStudio,
} from '@/components/ui/icons';
import { HOME, NAV_GROUPS, SETTINGS_ITEM, isActive, type NavIcon, type NavItem } from './nav-model';
import { useShell } from './context';
import { isMac } from './shortcuts';

/** THE SIDEBAR (docs/design/VISUAL-STANDARD-V5.1.md §5.1) — the studio's one navigation at ≥ 1024, on --bg-nav, full
 *  height and sticky, no border. Expanded 240 / collapsed 64; the shape is <html data-sidebar>, drawn by the boot
 *  script before the first paint and kept by the shell (Ctrl/⌘ \ or the brand row's button; remembered as
 *  `vb.sidebar`). Top to bottom: the brand row (mark, Vewbox, collapse) · Search (opens the command palette) · Home,
 *  Shows, Shorts, Music Videos, Characters, Studio Company · Workspace: Locations, Production (the one needs-you count),
 *  Screening Room, Files · the footer: the studio's state, Settings, Help & shortcuts.
 *  Collapsed, every item is a 40 × 40 icon named by a tooltip to its right (400 ms, then 0 while moving between
 *  items; Esc dismisses it; the pointer may move onto it, WCAG 1.4.13). Below 1024 the phone's bars replace it. */

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
      aria-label={n > 0 ? `${item.label}, ${needsYouLabel(n)}` : undefined} data-tip={n > 0 ? `${item.label} · ${n} waiting` : item.label}>
      <span className="nav-icon" aria-hidden><Icon aria-hidden />{n > 0 && <span className="nav-dot" />}</span>
      <span className="nav-label">{item.label}</span>
      {n > 0 && <span className="nav-count" aria-hidden>{n}</span>}
    </Link>
  );
}

/** The studio's state in one line: a 6 px dot and the words; it links to the Studio Company (or the engine room). */
export function StudioStateItem({ onNavigate, className = 'nav-item' }: { onNavigate?: () => void; className?: string }) {
  const { studio } = useShell();
  return (
    <Link href={studio.href} className={`${className} nav-state`} data-tone={studio.tone} onClick={onNavigate} data-tip={studio.words}>
      <span className="nav-icon" aria-hidden><span className="nav-state-dot" /></span>
      <span className="nav-label">{studio.words}</span>
    </Link>
  );
}

type Tip = { text: string; y: number; x: number };

export function Sidebar() {
  const { nav, toggleNav, openPalette, openShortcuts } = useShell();
  const mod = useModLabel();
  const [tip, setTip] = useState<Tip | null>(null);
  const showing = useRef(false); showing.current = tip !== null;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const later = () => { cancel(); timer.current = setTimeout(() => setTip(null), 120); };
  useEffect(() => { if (nav !== 'rail') setTip(null); }, [nav]);
  useEffect(() => cancel, []);
  const show = (target: EventTarget | null, now = false) => {
    cancel();
    if (target instanceof Element && target.closest('.rail-tip')) return; // the pointer moved onto the tooltip itself
    const el = target instanceof Element ? target.closest<HTMLElement>('[data-tip]') : null;
    if (nav !== 'rail' || !el?.dataset.tip) { setTip(null); return; }
    const r = el.getBoundingClientRect();
    const next = { text: el.dataset.tip, y: r.top + r.height / 2, x: r.right + 8 };
    // 400 ms before the first tooltip; none while moving from one item to the next
    if (now || showing.current) setTip(next); else timer.current = setTimeout(() => setTip(next), 400);
  };
  const toggleName = nav === 'rail' ? 'Expand the sidebar' : 'Collapse the sidebar';
  return (
    <nav className="shell-nav" aria-label="Studio"
      onFocus={(e) => show(e.target, true)} onBlur={() => setTip(null)} onMouseOver={(e) => show(e.target)} onMouseLeave={later} onScroll={() => setTip(null)}
      onKeyDown={(e) => { if (e.key === 'Escape' && tip) { e.stopPropagation(); setTip(null); } }}>
      <div className="nav-brand-row">
        <Link href={HOME} className="nav-brand" aria-label="Vewbox Studio, Home" data-tip="Home">
          <VewboxGlyph size={22} /><span className="nav-wordmark" aria-hidden>Vewbox</span>
        </Link>
        <button type="button" className="nav-collapse" onClick={toggleNav} aria-keyshortcuts="Control+\ Meta+\" aria-label={toggleName} aria-expanded={nav !== 'rail'} data-tip={`${toggleName} · ${mod}+\\`}>
          <IconPanel aria-hidden />
        </button>
      </div>

      <button type="button" className="nav-search" onClick={openPalette} aria-label="Search the studio" aria-keyshortcuts="Control+K Meta+K" data-tip={`Search · ${mod} K`}>
        <IconSearch aria-hidden /><span className="nav-search-label" aria-hidden>Search</span><kbd className="kbd" aria-hidden>{mod} K</kbd>
      </button>

      <div className="nav-groups">
        {NAV_GROUPS.map((g) => (
          <div key={g.id} className="nav-group" role="group" aria-label={g.label ?? 'Places'}>
            {g.label && <p className="nav-group-label" aria-hidden><span>{g.label}</span></p>}
            <ul role="list">{g.items.map((item) => <li key={item.href}><NavLink item={item} /></li>)}</ul>
          </div>
        ))}
      </div>

      <div className="nav-foot">
        <StudioStateItem />
        <NavLink item={SETTINGS_ITEM} />
        <button type="button" className="nav-item" onClick={openShortcuts} aria-keyshortcuts="Shift+?" data-tip="Help & shortcuts">
          <span className="nav-icon" aria-hidden><IconHelp aria-hidden /></span>
          <span className="nav-label">Help &amp; shortcuts</span>
        </button>
        {/* the MiniMax H3 Community License §IV.2: "MiniMax H3" shown prominently in the interface; the credit opens the
            engines and their licences */}
        <Link href="/settings#licences" className="nav-credit" data-tip="Video by MiniMax H3 · licences" aria-label="Video by MiniMax H3. The engines and their licences">
          <span className="nav-credit-short" aria-hidden>H3</span><span className="nav-credit-long" aria-hidden>Video by <strong>MiniMax H3</strong></span> {/* v4-lint: allow engine — the MiniMax H3 Community License §IV.2 asks for the name in the interface */}
        </Link>
      </div>
      {tip && <div className="rail-tip" role="presentation" style={{ insetBlockStart: tip.y, insetInlineStart: tip.x }} onMouseEnter={cancel} onMouseLeave={() => setTip(null)}>{tip.text}</div>}
    </nav>
  );
}
