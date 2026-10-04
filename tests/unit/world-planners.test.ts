import { describe, expect, it } from 'vitest';
import { deriveWorld, worldForStory } from '@/domain/world';
import { planningWorld, scriptWorld } from '@/server/story/engine';
import { seed } from '@/domain/sample';
import type { StudioState } from '@/domain/types';

/** EVERY PLANNER READS THE PINNED REVISION: story development (worldForStory), the script writer (scriptWorld) and the
 *  shot planner (planningWorld) are told the same World Bible — rules, relationships, timeline facts, open storylines,
 *  the returning places. No planner is told a world from the studio's current records or from a conversation. */

const NOW = '2026-10-03T00:00:00.000Z';

describe('the planners and the World Bible', () => {
  const s = seed();
  const show = s.shows.find((x) => x.id === 'last-sip')!;
  const state: StudioState = { ...s, shows: s.shows.map((x) => (x.id === show.id ? { ...x, bible: { worldRules: ['Nobody pays at the café.'], relationships: ['Layla is Abu Samir’s niece.'], timeline: ['S1E1: Layla opened the café an hour early.'], unresolved: ['Karim’s eleven teas'] } } : x)) };
  const bible = deriveWorld(state, { kind: 'SHOW', showId: show.id }, undefined, NOW);

  it('the script writer is told the rules, relationships, timeline and open storylines of the revision', () => {
    const block = scriptWorld(bible);
    expect(block).toMatch(/^World Bible \(respect every fact/);
    expect(block).toContain('Nobody pays at the café.');
    expect(block).toContain('Layla is Abu Samir’s niece.');
    expect(block).toContain('S1E1: Layla opened the café an hour early.');
    expect(block).toContain('Karim’s eleven teas');
    expect(scriptWorld(undefined)).toBe('');
  });

  it('story development and the shot planner read the same revision', () => {
    const story = worldForStory(bible);
    expect(story.rules).toEqual(['Nobody pays at the café.']);
    expect(story.places.map((p) => p.name)).toContain('Abu Samir’s Café');
    const e2 = state.productions.find((p) => p.id === 's1e2')!;
    // s1e2 returns to the café: the planner is told what s1e1 left there (the bible's state of its last café scene)
    const text = planningWorld(e2, e2.scenes[0], bible);
    expect(text).toMatch(/World rules: Nobody pays at the café\./);
    expect(text).toMatch(/RETURNING LOCATION \(World Bible\): Abu Samir’s Café was already shown/);
  });
});
