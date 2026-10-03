import type { Character, IdeaPreferences, Location, StudioState } from '@/domain/types';
import { DIALECT_LABELS, DURATIONS, type Dialect, type Language, type Style } from '@/domain/vocabulary';
import { STRATEGY_OF, type IdeaKind, type StoryStrategy } from '@/domain/development';
import { primaryImageOf } from '@/domain/identity';
import { showContinuity } from '../engine';

/** THE IDEA'S CONTEXT — what every development stage reads about the request: the format and its strategy, the
 *  language and dialect (a show's are its identity and never change), the direction, the running time, the producer's
 *  constraints, and for a season or an episode the show's full history (showContinuity). Built from the AUTO_IDEA
 *  job's payload and the studio as it is now, the same way in every child job. Pure. */

export interface IdeaRequest { kind: IdeaKind; showId?: string; seasonId?: string; preferences: IdeaPreferences; brief?: string; refresh?: boolean }

/** `bornAbout`: the year of birth the age implies, so the writers can keep the years of a life consistent (D20). */
export interface CastSummary { id: string; name: string; nameAr?: string; role: string; sex: string; ageYears: number; bornAbout: number; look: string; personality: string; language: string; dialect?: string; hasImage: boolean }
export interface PlaceSummary { id: string; name: string; nameAr?: string; kind: string; description: string }

export interface IdeaContext {
  ideaJobId: string;
  kind: IdeaKind;
  strategy: StoryStrategy;
  language: Language;
  dialect?: Dialect;
  style: Style;
  durationSeconds: number;
  genre?: string;
  mood?: string;
  /** The producer's audience, when given; otherwise the Audience Research Agent proposes one. */
  audience?: string;
  direction?: string;
  brief?: string;
  concept?: 'PERFORMANCE' | 'NARRATIVE' | 'MIXED';
  showId?: string;
  seasonId?: string;
  /** SEASON / EPISODE: the whole history the story continues from. SHOW: absent (a new show). */
  continuity?: ReturnType<typeof showContinuity>;
  /** For research: the show's identity. */
  show?: { title: string; genre: string; logline: string };
  mustCast: CastSummary[];
  mustLocations: PlaceSummary[];
  /** Studio characters and places the story may reuse (a new story only; a continuation reuses its show's). */
  library: { characters: CastSummary[]; locations: PlaceSummary[] };
  refresh?: boolean;
}

export const castSummary = (c: Character): CastSummary => ({ id: c.id, name: c.name, nameAr: c.nameAr, role: c.role, sex: c.sex, ageYears: c.ageYears, bornAbout: new Date().getUTCFullYear() - c.ageYears, look: [c.build, c.face, c.hair, c.wardrobe].filter(Boolean).join('; ').slice(0, 240), personality: c.personality.slice(0, 200), language: c.language, dialect: c.dialect, hasImage: Boolean(primaryImageOf(c)) });
export const placeSummary = (l: Location): PlaceSummary => ({ id: l.id, name: l.name, nameAr: l.nameAr, kind: l.kind, description: l.description.slice(0, 240) });

export function ideaContext(s: StudioState, ideaJobId: string, req: IdeaRequest): IdeaContext {
  const prefs = req.preferences ?? {};
  const show = req.showId ? s.shows.find((x) => x.id === req.showId) : undefined;
  const season = req.seasonId ? s.seasons.find((x) => x.id === req.seasonId) : undefined;
  const d = s.settings.defaults;
  // a show's language, dialect and direction are its identity: a season or an episode never changes them
  const language = show?.language ?? prefs.language ?? d.language;
  const dialect = language === 'AR' ? show?.dialect ?? prefs.dialect ?? d.dialect : undefined;
  const style = show?.style ?? prefs.style ?? d.style;
  const episodes = show ? s.productions.filter((p) => p.showId === show.id) : [];
  const avgDuration = episodes.length ? Math.round(episodes.reduce((a, p) => a + p.targetSeconds, 0) / episodes.length) : undefined;
  const durations = DURATIONS[req.kind === 'SHOW' || req.kind === 'SEASON' ? 'EPISODE' : req.kind];
  const continuing = req.kind === 'SEASON' || req.kind === 'EPISODE';
  return {
    ideaJobId, kind: req.kind, strategy: STRATEGY_OF[req.kind], language, dialect, style,
    durationSeconds: prefs.durationSeconds ?? avgDuration ?? durations[1],
    genre: prefs.genre?.trim() || (continuing ? show?.genre : undefined) || undefined,
    mood: prefs.mood?.trim() || undefined, audience: prefs.audience?.trim() || undefined, direction: prefs.direction?.trim() || undefined, brief: req.brief?.trim() || undefined,
    concept: req.kind === 'MUSIC_VIDEO' ? prefs.concept : undefined,
    showId: show?.id, seasonId: season?.id,
    continuity: show && continuing ? showContinuity(s, show, season) : undefined,
    show: show ? { title: show.title, genre: show.genre, logline: show.logline } : undefined,
    mustCast: (prefs.castIds ?? []).map((id) => s.characters.find((c) => c.id === id)).filter((c): c is Character => Boolean(c)).map(castSummary),
    mustLocations: (prefs.locationIds ?? []).map((id) => s.locations.find((l) => l.id === id)).filter((l): l is Location => Boolean(l)).map(placeSummary),
    library: show ? { characters: [], locations: [] } : { characters: s.characters.filter((c) => c.style === style).slice(0, 16).map(castSummary), locations: s.locations.filter((l) => l.style === style).slice(0, 12).map(placeSummary) },
    refresh: req.refresh,
  };
}

/** "an Iraqi Arabic (Baghdadi) cartoon show", "an English realistic short", … */
export function describeIdea(c: Pick<IdeaContext, 'kind' | 'language' | 'dialect' | 'style'>): string {
  const lang = c.language === 'AR' ? `${c.dialect ? DIALECT_LABELS[c.dialect].en : 'Arabic'} Arabic` : 'English';
  const what = { SHOW: 'show', SEASON: 'next season', EPISODE: 'next episode', SHORT: 'short film', MUSIC_VIDEO: 'music video' }[c.kind];
  return `${/^[AEIOU]/i.test(lang) ? 'an' : 'a'} ${lang} ${c.style.toLowerCase()} ${what}`;
}
