import { describe, expect, it } from 'vitest';
import { IRAQI_LEXICON, dialectWords, engineText, pronounce } from '@/server/providers/iraqi-g2p';
import { REGRESSION_WORDS } from '@/server/training/iraqi-phonemes';

/** THE IRAQI FRONTEND'S PERMANENT REGRESSION (the master directive §9): the producer's words and the brief's vocabulary
 *  always get their Baghdadi realisation; the dialogue text itself is never respelled. */
describe('Iraqi G2P', () => {
  it('the producer’s regression words: چ → tʃ, گ → ɡ, the contraction گلتلك, and گدام', () => {
    const ipa = (w: string) => pronounce(w).words[0].ipa;
    expect(ipa('باچر')).toBe('ˈbaːtʃir');
    expect(ipa('نحچي')).toBe('ˈniħtʃi');
    expect(ipa('چاي')).toBe('tʃaːj');
    expect(ipa('چنت')).toBe('ˈtʃinit');
    expect(ipa('گلت')).toBe('ˈɡilit');
    expect(ipa('گلتلك')).toBe('ˈɡitlak');
    expect(ipa('گدام')).toBe('ɡidˈdaːm');
  });
  it('the hard line, word by word: every چ word carries tʃ and every گ word carries ɡ; punctuation is a phrase break', () => {
    const p = pronounce('گلتلك باچر نكعد نحچي ونشرب چاي.');
    expect(p.engineText).toBe('گلتلك باچر نكعد نحچي ونشرب چاي.');
    expect(p.words.map((w) => w.ipa)).toEqual(['ˈɡitlak', 'ˈbaːtʃir', 'ˈniɡʕud', 'ˈniħtʃi', 'wˈniʃrab', 'tʃaːj']);
    expect(p.ipa.endsWith('|')).toBe(true);
    expect(dialectWords('گلتلك باچر نكعد نحچي ونشرب چاي.')).toEqual([{ word: 'گلتلك', must: ['ɡ'] }, { word: 'باچر', must: ['tʃ'] }, { word: 'نحچي', must: ['tʃ'] }, { word: 'چاي', must: ['tʃ'] }]);
  });
  it('ق: ɡ by default, q in the learned/religious list, k in وقت-type words; پ and ڤ', () => {
    const ipa = (w: string) => pronounce(w).words[0].ipa;
    expect(ipa('قبل')).toBe('ˈɡabul');
    expect(ipa('حقيقة')).toBe('ħaˈqiːqa');
    expect(ipa('وقت')).toBe('ˈwakit');
    expect(ipa('قرية')).toMatch(/^ɡ/);        // rules: not in the q-list
    expect(ipa('اقتصاد')).toMatch(/q/);         // rules: in the q-list
    expect(ipa('پرده')).toBe('ˈparda');
    expect(ipa('ڤيزا')).toBe('ˈviːza');
    expect(dialectWords('حقيقة وقت قبل')).toEqual([{ word: 'حقيقة', must: ['q'] }, { word: 'وقت', must: ['k'] }, { word: 'قبل', must: ['ɡ'] }]);
  });
  it('clitics around a known stem, and the article', () => {
    const p = pronounce('وشلونك؟ الچاي بيتچ');
    expect(p.words[0]).toMatchObject({ ipa: 'wʃˈloːnak', source: 'LEXICON_STEM' });
    expect(p.words[1].ipa).toBe('itʃtʃaːj');
    expect(p.words[1].notes).toContain('article assimilated');
    expect(p.words[2].ipa).toBe('ˈbeːtitʃ');
  });
  it('the text given to an engine is the producer’s text, never respelled', () => {
    expect(engineText('گلتلك‏ باچر  نكعد')).toBe('گلتلك باچر نكعد');
    expect(pronounce('كلشي يصير زين').engineText).toBe('كلشي يصير زين');
  });
  it('pronounced spelling for TRAINING transcripts only: standard-orthography Iraqi words the lexicon knows are respelled; the rest, and ambiguous ق, stay', async () => {
    const { pronouncedSpelling } = await import('@/server/providers/iraqi-g2p');
    const r = pronouncedSpelling('قلت لك باكر نقعد نحكي ونشرب شاي، وقت الحقيقة قريب');
    expect(r.text).toBe('گلت لك باچر نگعد نحچي ونشرب چاي، وقت الحقيقة قريب');
    expect(r.changes.map((c) => c.to)).toEqual(['گلت', 'باچر', 'نگعد', 'نحچي', 'چاي']);
    // a word already in pronounced spelling is untouched; clitics around a known stem are kept
    expect(pronouncedSpelling('گلتلك باچر').changes).toEqual([]);
    expect(pronouncedSpelling('والشاي').text).toBe('والچاي');
    // the producer's dialogue path never respells
    expect(engineText('قلت لك باكر')).toBe('قلت لك باكر');
  });
  it('every regression word of the coverage table has a pronunciation the lexicon or the rules give with the right dialect sound', () => {
    for (const w of REGRESSION_WORDS) {
      const { ipa } = pronounce(w).words[0];
      if (w.includes('چ')) expect(ipa, w).toContain('tʃ');
      if (w.includes('گ')) expect(ipa, w).toContain('ɡ');
    }
    expect(Object.keys(IRAQI_LEXICON).length).toBeGreaterThan(90);
  });
});
