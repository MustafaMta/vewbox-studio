import { describe, expect, it } from 'vitest';
import { activePronunciations, applyPronunciations, proposePronunciation, reviewPronunciation, type PronunciationEntry } from '@/domain/pronunciation';
import { prepareLineText } from '@/server/providers/iraqi-text';
import { runCommand } from '@/domain/commands';
import { seed } from '@/domain/sample';

/** THE PRONUNCIATION DICTIONARY and its native review rule: nothing is spoken differently until a native reviewer
 *  approved it; the script is never rewritten. */
const AT = '2026-10-08T12:00:00.000Z';
const base = (): PronunciationEntry => proposePronunciation([], 'p1', { word: 'باچر', say: 'باچِر', language: 'AR', dialect: 'IRAQI_BAGHDADI', proposedBy: 'producer' }, AT);

describe('the native review rule', () => {
  it('a proposal is not spoken; a non-native approval changes nothing; a native approval makes it spoken', () => {
    const e = base();
    expect(e.status).toBe('PROPOSED');
    expect(activePronunciations([e], { language: 'AR', dialect: 'IRAQI_BAGHDADI', engine: 'habibi' })).toEqual([]);
    const nonNative = reviewPronunciation(e, { by: 'engineer', native: false, verdict: 'APPROVED' }, AT);
    expect(nonNative.status).toBe('PROPOSED');
    expect(nonNative.reviews).toHaveLength(1);
    const ok = reviewPronunciation(nonNative, { by: 'Baghdadi reviewer', native: true, verdict: 'APPROVED' }, AT);
    expect(ok.status).toBe('APPROVED');
    expect(activePronunciations([ok], { language: 'AR', dialect: 'IRAQI_BAGHDADI', engine: 'habibi' })).toHaveLength(1);
    // another dialect or language never gets it
    expect(activePronunciations([ok], { language: 'AR', engine: 'habibi' })).toEqual([]);
    expect(reviewPronunciation(ok, { by: 'Baghdadi reviewer', native: true, verdict: 'REJECTED', note: 'wrong vowel' }, AT).status).toBe('REJECTED');
  });

  it('refuses an empty, unchanged or duplicate proposal', () => {
    expect(() => proposePronunciation([], 'x', { word: 'باچر', say: 'باچر', language: 'AR', proposedBy: 'p' }, AT)).toThrow(/same as the word/);
    expect(() => proposePronunciation([base()], 'x', { word: 'باچر', say: 'باچره', language: 'AR', dialect: 'IRAQI_BAGHDADI', proposedBy: 'p' }, AT)).toThrow(/already has/);
  });
});

describe('applying approved entries', () => {
  const approved = reviewPronunciation(base(), { by: 'r', native: true, verdict: 'APPROVED' }, AT);
  it('whole words only, an attached prefix kept, the engines filter honoured', () => {
    expect(applyPronunciations('خليها لباچر، وباچر زين', [approved], { language: 'AR', dialect: 'IRAQI_BAGHDADI', engine: 'habibi' }).text).toBe('خليها لباچِر، وباچِر زين');
    expect(applyPronunciations('باچرين', [approved], { language: 'AR', dialect: 'IRAQI_BAGHDADI', engine: 'habibi' }).applied).toEqual([]);
    const onlyFish = { ...approved, engines: ['fish-s2-pro'] };
    expect(applyPronunciations('باچر', [onlyFish], { language: 'AR', dialect: 'IRAQI_BAGHDADI', engine: 'habibi' }).text).toBe('باچر');
  });
  it('prepareLineText applies them and names each change; without the dictionary the line is unchanged', () => {
    const r = prepareLineText('هاي الحچاية طويلة، خليها لباچر.', { engine: 'habibi', language: 'AR', dialect: 'IRAQI_BAGHDADI', pronunciations: [approved] });
    expect(r.text).toBe('هاي الحچاية طويلة، خليها لباچِر.');
    expect(r.changes).toContain('pronunciation: «باچر» → «باچِر»');
    expect(prepareLineText('خليها لباچر.', { engine: 'habibi', language: 'AR', dialect: 'IRAQI_BAGHDADI' }).text).toBe('خليها لباچر.');
  });
});

describe('the commands', () => {
  it('propose → review → remove through the command set; a settings patch cannot write the dictionary', () => {
    let s = seed();
    const cmd = (name: string, args: unknown[]) => { const r = runCommand(s, { name, args, seed: `t-${name}-${Math.random()}`, at: AT } as never); s = r.state; return r.result as { entry?: PronunciationEntry } | undefined; };
    const made = cmd('proposePronunciation', [{ word: 'هيچ', say: 'هيچْ', language: 'AR', dialect: 'IRAQI_BAGHDADI', proposedBy: 'producer' }]);
    const id = made!.entry!.id;
    cmd('reviewPronunciation', [id, { by: 'native reviewer', native: true, verdict: 'APPROVED' }]);
    expect(s.settings.voice?.pronunciations?.[0].status).toBe('APPROVED');
    cmd('updateSettings', [{ voice: { pronunciations: [] } }]);
    expect(s.settings.voice?.pronunciations).toHaveLength(1);
    cmd('removePronunciation', [id]);
    expect(s.settings.voice?.pronunciations).toEqual([]);
  });
});
