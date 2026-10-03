'use client';

import { useId, type ReactNode } from 'react';
import type { Asset, Character, Location, StudioState } from '@/domain/types';
import type { Aspect, Style } from '@/domain/vocabulary';
import { STYLES } from '@/domain/vocabulary';
import { primaryImageOf } from '@/domain/identity';
import { artVars } from '@/studio/presentation';
import { Frame } from '@/components/media/Frame';
import { TitleCard } from '@/components/media/TitleCard';
import { displaySrc, nameLang } from '@/components/home/model';
import { rovingIndex, rovingStep } from '@/components/ui/kit';
import { IconAuto, IconCheck } from '@/components/ui/icons';
import { STYLE_WORDS, type ContentRatio } from './model';

/** THE CREATION FLOWS' SHARED PARTS — the picker tiles (§5.6 "Selected (pickers)": the object in its own shape, a
 *  2 px outline at offset 3 and a check badge when chosen), the style choice with its three drawings, the format
 *  glyph, a section card with its head, and the live preview in the content's own shape. Layout lives in
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

interface PickItem { id: string; name: string; sub?: string; frame: ReactNode }

/** A grid of tiles the producer chooses from (several at once): each a toggle button named by its object. */
export function PickGrid({ items, selected, onToggle, shape, label, locked = [] }: { items: PickItem[]; selected: readonly string[]; onToggle: (id: string) => void; shape: 'figure' | 'plate'; label: string; locked?: readonly string[] }) {
  return (
    <ul className="create-picks" data-shape={shape} role="list" aria-label={label}>
      {items.map((it) => {
        const on = selected.includes(it.id) || locked.includes(it.id);
        const lock = locked.includes(it.id);
        return (
          <li key={it.id}>
            <button type="button" className="create-pick" aria-pressed={on} disabled={lock} title={it.name} onClick={() => onToggle(it.id)}>
              <span className="create-pick-frame">
                {it.frame}
                <span className="create-pick-check" aria-hidden data-on={on || undefined}>{on && <IconCheck />}</span>
              </span>
              <span className="t-card name create-pick-name"><bdi lang={nameLang(it.name)}>{it.name}</bdi></span>
              <span className="t-meta create-pick-sub">{it.sub ?? ''}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const assetOf = (s: Pick<StudioState, 'assets'>, id?: string | null): Asset | undefined => (id ? s.assets.find((a) => a.id === id) : undefined);
const usable = (a: Asset | undefined): a is Asset => Boolean(a && a.kind === 'IMAGE' && !a.unavailable);

/** A character in its one canonical full-body figure (never cropped), or its title card when it has none. */
export function figureFrame(s: Pick<StudioState, 'assets'>, c: Pick<Character, 'name' | 'canonicalImage' | 'portraitAssetId'>): ReactNode {
  const a = assetOf(s, primaryImageOf(c as Character));
  return usable(a)
    ? <Frame asset={a} src={displaySrc(a)} ratio="928/1664" fit="contain" alt="" art={artVars(a)} title={c.name} decorative radius="none" />
    : <TitleCard title={c.name} lang={nameLang(c.name)} ratio="928/1664" state="noImage" decorative radius="none" small />;
}

/** A location's master plate at 16:9, or its title card. */
export function plateFrame(s: Pick<StudioState, 'assets'>, l: Pick<Location, 'name' | 'masterAssetId'>): ReactNode {
  const a = assetOf(s, l.masterAssetId);
  return usable(a)
    ? <Frame asset={a} src={displaySrc(a)} ratio="16/9" fit="cover" alt="" art={artVars(a)} title={l.name} decorative radius="none" />
    : <TitleCard title={l.name} lang={nameLang(l.name)} ratio="16/9" state="notDrawn" decorative radius="none" small />;
}

export function castItems(s: StudioState, sub?: (c: Character) => string | undefined): PickItem[] {
  return s.characters.map((c) => ({ id: c.id, name: c.name, sub: sub ? sub(c) : undefined, frame: figureFrame(s, c) }));
}
export function placeItems(s: StudioState): PickItem[] {
  return s.locations.map((l) => ({ id: l.id, name: l.name, sub: l.kind === 'INTERIOR' ? 'Interior' : 'Exterior', frame: plateFrame(s, l) }));
}

// ------------------------------------------------------------------------------------------------- style

/** The three looks as drawings (not pictures from anywhere): one radio group, arrows move the choice. */
export function StylePicker({ value, onChange, label = 'Style', auto }: { value: Style | null; onChange: (s: Style | null) => void; label?: string; /** "Studio decides" as a fourth choice (Auto's preferences) */ auto?: string }) {
  const opts: Array<Style | null> = auto ? [null, ...STYLES] : [...STYLES];
  const labelId = useId();
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = rovingStep(e.key, { orientation: 'both' }); if (!step) return;
    const from = Math.max(0, opts.indexOf(value));
    const next = rovingIndex(step, from, opts.map(() => false)); if (next < 0) return;
    e.preventDefault(); onChange(opts[next]);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };
  return (
    <div className="create-field">
      <p id={labelId} className="label">{label}</p>
      <div role="radiogroup" aria-labelledby={labelId} className="create-picks" data-shape="style" data-count={opts.length} onKeyDown={onKey}>
        {opts.map((s) => {
          const on = value === s;
          const words = s ? STYLE_WORDS[s] : { label: auto!, hint: 'From the story' };
          return (
            <button key={s ?? 'auto'} type="button" role="radio" aria-checked={on} tabIndex={on || (value === undefined && s === opts[0]) ? 0 : -1} className="create-pick" onClick={() => onChange(s)}>
              <span className="create-pick-frame">
                {s ? <StyleDrawing style={s} /> : <span className="create-pick-auto" aria-hidden><IconAuto /></span>}
                <span className="create-pick-check" aria-hidden data-on={on || undefined}>{on && <IconCheck />}</span>
              </span>
              <span className="t-card create-pick-name">{words.label}</span>
              <span className="t-meta create-pick-sub">{words.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Three small drawings that say what a style is, without a picture from anywhere (decorative). */
export function StyleDrawing({ style }: { style: Style }) {
  if (style === 'CARTOON') return <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" className="create-drawing" aria-hidden><rect width="160" height="90" fill="#e8c46a" /><circle cx="52" cy="46" r="24" fill="#d9573b" /><rect x="88" y="26" width="46" height="40" rx="8" fill="#2f6fb5" /><path d="M0 74 Q40 58 80 74 T160 74 V90 H0Z" fill="#3f8a5a" /></svg>;
  if (style === 'ANIME') return <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" className="create-drawing" aria-hidden><defs><linearGradient id="create-an" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c9b8e8" /><stop offset="1" stopColor="#7a5aa6" /></linearGradient></defs><rect width="160" height="90" fill="url(#create-an)" /><circle cx="118" cy="26" r="12" fill="#fff6d6" /><path d="M0 90 L30 44 L52 70 L78 30 L110 68 L130 52 L160 90 Z" fill="#2b2140" /><path d="M0 90 L30 44 L52 70 L78 30" fill="none" stroke="#f3eefc" strokeWidth="1.2" /></svg>;
  return <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" className="create-drawing" aria-hidden><defs><linearGradient id="create-re" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stopColor="#5f7ea0" /><stop offset="1" stopColor="#1a1712" /></linearGradient><radialGradient id="create-rg" cx="0.7" cy="0.3" r="0.6"><stop offset="0" stopColor="#f2d59a" stopOpacity="0.9" /><stop offset="1" stopColor="#f2d59a" stopOpacity="0" /></radialGradient></defs><rect width="160" height="90" fill="url(#create-re)" /><rect width="160" height="90" fill="url(#create-rg)" /><ellipse cx="60" cy="64" rx="14" ry="26" fill="#14110d" opacity="0.9" /><rect y="80" width="160" height="10" fill="#0c0a08" /></svg>;
}

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
