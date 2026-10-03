'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Asset, Character, StudioState } from '@/domain/types';
import { assetById, primaryImageOf } from '@/studio/selectors';
import { FigureCard } from '@/components/media';
import { SectionHead } from '@/components/ui/kit';
import { IconChevronLeft, IconPause, IconPlay } from '@/components/ui/icons';
import { usePlayer, useTrackState, type Track } from '@/components/players/PlayerProvider';
import { voiceTrackSource } from './identity';

/** THE CAST PAGES' PARTS — small compositions of the shared kit for the casting directory, the profile and the
 *  locations: the figure card with its voice disc, the page head, a section with the kit's section head, and data
 *  helpers. Styles in src/app/styles/pages/cast.css (layout only). */

/** The script of a content name, for `<bdi lang>` (§4.4): Arabic letters → `ar`, otherwise unknown. */
export const nameLang = (name: string | undefined): 'ar' | undefined => (name && /[؀-ۿݐ-ݿࢠ-ࣿ]/.test(name) ? 'ar' : undefined);

/** A usable picture: an image record whose file exists and that is not a bundled sample. */
export const usable = (a: Asset | undefined | null): a is Asset => Boolean(a && a.kind === 'IMAGE' && !a.unavailable && !a.sample);

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

/** The 36 px voice disc: plays the character's one voice on the shared player (never two sounds at once). Charcoal at
 *  rest, the off-white primary while it plays. It is never inside a link. (The kit's PlayDisc has no 36 size yet.) */
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

/** A character in the casting directory: the kit's FigureCard (the whole figure on its own field, the name, "Needs
 *  approval" only when waited on) with the voice disc at the end of the name row, as the card's sibling. */
export function CastCard({ c, asset, track, waiting, priority }: { c: Character; asset?: Asset; track: Track | null; waiting: boolean; priority?: boolean }) {
  return (
    <div className="pc-fig" data-voice={track ? '' : undefined}>
      <FigureCard href={`/characters/${encodeURIComponent(c.id)}`} name={c.name} nameLang={nameLang(c.name)} asset={asset} waiting={waiting} priority={priority} />
      {track && <VoiceDisc track={track} name={c.name} />}
    </div>
  );
}

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

/** A section of a page: the kit's section head 16 px above the content; sections are a section gap apart. */
export function CastSection({ id, title, count, description, action, children, className }: { id: string; title: string; count?: number; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`pc-section${className ? ` ${className}` : ''}`} aria-labelledby={`${id}-h`}>
      <SectionHead id={`${id}-h`} title={title} count={count} description={description} action={action} />
      {children}
    </section>
  );
}

/** A small head inside a card: the title and one action at its end. */
export function CardHead({ title, count, action }: { title: ReactNode; count?: number; action?: ReactNode }) {
  return (
    <div className="pc-card-head">
      <h3 className="t-title">{title}{count !== undefined && <span className="shead-count"> {count}</span>}</h3>
      {action}
    </div>
  );
}
