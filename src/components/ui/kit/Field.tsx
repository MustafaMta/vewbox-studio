'use client';

import { cloneElement, Fragment, isValidElement, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { useT } from '../locale';
import { IconClose, IconUpload } from '../icons';
import { Button, Spinner } from './Button';
import { cls } from './cls';
import { useMediaQuery, useRootVarContribution } from './layout';
import { StateWord } from './Status';

/** FORMS (docs/DESIGN-SYSTEM-V4.md §5.18) — v3's field: 40 px (compact 32), --line-field, focus as an iris border
 *  plus a 1 px inset (no glow), invalid in --bad, messages linked by aria-describedby, "optional" at the end of the
 *  label row. Added here: ErrorSummary, SettingsSummary, ChipInput, ShapedDropzone, FormFooter and SaveWord. The
 *  Recorder is in Recorder.tsx, Segmented and ChoiceTiles in Choice.tsx. */

type Described = { id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string };

/** A label, the control, then its help or its error. The control gets the id, aria-invalid and aria-describedby. */
export function Field({ label, help, error, children, required, optional, className = '', htmlFor, hint }: { label: ReactNode; help?: ReactNode; error?: ReactNode | null; children: ReactNode; required?: boolean; /** says "optional" at the end of the label row */ optional?: boolean; className?: string; htmlFor?: string; hint?: ReactNode }) {
  const T = useT();
  const generated = useId();
  const child = isValidElement(children) ? (children as ReactElement<Described>) : null;
  const id = htmlFor ?? child?.props.id ?? `f-${generated}`;
  const msgId = help || error ? `${id}-help` : undefined;
  let content = children;
  // with `htmlFor` the control is somewhere inside the child: the caller wires it
  if (child && !htmlFor) {
    const extra: Described = {};
    if (!child.props.id) extra.id = id;
    if (error) extra['aria-invalid'] = true;
    if (msgId) extra['aria-describedby'] = [child.props['aria-describedby'], msgId].filter(Boolean).join(' ');
    content = cloneElement(child, extra);
  }
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="label">{label}{required && <span aria-hidden className="ms-0.5 text-bad">*</span>}</label>
        {optional ? <span className="field-optional">{T('kit.optional')}</span> : hint && <span className="text-xs text-faint">{hint}</span>}
      </div>
      {content}
      {error ? <p id={msgId} role="alert" className="help text-bad">{error}</p> : help ? <p id={msgId} className="help">{help}</p> : null}
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

/* ---- validation -------------------------------------------------------------------------------------------- */

/** More than three errors earn a summary at the top of the form (§5.18). */
export const needsErrorSummary = (n: number) => n > 3;

/** The summary: each error is a link that moves focus to its field. Renders nothing for three errors or fewer
 *  (each field says its own), unless `always`. */
export function ErrorSummary({ errors, title, always, className = '' }: { errors: ReadonlyArray<{ id: string; message: ReactNode }>; title?: ReactNode; always?: boolean; className?: string }) {
  const T = useT();
  if (!errors.length || (!always && !needsErrorSummary(errors.length))) return null;
  return (
    <div role="alert" className={cls('notice notice-bad error-summary', className)}>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title ?? T('kit.errors.title')}</p>
        <ul className="mt-1">
          {errors.map((e) => <li key={e.id}><a href={`#${e.id}`} onClick={(ev) => { ev.preventDefault(); document.getElementById(e.id)?.focus(); }}>{e.message}</a></li>)}
        </ul>
      </div>
    </div>
  );
}

/* ---- SettingsSummary ---------------------------------------------------------------------------------------- */

/** Intent before configuration: one line ("For The Kite · Cartoon · Arabic (Iraqi Baghdadi) · Change"); *Change*
 *  discloses the controls inline. */
export function SettingsSummary({ items, children, defaultOpen = false, className = '' }: { items: ReadonlyArray<ReactNode>; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  const T = useT();
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const shown = items.filter((x) => x !== null && x !== undefined && x !== false && x !== '');
  return (
    <div className={cls('settings-summary', className)}>
      <p className="settings-summary-line">
        <span id={`${id}-s`} dir="auto">{shown.map((x, i) => <Fragment key={i}>{i > 0 && <span aria-hidden className="slate-sep"> · </span>}<span>{x}</span></Fragment>)}</span>
        <span aria-hidden className="slate-sep"> · </span>
        <button type="button" className="link-quiet" aria-expanded={open} aria-controls={`${id}-c`} aria-describedby={`${id}-s`} onClick={() => setOpen((o) => !o)}>{T('kit.change')}</button>
      </p>
      <div id={`${id}-c`} hidden={!open} className="settings-summary-controls">{children}</div>
    </div>
  );
}

/* ---- ChipInput ---------------------------------------------------------------------------------------------- */

/** The list after adding what was typed: split on commas, trimmed, no empty and no repeated chip (case-insensitive),
 *  at most `max`. */
export function addChips(existing: readonly string[], raw: string, max?: number): string[] {
  const next = [...existing];
  for (const part of raw.split(/[,،]/).map((s) => s.trim()).filter(Boolean)) {
    if (!next.some((v) => v.toLocaleLowerCase() === part.toLocaleLowerCase())) next.push(part);
  }
  return max ? next.slice(0, max) : next;
}

/** Traits and distinguishing marks: Enter or a comma adds what was typed; each chip has × (a 24 px target);
 *  Backspace in the empty field removes the last chip. Put it inside a Field: it takes the id and the description. */
export function ChipInput({ value, onChange, placeholder, max, disabled, id, className = '', ...aria }: { value: readonly string[]; onChange: (v: string[]) => void; placeholder?: string; max?: number; disabled?: boolean; id?: string; className?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) {
  const T = useT();
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const commit = (raw: string) => { const next = addChips(value, raw, max); if (next.length !== value.length) onChange(next); setText(''); };
  const full = max !== undefined && value.length >= max;
  return (
    <div className={cls('chip-input', className)} data-disabled={disabled || undefined} onClick={(e) => { if (e.target === e.currentTarget) input.current?.focus(); }}>
      {value.map((v, i) => (
        <span key={`${v}-${i}`} className="filter-chip">
          <span className="min-w-0 truncate" dir="auto">{v}</span>
          <button type="button" className="filter-chip-x" disabled={disabled} aria-label={T.f('kit.chip.remove', { label: v })} onClick={() => onChange(value.filter((_, j) => j !== i))}><IconClose aria-hidden /></button>
        </span>
      ))}
      <input
        ref={input} id={id} className="chip-input-field" dir="auto" value={text} disabled={disabled || full} placeholder={value.length ? undefined : placeholder} {...aria}
        onChange={(e) => { const v = e.target.value; if (/[,،]/.test(v)) commit(v); else setText(v); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(text); }
          else if (e.key === 'Backspace' && !text && value.length) { e.preventDefault(); onChange(value.slice(0, -1)); }
        }}
        onBlur={() => { if (text.trim()) commit(text); }}
      />
    </div>
  );
}

/* ---- dropzones ---------------------------------------------------------------------------------------------- */

export type DropRatio = '928/1664' | '1/1' | '16/9' | '4/1';

/** The drop target is the target frame (§5.18): 928:1664 for "From a picture", 1:1 for a sleeve, 16:9 for a plate
 *  photo, 4:1 for audio. *Browse* is always there (2.5.7: dragging is never the only way). Once a file is chosen the
 *  frame becomes its preview, with *Replace* and *Remove* under it. A refusal shows under the frame (role="alert")
 *  and the frame stays usable. */
export function ShapedDropzone({ ratio, label, hint, accept, onFile, file, onRemove, error, busy, disabled, className = '' }: {
  ratio: DropRatio; label: ReactNode; hint?: ReactNode; accept: string; onFile: (f: File) => void;
  /** the chosen file: its name, and a preview src when there is one */ file?: { name: string; src?: string; kind?: 'image' | 'audio' | 'video'; meta?: ReactNode } | null;
  onRemove?: () => void; error?: ReactNode; busy?: boolean; disabled?: boolean; className?: string;
}) {
  const T = useT();
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const browse = () => input.current?.click();
  return (
    <div className={cls('shaped-drop-wrap', className)}>
      <div
        className="shaped-drop" style={{ aspectRatio: ratio.replace('/', ' / ') }} data-ratio={ratio} data-over={over || undefined} data-error={error ? 'true' : undefined} data-filled={file ? 'true' : undefined} aria-busy={busy || undefined}
        onDragOver={(e) => { if (disabled) return; e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f && !disabled) onFile(f); }}
      >
        {file?.src && (file.kind ?? 'image') === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={file.src} alt={file.name} className="shaped-drop-img" />
        ) : file?.src && file.kind === 'audio' ? (
          <audio src={file.src} controls className="shaped-drop-audio" aria-label={file.name} />
        ) : file?.src && file.kind === 'video' ? (
          <video src={file.src} controls muted playsInline className="shaped-drop-img" aria-label={file.name} />
        ) : (
          <span className="shaped-drop-empty">
            {busy ? <Spinner /> : <IconUpload aria-hidden className="size-5" />}
            <span className="font-semibold text-fg">{label}</span>
            {hint && <span className="caption">{hint}</span>}
            <Button size="sm" onClick={browse} disabled={disabled || busy} aria-describedby={error ? `${id}-err` : undefined}>{T('kit.drop.browse')}</Button>
          </span>
        )}
      </div>
      <input ref={input} type="file" accept={accept} disabled={disabled} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      {file && (
        <div className="shaped-drop-meta">
          <span className="min-w-0 flex-1 truncate font-medium text-fg" dir="auto" title={file.name}>{file.name}</span>
          {file.meta && <span className="num text-faint">{file.meta}</span>}
          <span className="flex items-center gap-2">
            <Button size="sm" onClick={browse} disabled={disabled || busy} loading={busy}>{T('kit.drop.replace')}</Button>
            {onRemove && <Button size="sm" variant="quiet" onClick={onRemove} disabled={disabled || busy}>{T('btn.remove')}</Button>}
          </span>
        </div>
      )}
      {error && <p id={`${id}-err`} role="alert" className="help text-bad">{error}</p>}
    </div>
  );
}

/** v3's upload area (kept until Q1; new code uses ShapedDropzone): click or drop a file. */
export function Dropzone({ label, hint, accept, onFile, disabled, icon, busy, className = '', error, row }: { label: ReactNode; hint?: ReactNode; accept: string; onFile: (f: File) => void; disabled?: boolean; icon?: ReactNode; busy?: boolean; className?: string; error?: ReactNode; row?: boolean }) {
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

/* ---- footer and save state ---------------------------------------------------------------------------------- */

/** The form's action row. On a phone it is a sticky 56 px footer on --page with a top hairline, and while it is
 *  there it adds 56 px to --bottom-bars so a focused field scrolls clear of it (fields keep
 *  scroll-margin-block-end: 72px). `start` sits at the start (a time estimate, a SaveWord). */
export function FormFooter({ children, start, className = '' }: { children: ReactNode; start?: ReactNode; className?: string }) {
  const phone = useMediaQuery('(max-width: 639px)');
  useRootVarContribution('--bottom-bars', 56, phone);
  return (
    <div className={cls('form-footer', className)}>
      {start && <span className="form-footer-start">{start}</span>}
      <span className="form-footer-actions">{children}</span>
    </div>
  );
}

export type SaveState = 'saved' | 'saving' | 'unsaved';
/** Autosave in words (§5.18): "Saved", "Saving…" or "Not saved — retrying", from the real write queue. */
export function SaveWord({ state, className = '' }: { state: SaveState; className?: string }) {
  const T = useT();
  return (
    <span role="status" aria-live="polite" className={className}>
      <StateWord tone={state === 'saved' ? 'done' : state === 'saving' ? 'running' : 'waiting'}>{T(state === 'saved' ? 'kit.save.saved' : state === 'saving' ? 'kit.save.saving' : 'kit.save.unsaved')}</StateWord>
    </span>
  );
}
