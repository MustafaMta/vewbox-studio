import { describe, expect, it } from 'vitest';
import { checkInfo, lineAudioOf, lineAudioWords, lipSyncWords, takeChecksOf } from '@/components/workspace/checks';
import { takeVerdict, takeVerdictOf } from '@/domain/take-checks';
import type { Take } from '@/domain/types';

describe('the take’s verdict (QA Q6): one rule for the worker’s auto-select and the pages', () => {
  it('ACCEPT chooses itself; a flagged review check or a kept gate failure is REVIEW and never auto-chosen; not measured does not block; a failed gate is REJECT', () => {
    expect(takeVerdict({ ok: true, checks: [{ name: 'decodable', ok: true }, { name: 'lip-sync', ok: true, detail: 'not measured (offline)' }] })).toEqual({ decision: 'ACCEPT', autoChoose: true, flags: [], notMeasured: ['lip-sync'] });
    expect(takeVerdict({ ok: true, checks: [{ name: 'decodable', ok: true }, { name: 'no-accidental-fade', ok: false }] })).toMatchObject({ decision: 'REVIEW', autoChoose: false, flags: ['no-accidental-fade'] });
    // a gate check the worker kept for a look (a photo of someone on screen): the gate passed, the take is REVIEW
    expect(takeVerdict({ ok: true, checks: [{ name: 'people-on-screen', ok: false }] })).toMatchObject({ decision: 'REVIEW', autoChoose: false });
    expect(takeVerdict({ ok: false, checks: [{ name: 'decodable', ok: false }] })).toMatchObject({ decision: 'REJECT', autoChoose: false });
    expect(takeVerdict({ ok: true, checks: [] }, { unverified: true })).toMatchObject({ decision: 'REVIEW', autoChoose: false, flags: ['script-spoken'] });
  });
  it('the recorded verdict wins; an older take is judged from its checks and status', () => {
    expect(takeVerdictOf({ status: 'READY', qa: { ok: true, checks: [] }, params: { verdict: { decision: 'REVIEW', autoChoose: false, flags: ['lip-sync'], notMeasured: [] } } }).decision).toBe('REVIEW');
    expect(takeVerdictOf({ status: 'READY', qa: { ok: true, checks: [{ name: 'identity-similarity', ok: false }] } }).decision).toBe('REVIEW');
    expect(takeVerdictOf({ status: 'REJECTED', qa: { ok: true, checks: [] } }).decision).toBe('REJECT');
    expect(takeVerdictOf({ status: 'READY', qa: { ok: true, checks: [{ name: 'script-spoken', ok: false, detail: 'not verified (transcription unavailable): x' }] } }).decision).toBe('REVIEW');
  });
});

const take = (checks: NonNullable<Take['qa']>['checks'], over: Partial<Take> = {}): Pick<Take, 'qa' | 'params' | 'status'> => ({ status: 'READY', qa: { ok: checks.every((c) => c.ok), checks }, ...over });

describe('a take’s checks, as the producer reads them (flags are never hidden)', () => {
  it('a gate failure is a failure; a continuity flag is a review, never a pass', () => {
    const ch = takeChecksOf(take([
      { name: 'decodable', ok: true },
      { name: 'script-spoken', ok: false, detail: 'heard: Thank you. Thank you.' },
      { name: 'no-accidental-fade', ok: false, detail: 'fades in from black over 12 frames (review)' },
      { name: 'lip-sync', ok: true, detail: 'not measured (the ASR service is offline)' },
    ], { status: 'REJECTED' }))!;
    expect(ch.failed.map((c) => c.name)).toEqual(['script-spoken']);
    expect(ch.review.map((c) => c.name)).toEqual(['no-accidental-fade']);
    expect(ch.notMeasured.map((c) => c.name)).toEqual(['lip-sync']);
    expect(ch.passed.map((c) => c.name)).toEqual(['decodable']);
    expect(ch.summary).toBe('Failed: the lines were not spoken as written');
    expect(ch.tone).toBe('failed');
  });

  it('a take that passed with flags says how many and which', () => {
    const ch = takeChecksOf(take([{ name: 'duration', ok: true }, { name: 'no-repeated-speech', ok: false }, { name: 'lip-sync', ok: false }]))!;
    expect(ch.summary).toBe('2 flags to review: speech repeated beyond the script, lip-sync');
    expect(ch.tone).toBe('waiting');
  });

  it('“not measured” is said, never folded into a pass; an unchecked take has no checks', () => {
    expect(takeChecksOf(take([{ name: 'duration', ok: true }, { name: 'identity-similarity', ok: true, detail: 'not measured (no face found)' }]))!.summary).toBe('Passed · 1 not measured');
    expect(takeChecksOf(take([{ name: 'duration', ok: true }]))!.summary).toBe('Passed its checks');
    expect(takeChecksOf({ status: 'READY' })).toBeUndefined();
  });

  it('an unknown check gates (a new check is never hidden as a review)', () => {
    expect(checkInfo('some_new_check')).toEqual({ label: 'Some new check', kind: 'GATE' });
  });

  it('lip-sync in words, from params.lipSync', () => {
    const ch = takeChecksOf(take([{ name: 'lip-sync', ok: false }], { params: { lipSync: { verdict: 'REVIEW', against: 'RECORDED', lagFrames: 3, offsetRepair: true } } }))!;
    expect(lipSyncWords(ch.lipSync!)).toBe('Review with the recorded lines, mouths 3 frames late — the cut moves the line onto the mouths');
    expect(lipSyncWords({ verdict: 'NOT_MEASURED', repaired: false })).toBe('Lip-sync not measured');
  });
});

describe('the authoritative line (audio first)', () => {
  const d = { id: 'l1', characterId: 'c', text: 'Thank you.', audioAssetId: 'a1', durationSeconds: 1.8 };
  it('aligned, not aligned (the aligner was offline), recorded before alignment, out of date, not recorded', () => {
    expect(lineAudioWords(lineAudioOf(d, { provenance: { alignment: { verdict: 'PASS', words: [{ text: 'thank', start: 0, end: 0.3 }, { text: 'you', start: 0.3, end: 0.6 }] } } }, true)).words).toBe('1.8 s · the authoritative line · 2 words timed by forced alignment');
    expect(lineAudioWords(lineAudioOf(d, { provenance: { alignment: { verdict: 'NOT_MEASURED', words: [], detail: ['the aligner is offline'] } } }, true)).words).toBe('1.8 s · the authoritative line · word timing not measured (the aligner is offline)');
    expect(lineAudioOf(d, { provenance: {} }, true).aligned).toBe('UNKNOWN');
    expect(lineAudioWords(lineAudioOf(d, { provenance: {} }, false)).tone).toBe('waiting');
    expect(lineAudioOf({ ...d, audioAssetId: undefined }, undefined, false).recorded).toBe(false);
  });
});
