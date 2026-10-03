import { describe, expect, it } from 'vitest';
import type { ResearchItem } from '@/domain/development';
import { checkOriginality, containsPhrase, normalise, similarity, tokens } from '@/server/story/development/originality';

/** ORIGINALITY IN CODE — research informs, it is never copied: a concept naming a researched title, a creator or a
 *  franchise, or titled too close to a researched title, fails and is never chosen. Arabic and English alike. */

const item = (title: string, creator?: string): ResearchItem => ({ id: `ri-${title.length}`, platform: 'WIKIPEDIA', provider: 'p', url: 'https://x.example/', title, retrievedAt: 'r', category: 'SERIES', metrics: {}, query: 'q', creator });
const concept = (title: string, logline = 'A grandmother teaches her grandson to brew tea on a Baghdad rooftop.', hook = 'A tea glass shatters at dawn.') => ({ id: 'C1', title, logline, hook });

describe('normalisation', () => {
  it('folds Arabic letter forms and diacritics, drops the article and stop words', () => {
    expect(normalise('أُمّ إبراهيم آمنة')).toBe(normalise('ام ابراهيم امنه'));
    expect(normalise('مدرسةٌ على')).toBe('مدرسه علي');
    expect(tokens('The Last Tram of the Night')).toEqual(['last', 'tram', 'night']);
    // the article is dropped; "series" and "in" are stop words
    expect(tokens('المسلسل الكبير في بغداد')).toEqual(['كبير', 'بغداد']);
  });
  it('similarity is the Dice overlap of meaningful tokens', () => {
    expect(similarity('The Last Tram', 'Last Tram (2026 film)')).toBe(1);
    expect(similarity('Tea on the Roof', 'The Roof Garden')).toBe(0.5);
    expect(similarity('x', '')).toBe(0);
    expect(containsPhrase('They watch Big Brother every night', 'Big Brother 28 (American season)')).toBe(false);
    expect(containsPhrase('They watch Big Brother every night', 'Big Brother')).toBe(true);
  });
});

describe('the check', () => {
  const research = [item('هذا البحر سوف يفيض'), item('Verity (film)'), item('Drishyam 3', 'Jeethu Joseph'), item('War (TV series)')];
  it('an original concept passes, reporting its closest researched title', () => {
    const r = checkOriginality(concept('Grandma’s Samovar'), research);
    expect(r.ok).toBe(true);
    expect(r.closest).toBeDefined();
  });
  it('fails a concept that names a researched title (Arabic too), a creator, or a franchise', () => {
    expect(checkOriginality(concept('A new show', 'Like هذا البحر سوف يفيض but in Basra.'), research)).toMatchObject({ ok: false, note: expect.stringMatching(/names a researched title/) });
    expect(checkOriginality(concept('Night Shift', 'Directed in the style of Jeethu Joseph.'), research)).toMatchObject({ ok: false, note: expect.stringMatching(/creator/) });
    expect(checkOriginality(concept('Kids of Baghdad', 'A Pixar-style adventure.'), research)).toMatchObject({ ok: false, note: expect.stringMatching(/franchise.*pixar/) });
    expect(checkOriginality(concept('أبطال الحارة', 'مغامرة مثل توم وجيري في الكرادة'), research)).toMatchObject({ ok: false, note: expect.stringMatching(/توم وجيري/) });
  });
  it('fails a title too close to a researched one; a common short word alone is not a citation', () => {
    expect(checkOriginality(concept('Verity'), research)).toMatchObject({ ok: false, note: expect.stringMatching(/too close to “Verity \(film\)”/) });
    expect(checkOriginality(concept('The Tea War', 'A war over the last glass of tea.'), research).ok).toBe(true);
  });
});
