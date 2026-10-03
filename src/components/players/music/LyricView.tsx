'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { T } from '@/lib/copy';
import { cls } from '@/components/ui/kit';
import { IconMinus, IconPlus } from '@/components/ui/icons';
import { FaceCircle } from '@/components/media/FaceCircle';
import type { Picture } from '@/components/media/art';
import { prefersReducedMotion } from '../prefs';

/** THE LYRIC VIEW (docs/DESIGN-SYSTEM-V4.md §5.13) — a column at most 40ch in `.lyric`: the active line ivory 600,
 *  upcoming lines muted, past lines faint; no blur, no scale. Section labels sit between groups as captions. Each line
 *  takes its own direction and language, so Arabic lines align right and English lines left in either interface; the
 *  singer's 24 px face sits at the line's own start. A listbox: clicking a line seeks, ↑/↓ move, Enter seeks.
 *  Auto-scroll keeps the active line at 35 % from the top; if the producer scrolled in the last 3 s it stops and a
 *  "Back to the playhead" chip appears. Edit mode (Song & Lyrics): the text is editable, the singer is chosen per line
 *  from a menu (never by drag, 2.5.7), and timing has ±0.1 s nudges plus a numeric field. */

export interface LyricLine { id: string; text: string; lang?: string; from: number; to?: number; section?: string; singer?: { id?: string; name: string; lang?: string; asset?: Picture | null; src?: string | null } | null }
export interface LyricEdit { singers: Array<{ id: string; name: string }>; onChange: (id: string, patch: { text?: string; from?: number; singerId?: string | null }) => void }

/** The line being sung at `time`: the last line that has started and not ended. */
export function activeLine(lines: LyricLine[], time: number): number {
  let a = -1;
  lines.forEach((l, i) => { if (time >= l.from && (l.to === undefined || time < l.to)) a = i; });
  return a;
}

/** Consecutive lines of one section, in order. */
function groupsOf(lines: LyricLine[]) {
  const out: Array<{ section?: string; items: Array<{ l: LyricLine; i: number }> }> = [];
  lines.forEach((l, i) => { const g = out[out.length - 1]; if (g && g.section === l.section) g.items.push({ l, i }); else out.push({ section: l.section, items: [{ l, i }] }); });
  return out;
}

export function LyricView({ lines, time, onSeek, edit, className, height = 360 }: { lines: LyricLine[]; time: number; onSeek?: (t: number) => void; edit?: LyricEdit; className?: string; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [focusI, setFocusI] = useState(0);
  const [detached, setDetached] = useState(false);
  const userAt = useRef(0);
  const ourAt = useRef(0);
  const active = activeLine(lines, time);

  const toActive = useCallback((force = false) => {
    const el = box.current; if (!el || active < 0) return;
    const line = el.querySelector<HTMLElement>(`[data-i="${active}"]`); if (!line) return;
    if (!force && Date.now() - userAt.current < 3000) { setDetached(true); return; }
    ourAt.current = Date.now();
    const top = line.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - el.clientHeight * 0.35;
    el.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    setDetached(false);
  }, [active]);
  useEffect(() => { if (!edit) toActive(); }, [active, edit, toActive]);
  const onScroll = () => { if (Date.now() - ourAt.current > 800) userAt.current = Date.now(); };

  const onKey = (e: React.KeyboardEvent) => {
    if (edit) return;
    const n = e.key === 'ArrowDown' ? focusI + 1 : e.key === 'ArrowUp' ? focusI - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? lines.length - 1 : null;
    if (n !== null) {
      e.preventDefault();
      const i = Math.max(0, Math.min(lines.length - 1, n)); setFocusI(i);
      box.current?.querySelector<HTMLElement>(`[data-i="${i}"]`)?.focus();
    } else if ((e.key === 'Enter' || e.key === ' ') && onSeek && lines[focusI]) { e.preventDefault(); onSeek(lines[focusI].from); }
  };

  const line = (l: LyricLine, i: number) => {
    const state = i === active ? 'active' : active >= 0 && i < active ? 'past' : 'upcoming';
    const face = l.singer ? <FaceCircle name={l.singer.name} asset={l.singer.asset} src={l.singer.src} size={24} decorative ring={state === 'active' ? 'speaking' : undefined} /> : null;
    if (edit) return (
      <div key={l.id} role="listitem" className="lyric-edit" data-i={i}>
        <input className="input lyric-edit-text" dir="auto" lang={l.lang} value={l.text} aria-label={T.f('media.lyrics.text', { n: i + 1 })} onChange={(e) => edit.onChange(l.id, { text: e.target.value })} />
        <div className="lyric-edit-row">
          <select className="select lyric-edit-singer" aria-label={T.f('media.lyrics.singer', { n: i + 1 })} value={l.singer?.id ?? ''} onChange={(e) => edit.onChange(l.id, { singerId: e.target.value || null })}>
            <option value="">{T('media.lyrics.noSinger')}</option>
            {edit.singers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <span className="lyric-edit-time" dir="ltr">
            <button type="button" className="ebtn ebtn-icon" aria-label={`${T('media.lyrics.earlier')} · ${T.f('media.lyrics.line', { n: i + 1 })}`} onClick={() => edit.onChange(l.id, { from: Math.max(0, +(l.from - 0.1).toFixed(2)) })}><IconMinus aria-hidden /></button>
            <input className="input lyric-edit-num mono" type="number" step={0.1} min={0} value={l.from} aria-label={`${T('media.lyrics.start')} · ${T.f('media.lyrics.line', { n: i + 1 })}`} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) edit.onChange(l.id, { from: v }); }} />
            <button type="button" className="ebtn ebtn-icon" aria-label={`${T('media.lyrics.later')} · ${T.f('media.lyrics.line', { n: i + 1 })}`} onClick={() => edit.onChange(l.id, { from: +(l.from + 0.1).toFixed(2) })}><IconPlus aria-hidden /></button>
          </span>
        </div>
      </div>
    );
    return (
      <div key={l.id} role="option" aria-selected={state === 'active'} tabIndex={i === focusI ? 0 : -1} data-i={i} data-state={state} className="lyric lyric-line" dir="auto" lang={l.lang}
        onClick={() => { setFocusI(i); onSeek?.(l.from); }} onFocus={() => setFocusI(i)}>
        {face}<span className="lyric-text">{l.text}</span>
      </div>
    );
  };

  return (
    <div className={cls('lyrics', className)} data-edit={edit ? '' : undefined}>
      <div ref={box} className="lyrics-scroll" style={{ maxBlockSize: height }} onScroll={onScroll} onWheel={() => { userAt.current = Date.now(); }} onTouchMove={() => { userAt.current = Date.now(); }}
        role={edit ? 'list' : 'listbox'} aria-label={T('media.lyrics.label')} onKeyDown={onKey}>
        {groupsOf(lines).map((g, k) => g.section ? (
          <div key={k} role={edit ? 'listitem' : 'group'} aria-label={g.section} className="lyrics-group">
            <p className="lyrics-section caption" aria-hidden dir="auto">{g.section}</p>
            {edit ? <div role="list">{g.items.map(({ l, i }) => line(l, i))}</div> : g.items.map(({ l, i }) => line(l, i))}
          </div>
        ) : g.items.map(({ l, i }) => line(l, i)))}
      </div>
      {detached && !edit && <button type="button" className="btn btn-secondary btn-sm lyrics-back" onClick={() => { userAt.current = 0; toActive(true); }}>{T('media.lyrics.back')}</button>}
    </div>
  );
}
