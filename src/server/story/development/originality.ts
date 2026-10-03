import type { Concept, OriginalityCheck, ResearchItem } from '@/domain/development';

/** ORIGINALITY, CHECKED IN CODE (contract §4) — research informs, it is never copied. A concept fails when its title is
 *  too close to a researched title (normalised token similarity), or when it names a researched title, a creator or
 *  channel the research recorded, or a well-known franchise. A failing concept is never chosen. English and Arabic
 *  are normalised alike (case, diacritics, alef/ya/ta-marbuta forms, the definite article). */

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'at', 'to', 'for', 'with', 'from', 'by', 'is', 'his', 'her', 'their', 'film', 'series', 'season', 'episode', 'movie', 'tv', 'show', 'part', 'official', 'video', 'music',
  'في', 'من', 'على', 'الى', 'إلى', 'عن', 'مع', 'و', 'يا', 'هذا', 'هذه', 'فلم', 'فيلم', 'مسلسل', 'الموسم', 'موسم', 'حلقة', 'الحلقة']);

/** Lower case, no diacritics or tatweel, one form of alef / ya / ta marbuta / hamza carriers, letters and digits only. */
export function normalise(s: string): string {
  return s.toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[ؤ]/g, 'و').replace(/[ئ]/g, 'ي')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
/** Meaningful tokens: no stop words, the Arabic definite article dropped. */
export function tokens(s: string): string[] {
  return normalise(s).split(' ').map((t) => (t.length > 3 && t.startsWith('ال') ? t.slice(2) : t)).filter((t) => t.length > 1 && !STOP.has(t));
}
/** Dice similarity of two token sets, 0…1. */
export function similarity(a: string, b: string): number {
  const x = new Set(tokens(a)); const y = new Set(tokens(b));
  if (!x.size || !y.size) return 0;
  let common = 0; for (const t of x) if (y.has(t)) common++;
  return (2 * common) / (x.size + y.size);
}
/** True when `phrase` appears in `text` as whole words (after normalisation). */
export function containsPhrase(text: string, phrase: string): boolean {
  const p = tokens(phrase).join(' ');
  if (!p) return false;
  return ` ${tokens(text).join(' ')} `.includes(` ${p} `);
}

/** Franchises and studio brands a concept may never borrow (English and the Arabic forms audiences use). */
export const FRANCHISES = ['pixar', 'disney', 'dreamworks', 'marvel', 'dc comics', 'star wars', 'harry potter', 'pokemon', 'naruto', 'one piece', 'dragon ball', 'spongebob', 'tom and jerry', 'mickey mouse', 'frozen', 'toy story', 'shrek', 'minions', 'despicable me', 'barbie', 'batman', 'spider man', 'spiderman', 'superman', 'avengers', 'squid game', 'game of thrones', 'stranger things', 'breaking bad', 'the simpsons', 'family guy', 'peppa pig', 'paw patrol', 'bluey', 'cocomelon', 'masha and the bear', 'doraemon', 'detective conan', 'attack on titan', 'captain tsubasa', 'grendizer', 'demon slayer', 'jujutsu kaisen',
  'ديزني', 'بيكسار', 'مارفل', 'باتمان', 'سبايدر مان', 'سوبرمان', 'توم وجيري', 'ميكي ماوس', 'سبونج بوب', 'بوكيمون', 'ناروتو', 'ون بيس', 'دراغون بول', 'المحقق كونان', 'كابتن ماجد', 'غرندايزر', 'ماشا والدب', 'باو باترول'];

/** A researched title is named in a concept only when it is distinctive: two words or more, or one long word. */
const distinctive = (title: string) => { const t = tokens(title); return t.length >= 2 || (t.length === 1 && t[0].length >= 7); };

export const SIMILARITY_LIMIT = 0.6;

export function checkOriginality(c: Pick<Concept, 'id' | 'title' | 'logline' | 'hook'> & { gloss?: { title?: string; logline?: string; hook?: string } }, items: ResearchItem[]): OriginalityCheck {
  const text = [c.title, c.logline, c.hook, c.gloss?.title, c.gloss?.logline, c.gloss?.hook].filter(Boolean).join(' \n ');
  const titles = [c.title, c.gloss?.title].filter((x): x is string => Boolean(x));
  let closest: OriginalityCheck['closest'];
  let tooClose: OriginalityCheck['closest'];
  for (const it of items) {
    const sim = Math.max(...titles.map((t) => similarity(t, it.title)));
    const entry = { itemId: it.id, title: it.title, similarity: Math.round(sim * 100) / 100 };
    if (!closest || sim > closest.similarity) closest = entry;
    // a one-word researched title ("War") is too close only to the same word, not to every title that uses it
    const theirs = tokens(it.title);
    const same = titles.some((t) => tokens(t).join(' ') === theirs.join(' '));
    if (sim >= SIMILARITY_LIMIT && (theirs.length >= 2 || same) && (!tooClose || sim > tooClose.similarity)) tooClose = entry;
  }
  const named = items.find((it) => distinctive(it.title) && containsPhrase(text, it.title));
  if (named) return { conceptId: c.id, ok: false, closest, note: `names a researched title (“${named.title}”)` };
  const creator = items.find((it) => it.creator && tokens(it.creator).join('').length >= 4 && containsPhrase(text, it.creator.replace(/^@/, '')));
  if (creator) return { conceptId: c.id, ok: false, closest, note: `names a creator or publisher the research recorded (“${creator.creator}”)` };
  const franchise = FRANCHISES.find((f) => containsPhrase(text, f));
  if (franchise) return { conceptId: c.id, ok: false, closest, note: `borrows a franchise (“${franchise}”)` };
  if (tooClose) return { conceptId: c.id, ok: false, closest: tooClose, note: `its title is too close to “${tooClose.title}” (similarity ${tooClose.similarity})` };
  return { conceptId: c.id, ok: true, closest, note: closest ? `closest researched title: “${closest.title}” (similarity ${closest.similarity})` : 'no researched titles to compare with' };
}
