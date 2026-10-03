'use client';

import { cloneElement, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { cls } from './cls';

/** THE TOOLTIP (docs/design/VISUAL-STANDARD-V5.1.md §5.20): surface-3, radius 6, padding 4 8, 12/16 500 text-1, a 1 px
 *  line-strong edge, no shadow, 6 px from its target. It appears 400 ms after the pointer or the focus arrives (at once
 *  when another tooltip has just closed, so moving along a toolbar reads smoothly), fades in over 120 ms, stays while
 *  the pointer is over it, and Esc hides it (WCAG 1.4.13). It describes its target (`aria-describedby`) and is never
 *  the only place essential information lives. It is placed in the viewport (`position: fixed`), so a scrolling row or
 *  a clipped card never cuts it. */

const DELAY = 400;
const WARM_MS = 300;
let lastHidden = 0;

export function Tooltip({ content, side = 'top', children, className }: {
  content: ReactNode;
  side?: 'top' | 'bottom' | 'start' | 'end';
  /** one focusable element (a button, a link) */
  children: ReactElement;
  className?: string;
}) {
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({ left: -9999, top: -9999 }); // v5-lint: allow physical — viewport coordinates of a fixed tooltip

  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const show = useCallback(() => {
    clear();
    const warm = Date.now() - lastHidden < WARM_MS;
    if (warm) setOpen(true); else timer.current = setTimeout(() => setOpen(true), DELAY);
  }, []);
  const hide = useCallback(() => { clear(); setOpen((o) => { if (o) lastHidden = Date.now(); return false; }); }, []);
  useEffect(() => () => clear(), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', hide, true);
    return () => { document.removeEventListener('keydown', onKey, true); window.removeEventListener('scroll', hide, true); };
  }, [open, hide]);
  useLayoutEffect(() => {
    if (!open) return;
    const target = wrap.current?.firstElementChild as HTMLElement | null;
    const t = tip.current;
    if (!target || !t) return;
    const r = target.getBoundingClientRect();
    const w = t.offsetWidth, h = t.offsetHeight, gap = 6, vw = window.innerWidth, vh = window.innerHeight;
    let left = r.left + r.width / 2 - w / 2, top = r.top - gap - h;
    if (side === 'bottom' || (side === 'top' && top < 4)) top = r.bottom + gap;
    if (side === 'end') { left = r.right + gap; top = r.top + r.height / 2 - h / 2; }
    if (side === 'start') { left = r.left - gap - w; top = r.top + r.height / 2 - h / 2; }
    left = Math.max(4, Math.min(vw - w - 4, left));
    top = Math.max(4, Math.min(vh - h - 4, top));
    setPos({ left, top });
  }, [open, side]);

  const child = isValidElement<{ 'aria-describedby'?: string }>(children)
    ? cloneElement(children, { 'aria-describedby': [children.props['aria-describedby'], open ? id : null].filter(Boolean).join(' ') || undefined })
    : children;
  return (
    <span ref={wrap} className={cls('tip-wrap', className)} onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide}>
      {child}
      {open && <span ref={tip} id={id} role="tooltip" className="tooltip" style={pos}>{content}</span>}
    </span>
  );
}
