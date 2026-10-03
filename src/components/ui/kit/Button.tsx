'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { cls } from './cls';

/** BUTTONS (docs/design/VISUAL-STANDARD-V5.1.md §5.3): filled pills, never outlined — `primary` (the light) for the
 *  region's one next action, `secondary` for the rest, `quiet` for text-like actions, `danger` (red words) for what
 *  removes; `destructive` is the one filled red button, used only to confirm inside a ConfirmDialog. `ghost` is the
 *  old name of `quiet`. md 40 · sm 32 · lg 48 (44 on touch). */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'quiet' | 'danger' | 'destructive' | 'ok';
export type ButtonSize = 'sm' | 'xs' | 'lg';

export const variantClass = (v: ButtonVariant) => (v === 'ghost' || v === 'quiet' ? 'btn-quiet' : v === 'destructive' ? 'btn-danger-solid' : `btn-${v}`);

/** `loading`: a 14 px spinner takes the leading icon's place, or sits before the label; the label and the fill stay;
 *  aria-busy, and a second press is blocked. */
export function Button({ variant = 'secondary', size, icon, className = '', type = 'button', children, loading, disabled, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode; loading?: boolean }) {
  return (
    <button type={type} className={cls('btn', variantClass(variant), size && `btn-${size}`, children == null && 'btn-icon', className)} disabled={disabled || loading} aria-busy={loading || undefined} data-loading={loading || undefined} {...rest}>
      {loading ? <Spinner /> : icon}{children}
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
