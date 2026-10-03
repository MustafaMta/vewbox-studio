import type { Asset, Character, LyricSection, Production, StudioState } from '@/domain/types';
import { primaryImageOf } from '@/domain/identity';
import { castOf, nextStep, productionHref } from '@/studio/selectors';
import { LANGUAGE_LABEL, STYLE_LABEL, displaySrc, nameLang, parseTime, plural, runtime, stageWords } from '@/components/home/model';
import type { Track } from '@/components/players/PlayerProvider';

/** THE MUSIC VIDEO PAGES' READING OF THE STUDIO (docs/design/PAGE-ENGINEERING-BRIEF.md; VISUAL-STANDARD-V5.1 §5.6,
 *  §5.24; DESIGN-SYSTEM-V5 §8.6) — pure, so every word and number the catalogue and the title page show comes from
 *  the real state and can be tested. The song comes first: its sleeve, its title, who sings it, the file itself (only
 *  when it exists), the lyrics section by section in the language they are sung, then the video when there is a cut.
 *  A fact that is not in the state is left out, never filled in. */

type S = Pick<StudioState, 'productions' | 'characters' | 'assets' | 'shows'>;

const byId = (s: S) => { const m = new Map(s.assets.map((a) => [a.id, a])); return (id?: string | null) => (id ? m.get(id) : undefined); };
const picture = (a: Asset | undefined): a is Asset => Boolean(a && a.kind === 'IMAGE' && !a.unavailable);
const playable = (a: Asset | undefined, kind: Asset['kind']): a is Asset => Boolean(a && a.kind === kind && !a.unavailable && a.src);
const updated = (p: Production) => parseTime(p.updatedAt)?.getTime() ?? 0;

export const songTitle = (p: Production) => p.song?.title || p.title;

/** Where a music video is worked on: the production workspace, at one of its tabs. */
export type WorkTab = 'overview' | 'song' | 'performers' | 'visual' | 'storyboard' | 'produce' | 'final';
export const productionTab = (p: Pick<Production, 'id'>, tab: WorkTab) => `/music-videos/${encodeURIComponent(p.id)}/production?tab=${tab}`;

/** The one next step, as the workspace tab it happens on and the words of the button. */
export function continueAction(p: Production): { label: string; href: string } {
  if (!p.song) return { label: 'Write the song', href: productionTab(p, 'song') };
  if (p.stage === 'COMPLETE') return { label: 'Open the production', href: productionTab(p, 'final') };
  const next = nextStep(p);
  const [tab, words]: [WorkTab, string] = next.tab === 'story' ? (next.key === 'next.writeScript' ? ['visual', 'visual story'] : ['song', 'song and lyrics'])
    : next.tab === 'cast' ? ['performers', 'performers']
      : next.tab === 'storyboard' ? ['storyboard', 'storyboard']
        : next.tab === 'produce' ? ['produce', 'filming']
          : ['final', 'final cut'];
  return { label: `Continue: ${words}`, href: productionTab(p, tab) };
}

/** The status word of a music video: finished, or the stage it is in. */
export const statusOf = (p: Production): { words: string; tone: 'done' | 'idle' } => (p.stage === 'COMPLETE' ? { words: 'Finished', tone: 'done' } : { words: stageWords(p.stage), tone: 'idle' });

// ------------------------------------------------------------------------------------------------------ people

export interface Person { id: string; name: string; lang?: 'ar'; href: string; asset?: Asset; src?: string }

function personOf(s: S, c: Character): Person {
  const a = byId(s)(primaryImageOf(c));
  const ok = picture(a);
  return { id: c.id, name: c.name, lang: nameLang(c.name), href: `/characters/${encodeURIComponent(c.id)}`, asset: ok ? a : undefined, src: ok ? displaySrc(a) : undefined };
}

/** The characters who sing the song, in the song's order; else everyone who sings a section. */
export function singersOf(s: S, p: Production): Character[] {
  const song = p.song;
  if (!song) return [];
  const ids = [...song.singerIds, ...song.sections.flatMap((x) => [...x.singerIds, ...(x.lines ?? []).map((l) => l.singerId)])];
  const seen = new Set<string>();
  return ids.filter((id) => (seen.has(id) ? false : (seen.add(id), true))).map((id) => s.characters.find((c) => c.id === id)).filter((c): c is Character => Boolean(c));
}

/** "Layla & Karim", "Nour", "Layla, Karim & Nour" — the artist as written, else the singers' names. */
export function performersLine(s: S, p: Production): string {
  if (p.artist?.trim()) return p.artist.trim();
  const names = singersOf(s, p).map((c) => c.name);
  return names.length <= 1 ? names[0] ?? '' : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

// ------------------------------------------------------------------------------------------------------ the song

/** The song's file on the studio's one audio source — only when the file exists. Its id is the workspace's, so the
 *  title page, the catalogue and the production workspace drive the same playback. */
export function songTrack(s: S, p: Production): Track | null {
  const audio = byId(s)(p.song?.assetId);
  if (!p.song || !playable(audio, 'AUDIO')) return null;
  const sleeve = sleeveOf(s, p);
  return { id: `song-${p.id}`, src: audio.src, title: songTitle(p), subtitle: performersLine(s, p) || undefined, artworkSrc: sleeve.src, duration: audio.durationSeconds ?? p.song.durationSeconds };
}

/** The square cover art: the 1:1 poster, else the wide cover cropped square; nothing when neither exists. */
export function sleeveOf(s: S, p: Production): { asset?: Asset; src?: string } {
  const get = byId(s);
  const a = [get(p.posterAssetId), get(p.coverAssetId)].find(picture);
  return a ? { asset: a, src: displaySrc(a) } : {};
}

const durationOf = (s: S, p: Production): number | undefined => {
  const cut = byId(s)(p.cutAssetId);
  return p.song?.durationSeconds || cut?.durationSeconds || undefined;
};

// ------------------------------------------------------------------------------------------------- the catalogue

export interface SleeveItem {
  id: string;
  href: string;
  title: string;
  lang?: 'ar';
  performers: string;
  performersLang?: 'ar';
  duration: string | null;
  status: { words: string; tone: 'done' | 'idle' };
  asset?: Asset;
  src?: string;
  track: Track | null;
}

/** The catalogue, most recently worked on first. */
export function catalogue(s: S): SleeveItem[] {
  return s.productions.filter((p) => p.kind === 'MUSIC_VIDEO').sort((a, b) => updated(b) - updated(a)).map((p) => {
    const title = songTitle(p);
    const performers = performersLine(s, p);
    const sleeve = sleeveOf(s, p);
    return { id: p.id, href: productionHref(p), title, lang: nameLang(title), performers, performersLang: nameLang(performers), duration: runtime(durationOf(s, p)), status: statusOf(p), asset: sleeve.asset, src: sleeve.src, track: songTrack(s, p) };
  });
}

/** The status filter of a long catalogue (§5.15: only above six items). */
export type CatalogueFilter = 'all' | 'working' | 'finished';
export const filterItems = (items: SleeveItem[], f: CatalogueFilter) => (f === 'all' ? items : items.filter((x) => (f === 'finished' ? x.status.tone === 'done' : x.status.tone !== 'done')));

// ------------------------------------------------------------------------------------------------------- lyrics

const KIND_WORDS: Record<LyricSection['kind'], string> = { INTRO: 'Intro', VERSE: 'Verse', PRE_CHORUS: 'Pre-chorus', CHORUS: 'Chorus', BRIDGE: 'Bridge', OUTRO: 'Outro', INSTRUMENTAL: 'Instrumental' };
const QUIET: ReadonlySet<LyricSection['kind']> = new Set(['INTRO', 'OUTRO', 'INSTRUMENTAL']);

export interface LyricLineView { text: string; lang?: 'ar'; singer?: Person }
export interface LyricSectionView {
  id: string;
  /** "Verse 1", "Chorus" — numbered only when the kind repeats */
  label: string;
  from: number;
  to: number;
  /** "0:08" */
  at: string;
  singers: Person[];
  /** the words as they are sung, one entry per line, each in its own script */
  lines: LyricLineView[];
  /** the same words in the other language, when written */
  translation: LyricLineView[];
  /** no words: the music alone */
  instrumental: boolean;
}

const splitLines = (t: string | undefined): string[] => (t ?? '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const lineOf = (text: string, singer?: Person): LyricLineView => ({ text, lang: nameLang(text), singer });

/** The lyrics section by section, in the language the song is sung in (Arabic when the production is Arabic and the
 *  Arabic words exist), the other language as the translation; who sings each section, and each line when the song
 *  alternates singers. */
export function lyricsOf(s: S, p: Production): LyricSectionView[] {
  const song = p.song;
  if (!song) return [];
  const people = new Map(castOf(s as StudioState, p).concat(singersOf(s, p)).map((c) => [c.id, personOf(s, c)]));
  const who = (id: string) => people.get(id) ?? (() => { const c = s.characters.find((x) => x.id === id); return c ? personOf(s, c) : undefined; })();
  const counts = new Map<string, number>();
  for (const sec of song.sections) counts.set(sec.kind, (counts.get(sec.kind) ?? 0) + 1);
  const seen = new Map<string, number>();
  const arabicFirst = p.language === 'AR';
  return [...song.sections].sort((a, b) => a.from - b.from).map((sec) => {
    const n = (seen.get(sec.kind) ?? 0) + 1; seen.set(sec.kind, n);
    const label = (counts.get(sec.kind) ?? 0) > 1 ? `${KIND_WORDS[sec.kind]} ${n}` : KIND_WORDS[sec.kind];
    const singers = sec.singerIds.map(who).filter((x): x is Person => Boolean(x));
    const ar = splitLines(sec.textAr), en = splitLines(sec.text);
    const sungAr = arabicFirst ? ar.length > 0 : en.length === 0 && ar.length > 0;
    let lines: LyricLineView[];
    if (sec.lines && sec.lines.length > 0) lines = sec.lines.filter((l) => l.text.trim()).map((l) => lineOf(l.text.trim(), who(l.singerId)));
    else lines = (sungAr ? ar : en).map((t) => lineOf(t));
    const translation = (sungAr ? en : ar).map((t) => lineOf(t)).filter((t) => !lines.some((l) => l.text === t.text));
    return { id: sec.id, label, from: sec.from, to: sec.to, at: runtime(sec.from) ?? '0:00', singers, lines, translation, instrumental: lines.length === 0 && QUIET.has(sec.kind) };
  });
}

// --------------------------------------------------------------------------------------------- the title page

const CONCEPT: Record<NonNullable<Production['concept']>, string> = { PERFORMANCE: 'Performance', NARRATIVE: 'Story', MIXED: 'Performance and story' };

export interface Fact { label: string; value: string }
export interface CastMember extends Person { role: string }

export interface TitlePage {
  production: Production;
  title: string;
  lang?: 'ar';
  /** a title longer than 28 characters steps down one role (§4.3) */
  long: boolean;
  /** the production's title in its other script, when it has one ("أضواء النهر") */
  altTitle?: string;
  status: { words: string; tone: 'done' | 'idle' };
  slate: string[];
  artist: string;
  performers: Person[];
  sleeve: { asset?: Asset; src?: string };
  track: Track | null;
  /** a song without its file: what the transport says instead of playing */
  noFile: boolean;
  sections: LyricSectionView[];
  facts: Fact[];
  cast: CastMember[];
  video?: { asset: Asset; src: string; poster?: string; duration: string | null };
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
}

const sectionsSung = (sections: LyricSectionView[], id: string) => [...new Set(sections.filter((x) => x.singers.some((p) => p.id === id) || x.lines.some((l) => l.singer?.id === id)).map((x) => x.label.replace(/ \d+$/, '').toLowerCase()))];
const listWords = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? '' : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export function titlePage(s: S, p: Production): TitlePage {
  const get = byId(s);
  const title = songTitle(p);
  const sections = lyricsOf(s, p);
  const singers = singersOf(s, p);
  const performers = singers.map((c) => personOf(s, c));
  const year = parseTime(p.createdAt)?.getFullYear();
  const duration = durationOf(s, p);
  const audio = get(p.song?.assetId);
  const track = songTrack(s, p);
  const cut = get(p.cutAssetId);
  const video = playable(cut, 'VIDEO') ? { asset: cut, src: cut.src, poster: cut.poster, duration: runtime(cut.durationSeconds) } : undefined;
  const words = sections.filter((x) => !x.instrumental).length;
  const altTitle = p.titleAr && p.titleAr !== title ? p.titleAr : undefined;
  const singerIds = new Set(singers.map((c) => c.id));
  const cast: CastMember[] = castOf(s as StudioState, p).concat(singers.filter((c) => !p.castIds.includes(c.id))).map((c) => {
    const sung = sectionsSung(sections, c.id);
    return { ...personOf(s, c), role: singerIds.has(c.id) ? (sung.length ? `Sings the ${listWords(sung)}` : 'Sings') : 'In the video' };
  });
  const facts: Fact[] = [
    p.genre || p.song?.genre ? { label: 'Genre', value: (p.genre || p.song?.genre)! } : null,
    p.mood || p.song?.mood ? { label: 'Mood', value: (p.mood || p.song?.mood)! } : null,
    p.song?.bpm ? { label: 'Tempo', value: `${p.song.bpm} BPM` } : null,
    p.concept ? { label: 'Treatment', value: CONCEPT[p.concept] } : null,
    LANGUAGE_LABEL[p.language] ? { label: 'Sung in', value: LANGUAGE_LABEL[p.language] } : null,
    p.song ? { label: 'Song', value: p.song.source === 'UPLOADED' ? 'Uploaded by you' : 'Written by the studio' } : null,
  ].filter((x): x is Fact => Boolean(x));
  const cont = continueAction(p);
  return {
    production: p,
    title,
    lang: nameLang(title),
    long: title.length > 28,
    altTitle,
    status: statusOf(p),
    slate: ['Music video', year ? String(year) : null, runtime(duration), words ? `${words} ${plural(words, 'section')}` : null, STYLE_LABEL[p.style] ?? null].filter((x): x is string => Boolean(x)),
    artist: performersLine(s, p),
    performers,
    sleeve: sleeveOf(s, p),
    track,
    noFile: Boolean(p.song && !track && !playable(audio, 'AUDIO')),
    sections,
    facts,
    cast,
    video,
    primary: cont,
    secondary: p.song && cont.href !== productionTab(p, 'song') ? { label: 'Edit the song', href: productionTab(p, 'song') } : undefined,
  };
}
