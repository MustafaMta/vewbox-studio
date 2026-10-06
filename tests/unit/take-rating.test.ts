import { describe, expect, it } from 'vitest';
import { seed } from '@/domain/sample';
import { rateTake, rejectTake, selectTake } from '@/domain/actions';
import { runCommand, type Command } from '@/domain/commands';
import { canonical } from '@/domain/hash';
import { StudioError } from '@/domain/errors';
import type { Take } from '@/domain/types';
import { takeRow } from '@/server/studio/persist';
import { takeFromRow } from '@/server/studio/snapshot';
import { takeQuality } from '@/worker/handlers/take';
import { JOB_PAYLOADS } from '@/domain/jobs';

/** docs/CONTRACTS-REDESIGN-BACKEND.md B5 (the producer's judgement on a take) and B6 (the quality tier). */

const P = 's1e1', SH = 's1e1-1';
const takeOf = (s: ReturnType<typeof seed>, id: string): Take => s.productions.find((p) => p.id === P)!.shots.find((x) => x.id === SH)!.takes.find((t) => t.id === id)!;
const shotOf = (s: ReturnType<typeof seed>) => s.productions.find((p) => p.id === P)!.shots.find((x) => x.id === SH)!;
const T1 = 's1e1-1-t1', T2 = 's1e1-1-t2';
const at = '2026-10-03T10:00:00.000Z';
const cmd = (args: Command<'rateTake'>['args']): Command<'rateTake'> => ({ name: 'rateTake', args, seed: 'rate-1', at });

describe('rateTake (B5)', () => {
  it('marks a take good, with who and when, and the same judgement again changes nothing', () => {
    const s0 = seed();
    const r = runCommand(s0, cmd([P, SH, T1, 'GOOD']));
    const t = takeOf(r.state, T1);
    expect(t.rating).toBe('GOOD'); expect(t.ratedBy).toBe('producer'); expect(t.ratedAt).toBe(at); expect(t.ratingReason).toBeUndefined();
    expect(t.status).toBe('READY');
    const again = runCommand(r.state, { ...cmd([P, SH, T1, 'GOOD']), at: '2026-10-03T11:00:00.000Z' });
    expect(again.state).toBe(r.state);
  });
  it('rejecting keeps the take and its file, records the reason, and takes it out of the cut', () => {
    const s0 = seed();
    expect(shotOf(s0).selectedTakeId).toBe(T2);
    const s1 = rateTake(s0, P, SH, T2, 'REJECTED', { reason: 'the awnings flicker', by: 'Mustafa' });
    const sh = shotOf(s1);
    expect(sh.takes.map((t) => t.id)).toEqual([T1, T2]);
    expect(sh.selectedTakeId).toBeUndefined();
    const t = takeOf(s1, T2);
    expect(t).toMatchObject({ rating: 'REJECTED', ratingReason: 'the awnings flicker', ratedBy: 'Mustafa', status: 'READY', assetId: 'take-02' });
    expect(s1.assets.some((a) => a.id === 'take-02')).toBe(true);
  });
  it('a rejected take cannot be chosen for the cut, in plain words; withdrawing the judgement allows it again', () => {
    const s1 = rateTake(seed(), P, SH, T2, 'REJECTED', { reason: 'too dark' });
    expect(() => selectTake(s1, P, SH, T2)).toThrow(/This take was rejected \(too dark\); a rejected take cannot be chosen for the cut\./);
    const s2 = rateTake(s1, P, SH, T2, null);
    const t = takeOf(s2, T2);
    expect(t.rating).toBeUndefined(); expect(t.ratingReason).toBeUndefined(); expect(t.ratedBy).toBeUndefined(); expect(t.ratedAt).toBeUndefined();
    expect(shotOf(selectTake(s2, P, SH, T2)).selectedTakeId).toBe(T2);
  });
  it('a take the inspectors rejected cannot be called good; the older rejectTake still works beside it', () => {
    const s1 = rejectTake(seed(), P, SH, T1, 'black frames');
    expect(takeOf(s1, T1).status).toBe('REJECTED');
    expect(() => rateTake(s1, P, SH, T1, 'GOOD')).toThrow(/cannot be called good/);
    expect(rateTake(s1, P, SH, T1, 'REJECTED', { reason: 'agreed' })).not.toBe(s1);
  });
  it('refuses malformed arguments before the reducer runs (INVALID with the field named)', () => {
    const bad = () => runCommand(seed(), cmd([P, SH, T1, 'MEH' as unknown as 'GOOD']));
    expect(bad).toThrow(StudioError);
    try { bad(); } catch (e) { expect((e as StudioError).code).toBe('INVALID'); expect((e as StudioError).message).toMatch(/rateTake/); }
    expect(() => runCommand(seed(), cmd([P, SH, 'no-such-take', 'GOOD']))).toThrow(/Take no-such-take was not found/);
    expect(() => runCommand(seed(), cmd([P, SH, T1, 'GOOD', { reason: 'x'.repeat(1001) }]))).toThrow(/reason/);
  });
  it('survives the persist/snapshot round trip (row → take → row)', () => {
    const s1 = rateTake(seed(), P, SH, T2, 'REJECTED', { reason: 'too dark', by: 'Mustafa' });
    const t = takeOf(s1, T2);
    const row = takeRow(P, SH, 1, t);
    expect(row).toMatchObject({ rating: 'REJECTED', ratingReason: 'too dark', ratedBy: 'Mustafa', ratedAt: t.ratedAt });
    const back = takeFromRow(row as Parameters<typeof takeFromRow>[0]);
    expect(canonical(back)).toBe(canonical(t));
    const plain = takeRow(P, SH, 0, takeOf(seed(), T1));
    expect(plain).toMatchObject({ rating: null, ratingReason: null, ratedBy: null, ratedAt: null });
    expect(canonical(takeFromRow(plain as Parameters<typeof takeFromRow>[0]))).toBe(canonical(takeOf(seed(), T1)));
  });
});

describe('quality tier (B6)', () => {
  it('final unless a draft is asked for; local H3 honours a draft (turbo), the hosted API records it as asked', () => {
    expect(takeQuality(undefined)).toEqual({ quality: 'final' });
    expect(takeQuality('final')).toEqual({ quality: 'final' });
    expect(takeQuality('draft')).toEqual({ quality: 'draft' });
    expect(takeQuality('draft', 'local')).toEqual({ quality: 'draft' });
    expect(takeQuality('draft', 'api')).toEqual({ quality: 'final', qualityRequested: 'draft' });
    expect(takeQuality(undefined, 'api')).toEqual({ quality: 'final' });
  });
  it('GENERATE_TAKE accepts the tier in its payload and nothing else', () => {
    expect(JOB_PAYLOADS.GENERATE_TAKE.safeParse({ productionId: 'p', shotId: 's', quality: 'draft' }).success).toBe(true);
    expect(JOB_PAYLOADS.GENERATE_TAKE.safeParse({ productionId: 'p', shotId: 's', quality: 'best' }).success).toBe(false);
  });
});
