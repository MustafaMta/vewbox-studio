'use client';

import type { ReactNode } from 'react';
import type { ArtVars, Presentation } from '@/domain/presentation';
import { cls } from '@/components/ui/kit';
import { PreviewPlayer } from '@/components/players/PreviewPlayer';
import { artStyle, dimsLight, objectPosition, type Picture } from '../art';
import { Frame } from '../Frame';
import { HeroText, type HeroTextProps } from './HeroText';

/** THE SIX HEROES (docs/DESIGN-SYSTEM-V4.md §5.3) — no two content types share one (§1.2 principle 2).
 *
 *  Shared rules: a hero is a lobby element. The four allowed ones (Backdrop, Diptych, Sleeve, Plate) take `art` (B1's
 *  `artVars(asset)`) on their root and the wash paints from the hero's top into `--page`; the Figure hero takes only
 *  `--art-edge` (no tint: the figure is under approval) and the Theatre hero takes nothing. With no art and no
 *  presentation every hero is neutral (tests/unit/media-heroes.test.ts). Layers, bottom to top: wash · picture (focal
 *  crop, `--art-ph` while loading) · scrims, only where text sits on the picture · text · controls.
 *  On a phone the picture comes first with nothing over it and the text follows on the page. The picture's alt is
 *  built from data by the page ("Key art for The Kite"); the wash and scrims are hidden from assistive technology. */

type Base = Omit<HeroTextProps, 'onArt' | 'titleSize' | 'children'> & { art?: ArtVars | null; presentation?: Presentation | null; className?: string };
const WASH = ['--art', '--art-ph', '--art-edge'] as const;

/** Show page: full-bleed key art, a 21:9 focal crop at ≥ 1280 (height 420–640), 16:9 below; the text bottom-start over
 *  the scrims; an optional muted preview replaces the still after 2 s (PreviewPlayer). */
export function BackdropHero({ picture, alt, preview, onWatchWithSound, extra, ...t }: Base & { picture?: Picture | null; alt: string; preview?: { src: string } | null; onWatchWithSound?: () => void; extra?: ReactNode }) {
  const pres = t.presentation ?? picture?.presentation ?? null;
  const has = Boolean(picture?.src && !picture.unavailable);
  return (
    <header className={cls('hero mhero mhero-backdrop', !has && 'mhero-nopic', t.className)} data-hero="backdrop" style={artStyle(t.art, WASH)}>
      {has && (
        <div className="mhero-pic">
          {preview ? <PreviewPlayer src={preview.src} still={picture!.src} alt={alt} presentation={pres} onWatchWithSound={onWatchWithSound} />
            // eslint-disable-next-line @next/next/no-img-element
            : <img className="mhero-img" src={picture!.src} alt={alt} fetchPriority="high" data-light={dimsLight(pres) || undefined} style={{ objectPosition: objectPosition(pres) }} />}
          <span className="mhero-scrim mhero-scrim-bottom" aria-hidden />
          <span className="mhero-scrim mhero-scrim-start" aria-hidden />
        </div>
      )}
      <HeroText {...t} titleSize="hero" onArt={has}>{extra}</HeroText>
    </header>
  );
}

/** Short Overview (and the Episode Overview without a poster, `poster={null}`): the slate and title above; the 2:3
 *  poster at 240 (a title card when there is none) beside the PLAYER SLOT at 16:9 — the cut, else the storyboard reel,
 *  else the frame grid; the film strip under the player; then the lead and the actions. No full-bleed image: the player
 *  is the picture. The wash comes from the poster. */
export function DiptychHero({ poster, posterAlt, player, strip, extra, ...t }: Base & { poster?: Picture | null; posterAlt?: string; player: ReactNode; strip?: ReactNode; extra?: ReactNode }) {
  const episode = poster === null;
  const { lead, actions, statusStrip, ...head } = t;
  return (
    <header className={cls('hero mhero mhero-diptych', t.className)} data-hero="diptych" data-variant={episode ? 'episode' : 'short'} style={artStyle(t.art, WASH)}>
      <div className="mhero-d-head"><HeroText {...head} titleSize={episode ? 'hero-sm' : 'hero'} /></div>
      {!episode && (
        <div className="mhero-d-poster">
          <Frame asset={poster} ratio="2/3" alt={posterAlt ?? ''} title={t.title} titleLang={t.titleLang} titleState="noPoster" presentation={t.presentation} />
        </div>
      )}
      <div className="mhero-d-player">{player}</div>
      {strip && <div className="mhero-d-strip">{strip}</div>}
      <div className="mhero-d-foot"><HeroText title="" lead={lead} leadLang={t.leadLang} actions={actions} statusStrip={statusStrip} className="mhero-text-foot" headingLevel={t.headingLevel}>{extra}</HeroText></div>
    </header>
  );
}

/** Music video page: the 1:1 sleeve at 280 (220 on a tablet; full width up to 320 on a phone) and beside it the slate,
 *  the song title (`.t-hero-sm`), the performers row (28 px faces), then the SongTransport whose 56 px ivory disc is
 *  the hero's primary. The wash comes from the sleeve. */
export function SleeveHero({ sleeve, sleeveAlt, performers, transport, extra, ...t }: Base & { sleeve?: Picture | null; sleeveAlt: string; performers?: ReactNode; transport?: ReactNode; extra?: ReactNode }) {
  return (
    <header className={cls('hero mhero mhero-sleeve', t.className)} data-hero="sleeve" style={artStyle(t.art, WASH)}>
      <div className="mhero-sleeve-art"><Frame asset={sleeve} ratio="1/1" alt={sleeveAlt} title={t.title} titleLang={t.titleLang} titleState="noSleeve" presentation={t.presentation} priority /></div>
      <HeroText {...t} titleSize="hero-sm">
        {performers && <div className="mhero-performers">{performers}</div>}
        {transport && <div className="mhero-transport">{transport}</div>}
        {extra}
      </HeroText>
    </header>
  );
}

/** Character profile: the figure at 928:1664 on `--art-edge`, 40 % of the content width (max 440), sticky 24 px from the
 *  top when the viewport is at least 820 px tall (the actions are beside it, never under it). Beside it: the slate, the
 *  name, the second-language name, the description, the voice reel, the actions, the anchor navigation and the
 *  sections (`children`). NO TINT. A draft is judged on its true pixels (`judge`: no light-backdrop filter). */
export function FigureHero({ figure, figureAlt, state, phase, judge, voice, nav, children, ...t }: Base & { figure?: Picture | null; figureAlt: string; state?: 'ready' | 'drawing' | 'missing' | 'unavailable'; phase?: ReactNode; judge?: boolean; voice?: ReactNode; nav?: ReactNode; children?: ReactNode }) {
  const { actions, statusStrip, ...rest } = t;
  return (
    <div className={cls('mhero mhero-figure', t.className)} data-hero="figure" style={artStyle(t.art, ['--art-edge'])}>
      <div className="mhero-figure-col">
        <Frame asset={figure} ratio="928/1664" fit="contain" alt={figureAlt} title={t.title} titleLang={t.titleLang} titleState="noImage" state={state} phase={phase} judge={judge} presentation={t.presentation} priority className="mhero-figure-frame" />
      </div>
      <div className="mhero-figure-main">
        <HeroText {...rest} titleSize="hero-sm">
          {voice && <div className="mhero-voice">{voice}</div>}
          {actions && <div className="mhero-actions">{actions}</div>}
          {statusStrip && <div className="mhero-status">{statusStrip}</div>}
        </HeroText>
        {nav && <div className="mhero-nav">{nav}</div>}
        {children}
      </div>
    </div>
  );
}

/** Location page: the master plate at a 2.39:1 focal crop (16:9 on a phone), the full content width, radius 8, with
 *  NOTHING over it (a scouting plate stays clean). The lighting switch sits under the plate, then the slate, title and
 *  actions. Switching lighting crossfades the plates in `--t-media` (instant under reduced motion). The wash comes
 *  from the plate. */
export function PlateHero({ plates, current, lighting, extra, ...t }: Base & { plates: Array<{ key: string; picture?: Picture | null; alt: string }>; current?: string; lighting?: ReactNode; extra?: ReactNode }) {
  const on = current ?? plates[0]?.key;
  const pres = (k: { picture?: Picture | null }) => t.presentation ?? k.picture?.presentation ?? null;
  const any = plates.some((p) => p.picture?.src && !p.picture.unavailable);
  return (
    <header className={cls('hero mhero mhero-plate', t.className)} data-hero="plate" style={artStyle(t.art, WASH)}>
      <div className="mhero-plate-pic">
        {any ? plates.map((p) => p.picture?.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={p.key} src={p.picture.src} alt={p.key === on ? p.alt : ''} aria-hidden={p.key === on ? undefined : true} data-on={p.key === on || undefined}
            data-light={dimsLight(pres(p)) || undefined} style={{ objectPosition: objectPosition(pres(p)) }} />
        ) : null) : <Frame ratio="2.39/1" alt="" title={t.title} titleLang={t.titleLang} titleState="noImage" className="mhero-plate-card" style={{ aspectRatio: 'auto' }} />}
      </div>
      {lighting && <div className="mhero-plate-switch">{lighting}</div>}
      <HeroText {...t} titleSize="hero-sm">{extra}</HeroText>
    </header>
  );
}

/** Screening Room: "Now screening" (13/20 faint), the cut at its native ratio on the black surround (max 76vh; a 9:16 cut
 *  centred with black pillars), then the slate, the title (`.t-hero`) and the actions UNDER it; the notes beside it at
 *  ≥ 1440 (absent until timecoded notes exist, B2). No tint. */
export function TheatreHero({ label, player, notes, extra, ...t }: Base & { label?: ReactNode; player: ReactNode; notes?: ReactNode; extra?: ReactNode }) {
  return (
    <section className={cls('mhero mhero-theatre', t.className)} data-hero="theatre" aria-label={t.title}>
      {label && <p className="mhero-now">{label}</p>}
      <div className="mhero-theatre-main" data-notes={notes ? '' : undefined}>
        <div className="mhero-theatre-player">{player}</div>
        {notes && <aside className="mhero-theatre-notes">{notes}</aside>}
      </div>
      <HeroText {...t} titleSize="hero">{extra}</HeroText>
    </section>
  );
}
