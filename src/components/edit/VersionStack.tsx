'use client';

import { useState } from 'react';
import { T } from '@/lib/copy';
import { cls } from '@/components/ui/kit';
import { IconCompare } from '@/components/ui/icons';

/** THE VERSION STACK (docs/DESIGN-SYSTEM-V4.md §5.20) — take, image, voice and cut versions as 28 px chips "v1 … v5".
 *  The current one has a 2 px ivory outline. Picking a chip asks for that version (`onPick`); *Compare* turns the chips
 *  into checkboxes, and picking two opens CompareAB (`onCompare`). Arrow keys move along the chips. */

export interface Version { id: string; n: number; note?: string }

export function VersionStack({ versions, current, onPick, onCompare, className }: { versions: Version[]; current?: string; onPick?: (id: string) => void; onCompare?: (a: string, b: string) => void; className?: string }) {
  const [comparing, setComparing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) => {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id].slice(-2);
    setPicked(next);
    if (next.length === 2) { onCompare?.(next[0], next[1]); setComparing(false); setPicked([]); }
  };
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const xs = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('.vchip'));
    const i = xs.indexOf(document.activeElement as HTMLButtonElement); if (i < 0) return;
    const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? xs.length - 1 : null;
    if (n === null) return;
    e.preventDefault(); xs[(n + xs.length) % xs.length]?.focus();
  };
  return (
    <div className={cls('vstack', className)}>
      <div className="vstack-chips" role={comparing ? 'group' : 'radiogroup'} aria-label={T('media.versions.label')} onKeyDown={onKey}>
        {versions.map((v) => {
          const name = `${T.f('media.versions.version', { n: v.n })}${v.id === current ? ` (${T('media.versions.current')})` : ''}${v.note ? ` · ${v.note}` : ''}`;
          return comparing
            ? <button key={v.id} type="button" className="vchip num" role="checkbox" aria-checked={picked.includes(v.id)} aria-label={name} data-current={v.id === current || undefined} onClick={() => toggle(v.id)}>v{v.n}</button>
            : <button key={v.id} type="button" className="vchip num" role="radio" aria-checked={v.id === current} tabIndex={v.id === current || (!current && v === versions[0]) ? 0 : -1} aria-label={name} data-current={v.id === current || undefined} onClick={() => onPick?.(v.id)}>v{v.n}</button>;
        })}
      </div>
      {onCompare && versions.length > 1 && (comparing
        ? <><span className="caption" role="status">{T('media.versions.pickTwo')}</span><button type="button" className="ebtn ebtn-quiet" onClick={() => { setComparing(false); setPicked([]); }}>{T('media.versions.cancel')}</button></>
        : <button type="button" className="ebtn" onClick={() => setComparing(true)}><IconCompare aria-hidden />{T('media.versions.compare')}</button>)}
    </div>
  );
}
