'use client';

import Link from 'next/link';
import { useId, type ReactNode } from 'react';
import { cls } from './cls';
import { rovingIndex, rovingStep } from './focus';

/** CHOICES (docs/DESIGN-SYSTEM-V4.md §5.18) — Segmented for every short closed set (age band, pitch, lighting,
 *  Song ⇄ Video), ChoiceTiles for the method choice. Both are radiogroups with one Tab stop: the arrow keys move the
 *  selection along the row (→ next, ← previous), Home and End jump to the ends, disabled options
 *  are skipped. A disabled option says why in words beside the control (`reason`), never by colour alone. */

export interface ChoiceOption<T extends string> { value: T; label: ReactNode; icon?: ReactNode; disabled?: boolean; /** why it is disabled, shown as text */ reason?: ReactNode }

function useRadioKeys<T extends string>(options: ReadonlyArray<{ value: T; disabled?: boolean }>, value: T, onChange: (v: T) => void, orientation: 'horizontal' | 'both') {
  return (e: React.KeyboardEvent<HTMLElement>) => {
    const step = rovingStep(e.key, { orientation });
    if (!step) return;
    const from = Math.max(0, options.findIndex((o) => o.value === value));
    const next = rovingIndex(step, from, options.map((o) => Boolean(o.disabled)));
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next].value);
    e.currentTarget.querySelector<HTMLElement>(`[data-value="${CSS.escape(options[next].value)}"]`)?.focus();
  };
}

/** A row of mutually exclusive options on an outline track; the selected one is neutral, one step up. Heights follow
 *  the density tokens. */
export function Segmented<T extends string>({ value, onChange, options, label, size, className = '', id }: { value: T; onChange: (v: T) => void; options: Array<ChoiceOption<T>>; label: string; size?: 'sm'; className?: string; id?: string }) {
  const onKey = useRadioKeys(options, value, onChange, 'both');
  const reasonId = useId();
  const enabled = options.filter((o) => !o.disabled);
  const current = options.some((o) => o.value === value && !o.disabled) ? value : enabled[0]?.value;
  // a reason shared by several disabled options is said ONCE (QA S5: the first shot's two joins printed it twice);
  // each disabled option points at its reason's one line
  const reasons = options.filter((o) => o.disabled && o.reason).filter((o, i, all) => typeof o.reason !== 'string' || all.findIndex((x) => x.reason === o.reason) === i);
  const reasonOf = (o: ChoiceOption<T>) => { const r = reasons.find((x) => x === o || (typeof o.reason === 'string' && x.reason === o.reason)); return r ? `${reasonId}-${r.value}` : undefined; };
  const group = (
    <div role="radiogroup" aria-label={label} id={id} className={cls('seg', size === 'sm' && 'text-xs', !reasons.length && className)} onKeyDown={onKey}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" data-value={o.value} aria-checked={value === o.value} tabIndex={o.value === current ? 0 : -1} disabled={o.disabled}
          aria-describedby={o.disabled && o.reason ? reasonOf(o) : undefined} onClick={() => onChange(o.value)}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
  if (!reasons.length) return group;
  return (
    <span className={cls('seg-wrap', className)}>
      {group}
      {reasons.map((o) => <span key={o.value} id={`${reasonId}-${o.value}`} className="seg-reason">{o.reason}</span>)}
    </span>
  );
}

/** A segmented control whose options are places (the Shows | Shorts | Music Videos switch at the top of the catalogues
 *  below 1024, §5.2): a <nav> of links on Segmented's track, the current place marked `aria-current="page"`. Not a
 *  radiogroup — choosing one navigates, so each option is a real link with the browser's own keyboard handling. */
export function SegmentedLinks({ label, items, current, className }: { label: string; items: Array<{ href: string; label: ReactNode; icon?: ReactNode }>; current?: string; className?: string }) {
  return (
    <nav aria-label={label} className={cls('seg seg-links', className)}>
      {items.map((it) => <Link key={it.href} href={it.href} aria-current={current === it.href ? 'page' : undefined}>{it.icon}{it.label}</Link>)}
    </nav>
  );
}

export interface TileOption<T extends string> extends ChoiceOption<T> { /** one line under the title */ hint?: ReactNode }

/** The method choice ("Let the studio propose" / "Write it yourself"): 2-up or 3-up at ≥ 768 px (min 14rem), stacked
 *  64 px rows below that (icon 20, title 15/20 600, a one-line hint, the radio at the end). Selected: a 1.5 px light
 *  border and a filled radio. */
export function ChoiceTiles<T extends string>({ value, onChange, options, label, columns = 2, className = '', labelledBy }: { value: T; onChange: (v: T) => void; options: Array<TileOption<T>>; label?: string; labelledBy?: string; columns?: 2 | 3; className?: string }) {
  const onKey = useRadioKeys(options, value, onChange, 'both');
  const reasonId = useId();
  const enabled = options.filter((o) => !o.disabled);
  const current = options.some((o) => o.value === value && !o.disabled) ? value : enabled[0]?.value;
  return (
    <div role="radiogroup" aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy} className={cls('choice-tiles-v4', className)} data-cols={columns} onKeyDown={onKey}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button key={o.value} type="button" role="radio" data-value={o.value} aria-checked={on} tabIndex={o.value === current ? 0 : -1} disabled={o.disabled}
            aria-describedby={o.disabled && o.reason ? `${reasonId}-${o.value}` : undefined} className="choice-tile" onClick={() => onChange(o.value)}>
            {o.icon && <span aria-hidden className="choice-tile-icon">{o.icon}</span>}
            <span className="choice-tile-text">
              <span className="choice-tile-title">{o.label}</span>
              {o.hint && <span className="choice-tile-hint">{o.hint}</span>}
              {o.disabled && o.reason && <span id={`${reasonId}-${o.value}`} className="choice-tile-hint">{o.reason}</span>}
            </span>
            <span aria-hidden className="radio-mark" />
          </button>
        );
      })}
    </div>
  );
}

/** v3's tiles on native radios (kept until Q1; pages migrate to ChoiceTiles). At 768 px and wider they sit side by
 *  side; below that they stack as 64 px rows. */
export function ChoiceCards<T extends string>({ name, value, onChange, options, columns = 2, size = 'md', label }: { name: string; value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode; hint?: ReactNode; icon?: ReactNode; preview?: ReactNode; disabled?: boolean }>; columns?: 2 | 3 | 4; size?: 'md' | 'lg'; label?: string }) {
  const min = columns === 4 ? '10rem' : '14rem';
  return (
    <div role="radiogroup" aria-label={label} className="choice-tiles flex flex-col gap-2 md:grid md:gap-3" style={{ '--tile-min': min } as React.CSSProperties}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <label key={o.value} data-selected={on || undefined} aria-disabled={o.disabled || undefined} className={cls('tile-choice relative min-h-16 px-4 py-3 md:gap-3', size === 'lg' ? 'md:p-5' : 'md:p-4')}>
            <input type="radio" name={name} value={o.value} checked={on} disabled={o.disabled} onChange={() => onChange(o.value)} className="sr-only" />
            {o.preview && <div className="mb-3 hidden overflow-hidden rounded-[var(--r-media)] md:block">{o.preview}</div>}
            <span className="flex items-center gap-3 md:items-start">
              {o.icon && <span aria-hidden className={cls('grid size-5 flex-none place-items-center [&>svg]:size-5 [&>svg]:stroke-[1.5]', on ? 'text-fg' : 'text-muted')}>{o.icon}</span>}
              <span className="min-w-0 flex-1">
                <span className={cls('block font-semibold text-fg', size === 'lg' ? 'text-[15px] leading-5 md:text-[16px] md:leading-[22px]' : 'text-[15px] leading-5')}>{o.label}</span>
                {o.hint && <span className="mt-0.5 block text-sm text-muted">{o.hint}</span>}
              </span>
              <span aria-hidden className="radio-mark" />
            </span>
          </label>
        );
      })}
    </div>
  );
}
