import { describe, expect, it } from 'vitest';
import { charErrorRate, foldEnglishNumbers, scriptCoverage } from '@/server/providers/speech';

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
