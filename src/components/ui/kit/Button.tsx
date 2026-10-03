'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { cls } from './cls';

/** BUTTONS (docs/DESIGN-SYSTEM-V4.md §2.5, §4.5, §5): ivory `primary` for the region's one next action, `secondary`
 *  for the rest, `quiet` for text-like actions, `danger` (red text and edge) for what removes. `destructive` is the
 *  one filled red button in the system, used only to confirm inside a ConfirmDialog. `ghost` and `subtle` are the old
 *  names of `quiet`. Heights follow the density tokens (--control-h 40, compact 32; --control-h-sm 32, compact 28,
 *  40 on touch). */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'quiet' | 'danger' | 'destructive' | 'ok';
export type ButtonSize = 'sm' | 'xs' | 'lg';

export const variantClass = (v: ButtonVariant) => (v === 'ghost' || v === 'quiet' ? 'btn-quiet' : v === 'destructive' ? 'btn-danger-solid' : `btn-${v}`);

/** `loading` keeps the button's width (the spinner takes the icon's place, or sits over a label-only button whose
 *  words stay in the accessible name), sets aria-busy and blocks a second press. */
export function Button({ variant = 'secondary', size, icon, className = '', type = 'button', children, loading, disabled, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode; loading?: boolean }) {
  const overlay = loading && !icon && children != null;
  return (
    <button type={type} className={cls('btn', variantClass(variant), size && `btn-${size}`, children == null && 'btn-icon', className)} disabled={disabled || loading} aria-busy={loading || undefined} data-loading={loading || undefined} {...rest}>
      {overlay ? <><Spinner className="btn-spinner" /><span className="btn-label-busy">{children}</span></> : <>{loading ? <Spinner /> : icon}{children}</>}
    </button>
  );
}

export function LinkButton({ href, variant = 'secondary', size, icon, className = '', children, ...rest }: { href: string; variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode; className?: string; children?: ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return <Link href={href} className={cls('btn', variantClass(variant), size && `btn-${size}`, children == null && 'btn-icon', className)} {...rest}>{icon}{children}</Link>;
}

/** A spinner is never alone: whatever shows it also says, in words, what is happening (§5.16). */
export function Spinner({ className = '' }: { className?: string }) {
  return <span aria-hidden className={cls('spinner', className)} />;
}
