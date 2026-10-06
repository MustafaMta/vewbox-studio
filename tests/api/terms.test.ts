import { afterAll, describe, expect, it } from 'vitest';
import { TERMS_VERSION } from '@/domain/terms';

/** THE TERMS OF USE ARE THE SERVER'S RULE (QA: the gate was only in the pages). With the terms not accepted for this
 *  version, every path that queues generating work answers 403 CONSENT_REQUIRED naming /terms — POST /api/jobs, a
 *  targeted regeneration, a retry — while the check of an uploaded file (MEDIA_PROBE, which makes nothing) still runs. */

const BASE = process.env.STUDIO_URL || 'http://127.0.0.1:4210';
const post = (p: string, body: unknown) => fetch(`${BASE}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const setTerms = async (version: string) => {
  const r = await post('/api/commands', { clientId: `terms-${Date.now().toString(36)}`, commands: [{ id: `c-${Math.random().toString(36).slice(2, 10)}`, name: 'updateSettings', args: [{ terms: { version, acceptedAt: new Date().toISOString(), by: 'api test' } }], seed: Math.random().toString(36).slice(2, 12), at: new Date().toISOString() }] });
  expect(r.status).toBe(200);
};
const made: string[] = [];
afterAll(async () => { for (const id of made) await post(`/api/jobs/${id}/cancel`, {}); await setTerms(TERMS_VERSION); });

describe('the terms gate on the server', () => {
  it('an older accepted version: generating jobs, a regeneration and a retry are refused 403 CONSENT_REQUIRED naming /terms', async () => {
    await setTerms('2000-01-01');
    for (const body of [{ type: 'ASSEMBLE', payload: { productionId: 's1e1' } }, { type: 'GENERATE_TAKE', payload: { productionId: 's1e1', shotId: 's1e1-1' } }, { type: 'WRITE_SCRIPT', payload: { productionId: 's1e1' } }]) {
      const r = await post('/api/jobs', { ...body, idempotencyKey: `terms-${body.type}-${Date.now()}` });
      expect(r.status).toBe(403);
      const j = await r.json();
      expect(j.error.code).toBe('CONSENT_REQUIRED');
      expect(j.error.message).toMatch(/\/terms/);
    }
    const regen = await post('/api/productions/s1e1/regenerate', { shotId: 's1e1-1' });
    expect(regen.status).toBe(403);
    // a malformed request is still said as such (400), before the terms
    expect((await post('/api/jobs', { type: 'ASSEMBLE', payload: { nonsense: true } })).status).toBe(400);
  });

  it('the check of an uploaded file makes nothing and still runs', async () => {
    const r = await post('/api/jobs', { type: 'MEDIA_PROBE', payload: { assetId: 'take-01' }, idempotencyKey: `terms-probe-${Date.now()}` });
    expect([200, 201]).toContain(r.status);
    made.push((await r.json()).job.id);
  });

  it('accepted for this version: the same job is queued', async () => {
    await setTerms(TERMS_VERSION);
    const r = await post('/api/jobs', { type: 'ASSEMBLE', payload: { productionId: 's1e1' }, idempotencyKey: `terms-ok-${Date.now()}` });
    expect([200, 201]).toContain(r.status);
    made.push((await r.json()).job.id);
  });
});
