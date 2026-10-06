'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type EngineStatus } from '@/studio/api';
import { useConfirm } from '@/components/ui/kit/Overlay';
import { T } from '@/lib/copy';

/** Live engine health, read once on mount and again on demand (Check again), for the preflight of a GPU button.
 *  `status` stays null until the first answer: nothing is gated on a guess. */
export function useEngineStatus(): { status: EngineStatus | null; loading: boolean; error: string | null; reload: () => void } {
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let on = true;
    setLoading(true);
    api.status().then((s) => { if (on) { setStatus(s); setError(null); } }).catch((e) => { if (on) setError((e as Error).message); }).finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [n]);
  return { status, loading, error, reload: () => setN((x) => x + 1) };
}

/** The current tab lives in the URL (`?tab=`), so a reload and the back button both work. */
export function useTab<T extends string>(all: readonly T[], fallback: T): [T, (t: T) => void] {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = sp.get('tab');
  const tab = (all as readonly string[]).includes(raw ?? '') ? (raw as T) : fallback;
  const set = useCallback((t: T) => { const q = new URLSearchParams(sp.toString()); q.set('tab', t); router.replace(`${pathname}?${q}`, { scroll: false }); }, [sp, router, pathname]);
  return [tab, set];
}

/** Warn before leaving with unsaved edits: the browser's own prompt on close/reload (the only place a browser dialog
 *  is allowed: the page cannot draw over the browser's chrome), and the kit's ConfirmDialog on in-app links — the
 *  link is followed only when the producer chooses to discard (docs/DESIGN-SYSTEM-V4.md §1.5, §5.17). */
export function useUnsavedGuard(dirty: boolean, message: string) {
  const confirm = useConfirm();
  const router = useRouter();
  const discard = T('btn.discard');
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download') || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.origin !== location.origin || a.pathname === location.pathname) return;
      e.preventDefault(); e.stopPropagation();
      const to = `${a.pathname}${a.search}${a.hash}`;
      void confirm({ title: message, confirmLabel: discard, tone: 'danger' }).then((leave) => { if (leave) router.push(to); });
    };
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('click', onClick, true);
    return () => { window.removeEventListener('beforeunload', onUnload); document.removeEventListener('click', onClick, true); };
  }, [dirty, message, confirm, router, discard]);
  /** a navigation the page makes itself (a keyboard shortcut, a select of shots): asked the same question */
  return useCallback(async (to: string) => { if (!dirty || (await confirm({ title: message, confirmLabel: discard, tone: 'danger' }))) router.push(to); }, [dirty, message, confirm, router, discard]);
}

export { useSessionDraft, readSession, writeSession } from '@/components/ui/kit/session';

/** A draft of an object with a dirty flag and reset, for forms that edit a stored thing in place. */
export function useDraft<T>(source: T) {
  const [draft, setDraft] = useState<T>(source);
  const [base, setBase] = useState<T>(source);
  // callers pass a fresh object each render; only a change in its contents resets the draft
  const sourceKey = JSON.stringify(source);
  const latest = useRef(source); latest.current = source;
  useEffect(() => { setDraft(latest.current); setBase(latest.current); }, [sourceKey]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
  const patch = useCallback((p: Partial<T>) => setDraft((d) => ({ ...d, ...p })), []);
  const reset = useCallback(() => setDraft(base), [base]);
  return { draft, setDraft, patch, dirty, reset };
}

