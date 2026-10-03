'use client';

import { useId, useState, type ReactNode } from 'react';
import { IconCheck, IconPlus, IconWarn } from '../icons';
import { Button, type ButtonSize } from './Button';
import { cls } from './cls';
import { Field, Input } from './Field';
import { ConfirmDialog, Dialog } from './Overlay';

/** LEGACY NAMES, KIT IMPLEMENTATION — the v3 parts pages written before the redesign still import. Each now draws with
 *  the one v5.1 implementation: Card → the level-1 card; Modal → Dialog; ConfirmButton → ConfirmDialog; ConfirmDelete →
 *  a Dialog that deletes once the title is typed back; Thumb → the media frame look; PickGrid → toggles with the card
 *  check; AddTile → the start card's look. New code uses the kit directly; these go when their last page migrates. */

export function Card({ children, className = '', as: As = 'section', padded = true, ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' | 'li'; padded?: boolean } & React.HTMLAttributes<HTMLElement>) {
  return <As className={cls('card', padded && 'card-pad', className)} {...rest}>{children}</As>;
}
export function Details({ summary, children, open, className = '' }: { summary: ReactNode; children: ReactNode; open?: boolean; className?: string }) {
  return (
    <details className={cls('details', className)} open={open}>
      <summary>{summary}</summary>
      <div className="details-body">{children}</div>
    </details>
  );
}
export function KV({ rows }: { rows: Array<[ReactNode, ReactNode]> }) {
  return <dl className="kv">{rows.map(([k, v], i) => (<div key={i} className="contents"><dt>{k}</dt><dd dir="auto">{v}</dd></div>))}</dl>;
}

/** A destructive action behind the kit's confirm dialog. */
export function ConfirmButton({ onConfirm, label, title, message, confirmLabel, variant = 'danger', size = 'sm', icon, className = '', disabled, ...rest }: {
  onConfirm: () => void; label: ReactNode; title: ReactNode; message?: ReactNode; confirmLabel?: ReactNode; variant?: 'danger' | 'secondary' | 'ghost'; size?: ButtonSize; icon?: ReactNode; className?: string; disabled?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'type' | 'children' | 'disabled' | 'className' | 'title'>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} icon={icon} className={className} disabled={disabled} onClick={() => setOpen(true)} {...rest}>{label}</Button>
      <ConfirmDialog open={open} title={title} body={message} confirmLabel={confirmLabel ?? 'Delete'} onCancel={() => setOpen(false)} onConfirm={() => { setOpen(false); onConfirm(); }} />
    </>
  );
}

/** A dialog that deletes only when the title is typed back. */
export function ConfirmDelete({ title, onDelete, label, children, size = 'sm', variant = 'danger', icon }: { title: string; onDelete: () => void; label?: ReactNode; children?: ReactNode; size?: ButtonSize; variant?: 'danger' | 'ghost' | 'secondary'; icon?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const id = useId();
  const ok = typed.trim() === title.trim();
  const done = () => { setOpen(false); onDelete(); };
  return (
    <>
      <Button variant={variant} size={size} icon={icon} onClick={() => { setTyped(''); setOpen(true); }}>{label ?? 'Delete'}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="sm" role="alertdialog" title={<>Delete <bdi>{title}</bdi>?</>}
        description={children ?? 'This removes it and everything that belongs to it.'}
        footer={<><Button variant="quiet" onClick={() => setOpen(false)}>Cancel</Button><Button variant="destructive" disabled={!ok} onClick={done}>Delete</Button></>}>
        <form onSubmit={(e) => { e.preventDefault(); if (ok) done(); }}>
          <Field label="Type the title to confirm" htmlFor={`${id}-i`}>
            <Input id={`${id}-i`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" placeholder={title} />
          </Field>
        </form>
      </Dialog>
    </>
  );
}

/** A form in the kit's Dialog: opens from the trigger, `close` for the form's success. */
export function Modal({ trigger, title, description, children, size }: { trigger: (open: () => void) => ReactNode; title: ReactNode; description?: ReactNode; children: (close: () => void) => ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      {trigger(() => setOpen(true))}
      <Dialog open={open} onClose={close} title={title} description={description} size={size ?? 'md'}>{open && children(close)}</Dialog>
    </>
  );
}

/** A picture (or a video's poster) in a fixed ratio on the media ground; an empty one says so quietly. */
export function Thumb({ src, alt, kind, className = '', ratio = 'aspect-video', contain, poster, sample: _sample, empty, unavailable }: { src?: string | null; alt: string; kind?: 'IMAGE' | 'VIDEO' | 'AUDIO'; className?: string; ratio?: string; contain?: boolean; poster?: string; sample?: boolean; empty?: ReactNode; unavailable?: boolean }) {
  if (unavailable) return <div className={cls('media media-empty', ratio, className)} role="img" aria-label={alt}><span className="media-note" title="The record exists but its file is missing from the studio library."><IconWarn aria-hidden />File not available</span></div>;
  if (!src) return <div className={cls('media media-empty', ratio, className)} role="img" aria-label={alt}><span className="media-note">{empty ?? 'No picture yet'}</span></div>;
  if (kind === 'VIDEO') return <div className={cls('media', contain && 'media-contain', ratio, className)}><video src={src} poster={poster} muted playsInline preload="metadata" aria-label={alt} /></div>;
  if (kind === 'AUDIO') return <div className={cls('media media-empty', ratio, className)} role="img" aria-label={alt}><span className="media-note">Audio</span></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <div className={cls('media', contain && 'media-contain', ratio, className)}><img src={src} alt={alt} loading="lazy" decoding="async" /></div>;
}

/** Pictures to choose several of (people, places): toggles with the card check. */
export function PickGrid({ items, selected, onToggle, ratio = 'aspect-[4/5]', empty, extra }: { items: Array<{ id: string; label: string; labelAr?: string; src?: string; sub?: string }>; selected: string[]; onToggle: (id: string) => void; ratio?: string; empty?: ReactNode; extra?: ReactNode }) {
  if (items.length === 0 && !extra) return <>{empty}</>;
  return (
    <ul className="pick-grid">
      {items.map((it) => {
        const on = selected.includes(it.id);
        return (
          <li key={it.id}>
            <button type="button" aria-pressed={on} onClick={() => onToggle(it.id)} className="pick-grid-item">
              <span className="pick-grid-pic"><Thumb src={it.src} alt="" ratio={ratio} className={ratio === 'aspect-[4/5]' ? 'media-top' : undefined} />{on && <span className="card-check" aria-hidden><IconCheck /></span>}</span>
              <span className="pick-grid-name"><bdi>{it.label}</bdi></span>
              {it.sub && <span className="pick-grid-sub">{it.sub}</span>}
            </button>
          </li>
        );
      })}
      {extra && <li>{extra}</li>}
    </ul>
  );
}

/** Start something new inline, in the start card's look. */
export function AddTile({ onClick, children, ratio = 'aspect-[4/5]' }: { onClick: () => void; children: ReactNode; ratio?: string }) {
  return (
    <button type="button" onClick={onClick} className={cls('start-card add-tile', ratio)}>
      <span className="corners" aria-hidden />
      <span className="start-plus" aria-hidden><IconPlus /></span>
      <span className="start-title">{children}</span>
    </button>
  );
}
