import { describe, expect, it } from 'vitest';
import { expectedSounds, judgeLine, judgeWord, type HeardWord } from '@/server/media/iraqi-phonology';

/** THE «باچر» REGRESSION (producer directive 2026-10-07): an Iraqi چ must be HEARD as /tʃ/. The historical failure —
 *  «باچر» spoken so that it came back as «باسر» — must fail the Iraqi dialect gate, never pass on spelling. */

const w = (text: string, ipa: string, aligned = true): HeardWord => ({ index: 0, text, aligned, ipa });

describe('the Iraqi phonology gate', () => {
  it('knows which sound each dialect letter needs', () => {
    expect(expectedSounds('باچر')).toEqual(['tʃ']);
    expect(expectedSounds('گلبي')).toEqual(['ɡ']);
    expect(expectedSounds('چاي')).toEqual(['tʃ']);
    expect(expectedSounds('شلونك')).toEqual([]);
  });

  it('REGRESSION: «باچر» without /tʃ/ fails — heard as s (the historical «باسر»), as dʒ, or as k', () => {
    expect(judgeWord(w('باچر', 'b aː s ɪ r'))).toMatchObject({ verdict: 'FAIL', detail: expect.stringContaining('چ /tʃ/ not heard') });
    expect(judgeWord(w('باچر', 'b aː dʒ ɪ r')).verdict).toBe('FAIL');
    expect(judgeWord(w('باچر', 'b aː k ɪ r')).verdict).toBe('FAIL');
    expect(judgeLine([w('اشوفك', 'ʔ a ʃ uː f a k'), { ...w('باچر', 'b aː s ɪ r'), index: 1 }]).verdict).toBe('FAIL');
  });

  it('«باچر» with /tʃ/ passes; length and aspiration marks count as the sound', () => {
    expect(judgeWord(w('باچر', 'b aː tʃ ɪ r')).verdict).toBe('PASS');
    expect(judgeWord(w('باچر', 'b aː tʃː ɪ r')).verdict).toBe('PASS');
    expect(judgeWord(w('گلبي', 'ɡ a l b iː')).verdict).toBe('PASS');
    expect(judgeWord(w('گلبي', 'q a l b iː')).verdict).toBe('FAIL'); // the MSA qaf where Iraqi has g
  });

  it('two dialect letters need two sounds: one /tʃ/ is not enough for «چچ»', () => {
    expect(judgeWord(w('چچ', 'tʃ a dʒ')).verdict).toBe('FAIL');
    expect(judgeWord(w('چچ', 'tʃ a tʃ')).verdict).toBe('PASS');
  });

  it('never passes what was not heard: an unplaced word or an empty span is UNVERIFIED and the line goes to REVIEW', () => {
    expect(judgeWord(w('باچر', '', false)).verdict).toBe('UNVERIFIED');
    expect(judgeWord(w('باچر', '')).verdict).toBe('UNVERIFIED');
    expect(judgeLine([w('باچر', '', false)]).verdict).toBe('REVIEW');
    expect(judgeLine([w('شلونك', 'ʃ l oː n a k')]).verdict).toBe('NOT_APPLICABLE');
  });
});
