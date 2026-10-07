import { describe, expect, it } from 'vitest';
import { addCastMember, addLocationMember, addProduction, addScene, updateProduction, updateScene, updateShow } from '@/domain/actions';
import { productionStyleProblems } from '@/domain/style-rule';
import { preflightPlan, preflightTake } from '@/server/org/preflight';
import { seed } from '@/domain/sample';

/** ONE STYLE PER PRODUCTION (2026-10-08): "The Last Crossing" (realistic) borrowed "The Lamp Keeper"'s cartoon lantern
 *  room, and its plates came out as an animated-feature still. A production or show takes only people and places of
 *  its own style; existing mixes are not re-judged by unrelated edits, the preflight reports them. */

describe('the rule on every path that brings someone or somewhere in', () => {
  const s = seed(); // CARTOON show last-sip (cafe, alley, rooftop are cartoon; riverbank and nour are realistic)
  const ep = 's1e1';

  it('membership, scenes and new productions refuse another style, naming who and the way out', () => {
    expect(() => addLocationMember(s, { productionId: ep }, ['riverbank'])).toThrow(/“.+” is cartoon; Tigris Riverbank is a realistic place\. Use a cartoon version/);
    expect(() => addCastMember(s, { showId: 'last-sip' }, ['nour'])).toThrow(/Nour is a realistic person/);
    const sc = s.productions.find((p) => p.id === ep)!.scenes[0];
    expect(() => updateScene(s, ep, sc.id, { locationId: 'riverbank' })).toThrow(/realistic place/);
    expect(() => addScene(s, ep, { title: 'x', timeOfDay: 'NIGHT', characterIds: ['nour'] })).toThrow(/realistic person/);
    expect(() => addProduction(s, { kind: 'SHORT', title: 'Mixed', style: 'CARTOON', language: 'EN', aspect: 'WIDE_16_9', targetSeconds: 30, brief: { mode: 'MANUAL', text: 'x' }, castIds: ['nour'], locationIds: [] })).toThrow(/Nour/);
    // the same style is fine
    expect(() => addLocationMember(s, { productionId: ep }, ['alley'])).not.toThrow();
  });

  it('existing mixes are not re-judged by unrelated edits; a style change judges every member', () => {
    // paper-boats (realistic) already holds the cartoon alley in the sample studio
    expect(productionStyleProblems(s, s.productions.find((p) => p.id === 'paper-boats')!).places.map((l) => l.id)).toEqual(['alley']);
    expect(() => updateProduction(s, 'paper-boats', { logline: 'edited' })).not.toThrow();
    expect(() => updateShow(s, 'last-sip', { style: 'REALISTIC' })).toThrow(/is a cartoon/);
  });
});

describe('the preflight reports an existing mix before any shot is planned or filmed', () => {
  const s = seed();
  it('plan and take', () => {
    const p = s.productions.find((x) => x.id === 'paper-boats')!;
    const plan = preflightPlan(p, undefined, s);
    if (p.scenes.some((sc) => sc.locationId === 'alley') || p.locationIds.includes('alley')) {
      expect(plan.checks.find((c) => c.name === 'one-style')).toMatchObject({ ok: false, failureClass: 'INCONSISTENT_PLAN' });
      expect(plan.checks.find((c) => c.name === 'one-style')?.detail).toMatch(/alley/i);
    }
    const sh = p.shots.find((x) => p.scenes.find((sc) => sc.id === x.sceneId)?.locationId === 'alley');
    if (sh) expect(preflightTake(s, p, sh, { backend: 'local' }).checks.find((c) => c.name === 'one-style')?.ok).toBe(false);
    const clean = s.productions.find((x) => x.id === 's1e1')!;
    expect(preflightPlan(clean, undefined, s).checks.find((c) => c.name === 'one-style')?.ok).toBe(true);
  });
});
