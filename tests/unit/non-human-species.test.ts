import { describe, expect, it } from 'vitest';
import { nonHumanSpecies } from '@/domain/identity';

describe('nonHumanSpecies (D6: "Human" shown instead of sex and age)', () => {
  it('ordinary people have no species', () => {
    for (const s of ['Human', 'human', ' Human being ', 'person', 'woman', 'إنسان', 'بشري', '', undefined, null]) expect(nonHumanSpecies(s)).toBeUndefined();
  });
  it('a real species is kept as written', () => {
    expect(nonHumanSpecies('Cat')).toBe('Cat');
    expect(nonHumanSpecies('robot')).toBe('robot');
    expect(nonHumanSpecies('قطة')).toBe('قطة');
  });
});
