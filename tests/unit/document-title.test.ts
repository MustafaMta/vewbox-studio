import { describe, expect, it } from 'vitest';
import { documentTitle } from '@/components/shell/titles';
import { buildFixture } from '../../scripts/v4-fixture';

/** docs/DESIGN-SYSTEM-V4.md §7.3 (V4-11, WCAG 2.4.2): every route has its own English title,
 *  `<object> · <area> · Vewbox Studio`, with a non-default tab in front; a record's name is shown as written (an
 *  Arabic character name stays Arabic: it is content). On the sample studio. */

const org = { departments: [{ id: 'CASTING', name: 'Casting & Character Design' }], agents: [{ id: 'casting-director', name: 'Casting Director', department: 'CASTING' }] };
const title = (url: string) => { const u = new URL(url, 'http://studio.test'); const f = buildFixture('states'); return documentTitle({ pathname: u.pathname, search: u.searchParams, state: f.state, org }); };

const ROUTES = [
  '/shows', '/shows/last-sip', '/shows/last-sip?tab=seasons', '/shows/last-sip?tab=episodes', '/shows/last-sip?tab=characters', '/shows/last-sip?tab=locations', '/shows/last-sip?tab=settings',
  '/shows/last-sip/seasons/last-sip-s1', '/shows/last-sip/seasons/last-sip-s1/episodes/s1e1', '/shows/last-sip/seasons/last-sip-s1/episodes/s1e1?tab=storyboard', '/shows/last-sip/seasons/last-sip-s1/episodes/s1e1/shots/s1e1-1',
  '/shorts', '/shorts/night-tray', '/shorts/night-tray?tab=story', '/shorts/night-tray?tab=final', '/shorts/night-tray/shots/nt-1',
  '/music-videos', '/music-videos/river-lights', '/music-videos/river-lights?tab=song', '/music-videos/river-lights?tab=performers',
  '/characters', '/characters/new', '/characters/layla', '/characters/abu-samir', '/locations', '/locations/new', '/locations/cafe', '/assets',
  '/studio', '/studio/departments/CASTING', '/studio/agents/casting-director', '/production', '/jobs', '/screening', '/screening?p=paper-boats', '/screening?p=paper-boats&cut=2', '/settings',
  '/new', '/new/show', '/new/season', '/new/episode', '/new/short', '/new/music-video', '/library', '/projects',
];

describe('page titles (§7.3)', () => {
  it('follow the table in English', () => {
    expect(title('/shows')).toBe('Shows · Vewbox Studio');
    expect(title('/shows/last-sip')).toBe('The Last Sip · Shows · Vewbox Studio');
    expect(title('/shows/last-sip?tab=characters')).toBe('Cast · The Last Sip · Shows · Vewbox Studio');
    expect(title('/shows/last-sip/seasons/last-sip-s1/episodes/s1e1')).toBe('Episode 1: The Opening Hour · The Last Sip · Shows · Vewbox Studio');
    expect(title('/shows/last-sip/seasons/last-sip-s1/episodes/s1e1?tab=storyboard')).toBe('Storyboard · Episode 1 · The Last Sip · Shows · Vewbox Studio');
    expect(title('/shows/last-sip/seasons/last-sip-s1/episodes/s1e1/shots/s1e1-1')).toBe('Shot 1.1 · Episode 1 · The Last Sip · Shows · Vewbox Studio');
    expect(title('/shorts/paper-boats')).toBe('Paper Boats · Shorts · Vewbox Studio');
    expect(title('/characters/new')).toBe('New character · Characters · Vewbox Studio');
    expect(title('/locations/cafe')).toBe('Abu Samir’s Café · Locations · Vewbox Studio');
    expect(title('/studio/agents/casting-director')).toBe('Casting Director · Casting & Character Design · Studio Company · Vewbox Studio');
    expect(title('/screening?p=paper-boats')).toBe('Paper Boats · Screening Room · Vewbox Studio');
    expect(title('/screening?p=paper-boats&cut=2')).toBe('Cut 2 · Paper Boats · Screening Room · Vewbox Studio');
    expect(title('/new/show')).toBe('New Show · Vewbox Studio');
  });

  it('keep a record’s name in its own script: an Arabic character name is content, the rest is English', () => {
    const f = buildFixture('states');
    f.state.characters.push({ ...f.state.characters[0], id: 'abu-salam', name: 'أبو سلام' });
    expect(documentTitle({ pathname: '/characters/abu-salam', state: f.state })).toBe('أبو سلام · Characters · Vewbox Studio');
  });

  it('are distinct for every route, and never the bare studio name', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const r of ROUTES) {
      const t = title(r);
      expect(t, r).toContain(' · ');
      expect(t.replace(/[^\p{L}]/gu, ''), `${r}: English only`).toMatch(/^\p{Script=Latin}*$/u);
      if (seen.has(t)) clashes.push(`${r} = ${seen.get(t)} «${t}»`);
      seen.set(t, r);
    }
    expect(clashes).toEqual([]);
  });

  it('falls back to the area while a record is missing (a deleted show, an unknown id)', () => {
    expect(title('/shows/nope')).toBe('Shows · Vewbox Studio');
    expect(title('/characters/nope')).toBe('Characters · Vewbox Studio');
  });
});
