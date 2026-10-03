'use client';

import { cloneElement, Fragment, isValidElement, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { IconClose, IconUpload, IconWarn } from '../icons';
import { Button, Spinner } from './Button';
import { cls } from './cls';
import { useMediaQuery, useRootVarContribution } from './layout';
import { Progress } from './Loading';
import { StateWord } from './Status';

/** FORMS (docs/design/VISUAL-STANDARD-V5.1.md §5.15) — the field is 40 high (44 coarse), surface-1, a 1 px control
 *  boundary, radius 10, padding 0 12, 14/20; hover a lighter boundary; focus the light boundary and the focus ring;
 *  invalid the --bad boundary and the message 13/18 --bad with a 14 px icon, linked by aria-describedby; disabled on
 *  the page tone. The label sits above (.label 12/16 500 text-2, 6 px), "optional" at the end of its row, the hint
 *  under the control (13/18 text-3).
 *
 *    Field, Input, Textarea, Select (the native select, drawn as a field), Checkbox, Toggle
 *    ErrorSummary, SettingsSummary, ChipInput, FormFooter, SaveWord
 *    Dropzone        the upload area: drag a file in or click to choose (dragging is never the only way); drag-over
 *                    is the light boundary; `progress` (0–1) shows the bar inside; `error` the --bad boundary and the
 *                    message; `disabledReason` makes it inert and says why
 *    ShapedDropzone  the drop target in the target's own frame (928:1664, 1:1, 16:9, 4:1), with its preview */

type Described = { id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string };

/** A label, the control, then its help or its error. The control gets the id, aria-invalid and aria-describedby. */
export function Field({ label, help, error, children, required, optional, className = '', htmlFor, hint }: { label: ReactNode; help?: ReactNode; error?: ReactNode | null; children: ReactNode; required?: boolean; /** says "optional" at the end of the label row */ optional?: boolean; className?: string; htmlFor?: string; hint?: ReactNode }) {
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
    <div className={cls('field', className)}>
      <div className="field-label-row">
        <label htmlFor={id} className="label">{label}{required && <span aria-hidden className="field-required">*</span>}</label>
        {optional ? <span className="field-optional">optional</span> : hint && <span className="field-optional">{hint}</span>}
      </div>
      {content}
      {error ? <p id={msgId} role="alert" className="field-error"><IconWarn aria-hidden />{error}</p> : help ? <p id={msgId} className="help">{help}</p> : null}
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
/** The native select, drawn as a field (its list is the system's own, so it works with every keyboard and reader). */
export function Select({ className = '', options, placeholder, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>; placeholder?: string }) {
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
    <label htmlFor={rest.id ?? id} className={cls('check-row', className)}>
      <input id={rest.id ?? id} type="checkbox" className="check" {...rest} />
      <span className="check-text"><span>{label}</span>{help && <span className="check-help">{help}</span>}</span>
    </label>
  );
}
/** A switch: the label and an optional line at the start, the 40 × 24 track at the end (on: the light). */
export function Toggle({ label, help, checked, onChange, disabled, name }: { label: ReactNode; help?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; name?: string }) {
  return (
    <label className="toggle-row" data-disabled={disabled || undefined}>
      <span className="check-text"><span className="toggle-label">{label}</span>{help && <span className="check-help">{help}</span>}</span>
      <input type="checkbox" role="switch" name={name} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="toggle" />
    </label>
  );
}

/* ---- validation -------------------------------------------------------------------------------------------- */

/** More than three errors earn a summary at the top of the form. */
export const needsErrorSummary = (n: number) => n > 3;

/** The summary: each error is a link that moves focus to its field. Renders nothing for three errors or fewer
 *  (each field says its own), unless `always`. */
export function ErrorSummary({ errors, title, always, className = '' }: { errors: ReadonlyArray<{ id: string; message: ReactNode }>; title?: ReactNode; always?: boolean; className?: string }) {
  if (!errors.length || (!always && !needsErrorSummary(errors.length))) return null;
  return (
    <div role="alert" className={cls('notice notice-bad error-summary', className)}>
      <div className="notice-main">
        <p className="notice-title">{title ?? 'Check these fields before you continue'}</p>
        <ul>
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
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const shown = items.filter((x) => x !== null && x !== undefined && x !== false && x !== '');
  return (
    <div className={cls('settings-summary', className)}>
      <p className="settings-summary-line">
        <span id={`${id}-s`}>{shown.map((x, i) => <Fragment key={i}>{i > 0 && <span aria-hidden className="slate-sep"> · </span>}<span>{x}</span></Fragment>)}</span>
        <span className="settings-summary-change"><span aria-hidden className="slate-sep"> · </span><button type="button" className="link-quiet" aria-expanded={open} aria-controls={`${id}-c`} aria-describedby={`${id}-s`} onClick={() => setOpen((o) => !o)}>Change</button></span>
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
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const commit = (raw: string) => { const next = addChips(value, raw, max); if (next.length !== value.length) onChange(next); setText(''); };
  const full = max !== undefined && value.length >= max;
  return (
    <div className={cls('chip-input', className)} data-disabled={disabled || undefined} onClick={(e) => { if (e.target === e.currentTarget) input.current?.focus(); }}>
      {value.map((v, i) => (
        <span key={`${v}-${i}`} className="filter-chip">
          <span className="filter-chip-text"><bdi>{v}</bdi></span>
          <button type="button" className="filter-chip-x" disabled={disabled} aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((_, j) => j !== i))}><IconClose aria-hidden /></button>
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

/** The drop target is the target frame: 928:1664 for "From a picture", 1:1 for a sleeve, 16:9 for a plate photo, 4:1
 *  for audio. *Browse* is always there (dragging is never the only way). Once a file is chosen the frame becomes its
 *  preview, with *Replace* and *Remove* under it. A refusal shows under the frame (role="alert"). */
export function ShapedDropzone({ ratio, label, hint, accept, onFile, file, onRemove, error, busy, progress, disabled, className = '' }: {
  ratio: DropRatio; label: ReactNode; hint?: ReactNode; accept: string; onFile: (f: File) => void;
  /** the chosen file: its name, and a preview src when there is one */ file?: { name: string; src?: string; kind?: 'image' | 'audio' | 'video'; meta?: ReactNode } | null;
  onRemove?: () => void; error?: ReactNode; busy?: boolean; /** 0–1 while uploading */ progress?: number | null; disabled?: boolean; className?: string;
}) {
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
            {busy ? <Spinner /> : <IconUpload aria-hidden />}
            <span className="dropzone-title">{label}</span>
            {hint && <span className="dropzone-hint">{hint}</span>}
            {typeof progress === 'number' ? <Progress value={progress} label="Uploading" className="dropzone-progress" />
              : <Button size="sm" onClick={browse} disabled={disabled || busy} aria-describedby={error ? `${id}-err` : undefined}>Browse</Button>}
          </span>
        )}
      </div>
      <input ref={input} type="file" accept={accept} disabled={disabled} className="dropzone-input" tabIndex={-1} aria-hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      {file && (
        <div className="shaped-drop-meta">
          <span className="shaped-drop-name" title={file.name}><bdi>{file.name}</bdi></span>
          {file.meta && <span className="shaped-drop-fact">{file.meta}</span>}
          <span className="shaped-drop-acts">
            <Button size="sm" onClick={browse} disabled={disabled || busy} loading={busy}>Replace</Button>
            {onRemove && <Button size="sm" variant="quiet" onClick={onRemove} disabled={disabled || busy}>Remove</Button>}
          </span>
        </div>
      )}
      {error && <p id={`${id}-err`} role="alert" className="field-error"><IconWarn aria-hidden />{error}</p>}
    </div>
  );
}

/** The upload area: drag a file in, or click (or Enter / Space) to choose one. */
export function Dropzone({ label, hint, accept, onFile, onFiles, multiple, disabled, disabledReason, icon, busy, progress, className = '', error, row }: {
  label: ReactNode; hint?: ReactNode; accept: string;
  onFile: (f: File) => void; /** several at once (with `multiple`) */ onFiles?: (fs: File[]) => void; multiple?: boolean;
  disabled?: boolean; /** inert, and says why in the hint's place */ disabledReason?: string;
  icon?: ReactNode; busy?: boolean; /** 0–1 while uploading: the bar replaces the hint */ progress?: number | null;
  className?: string; error?: ReactNode; /** one 56 px row instead of the 120 px area */ row?: boolean;
}) {
  const [over, setOver] = useState(false);
  const id = useId();
  const off = Boolean(disabled || disabledReason);
  const take = (list: FileList | null | undefined) => {
    const files = Array.from(list ?? []);
    if (!files.length || off) return;
    if (multiple && onFiles) onFiles(files); else onFile(files[0]);
  };
  const uploading = typeof progress === 'number';
  return (
    <div className={cls('dropzone-wrap', className)}>
      <label htmlFor={id} className={cls('dropzone', row && 'dropzone-row')} data-over={over || undefined} data-error={error ? 'true' : undefined} data-busy={busy || uploading || undefined}
        aria-disabled={off || undefined}
        onDragOver={(e) => { if (off) return; e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}>
        {busy && !uploading ? <Spinner /> : icon ?? <IconUpload aria-hidden />}
        <span className="dropzone-words">
          <span className="dropzone-title">{label}</span>
          {uploading ? <Progress value={progress} label="Uploading" count={`${Math.round((progress as number) * 100)}%`} phase="Uploading…" className="dropzone-progress" />
            : (disabledReason ?? hint) && <span className="dropzone-hint">{disabledReason ?? hint}</span>}
        </span>
        <input id={id} type="file" accept={accept} multiple={multiple} disabled={off || busy || uploading} className="dropzone-input" aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
      </label>
      {error && <p id={`${id}-err`} role="alert" className="field-error"><IconWarn aria-hidden />{error}</p>}
    </div>
  );
}

/* ---- footer and save state ---------------------------------------------------------------------------------- */

/** The form's action row. On a phone it is a sticky 56 px footer on the page tone with a top line, and while it is
 *  there it adds 56 px to --bottom-bars so a focused field scrolls clear of it. `start` sits at the start. */
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
/** Autosave in words: "Saved", "Saving…" or "Not saved — retrying", from the real write queue. */
export function SaveWord({ state, className = '' }: { state: SaveState; className?: string }) {
  return (
    <span role="status" aria-live="polite" className={className}>
      <StateWord tone={state === 'saved' ? 'done' : state === 'saving' ? 'running' : 'waiting'}>{state === 'saved' ? 'Saved' : state === 'saving' ? 'Saving…' : 'Not saved — retrying'}</StateWord>
    </span>
  );
}
