import { describe, expect, it } from 'vitest';
import { documentTitle } from '@/components/shell/titles';
import { buildFixture } from '../../scripts/v4-fixture';

/** docs/DESIGN-SYSTEM-V4.md §7.3 (V4-11, WCAG 2.4.2): every route has its own title, in the interface language,
 *  `<object> · <area> · Vewbox Studio`, with a non-default tab in front. On the sample studio. */

const org = { departments: [{ id: 'CASTING', name: 'Casting & Character Design', nameAr: 'اختيار وتصميم الشخصيات' }], agents: [{ id: 'casting-director', name: 'Casting Director', nameAr: 'مدير اختيار الممثلين', department: 'CASTING' }] };
const title = (lang: 'en' | 'ar', url: string) => { const u = new URL(url, 'http://studio.test'); const f = buildFixture('states', lang); return documentTitle({ pathname: u.pathname, search: u.searchParams, state: f.state, locale: lang, org }); };

const ROUTES = [
  '/shows', '/shows/last-sip', '/shows/last-sip?tab=seasons', '/shows/last-sip?tab=episodes', '/shows/last-sip?tab=characters', '/shows/last-sip?tab=locations', '/shows/last-sip?tab=settings',
  '/shows/last-sip/seasons/last-sip-s1', '/shows/last-sip/seasons/last-sip-s1/episodes/s1e1', '/shows/last-sip/seasons/last-sip-s1/episodes/s1e1?tab=storyboard', '/shows/last-sip/seasons/last-sip-s1/episodes/s1e1/shots/s1e1-1',
  '/shorts', '/shorts/night-tray', '/shorts/night-tray?tab=story', '/shorts/night-tray?tab=final', '/shorts/night-tray/shots/nt-1',
  '/music-videos', '/music-videos/river-lights', '/music-videos/river-lights?tab=song', '/music-videos/river-lights?tab=performers',
  '/characters', '/characters/new', '/characters/layla', '/characters/abu-samir', '/locations', '/locations/new', '/locations/cafe', '/assets',
  '/studio', '/studio/departments/CASTING', '/studio/agents/casting-director', '/production', '/jobs', '/screening', '/screening?cut=paper-boats', '/settings',
  '/new', '/new/show', '/new/season', '/new/episode', '/new/short', '/new/music-video', '/library', '/projects',
];

describe('page titles (§7.3)', () => {
  it('follow the table in English', () => {
    expect(title('en', '/shows')).toBe('Shows · Vewbox Studio');
    expect(title('en', '/shows/last-sip')).toBe('The Last Sip · Shows · Vewbox Studio');
    expect(title('en', '/shows/last-sip?tab=characters')).toBe('Cast · The Last Sip · Shows · Vewbox Studio');
    expect(title('en', '/shows/last-sip/seasons/last-sip-s1/episodes/s1e1')).toBe('Episode 1: The Opening Hour · The Last Sip · Shows · Vewbox Studio');
    expect(title('en', '/shows/last-sip/seasons/last-sip-s1/episodes/s1e1?tab=storyboard')).toBe('Storyboard · Episode 1 · The Last Sip · Shows · Vewbox Studio');
    expect(title('en', '/shows/last-sip/seasons/last-sip-s1/episodes/s1e1/shots/s1e1-1')).toBe('Shot 1.1 · Episode 1 · The Last Sip · Shows · Vewbox Studio');
    expect(title('en', '/shorts/paper-boats')).toBe('Paper Boats · Shorts · Vewbox Studio');
    expect(title('en', '/characters/new')).toBe('New character · Characters · Vewbox Studio');
    expect(title('en', '/locations/cafe')).toBe('Abu Samir’s Café · Locations · Vewbox Studio');
    expect(title('en', '/studio/agents/casting-director')).toBe('Casting Director · Casting & Character Design · Studio Company · Vewbox Studio');
    expect(title('en', '/new/show')).toBe('New Show · Vewbox Studio');
  });

  it('follow the table in Arabic, with the records’ Arabic names', () => {
    expect(title('ar', '/shows')).toBe('المسلسلات · استوديو فيوبوكس');
    expect(title('ar', '/shows/last-sip')).toBe('آخر رشفة · المسلسلات · استوديو فيوبوكس');
    expect(title('ar', '/shows/last-sip/seasons/last-sip-s1/episodes/s1e1')).toBe('الحلقة 1: ساعة الافتتاح · آخر رشفة · المسلسلات · استوديو فيوبوكس');
    expect(title('ar', '/characters/new')).toBe('شخصية جديدة · الشخصيات · استوديو فيوبوكس');
    expect(title('ar', '/studio')).toBe('شركة الاستوديو · استوديو فيوبوكس');
    expect(title('ar', '/screening')).toBe('غرفة العرض · استوديو فيوبوكس');
  });

  for (const lang of ['en', 'ar'] as const) {
    it(`are distinct for every route in ${lang === 'en' ? 'English' : 'Arabic'}, and never the bare studio name`, () => {
      const seen = new Map<string, string>();
      const clashes: string[] = [];
      for (const r of ROUTES) {
        const t = title(lang, r);
        expect(t, r).toContain(' · ');
        if (seen.has(t)) clashes.push(`${r} = ${seen.get(t)} «${t}»`);
        seen.set(t, r);
      }
      expect(clashes).toEqual([]);
    });
  }

  it('falls back to the area while a record is missing (a deleted show, an unknown id)', () => {
    expect(title('en', '/shows/nope')).toBe('Shows · Vewbox Studio');
    expect(title('en', '/characters/nope')).toBe('Characters · Vewbox Studio');
  });
});
