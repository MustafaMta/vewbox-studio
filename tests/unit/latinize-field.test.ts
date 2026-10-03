import { describe, expect, it } from 'vitest';
import { canonicalIdentityLine, latinizeField } from '@/server/workflows/canonical-image';

describe('D12: a stray-alphabet word never drops a whole field from the identity line', () => {
  it('repairs a Latin word with Cyrillic letters mixed in', () => {
    expect(latinizeField('shimmering grayish-blue cotton deshdaша with a faded border').text).toBe('shimmering grayish-blue cotton deshdasha with a faded border');
    expect(latinizeField('deshdaша').dropped).toEqual([]);
  });
  it('drops (and reports) only a word wholly in another script', () => {
    const r = latinizeField('a grey دشداشة and a brown cardigan');
    expect(r.text).toBe('a grey and a brown cardigan');
    expect(r.dropped).toEqual(['دشداشة']);
  });
  it('the real wardrobe from the acceptance run keeps every garment in the line', () => {
    const line = canonicalIdentityLine({ build: 'robust', face: 'long face', hair: 'silver-white hair in a knot', eyes: 'dark brown', skin: 'deeply tanned', distinguishing: [], wardrobe: 'shimmering grayish-blue cotton deshdaша with a faded embroidered border along the hem; wool cardigan in terracotta brown, slightly frayed at the elbows; baggy black cotton trousers; leather slippers in dark brown', ageYears: 62, sex: 'MALE' }, { style: 'REALISTIC' });
    expect(line.line).toContain('deshdasha');
    expect(line.line).toContain('wool cardigan in terracotta brown');
    expect(line.line).toContain('leather slippers');
    expect(line.nonLatin).toEqual([]);
  });
  it('a field with a word wholly in another script is reported whole, not left as a stub', () => {
    const line = canonicalIdentityLine({ build: 'robust', face: '', hair: 'شعر داكن', eyes: '', skin: '', distinguishing: [], wardrobe: 'a grey coat', ageYears: 40, sex: 'MALE' }, { style: 'REALISTIC' });
    expect(line.line).not.toMatch(/; hair;|; hair\./);
    expect(line.nonLatin).toContain('شعر داكن hair');
    expect(line.line).toContain('wearing a grey coat');
  });
});
