'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { T } from '@/lib/copy';
import { IconCheck, IconClose, IconWarn } from '../icons';
import { Button, type ButtonSize } from './Button';
import { cls } from './cls';
import { Field, Input } from './Field';

/** v3 PARTS KEPT UNTIL Q1 (docs/DESIGN-SYSTEM-V4.md §8.2 rule 6) — moved here from ui/kit.tsx unchanged so every page
 *  renders as before until its package migrates: Card → tone groups, Modal / ConfirmButton / ConfirmDelete → Dialog
 *  and useConfirm, Thumb / PickGrid / AddTile → F3's Frame and tiles. New code does not use them. */

export function Card({ children, className = '', as: As = 'section', padded = true, ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' | 'li'; padded?: boolean } & React.HTMLAttributes<HTMLElement>) {
  return <As className={cls('panel', padded && 'p-4 sm:p-5', className)} {...rest}>{children}</As>;
}
export function Details({ summary, children, open, className = '' }: { summary: ReactNode; children: ReactNode; open?: boolean; className?: string }) {
  return (
    <details className={cls('details', className)} open={open}>
      <summary>{summary}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
export function KV({ rows }: { rows: Array<[ReactNode, ReactNode]> }) {
  return <dl className="kv">{rows.map(([k, v], i) => (<div key={i} className="contents"><dt>{k}</dt><dd dir="auto">{v}</dd></div>))}</dl>;
}

/** A destructive action behind a native confirm dialog (v3; ConfirmDialog / useConfirm is v4). */
export function ConfirmButton({ onConfirm, label, title, message, confirmLabel, variant = 'danger', size = 'sm', icon, className = '', disabled, ...rest }: {
  onConfirm: () => void; label: ReactNode; title: ReactNode; message?: ReactNode; confirmLabel?: ReactNode; variant?: 'danger' | 'secondary' | 'ghost'; size?: ButtonSize; icon?: ReactNode; className?: string; disabled?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'type' | 'children' | 'disabled' | 'className' | 'title'>) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  return (
    <>
      <Button variant={variant} size={size} icon={icon} className={className} disabled={disabled} onClick={() => ref.current?.showModal()} {...rest}>{label}</Button>
      <dialog ref={ref} className="dlg w-[min(92vw,26rem)]" aria-labelledby={`${id}-h`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <div className="p-5">
          <h2 id={`${id}-h`} className="h2" dir="auto">{title}</h2>
          {message && <p className="mt-2 text-sm text-muted">{message}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="quiet" onClick={() => ref.current?.close()}>{T('btn.cancel')}</Button>
            <Button variant="destructive" onClick={() => { ref.current?.close(); onConfirm(); }}>{confirmLabel ?? T('btn.delete')}</Button>
          </div>
        </div>
      </dialog>
    </>
  );
}

/** A dialog that deletes only when the title is typed back (v3). */
export function ConfirmDelete({ title, onDelete, label, children, size = 'sm', variant = 'danger', icon }: { title: string; onDelete: () => void; label?: ReactNode; children?: ReactNode; size?: ButtonSize; variant?: 'danger' | 'ghost' | 'secondary'; icon?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState('');
  const id = useId();
  return (
    <>
      <Button variant={variant} size={size} icon={icon} onClick={() => { setTyped(''); ref.current?.showModal(); }}>{label ?? T('btn.delete')}</Button>
      <dialog ref={ref} className="dlg w-[min(92vw,26rem)]" aria-labelledby={`${id}-h`} onClose={() => setTyped('')}>
        <form method="dialog" className="p-5" onSubmit={(e) => { e.preventDefault(); ref.current?.close(); onDelete(); }}>
          <h2 id={`${id}-h`} className="h2">{T('btn.delete')}: <span dir="auto">{title}</span></h2>
          <p className="mt-2 text-sm text-muted">{children ?? T('kit.deleteAll')}</p>
          <Field label={T('label.confirmTitle')} className="mt-4" htmlFor={`${id}-i`}>
            <Input id={`${id}-i`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" placeholder={title} />
          </Field>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="quiet" onClick={() => ref.current?.close()}>{T('btn.cancel')}</Button>
            <Button type="submit" variant="destructive" disabled={typed.trim() !== title.trim()}>{T('btn.delete')}</Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** A modal for a form on a native dialog (v3; Dialog is v4): opens on the trigger, closes on success. */
export function Modal({ trigger, title, description, children, size }: { trigger: (open: () => void) => ReactNode; title: ReactNode; description?: ReactNode; children: (close: () => void) => ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  const close = () => ref.current?.close();
  const width = size === 'lg' ? '56rem' : size === 'sm' ? '26rem' : '34rem';
  return (
    <>
      {trigger(() => { setOpen(true); ref.current?.showModal(); })}
      {/* below 640 px the same dialog is a bottom sheet (.sheet) */}
      <dialog ref={ref} className="dlg sheet w-[min(94vw,var(--w))] overflow-hidden" style={{ '--w': width } as React.CSSProperties} aria-labelledby={`${id}-h`} onClose={() => setOpen(false)}>
        <div className="flex max-h-[88dvh] flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
            <div className="min-w-0"><h2 id={`${id}-h`} className="h2">{title}</h2>{description && <p className="mt-0.5 text-sm text-muted">{description}</p>}</div>
            <Button variant="ghost" size="sm" aria-label={T('btn.close')} onClick={close} icon={<IconClose />} />
          </div>
          <div className="min-h-0 overflow-y-auto p-5">{open && children(close)}</div>
        </div>
      </dialog>
    </>
  );
}

/** A picture (or a video's poster) in a fixed ratio on the media floor; an empty one says so quietly (v3). */
export function Thumb({ src, alt, kind, className = '', ratio = 'aspect-video', contain, poster, sample: _sample, empty, unavailable }: { src?: string | null; alt: string; kind?: 'IMAGE' | 'VIDEO' | 'AUDIO'; className?: string; ratio?: string; contain?: boolean; poster?: string; sample?: boolean; empty?: ReactNode; unavailable?: boolean }) {
  if (unavailable) return <div className={cls('media media-empty', ratio, className)} role="img" aria-label={alt}><UnavailableNote /></div>;
  if (!src) return <div className={cls('media media-empty', ratio, className)} role="img" aria-label={alt}><span className="text-xs">{empty ?? <NoPictureYet />}</span></div>;
  if (kind === 'VIDEO') return <div className={cls('media', contain && 'media-contain', ratio, className)}><video src={src} poster={poster} muted playsInline preload="metadata" aria-label={alt} /></div>;
  if (kind === 'AUDIO') return <div className={cls('media media-empty', ratio, className)} role="img" aria-label={alt}><span className="text-2xl">♪</span></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <div className={cls('media', contain && 'media-contain', ratio, className)}><img src={src} alt={alt} loading="lazy" decoding="async" /></div>;
}

function NoPictureYet() { return <>{T('v3.noPictureYet')}</>; }

function UnavailableNote() {
  return <span className="flex flex-col items-center gap-1 px-3 text-center text-xs" title={T('media.unavailable.hint')}><IconWarn className="size-4 text-warn" aria-hidden />{T('media.unavailable')}</span>;
}

/** A row of checkable picture chips, for choosing people or places (v3). */
export function PickGrid({ items, selected, onToggle, ratio = 'aspect-[4/5]', empty, extra }: { items: Array<{ id: string; label: string; labelAr?: string; src?: string; sub?: string }>; selected: string[]; onToggle: (id: string) => void; ratio?: string; empty?: ReactNode; extra?: ReactNode }) {
  if (items.length === 0 && !extra) return <>{empty}</>;
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.25rem,1fr))] gap-3">
      {items.map((it) => {
        const on = selected.includes(it.id);
        return (
          <li key={it.id}>
            <button type="button" aria-pressed={on} onClick={() => onToggle(it.id)} className={cls('group relative w-full overflow-hidden rounded-[var(--r-3)] border text-start transition-colors', on ? 'border-accent shadow-[inset_0_0_0_0.5px_var(--accent)]' : 'border-line hover:border-line-strong')}>
              <Thumb src={it.src} alt="" ratio={ratio} className={cls('rounded-none', ratio === 'aspect-[4/5]' && '[&_img]:object-top')} />
              <span className="block px-2 py-1.5"><span className="block truncate text-sm font-medium" dir="auto">{it.label}</span>{it.sub && <span className="block truncate text-xs text-muted">{it.sub}</span>}</span>
              <span aria-hidden className={cls('absolute end-2 top-2 grid size-5 place-items-center rounded-full border', on ? 'border-accent-strong bg-accent-strong text-accent-fg' : 'border-white/70 bg-black/30')}>{on && <IconCheck className="size-3.5" />}</span>
            </button>
          </li>
        );
      })}
      {extra && <li>{extra}</li>}
    </ul>
  );
}

/** A tile that starts something new inline (v3). */
export function AddTile({ onClick, children, ratio = 'aspect-[4/5]' }: { onClick: () => void; children: ReactNode; ratio?: string }) {
  return <button type="button" onClick={onClick} className={cls('flex w-full flex-col items-center justify-center gap-1 rounded-[var(--r-3)] border border-dashed border-line-field bg-input text-sm text-muted transition-colors hover:border-faint hover:text-fg', ratio)}>{children}</button>;
}
