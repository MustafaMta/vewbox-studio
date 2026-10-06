import { describe, expect, it } from 'vitest';
import { LIPSYNC_LATENTSYNC_16, judgeCorrection, lipsyncRepairOffer, planCorrection, type CorrectionMeasures, type LipsyncCapability } from '@/domain/lipsync-correction';
import type { Take } from '@/domain/types';

/** THE LIP-SYNC CORRECTION RULES (src/domain/lipsync-correction.ts): only a flagged, confirmed take of an enabled style
 *  with one speaker and its authoritative soundtrack is corrected; a correction that changes the face or makes the
 *  mouth follow the audio worse is never accepted. */

const realistic: LipsyncCapability = { ...LIPSYNC_LATENTSYNC_16, styles: ['REALISTIC'] };
const take = (over: Partial<Take> = {}): Take => ({
  id: 'take-1', label: 'Take 3', assetId: 'gen-v', createdAt: '2026-10-06', status: 'READY', provider: 'MINIMAX', durationSeconds: 8, trimStartFrames: 22,
  soundtrack: { kind: 'DIALOGUE', assetId: 'gen-a', lines: [{ lineId: 'l1', from: 0.92, to: 5 }] },
  params: { lipSync: { verdict: 'FAIL' } }, ...over,
});
const shot = { dialogue: [{ id: 'l1', characterId: 'clara', text: 'Thank you.' }], characterIds: ['clara', 'abu'] } as never;
const prod = (style: 'REALISTIC' | 'CARTOON' | 'ANIME' = 'REALISTIC', kind = 'SHORT') => ({ style, kind }) as never;
const ok = { confirm: true as const, reason: 'mouth closes on the vowels late' };

describe('planCorrection', () => {
  it('a flagged, confirmed realistic take with one speaker is eligible; the audio starts at the guide head', () => {
    const p = planCorrection(prod(), shot, take(), ok, realistic);
    expect(p.eligible).toBe(true);
    expect(p.speakerId).toBe('clara');
    expect(p.otherCharacterIds).toEqual(['abu']);
    expect(p.audioAssetId).toBe('gen-a');
    expect(p.audioOffset).toBeCloseTo(22 / 24);
    expect(p.flags).toEqual(['QA_LIPSYNC_FAIL', 'VISUAL_REVIEW']);
  });
  it('never without the producer\'s confirmation and the visual review\'s reason', () => {
    expect(planCorrection(prod(), shot, take(), { reason: 'x late' }, realistic).reasons.join(' ')).toMatch(/not confirmed/);
    expect(planCorrection(prod(), shot, take(), { confirm: true }, realistic).reasons.join(' ')).toMatch(/visual review/);
  });
  it('styles the corrector is not enabled for are refused with the reason', () => {
    const p = planCorrection(prod('CARTOON'), shot, take(), ok, realistic);
    expect(p.eligible).toBe(false);
    expect(p.reasons.join(' ')).toMatch(/not enabled for cartoon faces/);
  });
  it('one speaker, the authoritative soundtrack, no chained corrections, no samples, the length limit', () => {
    const two = { dialogue: [{ id: 'l1', characterId: 'clara', text: 'a' }, { id: 'l2', characterId: 'abu', text: 'b' }], characterIds: ['clara', 'abu'] } as never;
    const t2 = take({ soundtrack: { kind: 'DIALOGUE', assetId: 'gen-a', lines: [{ lineId: 'l1', from: 0, to: 1 }, { lineId: 'l2', from: 1, to: 2 }] } });
    expect(planCorrection(prod(), two, t2, ok, realistic).reasons.join(' ')).toMatch(/2 characters speak/);
    expect(planCorrection(prod(), shot, take({ soundtrack: undefined }), ok, realistic).reasons.join(' ')).toMatch(/no authoritative soundtrack/);
    expect(planCorrection(prod(), shot, take({ derivedFrom: { takeId: 'take-0', process: 'LIPSYNC_CORRECTION' } }), ok, realistic).reasons.join(' ')).toMatch(/already a correction/);
    expect(planCorrection(prod(), shot, take({ provider: 'SAMPLE' }), ok, realistic).reasons.join(' ')).toMatch(/sample/);
    expect(planCorrection(prod(), shot, take({ durationSeconds: 45 }), ok, realistic).reasons.join(' ')).toMatch(/at most 30 s/);
  });
  it('singing is refused until the corrector is evaluated for it', () => {
    const song = take({ soundtrack: { kind: 'SONG', assetId: 'gen-s', lines: [] } });
    expect(planCorrection(prod('REALISTIC', 'MUSIC_VIDEO'), shot, song, ok, realistic).reasons.join(' ')).toMatch(/singing is not corrected/);
    expect(planCorrection(prod('REALISTIC', 'MUSIC_VIDEO'), shot, song, ok, { ...realistic, singing: true }).reasons.join(' ')).not.toMatch(/singing/);
  });
});

describe('lipsyncRepairOffer (the "Repair lip-sync" action)', () => {
  it('offered on an eligible realistic take, flagged when its own check failed; refused with the reason otherwise', () => {
    expect(lipsyncRepairOffer(prod(), shot, take(), realistic)).toEqual({ available: true, flagged: true, reasons: [] });
    expect(lipsyncRepairOffer(prod(), shot, take({ params: { lipSync: { verdict: 'PASS' } } }), realistic)).toMatchObject({ available: true, flagged: false });
    const cartoon = lipsyncRepairOffer(prod('CARTOON'), shot, take(), realistic);
    expect(cartoon.available).toBe(false);
    expect(cartoon.reasons.join(' ')).toMatch(/cartoon/);
  });
});

describe('judgeCorrection', () => {
  const good: CorrectionMeasures = { frames: { original: 192, corrected: 192 }, corr: { before: 0.2, after: 0.45 }, canonical: { before: 0.66, after: 0.65 }, selfIdentity: { before: 0.9, after: 0.88 }, fullStrengthShare: 0.95, faceHeightPx: 230 };
  it('accepts a correction that keeps the face and makes the mouth follow the audio', () => {
    const v = judgeCorrection(good, realistic);
    expect(v.accepted).toBe(true);
    expect(v.notes.join(' ')).toMatch(/0.20 → 0.45/);
  });
  it('rejects a changed face, a worse mouth, a different frame count, a profile shot, missing measurements', () => {
    expect(judgeCorrection({ ...good, selfIdentity: { before: 0.9, after: 0.7 } }, realistic).problems.join(' ')).toMatch(/the face changed/);
    expect(judgeCorrection({ ...good, canonical: { before: 0.66, after: 0.5 } }, realistic).problems.join(' ')).toMatch(/canonical image fell/);
    expect(judgeCorrection({ ...good, corr: { before: 0.4, after: 0.3 } }, realistic).problems.join(' ')).toMatch(/less after the correction/);
    expect(judgeCorrection({ ...good, frames: { original: 192, corrected: 191 } }, realistic).accepted).toBe(false);
    expect(judgeCorrection({ ...good, fullStrengthShare: 0.2 }, realistic).problems.join(' ')).toMatch(/full strength/);
    expect(judgeCorrection({ ...good, faceHeightPx: 90 }, realistic).problems.join(' ')).toMatch(/90 px/);
    expect(judgeCorrection({ ...good, corr: { before: null, after: 0.3 } }, realistic).accepted).toBe(false);
    expect(judgeCorrection({ ...good, selfIdentity: { before: null, after: null } }, realistic).accepted).toBe(false);
  });
  it('a flattened mouth performance is a problem (measured on cartoon faces: −17…−35 % activity while speaking)', () => {
    expect(judgeCorrection({ ...good, activityInside: { before: 1.87, after: 1.38 } }, realistic).problems.join(' ')).toMatch(/flattened.*−26 %/);
    expect(judgeCorrection({ ...good, activityInside: { before: 0.74, after: 0.66 } }, realistic).accepted).toBe(true);
  });
});
