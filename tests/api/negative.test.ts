import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** NEGATIVE PATHS through the real API: broken media, wrong shapes, missing engines, double submissions. The server
 *  must refuse clearly (a code and a sentence), never crash, never half-apply. */

const BASE = process.env.STUDIO_URL || 'http://localhost:4200';
const post = (p: string, body: unknown) => fetch(`${BASE}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('broken and hostile uploads', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-neg-'));
  it('a truncated MP4 (valid header, cut body) is refused after the decode check', async () => {
    const good = path.join(tmp, 'ok.mp4');
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', good]);
    const bytes = fs.readFileSync(good);
    const cut = bytes.subarray(0, Math.floor(bytes.length * 0.45)); // moov is at the front (faststart), so the header parses and the stream does not
    const fd = new FormData(); fd.set('file', new Blob([cut], { type: 'video/mp4' }), 'cut.mp4');
    const r = await fetch(`${BASE}/api/assets`, { method: 'POST', body: fd });
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.error.code).toBe('INVALID');
    expect(j.error.message.length).toBeGreaterThan(10);
  });
  it('an SVG with a script is not accepted as a picture, and a zero-byte file is refused', async () => {
    const fd = new FormData(); fd.set('file', new Blob([Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')], { type: 'image/svg+xml' }), 'x.svg');
    const r = await fetch(`${BASE}/api/assets`, { method: 'POST', body: fd });
    expect(r.status).toBe(400);
    const fd2 = new FormData(); fd2.set('file', new Blob([new Uint8Array(0)], { type: 'image/png' }), 'empty.png');
    const r2 = await fetch(`${BASE}/api/assets`, { method: 'POST', body: fd2 });
    expect(r2.status).toBe(400);
  });
  it('a multipart body without a file, and a non-multipart body, are refused', async () => {
    const fd = new FormData(); fd.set('label', 'nothing');
    expect((await fetch(`${BASE}/api/assets`, { method: 'POST', body: fd })).status).toBe(400);
    expect((await fetch(`${BASE}/api/assets`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(400);
  });
  it('media ids are validated before they reach the database', async () => {
    for (const id of ['..', '%2e%2e%2fetc', 'a b', 'x'.repeat(300), 'take-01%00']) {
      const r = await fetch(`${BASE}/api/media/${id}`);
      expect([400, 404]).toContain(r.status);
    }
  });
});

describe('jobs that cannot run', () => {
  it('a take for a shot whose video engine is not available fails with a reason and schedules a retry, never a fake take', async () => {
    const studio = await (await fetch(`${BASE}/api/studio`)).json();
    const ep = studio.state.productions.find((p: { id: string }) => p.id === 's1e1');
    const shot = ep.shots[0];
    const takesBefore = shot.takes.length;
    const status = await (await fetch(`${BASE}/api/status`)).json();
    if (status.video?.ready) return; // an engine is up: this negative path does not apply on this machine right now
    const r = await post('/api/jobs', { type: 'GENERATE_TAKE', payload: { productionId: ep.id, shotId: shot.id }, idempotencyKey: `neg-${Date.now()}` });
    expect(r.status).toBe(201);
    const { job } = await r.json();
    let seen: { status: string; error?: { code: string; message: string }; attempts: number } | undefined;
    for (let i = 0; i < 60; i++) {
      await sleep(1000);
      const j = (await (await fetch(`${BASE}/api/jobs/${job.id}`)).json()).job;
      if (j.error || j.status === 'FAILED') { seen = j; break; }
    }
    expect(seen, 'the worker should have tried and reported').toBeTruthy();
    expect(['UNAVAILABLE', 'NOT_CONFIGURED', 'PROVIDER']).toContain(seen!.error!.code);
    expect(seen!.error!.message).toMatch(/MiniMax|engine|ComfyUI|key/i);
    expect(['QUEUED', 'FAILED']).toContain(seen!.status); // retry scheduled with backoff, or exhausted
    const after = await (await fetch(`${BASE}/api/studio`)).json();
    expect(after.state.productions.find((p: { id: string }) => p.id === 's1e1').shots[0].takes.length).toBe(takesBefore);
    await post(`/api/jobs/${job.id}/cancel`, {});
  });
  it('wrong payloads for every job type are refused with the field named', async () => {
    for (const type of ['GENERATE_TAKE', 'WRITE_SCRIPT', 'VOICE_BUILD', 'EXPORT', 'ASSEMBLE']) {
      const r = await post('/api/jobs', { type, payload: { nonsense: true } });
      expect(r.status).toBe(400);
      const j = await r.json();
      expect(j.error.code).toBe('INVALID');
      expect(j.error.message).toMatch(/productionId|characterId|shotId/);
    }
    expect((await post('/api/jobs', { type: 'RENDER_WITH_LTX', payload: {} })).status).toBe(400);
  });
  it('cancel and retry answer sanely for the wrong state', async () => {
    const r = await post('/api/jobs', { type: 'MEDIA_PROBE', payload: { assetId: 'take-01' }, idempotencyKey: `neg-probe-${Date.now()}` });
    const { job } = await r.json();
    const retryTooEarly = await post(`/api/jobs/${job.id}/retry`, {});
    expect([409, 200]).toContain(retryTooEarly.status); // 409 while queued/running; 200 only if it already failed
    const c1 = await post(`/api/jobs/${job.id}/cancel`, {}); expect(c1.status).toBe(200);
    const c2 = await post(`/api/jobs/${job.id}/cancel`, {}); expect(c2.status).toBe(200); // idempotent
    expect((await post('/api/jobs/job-nope/cancel', {})).status).toBe(404);
    expect((await post('/api/jobs/job-nope/retry', {})).status).toBe(404);
  });
});

describe('commands that must not half-apply', () => {
  it('a batch with a bad command in the middle leaves no trace of the good ones', async () => {
    const before = await (await fetch(`${BASE}/api/studio`)).json();
    const seed = () => Math.random().toString(36).slice(2, 12);
    const at = new Date().toISOString();
    const title = `Ghost Show ${seed()}`;
    const r = await post('/api/commands', { clientId: 'neg', commands: [
      { name: 'addShow', args: [{ title, logline: 'x', genre: 'Test', style: 'ANIME', language: 'EN', aspect: 'WIDE_16_9' }], seed: seed(), at },
      { name: 'updateShow', args: ['does-not-exist', { logline: 'y' }], seed: seed(), at },
    ] });
    expect(r.status).toBe(409);
    const j = await r.json();
    expect(j.ok).toBe(false); expect(j.failedAt).toBe(1); expect(j.error.code).toBe('NOT_FOUND');
    const after = await (await fetch(`${BASE}/api/studio`)).json();
    expect(after.version).toBe(before.version);
    expect(after.state.shows.some((s: { title: string }) => s.title === title)).toBe(false);
  });
  it('oversized and malformed batches are refused before anything runs', async () => {
    const at = new Date().toISOString();
    const many = Array.from({ length: 201 }, () => ({ name: 'updateSettings', args: [{}], seed: 'abcdef', at }));
    expect((await post('/api/commands', { clientId: 'neg', commands: many })).status).toBe(400);
    expect((await post('/api/commands', { clientId: '', commands: [] })).status).toBe(400);
    expect((await post('/api/commands', { clientId: 'neg', commands: [{ name: 'addShow', args: 'not-an-array', seed: 'abcdef', at }] })).status).toBe(400);
  });
});
