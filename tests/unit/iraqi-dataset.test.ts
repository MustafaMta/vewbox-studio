import { describe, expect, it } from 'vitest';
import { normaliseIraqi } from '@/server/training/iraqi-text-normalise';
import { DIALECT_UNITS, REGRESSION_WORDS, phonemeCoverage } from '@/server/training/iraqi-phonemes';

/** The Iraqi dataset pipeline's pure parts (the producer's master directive §8–§10): the training transcript keeps every
 *  dialect letter and spelling, loses only marks and digit forms; the coverage table counts the dialect-bearing units. */
describe('normaliseIraqi', () => {
  it('keeps چ گ پ ڤ and the spelling; removes tatweel, tashkeel and bidi marks; spells digits the Baghdadi way; spaces punctuation', () => {
    expect(normaliseIraqi('گلتلك باچر نكعد نحچي ونشرب چاي.')).toBe('گلتلك باچر نكعد نحچي ونشرب چاي.');
    expect(normaliseIraqi('شلونــك؟صارلي‏ هوايةً ما شايفك')).toBe('شلونك؟ صارلي هواية ما شايفك');
    expect(normaliseIraqi('عندي ٣ چاي')).toBe('عندي ثلاثة چاي');
    expect(normaliseIraqi('  هسه ،  لازم  نروح ')).toBe('هسه، لازم نروح');
  });
});

describe('the Kharrufa corpus adapter', () => {
  it('reads metadata.txt (file|transcript|count), one speaker, and flags the phoneme-drill sentences', async () => {
    const os = await import('node:os'); const fs = await import('node:fs/promises'); const path = await import('node:path');
    const { sourceAdapter } = await import('@/server/training/iraqi-sources');
    // both Kharrufa sources read the one expanded zip under raw/iraqi-dialect-tts-corpus
    const raw = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'kharrufa-')), 'iraqi-dialect-tts-corpus');
    const base = path.join(raw, 'extracted', 'ar-IQ_hayder');
    await fs.mkdir(path.join(base, 'audio_files'), { recursive: true });
    await fs.writeFile(path.join(base, 'metadata.txt'), '﻿a.wav|تَڤَّڤَچَ وَتَڤِّڤَچِ|12\nb.wav|شلونك؟ صارلي هواية ما شايفك|26\n', 'utf8');
    await fs.writeFile(path.join(base, 'generated_metadata.txt'), 'a.wav|تَڤَّڤَچَ وَتَڤِّڤَچِ|12\n', 'utf8');
    const out = []; for await (const u of sourceAdapter('iraqi-dialect-tts-corpus').utterances(raw)) out.push(u);
    expect(out).toEqual([
      { audio: path.join(base, 'audio_files', 'a.wav'), transcript: 'تَڤَّڤَچَ وَتَڤِّڤَچِ', speaker: 'hayder', flags: ['phoneme-drill'] },
      { audio: path.join(base, 'audio_files', 'b.wav'), transcript: 'شلونك؟ صارلي هواية ما شايفك', speaker: 'hayder', flags: [] },
    ]);
  });
});

describe('phonemeCoverage', () => {
  it('counts utterances and occurrences per dialect unit and per regression word', () => {
    const rows = phonemeCoverage(['گلتلك باچر نكعد نحچي ونشرب چاي.', 'شلونك؟ صارلي هواية ما شايفك.', 'چاي چاي']);
    const by = Object.fromEntries(rows.map((r) => [r.unit, r]));
    expect(by['چ']).toMatchObject({ utterances: 2, occurrences: 5 });
    expect(by['گ']).toMatchObject({ utterances: 1, occurrences: 1 });
    expect(by['word چاي']).toMatchObject({ utterances: 2, occurrences: 3 });
    expect(by['word شلونك']).toMatchObject({ utterances: 1, occurrences: 1 });
    expect(by['word گدام']).toMatchObject({ utterances: 0, occurrences: 0 });
    expect(rows).toHaveLength(DIALECT_UNITS.length + REGRESSION_WORDS.length);
  });
});
