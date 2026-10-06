import { describe, expect, it } from 'vitest';
import { continuityLog } from '@/domain/continuity-log';
import { validateClientCommand } from '@/domain/commands';
import type { ContinuityState, Production } from '@/domain/types';
import { fixture, TAKE_A } from './continuity-fixture';

/** The continuity log (continuity gaps 2026-10-06, item 7): the script supervisor's record, derived from the stored
 *  shots — what is established, what changed and whether something explains it, the flags and the accepted ones. */

const edit = (p: Production, id: string, f: (c: ContinuityState) => ContinuityState, action?: string): Production => ({ ...p, shots: p.shots.map((s) => (s.id === id ? { ...s, ...(action ? { action } : {}), continuity: f(s.continuity!) } : s)) });

describe('the continuity log', () => {
  it('establishes per shot; a dropped prop, a changed light and a time jump inside a scene are flagged; a transition starts afresh', () => {
    const { state, p } = fixture();
    const [a, b] = p.castIds;
    let q = edit(p, 's11', (c) => ({ ...c, characters: [{ characterId: a, frameSide: 'LEFT', holding: ['a paper cup'], endPose: 'leaning on the counter' }, { characterId: b, frameSide: 'RIGHT' }], props: [{ name: 'till drawer', state: 'closed' }] }));
    q = edit(q, 's12', (c) => ({ ...c, characters: [{ characterId: a, holding: [] }, { characterId: b }], props: [{ name: 'till drawer', state: 'open' }], environment: { ...c.environment, lighting: 'warm candlelight' } }));
    q = edit(q, 's13', (c) => ({ ...c, environment: { ...c.environment, timeOfDay: 'NIGHT' } }));
    const log = continuityLog(state, q);
    expect(log.entries.map((e) => e.shotId)).toEqual(['s11', 's12', 's13', 's21']);
    const e1 = log.entries[0];
    expect(e1.established.people.find((x) => x.characterId === a)).toMatchObject({ side: 'LEFT', holding: ['a paper cup'], endPose: 'leaning on the counter' });
    const e2 = log.entries[1];
    // (the continuation also has no end pose before it for the second person: the shot list's gap)
    expect(e2.flags.map((f) => f.kind).sort()).toEqual(['HOLDING_DROPPED', 'LIGHT_CHANGED', 'POSE_GAP', 'PROP_CHANGED']);
    expect(e2.changes).toEqual(expect.arrayContaining([expect.objectContaining({ what: 'till drawer', from: 'closed', to: 'open' })]));
    expect(e2.established.people.find((x) => x.characterId === a)).toMatchObject({ side: 'LEFT' }); // carried across the cut
    expect(log.entries[2].flags.map((f) => f.kind)).toContain('TIME_CHANGED');
    expect(log.entries[3].flags.filter((f) => ['HOLDING_DROPPED', 'LIGHT_CHANGED', 'TIME_CHANGED'].includes(f.kind))).toEqual([]);
    expect(log.open).toBe(log.entries.reduce((n, e) => n + e.flags.length, 0));
  });

  it('an action that handles the prop explains it; an accepted flag stays, marked; the chosen take’s review checks are logged; the hash follows the state', () => {
    const { state, p } = fixture();
    const [a] = p.castIds;
    let q = edit(p, 's11', (c) => ({ ...c, characters: [{ characterId: a, holding: ['a paper cup'] }] }));
    q = edit(q, 's12', (c) => ({ ...c, characters: [{ characterId: a, holding: [] }] }), 'She puts the paper cup down on the counter.');
    const explained = continuityLog(state, q).entries[1];
    expect(explained.flags.some((f) => f.kind === 'HOLDING_DROPPED')).toBe(false);
    expect(explained.changes[0]).toMatchObject({ explainedBy: 'the shot’s action handles it' });
    const dropped = edit(q, 's12', (c) => ({ ...c, acknowledged: [`HOLDING_DROPPED:${a}:a paper cup`] }), 'She looks at the door.');
    const log = continuityLog(state, dropped);
    expect(log.entries[1].flags.find((f) => f.kind === 'HOLDING_DROPPED')).toMatchObject({ acknowledged: true });
    expect(log.open).toBe(log.entries.reduce((n, e) => n + e.flags.filter((f) => !f.acknowledged).length, 0));
    const reviewed = { ...q, shots: q.shots.map((s) => (s.id === 's11' ? { ...s, takes: [{ ...TAKE_A, qa: { ok: true, checks: [{ name: 'lip-sync', ok: false }] } }] } : s)) };
    expect(continuityLog(state, reviewed).entries[0]).toMatchObject({ take: { takeId: 'take-a', decision: 'REVIEW', flags: ['lip-sync'] }, flags: expect.arrayContaining([expect.objectContaining({ kind: 'TAKE_REVIEW' })]) });
    expect(continuityLog(state, q).hash).not.toBe(continuityLog(state, reviewed).hash);
    expect(() => validateClientCommand('updateShot', ['p', 's', { continuity: { characters: [], props: [], environment: {}, camera: {}, acknowledged: ['LIGHT_CHANGED:scene'] } }])).not.toThrow();
  });
});
