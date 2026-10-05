import { describe, expect, it } from 'vitest';
import { seed } from '@/domain/sample';
import { runCommand, isSystemCommand, validateClientCommand, type Command } from '@/domain/commands';
import { episodeFactsOf, episodeTag } from '@/domain/actions';
import { deriveWorld, diffWorld, hashWorld, repinSafety, usageOf, worldForPlanner, worldForStory } from '@/domain/world';
import type { StudioState } from '@/domain/types';

/** EPISODES AND SEASONS: the show's bible (world rules, relationships, timeline, open storylines) feeds every episode's
 *  World Bible revision; finishing an episode appends its facts and its new open storylines to the show's bible with
 *  an idempotent command, so the next episode — and the next season — starts from them. On the sample show "The Last
 *  Sip": S1E1 and S1E2 in season 1, S2E1 in season 2. */

const NOW = '2026-10-03T00:00:00.000Z';
const run = (s: StudioState, name: string, args: unknown[]) => runCommand(s, { name, args, seed: `ep-${name}`, at: NOW } as unknown as Command).state;
const scope = { kind: 'SHOW' as const, showId: 'last-sip' };

describe('the show bible across episodes and seasons', () => {
  const s0: StudioState = (() => { const s = seed(); return { ...s, shows: s.shows.map((x) => (x.id === 'last-sip' ? { ...x, bible: { worldRules: ['Nobody pays at the café.'], relationships: ['Layla is Abu Samir’s niece.'], unresolved: ['Who is the stranger?'] } } : x)) }; })();
  const e1 = s0.productions.find((p) => p.id === 's1e1')!;
  const facts = { events: ['Layla opened the café an hour early.', 'A stranger tried to pay and was refused.'], unresolved: ['Will the morning hour last?'], resolved: [], relationships: ['Karim sleeps on the café step.'] };

  it('the tag and the facts: given ones tagged, else the scenes’ exit states', () => {
    expect(episodeTag(s0, e1)).toBe('S1E1');
    expect(episodeFactsOf(s0, e1, facts).events).toEqual(['S1E1: Layla opened the café an hour early.', 'S1E1: A stranger tried to pay and was refused.']);
    const withExit = { ...e1, scenes: e1.scenes.map((sc, i) => ({ ...sc, exitState: i === 0 ? 'Karim is awake and inside' : 'The note is back in the stranger’s pocket' })) };
    expect(episodeFactsOf(s0, withExit).events).toEqual(['S1E1: Karim is awake and inside', 'S1E1: The note is back in the stranger’s pocket']);
    expect(episodeTag(s0, s0.productions.find((p) => p.id === 's2e1')!)).toBe('S2E1');
  });

  it('finishing S1E1 appends its facts, opens its storylines, adds its relationships — and finishing it again changes nothing (the same state, the same World Bible hash)', () => {
    const s1 = run(s0, 'finishEpisode', ['s1e1', facts]);
    const bible = s1.shows.find((x) => x.id === 'last-sip')!.bible!;
    expect(bible.timeline).toEqual(['S1E1: Layla opened the café an hour early.', 'S1E1: A stranger tried to pay and was refused.']);
    expect(bible.unresolved).toEqual(['Who is the stranger?', 'Will the morning hour last?']);
    expect(bible.relationships).toEqual(['Layla is Abu Samir’s niece.', 'Karim sleeps on the café step.']);
    expect(bible.worldRules).toEqual(['Nobody pays at the café.']);
    const again = run(s1, 'finishEpisode', ['s1e1', facts]);
    expect(again.shows.find((x) => x.id === 'last-sip')!.bible).toEqual(bible);
    expect(hashWorld(deriveWorld(again, scope, undefined, NOW))).toBe(hashWorld(deriveWorld(s1, scope, undefined, NOW)));
    // a re-cut with other facts replaces this episode's entries only
    const recut = run(s1, 'finishEpisode', ['s1e1', { events: ['Layla opened the café at seven.'] }]);
    expect(recut.shows.find((x) => x.id === 'last-sip')!.bible!.timeline).toEqual(['S1E1: Layla opened the café at seven.']);
  });

  it('S1E2 starts from S1E1’s facts; finishing S1E2 closes a storyline; season 2 starts from both, its open storylines the ones still open', () => {
    const s1 = run(s0, 'finishEpisode', ['s1e1', facts]);
    const before = deriveWorld(s0, scope, undefined, NOW);
    const r1 = deriveWorld(s1, scope, before, NOW);
    // the next episode's World Bible: the facts after S1E1's scenes, the open storylines, the relationships
    const e2 = s1.productions.find((p) => p.id === 's1e2')!;
    const story = worldForStory(r1);
    expect(story.timeline).toEqual(expect.arrayContaining(['S1E1: Layla opened the café an hour early.']));
    expect(story.openStorylines).toEqual(['Who is the stranger?', 'Will the morning hour last?']);
    expect(story.relationships).toContain('Karim sleeps on the café step.');
    expect(worldForPlanner(r1, e2, e2.scenes[0])).toMatch(/World rules: Nobody pays at the café\./);
    const fact = r1.timeline.findIndex((e) => e.text.startsWith('S1E1: Layla'));
    const lastE1Scene = r1.timeline.map((e) => e.productionId).lastIndexOf('s1e1');
    const firstE2Scene = r1.timeline.findIndex((e) => e.productionId === 's1e2');
    expect(fact).toBeGreaterThan(lastE1Scene);
    expect(fact).toBeLessThan(firstE2Scene);
    // the facts are additions: a production pinned before them follows them safely (nothing it filmed changes)
    const diff = diffWorld(before, r1);
    expect(diff.map((c) => c.path)).toEqual(expect.arrayContaining(['openStorylines']));
    expect(repinSafety(diff, usageOf(s0.productions.find((p) => p.id === 's1e1')!)).safe).toBe(true);
    // S1E2 closes a storyline and opens one; season 2's first episode starts from it all
    const s2 = run(s1, 'finishEpisode', ['s1e2', { events: ['Karim pays his debt in poems.'], resolved: ['who is the stranger?'], unresolved: ['Does a poem count as payment?'] }]);
    const r2 = deriveWorld(s2, scope, r1, NOW);
    expect(r2.openStorylines).toEqual(['Will the morning hour last?', 'Does a poem count as payment?']);
    const s2e1 = s2.productions.find((p) => p.id === 's2e1')!;
    const season2 = worldForStory(r2);
    expect(season2.timeline).toEqual(expect.arrayContaining(['S1E1: Layla opened the café an hour early.', 'S1E2: Karim pays his debt in poems.']));
    expect(r2.timeline.findIndex((e) => e.text === 'S1E2: Karim pays his debt in poems.')).toBeLessThan(r2.timeline.findIndex((e) => e.productionId === s2e1.id) === -1 ? Infinity : r2.timeline.findIndex((e) => e.productionId === s2e1.id));
  });

  it('only an episode of a show is finished, and only the studio finishes one', () => {
    expect(() => run(s0, 'finishEpisode', ['night-tray', {}])).toThrow(/Only an episode of a show/);
    expect(isSystemCommand('finishEpisode')).toBe(true);
    expect(() => validateClientCommand('finishEpisode', ['s1e1', {}])).toThrow(/written by the studio/);
  });
});
