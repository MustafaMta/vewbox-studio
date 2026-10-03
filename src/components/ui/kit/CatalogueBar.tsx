'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useId, useMemo, useState, type ReactNode } from 'react';
import { IconGrid, IconList, IconSearch } from '../icons';
import { Button } from './Button';
import { Segmented } from './Choice';
import { cls } from './cls';
import { FiltersButton, FiltersDrawer } from './Filters';
import { MenuButton, MenuItem } from './Overlay';
import { FilterChip } from './Status';

/** THE CATALOGUE BAR (docs/DESIGN-SYSTEM-V4.md §5.11; replaces LibraryBar and the rows of selects, V4-09):
 *
 *    [🔍 Search the cast…            ]  [ Filter 2 ]   Sort: Recent ⌄   [▦ | ☰]
 *     Cartoon ×   Arabic ×   Clear all
 *
 *  One Filter popover holds every facet (segmented for one choice, a check list for several); the active ones are
 *  FilterChips under the bar. Search is 40 tall, min(100%, 28rem); on a phone it goes full width, then Filter · Sort
 *  · View on one row. The state belongs in the URL (§7.4): `?f=style:CARTOON,lang:AR`, `?sort=`, `?view=` —
 *  useCatalogueParams reads and writes it. */

export interface Facet { id: string; label: string; /** one value at a time (segmented) or several (a check list) */ kind?: 'one' | 'many'; options: ReadonlyArray<{ value: string; label: string }> }
export type Filters = Readonly<Record<string, readonly string[]>>;
export type View = 'grid' | 'list';

/** `style:CARTOON,lang:AR,lang:EN` → { style: ['CARTOON'], lang: ['AR', 'EN'] }. Malformed parts are dropped. */
export function parseFilters(raw: string | null | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of (raw ?? '').split(',')) {
    const i = part.indexOf(':');
    if (i <= 0) continue;
    const k = part.slice(0, i).trim();
    let v = part.slice(i + 1).trim();
    try { v = decodeURIComponent(v); } catch { /* as written */ }
    if (!k || !v) continue;
    (out[k] ??= []);
    if (!out[k].includes(v)) out[k].push(v);
  }
  return out;
}

/** The inverse of parseFilters, facets in `order` first (then the rest as they come); empty facets are left out. */
export function serializeFilters(f: Filters, order: readonly string[] = []): string {
  const keys = [...order.filter((k) => f[k]?.length), ...Object.keys(f).filter((k) => !order.includes(k) && f[k]?.length)];
  return keys.flatMap((k) => f[k].map((v) => `${k}:${encodeURIComponent(v)}`)).join(',');
}

/** Turns a value on or off: a `one` facet holds at most one value ('' clears it), a `many` facet toggles it. */
export function toggleFilter(f: Filters, facet: string, value: string, kind: 'one' | 'many' = 'many'): Record<string, string[]> {
  const next: Record<string, string[]> = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, [...v]]));
  const cur = next[facet] ?? [];
  if (kind === 'one') next[facet] = value ? [value] : [];
  else next[facet] = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
  if (!next[facet].length) delete next[facet];
  return next;
}

export const activeFilterCount = (f: Filters) => Object.values(f).reduce((n, v) => n + v.length, 0);

/** The catalogue's state from the URL, and setters that replace the history entry (so Back leaves the catalogue).
 *  Defaults are left out of the URL. Needs a Suspense boundary above it (useSearchParams). */
export function useCatalogueParams<S extends string>({ sorts, defaultSort, defaultView = 'grid', facets = [] }: { sorts: readonly S[]; defaultSort: S; defaultView?: View; facets?: readonly Facet[] }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = sp.get('sort');
  const sort = (sorts as readonly string[]).includes(raw ?? '') ? (raw as S) : defaultSort;
  const v = sp.get('view');
  const view: View = v === 'grid' || v === 'list' ? v : defaultView;
  const fRaw = sp.get('f');
  const filters = useMemo(() => parseFilters(fRaw), [fRaw]);
  const q = sp.get('q') ?? '';
  const write = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, val] of Object.entries(patch)) { if (val) next.set(k, val); else next.delete(k); }
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }, [sp, router, pathname]);
  const order = facets.map((x) => x.id);
  return {
    q, filters, sort, view,
    setQ: (x: string) => write({ q: x || null }),
    setFilters: (f: Filters) => write({ f: serializeFilters(f, order) || null }),
    setSort: (s: S) => write({ sort: s === defaultSort ? null : s }),
    setView: (x: View) => write({ view: x === defaultView ? null : x }),
    clear: () => write({ q: null, f: null }),
  };
}

export function CatalogueBar<S extends string>({ q, onQ, placeholder, facets = [], filters = {}, onFilters, sort, sorts, onSort, view, onView, extra, className = '' }: {
  q: string; onQ: (v: string) => void; placeholder?: string;
  facets?: readonly Facet[]; filters?: Filters; onFilters?: (f: Filters) => void;
  sort?: S; sorts?: ReadonlyArray<{ value: S; label: string }>; onSort?: (s: S) => void;
  view?: View; onView?: (v: View) => void;
  /** anything else on the row's end (rare) */ extra?: ReactNode; className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(filters);
  const labelOf = (facet: Facet, value: string) => facet.options.find((o) => o.value === value)?.label ?? value;
  const set = (f: Filters) => onFilters?.(f);
  const sortLabel = sorts?.find((s) => s.value === sort)?.label;
  return (
    <div className={cls('catalogue-bar', className)}>
      <div className="catalogue-row">
        <label className="catalogue-search" htmlFor={`${id}-q`}>
          <IconSearch aria-hidden />
          <input id={`${id}-q`} type="search" className="input" dir="auto" value={q} onChange={(e) => onQ(e.target.value)} placeholder={placeholder ?? 'Search…'} aria-label={'Search'} />
        </label>
        <div className="catalogue-controls">
          {facets.length > 0 && onFilters && (
            <FiltersButton count={count} onClick={() => setOpen(true)} expanded={open} />
          )}
          {sorts && onSort && (
            <MenuButton label={`${'Sort'}: ${sortLabel ?? ''}`} display={<><span className="catalogue-sort-prefix">{'Sort'}: </span>{sortLabel}</>} variant="quiet" caret align="end">
              {sorts.map((s) => <MenuItem key={s.value} role="menuitemradio" aria-checked={s.value === sort} onClick={() => onSort(s.value)}>{s.label}</MenuItem>)}
            </MenuButton>
          )}
          {onView && view && (
            <Segmented label={'View'} value={view} onChange={onView} options={[
              { value: 'grid', label: <><IconGrid aria-hidden className="size-4" /><span className="sr-only">Grid</span></> },
              { value: 'list', label: <><IconList aria-hidden className="size-4" /><span className="sr-only">List</span></> },
            ]} />
          )}
          {extra}
        </div>
      </div>
      {facets.length > 0 && onFilters && (
        <FiltersDrawer open={open} onClose={() => setOpen(false)} value={filters} onChange={(f) => set(f)}
          facets={facets.map((f) => ({ id: f.id, label: f.label, multiple: (f.kind ?? 'one') === 'many', options: f.options }))} />
      )}
      {count > 0 && onFilters && (
        <div className="catalogue-chips" aria-label={'Active filters'} role="group">
          {facets.flatMap((facet) => (filters[facet.id] ?? []).map((v) => (
            <FilterChip key={`${facet.id}:${v}`} onRemove={() => set(toggleFilter(filters, facet.id, v, 'many'))}>{labelOf(facet, v)}</FilterChip>
          )))}
          <Button size="sm" variant="quiet" onClick={() => set({})}>Clear all</Button>
        </div>
      )}
    </div>
  );
}
