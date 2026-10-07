import { z } from 'zod';
import { StudioError } from '@/domain/errors';
import { nid } from '@/domain/ids';
import { joinLyrics } from '@/domain/lyrics';
import type { Character, LyricSection, Production, Song } from '@/domain/types';
import { LYRIC_KINDS, sings, type Dialect, type VoiceType } from '@/domain/vocabulary';
import { json as llmJson, type LlmMessage, type LlmOptions, type LlmResult } from '../providers/llm';
import { ACE_KEYS } from '../workflows/music';

/** THE SONG PLAN (master plan Phase 2): the planner writes ONE song for a production — concept, structure, lyrics,
 *  tempo, key, the musical caption the song engine reads, and WHO sings each section. Only characters cast as singers
 *  (SINGER / ACTOR_SINGER) may sing; a song never claims a performer it does not name, and an actor never sings the
 *  lead. The plan becomes the production's Song; the recording is GENERATE_SONG's (src/worker/handlers/music.ts). */

/** A performer as the planner is told about them. */
export interface SongPerformer { id: string; name: string; sex: Character['sex']; voiceType?: VoiceType; styles: string[] }

/** Who may sing in a production: its cast members who sing (the given ids when the producer chose, in that order). */
export function songPerformers(cast: Character[], chosen?: string[]): SongPerformer[] {
  const singers = cast.filter((c) => sings(c.kind ?? 'ACTOR'));
  const picked = chosen?.length ? chosen.map((id) => singers.find((c) => c.id === id)).filter((c): c is Character => Boolean(c)) : singers;
  return picked.map((c) => ({ id: c.id, name: c.name, sex: c.sex, voiceType: c.singing?.voiceType, styles: c.singing?.styles ?? [] }));
}

/** The vocal the song engine is asked for, from the singers' own profiles (never a random voice): "female soprano lead
 *  vocal", a duet "male baritone and female soprano vocal duet". Pure (tested). */
export function vocalTag(performers: Array<Pick<SongPerformer, 'sex' | 'voiceType'>>): string {
  const one = (p: Pick<SongPerformer, 'sex' | 'voiceType'>) => [p.sex === 'FEMALE' ? 'female' : 'male', p.voiceType ? p.voiceType.toLowerCase().replace('_', '-') : null].filter(Boolean).join(' ');
  if (!performers.length) return '';
  if (performers.length === 1) return `${one(performers[0])} lead vocal`;
  return `${performers.slice(0, 2).map(one).join(' and ')} vocal duet`;
}

const kindOf = z.preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase().replace(/[- ]/g, '_') : v), z.enum(LYRIC_KINDS));
// a section's lines may come as one string or as a list of lines (Qwen3.8 writes both): the same words either way
const linesOf = z.preprocess((v) => (Array.isArray(v) ? v.map(String).join('\n') : v), z.string().trim().max(1200));
const SongPlanSchema = z.object({
  title: z.string().trim().min(1).max(80),
  concept: z.string().trim().min(10).max(600),
  genre: z.string().trim().min(2).max(80),
  mood: z.string().trim().min(2).max(80),
  bpm: z.coerce.number().int().min(50).max(200),
  key: z.string().trim().max(20),
  caption: z.string().trim().min(10).max(300),
  // `gloss`: an Arabic song's faithful English translation of the section, for review and subtitles (never sung)
  sections: z.array(z.object({ kind: kindOf, lyrics: linesOf, gloss: linesOf.optional(), singers: z.array(z.string().trim().min(1).max(80)).max(4).default([]) })).min(3).max(10),
});
export type SongPlan = z.infer<typeof SongPlanSchema>;

const sungLines = (lyrics: string) => lyrics.split('\n').filter((l) => l.trim()).length;

/** The language a production's song is written in: its own (Arabic with its dialect, or English). */
export interface SongLanguage { language: 'EN' | 'AR'; dialect?: Dialect }
export const songLanguageOf = (p: Pick<Production, 'language' | 'dialect'>): SongLanguage => (p.language === 'AR' ? { language: 'AR', dialect: p.dialect } : { language: 'EN' });
const isIraqiSong = (l: SongLanguage) => l.language === 'AR' && l.dialect === 'IRAQI_BAGHDADI';

/** Words strongly associated with Modern Standard Arabic, and the Baghdadi a singer would usually say instead. These
 *  are HINTS, never a verdict (producer correction 2026-10-07): formal words can be right in context — a poetic
 *  register, a quotation, a character's voice — so a hint asks the planner for a contextual dialect review
 *  (reviewIraqiDialect); it never fails a song by itself. Matched as whole words, also with an attached و/ف. */
export const MSA_IN_IRAQI: Record<string, string> = {
  'سوف': 'راح', 'لماذا': 'ليش', 'ماذا': 'شنو', 'الآن': 'هسه', 'ليس': 'مو', 'ليست': 'مو', 'لن': 'ما راح', 'لم': 'ما',
  'لكي': 'حتى', 'هكذا': 'هيچي', 'هذه': 'هاي', 'هؤلاء': 'هذوله', 'أيضا': 'هم', 'أيضاً': 'هم', 'إنني': 'آني', 'حيث': 'وين',
};
const plainArabic = (w: string) => w.replace(/[ً-ْٰـ]/g, '');
/** The MSA-associated words in an Iraqi lyric, each with its usual Baghdadi counterpart — dialect-drift HINTS for the
 *  contextual review, not a failure. Pure (tested). */
export function msaInIraqi(text: string): Array<{ word: string; say: string }> {
  const found = new Map<string, string>();
  for (const raw of text.split(/[\s\p{P}]+/u)) {
    const w = plainArabic(raw);
    const base = MSA_IN_IRAQI[w] !== undefined ? w : /^[وف]/.test(w) && MSA_IN_IRAQI[w.slice(1)] !== undefined ? w.slice(1) : undefined;
    if (base) found.set(base, MSA_IN_IRAQI[base]);
  }
  return [...found].map(([word, say]) => ({ word, say }));
}
const arabicLetters = /(?=\p{L})\p{Script=Arabic}/u;
const latinWord = /[A-Za-z]{2,}/;

/** What a song of this length holds: at most this many sections (intro and outro count), and about `lines` sung lines
 *  — one line every ~4.5 s leaves the singers room to breathe and the band its fills; more than `maxLines` (one every
 *  ~3.6 s) is crammed and refused. Pure (tested). */
export function songBudget(seconds: number): { maxSections: number; lines: number; maxLines: number } {
  return { maxSections: seconds <= 75 ? 5 : seconds <= 150 ? 8 : 10, lines: Math.round(seconds / 4.5), maxLines: Math.round(seconds / 3.6) };
}

/** The plan's schema for a song of this length: the budget is part of the answer's validity, so an over-long plan is
 *  sent back with the reason (a format repair of the same answer), never trimmed or guessed at. */
export function songPlanSchema(seconds: number, lang: SongLanguage = { language: 'EN' }) {
  const b = songBudget(seconds);
  const sung = (p: SongPlan) => p.sections.filter((s) => s.kind !== 'INSTRUMENTAL' && s.lyrics.trim());
  return SongPlanSchema
    .refine((p) => p.sections.length <= b.maxSections, { message: `at most ${b.maxSections} sections for a ${Math.round(seconds)}-second song`, path: ['sections'] })
    .refine((p) => p.sections.reduce((n, s) => n + sungLines(s.lyrics), 0) <= b.maxLines, { message: `at most ${b.maxLines} sung lines in total for a ${Math.round(seconds)}-second song (aim for about ${b.lines})`, path: ['sections'] })
    // an Arabic song is sung in Arabic script throughout (never English lyrics tagged as Arabic), with its English gloss
    .refine((p) => lang.language !== 'AR' || sung(p).every((s) => arabicLetters.test(s.lyrics) && !latinWord.test(s.lyrics)), { message: 'every sung section\'s lyrics must be in Arabic script only (no Latin letters); put the English translation in "gloss"', path: ['sections'] })
    .refine((p) => lang.language !== 'AR' || sung(p).every((s) => (s.gloss ?? '').trim().length > 0), { message: 'every sung section needs "gloss": a faithful English translation of its lyrics', path: ['sections'] });
  // the DIALECT is judged in context (reviewIraqiDialect), never by a word list in the schema
}

/** THE CONTEXTUAL DIALECT REVIEW of an Iraqi song (producer correction 2026-10-07): the whole lyric is judged for
 *  Iraqi vocabulary, grammar, Baghdadi constructions, pronouns, negation, question forms, contractions, the spelling
 *  of گ/چ, context and register. Formal or poetic wording the song's context justifies STAYS; only phrases that drift
 *  from the requested Baghdadi are rewritten, keeping meaning, rhythm and line count. The planner does the rewrite;
 *  the producer's Iraqi listening remains the authority. */
export const DialectReviewSchema = z.object({
  overall: z.enum(['BAGHDADI', 'MOSTLY_BAGHDADI', 'DRIFTED']),
  notes: z.string().trim().max(1200),
  sections: z.array(z.object({
    index: z.coerce.number().int().min(0),
    lyrics: linesOf,
    gloss: linesOf,
    changes: z.array(z.object({ from: z.string().trim().max(200), to: z.string().trim().max(200), why: z.string().trim().max(300) })).max(20).default([]),
    kept: z.array(z.object({ word: z.string().trim().max(80), why: z.string().trim().max(300) })).max(20).default([]),
  })).max(10),
});
export type DialectReview = z.infer<typeof DialectReviewSchema>;

/** The hints that ask for a review: MSA-associated words in the sung lyrics (none = no review needed). Pure (tested). */
export function dialectHints(plan: SongPlan): Array<{ word: string; say: string }> {
  return msaInIraqi(plan.sections.filter((s) => s.kind !== 'INSTRUMENTAL').map((s) => s.lyrics).join('\n'));
}

/** Apply a review to a plan: each reviewed section's lyrics and gloss replace the plan's, keeping its kind and
 *  singers; a section whose line count changed is refused (the rhythm and the budget were planned on it). Pure. */
export function applyDialectReview(plan: SongPlan, review: DialectReview): SongPlan {
  const sections = plan.sections.map((s, i) => {
    const r = review.sections.find((x) => x.index === i);
    if (!r || s.kind === 'INSTRUMENTAL' || !s.lyrics.trim()) return s;
    if (sungLines(r.lyrics) !== sungLines(s.lyrics)) throw new StudioError('PROVIDER', `The dialect review changed the number of lines in section ${i + 1} (${sungLines(s.lyrics)} → ${sungLines(r.lyrics)}).`, { failureClass: 'PROVIDER' });
    return { ...s, lyrics: r.lyrics, gloss: r.gloss };
  });
  return { ...plan, sections };
}

/** Ask the planner for the contextual review of an Iraqi song's lyrics (only when hints exist). */
export async function reviewIraqiDialect(plan: SongPlan, hints: Array<{ word: string; say: string }>, opts: LlmOptions & { onResult?: (r: LlmResult) => void } = {}): Promise<DialectReview> {
  const system: LlmMessage = { role: 'system', content: 'You are a Baghdadi Arabic lyric editor at Vewbox Studio. You review a song written to be sung in natural Iraqi (Baghdadi) Arabic. Judge the WHOLE lyric in context — vocabulary, grammar, Baghdadi constructions, pronouns, negation, question forms, contractions, the spelling of گ and چ, register — and rewrite ONLY the phrases that drift away from Baghdadi. Formal or poetic words that the song\'s context and register justify STAY (say why in "kept"). Never rewrite merely to avoid a word; keep the meaning, the rhythm and the number of lines of every section. Answer with ONE JSON object only.' };
  const lyrics = plan.sections.map((s, i) => (s.kind === 'INSTRUMENTAL' || !s.lyrics.trim() ? null : `#${i} ${s.kind}\n${s.lyrics}`)).filter(Boolean).join('\n\n');
  const user = `Song: "${plan.title}" — ${plan.concept}
Lyrics:
${lyrics}

Words a checker flagged as often Modern Standard Arabic (hints only — decide in context): ${hints.map((h) => `«${h.word}» (Baghdadi usually «${h.say}»)`).join('، ')}.
Return JSON: { overall: BAGHDADI | MOSTLY_BAGHDADI | DRIFTED (the lyric AFTER your edits), notes (in English: what you changed or kept and why), sections: [ { index (the # number), lyrics (the section's lines, revised or unchanged, one per line, same line count), gloss (its faithful English translation, one per line), changes: [ { from, to, why } ], kept: [ { word, why } ] } ] } — one entry for every sung section.`;
  const r = await llmJson(DialectReviewSchema, [system, { role: 'user', content: user }], { ...opts, maxTokens: 4000, temperature: 0.3 });
  opts.onResult?.(r.result);
  return r.data;
}

/** Ask the planner for the song. `brief`: the producer's words for this song (optional). */
export async function writeSongPlan(p: Production, performers: SongPerformer[], req: { seconds: number; brief?: string }, opts: LlmOptions & { onResult?: (r: LlmResult) => void } = {}): Promise<SongPlan> {
  if (!performers.length) throw new StudioError('INVALID', 'Nobody in this cast sings: cast a Singer or an Actor + Singer (Characters › Performs), then write the song.', { productionId: p.id, failureClass: 'INVALID_INPUT' });
  const who = performers.map((s) => `- ${s.name}: ${s.sex === 'FEMALE' ? 'woman' : 'man'}${s.voiceType ? `, ${s.voiceType.toLowerCase().replace('_', '-')}` : ''}${s.styles.length ? `, sings ${s.styles.join(', ')}` : ''}`).join('\n');
  const b = songBudget(req.seconds);
  const sectionsFor = `${req.seconds <= 75 ? '3–5 sections (verse, chorus, verse or bridge, chorus)' : req.seconds <= 150 ? '5–8 sections (intro optional, verse, chorus, verse, chorus, bridge, final chorus)' : '6–10 sections'} and about ${b.lines} sung lines in all (never more than ${b.maxLines}; the intro, outro and instrumental breaks need time too)`;
  const lang = songLanguageOf(p);
  const iraqi = isIraqiSong(lang);
  const tongue = lang.language === 'EN' ? 'English' : iraqi ? 'Iraqi (Baghdadi) Arabic' : 'Arabic';
  const system: LlmMessage = { role: 'system', content: `You are the songwriter of Vewbox Studio, an AI film studio. You write ONE original, singable ${tongue} song for a production: a clear concept, a strong memorable chorus, natural rhymes and stresses, lines a singer can breathe through. Never quote or imitate an existing song, artist or lyric. Answer with ONE JSON object only.` };
  // an Iraqi song is written the way a Baghdadi singer sings it (skills/iraqi-dialogue): dialect words, never MSA
  const dialect = iraqi ? `
WRITE IN BAGHDADI ARABIC, as a Baghdadi singer would sing it — never Modern Standard Arabic. Use Iraqi words: شلونك، هسه، شنو، ليش، وين، هواية، ماكو، اكو، باچر، گلبي، عيوني، يمّه، حبيبي، آني، إنت/إنتي، هاي، هيچي، راح، مو، ما. Write the Iraqi letters as they are sung: گ (as in گلبي، گلت) and چ (as in باچر، چا، شچان، هيچي). Use Baghdadi grammar — its pronouns, negation (ما، مو), question words (شنو، ليش، شلون، وين) and contractions — rather than Modern Standard Arabic constructions; a formal or poetic word is fine where the song's register truly calls for it. Keep the lyrics in Arabic script only (no Latin letters).
The music should feel Iraqi unless the producer asks otherwise — for example Iraqi maqam colours, oud, qanun, santur or joza, Iraqi percussion — said in the caption, in English.` : lang.language === 'AR' ? `
Write the lyrics in Arabic script only (no Latin letters).` : '';
  const lyricsSpec = lang.language === 'AR'
    ? `lyrics (the lines, one per line, in ${tongue}; empty for an instrumental section), gloss (a faithful English translation of those lines, one per line)`
    : 'lyrics (the lines, one per line, in English; empty for an instrumental section)';
  const user = `Write the song for "${p.title}" (${p.kind === 'MUSIC_VIDEO' ? 'a music video' : 'a production'}).
${p.logline ? `Logline: ${p.logline}\n` : ''}${req.brief?.trim() ? `The producer asks: """${req.brief.trim()}"""\n` : ''}Length: about ${Math.round(req.seconds)} seconds, so ${sectionsFor}.
The singers — ONLY these may sing, by these exact names:
${who}${dialect}
Return JSON: { title${lang.language === 'AR' ? ' (in Arabic)' : ''}, concept (2–3 sentences in English: what the song is about and how it feels), genre, mood, bpm (a whole number), key (like "D minor"), caption (one line in English for the music engine: genre, instruments, production and feel — no names, no lyrics), sections: [ { kind: one of ${LYRIC_KINDS.join('|')}, ${lyricsSpec}, singers: [names from the list who sing this section; the first is the lead] } ] }.
Every sung section names at least one singer from the list. Choruses repeat their words. Keep each line under 12 words.`;
  const r = await llmJson(songPlanSchema(req.seconds, lang), [system, { role: 'user', content: user }], { ...opts, maxTokens: lang.language === 'AR' ? 4000 : 3000, temperature: 0.8 });
  opts.onResult?.(r.result);
  return r.data;
}

/** The first timing of a song's sections, before the recording is aligned: each section by what it holds — its sung
 *  lines, or the room of two lines for a section without words (an intro, an outro, a break) — over `seconds`.
 *  Pure (tested). */
export function timeByContent<T extends { kind: string; text: string; textAr?: string; from: number; to: number }>(sections: T[], seconds: number): T[] {
  // the sung words: an Arabic section's are its textAr (its text is the English gloss)
  const sungText = (s: T) => (s.textAr ?? '').trim() || s.text;
  const weights = sections.map((s) => (s.kind !== 'INSTRUMENTAL' && sungText(s).trim() ? sungLines(sungText(s)) : 2));
  const total = weights.reduce((a, w) => a + w, 0) || 1;
  const at = (i: number) => Math.round((seconds * weights.slice(0, i).reduce((a, w) => a + w, 0)) / total);
  return sections.map((s, i) => ({ ...s, from: at(i), to: at(i + 1) }));
}

/** The plan as the production's Song: sections with their singers (names resolved to the cast who sing — an unknown
 *  or non-singing name is refused, never guessed), the lead first; lyrics tagged for the engine; the key valid for
 *  the engine (or dropped). Pure (tested). */
export function songFromPlan(plan: SongPlan, performers: SongPerformer[], seconds: number, previous?: Song, lang: SongLanguage = { language: 'EN' }): Song {
  const arabic = lang.language === 'AR';
  const byName = (n: string) => performers.find((s) => s.name.toLowerCase() === n.trim().toLowerCase()) ?? performers.find((s) => s.name.split(' ')[0].toLowerCase() === n.trim().split(' ')[0].toLowerCase());
  const untimed: LyricSection[] = plan.sections.map((s, i) => {
    const sung = s.kind !== 'INSTRUMENTAL' && Boolean(s.lyrics.trim());
    const ids = s.singers.map((n) => { const hit = byName(n); if (!hit && sung) throw new StudioError('PROVIDER', `The song plan gives a section to “${n}”, who is not one of this song's singers (${performers.map((x) => x.name).join(', ')}).`, { failureClass: 'PROVIDER' }); return hit?.id; }).filter((x): x is string => Boolean(x));
    if (sung && !ids.length) throw new StudioError('PROVIDER', `The song plan leaves section ${i + 1} (${s.kind.toLowerCase()}) without a singer.`, { failureClass: 'PROVIDER' });
    // an Arabic song: the sung words are textAr (what ACE-Step sings, joinLyrics prefers it); text is the English gloss
    if (arabic) return { id: nid('sec'), kind: s.kind, text: sung ? (s.gloss ?? '').trim() : '', ...(sung ? { textAr: s.lyrics.trim() } : {}), singerIds: [...new Set(ids)], from: 0, to: 0 };
    return { id: nid('sec'), kind: s.kind, text: sung ? s.lyrics.trim() : '', singerIds: [...new Set(ids)], from: 0, to: 0 };
  });
  const sections = timeByContent(untimed, seconds);
  const order = [...new Set(sections.flatMap((s) => s.singerIds))];
  const key = ACE_KEYS.find((k) => k.toLowerCase() === plan.key.trim().toLowerCase());
  return {
    id: previous?.id ?? nid('song'), title: plan.title, source: 'GENERATED_EXAMPLE', durationSeconds: Math.round(seconds),
    caption: plan.caption, sections, singerIds: order, lyrics: joinLyrics(sections), genre: plan.genre, mood: plan.mood, bpm: plan.bpm,
    ...(key ? { key } : {}), concept: plan.concept,
  };
}
