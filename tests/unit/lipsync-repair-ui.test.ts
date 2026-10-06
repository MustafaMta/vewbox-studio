import { describe, expect, it } from 'vitest';
import { reasonReady, repairInfoOf, repairOfferOf, repairPayload } from '@/components/workspace/lipsync-repair';
import { JOB_PAYLOADS } from '@/domain/jobs';
import type { Take } from '@/domain/types';

/** "Repair lip-sync" as the pages word it (the corrector's rules live in src/domain/lipsync-correction.ts). */

const take = (over: Partial<Take> = {}): Take => ({ id: 't1', label: 'Take 1', assetId: 'a1', createdAt: '2026-10-06T00:00:00Z', status: 'READY', provider: 'MINIMAX', durationSeconds: 5, soundtrack: { kind: 'DIALOGUE', assetId: 'snd', lines: [{ lineId: 'l1', from: 0, to: 2 }] }, ...over });
const shot = { dialogue: [{ id: 'l1', characterId: 'c1', text: 'Hello.' }], characterIds: ['c1'] };

describe('the offer', () => {
  it('a realistic take with one speaker and a recorded line is offered; flagged when its own check asked', () => {
    expect(repairOfferOf({ kind: 'SHORT', style: 'REALISTIC' }, shot, take())).toMatchObject({ available: true, flagged: false, disabledReason: null });
    expect(repairOfferOf({ kind: 'SHORT', style: 'REALISTIC' }, shot, take({ params: { lipSync: { verdict: 'REVIEW' } } })).flagged).toBe(true);
  });
  it('a cartoon take is off with the reason, without the evaluation note; the studio’s own reason wins', () => {
    const o = repairOfferOf({ kind: 'SHORT', style: 'CARTOON' }, shot, take());
    expect(o.available).toBe(false);
    expect(o.disabledReason).toBe('The corrector is not enabled for cartoon faces.');
    expect(repairOfferOf({ kind: 'SHORT', style: 'REALISTIC' }, shot, take(), 'Intake is paused; new work waits.')).toMatchObject({ available: false, disabledReason: 'Intake is paused; new work waits.' });
  });
  it('two speakers, or no soundtrack: each a sentence', () => {
    const two = { dialogue: [{ id: 'l1', characterId: 'c1', text: 'a' }, { id: 'l2', characterId: 'c2', text: 'b' }], characterIds: ['c1', 'c2'] };
    expect(repairOfferOf({ kind: 'SHORT', style: 'REALISTIC' }, two, take({ soundtrack: { kind: 'DIALOGUE', assetId: 'snd', lines: [{ lineId: 'l1', from: 0, to: 1 }, { lineId: 'l2', from: 1, to: 2 }] } })).disabledReason).toMatch(/2 characters speak in this take/);
    expect(repairOfferOf({ kind: 'SHORT', style: 'REALISTIC' }, shot, take({ soundtrack: undefined })).disabledReason).toMatch(/no authoritative soundtrack/);
  });
});

describe('the request', () => {
  it('needs a reason of 3+ characters and is what the server validates', () => {
    expect(reasonReady('  ab ')).toBe(false); expect(reasonReady('late')).toBe(true);
    const p = repairPayload({ id: 'p1' }, { id: 's1' }, { id: 't1' }, '  the mouth opens late ', true);
    expect(p).toEqual({ productionId: 'p1', shotId: 's1', takeId: 't1', confirm: true, reason: 'the mouth opens late', select: true });
    expect(JOB_PAYLOADS.CORRECT_LIPSYNC.safeParse(p).success).toBe(true);
    expect(JOB_PAYLOADS.CORRECT_LIPSYNC.safeParse(repairPayload({ id: 'p1' }, { id: 's1' }, { id: 't1' }, 'ok', false)).success).toBe(false);
    expect('select' in repairPayload({ id: 'p1' }, { id: 's1' }, { id: 't1' }, 'late', false)).toBe(false);
  });
});

describe('what a repaired take shows', () => {
  it('reads the reason, the verdict and the before/after numbers from params.postProcess', () => {
    const t = take({ id: 't2', label: 'Take 1 · lip-sync corrected', status: 'REJECTED', derivedFrom: { takeId: 't1', process: 'LIPSYNC_CORRECTION', jobId: 'j' }, params: { postProcess: { reason: 'opens late', engine: 'LatentSync 1.6', verdict: { accepted: false, notes: ['mouth vs audio r 0.21 → 0.48'], problems: ['the face changed: 0.81 vs 0.92'] }, measures: { frames: { original: 120, corrected: 120 }, corr: { before: 0.21, after: 0.48 }, canonical: { before: 0.7, after: 0.69 }, selfIdentity: { before: 0.92, after: 0.81 }, activityInside: { before: null, after: 0.3 }, fullStrengthShare: 0.95, faceHeightPx: 200 } } } });
    const info = repairInfoOf(t)!;
    expect(info).toMatchObject({ fromTakeId: 't1', reason: 'opens late', accepted: false, engine: 'LatentSync 1.6', problems: ['the face changed: 0.81 vs 0.92'] });
    expect(info.rows.find((r) => r.label.startsWith('Mouth follows'))).toEqual({ label: 'Mouth follows the audio (r)', before: '0.21', after: '0.48', better: true });
    expect(info.rows.find((r) => r.label.startsWith('Same face'))).toMatchObject({ before: '0.92', after: '0.81', better: false });
    expect(info.rows.find((r) => r.label.startsWith('Mouth activity'))).toMatchObject({ before: 'not measured', after: '0.30', better: undefined });
    expect(info.rows.find((r) => r.label === 'Corrected at full strength')).toMatchObject({ after: '95 %' });
    expect(repairInfoOf(take())).toBeUndefined();
  });
});
