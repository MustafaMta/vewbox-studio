import { describe, expect, it } from 'vitest';
import { PLATE_WIDE_FRAMINGS, personCropFor, plateCropFor, stillFrameAction } from '@/server/story/prompts';

/** A close shot's opening frame (acceptance 2026-10-06, Tea 1.3): the people of the frame are the shot's people only,
 *  and the place reference is cut to the shot's distance. */
describe('stillFrameAction: nobody outside the shot is drawn', () => {
  it('Tea 1.3: the vendor named off-screen leaves the moment; Clara’s action stays', () => {
    expect(stillFrameAction('Clara holds the warm tulip glass in both hands and smiles as she speaks to Abu Haidar, who stands off-screen across the counter; after her words she takes a small sip.', ['Abu Haidar']))
      .toBe('Clara holds the warm tulip glass in both hands and smiles as she speaks; after her words she takes a small sip.');
  });
  it('a phrase that addresses an absent person is cut, by full or first name; a clause still naming one is dropped', () => {
    expect(stillFrameAction('Elias looks up at Najm, then back at the radio.', ['Najm'])).toBe('Elias looks up, then back at the radio.');
    expect(stillFrameAction('Elias turns towards Najm Al-Rawi.', ['Najm Al-Rawi'])).toBe('Elias turns.');
    expect(stillFrameAction('Clara smiles, Abu pours the tea.', ['Abu Haidar'])).toBe('Clara smiles.');
  });
  it('off-screen / out of frame clauses go; the people of the shot are untouched', () => {
    expect(stillFrameAction('She laughs, a voice calls out of frame.', [])).toBe('She laughs.');
    expect(stillFrameAction('Abu Haidar fills a glass.', ['Clara'])).toBe('Abu Haidar fills a glass.');
    expect(stillFrameAction('', ['X'])).toBe('');
  });
});

describe('the place reference at the shot’s distance', () => {
  const plate = { width: 1344, height: 768 };
  it('a wide framing keeps the whole plate; closer framings cut less and less of it, at the plate’s aspect, inside it', () => {
    for (const f of PLATE_WIDE_FRAMINGS) expect(plateCropFor(f, plate)).toBeUndefined();
    const m = plateCropFor('MEDIUM', plate)!; const mcu = plateCropFor('MEDIUM_CLOSE_UP', plate)!; const cu = plateCropFor('CLOSE_UP', plate)!;
    expect(m.width).toBeGreaterThan(mcu.width); expect(mcu.width).toBeGreaterThan(cu.width);
    for (const c of [m, mcu, cu]) {
      expect(c.width / c.height).toBeCloseTo(1344 / 768, 1);
      expect(c.x).toBeGreaterThanOrEqual(0); expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.width).toBeLessThanOrEqual(1344); expect(c.y + c.height).toBeLessThanOrEqual(768);
    }
    expect(plateCropFor('MEDIUM_CLOSE_UP', plate, { x: 0.95, y: 0.5 })!.x + mcu.width).toBe(1344);
  });
  it('the person reference: the top of the canonical figure for the framing', () => {
    const canon = { width: 928, height: 1664 };
    expect(personCropFor('WIDE', canon)).toBeUndefined();
    expect(personCropFor('MEDIUM_CLOSE_UP', canon)).toEqual({ x: 0, y: 0, width: 928, height: Math.round(1664 * 0.45) });
    expect(personCropFor('CLOSE_UP', canon)!.height).toBeLessThan(personCropFor('MEDIUM', canon)!.height);
  });
});
