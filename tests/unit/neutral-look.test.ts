import { describe, expect, it } from 'vitest';
import { healedWord, neutralLook } from '@/domain/neutral-look';

/** THE NEUTRAL IDENTITY: expressions leave the look, temporary conditions leave the identity, scars stay healed. */
describe('neutralLook', () => {
  it('moves an expression out of the face and the eyes into the personality (Marcus Bell\'s design)', () => {
    const { design, report } = neutralLook({
      face: 'Square jawline with high cheekbones, slight crow\'s feet at the eyes, and a warm, approachable expression despite his formal attire',
      eyes: 'Warm brown eyes that are expressive and kind, often crinkling at the corners when he smiles or laughs',
      hair: 'Close-cropped black hair with silver at the temples',
      personality: 'Steady and dutiful',
      distinguishing: [],
    });
    expect(design.face).toMatch(/^Square jawline with high cheekbones, slight crow's feet at the eyes$/);
    expect(design.face).not.toMatch(/approachable|warm/);
    expect(design.hair).toBe('Close-cropped black hair with silver at the temples');
    expect(design.personality).toMatch(/^Steady and dutiful; .*approachable expression/);
    expect(report.movedToPersonality.length).toBeGreaterThan(0);
  });
  it('drops temporary conditions from the identity, keeps permanent marks and stores a scar healed', () => {
    const { design, report } = neutralLook({ distinguishing: ['a small scar on his left eyebrow', 'a fresh bruise on the cheek', 'soaked hair', 'a silver signet ring'] });
    // the identity stores the word "healed"; the full drawing instruction is added where a picture is described
    expect(design.distinguishing).toEqual(['a small healed scar on his left eyebrow', 'a silver signet ring']);
    expect(report.droppedConditions).toEqual(['a fresh bruise on the cheek', 'soaked hair']);
    expect(report.healed).toEqual(['a small scar on his left eyebrow']);
  });
  it('leaves a neutral design unchanged', () => {
    const d = { face: 'Oval face, straight nose, thin lips', eyes: 'Dark brown almond-shaped eyes', distinguishing: ['a mole above the lip'], personality: 'Quiet' };
    expect(neutralLook(d).design).toEqual(d);
  });
});

describe('an expressive adjective leaves, the physical noun stays (Phase 1 character B, 2026-10-09)', () => {
  it('“Large, expressive dark brown eyes with defined upper lashes” keeps the eye colour', () => {
    const { design, report } = neutralLook({ eyes: 'Large, expressive dark brown eyes with defined upper lashes' });
    expect(design.eyes).toBe('Large, dark brown eyes with defined upper lashes');
    expect(report.movedToPersonality).toEqual(['expressive']);
    // "laugh lines" are wrinkles too (character C's "deep laugh lines" went to the personality)
    expect(neutralLook({ face: 'Full round face with deep laugh lines' }).design.face).toBe('Full round face with deep laugh lines');
    // an adjective alone is still a mood, and an expression noun still goes whole
    expect(neutralLook({ face: 'Round and friendly with apple-cheeks' }).design.face).toBe('Round with apple-cheeks');
    expect(neutralLook({ face: 'Narrow face with a warm, approachable smile' }).design.face).toBe('Narrow face');
  });
});

describe('a scar in the identity stays within the record’s limit (Phase 1 character A, job-5f1863dfdd)', () => {
  it('a 110-character scar detail is stored with the word healed, never with the drawing instruction', () => {
    const long = 'a thin, faded scar running from the outer corner of her left eyebrow toward the hairline, from a childhood fall';
    expect(long.length).toBeLessThanOrEqual(120);
    const { design } = neutralLook({ distinguishing: [long] });
    expect(design.distinguishing![0].length).toBeLessThanOrEqual(120);
    expect(design.distinguishing![0]).not.toMatch(/fully healed scar: a thin pale/);
    expect(healedWord('a scar on the chin')).toBe('a healed scar on the chin');
    expect(healedWord('a healed scar on the chin')).toBe('a healed scar on the chin');
    expect(healedWord('a fresh scar on the chin')).toBe('a fresh scar on the chin');
  });
});
