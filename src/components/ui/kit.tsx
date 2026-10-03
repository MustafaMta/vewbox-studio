'use client';

import Link from 'next/link';
import { cloneElement, isValidElement, type ReactElement, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { useToast } from './toast';
import { useT } from './locale';
import { IconBad, IconCheck, IconClose, IconInfo, IconMore, IconOk, IconWarn } from './icons';

/** THE KIT — every control the studio uses, once. Pages compose these and add nothing of their own.
 *  Buttons carry one icon at most; fields label themselves; status is a dot and a phrase; dialogs are native. */

/** `ghost` and `subtle` are the old names of `quiet` (v3 merged them); `destructive` is the one filled red button,
 *  used only to confirm inside a dialog. */
type Variant = 'primary' | 'secondary' | 'ghost' | 'quiet' | 'danger' | 'destructive' | 'ok';
type Size = 'sm' | 'xs' | 'lg';
export const cls = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(' ');
const variantClass = (v: Variant) => (v === 'ghost' || v === 'quiet' ? 'btn-quiet' : v === 'destructive' ? 'btn-danger-solid' : `btn-${v}`);

/** The one button. Primary for the region's one action (ivory), secondary for the rest, quiet for text-like
 *  actions, danger for what deletes. `loading` keeps its width, shows a spinner in place of the icon and blocks a
 *  second press. */
export function Button({ variant = 'secondary', size, icon, className = '', type = 'button', children, loading, disabled, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; icon?: ReactNode; loading?: boolean }) {
  return <button type={type} className={cls('btn', variantClass(variant), size && `btn-${size}`, !children && 'btn-icon', className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>{loading ? <Spinner /> : icon}{children}</button>;
}

export function LinkButton({ href, variant = 'secondary', size, icon, className = '', children, ...rest }: { href: string; variant?: Variant; size?: Size; icon?: ReactNode; className?: string; children?: ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return <Link href={href} className={cls('btn', variantClass(variant), size && `btn-${size}`, !children && 'btn-icon', className)} {...rest}>{icon}{children}</Link>;
}

export function Spinner({ className = '' }: { className?: string }) {
  return <span aria-hidden className={cls('inline-block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent', className)} />;
}

/** AN UPLOAD AREA — click or drop a file. It says what it accepts; the chosen file is handed to `onFile` (the caller
 *  keeps it and says what happened). A label is always visible; the input underneath is the real, keyboard-reachable
 *  control. */
export function Dropzone({ label, hint, accept, onFile, disabled, icon, busy, className = '', error, row }: { label: ReactNode; hint?: ReactNode; accept: string; onFile: (f: File) => void; disabled?: boolean; icon?: ReactNode; busy?: boolean; className?: string; /** the last file was refused: the message sits under the zone with role=alert and the zone stays usable */ error?: ReactNode; /** the 56 px "add another" row */ row?: boolean }) {
  const [over, setOver] = useState(false);
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className={cls('dropzone', row && 'dropzone-row')} data-over={over || undefined} data-error={error ? 'true' : undefined} aria-disabled={disabled || undefined} aria-busy={busy || undefined}
        onDragOver={(e) => { if (disabled) return; e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f && !disabled) onFile(f); }}>
        <span aria-hidden className="grid size-9 flex-none place-items-center rounded-full bg-raised-2 text-muted [&>svg]:size-4">{busy ? <Spinner /> : icon}</span>
        <span className={row ? 'flex min-w-0 flex-col' : 'contents'}>
          <span className="text-[13.5px] font-semibold text-fg">{label}</span>
          {hint && <span className="text-[12px] text-faint">{hint}</span>}
        </span>
        <input id={id} type="file" accept={accept} disabled={disabled} className="sr-only" aria-describedby={error ? `${id}-err` : undefined} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      </label>
      {error && <p id={`${id}-err`} role="alert" className="help text-bad">{error}</p>}
    </div>
  );
}

/** A destructive action behind a real confirm dialog: the dialog names what goes and what stays. */
export function ConfirmButton({ onConfirm, label, title, message, confirmLabel, variant = 'danger', size = 'sm', icon, className = '', disabled, ...rest }: {
  onConfirm: () => void; label: ReactNode; title: ReactNode; message?: ReactNode; confirmLabel?: ReactNode; variant?: 'danger' | 'secondary' | 'ghost'; size?: Size; icon?: ReactNode; className?: string; disabled?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'type' | 'children' | 'disabled' | 'className' | 'title'>) {
  const T = useT();
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

/** An icon-only overflow menu for the secondary actions of a thing: rename, duplicate, delete. Native <details>, so it
 *  needs no script to open and closes on Escape or a click outside. */
export function Menu({ label, children, className = '', align = 'end' }: { label?: string; children: ReactNode; className?: string; align?: 'start' | 'end' }) {
  const T = useT();
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onDoc = (e: MouseEvent) => { if (el.open && !el.contains(e.target as Node)) el.open = false; };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && el.open) el.open = false; };
    document.addEventListener('click', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); };
  }, []);
  return (
    <details ref={ref} className={cls('relative', className)}>
      <summary className="btn btn-ghost btn-sm btn-icon list-none [&::-webkit-details-marker]:hidden" aria-label={label ?? T('nav.more')} title={label ?? T('nav.more')} aria-haspopup="menu"><IconMore /></summary>
      <div className={cls('menu', align === 'start' && 'start-0 end-auto')} role="menu" onClick={() => { if (ref.current) ref.current.open = false; }}>{children}</div>
    </details>
  );
}
export function MenuItem({ children, icon, tone, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; tone?: 'danger' }) {
  return <button type="button" role="menuitem" className="menu-item" data-tone={tone} {...rest}>{icon}{children}</button>;
}
export function MenuLink({ href, children, icon }: { href: string; children: ReactNode; icon?: ReactNode }) {
  return <Link href={href} role="menuitem" className="menu-item">{icon}{children}</Link>;
}

export function Field({ label, help, error, children, required, className = '', htmlFor, hint }: { label: ReactNode; help?: ReactNode; error?: string | null; children: ReactNode; required?: boolean; className?: string; htmlFor?: string; hint?: ReactNode }) {
  const generated = useId();
  let id = htmlFor;
  let content = children;
  if (!id && isValidElement(children)) {
    const childProps = children.props as { id?: string };
    id = childProps.id ?? `f-${generated}`;
    if (!childProps.id) content = cloneElement(children as ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>, { id, ...(error ? { 'aria-invalid': true, 'aria-describedby': `${id}-help` } : {}) });
  }
  const helpId = help || error ? `${id ?? generated}-help` : undefined;
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2"><label htmlFor={id} className="label">{label}{required && <span aria-hidden className="ms-0.5 text-bad">*</span>}</label>{hint && <span className="text-xs text-faint">{hint}</span>}</div>
      {content}
      {error ? <p id={helpId} role="alert" className="help text-bad">{error}</p> : help ? <p id={helpId} className="help">{help}</p> : null}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', dir = 'auto', ...rest } = props;
  return <input dir={dir} className={cls('input', className)} {...rest} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', dir = 'auto', ...rest } = props;
  return <textarea dir={dir} className={cls('textarea', className)} {...rest} />;
}
export function Select({ className = '', options, placeholder, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: Array<{ value: string; label: string; disabled?: boolean }>; placeholder?: string }) {
  return (
    <select className={cls('select', className)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
    </select>
  );
}
export function Checkbox({ label, help, className = '', ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; help?: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={rest.id ?? id} className={cls('flex cursor-pointer items-start gap-2.5', className)}>
      <input id={rest.id ?? id} type="checkbox" className="check mt-0.5" {...rest} />
      <span className="text-sm leading-snug"><span>{label}</span>{help && <span className="block text-xs text-muted">{help}</span>}</span>
    </label>
  );
}
export function Toggle({ label, help, checked, onChange, disabled, name }: { label: ReactNode; help?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; name?: string }) {
  return (
    <label className="flex items-start justify-between gap-4">
      <span className="text-sm"><span className="font-medium">{label}</span>{help && <span className="block text-xs text-muted">{help}</span>}</span>
      <span className="relative inline-flex flex-none items-center">
        <input type="checkbox" role="switch" name={name} aria-checked={checked} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span aria-hidden className="block h-6 w-10 rounded-full border border-line-field bg-input transition-colors peer-checked:border-accent-strong peer-checked:bg-accent-strong peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)]" />
        <span aria-hidden className="absolute start-[3px] top-[3px] block size-[18px] rounded-full bg-ink-300 transition peer-checked:translate-x-4 peer-checked:bg-fg rtl:peer-checked:-translate-x-4" />
      </span>
    </label>
  );
}

/** A row of mutually exclusive choices (a segmented control): a radiogroup with one tab stop; the arrow keys move
 *  the selection along the reading direction (mirrored in Arabic), Home and End jump to the ends. */
export function Segmented<T extends string>({ value, onChange, options, label, size, className = '' }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode; icon?: ReactNode; disabled?: boolean }>; label: string; size?: 'sm'; className?: string }) {
  const enabled = options.filter((o) => !o.disabled);
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = enabled.findIndex((o) => o.value === value);
    const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
    const fwd = e.key === 'ArrowDown' || e.key === (rtl ? 'ArrowLeft' : 'ArrowRight');
    const back = e.key === 'ArrowUp' || e.key === (rtl ? 'ArrowRight' : 'ArrowLeft');
    const next = fwd ? (i + 1) % enabled.length : back ? (i - 1 + enabled.length) % enabled.length : e.key === 'Home' ? 0 : e.key === 'End' ? enabled.length - 1 : -1;
    if (next < 0 || !enabled[next]) return;
    e.preventDefault();
    onChange(enabled[next].value);
    const btn = e.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(enabled[next].value)}"]`);
    btn?.focus();
  };
  const current = options.some((o) => o.value === value) ? value : enabled[0]?.value;
  return (
    <div role="radiogroup" aria-label={label} className={cls('seg', size === 'sm' && 'text-xs', className)} onKeyDown={onKey}>
      {options.map((o) => <button key={o.value} type="button" role="radio" data-value={o.value} aria-checked={value === o.value} tabIndex={o.value === current ? 0 : -1} disabled={o.disabled} onClick={() => onChange(o.value)}>{o.icon}{o.label}</button>)}
    </div>
  );
}

/* ---- status ------------------------------------------------------------------------------------------------ */

/** ok = done/validated · info = running · teal = live right now · gold = waiting for your decision · warn = provisional
 *  · bad = failed/blocked · accent = selected/in use · neutral = idle. */
export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral' | 'accent' | 'gold' | 'teal';

/** A pill, for a word that must stand apart from the text around it. Use sparingly; a Status line usually reads better. */
export function Badge({ children, tone = 'neutral', title, className = '' }: { children: ReactNode; tone?: Tone; title?: string; className?: string }) {
  return <span className={cls('badge', `badge-${tone}`, className)} title={title}>{children}</span>;
}
/** Status in words: a coloured dot and a phrase. This is how a thing says how it is. */
export function Status({ tone = 'neutral', children, live, title, className = '' }: { tone?: Tone; children: ReactNode; live?: boolean; title?: string; className?: string }) {
  return <span className={cls('status', `status-${tone}`, live && 'status-live', className)} title={title}>{children}</span>;
}
/** The one word that appears on every bundled picture, clip and sound: this is sample content. */
export function SampleMark({ className = '' }: { className?: string }) {
  const T = useT();
  return <span className={cls('mark', className)}>{T('label.sample')}</span>;
}

/* ---- surfaces ---------------------------------------------------------------------------------------------- */

export function Card({ children, className = '', as: As = 'section', padded = true, ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' | 'li'; padded?: boolean } & React.HTMLAttributes<HTMLElement>) {
  return <As className={cls('panel', padded && 'p-4 sm:p-5', className)} {...rest}>{children}</As>;
}
export function CardHeader({ title, eyebrow, actions, description, as: As = 'h2' }: { title: ReactNode; eyebrow?: ReactNode; actions?: ReactNode; description?: ReactNode; as?: 'h2' | 'h3' }) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <As className={As === 'h2' ? 'h2' : 'h3'}>{title}</As>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
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

/** A dialog that deletes only when the title is typed back. */
export function ConfirmDelete({ title, onDelete, label, children, size = 'sm', variant = 'danger', icon }: { title: string; onDelete: () => void; label?: ReactNode; children?: ReactNode; size?: Size; variant?: 'danger' | 'ghost' | 'secondary'; icon?: ReactNode }) {
  const T = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState('');
  const id = useId();
  return (
    <>
      <Button variant={variant} size={size} icon={icon} onClick={() => { setTyped(''); ref.current?.showModal(); }}>{label ?? T('btn.delete')}</Button>
      <dialog ref={ref} className="dlg w-[min(92vw,26rem)]" aria-labelledby={`${id}-h`} onClose={() => setTyped('')}>
        <form method="dialog" className="p-5" onSubmit={(e) => { e.preventDefault(); ref.current?.close(); onDelete(); }}>
          <h2 id={`${id}-h`} className="h2">{T('btn.delete')}: <span dir="auto">{title}</span></h2>
          <p className="mt-2 text-sm text-muted">{children ?? 'This removes it and everything that belongs to it.'}</p>
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

/** A modal for a form: opens on the trigger, closes on success. `sm` for a confirmation, the default for a short
 *  form, `lg` for an editor. */
export function Modal({ trigger, title, description, children, size }: { trigger: (open: () => void) => ReactNode; title: ReactNode; description?: ReactNode; children: (close: () => void) => ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  const T = useT();
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

/** Two to four options as selectable tiles (a radiogroup of native radios, so the arrow keys move the choice).
 *  At 768 px and wider they sit side by side (min 14rem, or the `columns` minimum); below that they stack as 64 px
 *  rows — icon, title, one-line hint, the radio mark on the end side — so nothing wraps a word per line (E2).
 *  Selected is a 1.5 px accent edge and a filled radio mark: no ring, no tint. */
export function ChoiceCards<T extends string>({ name, value, onChange, options, columns = 2, size = 'md', label }: { name: string; value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode; hint?: ReactNode; icon?: ReactNode; preview?: ReactNode; disabled?: boolean }>; columns?: 2 | 3 | 4; size?: 'md' | 'lg'; label?: string }) {
  const min = columns === 4 ? '10rem' : '14rem';
  return (
    <div role="radiogroup" aria-label={label} className="choice-tiles flex flex-col gap-2 md:grid md:gap-3" style={{ '--tile-min': min } as React.CSSProperties}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <label key={o.value} data-selected={on || undefined} aria-disabled={o.disabled || undefined} className={cls('tile-choice relative min-h-16 px-4 py-3 md:gap-3', size === 'lg' ? 'md:p-5' : 'md:p-4')}>
            <input type="radio" name={name} value={o.value} checked={on} disabled={o.disabled} onChange={() => onChange(o.value)} className="sr-only" />
            {o.preview && <div className="mb-3 hidden overflow-hidden rounded-[var(--r-media)] md:block">{o.preview}</div>}
            <span className="flex items-center gap-3 md:items-start">
              {o.icon && <span aria-hidden className={cls('grid size-5 flex-none place-items-center [&>svg]:size-5 [&>svg]:stroke-[1.5]', on ? 'text-fg' : 'text-muted')}>{o.icon}</span>}
              <span className="min-w-0 flex-1">
                <span className={cls('block font-semibold text-fg', size === 'lg' ? 'text-[15px] leading-5 md:text-[16px] md:leading-[22px]' : 'text-[15px] leading-5')}>{o.label}</span>
                {o.hint && <span className="mt-0.5 block text-sm text-muted">{o.hint}</span>}
              </span>
              <span aria-hidden className="radio-mark" />
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** One icon, a title, a muted body and one action row. `gold` is the notice for a decision that waits for a person. */
export function Notice({ tone = 'info', children, title, action, className = '', icon }: { tone?: 'info' | 'warn' | 'bad' | 'ok' | 'gold'; children?: ReactNode; title?: ReactNode; action?: ReactNode; className?: string; icon?: ReactNode }) {
  const Icon = tone === 'bad' ? IconBad : tone === 'warn' || tone === 'gold' ? IconWarn : tone === 'ok' ? IconOk : IconInfo;
  if (icon) return (
    <div role="note" className={cls('notice', `notice-${tone}`, className)}>
      {icon}
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? 'mt-0.5 text-muted' : ''}>{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
  return (
    <div role={tone === 'bad' ? 'alert' : 'note'} className={cls('notice', `notice-${tone}`, className)}>
      <Icon aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? 'mt-0.5 text-muted' : ''}>{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

/** A picture (or a video's poster) in a fixed ratio on the media floor; an empty one says so quietly. */
export function Thumb({ src, alt, kind, className = '', ratio = 'aspect-video', contain, poster, sample: _sample, empty, unavailable }: { src?: string | null; alt: string; kind?: 'IMAGE' | 'VIDEO' | 'AUDIO'; className?: string; ratio?: string; contain?: boolean; poster?: string; sample?: boolean; empty?: ReactNode; unavailable?: boolean }) {
  if (unavailable) return <div className={cls('media media-empty', ratio, className)} role="img" aria-label={alt}><UnavailableNote /></div>;
  if (!src) return <div className={cls('media media-empty', ratio, className)} role="img" aria-label={alt}><span className="text-xs">{empty ?? <NoPictureYet />}</span></div>;
  if (kind === 'VIDEO') return <div className={cls('media', contain && 'media-contain', ratio, className)}><video src={src} poster={poster} muted playsInline preload="metadata" aria-label={alt} /></div>;
  if (kind === 'AUDIO') return <div className={cls('media media-empty', ratio, className)} role="img" aria-label={alt}><span className="text-2xl">♪</span></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <div className={cls('media', contain && 'media-contain', ratio, className)}><img src={src} alt={alt} loading="lazy" decoding="async" /></div>;
}

function NoPictureYet() { const T = useT(); return <>{T('v3.noPictureYet')}</>; }

function UnavailableNote() {
  const T = useT();
  return <span className="flex flex-col items-center gap-1 px-3 text-center text-xs" title={T('media.unavailable.hint')}><IconWarn className="size-4 text-warn" aria-hidden />{T('media.unavailable')}</span>;
}

/** Tabs as links: the URL is the state, so a reload and the back button both behave. */
export function TabBar({ tabs, current, hrefFor, ariaLabel, className = '', sticky }: { tabs: Array<{ id: string; label: ReactNode; count?: number; icon?: ReactNode }>; current: string; hrefFor: (id: string) => string; ariaLabel: string; className?: string; /** the strip stays at the top while the panel scrolls */ sticky?: boolean }) {
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const links = Array.from(e.currentTarget.querySelectorAll<HTMLAnchorElement>('a[role=tab]'));
    const i = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (i === -1) return;
    const rtl = document.documentElement.dir === 'rtl';
    const next = e.key === 'ArrowRight' ? (rtl ? i - 1 : i + 1) : e.key === 'ArrowLeft' ? (rtl ? i + 1 : i - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? links.length - 1 : -1;
    if (next < 0 || next >= links.length) return;
    e.preventDefault(); links[next].focus(); links[next].click();
  };
  return (
    <div role="tablist" aria-label={ariaLabel} className={cls('tabs -mx-4 px-4 sm:mx-0 sm:px-0', sticky && 'tabs-sticky', className)} onKeyDown={onKey}>
      {tabs.map((x) => <Link key={x.id} role="tab" aria-selected={x.id === current} tabIndex={x.id === current ? 0 : -1} href={hrefFor(x.id)} className="tab" scroll={false}>{x.icon}{x.label}{x.count !== undefined && x.count > 0 && <span className="count">{x.count}</span>}</Link>)}
    </div>
  );
}

/** A drawer for a quick edit: the same native dialog, docked to the end side. */
export function Drawer({ trigger, title, description, children, size }: { trigger: (open: () => void) => ReactNode; title: ReactNode; description?: ReactNode; children: (close: () => void) => ReactNode; /** `lg` (40rem) for job and activity detail */ size?: 'md' | 'lg' }) {
  const T = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  const close = () => ref.current?.close();
  return (
    <>
      {trigger(() => { setOpen(true); ref.current?.showModal(); })}
      <dialog ref={ref} className={cls('drawer', size === 'lg' && 'drawer-lg')} aria-labelledby={`${id}-h`} onClose={() => setOpen(false)}>
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0"><h2 id={`${id}-h`} className="h2">{title}</h2>{description && <p className="mt-0.5 text-sm text-muted">{description}</p>}</div>
            <Button variant="ghost" size="sm" aria-label={T('btn.close')} onClick={close} icon={<IconClose />} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">{open && children(close)}</div>
        </div>
      </dialog>
    </>
  );
}

/** A row of checkable picture chips, for choosing people or places. */
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

/** A dashed tile that starts something new inline (a character, a location). */
export function AddTile({ onClick, children, ratio = 'aspect-[4/5]' }: { onClick: () => void; children: ReactNode; ratio?: string }) {
  return <button type="button" onClick={onClick} className={cls('flex w-full flex-col items-center justify-center gap-1 rounded-[var(--r-3)] border border-dashed border-line-field bg-input text-sm text-muted transition-colors hover:border-faint hover:text-fg', ratio)}>{children}</button>;
}

export function useMounted() { const [m, setM] = useState(false); useEffect(() => setM(true), []); return m; }

/** One line of confirmation after a saved change, from anywhere. */
export function useSaved() { const toast = useToast(); const T = useT(); return () => toast.ok(T('toast.saved')); }
