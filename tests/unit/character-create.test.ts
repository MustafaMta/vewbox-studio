import { describe, expect, it } from 'vitest';
import type { Job } from '@/domain/jobs';
import { DESCRIBE_VOICE_MODES, checkAudioDuration, checkBrief, checkImageDims, checkImageFile, creationSettled, creationSteps, createdCharacterId, describeVoiceMode, describeVoicePayload, engineGate } from '@/components/character/create/preflight';
import { CREATE_STEPS, createResultOf, normaliseStep } from '@/components/character/contract';
import { KEYS, t } from '@/lib/i18n';
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

describe('the creation stepper (contract v2: design → image → voice, then your approval)', () => {
  it('names the rows of the v2 chain, and maps the wave-2 names onto them (the sheet is no longer a step)', () => {
    expect(CREATE_STEPS).toEqual(['design', 'image', 'voice']);
    expect(normaliseStep('appearance')).toBe('image');
    expect(normaliseStep('image')).toBe('image');
    expect(normaliseStep('sheet')).toBeNull();
    expect(normaliseStep('voice')).toBe('voice');
  });
  it('before any child exists the parent’s step counter places the current row', () => {
    const p = parent({ progress: { step: 2, total: 3, message: 'Drawing Layla' } });
    const s = creationSteps(p, [p]);
    expect(s.map((x) => x.state)).toEqual(['done', 'current', 'pending']);
    expect(s[1].message).toBe('Drawing Layla');
    expect(creationSettled(p, s)).toBe(false);
  });
  it('children (parentId) drive their rows with the worker’s real phase and step/total', () => {
    const p = parent({ progress: { step: 2, total: 3 } });
    const design = job({ id: 'd', type: 'DESIGN_CHARACTER', status: 'COMPLETED', parentId: 'create-1', characterId: 'char-1' });
    const look = job({ id: 'a', type: 'CHARACTER_APPEARANCE', status: 'GENERATING', parentId: 'create-1', characterId: 'char-1', progress: { phase: 'GENERATING', message: 'Layla: full length', step: 2, total: 5 } });
    const s = creationSteps(p, [p, design, look]);
    expect(s.map((x) => x.state)).toEqual(['done', 'current', 'pending']);
    expect(s[1].progress).toMatchObject({ step: 2, total: 5 });
    expect(createdCharacterId(p, [p, design, look])).toBe('char-1');
  });
  it('the parent’s result is the record: done / skipped(reason) / failed(class, message) — a wave-2 result reads the same', () => {
    const p = parent({ status: 'COMPLETED', result: { characterId: 'char-1', steps: [{ step: 'design', status: 'done', jobId: 'd' }, { step: 'appearance', status: 'failed', jobId: 'a', failureClass: 'UNAVAILABLE', reason: 'ComfyUI unreachable' }, { step: 'sheet', status: 'skipped', reason: 'no portrait' }, { step: 'voice', status: 'skipped', reason: 'no reference recording' }] } });
    const s = creationSteps(p, [p]);
    expect(s.map((x) => x.state)).toEqual(['done', 'failed', 'skipped']);
    expect(s[1].error).toEqual({ code: 'UNAVAILABLE', message: 'ComfyUI unreachable' });
    expect(s[2].reason).toBe('no reference recording');
    expect(createdCharacterId(p, [p])).toBe('char-1');
    expect(creationSettled(p, s)).toBe(true);
  });
  it('the chain’s last word "awaiting approval" is read from the result', () => {
    const p = parent({ status: 'COMPLETED', result: { characterId: 'char-1', steps: [{ step: 'design', status: 'done' }, { step: 'image', status: 'done' }, { step: 'voice', status: 'skipped' }], awaitingApproval: true } });
    expect(createResultOf(p)).toMatchObject({ characterId: 'char-1', awaitingApproval: true });
    expect(createResultOf(parent({ status: 'COMPLETED', result: { characterId: 'c', steps: [] } }))?.awaitingApproval).toBe(false);
  });
  it('a retry the page started for one step supersedes the recorded failure for that step', () => {
    const p = parent({ status: 'COMPLETED', result: { characterId: 'char-1', steps: [{ step: 'design', status: 'done' }, { step: 'image', status: 'failed', failureClass: 'PROVIDER', reason: 'returned no image' }, { step: 'voice', status: 'skipped' }] } });
    const retry = job({ id: 'a2', type: 'CHARACTER_APPEARANCE', status: 'GENERATING', characterId: 'char-1', progress: { message: 'Drawing Layla' } });
    const s = creationSteps(p, [p, retry], { image: 'a2' });
    expect(s[1]).toMatchObject({ state: 'current', message: 'Drawing Layla' });
    expect(creationSettled(p, s)).toBe(false);
  });
  it('a parent that failed before any step reported puts the failure on the first row and skips the rest', () => {
    const p = parent({ status: 'FAILED', error: { code: 'NOT_CONFIGURED', message: 'no story engine' } });
    const s = creationSteps(p, [p]);
    expect(s.map((x) => x.state)).toEqual(['failed', 'skipped', 'skipped']);
    expect(s[0].error?.code).toBe('NOT_CONFIGURED');
  });
  it('a cancelled parent marks the running step as cancelled, never as done', () => {
    const p = parent({ status: 'CANCELLED', progress: { step: 2, total: 3 } });
    const s = creationSteps(p, [p]);
    expect(s.map((x) => x.state)).toEqual(['done', 'failed', 'skipped']);
    expect(s[1].error?.code).toBe('CANCELLED');
  });
});

describe('the voice of a Describe start (finding 15)', () => {
  it('offers only what can produce a voice: no voice yet, or a recording added now — never a "studio voice" with no bank behind it', () => {
    expect(DESCRIBE_VOICE_MODES).toEqual(['NONE', 'RECORDING']);
    expect(KEYS).not.toContain('char.create.voiceAuto');
    expect(t('en', 'char.create.voiceNoneHint')).toMatch(/no bank of voices/);
    expect(t('ar', 'char.create.voiceRecording')).toMatch(/[؀-ۿ]/);
  });
  it('asks CREATE_CHARACTER for an AUTOMATIC voice only when a recording travels with the request', () => {
    expect(describeVoicePayload('RECORDING', true)).toEqual({ mode: 'AUTOMATIC' });
    expect(describeVoicePayload('RECORDING', false)).toEqual({ mode: 'NONE' });
    expect(describeVoicePayload('NONE', true)).toEqual({ mode: 'NONE' });
    // a draft remembered from the old page ("Studio voice" = AUTOMATIC) comes back as no voice
    expect(describeVoiceMode('AUTOMATIC')).toBe('NONE'); expect(describeVoiceMode('RECORDING')).toBe('RECORDING'); expect(describeVoiceMode(undefined)).toBe('NONE');
  });
});
