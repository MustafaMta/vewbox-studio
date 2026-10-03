'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { T } from '@/lib/copy';
import { cls } from '@/components/ui/kit';
import { IconChevronDown, IconChevronRight, IconPlay } from '@/components/ui/icons';
import type { Picture } from './art';
import { Frame } from './Frame';
import { Slate } from './Slate';
import { StageMeter, type StageSegment } from './StageMeter';
import { StillCard } from './tiles';

/** EPISODE PRIMITIVES (docs/DESIGN-SYSTEM-V4.md §5.7), composed by the Show page (P1a).
 *  EpisodeCard — a StillCard whose frame is the chosen take's first frame or the first shot's opening frame; with
 *  neither, a title card with the episode number. Kind label "Episode 3", the title, two lines of synopsis, then the
 *  slate with the StageMeter beside the stage words (the meter is decorative; the words carry the state).
 *  EpisodeRow — the list view (the phone default), 104 px: number · still · title, one line of synopsis and the slate
 *  · runtime · chevron. The number becomes a ▶ button on hover and focus when a cut exists ("Play Episode 3").
 *  SeasonPicker — the section heading is the button ("Season 1 ⌄"); a menu of seasons with their episode counts, a
 *  divider, then "New season" (Let the studio propose · Write it yourself). The page keeps the choice in the URL. */

export interface EpisodeData {
  number: number;
  title: string;
  titleLang?: string;
  href: string;
  asset?: Picture | null;
  src?: string | null;
  synopsis?: ReactNode;
  /** "6 min" */
  runtime?: string;
  /** "7:12", on the frame when a cut exists */
  duration?: string;
  segments: StageSegment[];
  /** the stage words, a StateWord ("Storyboard · 12 of 20 frames") */
  status: ReactNode;
  menu?: ReactNode;
}

export function EpisodeCard({ e }: { e: EpisodeData }) {
  return (
    <StillCard title={e.title} titleLang={e.titleLang} href={e.href} asset={e.asset} src={e.src} number={e.number} titleState="notMade"
      kindLabel={T.f('media.episode', { n: e.number })} synopsis={e.synopsis} duration={e.duration} menu={e.menu}
      slate={[e.runtime]} status={<span className="ep-state"><StageMeter segments={e.segments} />{e.status}</span>} />
  );
}

export function EpisodeRow({ e, onPlay }: { e: EpisodeData; onPlay?: () => void }) {
  const label = T.f('media.episode', { n: e.number });
  return (
    <div className="ep-row" data-playable={onPlay ? '' : undefined}>
      {onPlay ? (
        <button type="button" className="ep-num" aria-label={T.f('media.episode.play', { n: e.number })} onClick={onPlay}>
          <span className="ep-num-n num" aria-hidden>{e.number}</span><IconPlay aria-hidden className="ep-num-play" />
        </button>
      ) : <span className="ep-num num" aria-hidden>{e.number}</span>}
      <Link href={e.href} className="ep-link">
        <span className="ep-still"><Frame asset={e.asset} src={e.src} ratio="16/9" alt="" decorative title={e.title} titleLang={e.titleLang} number={e.number} titleState="notMade" /></span>
        <span className="ep-text">
          <span className="sr-only">{label}: </span>
          <span className="ep-title h3" dir="auto" lang={e.titleLang}>{e.title}</span>
          {e.synopsis && <span className="ep-syn" dir="auto">{e.synopsis}</span>}
          <Slate size="tile" items={[]} status={<span className="ep-state"><StageMeter segments={e.segments} />{e.status}</span>} />
        </span>
        {e.runtime && <span className="ep-runtime num">{e.runtime}</span>}
        <IconChevronRight aria-hidden className="ep-chev rtl:rotate-180" />
      </Link>
      {e.menu && <div className="ep-menu">{e.menu}</div>}
    </div>
  );
}

export interface SeasonOption { id: string; number: number; title?: string; episodes: number }

export function SeasonPicker({ seasons, value, onChange, count, onPropose, onWrite, className }: { seasons: SeasonOption[]; value: string; onChange: (id: string) => void; count?: ReactNode; onPropose?: () => void; onWrite?: () => void; className?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const cur = seasons.find((s) => s.id === value) ?? seasons[0];
  const items = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role^=menuitem]') ?? []);
  useEffect(() => {
    if (!open) return;
    const first = items().find((el) => el.getAttribute('aria-checked') === 'true') ?? items()[0];
    first?.focus();
    const off = (ev: MouseEvent) => { if (!menu.current?.contains(ev.target as Node) && !btn.current?.contains(ev.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [open]);
  const close = (focus = true) => { setOpen(false); if (focus) btn.current?.focus(); };
  const onKey = (e: React.KeyboardEvent) => {
    const xs = items(); const i = xs.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => { e.preventDefault(); xs[(n + xs.length) % xs.length]?.focus(); };
    if (e.key === 'ArrowDown') go(i + 1); else if (e.key === 'ArrowUp') go(i - 1); else if (e.key === 'Home') go(0); else if (e.key === 'End') go(xs.length - 1);
    else if (e.key === 'Escape') { e.preventDefault(); close(); } else if (e.key === 'Tab') close(false);
  };
  const pick = (fn: () => void) => () => { fn(); close(); };
  return (
    <div className={cls('season', className)}>
      <h2 className="h2 season-h">
        <button ref={btn} type="button" className="season-btn" aria-haspopup="menu" aria-expanded={open} aria-controls={`${id}-m`} onClick={() => setOpen((o) => !o)}>
          {cur ? T.f('media.season', { n: cur.number }) : T('media.season.choose')}<IconChevronDown aria-hidden />
        </button>
        {count && <span className="season-count num">{count}</span>}
      </h2>
      {open && (
        <div ref={menu} id={`${id}-m`} role="menu" aria-label={T('media.season.choose')} className="menu season-menu" onKeyDown={onKey}>
          {seasons.map((s) => (
            <button key={s.id} type="button" role="menuitemradio" aria-checked={s.id === value} tabIndex={-1} className="menu-item" onClick={pick(() => onChange(s.id))}>
              <span className="season-item-n">{T.f('media.season', { n: s.number })}</span>
              <span className="season-item-c num">{T.p('media.season.episodes', s.episodes)}</span>
            </button>
          ))}
          {(onPropose || onWrite) && <>
            <div role="separator" className="season-sep" />
            <div role="group" aria-label={T('media.season.new')}>
              <p className="season-group caption" aria-hidden>{T('media.season.new')}</p>
              {onPropose && <button type="button" role="menuitem" tabIndex={-1} className="menu-item" onClick={pick(onPropose)}>{T('media.season.propose')}</button>}
              {onWrite && <button type="button" role="menuitem" tabIndex={-1} className="menu-item" onClick={pick(onWrite)}>{T('media.season.write')}</button>}
            </div>
          </>}
        </div>
      )}
    </div>
  );
}
