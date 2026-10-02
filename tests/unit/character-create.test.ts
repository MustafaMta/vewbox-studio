import { describe, expect, it } from 'vitest';
import type { Job } from '@/domain/jobs';
import { checkAudioDuration, checkBrief, checkImageDims, checkImageFile, creationSettled, creationSteps, createdCharacterId, engineGate } from '@/components/character/create/preflight';
import type { EngineStatus } from '@/studio/api';

/** The browser-side preflight of character creation and the derivation of the four-step stepper from the parent
 *  CREATE_CHARACTER job and its children (contract §1.1). Pure functions; no React. */

const job = (p: Partial<Job> & Pick<Job, 'id' | 'type' | 'status'>): Job => ({ priority: 0, payload: {}, attempts: 1, maxAttempts: 1, cancelRequested: false, createdAt: '2026-10-02T10:00:00.000Z', updatedAt: '2026-10-02T10:00:00.000Z', ...p });
const parent = (p: Partial<Job> = {}) => job({ id: 'create-1', type: 'CREATE_CHARACTER' as Job['type'], status: 'GENERATING', ...p });

describe('preflight', () => {
  it('a Describe start needs a brief or a name, and not a novel', () => {
    expect(checkBrief('', '')).toEqual({ ok: false, reason: 'EMPTY' });
    expect(checkBrief(' ', '  ')).toEqual({ ok: false, reason: 'EMPTY' });
    expect(checkBrief('', 'Layla')).toEqual({ ok: true });
    expect(checkBrief('A café owner', '')).toEqual({ ok: true });
    expect(checkBrief('x'.repeat(2001), '')).toEqual({ ok: false, reason: 'LONG' });
  });
  it('refuses SVG and GIF by type, oversize files, and pictures under 512 px on the shortest side', () => {
    expect(checkImageFile({ type: 'image/svg+xml', size: 10 })).toBe('TYPE');
    expect(checkImageFile({ type: 'image/gif', size: 10 })).toBe('TYPE');
    expect(checkImageFile({ type: 'image/png', size: 25 * 1024 * 1024 })).toBe('SIZE');
    expect(checkImageFile({ type: 'image/jpeg', size: 1024 })).toBeNull();
    expect(checkImageDims(100, 100)).toBe('MIN_SIDE');
    expect(checkImageDims(2000, 511)).toBe('MIN_SIDE');
    expect(checkImageDims(512, 800)).toBeNull();
  });
  it('measures a recording against 3 s and 30 s', () => {
    expect(checkAudioDuration(2.9)).toBe('TOO_SHORT');
    expect(checkAudioDuration(3)).toBe('OK');
    expect(checkAudioDuration(30)).toBe('OK');
    expect(checkAudioDuration(30.5)).toBe('TOO_LONG');
    expect(checkAudioDuration(NaN)).toBe('TOO_SHORT');
  });
  it('gates on the engines a start needs, and gates nothing before the status is known', () => {
    const ok = { ok: true, detail: 'ready', where: 'local' as const };
    const status: EngineStatus = { video: ok, story: ok, images: { ok: false, detail: 'ComfyUI unreachable', where: 'local' }, voice: ok, transcription: ok, music: ok, gpu: null, minimaxConfigured: false };
    expect(engineGate(null, ['images'])).toEqual({ ok: true, blocked: [] });
    expect(engineGate(status, ['voice'])).toEqual({ ok: true, blocked: [] });
    expect(engineGate(status, ['images', 'voice'])).toEqual({ ok: false, blocked: [{ need: 'images', detail: 'ComfyUI unreachable' }] });
  });
});

describe('the creation stepper', () => {
  it('before any child exists the parent’s step counter places the current row', () => {
    const p = parent({ progress: { step: 2, total: 4, message: 'Drawing Layla' } });
    const s = creationSteps(p, [p]);
    expect(s.map((x) => x.state)).toEqual(['done', 'current', 'pending', 'pending']);
    expect(s[1].message).toBe('Drawing Layla');
    expect(creationSettled(p, s)).toBe(false);
  });
  it('children (parentId) drive their rows with the worker’s real phase and step/total', () => {
    const p = parent({ progress: { step: 3, total: 4 } });
    const design = job({ id: 'd', type: 'DESIGN_CHARACTER', status: 'COMPLETED', parentId: 'create-1', characterId: 'char-1' });
    const look = job({ id: 'a', type: 'CHARACTER_APPEARANCE', status: 'COMPLETED', parentId: 'create-1', characterId: 'char-1' });
    const refs = job({ id: 'r', type: 'CHARACTER_REFS', status: 'GENERATING', parentId: 'create-1', characterId: 'char-1', progress: { phase: 'GENERATING', message: 'Layla: side view', step: 2, total: 5 } });
    const s = creationSteps(p, [p, design, look, refs]);
    expect(s.map((x) => x.state)).toEqual(['done', 'done', 'current', 'pending']);
    expect(s[2].progress).toMatchObject({ step: 2, total: 5 });
    expect(createdCharacterId(p, [p, design, look, refs])).toBe('char-1');
  });
  it('the parent’s result is the record: done / skipped(reason) / failed(class, message)', () => {
    const p = parent({ status: 'COMPLETED', result: { characterId: 'char-1', steps: [{ step: 'design', status: 'done', jobId: 'd' }, { step: 'appearance', status: 'failed', jobId: 'a', failureClass: 'UNAVAILABLE', reason: 'ComfyUI unreachable' }, { step: 'sheet', status: 'skipped', reason: 'no portrait' }, { step: 'voice', status: 'skipped', reason: 'no reference recording' }] } });
    const s = creationSteps(p, [p]);
    expect(s.map((x) => x.state)).toEqual(['done', 'failed', 'skipped', 'skipped']);
    expect(s[1].error).toEqual({ code: 'UNAVAILABLE', message: 'ComfyUI unreachable' });
    expect(s[3].reason).toBe('no reference recording');
    expect(createdCharacterId(p, [p])).toBe('char-1');
    expect(creationSettled(p, s)).toBe(true);
  });
  it('a retry the page started for one step supersedes the recorded failure for that step', () => {
    const p = parent({ status: 'COMPLETED', result: { characterId: 'char-1', steps: [{ step: 'design', status: 'done' }, { step: 'appearance', status: 'failed', failureClass: 'PROVIDER', reason: 'returned no image' }, { step: 'sheet', status: 'skipped' }, { step: 'voice', status: 'skipped' }] } });
    const retry = job({ id: 'a2', type: 'CHARACTER_APPEARANCE', status: 'GENERATING', characterId: 'char-1', progress: { message: 'Drawing Layla' } });
    const s = creationSteps(p, [p, retry], { appearance: 'a2' });
    expect(s[1]).toMatchObject({ state: 'current', message: 'Drawing Layla' });
    expect(creationSettled(p, s)).toBe(false);
  });
  it('a parent that failed before any step reported puts the failure on the first row and skips the rest', () => {
    const p = parent({ status: 'FAILED', error: { code: 'NOT_CONFIGURED', message: 'no story engine' } });
    const s = creationSteps(p, [p]);
    expect(s.map((x) => x.state)).toEqual(['failed', 'skipped', 'skipped', 'skipped']);
    expect(s[0].error?.code).toBe('NOT_CONFIGURED');
  });
  it('a cancelled parent marks the running step as cancelled, never as done', () => {
    const p = parent({ status: 'CANCELLED', progress: { step: 2, total: 4 } });
    const s = creationSteps(p, [p]);
    expect(s.map((x) => x.state)).toEqual(['done', 'failed', 'skipped', 'skipped']);
    expect(s[1].error?.code).toBe('CANCELLED');
  });
});
