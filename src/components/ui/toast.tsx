'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { IconBad, IconClose, IconInfo, IconOk } from './icons';
import { OverlayHost } from './kit/Overlay';

/** TOASTS (docs/design/VISUAL-STANDARD-V5.1.md §5.18) — one line of confirmation after a change: bottom end, 24 px from
 *  the viewport edges (phones: the content width, 12 px above the bottom bar), 360 wide, surface-2 with the overlay
 *  edge and shadow, radius 14, padding 12 16; a 16 px status icon (ok / bad / neutral), the message 14/20 text-1 and
 *  one optional quiet sm action ("Undo") or link. `role="status"` (an error is `alert`). 5 s; 10 s with an action, a
 *  link or an error; the clock stops while the toast is hovered or holds focus and gives at least a second more when
 *  it is left. At most three stack, 8 px apart (the oldest goes). In: translateY(8 → 0) and opacity over --dur-3.
 *  A toast is never the only place an error is reported. `useToast()` → { ok, bad, info, push, dismiss }.
 *  ToastProvider also hosts the kit's confirm dialogs (useConfirm, useAsk). */

export interface Toast { id: number; tone: 'ok' | 'bad' | 'info'; text: string; link?: { label: string; href: string }; action?: { label: string; onClick: () => void }; sticky?: boolean }

export interface ToastApi {
  push: (t: Omit<Toast, 'id'>) => number;
  ok: (text: string, link?: Toast['link']) => number;
  bad: (text: string) => number;
  info: (text: string, action?: Toast['action']) => number;
  dismiss: (id: number) => void;
}

export const TOAST_LIMIT = 3;

/** How long a toast stays, in ms (null: until dismissed). */
export function toastDuration(t: Pick<Toast, 'tone' | 'action' | 'link' | 'sticky'>): number | null {
  if (t.sticky) return null;
  return t.action || t.link || t.tone === 'bad' ? 10_000 : 5_000;
}

const Ctx = createContext<ToastApi | null>(null);
const EXIT_MS = 170;

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
  const Icon = t.tone === 'bad' ? IconBad : t.tone === 'ok' ? IconOk : IconInfo;
  return (
    <div role={t.tone === 'bad' ? 'alert' : 'status'} className="toast" data-tone={t.tone} data-leaving={leaving || undefined} data-held={hold || undefined}
      onPointerEnter={() => setHold(true)} onPointerLeave={() => setHold(false)}
      onFocus={() => setHold(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHold(false); }}>
      <Icon className="toast-icon" aria-hidden />
      <p className="toast-text">{t.text}</p>
      {t.action && <button type="button" className="btn btn-quiet btn-sm toast-act" onClick={() => { t.action!.onClick(); close(); }}>{t.action.label}</button>}
      {t.link && <Link href={t.link.href} className="btn btn-quiet btn-sm toast-act" onClick={close}>{t.link.label}</Link>}
      {t.sticky && <button type="button" aria-label="Dismiss" onClick={close} className="btn btn-quiet btn-sm btn-icon toast-act"><IconClose aria-hidden /></button>}
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(1);
  const gone = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = seq.current++;
    setItems((xs) => [...xs.slice(-(TOAST_LIMIT - 1)), { ...t, id }]);
    return id;
  }, []);
  const api = useMemo<ToastApi>(() => ({
    push, dismiss: gone,
    ok: (text, link) => push({ tone: 'ok', text, link }),
    bad: (text) => push({ tone: 'bad', text }),
    info: (text, action) => push({ tone: 'info', text, action }),
  }), [push, gone]);
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

export function useToast(): ToastApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useToast outside ToastProvider');
  return api;
}
