import { describe, expect, it } from 'vitest';
import { carriedStoryOf, deriveWorld, sceneStoryFromScript, worldForPlanner, worldForStory } from '@/domain/world';
import { ScriptSchema } from '@/server/story/schemas';
import { scriptWorld } from '@/server/story/engine';
import { seed } from '@/domain/sample';
import type { Production, SceneStory, StudioState } from '@/domain/types';

/** WHAT LASTS ACROSS EPISODES (producer directive: Episode N+1 inherits Episode N's state). The script writer reports
 *  what each scene establishes; the World Bible carries what people learned and the changes still in force into every
 *  later episode's writer and shot planner. */

const NOW = '2026-10-07T00:00:00.000Z';
let n = 0;
const newId = (prefix: string) => `${prefix}-${++n}`;

describe('the script writer’s scene facts', () => {
  const people = [{ id: 'c-omar', name: 'Omar', nameAr: 'عمر' }, { id: 'c-ruth', name: 'Ruth' }];
  const places = [{ id: 'l-dock', name: 'The Dock' }];

  it('resolve names to the cast and places; unknown people are dropped, unknown subjects are props', () => {
    const st = sceneStoryFromScript(undefined, {
      events: ['  The ferry leaves without them. ', ''],
      knowledge: [{ characterName: 'ruth', text: 'Omar sold the boat' }, { characterName: 'Stranger', text: 'something' }],
      changes: [{ subject: 'عمر', key: 'left arm', text: 'in a sling' }, { subject: 'The Dock', key: 'gate', text: 'chained shut' }, { subject: 'the radio', text: 'smashed' }],
    }, people, places, newId)!;
    expect(st.events?.map((e) => e.text)).toEqual(['The ferry leaves without them.']);
    expect(st.knowledge).toEqual([expect.objectContaining({ characterId: 'c-ruth', text: 'Omar sold the boat', source: 'SCRIPT' })]);
    expect(st.changes?.map((c) => c.subject)).toEqual([{ kind: 'CHARACTER', characterId: 'c-omar' }, { kind: 'LOCATION', locationId: 'l-dock' }, { kind: 'PROP', name: 'the radio' }]);
    expect(st.changes?.[0].key).toBe('left arm');
  });

  it('a rewrite replaces the writer’s earlier facts and keeps the producer’s own', () => {
    const existing: SceneStory = { events: [{ id: 'p1', text: 'Producer fact' }, { id: 's1', text: 'Old writer fact', source: 'SCRIPT' }], relationships: [{ id: 'r1', text: 'cousins', characterIds: ['c-omar', 'c-ruth'] }] };
    const st = sceneStoryFromScript(existing, { events: ['New writer fact'] }, people, places, newId)!;
    expect(st.events?.map((e) => e.text)).toEqual(['Producer fact', 'New writer fact']);
    expect(st.relationships).toHaveLength(1);
    expect(sceneStoryFromScript(undefined, { events: [], knowledge: [], changes: [] }, people, places, newId)).toBeUndefined();
  });

  it('the script schema reads facts (with aliases) and tolerates a scene without them', () => {
    const out = ScriptSchema.parse({ scenes: [
      { sceneId: 'a', beats: [{ action: 'He waits.', lines: [] }], facts: { happened: ['x'], learns: [{ character: 'Ruth', fact: 'y' }], changes: [{ who: 'Omar', aspect: 'arm', state: 'bandaged' }] } },
      { sceneId: 'b', beats: [{ action: 'She leaves.', lines: [] }], facts: null },
    ] });
    expect(out.scenes[0].facts).toEqual({ events: ['x'], knowledge: [{ characterName: 'Ruth', text: 'y' }], changes: [{ subject: 'Omar', key: 'arm', text: 'bandaged' }] });
    expect(out.scenes[1].facts).toBeUndefined();
  });
});

describe('carried into later episodes', () => {
  const s = seed();
  const e1 = s.productions.find((p) => p.id === 's1e1')!;
  const e2 = s.productions.find((p) => p.id === 's1e2')!;
  const who = e1.scenes[0].characterIds[0];
  const name = s.characters.find((c) => c.id === who)!.name;
  const withStory = (p: Production, i: number, story: SceneStory): Production => ({ ...p, scenes: p.scenes.map((sc, j) => (j === i ? { ...sc, story } : sc)) });
  const p1 = withStory(e1, 0, { knowledge: [{ id: 'k1', characterId: who, text: 'the café is being sold' }], changes: [{ id: 'c1', subject: { kind: 'CHARACTER', characterId: who }, key: 'hand', text: 'a bandaged hand' }, { id: 'c2', subject: { kind: 'PROP', name: 'kettle' }, key: 'kettle', text: 'dented' }] });
  const p1b = withStory(p1, p1.scenes.length - 1, { ...p1.scenes[p1.scenes.length - 1].story, changes: [{ id: 'c3', subject: { kind: 'PROP', name: 'kettle' }, key: 'kettle', text: '', cleared: true }] });

  it('a later change with the same key ends or replaces an earlier one; knowledge accumulates', () => {
    const r = carriedStoryOf([p1b]);
    expect(r.knowledge.map((k) => k.text)).toEqual(['the café is being sold']);
    expect(r.changesInForce.map((c) => c.text)).toEqual(['a bandaged hand']);
  });

  it('the next episode’s writer and shot planner are told what is still true and what people know', () => {
    const state: StudioState = { ...s, productions: s.productions.map((p) => (p.id === e1.id ? p1b : p)) };
    const bible = deriveWorld(state, { kind: 'SHOW', showId: e1.showId! }, undefined, NOW);
    const story = worldForStory(bible);
    expect(story.stillTrue).toEqual([`${name} (hand): a bandaged hand`]);
    expect(story.knownBy).toEqual([`${name} knows: the café is being sold`]);
    expect(scriptWorld(bible)).toContain('a bandaged hand');
    const scene = e2.scenes.find((sc) => sc.characterIds.includes(who));
    expect(scene).toBeDefined();
    if (scene) {
      const text = worldForPlanner(bible, e2, scene);
      expect(text).toContain(`Still true from earlier episodes (show it, unless this scene changes it): ${name} (hand): a bandaged hand.`);
      expect(text).toContain(`${name}: the café is being sold`);
      // the episode that established them does not read them back as "earlier"
      expect(worldForPlanner(bible, p1b, p1b.scenes[0])).not.toContain('Still true from earlier episodes');
    }
  });
});
