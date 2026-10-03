import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudioState } from '@/domain/types';

/** MISSING_REFERENCE is a studio error code of its own (finding 13): it maps to an HTTP status, it carries its failure
 *  class, and the worker's classifier records it as MISSING_REFERENCE whatever the message says — the blurry-picture
 *  refusal of CHARACTER_APPEARANCE used to be cast into the union and classified UNKNOWN. A child's code outside the
 *  union is a provider failure (finding 23). */

const fake = vi.hoisted(() => ({ state: null as unknown as StudioState, validated: 0 }));
vi.mock('@/server/studio/engine', () => ({ readState: async () => ({ state: fake.state, version: 1, hash: 'h' }), command: async () => { throw new Error('nothing is written before the reference is accepted'); } }));
vi.mock('@/server/media', () => ({ assetFile: (a: { provenance?: Record<string, unknown> }) => `/lib/${String(a.provenance?.path ?? '')}`, adoptFile: async () => { throw new Error('unused'); }, assetFromStored: () => { throw new Error('unused'); } }));
vi.mock('@/server/media/ffmpeg', () => ({ tmpDir: async () => '/tmp/fake' }));
vi.mock('@/server/media/image-check', () => ({ validateReferenceImage: async () => { fake.validated++; return { ok: false, width: 1024, height: 1280, sharpness: 4.2, reasons: ['blurry: sharpness 4.2 is below 30'] }; } }));
vi.mock('@/server/providers/comfy', () => ({ health: async () => { throw new Error('ComfyUI must not be asked before the reference is accepted'); } }));
vi.mock('@/server/jobs/queue', () => ({ enqueue: async () => { throw new Error('unused'); }, recordMetric: async () => {} }));
vi.mock('@/server/org/runs', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/server/org/runs')>()), recordHandoff: async () => 'h' }));

import { StudioError, asStudioErrorCode, httpStatusFor, isStudioErrorCode, missingReference, STUDIO_ERROR_CODES } from '@/domain/errors';
import { classifyFailure, RETRYABLE_CLASSES } from '@/server/org/runs';
import { seed } from '@/domain/sample';
import { addAsset, setPendingReference } from '@/domain/actions';
import { characterAppearance } from '@/worker/handlers/images';
import type { HandlerContext } from '@/worker/handlers';
import type { Job } from '@/domain/jobs';

const ctx = (payload: Record<string, unknown>): HandlerContext => ({
  job: { id: 'job-a', type: 'CHARACTER_APPEARANCE', status: 'PREPARING', priority: 0, payload, attempts: 1, maxAttempts: 1, cancelRequested: false, createdAt: 'x', updatedAt: 'x' } as Job,
  log: { info() {}, warn() {}, error() {}, debug() {}, child() { return this; } } as unknown as HandlerContext['log'], workerId: 'w', agent: { id: 'casting-director', name: 'Casting', department: 'CASTING', tools: [] } as unknown as HandlerContext['agent'], runId: 'run',
  tool: (_id, fn) => fn(), activity: async () => {}, checkpoint: async () => {}, progress: async () => {}, event: async () => {}, gpu: async (_f, _mb, fn) => fn(),
});

beforeEach(() => { fake.state = seed(); fake.validated = 0; });

describe('the MISSING_REFERENCE code', () => {
  it('is a studio code with a 400, and the helper carries code and failure class together', () => {
    expect(STUDIO_ERROR_CODES).toContain('MISSING_REFERENCE');
    expect(httpStatusFor('MISSING_REFERENCE')).toBe(400);
    const e = missingReference('the reference picture is blurry', { assetId: 'up-1' });
    expect(e).toBeInstanceOf(StudioError);
    expect(e).toMatchObject({ code: 'MISSING_REFERENCE', failureClass: 'MISSING_REFERENCE', details: { assetId: 'up-1', failureClass: 'MISSING_REFERENCE' } });
    // classified by its class, not by guessing from the words (this message matches none of the classifier's patterns)
    expect(classifyFailure(e)).toBe('MISSING_REFERENCE');
    expect(classifyFailure(new StudioError('MISSING_REFERENCE', 'the picture is blurry'))).toBe('MISSING_REFERENCE');
    expect(RETRYABLE_CLASSES).not.toContain('MISSING_REFERENCE');
  });
  it('a code from elsewhere is ours only when it is in the union; anything else is a provider failure', () => {
    expect(isStudioErrorCode('INVALID')).toBe(true); expect(isStudioErrorCode('ERROR')).toBe(false); expect(isStudioErrorCode(undefined)).toBe(false);
    expect(asStudioErrorCode('INVALID')).toBe('INVALID'); expect(asStudioErrorCode('ECONNRESET')).toBe('PROVIDER'); expect(asStudioErrorCode(undefined)).toBe('PROVIDER');
  });
});

describe('CHARACTER_APPEARANCE refuses an unusable reference with MISSING_REFERENCE', () => {
  it('a blurry picture (measured on the CPU, no stored validation) is refused before ComfyUI is asked, and classified MISSING_REFERENCE', async () => {
    fake.state = addAsset(fake.state, { id: 'up-blur', kind: 'IMAGE', src: '/api/media/up-blur', label: 'blurry', tags: [], sample: false, origin: 'UPLOAD', width: 1024, height: 1280, mimeType: 'image/png', provenance: { path: 'images/up-blur.png' } }).state;
    fake.state = setPendingReference(fake.state, 'nour', 'up-blur');
    const err = await characterAppearance(ctx({ characterId: 'nour' })).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'MISSING_REFERENCE', failureClass: 'MISSING_REFERENCE' });
    expect((err as Error).message).toMatch(/blurry/);
    expect(classifyFailure(err)).toBe('MISSING_REFERENCE');
    expect(httpStatusFor((err as StudioError).code)).toBe(400);
    expect(fake.validated).toBe(1);
  });
  it('a stored validation that failed is trusted; a bundled sample is refused the same way', async () => {
    fake.state = addAsset(fake.state, { id: 'up-two', kind: 'IMAGE', src: '/api/media/up-two', label: 'two faces', tags: [], sample: false, origin: 'UPLOAD', width: 1024, height: 1280, mimeType: 'image/png', provenance: { path: 'images/up-two.png' } }).state;
    fake.state = setPendingReference(fake.state, 'nour', 'up-two', { ok: false, width: 1024, height: 1280, faces: 2, reasons: ['2 faces found — one person only'] });
    await expect(characterAppearance(ctx({ characterId: 'nour' }))).rejects.toMatchObject({ code: 'MISSING_REFERENCE', failureClass: 'MISSING_REFERENCE', message: expect.stringMatching(/one person only/) });
    expect(fake.validated).toBe(0);
    const sample: StudioState = { ...fake.state, characters: fake.state.characters.map((c) => (c.id === 'nour' ? { ...c, pendingReference: { assetId: 'ref-nour-side', addedAt: 'x' } } : c)) };
    fake.state = sample;
    await expect(characterAppearance(ctx({ characterId: 'nour' }))).rejects.toMatchObject({ code: 'MISSING_REFERENCE' });
  });
});
