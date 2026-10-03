'use client';

import { useRef, type ReactNode } from 'react';
import { T } from '@/lib/copy';
import { cls } from '@/components/ui/kit';
import { IconChevronLeft, IconChevronRight } from '@/components/ui/icons';
import { fmtClock } from '@/components/players/time';

/** THE DUAL-SCALE STRIP (docs/DESIGN-SYSTEM-V4.md §5.12; programmes over 5 minutes) — a 24 px overview of the whole
 *  programme with a viewport window, above the magnified FilmStrip or Timeline (`children`). The window moves by
 *  dragging, by clicking the overview to centre it there, with the ‹ › buttons (2.5.7) and with the keyboard (it is a
 *  slider: ←/→ a quarter window, Page Up/Down a whole window, Home/End). Always LTR. */

export interface OverviewSegment { id: string; from: number; to: number; src?: string | null }

export function DualScaleStrip({ duration, start, length, onStart, segments = [], children, className }: { duration: number; start: number; length: number; onStart: (s: number) => void; segments?: OverviewSegment[]; children?: ReactNode; className?: string }) {
  const bar = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; s: number } | null>(null);
  const len = Math.min(length, duration);
  const clamp = (s: number) => Math.max(0, Math.min(duration - len, s));
  const pct = (t: number) => (duration > 0 ? (t / duration) * 100 : 0);
  const toTime = (clientX: number) => { const r = bar.current!.getBoundingClientRect(); return ((clientX - r.left) / r.width) * duration; };
  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    const n = k === 'ArrowRight' ? start + len / 4 : k === 'ArrowLeft' ? start - len / 4 : k === 'PageDown' ? start + len : k === 'PageUp' ? start - len : k === 'Home' ? 0 : k === 'End' ? duration : null;
    if (n === null) return;
    e.preventDefault(); onStart(clamp(n));
  };
  return (
    <div className={cls('dstrip', className)} dir="ltr">
      <div className="dstrip-over">
        <button type="button" className="ebtn ebtn-icon" aria-label={T('media.dual.earlier')} disabled={start <= 0} onClick={() => onStart(clamp(start - len))}><IconChevronLeft aria-hidden /></button>
        <div ref={bar} className="dstrip-bar" role="group" aria-label={T('media.dual.label')}
          onPointerDown={(e) => { if ((e.target as HTMLElement).closest('.dstrip-window')) return; onStart(clamp(toTime(e.clientX) - len / 2)); }}>
          {segments.map((s) => (
            <span key={s.id} className="dstrip-seg" style={{ insetInlineStart: `${pct(s.from)}%`, inlineSize: `${pct(s.to - s.from)}%` }} aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {s.src && <img src={s.src} alt="" loading="lazy" />}
            </span>
          ))}
          <div className="dstrip-window" role="slider" tabIndex={0} aria-label={T('media.dual.window')} aria-valuemin={0} aria-valuemax={Math.max(0, Math.round(duration - len))} aria-valuenow={Math.round(start)}
            aria-valuetext={`${fmtClock(start)}–${fmtClock(start + len)}`} style={{ insetInlineStart: `${pct(start)}%`, inlineSize: `${pct(len)}%` }} onKeyDown={onKey}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, s: start }; }}
            onPointerMove={(e) => { const d = drag.current; if (!d || !bar.current) return; const dt = ((e.clientX - d.x) / bar.current.getBoundingClientRect().width) * duration; onStart(clamp(d.s + dt)); }}
            onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
        </div>
        <button type="button" className="ebtn ebtn-icon" aria-label={T('media.dual.later')} disabled={start >= duration - len} onClick={() => onStart(clamp(start + len))}><IconChevronRight aria-hidden /></button>
      </div>
      <div className="dstrip-detail">{children}</div>
    </div>
  );
}
