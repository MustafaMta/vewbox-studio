import { describe, expect, it } from 'vitest';
import { retryNeedsChange as client } from '@/studio/retry';
import { retryNeedsChange as server } from '@/server/org/runs';
import type { Job } from '@/domain/jobs';

/** The retry control asks "what did you change?" exactly when the server would refuse an unchanged retry. */
const job = (status: Job['status'], error?: Job['error']) => ({ status, error }) as Pick<Job, 'status' | 'error'>;
const cases: Array<Pick<Job, 'status' | 'error'>> = [
  job('FAILED', { code: 'PROVIDER', message: 'x', details: { failureClass: 'PROVIDER' } }),
  job('FAILED', { code: 'INFRA', message: 'x', details: { failureClass: 'INFRASTRUCTURE' } }),
  job('FAILED', { code: 'X', message: 'x', details: { failureClass: 'RESOURCE_EXHAUSTION' } }),
  job('FAILED', { code: 'X', message: 'x', details: { failureClass: 'MISSING_REFERENCE' } }),
  job('FAILED', { code: 'X', message: 'x', details: { failureClass: 'WRONG_PARAMETERS' } }),
  job('FAILED', { code: 'X', message: 'x', retryable: true }),
  job('FAILED', { code: 'X', message: 'x' }),
  job('FAILED'),
  job('CANCELLED'),
];

describe('retryNeedsChange (browser copy)', () => {
  it('agrees with the server rule on every case', () => {
    for (const c of cases) expect(client(c)).toBe(server(c).needed);
  });
  it('lets a transient failure and a cancelled job retry unchanged, and asks for the change otherwise', () => {
    expect(client(cases[0])).toBe(false);
    expect(client(cases[3])).toBe(true);
    expect(client(cases[8])).toBe(false);
  });
});
