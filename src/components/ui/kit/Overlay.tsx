'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { T } from '@/lib/copy';
import { IconChevronDown, IconClose, IconMore, IconSearch } from '../icons';
import { Button, type ButtonSize, type ButtonVariant, variantClass } from './Button';
import { cls } from './cls';
import { focusables, rovingIndex, rovingStep, trapTab, useFocusReturn } from './focus';

/** OVERLAYS (docs/DESIGN-SYSTEM-V4.md §5.17, §4.6, §4.8) — Dialog, ConfirmDialog (+ useConfirm / useAsk, which
 *  replace window.confirm and window.prompt), Drawer, Popover, MenuButton, and the CommandPalette and ShortcutSheet
 *  shells F4 fills. Every overlay: --raised-2 or --surface with --shadow-3 and a 1 px --line-strong edge inside the
 *  shadow, never a blur; Esc closes the innermost one; focus goes back to what opened it. */

/* ---- Dialog and Drawer -------------------------------------------------------------------------------------- */

const EXIT_MS = 220; // the longest exit (--t-exit-slow 200 ms) and a frame

/** Keeps an overlay's content mounted through its exit transition. */
function usePresence(open: boolean): boolean {
  const [present, setPresent] = useState(open);
  useEffect(() => {
    if (open) { setPresent(true); return; }
    const t = setTimeout(() => setPresent(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);
  return open || present;
}

/** The first field takes focus; else an element marked `data-autofocus`; else the first action of the footer. */
function focusInitial(root: HTMLElement) {
  const pick = root.querySelector<HTMLElement>('[data-autofocus]')
    ?? root.querySelector<HTMLElement>('.dialog-body :is(input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]))')
    ?? root.querySelector<HTMLElement>('.dialog-foot :is(button:not([disabled]), a[href])')
    ?? focusables(root)[0];
  pick?.focus();
}

export interface DialogProps {
  open: boolean;
  /** Esc, the close button and Cancel call it; the caller sets `open` to false. */
  onClose: () => void;
  title: ReactNode;
  /** one line under the title, linked as the dialog's description */
  description?: ReactNode;
  /** 400 / 560 / 880 px; below 640 px every dialog is a bottom sheet */
  size?: 'sm' | 'md' | 'lg';
  children?: ReactNode;
  /** end-aligned: Cancel (quiet) first, then the confirm; sticky at the foot of a sheet */
  footer?: ReactNode;
  /** while true, Esc and the close button do nothing (a decision is being saved) */
  busy?: boolean;
  role?: 'dialog' | 'alertdialog';
  className?: string;
  /** the element to focus when the opener has gone by the time the dialog closes */
  returnFocus?: () => HTMLElement | null | undefined;
}

function Shell({ open, onClose, title, description, size = 'md', children, footer, busy, role, className = '', returnFocus, kind }: DialogProps & { kind: 'dialog' | 'drawer' }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const present = usePresence(open);
  useFocusReturn(open, returnFocus);
  useEffect(() => {
    const d = ref.current;
    if (!d || !present) return;
    if (open && !d.open) { d.showModal(); focusInitial(d); }
    else if (!open && d.open) d.close();
  }, [open, present]);
  if (!present) return null;
  return (
    <dialog
      ref={ref}
      role={role === 'alertdialog' ? 'alertdialog' : undefined}
      className={cls(kind === 'drawer' ? 'drawer-v4' : 'dlg sheet dialog', kind === 'dialog' && `dialog-${size}`, kind === 'drawer' && `drawer-${size === 'lg' ? 'lg' : 'md'}`, className)}
      aria-labelledby={`${id}-t`}
      aria-describedby={description ? `${id}-d` : undefined}
      aria-busy={busy || undefined}
      onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}
      onKeyDown={(e) => trapTab(e, e.currentTarget)}
    >
      <div className="dialog-frame">
        <header className="dialog-head">
          <h2 id={`${id}-t`} className="h2 min-w-0 flex-1" dir="auto">{title}</h2>
          <Button variant="quiet" size="sm" aria-label={T('btn.close')} icon={<IconClose />} onClick={onClose} disabled={busy} />
        </header>
        <div className="dialog-body">
          {description && <p id={`${id}-d`} className="dialog-desc">{description}</p>}
          {children}
        </div>
        {footer && <footer className="dialog-foot sheet-actions">{footer}</footer>}
      </div>
    </dialog>
  );
}

/** A modal: --surface, radius 16, --shadow-3 over --overlay (no blur). Header 56 (title + close); footer end-aligned.
 *  Below 640 px it is a bottom sheet (full width, top radius 16, ≤ 92dvh, sticky footer). Esc closes; Tab stays
 *  inside; the first field takes focus; focus returns to the opener. */
export function Dialog(props: DialogProps) { return <Shell {...props} kind="dialog" />; }

/** Docks to the end side (mirrored in Arabic), 480 (`md`) or 640 (`lg`) wide, full width on a phone: activity logs
 *  from a job button, the inspector at tablet width. */
export function Drawer({ size = 'md', ...props }: Omit<DialogProps, 'size'> & { size?: 'md' | 'lg' }) { return <Shell {...props} size={size} kind="drawer" />; }

/* ---- ConfirmDialog, useConfirm, useAsk ----------------------------------------------------------------------- */

export interface ConfirmOptions {
  /** names the object: "Delete “The Kite”?" */
  title: ReactNode;
  /** one sentence of consequence */
  body?: ReactNode;
  /** what is kept, said plainly */
  keep?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  /** `danger`: the confirm is the one filled --bad button in the system (and Cancel takes focus) */
  tone?: 'danger' | 'default';
}

export interface AskOptions extends Omit<ConfirmOptions, 'tone'> {
  /** the field's label ("Why is this take rejected?") */
  label: ReactNode;
  placeholder?: string;
  initial?: string;
  /** an empty answer is allowed (it resolves to '') */
  optional?: boolean;
  multiline?: boolean;
  maxLength?: number;
}

/** The confirm a page renders itself (useConfirm renders this for you). */
export function ConfirmDialog({ open, onConfirm, onCancel, title, body, keep, confirmLabel, cancelLabel, tone = 'danger', busy, children, confirmDisabled }: ConfirmOptions & { open: boolean; onConfirm: () => void; onCancel: () => void; busy?: boolean; children?: ReactNode; confirmDisabled?: boolean }) {
  return (
    <Dialog open={open} onClose={onCancel} title={title} size="sm" busy={busy} role="alertdialog"
      footer={<>
        <Button variant="quiet" onClick={onCancel} disabled={busy} data-autofocus={tone === 'danger' && !children ? '' : undefined}>{cancelLabel ?? T('btn.cancel')}</Button>
        <Button variant={tone === 'danger' ? 'destructive' : 'primary'} onClick={onConfirm} loading={busy} disabled={confirmDisabled}>{confirmLabel ?? (tone === 'danger' ? T('btn.delete') : T('kit.confirm'))}</Button>
      </>}>
      {body && <p className="text-body" dir="auto">{body}</p>}
      {keep && <p className="mt-2 text-muted" dir="auto">{keep}</p>}
      {children && <div className={body || keep ? 'mt-4' : ''}>{children}</div>}
    </Dialog>
  );
}

type Pending =
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'ask'; opts: AskOptions; resolve: (v: string | null) => void };

interface OverlayApi { confirm: (o: ConfirmOptions) => Promise<boolean>; ask: (o: AskOptions) => Promise<string | null> }
const OverlayCtx = createContext<OverlayApi | null>(null);

/** Hosts the dialogs useConfirm and useAsk open. Mounted once by ToastProvider (src/components/ui/toast.tsx), so
 *  every page under the root layout has it. */
export function OverlayHost({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Pending[]>([]);
  const [text, setText] = useState('');
  const current = queue[0];
  const head = useRef<Pending | undefined>(undefined);
  head.current = current;
  const settle = useCallback((v: boolean | string | null) => {
    const h = head.current;
    if (!h) return;
    head.current = undefined;
    (h.resolve as (x: typeof v) => void)(v);
    setQueue((q) => (q[0] === h ? q.slice(1) : q.filter((x) => x !== h)));
  }, []);
  const api = useMemo<OverlayApi>(() => ({
    confirm: (opts) => new Promise<boolean>((resolve) => setQueue((q) => [...q, { kind: 'confirm', opts, resolve }])),
    ask: (opts) => new Promise<string | null>((resolve) => setQueue((q) => [...q, { kind: 'ask', opts, resolve }])),
  }), []);
  const fieldId = useId();
  useEffect(() => { if (current?.kind === 'ask') setText(current.opts.initial ?? ''); }, [current]);
  const ask = current?.kind === 'ask' ? current.opts : null;
  const answer = text.trim();
  return (
    <OverlayCtx.Provider value={api}>
      {children}
      <ConfirmDialog
        open={Boolean(current)}
        title={current?.opts.title ?? ''}
        body={current?.opts.body}
        keep={current?.opts.keep}
        confirmLabel={current?.opts.confirmLabel}
        cancelLabel={current?.opts.cancelLabel}
        tone={current?.kind === 'confirm' ? current.opts.tone ?? 'danger' : 'default'}
        confirmDisabled={Boolean(ask && !ask.optional && !answer)}
        onCancel={() => settle(current?.kind === 'ask' ? null : false)}
        onConfirm={() => settle(current?.kind === 'ask' ? answer : true)}
      >
        {ask && (
          <form onSubmit={(e) => { e.preventDefault(); if (ask.optional || answer) settle(answer); }}>
            <span className="field-label-row"><label htmlFor={fieldId} className="label">{ask.label}</label>{ask.optional && <span className="field-optional">{T('kit.optional')}</span>}</span>
            {ask.multiline
              ? <textarea id={fieldId} className="textarea" dir="auto" value={text} maxLength={ask.maxLength} placeholder={ask.placeholder} onChange={(e) => setText(e.target.value)} />
              : <input id={fieldId} className="input" dir="auto" value={text} maxLength={ask.maxLength} placeholder={ask.placeholder} onChange={(e) => setText(e.target.value)} />}
          </form>
        )}
      </ConfirmDialog>
    </OverlayCtx.Provider>
  );
}

/** `const confirm = useConfirm(); if (await confirm({ title: T.f(…, { name }), body, keep })) remove();` — the
 *  promise-based replacement for window.confirm (§1.5, §5.17). Resolves true on the confirm, false on Cancel or Esc. */
export function useConfirm(): (o: ConfirmOptions) => Promise<boolean> {
  const api = useContext(OverlayCtx);
  if (!api) throw new Error('useConfirm needs the OverlayHost (ToastProvider mounts it)');
  return api.confirm;
}

/** `const ask = useAsk(); const why = await ask({ title, label })` — the replacement for window.prompt where an
 *  inline note (kit InlineNote) cannot sit next to the action. Resolves the trimmed answer, or null on Cancel. */
export function useAsk(): (o: AskOptions) => Promise<string | null> {
  const api = useContext(OverlayCtx);
  if (!api) throw new Error('useAsk needs the OverlayHost (ToastProvider mounts it)');
  return api.ask;
}

/* ---- Popover ------------------------------------------------------------------------------------------------- */

/** Closes on Esc (focus back to the trigger), on a click outside and when focus leaves (Tab out). */
function useDismiss(open: boolean, close: (refocus: boolean) => void, wrap: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) close(false); };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open, close, wrap]);
}

/** A non-modal panel under its button (--raised-2, radius 8, --shadow-3, padding 4–16): one Filter popover holds
 *  every facet of a catalogue. Focus moves into it; Esc closes and returns focus to the button. */
export function Popover({ label, icon, variant = 'secondary', size, title, align = 'start', children, className = '', panelClassName = '', count }: {
  /** the button's words ("Filter") */ label: ReactNode; icon?: ReactNode; variant?: ButtonVariant; size?: ButtonSize;
  /** the panel's accessible name (default: the label) */ title?: string; align?: 'start' | 'end';
  /** a number shown after the label ("Filter 2"), and in its name */ count?: number;
  children: ReactNode | ((close: () => void) => ReactNode); className?: string; panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback((refocus: boolean) => { setOpen(false); if (refocus) btn.current?.focus(); }, []);
  useDismiss(open, close, wrap);
  useEffect(() => { if (open && panel.current) (focusables(panel.current)[0] ?? panel.current).focus(); }, [open]);
  return (
    <div ref={wrap} className={cls('popover-wrap', className)}
      onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); close(true); } }}
      onBlur={(e) => { if (open && e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget)) close(false); }}>
      <button ref={btn} type="button" className={cls('btn', variantClass(variant), size && `btn-${size}`)} aria-expanded={open} aria-controls={`${id}-p`} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        {icon}{label}{count !== undefined && count > 0 && <span className="btn-count num">({count})</span>}
      </button>
      <div ref={panel} id={`${id}-p`} role="dialog" aria-label={title ?? (typeof label === 'string' ? label : undefined)} tabIndex={-1} className={cls('popover', panelClassName)} data-align={align} hidden={!open}>
        {open && (typeof children === 'function' ? children(() => close(true)) : children)}
      </div>
    </div>
  );
}

/* ---- Menu ---------------------------------------------------------------------------------------------------- */

/** One action in a menu: 36 px (compact 32), 14/20, an optional 16 px icon, and an optional 12/16 faint line that
 *  says what it does ("Let the studio propose — you review it before anything is made"). `tone="danger"` for what
 *  removes. Works inside MenuButton (v4) and the v3 Menu. */
export function MenuItem({ children, icon, tone, description, className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; tone?: 'danger'; description?: ReactNode }) {
  return (
    <button type="button" role="menuitem" className={cls('menu-item', description != null && 'menu-item-2', className)} data-tone={tone} {...rest}>
      {icon}
      {description != null ? <span className="menu-item-text"><span>{children}</span><span className="menu-item-desc">{description}</span></span> : children}
    </button>
  );
}
export function MenuLink({ href, children, icon, description }: { href: string; children: ReactNode; icon?: ReactNode; description?: ReactNode }) {
  return (
    <Link href={href} role="menuitem" className={cls('menu-item', description != null && 'menu-item-2')}>
      {icon}
      {description != null ? <span className="menu-item-text"><span>{children}</span><span className="menu-item-desc">{description}</span></span> : children}
    </Link>
  );
}
export function MenuSeparator() { return <div role="separator" className="menu-sep" />; }

const items = (menu: HTMLElement | null) => (menu ? Array.from(menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')) : []);

/** A button that opens a menu (§5.17): ↓/↑/Home/End move through the items (the first one takes focus when it
 *  opens; ↑ on the button opens at the last), a letter jumps to the next item that starts with it, Enter or Space
 *  activates, Esc closes and returns focus to the button, Tab closes and moves on. `iconOnly` shows the … glyph
 *  with `label` as its name. */
export function MenuButton({ label, display, icon, iconOnly, caret, variant = 'secondary', size, align = 'end', children, className = '', menuClassName = '' }: {
  label: string; /** what the button shows, when it is not just `label` (its text is still the name) */ display?: ReactNode; icon?: ReactNode; iconOnly?: boolean; /** a ⌄ after the label (a choice such as Sort) */ caret?: boolean; variant?: ButtonVariant; size?: ButtonSize; align?: 'start' | 'end'; children: ReactNode; className?: string; menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const start = useRef<'first' | 'last'>('first');
  const id = useId();
  const close = useCallback((refocus: boolean) => { setOpen(false); if (refocus) btn.current?.focus(); }, []);
  useDismiss(open, close, wrap);
  useEffect(() => {
    if (!open) return;
    const list = items(menu.current);
    for (const el of list) el.tabIndex = -1;
    const enabled = list.filter((el) => !(el as HTMLButtonElement).disabled);
    (start.current === 'last' ? enabled[enabled.length - 1] : enabled[0])?.focus();
  }, [open]);
  const openAt = (where: 'first' | 'last') => { start.current = where; setOpen(true); };
  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const list = items(menu.current);
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
    if (e.key === 'Tab') { setOpen(false); return; }
    const step = rovingStep(e.key, { orientation: 'vertical' });
    if (step) {
      e.preventDefault();
      const next = rovingIndex(step, i, list.map((el) => (el as HTMLButtonElement).disabled === true));
      list[next]?.focus();
      return;
    }
    if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const ch = e.key.toLocaleLowerCase();
      for (let k = 1; k <= list.length; k++) {
        const el = list[(i + k) % list.length];
        if (!(el as HTMLButtonElement).disabled && (el.textContent ?? '').trim().toLocaleLowerCase().startsWith(ch)) { el.focus(); break; }
      }
    }
  };
  return (
    <div ref={wrap} className={cls('menu-wrap', className)}>
      <button ref={btn} type="button" id={`${id}-b`} className={cls('btn', variantClass(variant), size && `btn-${size}`, iconOnly && 'btn-icon')}
        aria-haspopup="menu" aria-expanded={open} aria-controls={`${id}-m`} aria-label={iconOnly ? label : undefined} title={iconOnly ? label : undefined}
        onClick={() => (open ? close(false) : openAt('first'))}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); openAt('first'); } else if (e.key === 'ArrowUp') { e.preventDefault(); openAt('last'); } }}>
        {iconOnly ? (icon ?? <IconMore aria-hidden />) : <>{icon}{display ?? label}{caret && <IconChevronDown aria-hidden className="btn-caret" />}</>}
      </button>
      <div ref={menu} id={`${id}-m`} role="menu" aria-labelledby={`${id}-b`} className={cls('menu menu-v4', menuClassName)} data-align={align} hidden={!open}
        onKeyDown={onMenuKey}
        onClick={(e) => { const it = (e.target as HTMLElement).closest('[role^="menuitem"]'); if (it && !(it as HTMLButtonElement).disabled) close(true); }}>
        {children}
      </div>
    </div>
  );
}

/* ---- CommandPalette and ShortcutSheet (shells; F4 supplies the entries) ------------------------------------- */

export interface PaletteEntry {
  id: string;
  /** a group id from `groups` ("go", "create", "decide", "settings", "recent") */
  group: string;
  /** kind-first: "Show · The Kite", "Approve · Story of E4" */
  label: ReactNode;
  /** what the query matches, in both languages ("The Kite الطائرة الورقية") */
  text: string;
  hint?: ReactNode;
  icon?: ReactNode;
  onSelect: () => void;
}

const norm = (s: string) => s.toLocaleLowerCase().normalize('NFKD').replace(/[ً-ٰٟ̀-ͯ]/g, '');
/** The entries a query keeps (every word of the query in the entry's text; Arabic diacritics and Latin accents
 *  ignored). An empty query keeps everything. */
export function matchEntries<E extends { text: string }>(entries: readonly E[], query: string): E[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [...entries];
  return entries.filter((e) => { const t = norm(e.text); return words.every((w) => t.includes(w)); });
}

/** Ctrl/⌘K (§5.17, §7.6): a 640 px dialog at 15vh with a 48 px search field; results grouped (Go to · Create ·
 *  Decide …) in the order of `groups`; ↑/↓ move, Enter opens, Esc closes. With an empty query it shows the `recent`
 *  group when there is one. The field owns focus; the active result is announced through aria-activedescendant. */
export function CommandPalette({ open, onClose, entries, groups, placeholder, filter = matchEntries }: {
  open: boolean; onClose: () => void; entries: readonly PaletteEntry[]; groups: ReadonlyArray<{ id: string; label: ReactNode }>; placeholder?: string;
  filter?: (entries: readonly PaletteEntry[], query: string) => PaletteEntry[];
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const id = useId();
  const present = usePresence(open);
  const ref = useRef<HTMLDialogElement>(null);
  useFocusReturn(open);
  useEffect(() => { if (open) { setQ(''); setActive(0); } }, [open]);
  useEffect(() => {
    const d = ref.current;
    if (!d || !present) return;
    if (open && !d.open) { d.showModal(); d.querySelector<HTMLInputElement>('input')?.focus(); }
    else if (!open && d.open) d.close();
  }, [open, present]);
  const shown = useMemo(() => {
    const list = q.trim() ? filter(entries.filter((e) => e.group !== 'recent'), q) : entries.filter((e) => e.group === 'recent').length ? entries.filter((e) => e.group === 'recent') : [...entries];
    const order = groups.map((g) => g.id);
    return [...list].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  }, [entries, q, groups, filter]);
  const pick = (e: PaletteEntry | undefined) => { if (!e) return; onClose(); e.onSelect(); };
  if (!present) return null;
  return (
    <dialog ref={ref} className="dlg palette" aria-label={T('kit.palette.label')} onCancel={(e) => { e.preventDefault(); onClose(); }} onKeyDown={(e) => trapTab(e, e.currentTarget)}>
      <div className="palette-field">
        <IconSearch aria-hidden />
        <input
          role="combobox" aria-expanded="true" aria-controls={`${id}-l`} aria-autocomplete="list" aria-activedescendant={shown[active] ? `${id}-o-${shown[active].id}` : undefined}
          aria-label={T('kit.palette.label')} placeholder={placeholder ?? T('kit.palette.placeholder')} value={q} dir="auto"
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            else if (e.key === 'Enter') { e.preventDefault(); pick(shown[active]); }
          }}
        />
      </div>
      <div id={`${id}-l`} role="listbox" aria-label={T('kit.palette.results')} className="palette-list">
        {shown.length === 0 && <p className="palette-empty">{T('kit.palette.empty')}</p>}
        {groups.map((g) => {
          const rows = shown.filter((e) => e.group === g.id);
          if (!rows.length) return null;
          return (
            <div key={g.id} role="group" aria-labelledby={`${id}-g-${g.id}`}>
              <p id={`${id}-g-${g.id}`} className="palette-group">{g.label}</p>
              {rows.map((e) => {
                const i = shown.indexOf(e);
                return (
                  <div key={e.id} id={`${id}-o-${e.id}`} role="option" aria-selected={i === active} className="palette-option" onPointerMove={() => setActive(i)} onClick={() => pick(e)}>
                    {e.icon}<span className="min-w-0 flex-1 truncate" dir="auto">{e.label}</span>{e.hint && <span className="caption">{e.hint}</span>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </dialog>
  );
}

export interface ShortcutScope { id: string; title: ReactNode; rows: ReadonlyArray<{ keys: readonly string[]; label: ReactNode }> }
/** `?` (§5.17, §7.5): the shortcuts by scope (Global · Player · Storyboard · Timeline) with the single-key
 *  preference. Keys are set LTR in `kbd`. */
export function ShortcutSheet({ open, onClose, scopes, singleKey }: { open: boolean; onClose: () => void; scopes: readonly ShortcutScope[]; singleKey?: { on: boolean; onChange: (v: boolean) => void } }) {
  const id = useId();
  return (
    <Dialog open={open} onClose={onClose} title={T('kit.shortcuts.title')} size="md">
      {singleKey && (
        <label className="mb-5 flex items-center justify-between gap-4" htmlFor={`${id}-k`}>
          <span><span className="font-medium text-fg">{T('kit.shortcuts.singleKey')}</span><span className="block text-sm text-muted">{T('kit.shortcuts.singleKeyHint')}</span></span>
          <input id={`${id}-k`} type="checkbox" role="switch" className="check" checked={singleKey.on} onChange={(e) => singleKey.onChange(e.target.checked)} />
        </label>
      )}
      {scopes.map((s) => (
        <section key={s.id} className="shortcut-scope" aria-labelledby={`${id}-${s.id}`}>
          <h3 id={`${id}-${s.id}`} className="h3">{s.title}</h3>
          <dl>
            {s.rows.map((r, i) => (
              <div key={i}><dt>{r.label}</dt><dd dir="ltr">{r.keys.map((k, j) => <kbd key={j} className="kbd">{k}</kbd>)}</dd></div>
            ))}
          </dl>
        </section>
      ))}
    </Dialog>
  );
}

/* ---- v3 menu (kept until Q1: pages migrate to MenuButton) ---------------------------------------------------- */

/** An icon-only overflow menu on a native <details> (v3). New code uses MenuButton. */
export function Menu({ label, children, className = '', align = 'end' }: { label?: string; children: ReactNode; className?: string; align?: 'start' | 'end' }) {
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
