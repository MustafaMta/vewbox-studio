'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { IconClose, IconFilterList, IconSearch } from '../icons';
import { Button } from './Button';
import { cls } from './cls';
import { Drawer } from './Overlay';

/** SEARCH AND FILTERS (docs/design/VISUAL-STANDARD-V5.1.md §5.13, §5.15) — props, no page logic. The state (query,
 *  filters) belongs to the page; kit/CatalogueBar keeps it in the URL (useCatalogueParams, parseFilters …).
 *
 *    SearchField     a 40 px field with the magnifier at the start and a clear button at the end; Esc clears it
 *    FilterChips     one row of filter chips (32 high, pill, surface-2; selected = the light; counts in mono); one
 *                    choice (`multiple` false: choosing the selected one again clears it) or several
 *    FiltersButton   the secondary sm "Filters" button with its count (shown when a catalogue has > 6 items, §5.15)
 *    FiltersDrawer   the 400 px drawer (a sheet on phones) with one group of chips per facet, Clear all and Show */

export function SearchField({ value, onChange, label = 'Search', placeholder, onSubmit, disabled, className, id }: {
  value: string; onChange: (v: string) => void;
  /** the field's accessible name */ label?: string; placeholder?: string;
  onSubmit?: (v: string) => void; disabled?: boolean; className?: string; id?: string;
}) {
  const gen = useId();
  const input = useRef<HTMLInputElement>(null);
  return (
    <form role="search" className={cls('search-field', className)} onSubmit={(e) => { e.preventDefault(); onSubmit?.(value); }}>
      <IconSearch aria-hidden />
      <input ref={input} id={id ?? gen} type="search" className="input" dir="auto" value={value} placeholder={placeholder ?? label} aria-label={label} disabled={disabled} autoComplete="off"
        onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape' && value) { e.preventDefault(); e.stopPropagation(); onChange(''); } }} />
      {value && !disabled && (
        <button type="button" className="btn btn-quiet btn-icon btn-sm search-clear" aria-label="Clear the search" onClick={() => { onChange(''); input.current?.focus(); }}><IconClose aria-hidden /></button>
      )}
    </form>
  );
}

export interface FilterOption { value: string; label: ReactNode; count?: number; disabled?: boolean; /** why it cannot be chosen */ reason?: string }

/** A row of filter chips; `value` is the chosen values. */
export function FilterChips({ label, options, value, onChange, multiple, className }: {
  /** the group's accessible name ("Status") */ label: string;
  options: readonly FilterOption[]; value: readonly string[]; onChange: (v: string[]) => void;
  multiple?: boolean; className?: string;
}) {
  const toggle = (v: string) => {
    const on = value.includes(v);
    onChange(multiple ? (on ? value.filter((x) => x !== v) : [...value, v]) : on ? [] : [v]);
  };
  return (
    <div role="group" aria-label={label} className={cls('filter-chips', className)}>
      {options.map((o) => (
        <button key={o.value} type="button" className="chip" aria-pressed={value.includes(o.value)} disabled={o.disabled} title={o.disabled ? o.reason : undefined} onClick={() => toggle(o.value)}>
          {o.label}{o.count != null && <span className="count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** The "Filters" button with the number of active filters. */
export function FiltersButton({ count = 0, onClick, expanded, controls }: { count?: number; onClick: () => void; expanded?: boolean; controls?: string }) {
  return (
    <Button size="sm" icon={<IconFilterList aria-hidden />} onClick={onClick} aria-expanded={expanded} aria-controls={controls} aria-label={count ? `Filters, ${count} on` : 'Filters'}>
      Filters{count > 0 && <span className="btn-count">{count}</span>}
    </Button>
  );
}

export interface FilterFacet { id: string; label: string; options: readonly FilterOption[]; multiple?: boolean }

/** The filter drawer: one chip group per facet; the changes apply as they are made, "Show N" closes it. */
export function FiltersDrawer({ open, onClose, facets, value, onChange, resultCount, title = 'Filters' }: {
  open: boolean; onClose: () => void;
  facets: readonly FilterFacet[];
  value: Readonly<Record<string, readonly string[]>>;
  onChange: (v: Record<string, string[]>) => void;
  /** the number of items the filters keep, for the button ("Show 12") */ resultCount?: number;
  title?: string;
}) {
  const set = (facet: string, v: string[]) => {
    const next: Record<string, string[]> = Object.fromEntries(Object.entries(value).map(([k, x]) => [k, [...x]]));
    if (v.length) next[facet] = v; else delete next[facet];
    onChange(next);
  };
  const any = Object.values(value).some((v) => v.length);
  return (
    <Drawer open={open} onClose={onClose} title={title} size="sm"
      footer={<>
        <Button variant="quiet" onClick={() => onChange({})} disabled={!any}>Clear all</Button>
        <Button variant="primary" onClick={onClose}>{resultCount == null ? 'Done' : resultCount === 1 ? 'Show 1 item' : `Show ${resultCount} items`}</Button>
      </>}>
      <div className="filter-facets">
        {facets.map((f) => (
          <fieldset key={f.id} className="filter-facet">
            <legend className="t-label">{f.label}</legend>
            <FilterChips label={f.label} options={f.options} value={value[f.id] ?? []} multiple={f.multiple} onChange={(v) => set(f.id, v)} />
          </fieldset>
        ))}
      </div>
    </Drawer>
  );
}

/** A FiltersButton that owns its drawer (the common case). */
export function FiltersControl(props: Omit<Parameters<typeof FiltersDrawer>[0], 'open' | 'onClose'>) {
  const [open, setOpen] = useState(false);
  const count = Object.values(props.value).reduce((n, v) => n + v.length, 0);
  return (
    <>
      <FiltersButton count={count} onClick={() => setOpen(true)} expanded={open} />
      <FiltersDrawer {...props} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
