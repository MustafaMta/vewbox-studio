'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { artVars } from '@/studio/presentation';
import { Frame } from '@/components/media/Frame';
import { StageMeter } from '@/components/media/StageMeter';
import { MenuButton, MenuLink } from '@/components/ui/kit';
import { IconChevronDown, IconChevronRight, IconPlus } from '@/components/ui/icons';
import type { EpisodeCardData, FigureData, PlateData, ShowCardData } from './model';

/** THE SHOWS PAGES' PARTS — the tiles and heads every Shows page composes.
 *
 *  TEMPORARY (until the Design System Engineer's SectionHead, MediaCard and StartCard land in the kit): the section
 *  head, the start card and the figure card draw with Home's classes (src/app/styles/pages/home.css), the approved
 *  reference, so these pages share Home's exact sizes without a second styling system. When the kit components merge,
 *  these wrappers become thin re-exports and then go. Tiles follow VISUAL-STANDARD-V5.1 §5.6: the frame (no box), then
 *  the name on one line and the meta under it; the whole tile is one link. */

export function SectionHead({ id, title, count, description, end }: { id: string; title: ReactNode; count?: number | null; description?: ReactNode; end?: ReactNode }) {
  return (
    <div className="home-shelf-head">
      <div className="home-shelf-title">
        <h2 id={id} className="t-section shows-head-h">{title}{count != null && count > 0 && <span className="shows-count t-ro t-ro-md">{count}</span>}</h2>
        {description && <p className="t-body home-shelf-desc">{description}</p>}
      </div>
      {end && <div className="home-shelf-end">{end}</div>}
    </div>
  );
}

/** One quiet link with a chevron at the end of a section head. */
export function HeadLink({ href, children, scroll }: { href: string; children: ReactNode; scroll?: boolean }) {
  return <Link className="home-link" href={href} scroll={scroll}>{children}<IconChevronRight aria-hidden /></Link>;
}

const toneClass = { done: 'status status-ok', waiting: 'status status-warn', current: 'status status-info', idle: 'status' } as const;
export function StatusWord({ tone, children }: { tone: keyof typeof toneClass; children: ReactNode }) {
  return <span className={toneClass[tone]}>{children}</span>;
}

/** The New show split button (§5.3 split): the studio proposes (Auto), or the chevron offers writing it (Manual). */
export function NewShowButton() {
  return (
    <span className="btn-split">
      <Link className="btn btn-primary" href="/new/show?mode=auto"><IconPlus aria-hidden />New show</Link>
      <MenuButton label="More ways to start a show" iconOnly icon={<IconChevronDown aria-hidden />} variant="primary" align="end">
        <MenuLink href="/new/show?mode=auto" description="One line is enough; you review the proposal">Let the studio propose</MenuLink>
        <MenuLink href="/new/show?mode=manual" description="Title, premise, cast and world by hand">Write it yourself</MenuLink>
      </MenuButton>
    </span>
  );
}

/** A show in the catalogue: 16:9 key art, the name, the facts, the status last. */
export function ShowTile({ c, priority }: { c: ShowCardData; priority?: boolean }) {
  return (
    <Link className="show-tile" href={c.href} title={c.title}>
      <Frame asset={c.picture?.asset} src={c.picture?.src} ratio="16/9" fit="cover" alt="" art={artVars(c.picture?.asset)} title={c.title} titleLang={c.lang} titleState="noKeyArt" decorative priority={priority} />
      <span className="show-tile-words">
        <span className="t-card name"><bdi lang={c.lang}>{c.title}</bdi></span>
        <span className="t-meta show-tile-meta">{c.meta || 'Show'}</span>
        <StatusWord tone={c.status.tone}>{c.status.words}</StatusWord>
      </span>
    </Link>
  );
}

/** An episode: its 16:9 still, "Episode 3 · 5:00", the title, two lines of synopsis, the stage meter and its words. */
export function EpisodeTile({ e, priority }: { e: EpisodeCardData; priority?: boolean }) {
  return (
    <Link className="show-tile ep-tile" href={e.href} title={e.title}>
      <Frame asset={e.picture?.asset} src={e.picture?.src} ratio="16/9" fit="cover" alt="" art={artVars(e.picture?.asset)} title={e.title} titleLang={e.lang} titleState="notMade" number={e.number} decorative priority={priority} />
      <span className="show-tile-words">
        <span className="t-label show-tile-kind"><span className="num">Episode {e.number}</span>{e.runtime && <span className="count"> · {e.runtime}</span>}</span>
        <span className="t-card name"><bdi lang={e.lang}>{e.title}</bdi></span>
        <span className="t-body show-tile-syn" dir="auto">{e.synopsis}</span>
        <span className="show-tile-stage"><StageMeter segments={e.stage.segments} /><StatusWord tone={e.stage.tone}>{e.stage.words}</StatusWord></span>
      </span>
    </Link>
  );
}

/** The last tile of a grid: start a new one, in the grid's own 16:9 shape (Home's start card). */
export function StartTile({ href, title, line, scroll = false }: { href: string; title: string; line: string; scroll?: boolean }) {
  return (
    <Link className="home-start show-start" href={href} scroll={scroll}>
      <span className="home-hero-corners" aria-hidden />
      <span className="home-figure-plus" aria-hidden><IconPlus /></span>
      <span className="home-start-words"><span className="home-tool-title">{title}</span><span className="home-tool-line">{line}</span></span>
    </Link>
  );
}

/** A character: the whole canonical figure on its own field, the name on the start edge, the role under it. */
export function FigureCard({ f }: { f: FigureData }) {
  return (
    <Link className="home-figure" href={f.href} title={f.name}>
      <Frame asset={f.picture?.asset} src={f.picture?.src} ratio="928/1664" fit="contain" alt="" art={artVars(f.picture?.asset)} title={f.name} titleLang={f.lang} titleState="noImage" decorative className="home-figure-frame" />
      <span className="t-card name home-figure-name"><bdi lang={f.lang}>{f.name}</bdi></span>
      <span className="t-meta name show-figure-role"><bdi>{f.role || ' '}</bdi></span>
    </Link>
  );
}

/** A location: its 16:9 plate, the name, interior or exterior. */
export function PlateTile({ p }: { p: PlateData }) {
  return (
    <Link className="show-tile" href={p.href} title={p.name}>
      <Frame asset={p.picture?.asset} src={p.picture?.src} ratio="16/9" fit="cover" alt="" art={artVars(p.picture?.asset)} title={p.name} titleLang={p.lang} titleState="noImage" decorative />
      <span className="show-tile-words">
        <span className="t-card name"><bdi lang={p.lang}>{p.name}</bdi></span>
        <span className="t-meta show-tile-meta">{p.meta}</span>
      </span>
    </Link>
  );
}

/** One sentence and one action, in place of a section's content (§5.23). */
export function EmptyLine({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="show-empty-line"><p className="t-body">{children}</p>{action}</div>;
}
