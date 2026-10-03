'use client';

import { useEffect, useState } from 'react';

/** RUNTIME LAYOUT VALUES (docs/DESIGN-SYSTEM-V4.md §2.1): --sticky-extra (a compact header and/or sticky tabs that
 *  are stuck) and --bottom-bars (a player bar or a sticky form footer that is shown). They feed the scroll-padding
 *  on <html>, so a focused element is never hidden under a sticky bar (WCAG 2.4.11) — which is why they are written
 *  on <html>: scroll-padding is read there and nowhere else. Several parts may contribute at once (a form footer and
 *  the player bar); the value is the sum of what every mounted part contributes, and it goes back to 0px when the
 *  last one leaves. */

const contributions = new Map<string, Map<symbol, number>>();

function apply(name: string) {
  const m = contributions.get(name);
  const total = m ? [...m.values()].reduce((a, b) => a + b, 0) : 0;
  if (total > 0) document.documentElement.style.setProperty(name, `${total}px`);
  else document.documentElement.style.removeProperty(name);
}

/** Adds `px` to the root variable `name` while `active` (and mounted). */
export function useRootVarContribution(name: '--sticky-extra' | '--bottom-bars' | '--sticky-header', px: number, active = true) {
  useEffect(() => {
    if (!active || px <= 0) return;
    const key = Symbol(name);
    let m = contributions.get(name);
    if (!m) { m = new Map(); contributions.set(name, m); }
    m.set(key, px);
    apply(name);
    return () => { contributions.get(name)?.delete(key); apply(name); };
  }, [name, px, active]);
}

/** True while a media query matches (false on the server and before the first effect, so markup hydrates). */
export function useMediaQuery(query: string): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const sync = () => setOn(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);
  return on;
}
