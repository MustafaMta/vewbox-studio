'use client';

import { useEffect } from 'react';

/** MERGE ADAPTER (F3 → F2's kit). The §2.1 amendment: --sticky-extra and --bottom-bars live on <html> as the sum of
 *  what every mounted part contributes, written by the kit's `useRootVarContribution` (src/components/ui/kit/layout.ts
 *  on main) and never by a component directly. That hook is not on the F3 branch, so this file carries the same
 *  signature and behaviour; at merge it becomes one line:
 *
 *    export { useRootVarContribution } from '@/components/ui/kit';
 *
 *  The PlayerBar (players/PlayerBar.tsx) and the media CompactHeader (media/CompactHeader.tsx) call it. */

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
