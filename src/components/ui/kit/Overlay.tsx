'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { IconChevronDown, IconClose, IconMore } from '../icons';
import { Button, type ButtonSize, type ButtonVariant, variantClass } from './Button';
import { cls } from './cls';
import { focusables, rovingIndex, rovingStep, trapTab, useFocusReturn } from './focus';

/** OVERLAYS (docs/design/VISUAL-STANDARD-V5.1.md §5.16, §5.17, §6.3) — the one implementation of each:
 *
 *    Dialog          440 / 560 / 880 wide, surface-1, radius 20, a 1 px line-strong edge, the modal shadow, padding 24;
 *                    the title (.t-title; 18/24 at 880), the body (.t-body text-2) 8 under it, the footer 24 under
 *                    that, end-aligned (quiet Cancel, then the confirm); a quiet 32 close button at the top end. In:
 *                    the overlay fades and the dialog fades and scales .98 → 1 over --dur-3; out in 160 ms. Focus is
 *                    trapped (the native modal makes the page inert; Tab cycles inside), Esc and a click on the overlay
 *                    close it, focus goes back to what opened it. Below 640 px it is a bottom sheet.
 *    Drawer          floats 8 px from the top, end and bottom edges; 400 (`sm`, filters) / 480 (`md`, details) / 640;
 *                    header 56, body padding 20, a sticky 64 footer; slides 24 px in over --dur-4. A sheet on phones.
 *    Sheet           a bottom sheet at every width (phone menus): full width, top radius 20, ≤ 88svh, the 36 × 4 handle.
 *    ConfirmDialog   + useConfirm / useAsk (the promise replacements for window.confirm / window.prompt), hosted by
 *                    OverlayHost (ToastProvider mounts it). The danger confirm is the one filled --bad button.
 *    Popover         a non-modal panel under its button (filters).
 *    MenuButton      the dropdown menu: surface-2, line-strong edge, overlay shadow, radius 14, padding 4, min 220;
 *                    items 36 (44 coarse), radius 10. ↓/↑ move, Home/End jump, a letter jumps to the next item that
 *                    starts with it (typeahead), Enter/Space activate, Esc closes and refocuses the button, Tab moves
 *                    on. `Menu` is the same menu behind the … icon button. */

/* ---- presence ------------------------------------------------------------------------------------------------- */

const EXIT_MS = 200; // the longest exit (the drawer's 252 ms is cut by its opacity) and a frame

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

/* ---- Dialog, Drawer, Sheet ------------------------------------------------------------------------------------ */

export interface DialogProps {
  open: boolean;
  /** Esc, the overlay, the close button and Cancel call it; the caller sets `open` to false. */
  onClose: () => void;
  title: ReactNode;
  /** one line under the title, linked as the dialog's description */
  description?: ReactNode;
  /** dialog 440 / 560 / 880; drawer 400 / 480 / 640 */
  size?: 'sm' | 'md' | 'lg';
  children?: ReactNode;
  /** end-aligned: Cancel (quiet) first, then the confirm; sticky at the foot of a sheet or drawer */
  footer?: ReactNode;
  /** while true, Esc, the overlay and the close button do nothing (a decision is being saved) */
  busy?: boolean;
  role?: 'dialog' | 'alertdialog';
  className?: string;
  /** the element to focus when the opener has gone by the time the dialog closes */
  returnFocus?: () => HTMLElement | null | undefined;
  /** no close button in the header (a confirm that must be answered) */
  hideClose?: boolean;
}

type Kind = 'dialog' | 'drawer' | 'sheet';

function ModalShell({ open, onClose, title, description, size = 'md', children, footer, busy, role, className, returnFocus, hideClose, kind }: DialogProps & { kind: Kind }) {
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
      className={cls('dlg', kind, `${kind}-${size}`, className)}
      aria-labelledby={`${id}-t`}
      aria-describedby={description ? `${id}-d` : undefined}
      aria-busy={busy || undefined}
      onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}
      onKeyDown={(e) => trapTab(e, e.currentTarget)}
      onPointerDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div className="dialog-frame">
        <span className="sheet-handle" aria-hidden />
        <header className="dialog-head">
          <h2 id={`${id}-t`} className="t-title dialog-title">{title}</h2>
          {!hideClose && <button type="button" className="btn btn-quiet btn-icon btn-sm dialog-close" aria-label="Close" onClick={onClose} disabled={busy}><IconClose aria-hidden /></button>}
        </header>
        <div className="dialog-body">
          {description && <p id={`${id}-d`} className="t-body dialog-desc">{description}</p>}
          {children}
        </div>
        {footer && <footer className="dialog-foot">{footer}</footer>}
      </div>
    </dialog>
  );
}

/** A modal dialog (§5.17). Below 640 px it is a bottom sheet. */
export function Dialog(props: DialogProps) { return <ModalShell {...props} kind="dialog" />; }

/** A drawer at the end edge (§5.17): `sm` 400 (filters), `md` 480 (details), `lg` 640. A bottom sheet on phones. */
export function Drawer(props: DialogProps) { return <ModalShell {...props} kind="drawer" />; }

/** A bottom sheet at every width (§5.17; the phone's menus). */
export function Sheet(props: Omit<DialogProps, 'size'>) { return <ModalShell {...props} kind="sheet" />; }

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
        <Button variant="quiet" onClick={onCancel} disabled={busy} data-autofocus={tone === 'danger' && !children ? '' : undefined}>{cancelLabel ?? 'Cancel'}</Button>
        <Button variant={tone === 'danger' ? 'destructive' : 'primary'} onClick={onConfirm} loading={busy} disabled={confirmDisabled}>{confirmLabel ?? (tone === 'danger' ? 'Delete' : 'Confirm')}</Button>
      </>}>
      {body && <p className="t-body confirm-body">{body}</p>}
      {keep && <p className="t-body confirm-keep">{keep}</p>}
      {children && <div className="confirm-more">{children}</div>}
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
            <span className="field-label-row"><label htmlFor={fieldId} className="label">{ask.label}</label>{ask.optional && <span className="field-optional">optional</span>}</span>
            {ask.multiline
              ? <textarea id={fieldId} className="textarea" dir="auto" value={text} maxLength={ask.maxLength} placeholder={ask.placeholder} onChange={(e) => setText(e.target.value)} />
              : <input id={fieldId} className="input" dir="auto" value={text} maxLength={ask.maxLength} placeholder={ask.placeholder} onChange={(e) => setText(e.target.value)} />}
          </form>
        )}
      </ConfirmDialog>
    </OverlayCtx.Provider>
  );
}

/** `const confirm = useConfirm(); if (await confirm({ title, body, keep })) remove();` — the promise-based replacement
 *  for window.confirm. Resolves true on the confirm, false on Cancel or Esc. */
export function useConfirm(): (o: ConfirmOptions) => Promise<boolean> {
  const api = useContext(OverlayCtx);
  if (!api) throw new Error('useConfirm needs the OverlayHost (ToastProvider mounts it)');
  return api.confirm;
}

/** `const ask = useAsk(); const why = await ask({ title, label })` — the replacement for window.prompt. Resolves the
 *  trimmed answer, or null on Cancel. */
export function useAsk(): (o: AskOptions) => Promise<string | null> {
  const api = useContext(OverlayCtx);
  if (!api) throw new Error('useAsk needs the OverlayHost (ToastProvider mounts it)');
  return api.ask;
}

/* ---- Popover ------------------------------------------------------------------------------------------------- */

/** Closes on a pointer down outside `wrap`. */
function useOutside(open: boolean, close: (refocus: boolean) => void, wrap: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) close(false); };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open, close, wrap]);
}

/** Opens upward when there is no room below (the panel is measured before paint). */
function useFlip(open: boolean, panel: React.RefObject<HTMLElement | null>) {
  const [side, setSide] = useState<'bottom' | 'top'>('bottom');
  useLayoutEffect(() => {
    if (!open) { setSide('bottom'); return; }
    const el = panel.current; if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 8 && r.top - r.height - 48 > 0) setSide('top');
  }, [open, panel]);
  return side;
}

/** A non-modal panel under its button (surface-2, radius 14, the overlay shadow): one Filter popover holds every facet
 *  of a catalogue. Focus moves into it; Esc closes and returns focus to the button. */
export function Popover({ label, icon, variant = 'secondary', size, title, align = 'start', children, className, panelClassName, count }: {
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
  useOutside(open, close, wrap);
  const side = useFlip(open, panel);
  useEffect(() => { if (open && panel.current) (focusables(panel.current)[0] ?? panel.current).focus(); }, [open]);
  return (
    <div ref={wrap} className={cls('popover-wrap', className)}
      onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); close(true); } }}
      onBlur={(e) => { if (open && e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget)) close(false); }}>
      <button ref={btn} type="button" className={cls('btn', variantClass(variant), size && `btn-${size}`)} aria-expanded={open} aria-controls={`${id}-p`} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        {icon}{label}{count !== undefined && count > 0 && <span className="btn-count">{count}</span>}
      </button>
      <div ref={panel} id={`${id}-p`} role="dialog" aria-label={title ?? (typeof label === 'string' ? label : undefined)} tabIndex={-1} className={cls('popover', panelClassName)} data-align={align} data-side={side} hidden={!open}>
        {open && (typeof children === 'function' ? children(() => close(true)) : children)}
      </div>
    </div>
  );
}

/* ---- Menu ---------------------------------------------------------------------------------------------------- */

/** One action in a menu: 36 high (44 coarse), an optional 16 px icon, and an optional 13/18 line that says what it
 *  does (the item grows to 52). `tone="danger"` for what removes. `checked` marks the chosen one of a choice menu. */
export function MenuItem({ children, icon, tone, description, checked, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; tone?: 'danger'; description?: ReactNode; checked?: boolean }) {
  return (
    <button type="button" role={checked === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={checked} className={cls('menu-item', description != null && 'menu-item-2', className)} data-tone={tone} {...rest}>
      {icon}
      {description != null ? <span className="menu-item-text"><span>{children}</span><span className="menu-item-desc">{description}</span></span> : <span className="menu-item-label">{children}</span>}
    </button>
  );
}
export function MenuLink({ href, children, icon, description }: { href: string; children: ReactNode; icon?: ReactNode; description?: ReactNode }) {
  return (
    <Link href={href} role="menuitem" className={cls('menu-item', description != null && 'menu-item-2')}>
      {icon}
      {description != null ? <span className="menu-item-text"><span>{children}</span><span className="menu-item-desc">{description}</span></span> : <span className="menu-item-label">{children}</span>}
    </Link>
  );
}
export function MenuSeparator() { return <div role="separator" className="menu-sep" />; }

const menuItems = (menu: HTMLElement | null) => (menu ? Array.from(menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')) : []);
const isOff = (el: HTMLElement) => (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true';

/** A button that opens a menu (the dropdown, §5.16). `iconOnly` shows the … glyph with `label` as its name. */
export function MenuButton({ label, display, icon, iconOnly, caret, variant = 'secondary', size, align = 'end', children, className, menuClassName }: {
  label: string; /** what the button shows, when it is not just `label` (its text is still the name) */ display?: ReactNode; icon?: ReactNode; iconOnly?: boolean; /** a ⌄ after the label (a choice such as Sort) */ caret?: boolean; variant?: ButtonVariant; size?: ButtonSize; align?: 'start' | 'end'; children: ReactNode; className?: string; menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const start = useRef<'first' | 'last'>('first');
  const typed = useRef({ text: '', at: 0 });
  const id = useId();
  const close = useCallback((refocus: boolean) => { setOpen(false); if (refocus) btn.current?.focus(); }, []);
  useOutside(open, close, wrap);
  const side = useFlip(open, menu);
  useEffect(() => {
    if (!open) return;
    const list = menuItems(menu.current);
    for (const el of list) el.tabIndex = -1;
    const enabled = list.filter((el) => !isOff(el));
    (start.current === 'last' ? enabled[enabled.length - 1] : enabled[0])?.focus();
  }, [open]);
  const openAt = (where: 'first' | 'last') => { start.current = where; setOpen(true); };
  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const list = menuItems(menu.current);
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
    if (e.key === 'Tab') { setOpen(false); return; }
    const step = rovingStep(e.key, { orientation: 'vertical' });
    if (step) {
      e.preventDefault();
      const next = rovingIndex(step, i, list.map(isOff));
      list[next]?.focus();
      return;
    }
    // typeahead: letters typed within 600 ms form one prefix; a repeated single letter cycles
    if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now();
      const t = typed.current;
      t.text = now - t.at < 600 && t.text !== e.key.toLocaleLowerCase() ? t.text + e.key.toLocaleLowerCase() : e.key.toLocaleLowerCase();
      t.at = now;
      const from = t.text.length > 1 ? i : i + 1;
      for (let k = 0; k < list.length; k++) {
        const el = list[(from + k + list.length) % list.length];
        if (!isOff(el) && (el.textContent ?? '').trim().toLocaleLowerCase().startsWith(t.text)) { el.focus(); break; }
      }
    }
  };
  return (
    <div ref={wrap} className={cls('menu-wrap', className)}>
      <button ref={btn} type="button" id={`${id}-b`} className={cls('btn', variantClass(variant), size && `btn-${size}`, iconOnly && 'btn-icon')}
        aria-haspopup="menu" aria-expanded={open} aria-controls={`${id}-m`} aria-label={iconOnly ? label : undefined}
        onClick={() => (open ? close(false) : openAt('first'))}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); openAt('first'); } else if (e.key === 'ArrowUp') { e.preventDefault(); openAt('last'); } }}>
        {iconOnly ? (icon ?? <IconMore aria-hidden />) : <>{icon}{display ?? label}{caret && <IconChevronDown aria-hidden className="btn-caret" />}</>}
      </button>
      <div ref={menu} id={`${id}-m`} role="menu" aria-labelledby={`${id}-b`} className={cls('menu', menuClassName)} data-align={align} data-side={side} hidden={!open}
        onKeyDown={onMenuKey}
        onClick={(e) => { const it = (e.target as HTMLElement).closest<HTMLElement>('[role^="menuitem"]'); if (it && !isOff(it)) close(true); }}>
        {children}
      </div>
    </div>
  );
}

/** The dropdown's other name. */
export const Dropdown = MenuButton;

/** The … overflow menu (the v3 name, kept for the pages that use it): the same MenuButton behind a quiet icon button. */
export function Menu({ label, children, className, align = 'end' }: { label?: string; children: ReactNode; className?: string; align?: 'start' | 'end' }) {
  return <MenuButton label={label ?? 'More'} iconOnly variant="quiet" size="sm" align={align} className={className}>{children}</MenuButton>;
}
