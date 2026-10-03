import type { Asset, Character, Location, Production, Season, Show, StudioState } from '@/domain/types';
import type { Decision } from '@/studio/selectors/decisions';
import { primaryImageOf } from '@/domain/identity';
import { keyFrameFor } from '@/studio/selectors/poster';
import { nextStep, productionHref, progressOf, STAGE_ORDER, stageIndex } from '@/studio/selectors';
import type { StageSegment } from '@/components/media/StageMeter';

/** THE SHOWS PAGES' READING OF THE STUDIO — pure, so every word and number on /shows, a show, a season and an episode
 *  comes from real state and can be tested: the catalogue cards, a show's slate, its Continue (the next episode's next
 *  step) and Watch (the latest cut), each episode's still, synopsis and stage, the cast and the world. A fact that is not
 *  in the state is left out, never filled with a placeholder. */

type S = Pick<StudioState, 'shows' | 'seasons' | 'productions' | 'characters' | 'locations' | 'assets'>;

/** Postgres (`2026-10-03 09:33:34.579+00`) or ISO timestamps → epoch ms (0 when unknown). */
export function timeOf(t: string | null | undefined): number {
  if (!t) return 0;
  const iso = t.includes('T') ? t : t.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00');
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}
export const yearOf = (t: string | null | undefined): number | null => { const ms = timeOf(t); return ms ? new Date(ms).getUTCFullYear() : null; };

/** 0:56, 12:04, 1:02:09 */
export function runtime(seconds: number | undefined | null): string | null {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null;
  const s = Math.round(seconds), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
/** "5 min" for a target length */
export const minutes = (seconds: number) => (seconds < 60 ? `${seconds} s` : `${Math.round(seconds / 60)} min`);
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const STYLE_LABEL: Record<string, string> = { CARTOON: 'Cartoon', ANIME: 'Anime', REALISTIC: 'Realistic' };
export const LANGUAGE_LABEL: Record<string, string> = { EN: 'English', AR: 'Arabic' };
export const ASPECT_LABEL: Record<string, string> = { WIDE_16_9: '16:9', VERTICAL_9_16: '9:16', SQUARE_1_1: '1:1', CINEMA_2_39: '2.39:1' };
const STAGE_WORDS: Record<string, string> = { STORY: 'Story', CAST_AND_WORLD: 'Cast and world', STORYBOARD: 'Storyboard', PRODUCE: 'Filming', FINAL_CUT: 'Final cut', COMPLETE: 'Finished' };
export const stageWords = (st: string) => STAGE_WORDS[st] ?? st.charAt(0) + st.slice(1).toLowerCase().replace(/_/g, ' ');
const NEXT_WORDS: Record<string, string> = { 'next.writeStory': 'Write the story', 'next.chooseCast': 'Choose the cast', 'next.writeScript': 'Write the script', 'next.planShots': 'Plan the shots', 'next.chooseTakes': 'Choose takes', 'next.assemble': 'Assemble the cut', 'next.reviewCut': 'Review the cut' };

/** A content name's language when its script says so (§4.4: `lang` when known, omitted otherwise). */
export const nameLang = (name: string): 'ar' | undefined => (/[؀-ۿݐ-ݿࢠ-ࣿ]/.test(name) ? 'ar' : undefined);

/** A picture a page may draw: an image whose file exists. */
const usable = (a: Asset | undefined): a is Asset => Boolean(a && a.kind === 'IMAGE' && !a.unavailable);
/** The display file of a picture: the derived thumbnail when it exists, else the original. */
export const displaySrc = (a: Asset | undefined | null): string | undefined => (a && !a.unavailable ? a.thumb?.src ?? a.src : undefined);
const finder = (s: Pick<S, 'assets'>) => { const m = new Map(s.assets.map((a) => [a.id, a])); return (id?: string | null) => (id ? m.get(id) : undefined); };

export interface Pic { asset: Asset; src: string }
const pic = (a: Asset | undefined): Pic | undefined => (usable(a) ? { asset: a, src: displaySrc(a)! } : undefined);

// ------------------------------------------------------------------------------------------------------ order

export const seasonsOfShow = (s: Pick<S, 'seasons'>, showId: string): Season[] => s.seasons.filter((x) => x.showId === showId).sort((a, b) => a.number - b.number);
export const episodesOfSeason = (s: Pick<S, 'productions'>, seasonId: string): Production[] => s.productions.filter((p) => p.seasonId === seasonId && p.kind === 'EPISODE').sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0));
/** Every episode of a show in watching order: season by season, episode by episode. */
export function episodesInOrder(s: Pick<S, 'productions' | 'seasons'>, showId: string): Production[] {
  const order = new Map(seasonsOfShow(s, showId).map((x) => [x.id, x.number]));
  return s.productions.filter((p) => p.showId === showId && p.kind === 'EPISODE')
    .sort((a, b) => (order.get(a.seasonId ?? '') ?? 999) - (order.get(b.seasonId ?? '') ?? 999) || (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0));
}

// ----------------------------------------------------------------------------------------------- the pictures

/** A show's key art: its 16:9 cover, else its poster, else the cover or key frame of its most recent episode. */
export function showPicture(s: S, show: Show): Pic | undefined {
  const get = finder(s);
  const own = pic(get(show.coverAssetId)) ?? pic(get(show.posterAssetId));
  if (own) return own;
  for (const p of [...episodesInOrder(s, show.id)].sort((a, b) => timeOf(b.updatedAt) - timeOf(a.updatedAt))) {
    const e = episodePicture(s, p);
    if (e) return e;
  }
  return undefined;
}
/** A show's 2:3 poster, only when one was drawn (never a crop of the wide art pretending to be a poster). */
export const showPoster = (s: S, show: Show): Pic | undefined => pic(finder(s)(show.posterAssetId));

/** An episode's still: its cover, else the key frame of its storyboard, else its poster. */
export function episodePicture(s: S, p: Production): Pic | undefined {
  const get = finder(s);
  return pic(get(p.coverAssetId)) ?? pic(get(keyFrameFor(p, s.assets)?.imageAssetId)) ?? pic(get(p.posterAssetId)) ?? pic(get(p.framePosterAssetId));
}

// ------------------------------------------------------------------------------------------------- the stage

export interface StageInfo { words: string; tone: 'done' | 'waiting' | 'current'; segments: StageSegment[] }
/** An episode's stage as words and the six-segment meter; `waiting` when a decision on it waits for the producer. */
export function stageOf(p: Production, waiting: boolean): StageInfo {
  const i = Math.max(0, stageIndex(p.stage));
  const done = p.stage === 'COMPLETE';
  const tone = done ? 'done' : waiting ? 'waiting' : 'current';
  const segments: StageSegment[] = STAGE_ORDER.map((_, k) => (done || k < i ? 'done' : k === i ? (waiting ? 'waiting' : 'current') : 'upcoming'));
  return { words: done ? 'Finished' : waiting ? `${stageWords(p.stage)} · waiting for you` : stageWords(p.stage), tone, segments };
}
/** The productions a decision waits on. */
export const waitingProductions = (items: Decision[]): Set<string> => new Set(items.map((d) => d.subject.productionId).filter((x): x is string => Boolean(x)));

/** The workspace tab of a production's next step (the workspace calls the cast tab "characters"). */
export function nextAction(p: Production): { words: string; href: string } {
  const n = nextStep(p);
  const tab = n.tab === 'cast' ? 'characters' : n.tab;
  return { words: NEXT_WORDS[n.key] ?? 'Continue', href: `${productionHref(p)}/production?tab=${tab}` };
}

// ------------------------------------------------------------------------------------------------ catalogue

export interface ShowCardData {
  id: string; href: string; title: string; lang?: 'ar'; meta: string; status: { words: string; tone: 'done' | 'waiting' | 'current' | 'idle' };
  picture?: Pic; updated: number; genre: string; finished: boolean;
}

/** The catalogue's cards, newest change first. Status: finished when every episode is; waiting when any waits for the
 *  producer; else the stage of the episode to continue; a show with no episode yet says so. */
export function showCards(s: S, waiting: ReadonlySet<string> = new Set()): ShowCardData[] {
  return [...s.shows].sort((a, b) => timeOf(b.updatedAt) - timeOf(a.updatedAt)).map((sh) => {
    const seasons = seasonsOfShow(s, sh.id).length;
    const eps = episodesInOrder(s, sh.id);
    const finished = eps.length > 0 && eps.every((p) => p.stage === 'COMPLETE');
    const next = eps.find((p) => p.stage !== 'COMPLETE');
    const status: ShowCardData['status'] = eps.length === 0 ? { words: 'No episodes yet', tone: 'idle' }
      : finished ? { words: 'Finished', tone: 'done' }
        : eps.some((p) => waiting.has(p.id)) ? { words: 'Waiting for you', tone: 'waiting' }
          : { words: `Episode ${next!.episodeNumber ?? 1} · ${stageWords(next!.stage)}`, tone: 'current' };
    const meta = [seasons ? plural(seasons, 'season') : null, eps.length ? plural(eps.length, 'episode') : null, sh.genre.trim() || null].filter(Boolean).join(' · ');
    const latest = Math.max(timeOf(sh.updatedAt), ...eps.map((p) => timeOf(p.updatedAt)));
    return { id: sh.id, href: `/shows/${encodeURIComponent(sh.id)}`, title: sh.title, lang: nameLang(sh.title), meta, status, picture: showPicture(s, sh), updated: latest, genre: sh.genre.trim(), finished };
  });
}

export type ShowFilter = 'all' | 'working' | 'waiting' | 'finished';
export function filterShows(cards: ShowCardData[], q: string, f: ShowFilter): ShowCardData[] {
  const words = q.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return cards.filter((c) => {
    if (f === 'finished' && !c.finished) return false;
    if (f === 'working' && (c.finished || c.status.tone === 'idle')) return false;
    if (f === 'waiting' && c.status.tone !== 'waiting') return false;
    const text = `${c.title} ${c.genre}`.toLocaleLowerCase();
    return words.every((w) => text.includes(w));
  });
}

// ------------------------------------------------------------------------------------------------- one show

export interface ShowAction { label: string; href: string }
export interface ShowView {
  slate: string[];
  lead: string;
  episodes: Production[];
  seasons: Season[];
  /** the next episode's next step; null when every episode is finished or there is none */
  continue: (ShowAction & { episode: Production }) | null;
  /** the latest episode (in watching order) with a cut */
  watch: (ShowAction & { episode: Production }) | null;
}

export function showView(s: S, show: Show): ShowView {
  const seasons = seasonsOfShow(s, show.id);
  const episodes = episodesInOrder(s, show.id);
  const get = finder(s);
  const next = episodes.find((p) => p.stage !== 'COMPLETE');
  const cut = [...episodes].reverse().find((p) => { const c = get(p.cutAssetId); return Boolean(c && !c.unavailable); });
  const slate = ['Show', yearOf(show.createdAt) ? String(yearOf(show.createdAt)) : null, seasons.length ? plural(seasons.length, 'season') : null, episodes.length ? plural(episodes.length, 'episode') : null, show.genre.trim() || null, STYLE_LABEL[show.style] ?? null, LANGUAGE_LABEL[show.language] ?? null]
    .filter((x): x is string => Boolean(x));
  const nextAct = next ? nextAction(next) : null;
  return {
    slate, lead: show.logline || show.synopsis || '', episodes, seasons,
    continue: next && nextAct ? { label: `Continue episode ${next.episodeNumber ?? 1}: ${nextAct.words.charAt(0).toLowerCase()}${nextAct.words.slice(1)}`, href: nextAct.href, episode: next } : null,
    watch: cut ? { label: `Watch episode ${cut.episodeNumber ?? 1}`, href: `/screening?p=${encodeURIComponent(cut.id)}`, episode: cut } : null,
  };
}

export interface EpisodeCardData {
  id: string; href: string; number: number; title: string; lang?: 'ar'; synopsis: string; stage: StageInfo; runtime: string | null; picture?: Pic;
}
export function episodeCard(s: S, p: Production, waiting: ReadonlySet<string>): EpisodeCardData {
  const cut = finder(s)(p.cutAssetId);
  const rt = runtime(cut?.durationSeconds) ?? runtime(progressOf(p).runtime);
  return { id: p.id, href: productionHref(p), number: p.episodeNumber ?? 1, title: p.title, lang: nameLang(p.title), synopsis: p.logline || p.synopsis || '', stage: stageOf(p, waiting.has(p.id)), runtime: rt, picture: episodePicture(s, p) };
}

export interface FigureData { id: string; name: string; lang?: 'ar'; role: string; href: string; picture?: Pic }
export const castOfShow = (s: S, ids: string[]): FigureData[] => s.characters.filter((c) => ids.includes(c.id)).map((c) => figure(s, c));
export function figure(s: S, c: Character): FigureData {
  return { id: c.id, name: c.name, lang: nameLang(c.name), role: c.role, href: `/characters/${encodeURIComponent(c.id)}`, picture: pic(finder(s)(primaryImageOf(c))) };
}
export interface PlateData { id: string; name: string; lang?: 'ar'; meta: string; href: string; picture?: Pic }
export const worldOfShow = (s: S, ids: string[]): PlateData[] => s.locations.filter((l) => ids.includes(l.id)).map((l) => plate(s, l));
export function plate(s: S, l: Location): PlateData {
  return { id: l.id, name: l.name, lang: nameLang(l.name), meta: l.kind === 'INTERIOR' ? 'Interior' : 'Exterior', href: `/locations/${encodeURIComponent(l.id)}`, picture: pic(finder(s)(l.masterAssetId)) };
}

/** The bible's four lists in reading order, and the style notes. */
export const BIBLE_PARTS = [
  { key: 'worldRules', title: 'World rules', hint: 'What is always true in this world.' },
  { key: 'relationships', title: 'Relationships', hint: 'Who is what to whom.' },
  { key: 'timeline', title: 'Timeline', hint: 'What has happened so far, in order.' },
  { key: 'unresolved', title: 'Open storylines', hint: 'Threads the next episodes pick up.' },
] as const;
export type BibleKey = (typeof BIBLE_PARTS)[number]['key'];
