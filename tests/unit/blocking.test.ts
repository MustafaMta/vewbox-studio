import { describe, expect, it } from 'vitest';
import { blockingFor, blockingLine, sideFromWords } from '@/domain/blocking';
import { identityDrift, productionContextFor, contextLines, contextRecord } from '@/domain/production-context';
import { preflightTake } from '@/server/org/preflight';
import { resolveShotPack, bindingOf } from '@/server/production/shot-pack';
import { h3ReferencePrompt } from '@/server/story/prompts';
import type { ContinuityState, Production, Shot } from '@/domain/types';
import { fixture, shotOf, TAKE_A } from './continuity-fixture';

/** Blocking and the 180° line as structured state (continuity gaps 2026-10-06, items 2–4): sides, facing and travel
 *  carried across cuts, contradictions named, match on action, drift-triggered re-anchoring. */

type People = ContinuityState['characters'];
const stage = (p: Production, id: string, characters: People, extra: Partial<ContinuityState> = {}, shot: Partial<Shot> = {}): Production => ({ ...p, shots: p.shots.map((s) => (s.id === id ? { ...s, ...shot, continuity: { ...s.continuity!, characters, ...extra } } : s)) });

describe('the side a position says', () => {
  it('reads the frame side and ignores facings, body parts and relative sides', () => {
    expect(sideFromWords('left third, facing right')).toBe('LEFT');
    expect(sideFromWords('screen-right, by the window')).toBe('RIGHT');
    expect(sideFromWords('centre of frame')).toBe('CENTER');
    expect(sideFromWords('behind the counter, cup in her left hand')).toBeUndefined();
    expect(sideFromWords('standing to his left')).toBeUndefined();
    expect(sideFromWords('between the left door and the right window')).toBeUndefined();
    expect(sideFromWords(undefined)).toBeUndefined();
  });
});

describe('the 180° line', () => {
  it('the order two people are staged in holds across the scene; a swap is named against the shot that set it', () => {
    const { p } = fixture();
    const [a, b] = p.castIds;
    let q = stage(p, 's11', [{ characterId: a, position: 'left of frame', screenDirection: 'RIGHT' }, { characterId: b, frameSide: 'RIGHT', screenDirection: 'LEFT' }]);
    q = stage(q, 's12', [{ characterId: a, frameSide: 'RIGHT' }, { characterId: b, frameSide: 'LEFT' }]);
    const bl = blockingFor(q, shotOf(q, 's12'));
    expect(bl.violations.map((v) => v.kind)).toEqual(['SIDES_SWAPPED']);
    expect(bl.violations[0]).toMatchObject({ againstShotId: 's11' });
    // the same swap, marked as crossing the line: no violation, and the new order holds from here
    const crossed = stage(q, 's12', [{ characterId: a, frameSide: 'RIGHT' }, { characterId: b, frameSide: 'LEFT' }], { camera: { crossesLine: true } });
    const ok = blockingFor(crossed, shotOf(crossed, 's12'));
    expect(ok.violations).toEqual([]);
    expect(ok.relations).toEqual([{ leftId: b, rightId: a, sinceShotId: 's12' }]);
  });

  it('a cut carries each person’s side and facing when its own record does not say them; a transition starts afresh', () => {
    const { p } = fixture();
    const [a, b] = p.castIds;
    let q = stage(p, 's11', [{ characterId: a, frameSide: 'LEFT', screenDirection: 'RIGHT' }, { characterId: b, frameSide: 'RIGHT', screenDirection: 'LEFT' }]);
    q = stage(q, 's12', [{ characterId: a }, { characterId: b }]);
    const bl = blockingFor(q, shotOf(q, 's12'));
    expect(bl.people.find((x) => x.characterId === a)).toMatchObject({ side: 'LEFT', sideCarried: true, facing: 'RIGHT', facingCarried: true });
    expect(bl.relations).toEqual([{ leftId: a, rightId: b, sinceShotId: 's11' }]);
    const line = blockingLine(bl, (id) => (id === a ? '<Subject 1>' : id === b ? '<Subject 2>' : undefined), { relation: 'CUT' });
    expect(line).toContain('Blocking (the 180° line holds): <Subject 1> is to the left of <Subject 2>, on screen.');
    expect(line).toContain('<Subject 1> faces screen right as before.');
    expect(blockingFor(q, shotOf(q, 's21')).people[0]).toMatchObject({ side: undefined, facing: 'TOWARD' });
  });

  it('a facing flip without a turn is named; a turn in the action, or a neutral angle between, allows it', () => {
    const { p } = fixture();
    const [a] = p.castIds;
    let q = stage(p, 's12', [{ characterId: a, screenDirection: 'LEFT' }]);
    q = stage(q, 's13', [{ characterId: a, screenDirection: 'RIGHT' }]);
    expect(blockingFor(q, shotOf(q, 's13')).violations.map((v) => v.kind)).toEqual(['FACING_FLIPPED']);
    const turned = { ...q, shots: q.shots.map((s) => (s.id === 's13' ? { ...s, action: 'She turns back to the shelves.' } : s)) };
    expect(blockingFor(turned, shotOf(turned, 's13')).violations).toEqual([]);
    const neutral = stage(stage(p, 's11', [{ characterId: a, screenDirection: 'LEFT' }]), 's12', [{ characterId: a, screenDirection: 'TOWARD' }]);
    const after = stage(neutral, 's13', [{ characterId: a, screenDirection: 'RIGHT' }]);
    expect(blockingFor(after, shotOf(after, 's13')).violations).toEqual([]);
  });

  it('the direction of travel carries across a cut (as a condition) and a continuation (as motion); a reversal is named', () => {
    const { p } = fixture();
    const [a] = p.castIds;
    const q = stage(p, 's12', [{ characterId: a, motion: { direction: 'LEFT_TO_RIGHT' } }]);
    const cut = blockingFor(q, shotOf(q, 's13'));
    expect(cut.people[0]).toMatchObject({ travel: 'LEFT_TO_RIGHT', travelCarried: true });
    expect(blockingLine(cut, () => '<Subject 1>', { relation: 'CUT' })).toContain('if they move, they move left to right as in the previous shot');
    const reversed = stage(q, 's13', [{ characterId: a, motion: { direction: 'RIGHT_TO_LEFT' } }]);
    expect(blockingFor(reversed, shotOf(reversed, 's13')).violations.map((v) => v.kind)).toEqual(['TRAVEL_REVERSED']);
  });
});

describe('in the production context, the preflight and the prompt', () => {
  it('a same-moment cut starts in the previous shot’s end pose (match on action); the prompt carries the blocking', () => {
    const { state, p } = fixture();
    const [a, b] = p.castIds;
    let q = stage(p, 's11', [{ characterId: a, frameSide: 'LEFT' }, { characterId: b, frameSide: 'RIGHT' }]);
    q = stage(q, 's12', [{ characterId: a, endPose: 'reaching for the till' }, { characterId: b }]);
    const c = productionContextFor(state, q, shotOf(q, 's13'));
    expect(c.characters[0].startPose).toEqual({ text: 'reaching for the till', source: { kind: 'PREVIOUS_SHOT', shotId: 's12' } });
    const pack = resolveShotPack(state, q, shotOf(q, 's12'), { backend: 'local' });
    const prompt = h3ReferencePrompt(q, shotOf(q, 's12'), state.characters, state.locations.find((l) => l.id === 'loc-pharmacy'), q.scenes[0], bindingOf(pack), { relation: pack.relation, context: pack.context, sceneState: pack.sceneState });
    expect(prompt).toContain('<Subject 1> is to the left of <Subject 2>, on screen.');
    expect(contextRecord(pack.context).blocking).toMatchObject({ relations: [[a, b]] });
  });

  it('a continuation after a shot with no end pose names the shot-list gap', () => {
    const { state, p } = fixture();
    expect(productionContextFor(state, p, shotOf(p, 's12')).gaps.join(' ')).toMatch(/shot list: shot 1 gives no end pose/);
  });

  it('the preflight warns of a crossed line (a warning: the take is not refused for it)', () => {
    const { state, p } = fixture();
    const [a, b] = p.castIds;
    let q = stage(p, 's11', [{ characterId: a, frameSide: 'LEFT' }, { characterId: b, frameSide: 'RIGHT' }]);
    q = stage(q, 's12', [{ characterId: a, frameSide: 'RIGHT' }, { characterId: b, frameSide: 'LEFT' }]);
    const pf = preflightTake({ ...state, productions: state.productions.map((x) => (x.id === q.id ? q : x)) }, q, shotOf(q, 's12'), { backend: 'local' });
    const w = pf.warnings.filter((x) => x.name === 'screen-direction');
    expect(w).toHaveLength(1);
    expect(w[0].detail).toMatch(/swap sides/);
    expect(pf.checks.some((x) => x.name === 'screen-direction')).toBe(false);
  });
});

describe('drift-triggered re-anchoring', () => {
  const withIdentity = (p: Production, verdict: string, median: number): Production => ({ ...p, shots: p.shots.map((s) => (s.id === 's11' ? { ...s, takes: [{ ...TAKE_A, params: { identityCheck: { verdict, characters: { [p.castIds[0]]: { verdict, median } } } } }] } : s)) });
  it('a REVIEW face check on the take the tail comes from re-anchors the next continuous shot at once', () => {
    const { state, p } = fixture();
    const q = withIdentity(p, 'REVIEW', 0.41);
    expect(identityDrift(q, shotOf(q, 's12'), 1)).toEqual([{ characterId: p.castIds[0], detail: "face check REVIEW on shot 1's take" }]);
    const c = productionContextFor(state, q, shotOf(q, 's12'));
    expect(c.anchoring).toMatchObject({ reanchor: true, trigger: 'IDENTITY_DRIFT', chainLength: 1 });
    expect(resolveShotPack(state, q, shotOf(q, 's12'), { backend: 'local' }).opening).toMatchObject({ kind: 'TAIL', frames: 5 });
    // a pass (or no measurement) leaves the chain alone
    const fine = withIdentity(p, 'PASS', 0.7);
    expect(productionContextFor(state, fine, shotOf(fine, 's12')).anchoring.reanchor).toBe(false);
    expect(contextLines(c, () => '<Subject 1>')).toBeTypeOf('string');
  });
});
