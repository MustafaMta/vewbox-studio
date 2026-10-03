'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { artVars } from '@/studio/presentation';
import { FigureCard, Frame, MediaTile } from '@/components/media';
import { StageMeter } from '@/components/media/StageMeter';
import { EmptyState, MenuButton, MenuLink } from '@/components/ui/kit';
import { IconChevronDown, IconChevronRight, IconPlus } from '@/components/ui/icons';
import type { EpisodeCardData, FigureData, PlateData, ShowCardData } from './model';

/** THE SHOWS PAGES' PARTS — thin compositions of the shared kit (SectionHead, MediaTile, FigureCard, StartCard in
 *  src/components/ui/kit and src/components/media) with the Shows pages' data, plus the one tile that is the Shows
 *  experience's own: the episode (its still, number, title, two lines of synopsis and the stage meter). */

/** The quiet link at the end of a section head (the kit's `.shead-link`) for links that open a dialog in place: it
 *  keeps the scroll position. Pass it as SectionHead's `action`. */
export function HeadLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link className="shead-link" href={href} scroll={false}>{children}<IconChevronRight aria-hidden /></Link>;
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

/** A show in the catalogue: the kit's media tile — 16:9 key art, the name, the facts with the status last. */
export function ShowTile({ c, priority }: { c: ShowCardData; priority?: boolean }) {
  return <MediaTile href={c.href} asset={c.picture?.asset} src={c.picture?.src} title={c.title} titleLang={c.lang} meta={c.meta} status={<StatusWord tone={c.status.tone}>{c.status.words}</StatusWord>} priority={priority} className="show-tile" />;
}

/** A location: the kit's media tile with its 16:9 plate, the name, interior or exterior. */
export function PlateTile({ p }: { p: PlateData }) {
  return <MediaTile href={p.href} asset={p.picture?.asset} src={p.picture?.src} title={p.name} titleLang={p.lang} meta={[p.meta]} />;
}

/** A character: the kit's figure card, the role in its state row. */
export function CastCard({ f }: { f: FigureData }) {
  return <FigureCard href={f.href} asset={f.picture?.asset} src={f.picture?.src} name={f.name} nameLang={f.lang} badge={f.role ? <span className="t-meta name"><bdi>{f.role}</bdi></span> : undefined} />;
}

/** An episode (the Shows experience's own tile, on the media tile's anatomy): its 16:9 still, "Episode 3 · 5:00", the
 *  title, two reserved lines of synopsis, the stage meter and its words. One link. */
export function EpisodeTile({ e, priority }: { e: EpisodeCardData; priority?: boolean }) {
  return (
    <Link className="ep-tile card-link" href={e.href} title={e.title}>
      <Frame asset={e.picture?.asset} src={e.picture?.src} ratio="16/9" fit="cover" alt="" art={artVars(e.picture?.asset)} title={e.title} titleLang={e.lang} titleState="notMade" number={e.number} decorative priority={priority} />
      <span className="ep-tile-words">
        <span className="t-label"><span className="num">Episode {e.number}</span>{e.runtime && <span className="count"> · {e.runtime}</span>}</span>
        <span className="t-card name"><bdi lang={e.lang}>{e.title}</bdi></span>
        <span className="t-body ep-tile-syn" dir="auto">{e.synopsis}</span>
        <span className="ep-tile-stage"><StageMeter segments={e.stage.segments} /><StatusWord tone={e.stage.tone}>{e.stage.words}</StatusWord></span>
      </span>
    </Link>
  );
}

/** One sentence and one action, in place of a section's content (§5.23). */
export function EmptyLine({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <EmptyState action={action}>{children}</EmptyState>;
}
