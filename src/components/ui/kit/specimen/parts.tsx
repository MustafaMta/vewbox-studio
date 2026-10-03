'use client';

import type { ReactNode } from 'react';
import { cls } from '../cls';

/** Layout helpers of the /kit specimen page (development only). Nothing here is part of the kit's API. */

export function SpecSection({ id, title, lead, children }: { id: string; title: ReactNode; lead?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="kit-spec-section">
      <h2 id={`${id}-h`} className="t-section">{title}</h2>
      {lead && <p className="t-body kit-spec-lead">{lead}</p>}
      <div className="kit-spec-body">{children}</div>
    </section>
  );
}

/** A labelled row of specimens. `stack`: the label above and the specimen at the column's full width (shelves). */
export function SpecRow({ label, children, className = '', stack }: { label: ReactNode; children: ReactNode; className?: string; stack?: boolean }) {
  return (
    <div className={cls('kit-spec-row', className)} data-stack={stack || undefined}>
      <h3 className="kit-spec-label">{label}</h3>
      <div className="kit-spec-items">{children}</div>
    </div>
  );
}

/** One specimen with its state named above it. */
export function Cell({ state, children, wide }: { state: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cls('kit-spec-cell', wide && 'kit-spec-cell-wide')}>
      <span className="kit-spec-state">{state}</span>
      <div className="kit-spec-cell-body">{children}</div>
    </div>
  );
}

/** A titled block of larger specimens (media, players, the cutting room). */
export function Block({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cls('spec-block', className)}>
      <h3 className="kit-spec-label spec-h">{title}</h3>
      {children}
    </div>
  );
}

/** A specimen with its caption under it. */
export function Figure({ label, children, className }: { label?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <figure className={cls('spec-cell', className)}>
      {children}
      {label && <figcaption className="kit-spec-state spec-cap">{label}</figcaption>}
    </figure>
  );
}

/** A slot another part fills, drawn as a plain frame at the slot's ratio and named in words. */
export function Slot({ ratio, children, className = '' }: { ratio: string; children: ReactNode; className?: string }) {
  return <div className={cls('kit-spec-slot', className)} style={{ aspectRatio: ratio.replace('/', ' / ') }}><span className="kit-spec-state">{children}</span></div>;
}

/** An overlay drawn open, for the record (inert: not part of the page's focus order or accessibility tree). */
export function Still({ children, caption }: { children: ReactNode; caption: ReactNode }) {
  return (
    <figure className="kit-spec-still">
      <div aria-hidden inert className="kit-spec-still-body">{children}</div>
      <figcaption className="kit-spec-state">{caption}</figcaption>
    </figure>
  );
}
