'use client';

import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { IconClose } from '@/components/ui/icons';

/** THE SHELL'S DIALOG — the one place the shell's overlays (the command palette, the shortcut sheet, the phone's menu
 *  sheet) meet the dialog primitive. Built on the native <dialog> with showModal(): the browser traps focus inside,
 *  makes the page behind inert, closes on Esc, and puts focus back on the control that opened it (kept here too, for
 *  the browsers that do not). Drawn with the kit's one modal surface (kit.css `dialog.dlg`, VISUAL-STANDARD-V5.1 §5.17);
 *  shell.css only places the palette high up and the full-screen menu. Nothing else in the shell touches <dialog>. */

export interface ShellDialogProps {
  open: boolean;
  onClose: () => void;
  /** a visible title (the header row with a close button), or only an accessible name with `label` */
  title?: ReactNode;
  label?: string;
  /** where it sits: centred (the shortcut sheet), high up at 15vh (the palette), the whole screen, or a bottom sheet
   *  (the phone's Productions and More) */
  placement?: 'center' | 'top' | 'full' | 'sheet';
  /** px; ignored for `full` */
  width?: number;
  /** what takes focus when it opens (default: the first focusable element) */
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
  /** a footer row under the body (hints, an end-aligned action) */
  footer?: ReactNode;
  children: ReactNode;
  id?: string;
}

export function ShellDialog({ open, onClose, title, label, placement = 'center', width = 560, initialFocus, className = '', footer, children, id }: ShellDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const headingId = useId();
  const close = useRef(onClose); close.current = onClose;

  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      d.showModal();
      if (initialFocus?.current) initialFocus.current.focus();
    } else if (!open && d.open) d.close();
  }, [open, initialFocus]);

  // Esc and form[method=dialog] close natively; report it, then give focus back to the opener
  useEffect(() => {
    const d = ref.current; if (!d) return;
    const onClosed = () => {
      close.current();
      const o = opener.current; opener.current = null;
      if (o && o.isConnected && (document.activeElement === document.body || document.activeElement === null)) o.focus();
    };
    d.addEventListener('close', onClosed);
    return () => d.removeEventListener('close', onClosed);
  }, []);

  // a click on the dimmed backdrop (the dialog box itself, outside its panel) closes it
  const onPointerDown = (e: React.PointerEvent<HTMLDialogElement>) => { if (e.target === ref.current) ref.current?.close(); };

  // the kit's modal surface (kit.css `dialog.dlg`): a centred dialog, the palette high up, or a sheet; the full-screen
  // placement keeps the page ground
  const kind = placement === 'sheet' ? 'sheet' : placement === 'full' ? 'shell-dialog-full' : 'dialog';
  return (
    <dialog ref={ref} id={id} className={`dlg ${kind} shell-dialog ${className}`} data-placement={placement} data-bare={title ? undefined : ''}
      style={placement === 'full' || placement === 'sheet' ? undefined : ({ '--dlg-w': `${width}px` } as React.CSSProperties)}
      aria-labelledby={title ? headingId : undefined} aria-label={title ? undefined : label} onPointerDown={onPointerDown}>
      <div className="dialog-frame">
        <span className="sheet-handle" aria-hidden />
        {title && (
          <header className="dialog-head">
            <h2 id={headingId} className="t-title dialog-title">{title}</h2>
            <button type="button" className="btn btn-quiet btn-icon btn-sm dialog-close" aria-label="Close" onClick={() => ref.current?.close()}><IconClose aria-hidden /></button>
          </header>
        )}
        <div className="dialog-body">{open && children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </dialog>
  );
}
