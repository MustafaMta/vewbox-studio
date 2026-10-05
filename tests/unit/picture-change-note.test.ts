import { describe, expect, it } from 'vitest';
import { PICTURE_CHANGE_LIMITS, pictureChangeRestrictions } from '@/components/character/create/preflight';
import { referenceIdentityLine } from '@/worker/handlers/images';

/** From a picture: the producer's "What should change?" note reaches the drawing (acceptance 2026-10-05, defect A1 in
 *  docs/evidence/acceptance-v1/REPORT.md). The note becomes the character's canon.visualRestrictions, which the
 *  identity line of every drawing repeats. */
describe('pictureChangeRestrictions', () => {
  it('splits the note at sentence ends, without the closing marks', () => {
    expect(pictureChangeRestrictions('Show him full figure in grey work trousers and black work boots.')).toEqual(['Show him full figure in grey work trousers and black work boots']);
    expect(pictureChangeRestrictions('  Grey trousers.  Black boots!  A shorter beard; no earring. ')).toEqual(['Grey trousers', 'Black boots!', 'A shorter beard', 'no earring']);
  });
  it('an empty note asks nothing', () => {
    expect(pictureChangeRestrictions('')).toEqual([]);
    expect(pictureChangeRestrictions('   ')).toEqual([]);
  });
  it('keeps within what the identity line reads: four pieces, 200 characters each, cut at a word', () => {
    const many = pictureChangeRestrictions('One. Two. Three. Four. Five. Six.');
    expect(many).toHaveLength(PICTURE_CHANGE_LIMITS.items);
    expect(many[3]).toBe('Four; Five; Six');
    const long = pictureChangeRestrictions(`${'word '.repeat(80)}end`);
    expect(long[0].length).toBeLessThanOrEqual(PICTURE_CHANGE_LIMITS.chars);
    expect(long[0].endsWith('word')).toBe(true);
  });
  it('the drawing from the picture names the change', () => {
    const asked = pictureChangeRestrictions('Show him full figure, standing, in the same blue work jacket with grey work trousers and black work boots.');
    const line = referenceIdentityLine({ build: '', face: '', hair: '', skin: '', eyes: '', wardrobe: '', distinguishing: [], canon: { visualRestrictions: asked } });
    expect(line).toMatch(/grey work trousers and black work boots/);
    expect(line).toMatch(/exactly as in the reference picture/);
  });
});
