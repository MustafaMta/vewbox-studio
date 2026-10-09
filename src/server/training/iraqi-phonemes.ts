/** IRAQI PHONEME COVERAGE (the producer's master directive §10): how often each dialect-bearing unit appears in a set of
 *  transcripts, so rare units are collected deliberately. Units are the letters whose Iraqi realisation the adaptation
 *  must learn — the dialect letters چ /tʃ/, گ /ɡ/, پ /p/, ڤ /v/, the letters whose Baghdadi value differs from MSA (ق
 *  mostly /ɡ/, ك sometimes /tʃ/, ج /dʒ/), the emphatics — and the regression vocabulary the producer named. The full
 *  grapheme-to-phoneme frontend (engine-facing pronunciation, dialogue text untouched) is built on the inventory decided
 *  in docs/research/iraqi-voice-production.md; this coverage count needs none of it. Pure. */

export const DIALECT_UNITS: Array<{ unit: string; ipa: string; test: RegExp }> = [
  { unit: 'چ', ipa: 'tʃ', test: /چ/ },
  { unit: 'گ', ipa: 'ɡ', test: /گ/ },
  { unit: 'پ', ipa: 'p', test: /پ/ },
  { unit: 'ڤ', ipa: 'v', test: /ڤ/ },
  { unit: 'ق', ipa: 'ɡ ~ q', test: /ق/ },
  { unit: 'ك', ipa: 'k (~ tʃ)', test: /ك/ },
  { unit: 'ج', ipa: 'dʒ', test: /ج/ },
  { unit: 'ض', ipa: 'ðˤ ~ dˤ', test: /ض/ },
  { unit: 'ظ', ipa: 'ðˤ', test: /ظ/ },
  { unit: 'ط', ipa: 'tˤ', test: /ط/ },
  { unit: 'ص', ipa: 'sˤ', test: /ص/ },
  { unit: 'ع', ipa: 'ʕ', test: /ع/ },
  { unit: 'غ', ipa: 'ɣ', test: /غ/ },
  { unit: 'ح', ipa: 'ħ', test: /ح/ },
  { unit: 'خ', ipa: 'x', test: /خ/ },
  { unit: 'ث', ipa: 'θ', test: /ث/ },
  { unit: 'ذ', ipa: 'ð', test: /ذ/ },
  { unit: 'ء/أ/إ/ئ/ؤ', ipa: 'ʔ', test: /[ءأإئؤ]/ },
];

/** The producer's regression words (§9) and common Baghdadi function words: presence per utterance. */
export const REGRESSION_WORDS = ['باچر', 'نحچي', 'چاي', 'چنت', 'چان', 'چانت', 'گلت', 'گلتلك', 'گدام', 'گاعد', 'شلونك', 'هسه', 'يمعود', 'كلشي', 'ماكو', 'اكو', 'شكو', 'هواية', 'زين', 'وياي', 'صوب', 'شوية', 'هيچ', 'لعد', 'بعدين', 'يعني', 'خوش', 'ليش', 'وين', 'شنو', 'منو', 'اشلون'];

export interface CoverageRow { unit: string; ipa?: string; utterances: number; occurrences: number }

export function phonemeCoverage(transcripts: readonly string[]): CoverageRow[] {
  const rows: CoverageRow[] = [];
  for (const u of DIALECT_UNITS) {
    let utts = 0, occ = 0;
    for (const t of transcripts) { const n = (t.match(new RegExp(u.test.source, 'g')) ?? []).length; if (n) { utts++; occ += n; } }
    rows.push({ unit: u.unit, ipa: u.ipa, utterances: utts, occurrences: occ });
  }
  for (const w of REGRESSION_WORDS) {
    let utts = 0, occ = 0;
    const rx = new RegExp(`(?<![\\p{L}])${w}(?![\\p{L}])`, 'gu');
    for (const t of transcripts) { const n = (t.match(rx) ?? []).length; if (n) { utts++; occ += n; } }
    rows.push({ unit: `word ${w}`, utterances: utts, occurrences: occ });
  }
  return rows;
}
