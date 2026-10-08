import { describe, expect, it } from 'vitest';
import { neutralLook } from '@/domain/neutral-look';

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
    expect(design.distinguishing).toEqual([expect.stringMatching(/left eyebrow \(an old, fully healed scar/), 'a silver signet ring']);
    expect(report.droppedConditions).toEqual(['a fresh bruise on the cheek', 'soaked hair']);
    expect(report.healed).toEqual(['a small scar on his left eyebrow']);
  });
  it('leaves a neutral design unchanged', () => {
    const d = { face: 'Oval face, straight nose, thin lips', eyes: 'Dark brown almond-shaped eyes', distinguishing: ['a mole above the lip'], personality: 'Quiet' };
    expect(neutralLook(d).design).toEqual(d);
  });
});
