import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioError } from '@/domain/errors';
import { sendFailure } from '@/studio/send-policy';
import { api } from '@/studio/api';

/** A REFUSED BATCH IS NEVER RETRIED (src/studio/send-policy.ts). The store used to treat every failed send as a
 *  network failure and send a refused batch again forever. Only a network failure, a 5xx, a 408 or a 429 retries; a
 *  403 (system command), 400/422 (invalid) or other 4xx drops the batch, rolls the optimistic state back and shows the
 *  refusal once. */

const answer = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
afterEach(() => { vi.unstubAllGlobals(); });

describe('what a failed command send means', () => {
  it('network failures, 5xx, 408 and 429 are retried; every other refusal is not', () => {
    expect(sendFailure(new TypeError('Failed to fetch'))).toBe('retry');
    for (const status of [500, 502, 503, 504, 408, 429]) expect(sendFailure(new StudioError('UNAVAILABLE', 'x', { httpStatus: status })), String(status)).toBe('retry');
    for (const status of [400, 401, 403, 404, 413, 422]) expect(sendFailure(new StudioError('INVALID', 'x', { httpStatus: status })), String(status)).toBe('refused');
    // without a status: the code decides
    expect(sendFailure(new StudioError('UNAVAILABLE', 'x'))).toBe('retry');
    expect(sendFailure(new StudioError('INVALID', 'x'))).toBe('refused');
  });

  it('the API client carries the HTTP status on the error it throws, so a 403 and a 400 are refusals and a 503 is not', async () => {
    vi.stubGlobal('fetch', answer(403, { error: { code: 'FORBIDDEN', message: 'addTake is written by the studio’s workers; a page cannot send it.', details: { command: 'addTake' } } }));
    const forbidden = await api.commands('c', [], 'batch-1').catch((e: unknown) => e);
    expect(forbidden).toMatchObject({ code: 'FORBIDDEN', details: { command: 'addTake', httpStatus: 403 } });
    expect(sendFailure(forbidden)).toBe('refused');
    vi.stubGlobal('fetch', answer(400, { error: { code: 'INVALID', message: 'updateShot: args.2 bad' } }));
    expect(sendFailure(await api.commands('c', [], 'batch-2').catch((e: unknown) => e))).toBe('refused');
    vi.stubGlobal('fetch', answer(503, { error: { code: 'UNAVAILABLE', message: 'database away' } }));
    expect(sendFailure(await api.commands('c', [], 'batch-3').catch((e: unknown) => e))).toBe('retry');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(sendFailure(await api.commands('c', [], 'batch-4').catch((e: unknown) => e))).toBe('retry');
    // a 409 is the batch's own refusal, answered as a result (the store already handles it: no retry)
    vi.stubGlobal('fetch', answer(409, { ok: false, version: 3, hash: 'h', results: [], failedAt: 0, error: { code: 'NOT_FOUND', message: 'x' } }));
    expect(await api.commands('c', [], 'batch-5')).toMatchObject({ ok: false, failedAt: 0 });
  });

  it('the store drops a refused batch (no resend), rolls back by re-reading the snapshot and raises the error once', () => {
    const store = fs.readFileSync(path.join('src', 'studio', 'store.tsx'), 'utf8');
    const refusal = store.slice(store.indexOf("if (sendFailure(e) === 'refused')"), store.indexOf('// network trouble or a 5xx'));
    expect(refusal).toContain('inflight.current = []');
    expect(refusal).toContain('scheduleRefresh(0)');
    expect(refusal.match(/raise\(/g)).toHaveLength(1);
    expect(refusal).not.toContain('unsent.current = batch');
    expect(refusal).toContain('return;');
  });
});
