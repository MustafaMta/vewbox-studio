'use client';

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useStudio } from '@/studio/store';
import { useLive } from '@/studio/org';
import { useT } from '@/components/ui/locale';
import { SyncErrors } from '@/components/ui/jobs';
import { ShellContext, type RoomName, type ShellApi } from './context';
import { waitingDecisions, type PipelineRow } from './decisions';
import { readPrefs, usePrefs, writePrefs, type NavShape } from './preferences';
import { shortcutFor } from './shortcuts';
import { DocumentTitle } from './DocumentTitle';
import { Sidebar } from './Sidebar';
import { MobileBar } from './MobileBar';
import { ServerBar } from './ServerBar';
import { CommandPalette } from './CommandPalette';
import { ShortcutSheet } from './ShortcutSheet';

/** THE SHELL (docs/DESIGN-SYSTEM-V4.md §5.1, §4.1, §2.3, §7.5) — what every page of the studio sits in:
 *
 *    skip link · MobileBar (< 768) · Sidebar or NavRail (≥ 768) · content column [data-room] → ServerBar · <main>
 *    + the command palette (Ctrl/⌘K) and the shortcut sheet (?), and the global shortcuts.
 *
 *  The navigation's shape: the 240 sidebar at ≥ 1024 in the lobby, the 80 rail at 768–1023 and in the cutting room;
 *  Ctrl/⌘ \ (or Collapse) chooses the other shape for this kind of room, remembered in this browser. Until the shell
 *  has mounted, the shape the boot script chose (`html[data-nav-boot]`) is drawn, so a collapsed rail never flashes
 *  open. Pages talk to the shell through <Room>, useRoom(), useStickyExtra(), useBottomBars(), usePaletteEntries()
 *  and <LastKnown />. */

/** How long the event stream must stay down before the ServerBar says so (its first retry comes after 1 s). */
export const SERVER_GRACE_MS = 3000;

const subscribeMedia = (q: string) => (cb: () => void) => { const m = matchMedia(q); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); };
function useMedia(q: string): boolean {
  const sub = useMemo(() => subscribeMedia(q), [q]);
  return useSyncExternalStore(sub, () => matchMedia(q).matches, () => false);
}

const setRootVar = (name: string, px: number) => { const s = document.documentElement.style; if (px > 0) s.setProperty(name, `${px}px`); else s.removeProperty(name); };
const total = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

export function Shell({ children }: { children: ReactNode }) {
  const T = useT();
  const { ready, state, jobs, stream } = useStudio();
  const prefs = usePrefs();
  const wide = useMedia('(min-width: 1024px)');
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ---- the room, the lights, the bars ---------------------------------------------------------------------------
  const [room, setRoom] = useState<RoomName>('lobby');
  const [lightsDown, setLightsDown] = useState(false);
  useEffect(() => { if (room !== 'theatre') setLightsDown(false); }, [room]);
  const [bars, setBars] = useState<{ top: Record<string, number>; bottom: Record<string, number> }>({ top: {}, bottom: {} });
  const setBar = useCallback((edge: 'top' | 'bottom', owner: string, px: number) => setBars((b) => {
    if ((b[edge][owner] ?? 0) === px) return b;
    const next = { ...b[edge] }; if (px > 0) next[owner] = px; else delete next[owner];
    return { ...b, [edge]: next };
  }), []);

  // ---- the server bar: only once the stream has stayed down past a quick reconnect --------------------------------
  const [serverDown, setServerDown] = useState(false);
  useEffect(() => {
    if (stream.state !== 'down') { setServerDown(false); return; }
    const t = setTimeout(() => setServerDown(true), SERVER_GRACE_MS);
    return () => clearTimeout(t);
  }, [stream.state]);

  const [serverBarH, setServerBarH] = useState(0);
  // the sums go on <html>, where tokens.css's scroll-padding reads them (WCAG 2.4.11)
  const top = total(bars.top) + (serverDown ? serverBarH || 40 : 0);
  const bottom = total(bars.bottom);
  useLayoutEffect(() => { setRootVar('--sticky-extra', top); }, [top]);
  useLayoutEffect(() => { setRootVar('--bottom-bars', bottom); }, [bottom]);
  useEffect(() => () => { setRootVar('--sticky-extra', 0); setRootVar('--bottom-bars', 0); }, []);

  // ---- what waits for the producer --------------------------------------------------------------------------------
  const { data: pipe } = useLive<{ productions: PipelineRow[] }>('/api/studio/org/pipeline');
  const decisions = useMemo(() => waitingDecisions(state, pipe?.productions ?? null, jobs), [state, pipe, jobs]);

  // ---- the navigation's shape -------------------------------------------------------------------------------------
  const kind = room === 'cutting' ? 'cutting' : 'lobby';
  const chosen = prefs.nav?.[kind];
  const nav: NavShape = chosen ?? (!mounted ? 'sidebar' : room === 'cutting' || !wide ? 'rail' : 'sidebar');
  const toggleNav = useCallback(() => { const next: NavShape = nav === 'rail' ? 'sidebar' : 'rail'; writePrefs({ nav: kind === 'cutting' ? { cutting: next } : { lobby: next } }); }, [kind, nav]);

  // ---- the palette and the sheet ----------------------------------------------------------------------------------
  const [palette, setPalette] = useState(false);
  const [sheet, setSheet] = useState(false);
  const openPalette = useCallback(() => { setSheet(false); setPalette(true); }, []);
  const openShortcuts = useCallback(() => { setPalette(false); setSheet(true); }, []);

  // ---- global shortcuts (§7.5): never while typing; single keys only when they are on ------------------------------
  const live = useRef({ toggleNav, room }); live.current = { toggleNav, room };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // a modal layer is open: it owns the keyboard (Esc closes it natively)
      if (document.querySelector('dialog[open]')) return;
      const cmd = shortcutFor(e, readPrefs().keys !== false);
      if (!cmd) return;
      if (cmd === 'palette') { e.preventDefault(); openPalette(); }
      else if (cmd === 'sheet') { e.preventDefault(); openShortcuts(); }
      else if (cmd === 'collapse') { e.preventDefault(); live.current.toggleNav(); }
      else if (cmd === 'focus') {
        // focus mode belongs to the cutting room's workspace (F3's FocusMode listens for this event)
        const t = e.target as Element | null;
        if (live.current.room !== 'cutting' || t?.closest?.('.shell-nav, .mobile-bar')) return;
        e.preventDefault(); window.dispatchEvent(new CustomEvent('vewbox:focus-mode'));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openPalette, openShortcuts]);

  const api: ShellApi = useMemo(() => ({ room, setRoom, lightsDown, setLightsDown, setBar, nav, toggleNav, openPalette, openShortcuts, decisions, serverDown }),
    [room, lightsDown, setBar, nav, toggleNav, openPalette, openShortcuts, decisions, serverDown]);

  const density = room === 'cutting' ? (prefs.density === 'comfortable' ? 'comfortable' : 'compact') : undefined;
  return (
    <ShellContext.Provider value={api}>
      {/* every route's own <title> (§7.3); it reads the search params, so it waits in its own boundary */}
      <Suspense fallback={null}><DocumentTitle /></Suspense>
      <SyncErrors />
      <div className="shell" data-nav={mounted ? nav : undefined} data-shell-room={room} data-lights={lightsDown ? 'down' : undefined}>
        <a href="#main" className="skip-link">{T('nav.skip')}</a>
        <Sidebar />
        <div className="shell-column" data-room={room} data-density={density} data-server={serverDown ? 'down' : undefined}
          style={serverDown && serverBarH ? ({ '--server-bar-h': `${serverBarH}px` } as React.CSSProperties) : undefined}>
          {/* inside the column, so the phone's bar stands on the room's own ground */}
          <MobileBar />
          {serverDown && <ServerBar onHeight={setServerBarH} />}
          <main id="main" tabIndex={-1} className="shell-main">
            {ready ? children : (
              <div aria-busy="true" className="shell-skeleton">
                <span className="sr-only">{T('shell.save.opening')}</span>
                <div className="shell-ph shell-skeleton-title" /><div className="shell-ph shell-skeleton-lead" />
                <div className="shell-skeleton-grid">{[0, 1, 2].map((i) => <div key={i} className="shell-ph shell-ph-wide" />)}</div>
              </div>
            )}
          </main>
        </div>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <ShortcutSheet open={sheet} onClose={() => setSheet(false)} />
    </ShellContext.Provider>
  );
}
