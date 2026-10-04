import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/providers/comfy', () => ({}));
import { parseCount, peopleExpected, peopleVerdict, showsPictureOfPeople } from '@/worker/handlers/people';

describe('a shot that features a picture of someone', () => {
  it('is recognised from its action (the counter can take the picture for a person)', () => {
    expect(showsPictureOfPeople('Elias stares at the photo, his reflection merging with his wife’s face.')).toBe(true);
    expect(showsPictureOfPeople('Najm adjusts a wire on the radio.')).toBe(false);
  });
});

/** D33: shot 2.3 of "The Static Sky" showed Najm twice for half a second (a second Najm walked in while the first
 *  faded). The take check samples every half second and fails a take with more people than the shot holds. */
describe('people on screen', () => {
  it('fails a take where anyone extra appears at any sampled moment, and names when', () => {
    const v = peopleVerdict([{ at: 0.1, n: 2 }, { at: 0.6, n: 3 }, { at: 1.1, n: 2 }, { at: 1.6, n: 2 }], 2);
    expect(v).toEqual({ ok: false, max: 3, at: [0.6] });
  });
  it('allows fewer (framing can leave someone out) and unreadable answers', () => {
    expect(peopleVerdict([{ at: 0.1, n: 1 }, { at: 0.6, n: undefined }, { at: 1.1, n: 2 }], 2)).toEqual({ ok: true, max: 2, at: [] });
  });
  it('reads the number in the answer', () => {
    expect(parseCount('2')).toBe(2);
    expect(parseCount('There are 3 people.')).toBe(3);
    expect(parseCount('none')).toBeUndefined();
  });
  it('expects the shot’s people unless the action brings in others', () => {
    expect(peopleExpected({ action: 'Najm turns towards the photo.' }, ['a', 'b'])).toBe(2);
    expect(peopleExpected({ action: 'Customers crowd the stall.' }, ['a'])).toBeUndefined();
    // a point-of-view shot does not show the one whose eyes the camera is; declared extras are not counted
    expect(peopleExpected({ action: 'Through the door crack she watches him pace.', staging: { pov: 'a' } }, ['a', 'b'])).toBe(1);
    expect(peopleExpected({ action: 'She watches.', staging: { pov: 'a' } }, ['a'])).toBeUndefined();
    expect(peopleExpected({ action: 'She crosses the hall.', staging: { extras: [{ description: 'four tired shoppers', count: 4 }] } }, ['a'])).toBeUndefined();
  });
});
