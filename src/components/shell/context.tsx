'use client';

import { createContext, useContext } from 'react';
import type { Decisions } from './decisions';

/** What the shell offers the pages inside it (docs/DESIGN-SYSTEM-V4.md §2.3, §4.1, §5.1, §5.12). Use the hooks;
 *  the context itself is the shell's. */

export type RoomName = 'lobby' | 'cutting' | 'theatre';

export interface ShellApi {
  room: RoomName;
  setRoom: (room: RoomName) => void;
  /** theatre: dim the navigation (and the page's own chrome marked `data-lights-dim`) while the film plays */
  lightsDown: boolean;
  setLightsDown: (down: boolean) => void;
  /** the sidebar's shape now (rail = collapsed), and the toggle (Ctrl/⌘ \) */
  nav: 'rail' | 'sidebar';
  toggleNav: () => void;
  openPalette: () => void;
  openShortcuts: () => void;
  /** what waits for the producer (count, items), from real state */
  decisions: Decisions;
  /** the event stream has been down long enough to say so (ServerBar is showing) */
  serverDown: boolean;
  /** the studio's state in one line (the sidebar footer, the More sheet): paused, making, ready, an engine offline */
  studio: { tone: 'idle' | 'running' | 'failed'; words: string; href: string };
}

export const ShellContext = createContext<ShellApi | null>(null);

export function useShell(): ShellApi {
  const s = useContext(ShellContext);
  if (!s) throw new Error('useShell outside the (app) shell');
  return s;
}

/** The shell, or null outside it (a component that may also render elsewhere, e.g. a kit specimen). */
export const useShellMaybe = (): ShellApi | null => useContext(ShellContext);
