'use client';

import type { ReactNode } from 'react';
import { T } from '@/lib/copy';
import { cls } from '@/components/ui/kit';

/** THE INSPECTOR (docs/DESIGN-SYSTEM-V4.md §5.20) — contextual: its header names the selection (kind and name), and its
 *  sections follow the selection (shot, take, line, character, section). Advanced material sits behind *Details*. With
 *  several items selected it says how many and shows the shared fields, where a value that differs reads "Mixed".
 *  With nothing selected, one sentence says what goes here. */

export const MIXED = Symbol('mixed');
/** One value if every item agrees, else MIXED. */
export function shared<T>(xs: T[]): T | typeof MIXED | undefined {
  if (xs.length === 0) return undefined;
  return xs.every((x) => Object.is(x, xs[0])) ? xs[0] : MIXED;
}
/** The placeholder a field shows for a mixed value. */
export function useMixedLabel() { return T('media.inspector.mixed'); }

export function Inspector({ kind, name, nameLang, count, sections = [], details, empty, className }: { kind?: ReactNode; name?: ReactNode; nameLang?: string; count?: number; sections?: Array<{ id: string; title: ReactNode; content: ReactNode }>; details?: ReactNode; empty?: ReactNode; className?: string }) {
  const none = !name && !count;
  return (
    <div className={cls('insp', className)}>
      {none ? <p className="insp-empty">{empty ?? T('media.inspector.empty')}</p> : (
        <>
          <header className="insp-head">
            {count && count > 1 ? <p className="h3 num">{T.f('media.inspector.count', { n: count })}</p> : <>
              {kind && <p className="caption insp-kind">{kind}</p>}
              <p className="h3 insp-name" dir="auto" lang={nameLang}>{name}</p>
            </>}
          </header>
          {sections.map((s) => (
            <div key={s.id} className="insp-sec">
              <h3 className="insp-sec-title">{s.title}</h3>
              {s.content}
            </div>
          ))}
          {details && <details className="details insp-details"><summary>{T('media.inspector.details')}</summary><div className="insp-details-body">{details}</div></details>}
        </>
      )}
    </div>
  );
}
