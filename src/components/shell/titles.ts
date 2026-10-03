import type { Production, StudioState } from '@/domain/types';
import { t, tt, type Key, type Locale } from '@/lib/i18n';
import { shotLabel } from '@/studio/selectors';

/** PAGE TITLES (docs/DESIGN-SYSTEM-V4.md §7.3, WCAG 2.4.2) — `<object> · <area> · Vewbox Studio`, built from the
 *  route and the studio's own records, in the interface language (Arabic names where the record has one). A tab
 *  other than the page's default goes in front. Pure: the shell renders the result (DocumentTitle.tsx) and
 *  tests/unit/document-title.test.ts checks that every route's title is distinct in both languages. */

type Search = { get(name: string): string | null };
/** Department and agent names, from GET /api/studio/org (they are not in the studio snapshot). */
export interface OrgNames { departments: Array<{ id: string; name: string; nameAr?: string }>; agents: Array<{ id: string; name: string; nameAr?: string; department?: string }> }
export interface TitleInput { pathname: string; search?: Search; state: StudioState; locale: Locale; org?: OrgNames | null; /** decisions waiting for the producer, when known: Production says "(3) " in front */ waiting?: number }

// the tab names, by workspace, as the pages label them; `null` is the default tab (no prefix)
const SHOW_TABS: Record<string, Key | null> = { overview: null, gallery: null, seasons: 'tab.seasons', episodes: 'tab.episodes', characters: 'tab.showCast', cast: 'tab.showCast', locations: 'show.world', world: 'show.world', settings: 'tab.settings' };
const FILM_TABS: Record<string, Key | null> = { overview: null, story: 'tab.story', characters: 'tab.characters', cast: 'tab.characters', locations: 'tab.locations', storyboard: 'tab.storyboard', produce: 'tab.produce', final: 'tab.finalCut' };
const MUSIC_TABS: Record<string, Key | null> = { overview: null, song: 'tab.song', performers: 'tab.performers', cast: 'tab.performers', characters: 'tab.performers', visual: 'tab.visual', story: 'tab.visual', locations: 'tab.visual', storyboard: 'tab.storyboard', produce: 'tab.produce', final: 'tab.finalCut' };
const NEW_KIND: Record<string, Key> = { show: 'wizard.newShow', season: 'wizard.newSeason', episode: 'wizard.newEpisode', short: 'wizard.newShort', 'music-video': 'wizard.newMusicVideo' };

const fill = (s: string, n: string | number) => s.replace('{n}', String(n));
const named = (locale: Locale, en: string, ar?: string) => (locale === 'ar' && ar ? ar : en);

/** The parts before "Vewbox Studio", most specific first. */
export function titleParts({ pathname, search, state, locale, org }: TitleInput): string[] {
  const T = (k: Key) => t(locale, k);
  const seg = pathname.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  const tab = (map: Record<string, Key | null>) => { const k = map[search?.get('tab') ?? ''] ?? null; return k ? [T(k)] : []; };
  const prod = (id: string | undefined) => state.productions.find((p) => p.id === id);
  const prodName = (p: Production) => named(locale, p.kind === 'MUSIC_VIDEO' ? (p.song?.title || p.title) : p.title, p.titleAr);
  const shot = (p: Production | undefined, id: string | undefined) => { const sh = p?.shots.find((s) => s.id === id); return fill(T('shell.title.shot'), sh && p ? shotLabel(p, sh) : (id ?? '')); };

  switch (seg[0]) {
    case undefined: return [];
    case 'shows': {
      const area = T('nav.shows');
      if (!seg[1]) return [area];
      const show = state.shows.find((s) => s.id === seg[1]);
      const name = show ? named(locale, show.title, show.titleAr) : null;
      if (!name) return [area];
      if (seg[2] !== 'seasons') return [...tab(SHOW_TABS), name, area];
      const season = state.seasons.find((s) => s.id === seg[3]);
      if (seg[4] !== 'episodes') return [fill(T('shell.title.season'), season?.number ?? ''), name, area];
      const ep = prod(seg[5]);
      const epLabel = fill(T('shell.title.episode'), ep?.episodeNumber ?? '');
      if (seg[6] === 'shots') return [shot(ep, seg[7]), epLabel, name, area];
      const t1 = tab(FILM_TABS);
      return t1.length ? [...t1, epLabel, name, area] : [ep ? `${epLabel}: ${prodName(ep)}` : epLabel, name, area];
    }
    case 'shorts':
    case 'music-videos': {
      const music = seg[0] === 'music-videos';
      const area = T(music ? 'nav.musicVideos' : 'nav.shorts');
      const p = prod(seg[1]);
      if (!seg[1] || !p) return [area];
      if (seg[2] === 'shots') return [shot(p, seg[3]), prodName(p), area];
      return [...tab(music ? MUSIC_TABS : FILM_TABS), prodName(p), area];
    }
    case 'characters': {
      const area = T('nav.characters');
      if (!seg[1]) return [area];
      if (seg[1] === 'new') return [T('cast.new.title'), area];
      const c = state.characters.find((x) => x.id === seg[1]);
      return c ? [named(locale, c.name, c.nameAr), area] : [area];
    }
    case 'locations': {
      const area = T('nav.locations');
      if (!seg[1]) return [area];
      if (seg[1] === 'new') return [T('shell.title.newLocation'), area];
      const l = state.locations.find((x) => x.id === seg[1]);
      return l ? [named(locale, l.name, l.nameAr), area] : [area];
    }
    case 'studio': {
      const area = T('nav.company');
      const deptName = (id: string | undefined) => { const d = org?.departments.find((x) => x.id === id); return d ? named(locale, d.name, d.nameAr) : (id ?? ''); };
      if (seg[1] === 'departments' && seg[2]) return [deptName(seg[2]), area];
      if (seg[1] === 'agents' && seg[2]) {
        const a = org?.agents.find((x) => x.id === seg[2]);
        return a ? [named(locale, a.name, a.nameAr), ...(a.department ? [deptName(a.department)] : []), area] : [seg[2], area];
      }
      return [area];
    }
    case 'production': return [T('nav.production')];
    case 'jobs': return [T('jobs.title'), T('nav.production')];
    case 'screening': { const p = prod(search?.get('cut') ?? undefined); return p ? [prodName(p), T('screening.title')] : [T('screening.title')]; }
    case 'settings': return [T('nav.settings')];
    case 'assets': return [T('nav.files')];
    case 'library': return [T('library.title')];
    case 'projects': return [T('projects.title')];
    case 'new': return seg[1] ? [NEW_KIND[seg[1]] ? T(NEW_KIND[seg[1]]) : tt(locale, `wizard.new.${seg[1]}`, seg[1])] : [T('nav.new')];
    // the dev-only specimen pages of the interface kit (F2) and the media kit (F3)
    case 'kit': return [T('shell.title.kit')];
    case 'kit-media': return [T('shell.title.kitMedia')];
    default: return [];
  }
}

/** The document title: the parts, then the studio's name; Production with the waiting decisions in front. */
export function documentTitle(input: TitleInput): string {
  const title = [...titleParts(input).filter(Boolean), t(input.locale, 'app.name')].join(' · ');
  const production = input.pathname === '/production' || input.pathname.startsWith('/production/');
  return production && input.waiting && input.waiting > 0 ? `(${input.waiting}) ${title}` : title;
}
