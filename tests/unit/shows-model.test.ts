import { describe, expect, it } from 'vitest';
import { seed } from '@/domain/sample';
import { emptyStudio } from '@/domain/actions';
import { DEFAULT_SETTINGS } from '@/domain/settings';
import { episodeCard, episodesInOrder, filterShows, nextAction, showCards, showView, stageOf, waitingProductions } from '@/components/show/model';

/** The Shows pages read the studio through src/components/show/model.ts: every word comes from the state. */
describe('the Shows pages’ reading of the studio', () => {
  const s = seed();

  it('an empty studio has no show card (the page draws its start instead)', () => {
    expect(showCards({ ...emptyStudio(DEFAULT_SETTINGS) })).toEqual([]);
  });

  it('a catalogue card says seasons, episodes and genre, and where the show stands', () => {
    const cards = showCards(s);
    const sip = cards.find((c) => c.id === 'last-sip')!;
    expect(sip.meta).toEqual(['2 seasons', '3 episodes', 'Comedy']);
    expect(sip.status.tone).toBe('current');
    const kites = cards.find((c) => c.id === 'paper-kites')!;
    expect(kites.status).toEqual({ words: 'No episodes yet', tone: 'idle' });
    // waiting wins over the stage when a decision on one of its episodes waits
    const waiting = showCards(s, new Set(['s2e1'])).find((c) => c.id === 'last-sip')!;
    expect(waiting.status).toEqual({ words: 'Waiting for you', tone: 'waiting' });
  });

  it('filters by words and by state', () => {
    const cards = showCards(s);
    expect(filterShows(cards, 'kites', 'all').map((c) => c.id)).toEqual(['paper-kites']);
    expect(filterShows(cards, '', 'finished')).toEqual([]);
    expect(filterShows(cards, '', 'working').map((c) => c.id)).toEqual(['last-sip']);
  });

  it('episodes run in watching order; Continue is the first unfinished one, Watch the latest cut', () => {
    const show = s.shows.find((x) => x.id === 'last-sip')!;
    expect(episodesInOrder(s, 'last-sip').map((p) => p.id)).toEqual(['s1e1', 's1e2', 's2e1']);
    const v = showView(s, show);
    expect(v.continue?.episode.id).toBe('s1e1');
    expect(v.continue?.href).toMatch(/\/shows\/last-sip\/seasons\/last-sip-s1\/episodes\/s1e1\/production\?tab=/);
    expect(v.watch?.href).toBe('/screening?p=s1e1');
    expect(v.slate).toContain('2 seasons');
  });

  it('an episode card carries its number, synopsis and stage; the meter has six segments', () => {
    const p = s.productions.find((x) => x.id === 's1e2')!;
    const e = episodeCard(s, p, new Set());
    expect(e.number).toBe(2);
    expect(e.synopsis).toBe(p.logline);
    expect(e.stage.words).toBe('Filming');
    expect(e.stage.segments).toEqual(['done', 'done', 'done', 'current', 'upcoming', 'upcoming']);
    expect(stageOf(p, true).words).toBe('Filming · waiting for you');
    expect(stageOf({ ...p, stage: 'COMPLETE' }, false).segments.every((x) => x === 'done')).toBe(true);
  });

  it('the next step opens the matching workspace tab (the cast tab is "characters")', () => {
    const p = s.productions.find((x) => x.id === 's2e1')!;
    expect(nextAction(p).href).toBe('/shows/last-sip/seasons/last-sip-s2/episodes/s2e1/production?tab=story');
    expect(waitingProductions([{ kind: 'stage', id: 'x', title: 't', subject: { productionId: 's2e1' }, since: null, href: '/' }] as never)).toEqual(new Set(['s2e1']));
  });
});
