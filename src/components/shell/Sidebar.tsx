'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ComponentType } from 'react';
import { T } from '@/lib/copy';
import { BrandTile } from '@/components/ui/brand';
import {
  IconAssets, IconCharacters, IconCollapse, IconExpand, IconHelp, IconLocations, IconMusicVideos, IconPlus, IconProduce, IconScreening, IconSettings, IconShorts, IconShows, IconStudio,
} from '@/components/ui/icons';
import { HOME, NAV_GROUPS, SETTINGS_ITEM, isActive, type NavIcon, type NavItem } from './nav-model';
import { useShell } from './context';
import { ConnectionState, SaveState } from './SaveState';
import { isMac } from './shortcuts';

/** THE SIDEBAR AND THE NAVRAIL (docs/DESIGN-SYSTEM-V4.md §5.1, §4.1) — one navigation in two shapes, chosen by the
 *  shell (`data-nav` on .shell; styles/shell.css):
 *  - the 240 px sidebar (≥ 1024 in the lobby): brand row, New…, three groups, and the footer — Settings, Help &
 *    shortcuts, SaveState, the connection, Collapse;
 *  - the 80 px rail (768–1023, and the cutting room at any desktop width): icon over label, the labels never dropped;
 *    New… becomes a 48 px icon button; Help, SaveState and the connection keep their names and show them in a
 *    tooltip on hover and on focus (`data-tip`; one shared tooltip, fixed, so the scrolling rail never clips it; Esc
 *    dismisses it, and the pointer can move onto it, WCAG 1.4.13).
 *  Below 768 the MobileBar and its sheet carry the same groups in the same order (MobileBar.tsx). */

export const NAV_ICONS: Record<NavIcon, ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  shows: IconShows, shorts: IconShorts, musicVideos: IconMusicVideos, characters: IconCharacters, locations: IconLocations, files: IconAssets,
  company: IconStudio, production: IconProduce, screening: IconScreening, settings: IconSettings,
};

const noSubscribe = () => () => {};
/** "Ctrl", or "⌘" on a Mac (after hydration; the server cannot know). */
export const useModLabel = () => useSyncExternalStore(noSubscribe, () => (isMac(navigator.platform) ? '⌘' : 'Ctrl'), () => 'Ctrl');

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname() ?? '/';
  const { decisions } = useShell();
  const Icon = NAV_ICONS[item.icon];
  const label = T(item.key);
  // the needs-you count: only when it is known (the pipeline answered) and above zero; never a placeholder
  const n = item.needsYou && decisions.complete ? decisions.count : 0;
  return (
    <Link href={item.href} className="shell-item shell-link" aria-current={isActive(pathname, item.href, item.also) ? 'page' : undefined} onClick={onNavigate}
      aria-label={n > 0 ? `${label}, ${T.p('shell.needsYou', n)}` : undefined} data-needs-you={n > 0 ? n : undefined}>
      <span className="shell-icon" aria-hidden><Icon aria-hidden />{n > 0 && <span className="shell-count-badge num">{n}</span>}</span>
      <span className="shell-label">{label}</span>
      {n > 0 && <span className="shell-count num" aria-hidden><span className="dot" />{n}</span>}
    </Link>
  );
}

/** The three groups, in order. */
export function NavGroups({ onNavigate }: { onNavigate?: () => void }) {
  const id = useId();
  return (
    <div className="shell-groups">
      {NAV_GROUPS.map((g) => (
        <div key={g.id} className="shell-group" role="group" aria-labelledby={`${id}-${g.id}`}>
          <p id={`${id}-${g.id}`} className="shell-group-label">{T(g.label)}</p>
          <ul role="list">{g.items.map((item) => <li key={item.href}><NavLink item={item} onNavigate={onNavigate} /></li>)}</ul>
        </div>
      ))}
    </div>
  );
}

/** The footer: Settings, then Help & shortcuts in the same place on every page (WCAG 3.2.6), the save state and the
 *  connection, and (sidebar and rail only) Collapse. */
export function NavFooter({ onNavigate, collapse = true, rail = false }: { onNavigate?: () => void; collapse?: boolean; rail?: boolean }) {
  const { openShortcuts, toggleNav, nav } = useShell();
  const mod = useModLabel();
  const toggleName = T(nav === 'rail' ? 'shell.expand.long' : 'shell.collapse.long');
  return (
    <div className="shell-foot">
      <NavLink item={SETTINGS_ITEM} onNavigate={onNavigate} />
      <button type="button" className="shell-item shell-button" onClick={() => { onNavigate?.(); openShortcuts(); }} aria-keyshortcuts="Shift+?" data-tip={T('shell.help')}>
        <span className="shell-icon" aria-hidden><IconHelp aria-hidden /></span>
        <span className="shell-label">{T('shell.help')}</span>
      </button>
      <SaveState focusable={rail} />
      <ConnectionState onNavigate={onNavigate} />
      {collapse && (
        <button type="button" className="shell-item shell-button shell-collapse" onClick={toggleNav} aria-keyshortcuts="Control+\ Meta+\" aria-label={toggleName} data-tip={`${toggleName} · ${mod}+\\`}>
          <span className="shell-icon" aria-hidden>{nav === 'rail' ? <IconExpand aria-hidden /> : <IconCollapse aria-hidden />}</span>
          <span className="shell-label" aria-hidden>{T(nav === 'rail' ? 'shell.expand' : 'shell.collapse')}</span>
          <kbd className="shell-kbd" dir="ltr" aria-hidden>{mod}+\</kbd>
        </button>
      )}
    </div>
  );
}

/** The brand row: the monochrome glyph (and the wordmark in the sidebar) goes home. */
export function BrandLink({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href={HOME} className="shell-brand" aria-label={T('shell.homeLink')} onClick={onNavigate} data-tip={T('app.name')}>
      <BrandTile />
      <span className="brand-wordmark" aria-hidden>{T('app.name')}</span>
    </Link>
  );
}

export function NewButton({ onNavigate, className = '' }: { onNavigate?: () => void; className?: string }) {
  return (
    <Link href="/new" className={`btn btn-secondary shell-new ${className}`} onClick={onNavigate} aria-label={T('nav.new')} data-tip={T('nav.new')}>
      <IconPlus aria-hidden /><span className="shell-label">{T('nav.new')}</span>
    </Link>
  );
}

type Tip = { text: string; y: number; x: number };

/** The sidebar, or the rail: the shell says which (`nav`). */
export function Sidebar() {
  const { nav } = useShell();
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
    // beside the rail, on its right
    setTip({ text: el.dataset.tip, y: r.top + r.height / 2, x: r.right + 8 });
  };
  return (
    <nav className="shell-nav" aria-label={T('nav.areas')}
      onFocus={(e) => show(e.target)} onBlur={() => setTip(null)} onMouseOver={(e) => show(e.target)} onMouseLeave={later} onScroll={() => setTip(null)}
      onKeyDown={(e) => { if (e.key === 'Escape' && tip) { e.stopPropagation(); setTip(null); } }}>
      <BrandLink />
      <div className="shell-new-row"><NewButton /></div>
      <NavGroups />
      <NavFooter rail={nav === 'rail'} />
      {tip && <div className="rail-tip" aria-hidden style={{ insetBlockStart: tip.y, insetInlineStart: tip.x }} onMouseEnter={cancel} onMouseLeave={() => setTip(null)}>{tip.text}</div>}
    </nav>
  );
}
