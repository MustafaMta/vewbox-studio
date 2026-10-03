'use client';

import type { ReactNode } from 'react';
import { T } from '@/lib/copy';
import { cls } from '@/components/ui/kit';

/** THE TOOL ROW (docs/DESIGN-SYSTEM-V4.md §5.20) — floating at the bottom of the canvas on `--raised-2` with the float
 *  shadow; transient tools only, each LABELLED with an icon and a word (no icon-only edit tools, §1.5), 32 px. A
 *  toolbar: one Tab stop, the arrow keys move along it (in the reading direction). Children are `ToolButton`s. */

export function ToolRow({ children, label, floating = true, className }: { children: ReactNode; label?: string; floating?: boolean; className?: string }) {
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const xs = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const i = xs.indexOf(document.activeElement as HTMLButtonElement); if (i < 0) return;
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const n = e.key === (rtl ? 'ArrowLeft' : 'ArrowRight') ? i + 1 : e.key === (rtl ? 'ArrowRight' : 'ArrowLeft') ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? xs.length - 1 : null;
    if (n === null) return;
    e.preventDefault();
    const t = xs[(n + xs.length) % xs.length];
    xs.forEach((x) => x.setAttribute('tabindex', x === t ? '0' : '-1'));
    t.focus();
  };
  return <div role="toolbar" aria-label={label ?? T('media.tools.label')} className={cls('toolrow', floating && 'toolrow-float', className)} onKeyDown={onKey}>{children}</div>;
}

export function ToolButton({ icon, children, onClick, pressed, disabled, first }: { icon?: ReactNode; children: ReactNode; onClick: () => void; pressed?: boolean; disabled?: boolean; /** the toolbar's first Tab stop */ first?: boolean }) {
  return <button type="button" className="ebtn" tabIndex={first ? 0 : -1} aria-pressed={pressed} disabled={disabled} onClick={onClick}>{icon}{children}</button>;
}
