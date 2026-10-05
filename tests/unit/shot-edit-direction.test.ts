import { describe, expect, it } from 'vitest';
import { plannedDirectionAfter, updateShot } from '@/domain/actions';
import { fixture, shotOf } from './continuity-fixture';

/** Acceptance 2026-10-05 (defect A9): the producer's rewritten "What happens" must reach the take. The planner's prompt
 *  body and timed staging beats describe the planned action; an edit of the action drops them (pace, pov and extras
 *  stay), unless the same edit brings its own prompt or staging. */
describe('updateShot: the producer\'s action replaces the planned direction', () => {
  const planned = { action: 'Clara tastes the tea and reacts with delight.', prompt: 'She brings the glass to her lips for a careful sip.', staging: { pace: 'DWELL' as const, beats: [{ at: 0, action: 'She takes a careful sip.' }, { at: 2, action: 'She smiles.' }] } };

  it('a changed action drops the planned prompt and beats', () => {
    expect(plannedDirectionAfter(planned, { action: 'Clara holds the glass and speaks, then sips.' })).toEqual({ prompt: undefined, staging: { pace: 'DWELL', beats: [] } });
  });
  it('the same action (a save of other fields), or an edit that brings its own direction, keeps it', () => {
    expect(plannedDirectionAfter(planned, { action: ' Clara tastes the tea and reacts with delight. ' })).toEqual({});
    expect(plannedDirectionAfter(planned, { framing: 'MEDIUM' } as never)).toEqual({});
    expect(plannedDirectionAfter(planned, { action: 'New.', prompt: 'My own direction.' })).toEqual({});
    expect(plannedDirectionAfter(planned, { action: 'New.', staging: { beats: [] } as never })).toEqual({});
    expect(plannedDirectionAfter({ action: 'Old.' }, { action: 'New.' })).toEqual({});
  });
  it('through the command: the shot keeps the new action and loses the old direction', () => {
    const { state, p } = fixture();
    const sh = shotOf(p, 's12');
    const s1 = updateShot(state, p.id, sh.id, { prompt: planned.prompt, staging: planned.staging });
    const s2 = updateShot(s1, p.id, sh.id, { action: 'She speaks first, then drinks.', framing: sh.framing });
    const after = s2.productions.find((x) => x.id === p.id)!.shots.find((x) => x.id === sh.id)!;
    expect(after.action).toBe('She speaks first, then drinks.');
    expect(after.prompt).toBeUndefined();
    expect(after.staging).toEqual({ pace: 'DWELL', beats: [] });
  });
});
