'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { T } from '@/lib/copy';
import { IconClose } from './icons';
import { OverlayHost } from './kit/Overlay';

/** TOASTS (docs/DESIGN-SYSTEM-V4.md §5.17) — one line of confirmation after a change, at the bottom end above
 *  --bottom-bars, role="status" (an error is role="alert"). 4 s; 10 s or more when it carries an action (Undo) or a
 *  link, and for errors; the clock stops while the toast is hovered or has focus (2.2.1) and gives at least a second
 *  more when it is left. A toast is never the only place an error is reported. ToastProvider also hosts the kit's
 *  confirm dialogs (useConfirm, useAsk). */

export interface Toast { id: number; tone: 'ok' | 'bad' | 'info'; text: string; link?: { label: string; href: string }; action?: { label: string; onClick: () => void }; sticky?: boolean }

interface Api { push: (t: Omit<Toast, 'id'>) => number; ok: (text: string, link?: Toast['link']) => number; bad: (text: string) => number; dismiss: (id: number) => void }

/** How long a toast stays, in ms (null: until dismissed). */
export function toastDuration(t: Pick<Toast, 'tone' | 'action' | 'link' | 'sticky'>): number | null {
  if (t.sticky) return null;
  return t.action || t.link || t.tone === 'bad' ? 10_000 : 4_000;
}

const Ctx = createContext<Api | null>(null);
const EXIT_MS = 160;

function ToastItem({ t, onGone }: { t: Toast; onGone: (id: number) => void }) {
  const [hold, setHold] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const remaining = useRef<number | null>(toastDuration(t));
  useEffect(() => {
    if (remaining.current === null || hold || leaving) return;
    const started = Date.now();
    const timer = setTimeout(() => setLeaving(true), remaining.current);
    return () => { clearTimeout(timer); if (remaining.current !== null) remaining.current = Math.max(1000, remaining.current - (Date.now() - started)); };
  }, [hold, leaving]);
  useEffect(() => { if (!leaving) return; const x = setTimeout(() => onGone(t.id), EXIT_MS); return () => clearTimeout(x); }, [leaving, onGone, t.id]);
  const close = () => setLeaving(true);
  return (
    <div role={t.tone === 'bad' ? 'alert' : 'status'} className="toast toast-v4" data-tone={t.tone} data-leaving={leaving || undefined}
      onPointerEnter={() => setHold(true)} onPointerLeave={() => setHold(false)}
      onFocus={() => setHold(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHold(false); }}>
      <span aria-hidden className="state-dot" data-tone={t.tone === 'bad' ? 'failed' : t.tone === 'ok' ? 'done' : 'running'} />
      <div className="min-w-0 flex-1">
        <p className="break-words" dir="auto">{t.text}</p>
        {(t.link || t.action) && (
          <span className="mt-1 flex flex-wrap items-center gap-3">
            {t.action && <button type="button" className="toast-action" onClick={() => { t.action!.onClick(); close(); }}>{t.action.label}</button>}
            {t.link && <Link href={t.link.href} className="toast-action" onClick={close}>{t.link.label} <span aria-hidden className="toast-arrow">→</span></Link>}
          </span>
        )}
      </div>
      <button type="button" aria-label={T('kit.dismiss')} onClick={close} className="btn btn-quiet btn-xs btn-icon -me-2"><IconClose aria-hidden /></button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(1);
  const gone = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = seq.current++;
    setItems((xs) => [...xs.slice(-3), { ...t, id }]);
    return id;
  }, []);
  const api = useMemo<Api>(() => ({ push, dismiss: gone, ok: (text, link) => push({ tone: 'ok', text, link }), bad: (text) => push({ tone: 'bad', text }) }), [push, gone]);
  return (
    <Ctx.Provider value={api}>
      <OverlayHost>
        {children}
        <div aria-live="polite" className="toast-region">
          {items.map((t) => <ToastItem key={t.id} t={t} onGone={gone} />)}
        </div>
      </OverlayHost>
    </Ctx.Provider>
  );
}

export function useToast(): Api {
  const api = useContext(Ctx);
  if (!api) throw new Error('useToast outside ToastProvider');
  return api;
}
