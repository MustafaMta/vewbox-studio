import { describe, expect, it } from 'vitest';
import { alignWords, arabicWordCoverage, foldedLetters, letterChanges, letterCoverage, letterErrorRate, unconfirmableCh, wordDiff } from '@/server/media/arabic-align';
import { charErrorRate, scriptCoverage } from '@/server/providers/speech';

/** The space-insensitive view used by the Iraqi A/B (docs/evidence/voice-design/iraqi-ab): a phrase Whisper heard with
 *  other word boundaries is not a missing word; a different letter is a real substitution. Examples are the actual
 *  transcripts from docs/evidence/voice-design/report.json. */

describe('letter coverage ignores word boundaries', () => {
  it('«گلتلك» heard as «قلت لك» loses coverage at word level but not at letter level', () => {
    const ref = 'گلتلك لا تتأخر.'; const hyp = 'قلت لك لا تتأخر.';
    expect(scriptCoverage(ref, hyp, 'AR')).toBeLessThan(1);
    expect(letterCoverage(ref, hyp)).toBe(1);
    expect(letterErrorRate(ref, hyp)).toBe(0);
  });
  it('a real substitution still costs letters', () => {
    expect(letterCoverage('باچر الصبح', 'باسر الصبح')).toBeCloseTo(8 / 9, 5);
    expect(letterErrorRate('باچر الصبح', 'باسر الصبح')).toBeCloseTo(1 / 9, 5);
    expect(foldedLetters('باچر الصبح')).toBe('باجرالصبح');
  });
  it('agrees with the studio fold (گ/ق/ك one class, چ/ج one class, Iraqi words)', () => {
    expect(letterCoverage('هسه شكو ماكو', 'الحين شكوماكو')).toBe(1);
    expect(charErrorRate('هسه شكو ماكو', 'الحين شكو ماكو', 'AR')).toBe(0);
  });
});

describe('wordDiff classifies every difference', () => {
  it('the run-2 Habibi line: spacing, two substitutions and a deletion', () => {
    const d = wordDiff('باچر الصبح نروح للسوگ سوة، گلتلك لا تتأخر.', 'باسر الصبح نروح للسوبسوة. قلت لك لا تتأخر.');
    expect(d).toEqual([
      { kind: 'SUBSTITUTION', ref: ['باچر'], hyp: ['باسر'], letters: ['چ→س'] },
      { kind: 'SUBSTITUTION', ref: ['للسوگ', 'سوة'], hyp: ['للسوبسوة'], letters: ['گ→ب'] },
      { kind: 'SPACING', ref: ['گلتلك'], hyp: ['قلت', 'لك'] },
    ]);
  });
  it('reports fold-equal spelling variants and insertions', () => {
    const d = wordDiff('نگعد بالگهوة', 'نقعد بالقهوة هسه');
    expect(d).toEqual([
      { kind: 'VARIANT', ref: ['نگعد'], hyp: ['نقعد'], letters: ['گ→ق'] },
      { kind: 'VARIANT', ref: ['بالگهوة'], hyp: ['بالقهوة'], letters: ['گ→ق'] },
      { kind: 'INSERTION', ref: [], hyp: ['هسه'] },
    ]);
  });
  it('a missing word is a deletion', () => {
    expect(wordDiff('شكو ماكو هسه', 'شكو هسه')).toEqual([{ kind: 'DELETION', ref: ['ماكو'], hyp: [] }]);
  });
  it('letterChanges groups a run of changed letters', () => {
    expect(letterChanges('تتأخر', 'تتألم')).toEqual(['خر→لم']);
    expect(letterChanges('سوگسوة', 'سوبسوة')).toEqual(['گ→ب']);
  });
  it('alignWords keeps the matches wordDiff leaves out, in order', () => {
    expect(alignWords('باچر الصبح', 'باسر الصبح')).toEqual([{ kind: 'ERROR', ref: ['باچر'], hyp: ['باسر'] }, { kind: 'MATCH', ref: ['الصبح'], hyp: ['الصبح'] }]);
  });
});

/** Contract v2 §4: the voice check's Arabic word coverage does not count spacing differences as missing words, and
 *  still counts a wrong word as wrong. */
describe('arabicWordCoverage (the voice check)', () => {
  it('a spacing difference is heard: «گلتلك» written «قلت لك», «ما گلتلي» written «ماقلتلي», «شكو ماكو» written «شكوماكو»', () => {
    expect(scriptCoverage('گلتلك لا تتأخر.', 'قلت لك لا تتأخر.', 'AR')).toBeLessThan(1);
    expect(arabicWordCoverage('گلتلك لا تتأخر.', 'قلت لك لا تتأخر.')).toBe(1);
    expect(arabicWordCoverage('ليش ما گلتلي من البداية؟', 'ليش ماقلتلي من البداية؟')).toBe(1);
    expect(arabicWordCoverage('شكو ماكو؟ هسه وصلت من الشغل.', 'شكوماكو هسه وصلت من الشغل')).toBe(1);
    // the reverse: one written word heard as two
    expect(arabicWordCoverage('قلت لك لا تتأخر', 'قلتلك لا تتأخر')).toBe(1);
  });
  it('a wrong word is still wrong: «باچر» heard «باسر», «للسوگ سوة» heard «للسوبسوة» (spacing does not excuse a letter)', () => {
    expect(arabicWordCoverage('باچر الصبح', 'باسر الصبح')).toBe(0.5);
    expect(arabicWordCoverage('باچر نروح للمكان نفسه.', 'بسر نروح للمكان نفسه.')).toBeCloseTo(0.75, 5);
    // the run-2 Habibi line: 8 written words; «باچر», «للسوگ», «سوة» are missing; «گلتلك» (spacing) is heard
    const ref = 'باچر الصبح نروح للسوگ سوة، گلتلك لا تتأخر.'; const hyp = 'باسر الصبح نروح للسوبسوة. قلت لك لا تتأخر.';
    expect(arabicWordCoverage(ref, hyp)).toBeCloseTo(5 / 8, 5);
    expect(scriptCoverage(ref, hyp, 'AR')).toBeCloseTo(3 / 7, 5);
    // a missing word and a substituted one inside a split are not excused
    expect(arabicWordCoverage('گلتلك لا تتأخر', 'قلت لي لا تتأخر')).toBeCloseTo(2 / 3, 5);
    expect(arabicWordCoverage('هسه وين نروح؟', 'هسا وين روح؟')).toBeCloseTo(2 / 3, 5);
  });
  it('a phrase the sentence fold maps whole (numbers, «ما كو») is heard; never lower than the word-level coverage', () => {
    expect(arabicWordCoverage('والباص رقم اثنعش.', 'والباص رقم اثنى عشر')).toBe(1);
    expect(arabicWordCoverage('ماكو شي', 'ما كو شي')).toBe(1);
    for (const [r, h] of [['شلونك حبيبي، شخبارك؟', 'شخبارك.'], ['هسه شكو ماكو', 'الحين شكو ماكو'], ['', 'anything']] as const) expect(arabicWordCoverage(r, h)).toBeGreaterThanOrEqual(scriptCoverage(r, h, 'AR'));
  });
});

describe('unconfirmableCh («چ» cannot be confirmed by ASR — the Iraqi A/B)', () => {
  it('names the substitutions whose intended words all carry چ, and forgives exactly those', () => {
    const u = unconfirmableCh('باچر الصبح نگعد وياكم بالگهوة.', 'باسر الصبح نقعد وياكم بالغهوة.');
    expect(u.blocks).toEqual([{ kind: 'SUBSTITUTION', ref: ['باچر'], hyp: ['باسر'], letters: ['چ→س'] }]);
    expect(u.forgiven).toBe('باچر الصبح نقعد وياكم بالغهوة');
    expect(unconfirmableCh('الچاي حار هواية', 'الفاي حار هواية').blocks.map((b) => b.ref)).toEqual([['الچاي']]);
  });
  it('a missing چ-word, or an error block that also holds another word, is not forgiven', () => {
    expect(unconfirmableCh('باچر الصبح', 'الصبح').blocks).toEqual([]);
    expect(unconfirmableCh('الچاي حار هواية', 'الفاي بارد هواية').blocks).toEqual([]);
  });
});
