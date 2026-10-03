import { describe, expect, it } from 'vitest';
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BackdropHero, DiptychHero, FigureHero, PlateHero, SleeveHero, TheatreHero } from '@/components/media/hero';
import { Frame } from '@/components/media/Frame';
import { FigureCard, MediaCard, MediaTile } from '@/components/media/Cards';
import { PlayerProvider } from '@/components/players/PlayerProvider';

/** DESIGN-SYSTEM-V4 §2.4, §5.3, §8.5 F3 acceptance: "Without presentation data, every hero renders neutral (test)".
 *  Neutral means: no runtime art variable on the hero (the tokens' defaults apply: --art = --page, so the wash is the
 *  page itself), the default focal crop (50 % 40 %), and no light-backdrop filter. The positive controls prove the
 *  same markup does carry the data when it is given, and only where §2.4 allows it. */

// React 19 hoists image preloads (<link rel="preload">) in front of the markup; the hero is what follows them
const html = (el: ReactElement) => renderToStaticMarkup(h(PlayerProvider, null, el)).replace(/^(<link [^>]*>)+/, '');
const ART = { '--art': 'oklch(0.2 0.045 40)', '--art-ph': 'oklch(0.24 0.045 40)', '--art-edge': 'oklch(0.5 0 0)' } as const;
const PRES = { lightBackdrop: true, focal: { x: 0.25, y: 0.75 } };
const pic = { src: '/sample/covers/last-sip.svg' };
const text = { title: 'The Last Sip', slate: ['Show', '2026'] };

const heroes = (o: { art?: typeof ART; presentation?: typeof PRES } = {}) => ({
  backdrop: html(h(BackdropHero, { ...text, ...o, picture: pic, alt: 'Key art for The Last Sip' })),
  diptych: html(h(DiptychHero, { ...text, ...o, poster: { src: '/sample/covers/paper-boats-poster.svg' }, posterAlt: 'Poster', player: h('div', { id: 'slot' }) })),
  episode: html(h(DiptychHero, { ...text, ...o, poster: null, player: h('div', { id: 'slot' }) })),
  sleeve: html(h(SleeveHero, { ...text, ...o, sleeve: { src: '/sample/covers/river-lights-square.svg' }, sleeveAlt: 'Cover art' })),
  figure: html(h(FigureHero, { ...text, ...o, figure: { src: '/sample/characters/hana-full-body.svg' }, figureAlt: 'Hana' })),
  plate: html(h(PlateHero, { ...text, ...o, plates: [{ key: 'day', picture: { src: '/sample/locations/cafe.svg' }, alt: 'Café' }] })),
  theatre: html(h(TheatreHero, { ...text, ...o, player: h('div', { id: 'slot' }) })),
});
const rootStyle = (markup: string) => /^<[a-z]+[^>]*?style="([^"]*)"/.exec(markup)?.[1] ?? '';

describe('every hero renders neutral without presentation data', () => {
  const all = heroes();
  for (const [name, m] of Object.entries(all)) {
    it(`${name}: no art variable, the default focal crop, no light filter`, () => {
      expect(m).not.toMatch(/--art(-ph|-edge)?:/);
      expect(m).not.toContain('data-light');
      for (const pos of m.matchAll(/object-position:([^;"]+)/g)) expect(pos[1].trim()).toBe('50% 40%');
    });
  }
  it('the wash of a neutral hero is the page: the hero class is there, its --art is not', () => {
    expect(all.backdrop).toMatch(/^<header class="hero mhero mhero-backdrop/);
    expect(rootStyle(all.backdrop)).toBe('');
  });
});

describe('with presentation data, only the heroes §2.4 allows take the tint', () => {
  const all = heroes({ art: ART, presentation: PRES });
  it('Backdrop, Diptych, Sleeve and Plate carry --art on their root', () => {
    for (const k of ['backdrop', 'diptych', 'sleeve', 'plate'] as const) expect(rootStyle(all[k]), k).toContain('--art:oklch(0.2 0.045 40)');
  });
  it('the Figure hero takes only --art-edge (the figure is under approval: no tint)', () => {
    expect(rootStyle(all.figure)).toContain('--art-edge:oklch(0.5 0 0)');
    expect(rootStyle(all.figure)).not.toMatch(/--art:|--art-ph:/);
    expect(all.figure).not.toMatch(/class="hero /);
  });
  it('the Theatre hero takes nothing', () => {
    expect(all.theatre).not.toMatch(/--art/);
  });
  it('the focal point drives the crop and a light backdrop is dimmed in the lobby', () => {
    expect(all.backdrop).toContain('object-position:25% 75%');
    expect(all.backdrop).toContain('data-light="true"');
  });
  it('a figure judged by the producer keeps its true pixels', () => {
    const judged = html(h(FigureHero, { ...text, art: ART, presentation: PRES, judge: true, figure: { src: '/x.svg' }, figureAlt: 'x' }));
    expect(judged).not.toContain('data-light');
  });
});

describe('frames and tiles are neutral without data too', () => {
  it('a frame paints the tokens’ placeholder and letterbox when it has no data', () => {
    const m = html(h(Frame, { src: '/x.svg', alt: 'x', fit: 'contain' }));
    expect(m).not.toMatch(/--art/);
    expect(m).toContain('data-fit="contain"');
  });
  it('a frame with no picture is a title card, never an empty box', () => {
    const m = html(h(Frame, { alt: '', title: 'Night Tray', titleState: 'noKeyArt' }));
    expect(m).toContain('class="tcard');
    expect(m).toContain('Night Tray');
    expect(m).toContain('No key art yet');
  });
  it('a media tile is one link holding the frame and the name (§5.6); a media card sets its words on the picture', () => {
    const m = html(h(MediaTile, { title: 'The Last Sip', href: '/shows/last-sip', src: '/x.svg', meta: ['Show', '2 seasons'] }));
    const link = /<a [^>]*class="mtile-link"[^>]*>([\s\S]*?)<\/a>/.exec(m)?.[1] ?? '';
    expect(link).toContain('The Last Sip');
    expect(link).toContain('class="frame');
    const c = html(h(MediaCard, { title: 'Paper Boats', href: '/shorts/x', src: '/x.svg', ratio: '2/3', meta: 'Short · 2:00' }));
    expect(c).toContain('class="mcard-words"');
    expect(c).toContain('aspect-ratio:2 / 3');
  });
  it('a figure card letterboxes on its edge colour and carries no tint', () => {
    const m = html(h(FigureCard, { name: 'Hana', href: '/characters/hana', src: '/x.svg' }));
    expect(m).toContain('data-fit="contain"');
    expect(m).not.toMatch(/--art/);
  });});
