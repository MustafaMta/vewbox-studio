import { describe, expect, it } from 'vitest';
import { foldedLetters, letterChanges, letterCoverage, letterErrorRate, wordDiff } from '@/server/media/arabic-align';
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
});
