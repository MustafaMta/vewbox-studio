import { describe, expect, it } from 'vitest';
import { normalizeLatin, scriptCoverage, wordErrorRate } from '@/server/providers/speech';

/** The script-spoken check compares what the script says with what Whisper heard; typography must not count as a
 *  wrong word. Found on acceptance A, shot 1.3: “I’ll return it tomorrow.” was heard as "I'll return it, tomorrow."
 *  and scored 0.6 because the curly apostrophe split “I’ll” into two words. */

describe('scriptCoverage / wordErrorRate (English)', () => {
  it('folds typographic apostrophes and ignores punctuation', () => {
    expect(normalizeLatin('I’ll return it tomorrow.')).toBe("i'll return it tomorrow");
    expect(scriptCoverage('I’ll return it tomorrow.', "I'll return it, tomorrow.", 'EN')).toBe(1);
    expect(wordErrorRate('I’ll return it tomorrow.', "I'll return it, tomorrow.", 'EN')).toBe(0);
  });
  it('counts missing words against coverage but not insertions', () => {
    expect(scriptCoverage('Miss Nadia? Package for you!', 'Miss Nadia, package for you. Package for you!', 'EN')).toBe(1);
    expect(scriptCoverage('Then... good day, Mr. Khalil.', 'Good day.', 'EN')).toBeCloseTo(2 / 5, 5);
  });
  it('a paraphrase scores low', () => {
    expect(scriptCoverage('Tomorrow? But I’m off duty!', 'I am not working tomorrow', 'EN')).toBeLessThan(0.5);
  });
});
