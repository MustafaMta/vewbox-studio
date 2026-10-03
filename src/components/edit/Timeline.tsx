'use client';

import { useEffect, useRef, useState } from 'react';
import { T } from '@/lib/copy';
import { cls } from '@/components/ui/kit';
import { IconFit, IconZoomIn, IconZoomOut } from '@/components/ui/icons';
import { Waveform } from '@/components/players/Waveform';
import { fmtClock, timecode } from '@/components/players/time';

/** THE TIMELINE (docs/DESIGN-SYSTEM-V4.md §5.14; cutting room only) — ruler, picture, dialogue and music tracks.
 *  Ruler: timecode ticks in `.tc` 12 px faint; click (or the arrows: it is a slider) moves the playhead.
 *  Picture: clips on `--clip` with a 1 px `--clip-edge`, the 2 px precision radius and 1 px gaps; the shot number in
 *  `.tc`, the purpose on hover and focus (and always in the accessible name). Dialogue: line blocks with a strong
 *  edge. Music: the waveform. A selected clip has a 2 px ivory outline; Shift selects a range, Ctrl/⌘ toggles. The
 *  playhead is a 1 px ivory line through every track with an iris handle on the ruler. Trim handles (8 px) sit at the
 *  clip edges on hover and focus; their pointer and keyboard alternative is the ±1 frame nudges in the toolbar (and the
 *  numeric in/out in the inspector) (2.5.7). Zoom: − / +, Ctrl+wheel and Fit. It scrolls horizontally only, and it is
 *  LEFT TO RIGHT. */

export interface TimelineClip { id: string; number: number; from: number; to: number; purpose?: string }
export interface TimelineLine { id: string; from: number; to: number; text: string; lang?: string }

const STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

export function Timeline({ duration, fps = 24, time, onSeek, clips, dialogue = [], music, selected = [], onSelect, onTrim, className }: { duration: number; fps?: number; time: number; onSeek: (t: number) => void; clips: TimelineClip[]; dialogue?: TimelineLine[]; music?: { src: string; label?: string } | null; selected?: string[]; onSelect?: (ids: string[]) => void; onTrim?: (id: string, edge: 'start' | 'end', t: number) => void; className?: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [pps, setPps] = useState<number | null>(null);
  const [focusI, setFocusI] = useState(0);
  const anchor = useRef<string | null>(null);
  const drag = useRef<{ id: string; edge: 'start' | 'end'; x: number; t: number } | null>(null);
  const frame = 1 / Math.max(1, fps);
  const fit = width / Math.max(1, duration);
  const scale = pps ?? fit;
  const content = Math.max(width, duration * scale);
  const step = STEPS.find((s) => s * scale >= 96) ?? STEPS[STEPS.length - 1];
  const x = (t: number) => t * scale;

  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth)); ro.observe(el); setWidth(el.clientWidth);
    const wheel = (e: WheelEvent) => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); setPps((p) => Math.max(el.clientWidth / Math.max(1, duration), Math.min(400, (p ?? el.clientWidth / Math.max(1, duration)) * (e.deltaY < 0 ? 1.25 : 0.8)))); };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => { ro.disconnect(); el.removeEventListener('wheel', wheel); };
  }, [duration]);

  const zoom = (k: number) => setPps(Math.max(fit, Math.min(400, scale * k)));
  const select = (id: string, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    if (!onSelect) return;
    const from = anchor.current ?? selected[0];
    if (e.shiftKey && from) {
      const a = clips.findIndex((c) => c.id === from), b = clips.findIndex((c) => c.id === id);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      onSelect(clips.slice(lo, hi + 1).map((c) => c.id));
    } else if (e.ctrlKey || e.metaKey) { anchor.current = id; onSelect(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]); }
    else { anchor.current = id; onSelect([id]); }
  };
  const onClipsKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const n = e.key === 'ArrowRight' ? focusI + 1 : e.key === 'ArrowLeft' ? focusI - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? clips.length - 1 : null;
    if (n !== null) { e.preventDefault(); const i = Math.max(0, Math.min(clips.length - 1, n)); setFocusI(i); e.currentTarget.querySelector<HTMLElement>(`[data-ci="${i}"]`)?.focus(); return; }
    if ((e.key === ' ' || e.key === 'Enter') && clips[focusI]) { e.preventDefault(); select(clips[focusI].id, e); }
  };
  const onRulerKey = (e: React.KeyboardEvent) => {
    const k = e.key; const big = e.shiftKey ? 1 : frame;
    const n = k === 'ArrowRight' ? time + big : k === 'ArrowLeft' ? time - big : k === 'Home' ? 0 : k === 'End' ? duration : null;
    if (n === null) return;
    e.preventDefault(); onSeek(Math.max(0, Math.min(duration, n)));
  };
  const one = selected.length === 1 ? clips.find((c) => c.id === selected[0]) : undefined;
  const snap = (t: number) => Math.round(t / frame) * frame;
  const trim = (c: TimelineClip, edge: 'start' | 'end', t: number) => {
    if (!onTrim) return;
    const v = snap(edge === 'start' ? Math.max(0, Math.min(t, c.to - frame)) : Math.max(c.from + frame, Math.min(t, duration)));
    onTrim(c.id, edge, +v.toFixed(4));
  };
  const ticks = Array.from({ length: Math.floor(duration / step) + 1 }, (_, i) => i * step);

  return (
    <div className={cls('tl', className)} dir="ltr" role="region" aria-label={T('media.tl.label')}>
      <div className="tl-toolbar">
        <button type="button" className="ebtn ebtn-icon" aria-label={T('media.tl.zoomOut')} onClick={() => zoom(1 / 1.5)} disabled={scale <= fit + 1e-6}><IconZoomOut aria-hidden /></button>
        <button type="button" className="ebtn ebtn-icon" aria-label={T('media.tl.zoomIn')} onClick={() => zoom(1.5)} disabled={scale >= 400}><IconZoomIn aria-hidden /></button>
        <button type="button" className="ebtn" onClick={() => setPps(null)} aria-pressed={pps === null}><IconFit aria-hidden />{T('media.tl.fit')}</button>
        {one && onTrim && (
          <span className="tl-nudges" role="group" aria-label={T.f('media.shot', { n: one.number })}>
            <span className="tl-nudge-label">{T.f('media.tl.trimStart', { n: one.number })}</span>
            <button type="button" className="ebtn" onClick={() => trim(one, 'start', one.from - frame)}>{T('media.tl.startEarlier')}</button>
            <button type="button" className="ebtn" onClick={() => trim(one, 'start', one.from + frame)}>{T('media.tl.startLater')}</button>
            <span className="tl-nudge-label">{T.f('media.tl.trimEnd', { n: one.number })}</span>
            <button type="button" className="ebtn" onClick={() => trim(one, 'end', one.to - frame)}>{T('media.tl.endEarlier')}</button>
            <button type="button" className="ebtn" onClick={() => trim(one, 'end', one.to + frame)}>{T('media.tl.endLater')}</button>
          </span>
        )}
        <span className="prow-spacer" />
        {selected.length > 1 && <span className="caption num">{T.f('media.tl.selected', { n: selected.length })}</span>}
        <span className="tc tl-now">{timecode(time, fps)}</span>
      </div>
      <div className="tl-body">
        <div className="tl-heads" aria-hidden>
          <span className="tl-head tl-head-ruler" />
          <span className="tl-head caption">{T('media.tl.picture')}</span>
          {dialogue.length > 0 && <span className="tl-head caption">{T('media.tl.dialogue')}</span>}
          {music && <span className="tl-head caption" data-track="music">{T('media.tl.music')}</span>}
        </div>
        <div ref={scroller} className="tl-scroll">
          <div className="tl-content" style={{ inlineSize: content }}>
            <div className="tl-ruler" role="slider" tabIndex={0} aria-label={T('media.tl.ruler')} aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(time)} aria-valuetext={timecode(time, fps)}
              onPointerDown={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek(Math.max(0, Math.min(duration, (e.clientX - r.left) / scale))); }} onKeyDown={onRulerKey}>
              {ticks.map((t) => <span key={t} className="tl-tick" style={{ insetInlineStart: x(t) }}><span className="tc tl-tick-label">{timecode(t, fps)}</span></span>)}
              <span className="tl-handle" style={{ insetInlineStart: x(time) }} aria-hidden />
            </div>
            <div className="tl-track" data-track="picture" role="listbox" aria-label={T('media.tl.picture')} aria-multiselectable="true" onKeyDown={onClipsKey}>
              {clips.map((c, i) => {
                const on = selected.includes(c.id);
                return (
                  <div key={c.id} role="option" aria-selected={on} tabIndex={i === focusI ? 0 : -1} data-ci={i} className="tl-clip" data-selected={on || undefined}
                    aria-label={`${T.f('media.shot', { n: c.number })}${c.purpose ? `: ${c.purpose}` : ''}, ${fmtClock(c.from)}–${fmtClock(c.to)}`}
                    style={{ insetInlineStart: x(c.from), inlineSize: Math.max(4, x(c.to) - x(c.from) - 1) }}
                    onClick={(e) => { setFocusI(i); select(c.id, e); }} onFocus={() => setFocusI(i)}>
                    <span className="tc tl-clip-n" aria-hidden>{c.number}</span>
                    {c.purpose && <span className="tl-clip-purpose" aria-hidden dir="auto">{c.purpose}</span>}
                    {onTrim && (['start', 'end'] as const).map((edge) => (
                      <span key={edge} className="tl-trim" data-edge={edge} aria-hidden
                        onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { id: c.id, edge, x: e.clientX, t: edge === 'start' ? c.from : c.to }; }}
                        onPointerMove={(e) => { const d = drag.current; if (!d || d.id !== c.id || d.edge !== edge) return; trim(c, edge, d.t + (e.clientX - d.x) / scale); }}
                        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onClick={(e) => e.stopPropagation()} />
                    ))}
                  </div>
                );
              })}
            </div>
            {dialogue.length > 0 && (
              <div className="tl-track" data-track="dialogue" role="list" aria-label={T('media.tl.dialogue')}>
                {dialogue.map((l) => (
                  <div key={l.id} role="listitem" className="tl-line" style={{ insetInlineStart: x(l.from), inlineSize: Math.max(4, x(l.to) - x(l.from) - 1) }}>
                    <span className="sr-only">{fmtClock(l.from)}–{fmtClock(l.to)}: </span><span className="tl-line-text" dir="auto" lang={l.lang}>{l.text}</span>
                  </div>
                ))}
              </div>
            )}
            {music && (
              <div className="tl-track" data-track="music">
                <Waveform src={music.src} progress={duration ? time / duration : 0} onSeek={(f) => onSeek(f * duration)} height={36} showLabel={false} duration={duration} label={music.label ?? T('media.tl.music')} unavailableText={T('media.wave.unavailable')} />
              </div>
            )}
            <span className="tl-playhead" style={{ insetInlineStart: x(time) }} aria-hidden />
          </div>
        </div>
      </div>
    </div>
  );
}
