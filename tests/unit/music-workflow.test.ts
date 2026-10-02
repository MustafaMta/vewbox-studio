import { describe, expect, it } from 'vitest';
import { ACE_KEYS, aceLanguage, aceStepSong, bpmFromCaption, keyFromCaption } from '@/server/workflows/music';

describe('ACE-Step workflow inputs', () => {
  it('reads tempo and key from the caption', () => {
    expect(bpmFromCaption('Melancholic ballad (68 BPM) with cello')).toBe(68);
    expect(bpmFromCaption('fast')).toBeUndefined();
    expect(bpmFromCaption('9 bpm')).toBeUndefined();
    expect(keyFromCaption('a waltz in D minor')).toBe('D minor');
    expect(keyFromCaption('bright pop, F# major chorus')).toBe('F# major');
    expect(keyFromCaption('no key given')).toBeUndefined();
  });
  it('maps studio languages to the node codes', () => {
    expect(aceLanguage('EN')).toBe('en');
    expect(aceLanguage('ar')).toBe('ar');
    expect(aceLanguage('xx')).toBe('unknown');
    expect(aceLanguage(undefined)).toBe('unknown');
  });
  it('never sends a value the encoder refuses', () => {
    for (const caption of ['Melancholic ballad (68 BPM)', 'upbeat dance pop', 'quiet lullaby in Eb minor', '']) {
      const g = aceStepSong({ caption, lyrics: '[verse]\nla', seconds: 90, language: 'EN' });
      const inputs = g['4'].inputs as Record<string, unknown>;
      expect(inputs.bpm).toBeGreaterThanOrEqual(10);
      expect(inputs.bpm).toBeLessThanOrEqual(300);
      expect(inputs.timesignature).toBe('4');
      expect(ACE_KEYS).toContain(inputs.keyscale);
      expect(inputs.language).toBe('en');
    }
    expect((aceStepSong({ caption: 'x', lyrics: 'y', seconds: 30, bpm: 5 })['4'].inputs as Record<string, unknown>).bpm).not.toBe(5);
  });
});
