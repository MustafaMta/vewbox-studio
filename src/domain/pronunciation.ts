import type { Dialect, Language } from './vocabulary';
import { StudioError } from './errors';

/** THE PRONUNCIATION DICTIONARY (docs/VOICE-ENGINE.md §Iraqi text). A word as the script writes it, and how the
 *  engine should hear it written ("say"): a Baghdadi spelling for a word an engine reads the MSA way, a name spelled
 *  out, an English loanword in Arabic letters. The script is never rewritten — only what the engine hears.
 *
 *  THE NATIVE REVIEW RULE: an entry takes effect only when a NATIVE reviewer approved it. Anyone may propose; nobody's
 *  proposal is spoken until a native speaker of that language (and dialect) says it is right. A rejection is kept, so
 *  the same wrong spelling is not proposed again unseen. Pure. */

export type PronunciationStatus = 'PROPOSED' | 'APPROVED' | 'REJECTED';

export interface PronunciationReview { by: string; native: boolean; verdict: 'APPROVED' | 'REJECTED'; note?: string; at: string }

export interface PronunciationEntry {
  id: string;
  /** the word as the script writes it (matched as a whole word, with an attached و / ف / ب / ل / ال in front) */
  word: string;
  /** what the engine hears instead */
  say: string;
  language: Language;
  dialect?: Dialect;
  /** the engines it applies to; absent = every engine for that language */
  engines?: string[];
  note?: string;
  status: PronunciationStatus;
  proposedBy: string;
  proposedAt: string;
  reviews: PronunciationReview[];
}

export interface PronunciationInput { word: string; say: string; language: Language; dialect?: Dialect; engines?: string[]; note?: string; proposedBy: string }

const clean = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim();

/** A new entry from a proposal: PROPOSED until a native reviewer approves it. */
export function proposePronunciation(list: readonly PronunciationEntry[], id: string, input: PronunciationInput, at: string): PronunciationEntry {
  const word = clean(input.word); const say = clean(input.say);
  if (!word || !say) throw new StudioError('INVALID', 'A pronunciation needs the word and how it is said.');
  if (word === say) throw new StudioError('INVALID', 'The spelling to say is the same as the word: nothing would change.');
  if (/\s/.test(word) && word.split(' ').length > 4) throw new StudioError('INVALID', 'A pronunciation covers a word or a short phrase (at most four words).');
  const open = list.find((e) => e.word === word && e.language === input.language && (e.dialect ?? null) === (input.dialect ?? null) && e.status !== 'REJECTED');
  if (open) throw new StudioError('CONFLICT', `«${word}» already has ${open.status === 'APPROVED' ? 'an approved' : 'a proposed'} pronunciation («${open.say}»).`, { entryId: open.id });
  return { id, word, say, language: input.language, ...(input.dialect ? { dialect: input.dialect } : {}), ...(input.engines?.length ? { engines: input.engines } : {}), ...(input.note?.trim() ? { note: input.note.trim() } : {}), status: 'PROPOSED', proposedBy: clean(input.proposedBy) || 'producer', proposedAt: at, reviews: [] };
}

/** A reviewer's verdict. Only a native reviewer's approval approves; a non-native approval is recorded and changes
 *  nothing; any rejection rejects. */
export function reviewPronunciation(e: PronunciationEntry, review: Omit<PronunciationReview, 'at'>, at: string): PronunciationEntry {
  if (!clean(review.by)) throw new StudioError('INVALID', 'A review names the reviewer.');
  const rec: PronunciationReview = { by: clean(review.by), native: review.native, verdict: review.verdict, ...(review.note?.trim() ? { note: review.note.trim() } : {}), at };
  const status: PronunciationStatus = review.verdict === 'REJECTED' ? 'REJECTED' : review.native ? 'APPROVED' : e.status;
  return { ...e, status, reviews: [...e.reviews, rec] };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ARABIC_PREFIX = '(?:و|ف|ب|ل|ال|وال|بال|فال|لل)?';

/** The approved entries that apply to a line on `engine`. */
export function activePronunciations(list: readonly PronunciationEntry[] | undefined, opts: { language: Language; dialect?: Dialect; engine: string }): PronunciationEntry[] {
  return (list ?? []).filter((e) => e.status === 'APPROVED' && e.reviews.some((r) => r.native && r.verdict === 'APPROVED') && e.language === opts.language && (!e.dialect || e.dialect === opts.dialect) && (!e.engines?.length || e.engines.includes(opts.engine)));
}

/** Apply the approved entries to what the engine hears: whole words only (an Arabic word keeps an attached prefix),
 *  longest word first. Returns the text and what was changed. */
export function applyPronunciations(text: string, list: readonly PronunciationEntry[] | undefined, opts: { language: Language; dialect?: Dialect; engine: string }): { text: string; applied: Array<{ id: string; word: string; say: string }> } {
  const active = activePronunciations(list, opts).sort((a, b) => b.word.length - a.word.length);
  let t = text;
  const applied: Array<{ id: string; word: string; say: string }> = [];
  for (const e of active) {
    const arabic = /[؀-ۿ]/.test(e.word);
    const re = arabic
      ? new RegExp(`(^|[^\\p{L}\\p{M}])(${ARABIC_PREFIX})${escape(e.word)}(?=$|[^\\p{L}\\p{M}])`, 'gu')
      : new RegExp(`(^|[^\\p{L}])()${escape(e.word)}(?=$|[^\\p{L}])`, 'giu');
    const next = t.replace(re, (_m, pre: string, prefix: string) => `${pre}${prefix}${e.say}`);
    if (next !== t) { applied.push({ id: e.id, word: e.word, say: e.say }); t = next; }
  }
  return { text: t, applied };
}
