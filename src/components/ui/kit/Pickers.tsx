'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { IconCheck } from '../icons';
import { cls } from './cls';
import { rovingIndex, rovingStep } from './focus';

/** PICKERS, STAGES AND DISCLOSURE (lifted from the creation flows; docs/design/VISUAL-STANDARD-V5.1.md §5.6 "Selected
 *  (pickers)", §5.21, §5.12) — props, no page logic.
 *
 *    PicturePicker   one choice among drawn pictures (the styles Cartoon / Anime / Realistic, a format): a radio group,
 *                    one Tab stop, the arrows (and Home/End) move and choose. Each option: its picture in a frame
 *                    (surface-2, radius 14, the option's ratio), the name (.t-card) 12 below and one line (.t-meta);
 *                    chosen = the 2 px text-1 outline at offset 3 and the 24 px check; hover dims the picture a touch;
 *                    a disabled option says why in its line and is skipped by the arrows.
 *    StageSteps      a vertical stepper of real stages (a job's children): a 24 px mark on a 1.5 px rail — done (the ok
 *                    disc with a check), running (a 2 px light ring, and the running dot with its words), waiting (the
 *                    control ring, a quieter name), skipped (a dashed ring), failed (the bad disc). Each row: the name,
 *                    who does it, a note, and the time at the end in mono. The current one is aria-current="step".
 *    DisclosureCard  a header button (aria-expanded) that opens a region: `card` (a level-1 card: title .t-title + one
 *                    line) or `inline` (a rule above: title .t-card + a meta line on its baseline). The region's height
 *                    animates over --dur-2 (none under reduced motion); while closed it is inert, and its fields keep
 *                    their values. `forceOpen` opens it (an error inside). */

export interface PictureOption<T extends string> { value: T; label: ReactNode; hint?: ReactNode; picture: ReactNode; disabled?: boolean; reason?: string }

export function PicturePicker<T extends string>({ label, value, onChange, options, ratio = '16/9', minWidth = 140, className }: {
  label: ReactNode; value: T | null; onChange: (v: T) => void;
  options: ReadonlyArray<PictureOption<T>>;
  /** the pictures' frame */ ratio?: '16/9' | '2/3' | '1/1' | '4/3';
  /** px: the narrowest a tile gets before the row wraps */ minWidth?: number;
  className?: string;
}) {
  const labelId = useId();
  const live = options.filter((o) => !o.disabled);
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = rovingStep(e.key, { orientation: 'both' }); if (!step) return;
    const from = options.findIndex((o) => o.value === value);
    const next = rovingIndex(step, Math.max(0, from), options.map((o) => Boolean(o.disabled))); if (next < 0) return;
    e.preventDefault(); onChange(options[next].value);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };
  const chosenLive = live.some((o) => o.value === value);
  return (
    <div className={cls('ppick-field', className)}>
      <p id={labelId} className="label">{label}</p>
      <div role="radiogroup" aria-labelledby={labelId} className="ppick-grid" style={{ ['--ppick-min' as string]: `${minWidth}px` }} data-count={options.length} onKeyDown={onKey}>
        {options.map((o) => {
          const on = value === o.value;
          const tabbable = on || (!chosenLive && live[0]?.value === o.value);
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on} tabIndex={tabbable ? 0 : -1} disabled={o.disabled} className="ppick" onClick={() => onChange(o.value)}>
              <span className="ppick-frame" style={{ aspectRatio: ratio.replace('/', ' / ') }}>
                {o.picture}
                {on && <span className="card-check" aria-hidden><IconCheck /></span>}
              </span>
              <span className="t-card ppick-name">{o.label}</span>
              <span className="t-meta ppick-sub">{o.disabled ? o.reason : o.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** An icon centred in a picker frame (an option that is not a picture: "Studio decides"). */
export function PickerIcon({ children }: { children: ReactNode }) {
  return <span className="ppick-icon" aria-hidden>{children}</span>;
}

export type StageState = 'done' | 'running' | 'waiting' | 'skipped' | 'failed';
export interface StageStep { id: string; label: ReactNode; who?: ReactNode; state: StageState; note?: ReactNode; time?: ReactNode }
const STATE_WORD: Record<StageState, string> = { done: 'done', running: 'running', waiting: 'waiting', skipped: 'skipped', failed: 'failed' };

export function StageSteps({ stages, label, className }: { stages: ReadonlyArray<StageStep>; label?: string; className?: string }) {
  return (
    <ol className={cls('stages', className)} aria-label={label}>
      {stages.map((s) => (
        <li key={s.id} className="stage" data-state={s.state} aria-current={s.state === 'running' ? 'step' : undefined}>
          <span className="stage-mark" aria-hidden>{s.state === 'done' ? <IconCheck /> : null}</span>
          <span className="stage-words">
            <span className="stage-title"><span className="t-card">{s.label}</span>{s.who && <span className="t-meta">{s.who}</span>}</span>
            {s.state === 'running'
              ? <span className="job-dot stage-run"><span className="job-dot-mark" aria-hidden />{s.note ?? 'Working…'}</span>
              : s.note ? <span className="t-meta stage-note">{s.note}</span> : null}
          </span>
          <span className="t-ro stage-time">{s.time}</span>
          <span className="sr-only">{STATE_WORD[s.state]}</span>
        </li>
      ))}
    </ol>
  );
}

/** The stepper while its stages load: `count` rows in the same shape. */
export function StageStepsSkeleton({ count = 6, label = 'Loading the stages…' }: { count?: number; label?: string }) {
  return (
    <div className="stages" aria-busy="true">
      <span className="sr-only" role="status">{label}</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="stage" aria-hidden>
          <span className="sk sk-block stage-mark" data-radius="pill" />
          <span className="stage-words"><span className="t-card"><span className="sk sk-line" style={{ inlineSize: `${36 + ((i * 17) % 30)}%` }} /></span></span>
        </div>
      ))}
    </div>
  );
}

export function DisclosureCard({ title, description, children, variant = 'card', defaultOpen = false, forceOpen, onOpenChange, id, className }: {
  title: ReactNode;
  /** `card`: one line under the title; `inline`: the meta on the title's baseline */ description?: ReactNode;
  children: ReactNode;
  variant?: 'card' | 'inline';
  defaultOpen?: boolean;
  /** when it turns true, the region opens (an error inside it) */ forceOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  id?: string; className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen || Boolean(forceOpen));
  useEffect(() => { if (forceOpen) setOpen(true); }, [forceOpen]);
  const gen = useId();
  const region = `${id ?? gen}-region`;
  const toggle = () => setOpen((o) => { onOpenChange?.(!o); return !o; });
  return (
    <section id={id} className={cls('disclosure', variant === 'card' && 'card', className)} data-variant={variant} data-open={open || undefined}>
      <button type="button" className="disclosure-head" aria-expanded={open} aria-controls={region} onClick={toggle}>
        <span className={variant === 'card' ? 't-title disclosure-title' : 't-card disclosure-title'}>{title}</span>
        {description != null && <span className={variant === 'card' ? 't-body disclosure-desc' : 't-meta disclosure-desc'}>{description}</span>}
        <span className="disclosure-chev" aria-hidden />
      </button>
      <div id={region} className="disclosure-region" inert={!open}>
        <div className="disclosure-inner"><div className="disclosure-body">{children}</div></div>
      </div>
    </section>
  );
}
