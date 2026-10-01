'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

/** TOASTS — one line of confirmation after a change, with an optional link to where it went. Errors stay longer. */

export interface Toast { id: number; tone: 'ok' | 'bad' | 'info'; text: string; link?: { label: string; href: string }; sticky?: boolean }

interface Api { push: (t: Omit<Toast, 'id'>) => void; ok: (text: string, link?: Toast['link']) => void; bad: (text: string) => void; dismiss: (id: number) => void }

const Ctx = createContext<Api | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(1);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = seq.current++;
    setItems((xs) => [...xs.slice(-3), { ...t, id }]);
    if (!t.sticky) setTimeout(() => dismiss(id), t.tone === 'bad' ? 8000 : 3600);
  }, [dismiss]);
  const api = useMemo<Api>(() => ({ push, dismiss, ok: (text, link) => push({ tone: 'ok', text, link }), bad: (text) => push({ tone: 'bad', text }) }), [push, dismiss]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:pe-6">
        {items.map((t) => (
          <div key={t.id} role={t.tone === 'bad' ? 'alert' : 'status'} className="toast pointer-events-auto flex items-start gap-3">
            <span aria-hidden className={`mt-1.5 inline-block size-2 flex-none rounded-full ${t.tone === 'bad' ? 'bg-bad' : t.tone === 'ok' ? 'bg-ok' : 'bg-info'}`} />
            <div className="min-w-0 flex-1">
              <p className="break-words">{t.text}</p>
              {t.link && <Link href={t.link.href} className="mt-1 inline-block text-sm font-medium text-accent-text underline-offset-2 hover:underline" onClick={() => dismiss(t.id)}>{t.link.label} →</Link>}
            </div>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="btn btn-ghost btn-xs -me-2">×</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): Api {
  const api = useContext(Ctx);
  if (!api) throw new Error('useToast outside ToastProvider');
  return api;
}
