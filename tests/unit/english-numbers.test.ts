import { describe, expect, it } from 'vitest';
import { charErrorRate, foldEnglishContractions, foldEnglishNumbers, scriptCoverage } from '@/server/providers/speech';

describe('English contractions in the voice gate (D27): the lines of "The Static Sky"', () => {
  it('writes contractions out and drops other apostrophes', () => {
    expect(foldEnglishContractions("it's still functional isn't it")).toBe('it is still functional is not it');
    expect(foldEnglishContractions("the mariner it vanished in '87")).toBe('the mariner it vanished in 87');
    expect(foldEnglishContractions("static's just a story")).toBe('statics just a story');
  });
  it('the two flagged lines pass, and the third reaches full coverage', () => {
    for (const [intended, heard] of [['It’s still… functional, isn’t it?', "It is still functional, isn't it?"], ['That’s… not possible.', 'That is not possible.'], ['The Mariner… it vanished in ’87.', 'The Mariner. It vanished in 87.']] as const) {
      expect(scriptCoverage(intended, heard, 'EN')).toBe(1);
      expect(charErrorRate(intended, heard, 'EN')).toBe(0);
    }
  });
  it('a wrong word is still wrong', () => {
    expect(scriptCoverage('That’s not possible.', 'That was possible.', 'EN')).toBeLessThan(1);
  });
});

describe('English numbers in the voice gate (D8): one spelled form on both sides', () => {
  it('spells digits as words and drops the inner "and"', () => {
    expect(foldEnglishNumbers('32 ships came home')).toBe('thirty two ships came home');
    expect(foldEnglishNumbers('one hundred and five people')).toBe('one hundred five people');
    expect(foldEnglishNumbers('105 people')).toBe('one hundred five people');
    expect(foldEnglishNumbers('1,000 lanterns')).toBe('one thousand lanterns');
    expect(foldEnglishNumbers('2026')).toBe('two thousand twenty six');
    expect(foldEnglishNumbers('a stand and a chair')).toBe('a stand and a chair');
    expect(foldEnglishNumbers('007')).toBe('007');
  });
  it('the real preview line from the acceptance run passes: "Thirty-two" vs "32"', () => {
    const intended = 'Did you see the 1987 storm, Clara? Thirty-two ships came home that night.';
    const heard = 'Did you see the 1987 storm, Clara? 32 ships came home that night.';
    expect(charErrorRate(intended, heard, 'EN')).toBe(0);
    expect(scriptCoverage(intended, heard, 'EN')).toBe(1);
  });
  it('a wrong number is still wrong; counting stays counting', () => {
    expect(charErrorRate('Thirty-two ships', '42 ships', 'EN')).toBeGreaterThan(0);
    expect(scriptCoverage('Thirty-two ships came home', '42 ships came home', 'EN')).toBeLessThan(1);
    expect(foldEnglishNumbers('one two three')).toBe('one two three');
  });
});
