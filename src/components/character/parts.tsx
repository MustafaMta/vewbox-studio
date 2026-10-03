'use client';

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import type { Asset, Character, StudioState } from '@/domain/types';
import { artVars } from '@/studio/presentation';
import { assetById, primaryImageOf } from '@/studio/selectors';
import { Frame } from '@/components/media/Frame';
import { Skeleton } from '@/components/ui/kit';
import { IconChevronLeft, IconPause, IconPlay, IconPlus } from '@/components/ui/icons';
import { usePlayer, useTrackState, type Track } from '@/components/players/PlayerProvider';
import { voiceTrackSource } from './identity';

/** THE CAST PAGES' PARTS — the figure card, the start card, the media card, the section head and the 36 px voice disc,
 *  built on Home's anatomy (src/components/home/Home.tsx) for the casting directory, the profile and the locations.
 *  TEMPORARY page-local wrappers: the Design System Engineer is lifting FigureCard, StartCard, MediaCard and Shelf into
 *  the kit; these go once those land (styles in src/app/styles/pages/cast.css, `.pc-fig`, `.pc-start`,
 *  `.pc-media`, `.pc-shead`, `.pc-disc`). */

/** The script of a content name, for `<bdi lang>` (§4.4): Arabic letters → `ar`, otherwise unknown. */
export const nameLang = (name: string | undefined): 'ar' | undefined => (name && /[؀-ۿݐ-ݿࢠ-ࣿ]/.test(name) ? 'ar' : undefined);

/** A usable picture: an image record whose file exists and that is not a bundled sample. */
export const usable = (a: Asset | undefined | null): a is Asset & { unavailable?: boolean } => Boolean(a && a.kind === 'IMAGE' && !a.unavailable && !a.sample);

/** The one voice a character can be heard with right now — the identity's proof line, else the chosen sample — as a
 *  track for the shared player; null when there is no playable file. */
export function voiceTrackOf(s: StudioState, c: Character): Track | null {
  const v = voiceTrackSource(c);
  const a = assetById(s, v.assetId);
  if (!a || a.unavailable || !a.src) return null;
  return { id: `voice-${c.id}-${a.id}`, src: a.src, title: c.name, subtitle: v.text, artworkSrc: assetById(s, primaryImageOf(c))?.src, duration: a.durationSeconds };
}

/** The character's canonical figure as an asset the Frame can draw (or nothing: the title card then stands in). */
export function figureOf(s: StudioState, c: Character): Asset | undefined {
  const a = assetById(s, primaryImageOf(c));
  return usable(a) ? a : undefined;
}

// ------------------------------------------------------------------------------------------------ the voice disc

/** The 36 px voice disc: plays the character's one voice on the shared player (never two sounds at once). Charcoal at
 *  rest, the off-white primary while it plays. It is never inside a link. */
export function VoiceDisc({ track, name, className }: { track: Track; name: string; className?: string }) {
  const p = usePlayer();
  const st = useTrackState(track);
  return (
    <button type="button" className={`btn btn-icon pc-disc ${st.playing ? 'btn-primary' : 'btn-secondary'}${className ? ` ${className}` : ''}`}
      aria-label={`${st.playing ? 'Pause' : 'Play'} ${name}’s voice`} aria-pressed={st.playing} aria-busy={st.loading || undefined}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); p.toggle(track); }}>
      {st.playing ? <IconPause aria-hidden /> : <IconPlay aria-hidden />}
    </button>
  );
}

// ------------------------------------------------------------------------------------------------ the figure card

/** A character in the casting directory: the whole canonical figure on its own field (never cropped), the name on the
 *  start edge, the voice disc at the end of the name row, and "Needs approval" only when the producer is waited on. */
export function FigureCard({ c, asset, track, waiting, priority }: { c: Character; asset?: Asset; track: Track | null; waiting: boolean; priority?: boolean }) {
  const lang = nameLang(c.name);
  return (
    <article className="pc-fig" data-voice={track ? '' : undefined}>
      <Link className="pc-fig-link" href={`/characters/${encodeURIComponent(c.id)}`} title={c.name} aria-label={waiting ? `${c.name}, needs approval` : c.name}>
        <Frame asset={asset} ratio="928/1664" fit="contain" alt="" art={artVars(asset)} title={c.name} titleLang={lang} titleState="noImage" decorative priority={priority} className="pc-fig-frame" />
        <span className="pc-fig-row"><span className="t-card name pc-fig-name"><bdi lang={lang}>{c.name}</bdi></span></span>
        <span className="pc-fig-state">{waiting ? <span className="badge badge-warn">Needs approval</span> : null}</span>
      </Link>
      {track && <VoiceDisc track={track} name={c.name} />}
    </article>
  );
}

/** The start card in the content's own shape: the viewfinder corners, a plus, a title and one line. */
export function StartCard({ href, shape, title, line, className }: { href: string; shape: 'figure' | 'plate'; title: string; line?: string; className?: string }) {
  return (
    <Link className={`pc-start${className ? ` ${className}` : ''}`} href={href} data-shape={shape}>
      <span className="pc-start-corners" aria-hidden />
      <span className="pc-start-plus" aria-hidden><IconPlus /></span>
      <span className="pc-start-words"><span className="pc-start-title">{title}</span>{line && <span className="pc-start-line">{line}</span>}</span>
    </Link>
  );
}

/** A media card with its words on the picture (Home's shelf cards): the title and one meta line over the poster
 *  scrim; the whole card is one link. */
export function MediaCard({ href, asset, ratio, title, meta, position }: { href: string; asset?: Asset | null; ratio: '2/3' | '16/9'; title: string; meta?: string; position?: { x: number; y: number } }) {
  const lang = nameLang(title);
  return (
    <Link className="pc-media" href={href} title={meta ? `${title} · ${meta}` : title}>
      <Frame asset={asset} ratio={ratio} fit="cover" alt="" radius="none" art={artVars(asset)} focal={position} title={title} titleLang={lang} titleState={ratio === '2/3' ? 'noPoster' : 'notMade'} decorative
        style={{ aspectRatio: ratio.replace('/', ' / ') } as CSSProperties}>
        <span className="pc-media-words">
          <span className="pc-media-title name"><bdi lang={lang}>{title}</bdi></span>
          {meta && <span className="pc-media-meta">{meta}</span>}
        </span>
      </Frame>
    </Link>
  );
}

// ------------------------------------------------------------------------------------------------ heads

/** The page head of a catalogue or a detail page: the `.t-page` title with its count, one description line, and the
 *  actions at the end of the row (the primary last). */
export function PageHead({ title, count, description, actions, back, titleLang }: { title: ReactNode; count?: number; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string }; titleLang?: string }) {
  return (
    <header className="pc-head">
      <div className="pc-head-words">
        {back && <BackLink {...back} />}
        <h1 className="t-page pc-head-title" lang={titleLang}>{title}{count !== undefined && <span className="pc-head-count">{count}</span>}</h1>
        {description && <p className="t-body pc-head-desc">{description}</p>}
      </div>
      {actions && <div className="pc-head-acts">{actions}</div>}
    </header>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="pc-back"><IconChevronLeft aria-hidden />{label}</Link>;
}

/** A section of a page: the head (title, optional count and description, one action at the end) 16 px above the
 *  content; sections are a section gap apart. */
export function CastSection({ id, title, count, description, end, children, className }: { id: string; title: ReactNode; count?: number; description?: ReactNode; end?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`pc-section${className ? ` ${className}` : ''}`} aria-labelledby={`${id}-h`}>
      <div className="pc-shead">
        <div className="pc-shead-title">
          <h2 id={`${id}-h`} className="t-section">{title}{count !== undefined && <span className="pc-shead-count">{count}</span>}</h2>
          {description && <p className="t-body pc-shead-desc">{description}</p>}
        </div>
        {end && <div className="pc-shead-end">{end}</div>}
      </div>
      {children}
    </section>
  );
}

/** The figure card's skeleton: the frame at 928:1664, a name bar in the 36 px name row, the state row reserved. */
export function FigureCardSkeleton() {
  return (
    <span className="pc-fig">
      <Skeleton.Media ratio="928/1664" className="pc-fig-frame" />
      <span className="pc-fig-row"><span className="pc-fig-name"><Skeleton.Line width="60%" /></span></span>
      <span className="pc-fig-state" />
    </span>
  );
}
