import { describe, expect, it } from 'vitest';
import { sceneSetupFrom, timeOfDayIn } from '@/domain/scene-setup';

describe('a scene setup from a proposal (D22)', () => {
  it('reads the time of day a word states, in English and Arabic, and nothing else', () => {
    expect(timeOfDayIn('The meteor shower outside casts dramatic shadows')).toBe('NIGHT');
    expect(timeOfDayIn('They meet at sunset on the pier')).toBe('DUSK');
    expect(timeOfDayIn('golden hour light over the night market')).toBe('GOLDEN_HOUR');
    expect(timeOfDayIn('يجلسان في المقهى بعد منتصف الليل')).toBe('NIGHT');
    expect(timeOfDayIn('عند الفجر يفتح المحل')).toBe('DAWN');
    expect(timeOfDayIn('Elias examines the radio')).toBeUndefined();
    expect(timeOfDayIn('a knightly tale')).toBeUndefined(); // whole words only
  });
  it('takes the only place, or the one the scene names; the people it names', () => {
    const locations = [{ id: 'l1', name: 'The Workshop' }, { id: 'l2', name: 'Harbour Wall' }];
    const cast = [{ id: 'c1', name: 'Elias Moore' }, { id: 'c2', name: 'Najm' }];
    expect(sceneSetupFrom('Elias walks to the harbour wall at dusk.', { locations, cast })).toEqual({ locationId: 'l2', timeOfDay: 'DUSK', characterIds: ['c1'] });
    expect(sceneSetupFrom('Somewhere else.', { locations, cast })).toEqual({ locationId: undefined, timeOfDay: 'MORNING', characterIds: [] });
    expect(sceneSetupFrom('Somewhere else.', { locations: [locations[0]!], cast, premise: 'one night by the sea' })).toEqual({ locationId: 'l1', timeOfDay: 'NIGHT', characterIds: [] });
  });
});
