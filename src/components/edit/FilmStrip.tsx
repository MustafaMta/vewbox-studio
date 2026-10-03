'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { T } from '@/lib/copy';
import { cls } from '@/components/ui/kit';
import { prefersReducedMotion } from '@/components/players/prefs';

/** THE FILM STRIP (docs/DESIGN-SYSTEM-V4.md §5.12) — every shot's frame at the production aspect, in shot order.
 *  Lobby: 72 px tall, 4 px gaps, radius 8. Cutting room: 64 px, 1 px gaps, the 2 px precision radius, on the canvas.
 *  The current shot has a 2 px ivory outline. A missing frame is an outlined field frame with the shot number in
 *  `.tc`. Click: in the lobby it seeks the cut (`onSelect`) or opens the shot (`hrefFor`) when there is no cut; in the
 *  cutting room it selects. Keyboard: one Tab stop, roving ←/→ and Home/End. ALWAYS LEFT TO RIGHT: it is time. */

export interface StripFrame { id: string; number: number; src?: string | null; label?: string }

export function FilmStrip({ frames, variant = 'lobby', aspect = '16/9', current, onSelect, hrefFor, label, className }: { frames: StripFrame[]; variant?: 'lobby' | 'cutting'; aspect?: '16/9' | '9/16' | '1/1'; current?: string; onSelect?: (f: StripFrame, i: number) => void; hrefFor?: (f: StripFrame) => string; label?: string; className?: string }) {
  const list = useRef<HTMLUListElement>(null);
  const cur = Math.max(0, frames.findIndex((f) => f.id === current));
  // keep the current shot in view (a reel or a cut moving through the shots)
  useEffect(() => {
    const ul = list.current; if (!ul || !current) return;
    const li = ul.children[cur] as HTMLElement | undefined;
    if (!li) return;
    const l = li.offsetLeft, r = l + li.offsetWidth;
    if (l < ul.scrollLeft || r > ul.scrollLeft + ul.clientWidth) ul.scrollTo({ left: l - ul.clientWidth / 3, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [cur, current]);
  const onKey = (e: React.KeyboardEvent<HTMLUListElement>) => {
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-strip-item]'));
    const i = items.indexOf(document.activeElement as HTMLElement);
    const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : null;
    if (n === null || i < 0) return;
    e.preventDefault();
    const t = items[Math.max(0, Math.min(items.length - 1, n))];
    items.forEach((x) => x.setAttribute('tabindex', x === t ? '0' : '-1'));
    t.focus(); t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  return (
    <div className={cls('fstrip', className)} data-variant={variant} data-aspect={aspect} dir="ltr">
      <ul ref={list} className="fstrip-list" aria-label={label ?? T('media.strip.label')} onKeyDown={onKey}>
        {frames.map((f, i) => {
          const name = f.src ? `${T.f('media.shot', { n: f.number })}${f.label ? `: ${f.label}` : ''}` : T.f('media.strip.noFrame', { n: f.number });
          const inner = f.src
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={f.src} alt="" loading="lazy" decoding="async" />
            : <span className="fstrip-missing tc" aria-hidden>{f.number}</span>;
          const common = { 'data-strip-item': '', tabIndex: i === cur ? 0 : -1, className: 'fstrip-item', 'aria-current': i === cur && current ? ('true' as const) : undefined, 'aria-label': name, 'data-missing': f.src ? undefined : '' };
          return (
            <li key={f.id}>
              {onSelect ? <button type="button" {...common} onClick={() => onSelect(f, i)}>{inner}</button>
                : hrefFor ? <Link href={hrefFor(f)} {...common}>{inner}</Link>
                : <span className="fstrip-item" role="img" aria-label={name} aria-current={common['aria-current']} data-missing={common['data-missing']}>{inner}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
