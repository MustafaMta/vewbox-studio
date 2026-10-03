'use client';

import { useLayoutEffect, type ReactNode } from 'react';
import { useShellMaybe, type RoomName } from './context';

/** <Room> (docs/DESIGN-SYSTEM-V4.md §2.3) — a page says which room it is in:
 *
 *    <Room value="lobby" />      catalogues, title pages, profiles (the default: a page that says nothing is a lobby)
 *    <Room value="cutting" />    the workspace tabs and shot pages
 *    <Room value="theatre" />    the Screening Room
 *
 *  The shell sets `data-room` on its content column (the parent of <main>), so the room's ground fills the column edge
 *  to edge; tokens.css turns that into `--page`, the tint rules and the canvas. In the cutting room the column also
 *  gets `data-density` (compact, or comfortable when Settings › Interface says so) and the navigation folds to the
 *  80 px rail at any desktop width (Ctrl/⌘ \ opens it again). Put it anywhere in the page, once; it renders its
 *  children as they are. A tab switch that changes the room just renders a different value. */
export function Room({ value, children }: { value: RoomName; children?: ReactNode }) {
  const shell = useShellMaybe();
  const setRoom = shell?.setRoom;
  useLayoutEffect(() => {
    if (!setRoom) return;
    setRoom(value);
    return () => setRoom('lobby');
  }, [setRoom, value]);
  return <>{children}</>;
}

/** The room the page is in, and (for the theatre) the lights: `setLightsDown(true)` while a film plays and the
 *  producer is idle dims the navigation and anything marked `data-lights-dim` to 0.15; they come back on pointer
 *  movement or focus (the TheatrePlayer calls it, §4.8, §6.15). */
export function useRoom(): { room: RoomName; lightsDown: boolean; setLightsDown: (down: boolean) => void } {
  const shell = useShellMaybe();
  return { room: shell?.room ?? 'lobby', lightsDown: shell?.lightsDown ?? false, setLightsDown: shell?.setLightsDown ?? noop };
}
const noop = () => {};
