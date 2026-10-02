import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { StudioState } from '@/domain/types';
import { hashState } from '@/domain/hash';
import { runCommand, type Command } from '@/domain/commands';

/** THE API, END TO END — against the running server. Every test cleans up what it made; the final test restores the
 *  sample studio so the suite is repeatable. Needs ffmpeg on the machine running the tests (to make a real MP4). */

const BASE = process.env.BASE_URL ?? 'http://localhost:4200';
const clientId = `api-test-${Date.now().toString(36)}`;
const now = () => new Date().toISOString();
const seed = () => Math.random().toString(36).slice(2, 12);

async function snapshot(): Promise<{ state: StudioState; version: number; hash: string }> { const r = await fetch(`${BASE}/api/studio`); expect(r.ok).toBe(true); return r.json(); }
async function send(commands: Command[]) { const r = await fetch(`${BASE}/api/commands`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId, commands }) }); return { status: r.status, body: await r.json() as { ok: boolean; version: number; hash: string; results: unknown[]; error?: { code: string; message: string } } }; }

describe('health and snapshot', () => {
  it('reports healthy with the database and queue', async () => {
    const r = await fetch(`${BASE}/api/health`); const j = await r.json();
    expect(r.status).toBe(200); expect(j.ok).toBe(true); expect(j.queue).toBeTruthy(); expect(typeof j.version).toBe('number');
  });
  it('serves the whole studio with a hash that matches the canonical form', async () => {
    const s = await snapshot();
    expect(s.state.productions.length).toBeGreaterThan(0);
    expect(hashState(s.state)).toBe(s.hash);
  });
});

describe('commands', () => {
  let showId = '';
  it('applies a batch and agrees with the browser on ids and hash', async () => {
    const before = await snapshot();
    const cmd: Command<'addShow'> = { name: 'addShow', args: [{ title: 'API Test Show', logline: 'x', genre: 'Test', style: 'ANIME', language: 'EN', aspect: 'WIDE_16_9' }], seed: seed(), at: now() };
    const local = runCommand(before.state, cmd);
    const r = await send([cmd as Command]);
    expect(r.status).toBe(200); expect(r.body.ok).toBe(true);
    expect(r.body.hash).toBe(hashState(local.state));
    expect(r.body.version).toBe(before.version + 1);
    showId = local.result.show.id;
    const after = await snapshot();
    expect(after.state.shows.some((s) => s.id === showId)).toBe(true);
  });
  it('refuses a locked appearance change with 409 and a readable code, atomically', async () => {
    const before = await snapshot();
    const ok: Command = { name: 'updateShow', args: [showId, { logline: 'changed' }], seed: seed(), at: now() };
    const bad: Command = { name: 'updateCharacter', args: ['layla', { hair: 'Bleached' }], seed: seed(), at: now() };
    const r = await send([ok, bad]);
    expect(r.status).toBe(409); expect(r.body.ok).toBe(false); expect(r.body.error?.code).toBe('APPEARANCE_LOCKED');
    const after = await snapshot();
    expect(after.version).toBe(before.version); // the good command did not land either
    expect(after.state.shows.find((s) => s.id === showId)?.logline).toBe('x');
  });
  it('rejects unknown commands and malformed bodies', async () => {
    const r = await send([{ name: 'explode', args: [], seed: seed(), at: now() } as unknown as Command]);
    expect(r.status).toBe(400);
    const r2 = await fetch(`${BASE}/api/commands`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' });
    expect(r2.status).toBe(400);
  });
  afterAll(async () => { if (showId) await send([{ name: 'deleteShow', args: [showId], seed: seed(), at: now() }]); });
});

describe('uploads and media', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-api-'));
  const mp4 = path.join(tmp, 'clip.mp4');
  const png = path.join(tmp, 'pic.png');
  let videoId = ''; let imageId = '';
  beforeAll(() => {
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', mp4]);
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:size=64x64', '-frames:v', '1', png]);
  });
  it('stores a real video, probes it and serves it with Range', async () => {
    const fd = new FormData(); fd.set('file', new Blob([fs.readFileSync(mp4)], { type: 'video/mp4' }), 'clip.mp4'); fd.set('label', 'API clip'); fd.set('tags', 'test,api');
    const r = await fetch(`${BASE}/api/assets`, { method: 'POST', body: fd }); const j = await r.json();
    expect(r.status).toBe(201); videoId = j.asset.id;
    expect(j.asset.kind).toBe('VIDEO'); expect(j.asset.width).toBe(320); expect(j.asset.durationSeconds).toBeGreaterThan(1.5); expect(j.asset.sample).toBe(false); expect(j.asset.src).toBe(`/api/media/${videoId}`);
    const full = await fetch(`${BASE}${j.asset.src}`); expect(full.status).toBe(200); expect(full.headers.get('content-type')).toBe('video/mp4'); expect(full.headers.get('accept-ranges')).toBe('bytes');
    const part = await fetch(`${BASE}${j.asset.src}`, { headers: { range: 'bytes=0-99' } }); expect(part.status).toBe(206); expect(part.headers.get('content-range')).toMatch(/^bytes 0-99\//); expect((await part.arrayBuffer()).byteLength).toBe(100);
    const bad = await fetch(`${BASE}${j.asset.src}`, { headers: { range: 'bytes=999999999-' } }); expect(bad.status).toBe(416);
  });
  it('rejects a file that is not what it claims to be, and unsupported types', async () => {
    const fd = new FormData(); fd.set('file', new Blob([Buffer.from('this is not a video')], { type: 'video/mp4' }), 'fake.mp4');
    const r = await fetch(`${BASE}/api/assets`, { method: 'POST', body: fd }); expect(r.status).toBe(400); const j = await r.json(); expect(j.error.code).toBe('INVALID');
    const fd2 = new FormData(); fd2.set('file', new Blob([Buffer.from('MZ\x90\x00binary')], { type: 'application/octet-stream' }), 'evil.exe');
    const r2 = await fetch(`${BASE}/api/assets`, { method: 'POST', body: fd2 }); expect(r2.status).toBe(400);
    const fd3 = new FormData(); fd3.set('file', new Blob([fs.readFileSync(png)], { type: 'image/png' }), 'pic.png'); fd3.set('expect', 'AUDIO');
    const r3 = await fetch(`${BASE}/api/assets`, { method: 'POST', body: fd3 }); expect(r3.status).toBe(400);
  });
  it('stores an image and refuses to delete a protected one', async () => {
    const fd = new FormData(); fd.set('file', new Blob([fs.readFileSync(png)], { type: 'image/png' }), 'pic.png');
    const r = await fetch(`${BASE}/api/assets`, { method: 'POST', body: fd }); const j = await r.json(); expect(r.status).toBe(201); imageId = j.asset.id;
    const s = await snapshot(); const layla = s.state.characters.find((c) => c.id === 'layla')!;
    const del = await fetch(`${BASE}/api/assets/${layla.portraitAssetId}`, { method: 'DELETE' }); expect(del.status).toBe(423); expect((await del.json()).error.code).toBe('ASSET_PROTECTED');
    const bad = await fetch(`${BASE}/api/media/..%2F..%2Fetc%2Fpasswd`); expect([400, 404]).toContain(bad.status);
  });
  afterAll(async () => { for (const id of [videoId, imageId]) if (id) await fetch(`${BASE}/api/assets/${id}`, { method: 'DELETE' }); fs.rmSync(tmp, { recursive: true, force: true }); });
});

describe('jobs', () => {
  let jobId = '';
  it('validates payloads and queues a job; the same idempotency key returns the same job', async () => {
    const bad = await fetch(`${BASE}/api/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'GENERATE_TAKE', payload: { productionId: 's1e2' } }) });
    expect(bad.status).toBe(400);
    const key = `api-test-${seed()}`;
    const r1 = await fetch(`${BASE}/api/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'MEDIA_PROBE', payload: { assetId: 'take-01' }, idempotencyKey: key }) });
    const j1 = await r1.json(); expect(r1.status).toBe(201); expect(j1.created).toBe(true); jobId = j1.job.id;
    const r2 = await fetch(`${BASE}/api/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'MEDIA_PROBE', payload: { assetId: 'take-01' }, idempotencyKey: key }) });
    const j2 = await r2.json(); expect(r2.status).toBe(200); expect(j2.created).toBe(false); expect(j2.job.id).toBe(jobId);
  });
  it('lists the job and exposes its events; a queued job can be cancelled', async () => {
    const list = await (await fetch(`${BASE}/api/jobs?limit=50`)).json(); expect(list.jobs.some((j: { id: string }) => j.id === jobId)).toBe(true);
    const one = await (await fetch(`${BASE}/api/jobs/${jobId}`)).json(); expect(one.job.id).toBe(jobId); expect(Array.isArray(one.events)).toBe(true);
    // give a worker a moment; whatever state it is in, cancel must answer sanely
    const c = await fetch(`${BASE}/api/jobs/${jobId}/cancel`, { method: 'POST' }); expect(c.status).toBe(200);
    const after = await (await fetch(`${BASE}/api/jobs/${jobId}`)).json();
    expect(['CANCELLED', 'COMPLETED', 'FAILED', 'PREPARING', 'VALIDATING', 'POSTPROCESSING']).toContain(after.job.status);
  });
  it('404s for an unknown job', async () => { expect((await fetch(`${BASE}/api/jobs/job-nope`)).status).toBe(404); });
});

describe('event stream', () => {
  it('opens and sends hello, then a studio event after a command', async () => {
    const ctrl = new AbortController();
    const res = await fetch(`${BASE}/api/events`, { signal: ctrl.signal });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader(); const dec = new TextDecoder(); let text = '';
    const readUntil = async (needle: string, ms: number) => { const until = Date.now() + ms; while (!text.includes(needle) && Date.now() < until) { const { value, done } = await Promise.race([reader.read(), new Promise<{ value: undefined; done: true }>((r) => setTimeout(() => r({ value: undefined, done: true }), 1000))]); if (value) text += dec.decode(value); if (done && !value) continue; } return text.includes(needle); };
    expect(await readUntil('event: hello', 5000)).toBe(true);
    await send([{ name: 'updateSettings', args: [{ reducedMotion: false }], seed: seed(), at: now() }]);
    await send([{ name: 'updateSettings', args: [{ generation: { llmProvider: undefined } }], seed: seed(), at: now() }]);
    // settings reducedMotion=false may equal current → no change; make a real one
    const s = await snapshot(); const flip = !s.state.settings.reducedMotion;
    await send([{ name: 'updateSettings', args: [{ reducedMotion: flip }], seed: seed(), at: now() }]);
    expect(await readUntil('event: studio', 8000)).toBe(true);
    await send([{ name: 'updateSettings', args: [{ reducedMotion: !flip }], seed: seed(), at: now() }]);
    ctrl.abort();
  });
});

describe('reset', () => {
  it('restores the sample studio and the version advances', async () => {
    const before = await snapshot();
    const r = await fetch(`${BASE}/api/studio/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'sample' }) });
    expect(r.status).toBe(200);
    const after = await snapshot();
    expect(after.version).toBeGreaterThan(before.version);
    expect(after.state.shows.map((s) => s.id).sort()).toEqual(['last-sip', 'paper-kites']);
  });
});
