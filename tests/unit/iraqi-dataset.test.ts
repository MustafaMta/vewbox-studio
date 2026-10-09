import { describe, expect, it } from 'vitest';
import { normaliseIraqi } from '@/server/training/iraqi-text-normalise';
import { DIALECT_UNITS, REGRESSION_WORDS, phonemeCoverage } from '@/server/training/iraqi-phonemes';

/** The Iraqi dataset pipeline's pure parts (the producer's master directive §8–§10): the training transcript keeps every
 *  dialect letter and spelling, loses only marks and digit forms; the coverage table counts the dialect-bearing units. */
describe('normaliseIraqi', () => {
  it('keeps چ گ پ ڤ and the spelling; removes tatweel, tashkeel and bidi marks; spells digits the Baghdadi way; spaces punctuation', () => {
    expect(normaliseIraqi('گلتلك باچر نكعد نحچي ونشرب چاي.')).toBe('گلتلك باچر نكعد نحچي ونشرب چاي.');
    expect(normaliseIraqi('شلونــك؟صارلي‏ هوايةً ما شايفك')).toBe('شلونك؟ صارلي هواية ما شايفك');
    expect(normaliseIraqi('عندي ٣ چاي')).toBe('عندي ثلاثة چاي');
    expect(normaliseIraqi('  هسه ،  لازم  نروح ')).toBe('هسه، لازم نروح');
  });
});

describe('phonemeCoverage', () => {
  it('counts utterances and occurrences per dialect unit and per regression word', () => {
    const rows = phonemeCoverage(['گلتلك باچر نكعد نحچي ونشرب چاي.', 'شلونك؟ صارلي هواية ما شايفك.', 'چاي چاي']);
    const by = Object.fromEntries(rows.map((r) => [r.unit, r]));
    expect(by['چ']).toMatchObject({ utterances: 2, occurrences: 5 });
    expect(by['گ']).toMatchObject({ utterances: 1, occurrences: 1 });
    expect(by['word چاي']).toMatchObject({ utterances: 2, occurrences: 3 });
    expect(by['word شلونك']).toMatchObject({ utterances: 1, occurrences: 1 });
    expect(by['word گدام']).toMatchObject({ utterances: 0, occurrences: 0 });
    expect(rows).toHaveLength(DIALECT_UNITS.length + REGRESSION_WORDS.length);
  });
});
