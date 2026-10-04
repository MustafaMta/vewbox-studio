'use client';

import type { ReactNode } from 'react';
import type { Asset, Character, Location, StudioState } from '@/domain/types';
import type { Aspect } from '@/domain/vocabulary';
import { primaryImageOf } from '@/domain/identity';
import { TitleCard } from '@/components/media/TitleCard';
import { nameLang } from '@/components/home/model';
import { FigureCard, MediaTile } from '@/components/media';
import type { ContentRatio } from './model';

/** THE CREATION FLOWS' SHARED PARTS — the picker grids (the kit's FigureCard / MediaTile as toggles), the format glyph,
 *  a section card with its head, and the live preview in the content's own shape. The style choice, the stage stepper
 *  and the disclosure card are the kit's (StylePicker, StageSteps, DisclosureCard). Layout lives in
 *  src/app/styles/pages/create.css; colours, radii and type are the kit's tokens and roles. */

// ------------------------------------------------------------------------------------------------- a section

export function Panel({ id, title, description, end, children, className }: { id: string; title: ReactNode; description?: ReactNode; end?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card create-panel${className ? ` ${className}` : ''}`} aria-labelledby={id}>
      <div className="create-panel-head">
        <div className="create-panel-words">
          <h2 id={id} className="t-title">{title}</h2>
          {description && <p className="t-body">{description}</p>}
        </div>
        {end}
      </div>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------- picker tiles

export interface PickItem { id: string; name: string; sub?: string; asset?: Asset; /** in the show already: chosen and fixed, with the reason */ locked?: string }

/** A grid of the kit's picker cards (several at once): characters as FigureCards (the whole canonical figure), places
 *  as MediaTiles (the master plate); each a toggle button named by its object, chosen with the outline and the check. */
export function PickGrid({ items, selected, onToggle, shape, label }: { items: PickItem[]; selected: readonly string[]; onToggle: (id: string) => void; shape: 'figure' | 'plate'; label: string }) {
  return (
    <ul className="create-picks" data-shape={shape} role="list" aria-label={label}>
      {items.map((it) => {
        const on = selected.includes(it.id) || Boolean(it.locked);
        const lang = nameLang(it.name);
        return (
          <li key={it.id}>
            {shape === 'figure'
              ? <FigureCard name={it.name} nameLang={lang} asset={it.asset} selected={on} disabledReason={it.locked} onSelect={() => onToggle(it.id)} badge={it.sub ? <span className="t-meta">{it.sub}</span> : undefined} />
              : <MediaTile title={it.name} titleLang={lang} asset={it.asset} ratio="16/9" selected={on} onSelect={it.locked ? undefined : () => onToggle(it.id)} meta={[it.locked ?? it.sub]} />}
          </li>
        );
      })}
    </ul>
  );
}

const assetOf = (s: Pick<StudioState, 'assets'>, id?: string | null): Asset | undefined => (id ? s.assets.find((a) => a.id === id) : undefined);
const usable = (a: Asset | undefined): a is Asset => Boolean(a && a.kind === 'IMAGE' && !a.unavailable);

/** A character's one canonical figure, when it has a usable one. */
export const figureOf = (s: Pick<StudioState, 'assets'>, c: Pick<Character, 'canonicalImage' | 'portraitAssetId'>): Asset | undefined => { const a = assetOf(s, primaryImageOf(c as Character)); return usable(a) ? a : undefined; };
/** A location's master plate, when it has a usable one. */
export const plateOf = (s: Pick<StudioState, 'assets'>, l: Pick<Location, 'masterAssetId'>): Asset | undefined => { const a = assetOf(s, l.masterAssetId); return usable(a) ? a : undefined; };

export function castItems(s: StudioState, locked?: (c: Character) => string | undefined): PickItem[] {
  return s.characters.map((c) => ({ id: c.id, name: c.name, asset: figureOf(s, c), locked: locked?.(c) }));
}
export function placeItems(s: StudioState, locked?: (l: Location) => string | undefined): PickItem[] {
  return s.locations.map((l) => ({ id: l.id, name: l.name, sub: l.kind === 'INTERIOR' ? 'Interior' : 'Exterior', asset: plateOf(s, l), locked: locked?.(l) }));
}
// ------------------------------------------------------------------------------------------------- style

/** The style choice is the kit's (src/components/media/StylePicker.tsx, on PicturePicker). */
export { StylePicker } from '@/components/media/StylePicker';

/** The format's own shape at 14 px (decorative). */
export function AspectGlyph({ a }: { a: Aspect }) {
  const [w, h] = a === 'WIDE_16_9' ? [16, 9] : a === 'VERTICAL_9_16' ? [8, 14] : a === 'SQUARE_1_1' ? [12, 12] : [18, 7.5];
  return <span aria-hidden className="create-aspect" style={{ inlineSize: w, blockSize: h }} />;
}

// ------------------------------------------------------------------------------------------------- preview

/** The thing being made, as it will first appear: a title card in its own shape with the name typed so far, and one
 *  line of facts under it. */
export function Preview({ ratio, title, placeholder, state, facts, children }: { ratio: ContentRatio; title: string; placeholder: string; state: string; facts: string[]; children?: ReactNode }) {
  const name = title.trim();
  return (
    <div className="create-preview-card">
      <p className="t-label">Preview</p>
      <div className="create-preview-frame" data-ratio={ratio}>
        <TitleCard title={name || placeholder} lang={name ? nameLang(name) : undefined} ratio={ratio} stateLabel={state} decorative size={ratio === '16/9' ? 'auto' : 'auto'} radius="media" />
      </div>
      <p className="t-card name create-preview-title"><bdi lang={name ? nameLang(name) : undefined}>{name || placeholder}</bdi></p>
      <p className="t-meta t-facts create-preview-facts">{facts.map((f) => <span key={f}>{f}</span>)}</p>
      {children}
    </div>
  );
}
