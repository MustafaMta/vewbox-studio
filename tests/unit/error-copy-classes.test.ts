import { describe, expect, it } from 'vitest';
import { errorCopyOf } from '@/components/ui/progress';
import { retryPayloadOf } from '@/components/character/create/preflight';

/** Acceptance 2026-10-06, New character (Auto): an unreachable story engine ("fetch failed") read as "The engine
 *  returned nothing usable — it ran, but what came back did not pass the checks", and the step's Try again did
 *  nothing on a page reopened on the failed creation. */

describe('a failure’s words follow its class, not only its code', () => {
  it('unreachable (INFRASTRUCTURE, or a connection error in the message) is offline or restarting, named by engine', () => {
    const c = errorCopyOf({ code: 'PROVIDER', message: 'fetch failed', details: { failureClass: 'INFRASTRUCTURE' } }, { engine: 'story' });
    expect(c.title).toBe('The story engine is offline or restarting.');
    expect(c.hint).toMatch(/Try again in a moment/);
    expect(c.hint).not.toMatch(/did not pass the checks/);
    expect(c.fix.kind).toBe('retry');
    expect(errorCopyOf({ code: 'PROVIDER', message: 'TypeError: fetch failed (ECONNREFUSED 127.0.0.1:11434)' }).title).toBe('The engine is offline or restarting.');
    expect(errorCopyOf({ code: 'INFRASTRUCTURE', message: '' }).title).toBe('The engine is offline or restarting.');
  });
  it('a full graphics card has its own sentence', () => {
    expect(errorCopyOf({ code: 'PROVIDER', message: 'CUDA out of memory', details: { failureClass: 'RESOURCE_EXHAUSTION' } }).title).toBe('The graphics card was full.');
  });
  it('only a result that really failed its checks says so', () => {
    const c = errorCopyOf({ code: 'PROVIDER', message: 'llm json failed validation', details: { failureClass: 'OUTPUT_CORRUPTION' } });
    expect(c.title).toBe('The engine returned nothing usable.');
    expect(c.hint).toMatch(/did not pass the checks/);
  });
  it('the engine’s own message stays in Details', () => {
    expect(errorCopyOf({ code: 'PROVIDER', message: 'fetch failed' }).detail).toBe('fetch failed');
  });
});

describe('Try again re-runs the failed creation', () => {
  const payload = { mode: 'AUTO', brief: 'a tea seller with a grey moustache', style: 'CARTOON', language: 'EN', voice: { mode: 'NONE' }, draw: true } as const;
  it('the request this page sent, else the parent job’s own request (a page reopened on the failure)', () => {
    expect(retryPayloadOf(payload as never, undefined)).toBe(payload);
    expect(retryPayloadOf(null, { type: 'CREATE_CHARACTER', payload } as never)).toEqual(payload);
    expect(retryPayloadOf(null, { type: 'VOICE_BUILD', payload: { characterId: 'c' } } as never)).toBeNull();
    expect(retryPayloadOf(null, undefined)).toBeNull();
  });
});
