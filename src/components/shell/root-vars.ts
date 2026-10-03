'use client';

import { useEffect } from 'react';

/** THE SHELL'S ADAPTER TO THE KIT'S `useRootVarContribution` (docs/DESIGN-SYSTEM-V4.md §2.1, amendment by F2:
 *  `--sticky-extra` and `--bottom-bars` live on <html> as the sum of the contributions of whatever is shown, written
 *  only through the kit's hook). The kit (src/components/ui/kit/layout.ts) is not on this branch; this file has the
 *  same signature and the same sum-of-contributions behaviour, and is the only place the shell writes those
 *  variables (the ServerBar's height; useStickyExtra/useBottomBars in context.tsx).
 *
 *  AT MERGE with F2: replace the body of this file with
 *      export { useRootVarContribution } from '@/components/ui/kit/layout';
 *  so the shell and the kit share one set of contributions (two writers would overwrite each other's sums). */

type RootVar = '--sticky-extra' | '--bottom-bars' | '--sticky-header';
const contributions = new Map<string, Map<symbol, number>>();

function apply(name: string) {
  const m = contributions.get(name);
  const total = m ? [...m.values()].reduce((a, b) => a + b, 0) : 0;
  if (total > 0) document.documentElement.style.setProperty(name, `${total}px`);
  else document.documentElement.style.removeProperty(name);
}

/** Adds `px` to the root variable `name` while `active` (and mounted). */
export function useRootVarContribution(name: RootVar, px: number, active = true) {
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
