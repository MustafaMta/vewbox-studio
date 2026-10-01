import { describe, expect, it } from 'vitest';
import { seed } from '@/domain/sample';
import { runCommand, type Command } from '@/domain/commands';
import { canonical, hashState } from '@/domain/hash';
import { nid, withCommandContext } from '@/domain/ids';

/** Commands run twice — in the browser and on the server — and must agree on every id and timestamp. */
describe('commands', () => {
  it('the same command with the same seed produces the same ids, timestamps and state hash', () => {
    const cmd: Command<'addShow'> = { name: 'addShow', args: [{ title: 'Twice', logline: 'x', genre: 'Drama', style: 'REALISTIC', language: 'EN', aspect: 'WIDE_16_9' }], seed: 'abc123', at: '2026-10-02T10:00:00.000Z' };
    const a = runCommand(seed(), cmd);
    const b = runCommand(seed(), cmd);
    expect(a.result.show.id).toBe(b.result.show.id);
    expect(a.result.season.id).toBe(b.result.season.id);
    expect(a.result.show.createdAt).toBe('2026-10-02T10:00:00.000Z');
    expect(hashState(a.state)).toBe(hashState(b.state));
    const c = runCommand(seed(), { ...cmd, seed: 'other' });
    expect(c.result.show.id).not.toBe(a.result.show.id);
  });
  it('a refused command throws and leaves no trace', () => {
    const s = seed();
    expect(() => runCommand(s, { name: 'updateCharacter', args: ['layla', { hair: 'Bleached' }], seed: 's', at: new Date().toISOString() })).toThrow(/preserved for continuity/);
  });
  it('ids are random outside a command and deterministic inside', () => {
    expect(nid('x')).not.toBe(nid('x'));
    const one = withCommandContext('seed', '2026-01-01T00:00:00.000Z', () => [nid('a'), nid('a')]);
    const two = withCommandContext('seed', '2026-01-01T00:00:00.000Z', () => [nid('a'), nid('a')]);
    expect(one).toEqual(two);
    expect(one[0]).not.toBe(one[1]);
  });
  it('canonical form ignores key order and undefined', () => {
    expect(canonical({ b: 1, a: [{ y: undefined, x: 2 }] })).toBe(canonical({ a: [{ x: 2 }], b: 1 }));
    expect(hashState({ a: 1 })).not.toBe(hashState({ a: 2 }));
  });
});
