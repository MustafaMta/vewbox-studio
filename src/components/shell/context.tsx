'use client';

import { createContext, useContext } from 'react';
import type { Decisions } from './decisions';
import { useRootVarContribution } from './root-vars';

/** What the shell offers the pages inside it (docs/DESIGN-SYSTEM-V4.md §2.3, §4.1, §5.1, §5.12). Use the hooks;
 *  the context itself is the shell's. */

export type RoomName = 'lobby' | 'cutting' | 'theatre';

export interface ShellApi {
  room: RoomName;
  setRoom: (room: RoomName) => void;
  /** theatre: dim the navigation (and the page's own chrome marked `data-lights-dim`) while the film plays */
  lightsDown: boolean;
  setLightsDown: (down: boolean) => void;
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

/** A sticky bar under `--sticky-top` (a compact header, sticky tabs) adds its height to `--sticky-extra` while it is
 *  shown, so scroll-padding keeps a focused element clear of it (WCAG 2.4.11). The same as the kit's
 *  `useRootVarContribution('--sticky-extra', px)` (§2.1 amendment); prefer that one in kit and page code. */
export function useStickyExtra(px: number, active = true): void { useRootVarContribution('--sticky-extra', px, active); }

/** A fixed bar at the bottom (the player bar, a sticky form footer) adds its height to `--bottom-bars`. The same as
 *  the kit's `useRootVarContribution('--bottom-bars', px)`. */
export function useBottomBars(px: number, active = true): void { useRootVarContribution('--bottom-bars', px, active); }
