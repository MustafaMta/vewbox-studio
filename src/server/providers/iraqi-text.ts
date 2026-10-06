import type { Dialect, Language } from '@/domain/vocabulary';
import { VOICE_ENGINES, type LocalTtsEngine } from './voice-engines';
import { ONE_WORD_LEAD_IN, isOneWordLine } from '../media/lead-in';

/** LINE PREPARATION FOR THE ARABIC ENGINES — pure text, applied in `speakLine` between the script and the
 *  `/synthesize` call (docs/voice/IRAQI-EVAL-SET-2026-10.md §5; research: docs/research/VOICE-IDENTITY-V2.md §2.5
 *  "Text normalisation for Habibi"). The script itself is never rewritten: the studio keeps `textAr` as written, the
 *  verification compares the transcript with the ORIGINAL line (`normalizeIraqi` folds spelled numbers to digits on
 *  both sides), and only what the engine hears changes.
 *
 *  Why: Habibi IRQ (F5-TTS) maps every character outside its vocabulary to index 0, the space — a word is spoken with
 *  that character cut out. The vocabulary (tests/fixtures/voice/habibi-irq-vocab-chars.json, read from the model
 *  volume) has both digit sets, Arabic and Latin punctuation, the diacritics, گ چ پ ڤ and the tatweel, but NOT the
 *  curly double quotes, the zero-width joiners, the no-break space, the Persian digits ۴ ۵ ۶ or a line break. Digits
 *  are in the vocabulary but the Iraqi training text is ASR-derived speech, so «7» has no stable Baghdadi reading:
 *  numbers are spelled the way a Baghdadi says them (اثنعش، خمسطعش، ميتين وخمسين الف، سبعة ونص). IndexTTS has no
 *  Arabic normaliser either (research §2.5), so an MSA line gets MSA number words.
 *
 *  Rules, in order (each one that changes the text is named in `changes`):
 *    1. NFC; Arabic presentation forms (ﻻ ﺍ …) → base letters; zero-width marks, the Arabic letter mark and the BOM
 *       removed; no-break space → space.
 *    2. A line break ends a sentence: «.» + space when the line did not already end with . ! ? ؟ … ، ؛
 *    3. The tatweel «ـ» is removed, and a space keeps an Arabic word and a Latin word apart («الـwifi» → «ال wifi»).
 *    4. Characters the Iraqi engine does not know and would cut: “ ” „ ‟ ‹ › → removed (the Latin ' and the single
 *       curly quotes stay: they are in the vocabulary).
 *    5. Latin «?» «,» «;» next to Arabic letters → «؟» «،» «؛» (the Iraqi engine's training text uses the Arabic
 *       marks; both are in the vocabulary, the Arabic ones are what it has heard with a question's intonation);
 *       runs of «!!!» or «؟؟» → one mark.
 *    6. Numbers (both digit sets → Western first): times «7:30» → «سبعة ونص», percentages «25 %» → «خمسة وعشرين
 *       بالمية», decimals «7.5» → «سبعة ونص» / «سبعة فاصلة …», thousands separators dropped, then every integer →
 *       Iraqi words (the construct form before a following Arabic noun: «3 سنين» → «ثلاث سنين»; «1 دينار» → «دينار
 *       واحد»). Arabic (MSA) lines get MSA words; English lines keep their digits (IndexTTS reads them in English).
 *    7. Spaces collapsed, no space before a closing mark.
 *  Diacritics written by hand are KEPT (the vocabulary has them; research §2.5: no automatic diacritisation).
 *  گ چ are never mapped to ق ج for synthesis: that fold is for evaluation only. */

/** The engine the line goes to (src/server/providers/voice-engines.ts ids); only IndexTTS gets the one-word lead-in. */
export type PrepareEngine = LocalTtsEngine;
export interface PrepareOptions { engine: PrepareEngine; language: Language; dialect?: Dialect }
/** `leadIn`: the sentence spoken before a one-word IndexTTS line (src/server/media/lead-in.ts) — the handler cuts it off
 *  after synthesis at the silence before the word. */
export interface PreparedText { text: string; changes: string[]; leadIn?: string }

// ------------------------------------------------------------------------------------------------ number words

const IQ_UNITS = ['صفر', 'واحد', 'اثنين', 'ثلاثة', 'اربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة'];
/** 3–10 before a counted noun: «ثلاث سنين», «خمس دنانير», «عشر دقايق». */
const IQ_CONSTRUCT: Record<number, string> = { 3: 'ثلاث', 4: 'اربع', 5: 'خمس', 6: 'ست', 7: 'سبع', 8: 'ثمن', 9: 'تسع', 10: 'عشر' };
const IQ_TEENS = ['عشرة', 'احدعش', 'اثنعش', 'ثلطعش', 'اربعطعش', 'خمسطعش', 'سطعش', 'سبعطعش', 'ثمنطعش', 'تسعطعش'];
const IQ_TENS: Record<number, string> = { 20: 'عشرين', 30: 'ثلاثين', 40: 'اربعين', 50: 'خمسين', 60: 'ستين', 70: 'سبعين', 80: 'ثمانين', 90: 'تسعين' };
const IQ_HUNDREDS = ['', 'مية', 'ميتين', 'ثلثمية', 'اربعمية', 'خمسمية', 'ستمية', 'سبعمية', 'ثمنمية', 'تسعمية'];

function iraqiBelowThousand(n: number, beforeNoun: boolean): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100); const r = n % 100;
  if (h) parts.push(IQ_HUNDREDS[h]);
  if (r >= 11 && r <= 19) parts.push(IQ_TEENS[r - 10]);
  else if (r >= 20) { const u = r % 10; const t = r - u; parts.push(u ? `${IQ_UNITS[u]} و${IQ_TENS[t]}` : IQ_TENS[t]); }
  else if (r > 0) parts.push(beforeNoun && !h && IQ_CONSTRUCT[r] ? IQ_CONSTRUCT[r] : IQ_UNITS[r]);
  return parts.join(' و');
}

/** A whole number the Baghdadi way: «اثنعش», «خمسة وعشرين», «ميتين وخمسين الف», «الف وتسعمية وسبعة وثمانين»,
 *  «ثلاث تالاف», «مليونين». `beforeNoun`: the construct form for 3–10 («ثلاث سنين»). Beyond 999 999 999 the digits are
 *  returned as they are. */
export function iraqiNumberWords(n: number, opts: { beforeNoun?: boolean } = {}): string {
  if (!Number.isSafeInteger(n) || n < 0 || n >= 1_000_000_000) return String(n);
  if (n === 0) return IQ_UNITS[0];
  const beforeNoun = opts.beforeNoun ?? false;
  const parts: string[] = [];
  const m = Math.floor(n / 1_000_000); const k = Math.floor((n % 1_000_000) / 1000); const r = n % 1000;
  if (m) parts.push(m === 1 ? 'مليون' : m === 2 ? 'مليونين' : m <= 10 ? `${IQ_CONSTRUCT[m]} ملايين` : `${iraqiBelowThousand(m, false)} مليون`);
  if (k) parts.push(k === 1 ? 'الف' : k === 2 ? 'الفين' : k <= 10 ? `${IQ_CONSTRUCT[k]} تالاف` : k === 100 ? 'ميت الف' : `${iraqiBelowThousand(k, false)} الف`);
  if (r) parts.push(r === 100 && beforeNoun && !m && !k ? 'ميت' : iraqiBelowThousand(r, beforeNoun && !m && !k));
  return parts.join(' و');
}

const MSA_UNITS = ['صفر', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة'];
const MSA_TEENS = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const MSA_TENS: Record<number, string> = { 20: 'عشرون', 30: 'ثلاثون', 40: 'أربعون', 50: 'خمسون', 60: 'ستون', 70: 'سبعون', 80: 'ثمانون', 90: 'تسعون' };
const MSA_HUNDREDS = ['', 'مئة', 'مئتان', 'ثلاثمئة', 'أربعمئة', 'خمسمئة', 'ستمئة', 'سبعمئة', 'ثمانمئة', 'تسعمئة'];
function msaBelowThousand(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100); const r = n % 100;
  if (h) parts.push(MSA_HUNDREDS[h]);
  if (r >= 11 && r <= 19) parts.push(MSA_TEENS[r - 10]);
  else if (r >= 20) { const u = r % 10; parts.push(u ? `${MSA_UNITS[u]} و${MSA_TENS[r - u]}` : MSA_TENS[r]); }
  else if (r > 0) parts.push(MSA_UNITS[r]);
  return parts.join(' و');
}

/** A whole number in Modern Standard Arabic (nominative, the reading form): «اثنا عشر», «خمسة وعشرون», «مئتان وخمسون
 *  ألفاً» is written «مئتان وخمسون ألف» (no case endings: the engine would read them as letters). */
export function msaNumberWords(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0 || n >= 1_000_000_000) return String(n);
  if (n === 0) return MSA_UNITS[0];
  const parts: string[] = [];
  const m = Math.floor(n / 1_000_000); const k = Math.floor((n % 1_000_000) / 1000); const r = n % 1000;
  if (m) parts.push(m === 1 ? 'مليون' : m === 2 ? 'مليونان' : m <= 10 ? `${MSA_UNITS[m]} ملايين` : `${msaBelowThousand(m)} مليون`);
  if (k) parts.push(k === 1 ? 'ألف' : k === 2 ? 'ألفان' : k <= 10 ? `${MSA_UNITS[k]} آلاف` : `${msaBelowThousand(k)} ألف`);
  if (r) parts.push(msaBelowThousand(r));
  return parts.join(' و');
}

type NumberStyle = 'IRAQI' | 'MSA' | 'NONE';

/** A clock time as said: Iraqi «سبعة ونص», «سبعة وربع», «ثمانية الا ربع», «سبعة وثلث», «سبعة وعشر دقايق»;
 *  MSA «السابعة والنصف» is avoided (ordinal hours need agreement): «سبعة والنصف», «سبعة والربع», «ثمانية إلا ربع». */
export function timeWords(hour: number, minute: number, style: Exclude<NumberStyle, 'NONE'>): string {
  const h12 = (h: number) => { const x = h % 12; return x === 0 ? 12 : x; };
  const iq = style === 'IRAQI';
  const num = (n: number, beforeNoun = false) => (iq ? iraqiNumberWords(n, { beforeNoun }) : msaNumberWords(n));
  const h = num(h12(hour)); const next = num(h12(hour + 1));
  if (minute === 0) return h;
  if (minute === 30) return `${h} ${iq ? 'ونص' : 'والنصف'}`;
  if (minute === 15) return `${h} ${iq ? 'وربع' : 'والربع'}`;
  if (minute === 45) return `${next} ${iq ? 'الا ربع' : 'إلا ربع'}`;
  if (iq && minute === 20) return `${h} وثلث`;
  if (iq && minute === 40) return `${next} الا ثلث`;
  const unit = minute === 1 ? 'دقيقة' : minute === 2 ? (iq ? 'دقيقتين' : 'دقيقتان') : minute <= 10 ? (iq ? 'دقايق' : 'دقائق') : 'دقيقة';
  return `${h} و${num(minute, true)} ${unit}`;
}

// ------------------------------------------------------------------------------------------------ the preparation

const ARABIC_LETTER = /[ؠ-يٮ-ۓۺ-ۿ]/u;
const isArabicWord = (w: string) => ARABIC_LETTER.test(w) && !/[0-9]/.test(w);

/** Digits of both Arabic sets → Western. */
export const westernDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

function spellNumbers(text: string, style: NumberStyle, changes: string[]): string {
  if (style === 'NONE') return text;
  const num = (n: number, beforeNoun = false) => (style === 'IRAQI' ? iraqiNumberWords(n, { beforeNoun }) : msaNumberWords(n));
  let t = westernDigits(text);
  if (t !== text) changes.push('Arabic digits → Western');
  if (!/[0-9]/.test(t)) return t;
  const before = t;
  // thousands separators: 1,000 / 1٬000 / 1.000 (three digits after the mark)
  t = t.replace(/(\d)[,٬.](?=\d{3}(?!\d))/g, '$1');
  // times: 7:30, 19:05 (an hour 0–23, two minute digits)
  t = t.replace(/(?<![\d.])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/g, (_, h: string, m: string) => timeWords(Number(h), Number(m), style));
  // percentages
  t = t.replace(/(\d+(?:[.,]\d+)?)\s*[%٪]/g, (_, n: string) => `${decimalWords(n, num, style)} ${style === 'IRAQI' ? 'بالمية' : 'بالمئة'}`);
  // decimals
  t = t.replace(/(?<![\d.])(\d+)[.,](\d+)(?![\d.])/g, (_, a: string, b: string) => decimalWords(`${a}.${b}`, num, style));
  // integers, with the construct form before a following Arabic word («3 سنين») and «1 X» → «X واحد»
  t = t.replace(/(?<![\p{L}\d])(\d+)(?!\d)(\s+)(\S+)?/gu, (whole, d: string, sp: string, nextWord?: string) => {
    const n = Number(d);
    if (!Number.isSafeInteger(n)) return whole;
    const noun = nextWord && isArabicWord(nextWord) && !/^[،؛؟!.…,;?]/.test(nextWord) && !/^و/.test(nextWord) ? nextWord : undefined;
    if (noun && n === 1 && style === 'IRAQI') return `${noun} واحد${sp}`;
    return `${num(n, Boolean(noun))}${sp}${nextWord ?? ''}`;
  });
  t = t.replace(/(?<![\p{L}\d])(\d+)(?![\d\p{L}])/gu, (d) => num(Number(d)));
  if (t !== before) changes.push(`numbers spelled in ${style === 'IRAQI' ? 'Iraqi' : 'MSA'} words`);
  return t;
}

function decimalWords(raw: string, num: (n: number, beforeNoun?: boolean) => string, style: NumberStyle): string {
  const [a, b] = raw.replace(',', '.').split('.');
  if (b === undefined || b === '') return num(Number(a));
  if (b === '5') return `${num(Number(a))} ${style === 'IRAQI' ? 'ونص' : 'ونصف'}`;
  return `${num(Number(a))} فاصلة ${b.split('').map((c) => num(Number(c))).join(' ')}`;
}

/** What the engine hears for a line: see the header. Pure. */
export function prepareLineText(text: string, opts: PrepareOptions): PreparedText {
  const changes: string[] = [];
  const original = text;
  let t = text.normalize('NFC');
  // 1. presentation forms, invisible marks
  const forms = t.replace(/[ﭐ-﷿ﹰ-﻿]/g, (c) => c.normalize('NFKC'));
  if (forms !== t) { changes.push('Arabic presentation forms → letters'); t = forms; }
  const marks = t.replace(/[​-‏؜﻿⁠]/g, '').replace(/ /g, ' ');
  if (marks !== t) { changes.push('zero-width marks removed'); t = marks; }
  // 2. line breaks end sentences
  if (/\r?\n/.test(t)) {
    t = t.split(/\r?\n+/).map((l) => l.trim()).filter(Boolean).map((l, i, all) => (i < all.length - 1 && !/[.!?؟…،؛]$/.test(l) ? `${l}.` : l)).join(' ');
    changes.push('line breaks → sentence breaks');
  }
  // 3. tatweel, Arabic/Latin boundary
  if (t.includes('ـ')) { t = t.replace(/ـ+/g, ''); changes.push('tatweel removed'); }
  const spaced = t.replace(/([ؠ-يٮ-ۓ])(?=[A-Za-zÀ-ɏ])/gu, '$1 ').replace(/([A-Za-zÀ-ɏ])(?=[ؠ-يٮ-ۓ])/gu, '$1 ');
  if (spaced !== t) { changes.push('space between Arabic and Latin words'); t = spaced; }
  // 4. characters the Iraqi engine would cut
  const quotes = t.replace(/[“”„‟‹›]/g, '');
  if (quotes !== t) { changes.push('curly double quotes removed'); t = quotes; }
  // 5. Arabic punctuation marks after Arabic letters, runs of marks
  if (opts.language === 'AR') {
    const marksAr = t.replace(/(?<=[ؠ-يٮ-ۓ][\sً-ْ]*)\?/gu, '؟').replace(/(?<=[ؠ-يٮ-ۓ][ً-ْ]*),/gu, '،').replace(/(?<=[ؠ-يٮ-ۓ][ً-ْ]*);/gu, '؛');
    if (marksAr !== t) { changes.push('Latin ? , ; → Arabic ؟ ، ؛'); t = marksAr; }
  }
  const runs = t.replace(/([!؟?])\1+/g, '$1');
  if (runs !== t) { changes.push('repeated marks collapsed'); t = runs; }
  // 6. numbers
  const style: NumberStyle = opts.language !== 'AR' ? 'NONE' : opts.dialect === 'IRAQI_BAGHDADI' ? 'IRAQI' : 'MSA';
  t = spellNumbers(t, style, changes);
  // 7. spacing
  t = t.replace(/\s+([،؛؟!?.,;:])/g, '$1').replace(/\s+/g, ' ').trim();
  // 8. a one-word line on IndexTTS is spoken after a lead-in sentence and cut after synthesis (lead-in.ts): alone, the
  //    engine runs on past the word into an invented syllable (MODEL-EVAL-2026-10 §4, open item 7)
  if (VOICE_ENGINES[opts.engine]?.oneWordLeadIn && isOneWordLine(t)) return { text: `${ONE_WORD_LEAD_IN} ${t}`, changes: [...changes, 'one-word line: spoken after a lead-in sentence, cut after synthesis'], leadIn: ONE_WORD_LEAD_IN };
  if (t === original) return { text: original, changes: [] };
  return { text: t, changes };
}
