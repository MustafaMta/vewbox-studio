/** THE IRAQI PHONOLOGY GATE (Phase 3, producer directive 2026-10-07): an Iraqi line must SOUND Iraqi where its
 *  spelling says so — a چ is /tʃ/, a گ is /ɡ/. Spelling-based recognisers cannot confirm either (standard Arabic has
 *  no letter for them; Whisper returned چ in 0 of 36 Iraqi lines and «باچر» came back as «باسر»), so the asr service
 *  reads the PHONEMES of each dialect word's aligned span (/qa/phonemes) and this module judges them. Pure (tested).
 *
 *  The verdict never passes what was not heard: a word the aligner could not place, or whose span yielded no
 *  phonemes, is UNVERIFIED and the line goes to REVIEW (the producer's ear decides). A dialect letter whose sound is
 *  missing — «باچر» heard with s, dʒ or k where tʃ belongs — FAILS the line. Machine evidence only supports the
 *  producer's listening; it never accepts an Iraqi voice by itself. */

export interface HeardWord { index: number; text: string; aligned: boolean; ipa: string; phonemes?: Array<{ phoneme: string; start: number; end: number; p: number }> }
export type PhonologyVerdict = 'PASS' | 'FAIL' | 'UNVERIFIED';
export interface WordPhonology { index: number; text: string; expected: string[]; heard: string; verdict: PhonologyVerdict; detail: string }

/** The sound each Iraqi letter must be spoken with, and the phoneme labels (eSpeak IPA) that count as it. */
const SOUNDS: Record<string, { sound: string; accepts: RegExp }> = {
  'چ': { sound: 'tʃ', accepts: /^(tʃ|ʧ)[ːʰʲ]*$/ },
  'گ': { sound: 'ɡ', accepts: /^[ɡg][ːʰʲ]*$/ },
};

/** The dialect sounds a word must contain, one per dialect letter (in order). */
export function expectedSounds(word: string): string[] {
  return [...word].filter((c) => c in SOUNDS).map((c) => SOUNDS[c].sound);
}

/** One word: every expected sound must be heard at least as often as its letter is written. */
export function judgeWord(w: HeardWord): WordPhonology {
  const expected = expectedSounds(w.text);
  const labels = (w.phonemes?.map((p) => p.phoneme) ?? w.ipa.split(/\s+/)).filter(Boolean);
  const heard = labels.join(' ');
  if (!expected.length) return { index: w.index, text: w.text, expected, heard, verdict: 'PASS', detail: 'no dialect letter' };
  if (!w.aligned) return { index: w.index, text: w.text, expected, heard, verdict: 'UNVERIFIED', detail: 'the word could not be placed in the audio' };
  if (!labels.length) return { index: w.index, text: w.text, expected, heard, verdict: 'UNVERIFIED', detail: 'no phonemes were heard in the word' };
  const missing: string[] = [];
  for (const letter of Object.keys(SOUNDS)) {
    const need = [...w.text].filter((c) => c === letter).length;
    if (!need) continue;
    const got = labels.filter((l) => SOUNDS[letter].accepts.test(l)).length;
    if (got < need) missing.push(`${letter} /${SOUNDS[letter].sound}/`);
  }
  return missing.length
    ? { index: w.index, text: w.text, expected, heard, verdict: 'FAIL', detail: `${missing.join(', ')} not heard (heard: ${heard})` }
    : { index: w.index, text: w.text, expected, heard, verdict: 'PASS', detail: `heard ${expected.map((s) => `/${s}/`).join(' ')}` };
}

/** The line: FAIL when any dialect sound is missing; REVIEW when any dialect word could not be verified; else PASS
 *  (no dialect word at all: NOT_APPLICABLE). */
export function judgeLine(words: HeardWord[]): { verdict: 'PASS' | 'FAIL' | 'REVIEW' | 'NOT_APPLICABLE'; words: WordPhonology[] } {
  const judged = words.map(judgeWord).filter((w) => w.expected.length > 0);
  if (!judged.length) return { verdict: 'NOT_APPLICABLE', words: judged };
  if (judged.some((w) => w.verdict === 'FAIL')) return { verdict: 'FAIL', words: judged };
  if (judged.some((w) => w.verdict === 'UNVERIFIED')) return { verdict: 'REVIEW', words: judged };
  return { verdict: 'PASS', words: judged };
}
