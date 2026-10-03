'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useT } from '@/components/ui/locale';
import { cls } from '@/components/ui/kit';
import { IconFocusMode } from '@/components/ui/icons';

/** FOCUS MODE (docs/DESIGN-SYSTEM-V4.md §5.20, §7.5) — F (while focus is in the workspace; a focused player keeps F for
 *  fullscreen) or the header button. It collapses the list and the inspector (DockLayout reads this state); the shell
 *  collapses its rail and the CompactHeader shrinks to 40 px by matching `[data-focus-mode="on"]` on the workspace
 *  root (`html:has([data-focus-mode="on"])` for F4). Esc leaves it. Each change is announced politely. */

interface Api { on: boolean; set: (v: boolean) => void; toggle: () => void }
const Ctx = createContext<Api | null>(null);

export function FocusModeProvider({ children }: { children: ReactNode }) {
  const T = useT();
  const [on, setOn] = useState(false);
  const [said, setSaid] = useState('');
  const set = useCallback((v: boolean) => { setOn(v); setSaid(v ? T('media.focus.on') : T('media.focus.off')); }, [T]);
  const toggle = useCallback(() => set(!on), [on, set]);
  useEffect(() => {
    if (!on) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('dialog[open], [role=menu]')) set(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [on, set]);
  const api = useMemo(() => ({ on, set, toggle }), [on, set, toggle]);
  return <Ctx.Provider value={api}>{children}<p className="sr-only" aria-live="polite">{said}</p></Ctx.Provider>;
}

/** The focus-mode state; outside a provider it is off and inert. */
export function useFocusMode(): Api {
  return useContext(Ctx) ?? { on: false, set: () => undefined, toggle: () => undefined };
}

export function FocusModeButton({ className }: { className?: string }) {
  const T = useT();
  const f = useFocusMode();
  return (
    <button type="button" className={cls('ebtn', className)} aria-pressed={f.on} onClick={f.toggle}>
      <IconFocusMode aria-hidden />{T('media.focus.label')}<kbd className="kbd" aria-hidden>F</kbd>
    </button>
  );
}
