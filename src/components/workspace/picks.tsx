'use client';

import type { ReactNode } from 'react';
import type { CameraMove, Framing } from '@/domain/vocabulary';
import { vocab } from './model';

/** PICKS (docs/DESIGN-SYSTEM-V5.md §5.19) — closed vocabularies as a row of choices, each with a drawn 44 × 26 preview
 *  (the frame, the subject's size in it, the camera's move as an arrow), so a framing or a move is chosen by its look,
 *  never by a model parameter. A radio group: one tab stop, arrows move and choose. */

export function Picks<T extends string>({ label, value, options, onChange, draw, describedBy }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void; draw?: (v: T) => ReactNode; describedBy?: string }) {
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = options.indexOf(value);
    const n = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : null;
    if (n === null) return;
    e.preventDefault();
    const next = options[(n + options.length) % options.length];
    onChange(next);
    requestAnimationFrame(() => (e.currentTarget.querySelector(`[data-value="${next}"]`) as HTMLElement | null)?.focus());
  };
  return (
    <div className="ws-picks" role="radiogroup" aria-label={label} aria-describedby={describedBy} onKeyDown={onKey}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={o === value} tabIndex={o === value ? 0 : -1} data-value={o} className="ws-pick" onClick={() => onChange(o)}>
          {draw && <span className="ws-pick-draw" aria-hidden>{draw(o)}</span>}
          <span className="ws-pick-label">{vocab(o)}</span>
        </button>
      ))}
    </div>
  );
}

/** The subject's size in the frame for each framing (the share of the frame's height the figure takes). */
const SIZE: Record<Framing, number> = { EXTREME_WIDE: 0.25, WIDE: 0.45, MEDIUM_WIDE: 0.7, MEDIUM: 1, MEDIUM_CLOSE_UP: 1.35, CLOSE_UP: 1.9, EXTREME_CLOSE_UP: 3, INSERT: 0, TWO_SHOT: 0.9, OVER_THE_SHOULDER: 1.1 };

/** A 44 × 26 frame with a figure at the framing's size (two figures for a two-shot; a shoulder for over-the-shoulder;
 *  an object for an insert). Drawn in currentColor. */
export function FramingDraw({ f }: { f: Framing }) {
  const s = SIZE[f];
  const figure = (cx: number, scale: number) => {
    const head = 3.2 * scale; const top = 26 - 22 * scale; const body = 9 * scale;
    return <g><circle cx={cx} cy={top + head} r={head} /><path d={`M${cx - body} 27 Q${cx - body} ${top + head * 2.6} ${cx} ${top + head * 2.4} Q${cx + body} ${top + head * 2.6} ${cx + body} 27`} /></g>;
  };
  return (
    <svg width="44" height="26" viewBox="0 0 44 26" fill="none" stroke="currentColor" strokeWidth="1.25">
      <rect x="0.75" y="0.75" width="42.5" height="24.5" rx="2" />
      <clipPath id={`fr-${f}`}><rect x="1" y="1" width="42" height="24" /></clipPath>
      <g clipPath={`url(#fr-${f})`} fill="currentColor" fillOpacity="0.35">
        {f === 'INSERT' ? <rect x="16" y="9" width="12" height="9" rx="1.5" /> : f === 'TWO_SHOT' ? <>{figure(15, s)}{figure(29, s)}</> : f === 'OVER_THE_SHOULDER' ? <>{figure(28, 0.8)}<circle cx="8" cy="20" r="9" fillOpacity="0.6" /></> : figure(22, s)}
      </g>
    </svg>
  );
}

/** A 44 × 26 frame with the camera's move as an arrow (in, out, across, up, down, around). */
export function MoveDraw({ m }: { m: CameraMove }) {
  const arrow: Record<CameraMove, ReactNode> = {
    STATIC: <circle cx="22" cy="13" r="2" fill="currentColor" />,
    PUSH_IN: <><rect x="14" y="8" width="16" height="10" rx="1" /><path d="M8 4l6 4M36 4l-6 4M8 22l6-4M36 22l-6-4" /></>,
    PULL_BACK: <><rect x="14" y="8" width="16" height="10" rx="1" /><path d="M14 8L9 5M30 8l5-3M14 18l-5 3M30 18l5 3" /></>,
    PAN_LEFT: <path d="M32 13H12m4-4l-4 4 4 4" />, PAN_RIGHT: <path d="M12 13h20m-4-4l4 4-4 4" />,
    TRUCK_LEFT: <path d="M32 10H12m4-3l-4 3 4 3M32 16H12" />, TRUCK_RIGHT: <path d="M12 10h20m-4-3l4 3-4 3M12 16h20" />,
    TILT_UP: <path d="M22 21V5m-4 4l4-4 4 4" />, TILT_DOWN: <path d="M22 5v16m-4-4l4 4 4-4" />,
    CRANE_UP: <path d="M14 21V7m-3 3l3-3 3 3M30 21V7m-3 3l3-3 3 3" />, CRANE_DOWN: <path d="M14 5v14m-3-3l3 3 3-3M30 5v14m-3-3l3 3 3-3" />,
    HANDHELD: <path d="M10 14l4-3 4 4 4-4 4 4 4-4 4 3" />, FOLLOW: <><circle cx="27" cy="13" r="2.5" fill="currentColor" /><path d="M10 13h11m-3-3l3 3-3 3" /></>,
    ORBIT: <><ellipse cx="22" cy="13" rx="12" ry="5" /><path d="M31 9l3 1-1 3" /></>, RACK_FOCUS: <><circle cx="16" cy="13" r="4" /><circle cx="29" cy="13" r="2.5" strokeDasharray="1.5 1.5" /></>,
  };
  return (
    <svg width="44" height="26" viewBox="0 0 44 26" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <rect x="0.75" y="0.75" width="42.5" height="24.5" rx="2" />
      {arrow[m]}
    </svg>
  );
}
