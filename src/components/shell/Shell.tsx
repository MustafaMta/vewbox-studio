'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useRootVarContribution } from './root-vars';
import { useStudio } from '@/studio/store';
import { useLive } from '@/studio/org';
import { SyncErrors } from '@/components/ui/jobs';
import { ShellContext, type RoomName, type ShellApi } from './context';
import { waitingDecisions, type PipelineRow } from './decisions';
import { readPrefs, sidebarShape, usePrefs, useSidebarChoice, writeSidebar, type SidebarShape } from './preferences';
import { isActiveStatus } from '@/domain/jobs';
import { shortcutFor } from './shortcuts';
import { DocumentTitle } from './DocumentTitle';
import { Sidebar } from './Sidebar';
import { BottomNav, PhoneBar } from './PhoneNav';
import { RouteSkeleton } from './route-skeletons';
import { usePathname } from 'next/navigation';
import { isCuttingRoute } from '@/app/boot';
import { ServerBar } from './ServerBar';
import { CommandPalette } from './CommandPalette';
import { ShortcutSheet } from './ShortcutSheet';

/** THE SHELL (v5.1: the app frame — one compact left sidebar, then the content column) — what every page of the
 *  studio sits in:
 *
 *    skip link · Sidebar (≥ 768) · content column [data-room] → PhoneBar (< 768) · ServerBar · <main> · BottomNav (< 768)
 *    + the command palette (Ctrl/⌘K) and the shortcut sheet (?), and the global shortcuts.
 *
 *  The document scrolls (so every sticky header and the scroll padding of tokens.css keep working); the sidebar is
 *  sticky at the full viewport height and scrolls inside itself on a short screen. Its shape: expanded at ≥ 1024,
 *  the icon rail at 768–1023 and, by default, in the cutting room; Ctrl/⌘ \ (or Collapse) chooses the other shape for
 *  this kind of room at ≥ 1024, remembered in this browser. Until the shell has mounted, the shape the boot script
 *  chose (`html[data-nav-boot]`) is drawn, so a collapsed rail never flashes open and the column never shifts. Pages
 *  talk to the shell through <Room>, useRoom(), usePaletteEntries(), useUrlState() and <LastKnown />. */

/** How long the event stream must stay down before the ServerBar says so (its first retry comes after 1 s). */
export const SERVER_GRACE_MS = 3000;

const readSidebarNow = () => { try { const v = localStorage.getItem('vb.sidebar'); return v === 'expanded' || v === 'collapsed' ? v : null; } catch { return null; } };
const subscribeMedia = (q: string) => (cb: () => void) => { const m = matchMedia(q); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); };
function useMedia(q: string): boolean {
  const sub = useMemo(() => subscribeMedia(q), [q]);
  return useSyncExternalStore(sub, () => matchMedia(q).matches, () => false);
}

export function Shell({ children }: { children: ReactNode }) {
  const { ready, state, jobs, stream, saving } = useStudio();
  const prefs = usePrefs();
  const pathname = usePathname() ?? '/';
  const wide = useMedia('(min-width: 1280px)');

  // ---- the room and the lights -------------------------------------------------------------------------------------
  const [room, setRoom] = useState<RoomName>('lobby');
  const [lightsDown, setLightsDown] = useState(false);
  useEffect(() => { if (room !== 'theatre') setLightsDown(false); }, [room]);

  // ---- the server bar: only once the stream has stayed down past a quick reconnect --------------------------------
  const [serverDown, setServerDown] = useState(false);
  useEffect(() => {
    if (stream.state !== 'down') { setServerDown(false); return; }
    const t = setTimeout(() => setServerDown(true), SERVER_GRACE_MS);
    return () => clearTimeout(t);
  }, [stream.state]);

  // its height joins --sticky-extra on <html> (the kit's sum of contributions, §2.1 amendment; root-vars.ts), and
  // the column moves its sticky rows under it (--server-bar-h, styles/shell.css)
  const [serverBarH, setServerBarH] = useState(0);
  useRootVarContribution('--sticky-extra', serverBarH || 40, serverDown);

  // ---- what waits for the producer --------------------------------------------------------------------------------
  const { data: pipe } = useLive<{ productions: PipelineRow[] }>('/api/studio/org/pipeline');
  const decisions = useMemo(() => waitingDecisions(state, pipe?.productions ?? null, jobs), [state, pipe, jobs]);

  // ---- the sidebar's shape (§5.1, §6.5) ------------------------------------------------------------------------------
  // the producer's choice (`vb.sidebar`), else expanded at ≥ 1280 and collapsed at 1024–1279 and in the cutting room.
  // The boot script drew the same shape before the first paint (<html data-sidebar>); from here the shell keeps the
  // attribute current. The width animates only after the first frame, so loading never moves the column.
  const choice = useSidebarChoice();
  // the cutting room is known from the route before the page declares its room (the boot uses the same pattern)
  const cutting = room === 'cutting' || isCuttingRoute(pathname);
  // the boot's <html data-route> (full-width main from the first frame), kept current on client navigation
  const cuttingRoute = isCuttingRoute(pathname);
  useEffect(() => { const html = document.documentElement; if (cuttingRoute) html.setAttribute('data-route', 'cutting'); else html.removeAttribute('data-route'); }, [cuttingRoute]);
  const shape: SidebarShape = sidebarShape(choice, wide && !cutting);
  useEffect(() => {
    const html = document.documentElement;
    // before hydration the server snapshot says "no choice, not wide": keep the boot's attribute until the client knows
    html.setAttribute('data-sidebar', sidebarShape(readSidebarNow(), matchMedia('(min-width: 1280px)').matches && !cutting));
  }, [shape, cutting]);
  const nav = shape === 'collapsed' ? 'rail' : 'sidebar';
  // the width animates ONLY while the producer toggles it (never on load, resize or a room change), so the content
  // column never slides on its own (§6.5)
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleNav = useCallback(() => {
    if (!matchMedia('(min-width: 1024px)').matches) return;
    const html = document.documentElement;
    html.setAttribute('data-sidebar-anim', '');
    if (animTimer.current) clearTimeout(animTimer.current);
    animTimer.current = setTimeout(() => html.removeAttribute('data-sidebar-anim'), 400);
    writeSidebar(html.getAttribute('data-sidebar') === 'collapsed' ? 'expanded' : 'collapsed');
  }, []);

  // ---- the studio's state, one line (§5.1 footer; the More sheet) ------------------------------------------------
  const { data: health } = useLive<{ intake?: { paused: boolean } | null }>('/api/health');
  const { data: engines } = useLive<Record<string, { ok?: boolean } | undefined>>('/api/status');
  const studio = useMemo(() => {
    const running = jobs.filter((j) => isActiveStatus(j.status) && j.status !== 'QUEUED').length;
    if (serverDown) return { tone: 'failed' as const, words: 'Not connected', href: '/production#engine-room' };
    // a change the studio could not save is held and retried; it is said here until it lands (audit D1)
    if (ready && saving === 'unsaved') return { tone: 'failed' as const, words: 'Not saved — retrying', href: '/production#engine-room' };
    if (health?.intake?.paused) return { tone: 'idle' as const, words: 'Studio paused', href: '/studio' };
    if (running > 0) return { tone: 'running' as const, words: `Making · ${running} ${running === 1 ? 'job' : 'jobs'}`, href: '/studio' };
    const engineDown = engines ? ['video', 'images', 'voice'].some((k) => engines[k] && engines[k]?.ok === false) : false;
    if (engineDown) return { tone: 'failed' as const, words: 'Engine offline', href: '/production#engine-room' };
    return { tone: 'idle' as const, words: 'Studio ready', href: '/studio' };
  }, [jobs, serverDown, health, engines, ready, saving]);

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
        if (live.current.room !== 'cutting' || t?.closest?.('.shell-nav, .phone-bar, .bottom-nav')) return;
        e.preventDefault(); window.dispatchEvent(new CustomEvent('vewbox:focus-mode'));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openPalette, openShortcuts]);

  const api: ShellApi = useMemo(() => ({ room, setRoom, lightsDown, setLightsDown, nav, toggleNav, openPalette, openShortcuts, decisions, serverDown, studio }),
    [room, lightsDown, nav, toggleNav, openPalette, openShortcuts, decisions, serverDown, studio]);

  const density = room === 'cutting' ? (prefs.density === 'comfortable' ? 'comfortable' : 'compact') : undefined;
  return (
    <ShellContext.Provider value={api}>
      {/* every route's own <title> (§7.3); it reads the search params, so it waits in its own boundary */}
      <Suspense fallback={null}><DocumentTitle /></Suspense>
      <SyncErrors />
      <div className="shell" data-shell-room={room} data-lights={lightsDown ? 'down' : undefined}>
        <a href="#main" className="skip-link">Skip to content</a>
        <Sidebar />
        <div className="shell-column" data-room={room} data-density={density} data-server={serverDown ? 'down' : undefined}
          style={serverDown && serverBarH ? ({ '--server-bar-h': `${serverBarH}px` } as React.CSSProperties) : undefined}>
          {/* inside the column, so the phone's bar stands on the room's own ground */}
          <PhoneBar />
          {serverDown && <ServerBar onHeight={setServerBarH} />}
          <main id="main" tabIndex={-1} className="shell-main">
            {ready ? children : <RouteSkeleton pathname={pathname} />}
          </main>
          <BottomNav />
        </div>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <ShortcutSheet open={sheet} onClose={() => setSheet(false)} />
    </ShellContext.Provider>
  );
}
