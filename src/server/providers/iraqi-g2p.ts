/** THE IRAQI PHONEME / TEXT FRONTEND (the producer's master directive, 2026-10-10 §9): the dialogue text is never
 *  changed; from it the studio derives an INTERNAL pronunciation representation (Muslim Baghdadi, gilit) for the Vewbox-IQ
 *  training data's phonetic form, the regression checks and the phoneme gate. Lexicon first (the brief's regression
 *  vocabulary, docs/research/iraqi-speech-and-singing-brief.md §1.3), then clitic stripping, then letter rules:
 *    چ → tʃ   گ → ɡ   پ → p   ڤ → v   ق → ɡ (q in the learned/religious words of the q-list; k in وقت-type words)
 *    ج → dʒ   ك → k   ض → ðˤ (merged with ظ)   ث → θ   ذ → ð   ة → a (final)   the article's l assimilates to sun letters
 *  Short vowels are written only where the text carries diacritics or the lexicon knows the word: the representation is
 *  consonants + long vowels + known short vowels, enough for the regression and coverage checks; it is NOT fed to an
 *  engine (Vewbox-IQ is trained on the Arabic script with its dialect letters: `engineText`). Pure, tested. */

export interface Pronounced { word: string; ipa: string; source: 'LEXICON' | 'LEXICON_STEM' | 'RULES'; notes: string[] }
export interface Pronunciation { original: string; engineText: string; words: Pronounced[]; ipa: string }

/** The regression vocabulary with its IPA (the brief §1.3; multi-word phrases included). */
export const IRAQI_LEXICON: Record<string, string> = {
  'باچر': 'ˈbaːtʃir', 'نحچي': 'ˈniħtʃi', 'چاي': 'tʃaːj', 'چنت': 'ˈtʃinit', 'چان': 'tʃaːn', 'چانت': 'ˈtʃaːnat', 'چبير': 'tʃiˈbiːr', 'چم': 'tʃam', 'چلب': 'ˈtʃalib', 'چذاب': 'tʃaðˈðaːb', 'چفچير': 'tʃafˈtʃiːr', 'چيس': 'tʃiːs', 'هيچ': 'heːtʃ', 'شلونچ': 'ʃˈloːnitʃ', 'بيتچ': 'ˈbeːtitʃ',
  'گلت': 'ˈɡilit', 'گلتلك': 'ˈɡitlak', 'گلتلي': 'ˈɡitli', 'گال': 'ɡaːl', 'يگول': 'jiˈɡuːl', 'اگلك': 'aˈɡulːak', 'گدام': 'ɡidˈdaːm', 'گام': 'ɡaːm', 'گعد': 'ˈɡiʕad', 'يگعد': 'ˈjiɡʕud', 'نگعد': 'ˈniɡʕud', 'نكعد': 'ˈniɡʕud', 'گاعد': 'ˈɡaːʕid', 'گلب': 'ˈɡalub', 'گمر': 'ˈɡumar', 'گهوة': 'ˈɡahwa', 'شگد': 'ʃˈɡad', 'گدر': 'ˈɡidar', 'دگيگة': 'daˈɡiːɡa',
  'وكت': 'ˈwakit', 'وقت': 'ˈwakit', 'كتل': 'ˈkital', 'قتل': 'ˈkital', 'حقيقة': 'ħaˈqiːqa', 'مستقبل': 'musˈtaqbal', 'قانون': 'qaːˈnuːn', 'قرآن': 'qurˈʔaːn', 'ثقافة': 'θaˈqaːfa',
  'پرده': 'ˈparda', 'پنكة': 'ˈpanka', 'پاچة': 'ˈpaːtʃa', 'پايسكل': 'paːjˈsikil', 'ڤيزا': 'ˈviːza', 'ڤيديو': 'ˈvidjo', 'ڤيلا': 'ˈviːla',
  'شلونك': 'ʃˈloːnak', 'هسه': 'ˈhassa', 'يمعود': 'jamˈʕawwad', 'كلشي': 'ˈkulːʃi', 'ماكو': 'ˈmaːku', 'اكو': 'ˈaku', 'شكو': 'ˈʃaku', 'شنو': 'ˈʃinu', 'وين': 'weːn', 'وينك': 'ˈweːnak', 'ليش': 'liɛːʃ', 'شوكت': 'ʃˈwakit', 'شبيك': 'ʃˈbiːk', 'شدتسوي': 'ʃdatˈsawwi', 'شدعوة': 'ʃˈdaʕwa', 'شسمه': 'ˈʃisma', 'مدري': 'ˈmadri', 'ماريد': 'maˈriːd', 'مو': 'muː', 'داروح': 'daˈruːħ', 'راح': 'raːħ', 'اروح': 'aˈruːħ', 'نروح': 'niˈruːħ', 'يعني': 'ˈjaʕni', 'لعد': 'laˈʕad', 'بس': 'bas', 'هواية': 'ˈhwaːja', 'شوية': 'ʃˈwajja', 'خوش': 'xoːʃ', 'زين': 'zeːn', 'ضيف': 'ðˤeːf', 'صار': 'sˤaːr', 'سار': 'saːr', 'صارلي': 'ˈsˤaːrli', 'عيني': 'ˈʕeːni', 'يابه': 'ˈjaːba', 'عاشت': 'ˈʕaːʃat', 'ايدك': 'ˈiːdak', 'الله': 'ˈaɫɫa', 'بالخير': 'bilˈxeːr', 'تدلل': 'tdalˈlal', 'اوكي': 'ˈʔoːkeː', 'سوري': 'ˈsoːri', 'لابتوب': 'ˈlaːbtoːb',
  'شايفك': 'ˈʃaːjfak', 'ونشرب': 'wˈniʃrab', 'نشرب': 'ˈniʃrab', 'تشيل': 'tˈʃiːl', 'هم': 'ham', 'يصير': 'jiˈsˤiːr', 'لازم': 'ˈlaːzim', 'قبل': 'ˈɡabul', 'يتغير': 'jitˈɣajjar', 'الجو': 'ildʒˈdʒaw', 'آني': 'ˈaːni', 'يمك': 'ˈjammak', 'لا': 'laː', 'ما': 'maː', 'يا': 'jaː',
};

/** Words that keep MSA /q/ in Baghdadi (learned, abstract, religious) — the q-list of the brief (H3); extended by data. */
export const Q_WORDS = new Set(['حقيقة', 'مستقبل', 'قانون', 'قرآن', 'ثقافة', 'اقتصاد', 'قضية', 'قرار', 'تقرير', 'قيمة', 'موسيقى', 'قناة', 'قسم', 'مقابلة', 'قصيدة', 'قصة', 'دقيقة']);

const LETTER: Record<string, string> = {
  'چ': 'tʃ', 'گ': 'ɡ', 'پ': 'p', 'ڤ': 'v', 'ج': 'dʒ', 'ك': 'k', 'ق': 'ɡ', 'ض': 'ðˤ', 'ظ': 'ðˤ', 'ط': 'tˤ', 'ص': 'sˤ', 'ث': 'θ', 'ذ': 'ð', 'ع': 'ʕ', 'غ': 'ɣ', 'ح': 'ħ', 'خ': 'x', 'ه': 'h', 'ء': 'ʔ', 'أ': 'ʔa', 'إ': 'ʔi', 'آ': 'ʔaː', 'ؤ': 'ʔ', 'ئ': 'ʔ',
  'ب': 'b', 'ت': 't', 'د': 'd', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'ʃ', 'ف': 'f', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ا': 'aː', 'و': 'w', 'ي': 'j', 'ى': 'aː', 'ة': 'a',
};
const SUN = new Set(['ت', 'ث', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ل', 'ن', 'چ']);
const DIACRITIC: Record<string, string> = { 'َ': 'a', 'ُ': 'u', 'ِ': 'i', 'ّ': 'ː', 'ْ': '', 'ً': 'an', 'ٌ': 'un', 'ٍ': 'in' };
const PREFIXES = ['وال', 'بال', 'لل', 'ال', 'و', 'ب', 'ل', 'ف', 'ع'];
const SUFFIXES = ['هم', 'كم', 'ها', 'نا', 'ك', 'چ', 'ه', 'ي'];
const PREFIX_IPA: Record<string, string> = { 'وال': 'wil', 'بال': 'bil', 'لل': 'lil', 'ال': 'il', 'و': 'w', 'ب': 'b', 'ل': 'l', 'ف': 'f', 'ع': 'ʕa' };
const SUFFIX_IPA: Record<string, string> = { 'هم': 'hum', 'كم': 'kum', 'ها': 'ha', 'نا': 'na', 'ك': 'ak', 'چ': 'itʃ', 'ه': 'a', 'ي': 'i' };

const strip = (w: string) => w.replace(/[ـ​-‏﻿]/g, '');
const letters = (w: string) => w.replace(/[ً-ْٰ]/g, '');

/** The engine-facing text: the dialogue as written, only invisible marks and tatweel removed — the dialect letters and the
 *  spelling are the producer's and stay (never a respelling to help a model). */
export const engineText = (text: string) => text.replace(/[ـ​-‏‪-‮﻿]/g, '').replace(/\s+/g, ' ').trim();

/** Letter rules for one word (no lexicon entry): the article assimilates, final ة → a, ق per the q-list, diacritics kept. */
function byRules(word: string, notes: string[]): string {
  let w = strip(word);
  let out = '';
  if (letters(w).startsWith('ال') && letters(w).length > 3) {
    const after = letters(w)[2];
    out += SUN.has(after) ? `i${LETTER[after] ?? after}` : 'il';
    w = w.slice(2);
    if (SUN.has(after)) { notes.push('article assimilated'); w = w.slice(1); }
  }
  const bare = letters(w);
  const q = bare.includes('ق') ? (Q_WORDS.has(bare) ? 'q' : 'ɡ') : null;
  if (q === 'ɡ') notes.push('ق → ɡ (Baghdadi; not in the q-list)');
  if (q === 'q') notes.push('ق kept /q/ (q-list)');
  const chars = [...w];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const last = i === chars.length - 1 || /[ً-ْ]/.test(chars[i + 1] ?? '') && i === chars.length - 2;
    if (DIACRITIC[ch] !== undefined) { out += DIACRITIC[ch]; continue; }
    if (ch === 'ق') { out += q ?? 'ɡ'; continue; }
    if (ch === 'ة') { out += 'a'; continue; }
    if (ch === 'و' && i > 0 && !/[َُِ]/.test(chars[i - 1] ?? '') && !last) { out += 'uː'; notes.push('و read as a long vowel'); continue; }
    if (ch === 'ي' && i > 0 && !/[َُِ]/.test(chars[i - 1] ?? '') && !last) { out += 'iː'; notes.push('ي read as a long vowel'); continue; }
    if (ch === 'ا' && i === 0) { out += 'a'; continue; }
    out += LETTER[ch] ?? ch;
  }
  return out;
}

function one(word: string): Pronounced {
  const notes: string[] = [];
  const bare = letters(strip(word));
  if (IRAQI_LEXICON[bare]) return { word, ipa: IRAQI_LEXICON[bare], source: 'LEXICON', notes };
  // a clitic around a known stem: و-/ب-/ل-/ال- before, -ك/-چ/-ه/-ها/-هم/-نا/-ي after
  for (const p of ['', ...PREFIXES]) {
    if (p && !bare.startsWith(p)) continue;
    const rest = bare.slice(p.length);
    for (const s of ['', ...SUFFIXES]) {
      if (s && !rest.endsWith(s)) continue;
      const stem = s ? rest.slice(0, -s.length) : rest;
      if (stem !== bare && stem.length >= 2 && IRAQI_LEXICON[stem]) {
        if (p) notes.push(`prefix ${p}`); if (s) notes.push(`clitic -${s}`);
        let prefix = p ? PREFIX_IPA[p] : '';
        // the article's l assimilates to a sun letter (الچاي → itʃtʃaːj, الشاي → iʃʃaːj)
        if (p.endsWith('ال') && SUN.has(stem[0])) { const onset = /^ˈ?([^aeiouɛəː\s]+)/.exec(IRAQI_LEXICON[stem])?.[1] ?? ''; prefix = `${prefix.slice(0, -2)}i${onset}`; notes.push('article assimilated'); }
        return { word, ipa: `${prefix}${IRAQI_LEXICON[stem]}${s ? SUFFIX_IPA[s] : ''}`, source: 'LEXICON_STEM', notes };
      }
    }
  }
  return { word, ipa: byRules(word, notes), source: 'RULES', notes };
}

/** The pronunciation of a line: per word, lexicon → stem+clitics → rules; punctuation becomes phrase breaks (|). */
export function pronounce(text: string): Pronunciation {
  const engine = engineText(text);
  const words: Pronounced[] = [];
  const parts: string[] = [];
  for (const tok of engine.split(/\s+/)) {
    const m = /^([^\p{L}\p{M}]*)([\p{L}\p{M}]+)([^\p{L}\p{M}]*)$/u.exec(tok);
    if (!m) { if (/[،,؛;:!؟?.]/.test(tok)) parts.push('|'); continue; }
    const w = one(m[2]);
    words.push(w);
    parts.push(w.ipa + (/[،,؛;:!؟?.]/.test(m[3]) ? ' |' : ''));
  }
  return { original: text, engineText: engine, words, ipa: parts.join(' ').replace(/\s+\|/g, ' |').trim() };
}

/** PRONOUNCED IRAQI SPELLING for the ENGINE-FACING training transcript (the research decision: grapheme input, one letter
 *  per sound — گ چ پ ڤ as sounded). A corpus written in standard orthography (the Omnilingual rows: قلت، كان، باكر) is
 *  respelled WORD BY WORD only where the lexicon knows the Baghdadi word (قلت → گلت, كان → چان, باكر → باچر, شاي → چاي), with
 *  the article and the common clitics around it; every other word is left as written (a ق that may be /q/ stays). The
 *  dialogue a producer writes is NEVER respelled (engineText): this is for training data only. Pure. */
const STANDARD_OF: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const w of Object.keys(IRAQI_LEXICON)) {
    if (!/[گچپڤ]/.test(w)) continue;
    const std = w.replace(/گ/g, 'ق').replace(/چ/g, 'ك').replace(/پ/g, 'ب').replace(/ڤ/g, 'ف');
    if (std !== w && !(std in m)) m[std] = w;
  }
  // a few words the standard orthography spells with another letter again
  m['باكر'] = 'باچر'; m['قدام'] = 'گدام'; m['قعد'] = 'گعد'; m['يقعد'] = 'يگعد'; m['نقعد'] = 'نگعد'; m['شاي'] = 'چاي';
  return m;
})();
export function pronouncedSpelling(text: string): { text: string; changes: Array<{ from: string; to: string }> } {
  const changes: Array<{ from: string; to: string }> = [];
  const out = text.split(/(\s+)/).map((tok) => {
    if (!/[\p{L}]/u.test(tok)) return tok;
    const m = /^([^\p{L}\p{M}]*)([\p{L}\p{M}]+)([^\p{L}\p{M}]*)$/u.exec(tok);
    if (!m) return tok;
    const bare = letters(m[2]);
    const spelled = respellWord(bare);
    if (spelled === bare) return tok;
    changes.push({ from: bare, to: spelled });
    return `${m[1]}${spelled}${m[3]}`;
  }).join('');
  return { text: out, changes };
}
function respellWord(bare: string): string {
  if (STANDARD_OF[bare]) return STANDARD_OF[bare];
  for (const p of PREFIXES) {
    if (!bare.startsWith(p) || bare.length <= p.length + 1) continue;
    const rest = bare.slice(p.length);
    if (STANDARD_OF[rest]) return p + STANDARD_OF[rest];
    for (const s of SUFFIXES) { if (rest.endsWith(s) && rest.length > s.length + 1) { const stem = rest.slice(0, -s.length); if (STANDARD_OF[stem]) return p + STANDARD_OF[stem] + s; } }
  }
  for (const s of SUFFIXES) { if (bare.endsWith(s) && bare.length > s.length + 1) { const stem = bare.slice(0, -s.length); if (STANDARD_OF[stem]) return STANDARD_OF[stem] + s; } }
  return bare;
}

/** The words of a line whose Iraqi realisation the regression must confirm (چ گ پ ڤ, and ق by its list). */
export function dialectWords(text: string): Array<{ word: string; must: string[] }> {
  return pronounce(text).words.filter((w) => /[چگپڤق]/.test(w.word)).map((w) => ({ word: w.word, must: [...new Set([...(w.word.includes('چ') ? ['tʃ'] : []), ...(w.word.includes('گ') ? ['ɡ'] : []), ...(w.word.includes('پ') ? ['p'] : []), ...(w.word.includes('ڤ') ? ['v'] : []), ...(w.word.includes('ق') ? [w.ipa.includes('q') ? 'q' : w.ipa.includes('k') && !w.ipa.includes('ɡ') ? 'k' : 'ɡ'] : [])])] }));
}
