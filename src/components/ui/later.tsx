'use client';

import { type ReactNode, useRef } from 'react';
import { useT } from './locale';
import { Button } from './kit';
import { IconGenerate } from './icons';

/** WHERE GENERATION WOULD HAPPEN — a button that looks like the real action and, pressed, says plainly that the
 *  backend is not connected in this prototype. It never pretends to run, progress or produce anything. */
export function LaterButton({ children, variant = 'secondary', size, icon, className = '' }: { children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost'; size?: 'sm' | 'xs'; icon?: ReactNode; className?: string }) {
  const T = useT();
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button variant={variant} size={size} icon={icon ?? <IconGenerate />} className={className} onClick={() => ref.current?.showModal()} title={T('later.short')}>{children}</Button>
      <dialog ref={ref} className="dlg w-[min(92vw,28rem)]" aria-labelledby="later-h" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <div className="p-5">
          <h2 id="later-h" className="h2">{T('later.title')}</h2>
          <p className="mt-2 text-sm text-muted">{T('later.body')}</p>
          <div className="mt-5 flex justify-end"><Button variant="primary" onClick={() => ref.current?.close()}>{T('btn.done')}</Button></div>
        </div>
      </dialog>
    </>
  );
}

/** A quiet one-line note beside sample material that a real production would generate. */
export function LaterNote({ className = '' }: { className?: string }) {
  const T = useT();
  return <p className={`text-xs text-faint ${className}`}>{T('later.short')}</p>;
}
