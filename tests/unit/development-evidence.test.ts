import { describe, expect, it } from 'vitest';
import type { ResearchItem } from '@/domain/development';
import { disciplinedAnalysis, evidenceIds, measuredTraceable, numbersIn } from '@/server/story/development/evidence';

/** EVIDENCE DISCIPLINE — the Audience Research Agent may only measure what the sources measured: unknown citations are
 *  dropped, an untraceable number removes the measurement and downgrades the pattern, uncited patterns are craft, and
 *  the cautions say that reach is not quality. */

const item = (id: string, metrics: ResearchItem['metrics'], over: Partial<ResearchItem> = {}): ResearchItem => ({ id, platform: 'WIKIPEDIA', provider: 'wikimedia-pageviews', url: `https://en.wikipedia.org/wiki/${id}`, title: id, retrievedAt: '2026-10-03T06:00:00Z', category: 'FILM', metrics, query: 'top en.wikipedia 2026-10-02', ...over });
const items = [item('ri-a', { pageviews: 238832, rank: 9, periodDays: 1 }), item('ri-b', { pageviews: 97669, rank: 27, periodDays: 1 }), item('ri-c', {}, { platform: 'NEWS', provider: 'gdelt-doc-2' })];

describe('numbers in a sentence', () => {
  it('reads plain, separated, abbreviated and Arabic-Indic numbers with their precision; ignores names and dates', () => {
    expect(numbersIn('238,832 pageviews and rank #9').map((n) => [n.value, n.tolerance])).toEqual([[238832, 0], [9, 0]]);
    expect(numbersIn('1.2M views, 238.8K reads, 3 million').map((n) => [n.value, n.tolerance])).toEqual([[1_200_000, 50_000], [238_800, 50], [3_000_000, 500_000]]);
    expect(numbersIn('٢٣٨٨٣٢ مشاهدة').map((n) => n.value)).toEqual([238832]);
    expect(numbersIn('E3 and P2 on 2026-10-02 in S1E4')).toEqual([]);
  });
  it('a measurement is traceable only when every number is a cited item’s metric (within its stated precision)', () => {
    expect(measuredTraceable('E1: 238,832 pageviews (rank 9) on 2026-10-02', [items[0]]).ok).toBe(true);
    expect(measuredTraceable('about 239K pageviews in 1 day', [items[0]]).ok).toBe(true);
    expect(measuredTraceable('about 240K pageviews', [items[0]])).toEqual({ ok: false, untraced: ['240K'] });
    // a number from another, uncited item does not count; a computed share is not a measurement
    expect(measuredTraceable('97669 pageviews', [items[0]]).ok).toBe(false);
    expect(measuredTraceable('41% of the attention', [items[0], items[1]]).ok).toBe(false);
  });
});

describe('the analysis as stored', () => {
  const ids = evidenceIds(items);
  it('maps E-ids, drops unknown citations, downgrades an untraceable measurement, labels craft, keeps the producer’s audience', () => {
    expect([...ids.entries()]).toEqual([['E1', 'ri-a'], ['E2', 'ri-b'], ['E3', 'ri-c']]);
    const { analysis, downgraded, droppedRefs } = disciplinedAnalysis({
      audience: 'adults who like mysteries',
      patterns: [
        { kind: 'HOOK', pattern: 'Open on a question', evidenceIds: ['E1', 'E9'], measured: 'E1: 238832 pageviews, rank 9', interpretation: 'Mystery titles draw readers', confidence: 'HIGH' },
        { kind: 'PACING', pattern: 'Short scenes', evidenceIds: ['e2'], measured: '1.5M views', interpretation: 'Fast pacing', confidence: 'HIGH' },
        { kind: 'EMOTION', pattern: 'A character to care about', evidenceIds: [], interpretation: 'Craft', confidence: 'HIGH' },
      ],
      cautions: ['Wikipedia reading is not watching.'],
    }, items, ids, 'Iraqi teenagers who watch anime');
    expect(droppedRefs).toBe(1);
    expect(downgraded).toBe(1);
    expect(analysis.audience).toBe('Iraqi teenagers who watch anime');
    expect(analysis.basis).toBe('EVIDENCE');
    expect(analysis.patterns[0]).toMatchObject({ id: 'P1', evidenceIds: ['ri-a'], measured: 'E1: 238832 pageviews, rank 9', confidence: 'HIGH' });
    expect(analysis.patterns[1]).toMatchObject({ id: 'P2', evidenceIds: ['ri-b'], measured: undefined, confidence: 'MEDIUM', limitations: expect.stringMatching(/Interpretation only.*1\.5M/) });
    expect(analysis.patterns[2]).toMatchObject({ evidenceIds: [], confidence: 'MEDIUM', limitations: expect.stringMatching(/Craft knowledge/) });
    expect(analysis.cautions.join(' ')).toMatch(/reach .* not whether a story worked/);
  });
  it('without evidence the basis is CRAFT_ONLY and the cautions say so', () => {
    const { analysis } = disciplinedAnalysis({ audience: 'families', patterns: [{ kind: 'HUMOR', pattern: 'p', evidenceIds: [], interpretation: 'i', confidence: 'LOW' }, { kind: 'HOOK', pattern: 'p', evidenceIds: [], interpretation: 'i', confidence: 'MEDIUM' }, { kind: 'ENDING', pattern: 'p', evidenceIds: [], measured: '12 views', interpretation: 'i', confidence: 'HIGH' }], cautions: [] }, [], new Map());
    expect(analysis.basis).toBe('CRAFT_ONLY');
    expect(analysis.patterns[2]).toMatchObject({ measured: undefined, confidence: 'MEDIUM' });
    expect(analysis.cautions.join(' ')).toMatch(/storytelling craft, not measurements/);
    expect(analysis.cautions.join(' ')).not.toMatch(/reach/);
  });
});
