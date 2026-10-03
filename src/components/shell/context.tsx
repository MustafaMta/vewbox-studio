'use client';

import { createContext, useContext, useId, useLayoutEffect } from 'react';
import type { Decisions } from './decisions';

/** What the shell offers the pages inside it (docs/DESIGN-SYSTEM-V4.md §2.3, §4.1, §5.1, §5.12). Use the hooks below;
 *  the context itself is the shell's. */

export type RoomName = 'lobby' | 'cutting' | 'theatre';

export interface ShellApi {
  room: RoomName;
  setRoom: (room: RoomName) => void;
  /** theatre: dim the navigation (and the page's own chrome marked `data-lights-dim`) while the film plays */
  lightsDown: boolean;
  setLightsDown: (down: boolean) => void;
  /** heights of sticky bars under `--sticky-top` and of fixed bars at the bottom, by owner */
  setBar: (edge: 'top' | 'bottom', owner: string, px: number) => void;
  /** the navigation's shape now, and the toggle (Ctrl/⌘ \) */
  nav: 'rail' | 'sidebar';
  toggleNav: () => void;
  openPalette: () => void;
  openShortcuts: () => void;
  /** what waits for the producer (count, items), from real state */
  decisions: Decisions;
  /** the event stream has been down long enough to say so (ServerBar is showing) */
  serverDown: boolean;
}

export const ShellContext = createContext<ShellApi | null>(null);

export function useShell(): ShellApi {
  const s = useContext(ShellContext);
  if (!s) throw new Error('useShell outside the (app) shell');
  return s;
}

/** The shell, or null outside it (a component that may also render elsewhere, e.g. a kit specimen). */
export const useShellMaybe = (): ShellApi | null => useContext(ShellContext);

/** A sticky bar under the navigation's top bar (a compact header, sticky tabs) says how tall it is while it is shown;
 *  the shell adds every such height into `--sticky-extra`, so `scroll-padding` keeps a focused element clear of them
 *  (WCAG 2.4.11). Pass 0 (or unmount) when the bar is not shown. */
export function useStickyExtra(px: number): void { useBar('top', px); }

/** A fixed bar at the bottom (the player bar, a sticky form footer) says how tall it is while shown; the shell adds
 *  them into `--bottom-bars` (toasts and scroll-padding stay above it). */
export function useBottomBars(px: number): void { useBar('bottom', px); }

function useBar(edge: 'top' | 'bottom', px: number) {
  const shell = useShellMaybe();
  const id = useId();
  const set = shell?.setBar;
  useLayoutEffect(() => {
    if (!set) return;
    set(edge, id, px);
    return () => set(edge, id, 0);
  }, [set, edge, id, px]);
}
