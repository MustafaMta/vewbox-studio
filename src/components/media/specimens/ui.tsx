'use client';

import type { ReactNode } from 'react';
import { cls, Status, type Tone } from '@/components/ui/kit';

/** Specimen scaffolding: a block (a heading and its specimens) and a labelled cell. Dev page only. */
export function Block({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cls('spec-block', className)}>
      <h3 className="h3 spec-h">{title}</h3>
      {children}
    </div>
  );
}
export function Cell({ label, children, className }: { label?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <figure className={cls('spec-cell', className)}>
      {children}
      {label && <figcaption className="caption spec-cap">{label}</figcaption>}
    </figure>
  );
}
/** A status word until the kit's StateWord lands (F2): the legacy dot-and-phrase. */
export function Word({ tone = 'neutral', live, children }: { tone?: Tone; live?: boolean; children: ReactNode }) {
  return <Status tone={tone} live={live}>{children}</Status>;
}
