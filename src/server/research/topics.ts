import type { ResearchCategory, ResearchPlatform, ResearchTopic } from '@/domain/development';
import type { Dialect, Language, Style } from '@/domain/vocabulary';
import type { ResearchRequest } from './types';

/** TOPIC PLANNING — deterministic: what to look for, where, and why, from the request alone (kind, style, genre,
 *  language and dialect, the show's identity). At most three topics: the format, the genre, and the measured
 *  attention of the language's Wikipedia; each says why it was chosen. A season or an episode researches its show's
 *  genre, never what is trending in general (contract §2). */

/** The region a language and dialect point to (contract §3): Iraq for Baghdadi, Egypt / the Gulf / Saudi Arabia for
 *  other Arabic, the United States for English. */
export function regionOf(language: Language, dialect?: Dialect): string {
  if (language !== 'AR') return 'US';
  switch (dialect) {
    case 'IRAQI_BAGHDADI': return 'IQ';
    case 'EGYPTIAN': return 'EG';
    case 'GULF': return 'AE';
    default: return 'SA';
  }
}
const REGION_NAME: Record<string, string> = { IQ: 'Iraq', EG: 'Egypt', AE: 'the Gulf', SA: 'the Arab world', US: 'the United States' };

/** Genre words → category and the words a search uses (English for news, Arabic for the region's platforms). */
const GENRES: Array<{ re: RegExp; category: ResearchCategory; en: string; ar: string }> = [
  { re: /comed|funny|sitcom|humou?r|كوميد|مضحك|فكاه/i, category: 'COMEDY', en: 'comedy', ar: 'كوميدي' },
  { re: /horror|scary|رعب/i, category: 'HORROR', en: 'horror', ar: 'رعب' },
  { re: /myster|detective|crime|غموض|بوليس|جريمة/i, category: 'MYSTERY', en: 'mystery', ar: 'غموض' },
  { re: /thrill|suspense|تشويق|إثارة|اثارة/i, category: 'SUSPENSE', en: 'thriller', ar: 'تشويق' },
  { re: /roman|love|رومان|حب|غرام/i, category: 'ROMANCE', en: 'romance', ar: 'رومانسي' },
  { re: /drama|دراما/i, category: 'DRAMA', en: 'drama', ar: 'دراما' },
];
export function genreOf(text: string | undefined): (typeof GENRES)[number] | undefined {
  return text ? GENRES.find((g) => g.re.test(text)) : undefined;
}

/** The format's own words and categories: "animated series | مسلسل كرتون", "short film | فيلم قصير", … */
function formatOf(kind: ResearchRequest['kind'], style?: Style): { en: string; ar: string; noun: { en: string; ar: string }; categories: ResearchCategory[] } {
  const look: ResearchCategory[] = style === 'CARTOON' ? ['ANIMATION'] : style === 'ANIME' ? ['ANIME'] : [];
  if (kind === 'MUSIC_VIDEO') return { en: 'music video', ar: 'فيديو كليب', noun: { en: 'music video', ar: 'كليب' }, categories: ['MUSIC_VIDEO', 'MUSIC'] };
  if (kind === 'SHORT') {
    if (style === 'CARTOON') return { en: 'animated short film', ar: 'فيلم كرتون قصير', noun: { en: 'short film', ar: 'فيلم قصير' }, categories: ['SHORT_FORM', 'ANIMATION', 'FILM'] };
    if (style === 'ANIME') return { en: 'anime short film', ar: 'انمي قصير', noun: { en: 'short film', ar: 'فيلم قصير' }, categories: ['SHORT_FORM', 'ANIME', 'FILM'] };
    return { en: 'short film', ar: 'فيلم قصير', noun: { en: 'short film', ar: 'فيلم قصير' }, categories: ['SHORT_FORM', 'FILM'] };
  }
  if (style === 'CARTOON') return { en: 'animated series', ar: 'مسلسل كرتون', noun: { en: 'series', ar: 'مسلسل' }, categories: ['SERIES', ...look] };
  if (style === 'ANIME') return { en: 'anime series', ar: 'مسلسل انمي', noun: { en: 'series', ar: 'مسلسل' }, categories: ['SERIES', ...look] };
  return { en: 'TV series', ar: 'مسلسل', noun: { en: 'series', ar: 'مسلسل' }, categories: ['SERIES'] };
}

const PLATFORMS: ResearchPlatform[] = ['TIKTOK', 'INSTAGRAM', 'YOUTUBE', 'NEWS'];
const KIND_WORDS: Record<ResearchRequest['kind'], string> = { SHOW: 'show', SEASON: 'next season', EPISODE: 'next episode', SHORT: 'short', MUSIC_VIDEO: 'music video' };

export function planTopics(req: ResearchRequest): ResearchTopic[] {
  const language = req.language;
  const region = regionOf(language, req.dialect);
  const where = REGION_NAME[region] ?? region;
  const fmt = formatOf(req.kind, req.style);
  const continuing = req.kind === 'SEASON' || req.kind === 'EPISODE';
  // a season or an episode: the show's genre decides the research, never what is trending in general
  const genreText = continuing ? req.show?.genre : req.preferences.genre ?? req.preferences.mood;
  const genre = genreOf(genreText);
  const who = `${language === 'AR' ? (req.dialect === 'IRAQI_BAGHDADI' ? 'an Iraqi Arabic' : 'an Arabic') : 'an English'} ${req.style ? `${req.style.toLowerCase()} ` : ''}${KIND_WORDS[req.kind]}${continuing && req.show ? ` of “${req.show.title}”` : ''}`;
  const words = (en: string, ar: string) => (language === 'AR' ? `${en} | ${ar}` : en);
  const topics: ResearchTopic[] = [];
  // 1) the format, where its audience is
  topics.push({
    query: words(fmt.en, fmt.ar), platforms: PLATFORMS, categories: fmt.categories, language, region,
    reason: continuing
      ? `For ${who}: what ${fmt.en} audiences in ${where} are watching now, to inform a direction for the show — not to replace it.`
      : `For ${who}: what ${fmt.en} audiences in ${where} are watching now (format, pacing, hooks).`,
  });
  // 2) the genre (the producer's, or the show's own)
  if (genre) {
    topics.push({
      query: words(`${genre.en} ${fmt.noun.en}`, `${fmt.noun.ar} ${genre.ar}`), platforms: PLATFORMS, categories: [genre.category, ...fmt.categories.slice(0, 1)], language, region,
      reason: continuing ? `The show's own genre (“${req.show?.genre}”): how ${genre.en} ${fmt.noun.en} hold their audience in ${where}.` : `The requested genre (“${genreText}”): what ${genre.en} ${fmt.noun.en} are reaching audiences in ${where}.`,
    });
  } else if (continuing && req.show?.genre?.trim()) {
    const g = req.show.genre.trim().slice(0, 40);
    topics.push({ query: words(`${g} ${fmt.noun.en}`, `${fmt.noun.ar} ${g}`), platforms: PLATFORMS, categories: fmt.categories.slice(0, 1), language, region, reason: `The show's own genre (“${g}”), so the research fits the show instead of what is trending in general.` });
  }
  // 3) measured attention: what readers of the language's Wikipedia opened yesterday
  const wiki = language === 'AR' ? 'Arabic' : 'English';
  topics.push({
    query: `top ${language === 'AR' ? 'ar' : 'en'}.wikipedia`, platforms: ['WIKIPEDIA'], categories: req.kind === 'MUSIC_VIDEO' ? ['MUSIC', 'MUSIC_VIDEO'] : ['FILM', 'SERIES', 'ANIMATION', 'ANIME'], language,
    reason: `Measured attention: which ${req.kind === 'MUSIC_VIDEO' ? 'songs and music videos' : 'films and series'} readers of ${wiki} Wikipedia opened yesterday${language === 'AR' ? ' (read across the Arab world, not Iraq alone)' : ''}.`,
  });
  return topics;
}
