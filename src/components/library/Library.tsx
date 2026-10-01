'use client';

import type { ReactNode } from 'react';
import { STYLES, type Style } from '@/domain/vocabulary';
import { useT } from '@/components/ui/locale';
import { Input, Segmented, Select } from '@/components/ui/kit';
import { IconGrid, IconList, IconSearch } from '@/components/ui/icons';

/** THE LIBRARY FRAME — a compact heading with the count and the one action, then a row with search, a filter or
 *  two, and the grid/list switch. Each library puts its own object inside. */

export type View = 'grid' | 'list';

export function LibraryHeader({ title, count, action, description }: { title: string; count?: number; action?: ReactNode; description?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="h1 flex items-baseline gap-3">{title}{count !== undefined && <span className="num font-sans text-base font-normal text-accent">{count}</span>}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function LibraryBar({ q, onQ, style, onStyle, view, onView, extra, sort, onSort, placeholder }: { q: string; onQ: (v: string) => void; style?: Style | ''; onStyle?: (v: Style | '') => void; view?: View; onView?: (v: View) => void; extra?: ReactNode; sort?: 'recent' | 'title'; onSort?: (v: 'recent' | 'title') => void; placeholder?: string }) {
  const T = useT();
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <label className="relative min-w-0 flex-1 basis-64">
        <IconSearch aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <Input type="search" value={q} onChange={(e) => onQ(e.target.value)} placeholder={placeholder ?? T('lib.search')} aria-label={T('label.search')} className="ps-9" />
      </label>
      {onStyle && <Select aria-label={T('lib.filterStyle')} value={style ?? ''} onChange={(e) => onStyle(e.target.value as Style | '')} placeholder={`${T('lib.filterStyle')}: ${T('label.all')}`} options={STYLES.map((s) => ({ value: s, label: T.dyn(`style.${s}`) }))} className="w-auto" />}
      {extra}
      {onSort && <Select aria-label={T('lib.sort')} value={sort} onChange={(e) => onSort(e.target.value as 'recent' | 'title')} options={[{ value: 'recent', label: T('lib.sortRecent') }, { value: 'title', label: T('lib.sortTitle') }]} className="w-auto" />}
      {onView && view && <Segmented label={T('view.grid')} value={view} onChange={onView} options={[{ value: 'grid', label: <IconGrid className="size-4" aria-label={T('view.grid')} /> }, { value: 'list', label: <IconList className="size-4" aria-label={T('view.list')} /> }]} />}
    </div>
  );
}

export function NoMatches({ onClear }: { onClear: () => void }) {
  const T = useT();
  return <p className="rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center text-sm text-muted">{T('lib.noMatches')} <button type="button" className="ms-1 font-medium text-fg underline-offset-2 hover:underline" onClick={onClear}>{T('lib.clearSearch')}</button></p>;
}

/** The library remembers its grid/list choice per section in this browser. */
export function useView(key: string, initial: View = 'grid'): [View, (v: View) => void] {
  const read = (): View => { try { return (localStorage.getItem(`vewbox.view.${key}`) as View) || initial; } catch { return initial; } };
  // lazy read after mount avoids a hydration mismatch
  const [view, setView] = useStateAfterMount<View>(initial, read);
  return [view, (v) => { setView(v); try { localStorage.setItem(`vewbox.view.${key}`, v); } catch { /* fine */ } }];
}

import { useEffect, useState } from 'react';
function useStateAfterMount<T>(initial: T, read: () => T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(initial);
  useEffect(() => { setV(read()); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return [v, setV];
}
