import { createHash } from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/** THE VOICE-DESIGN CLIENT against a faked service: answers are validated (shape, sha256 of every file, header/body
 *  agreement), files land where asked, and every failure becomes the studio's own error class. The real service is
 *  exercised by scripts/voice-design-eval.ts (docs/evidence/voice-design/). */

process.env.DATABASE_URL ??= 'postgres://test@127.0.0.1:5432/test';
process.env.TTS_DESIGN_URL = 'http://design.test:8022';
const client = await import('@/server/providers/voice-design');

let dir: string;
beforeAll(async () => { dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'voice-design-')); });
afterAll(async () => { await fsp.rm(dir, { recursive: true, force: true }); });
afterEach(() => { vi.unstubAllGlobals(); });

const unit = (k: number) => { const v = Array.from({ length: 192 }, (_, i) => Math.sin(i + k)); const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)); return v.map((x) => x / n); };
const file = (bytes: Buffer, sr: number) => ({
  sample_rate: sr, channels: 1, subtype: 'PCM_16', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), duration: 2.5,
  true_peak_dbtp: -1.02, input_true_peak_dbtp: 0.4, gain_reduction_db: -1.5, limited_samples: 120, lufs: -19.8, ebur128_true_peak_dbtp: -1.1, clipped_samples: 0,
  wav_base64: bytes.toString('base64'),
});
function designBody(overrides: Record<string, unknown> = {}) {
  const cands = [0, 1].map((k) => ({ index: k + 1, seed: 7 + k, generation_ms: 900, native: file(Buffer.from(`RIFF-native-${k}-${'x'.repeat(40)}`), 48000), reference: file(Buffer.from(`RIFF-ref-${k}-${'y'.repeat(40)}`), 24000), embedding: unit(k) }));
  return {
    ok: true, design_id: 'vd-test01', engine: 'voxcpm2', model: 'openbmb/VoxCPM2', engine_version: 'voxcpm 2.0.3; model openbmb/VoxCPM2@32279ef; torch 2.8.0+cu128', language: 'en',
    description: 'A warm, low male voice, about 50', text: 'Hello there.', seed: 7, seeds: [7, 8], params: { seed: 7, n: 2, cfg_value: 2, inference_timesteps: 10 }, ms: 2100,
    candidates: cands, similarity: { model: 'speechbrain/spkrec-ecapa-voxceleb', matrix: [[1, 0.8], [0.8, 1]] }, label: 'Studio-designed synthetic voice — not a real person', ...overrides,
  };
}
const respond = (body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) => vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: init.status ?? 200, headers: { 'content-type': 'application/json', ...init.headers } }));

describe('designVoice', () => {
  it('validates the answer, checks every file against its sha256 and writes both rates', async () => {
    const body = designBody();
    const fetchMock = respond(body, { headers: { 'x-engine-version': body.engine_version, 'x-seed': '7' } });
    vi.stubGlobal('fetch', fetchMock);
    const r = await client.designVoice({ description: body.description, text: body.text, language: 'EN', seed: 7, n: 2 }, dir);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://design.test:8022/design');
    const fd = init.body as FormData;
    expect(fd.get('language')).toBe('en'); expect(fd.get('seed')).toBe('7'); expect(fd.get('n')).toBe('2');
    expect(r).toMatchObject({ designId: 'vd-test01', engineVersion: body.engine_version, seed: 7, seeds: [7, 8], language: 'EN', similarity: [[1, 0.8], [0.8, 1]] });
    expect(r.candidates).toHaveLength(2);
    const c = r.candidates[0];
    expect(c.reference).toMatchObject({ sampleRate: 24000, truePeakDbtp: -1.02, clippedSamples: 0, lufs: -19.8 });
    expect(path.basename(c.native.file!)).toBe('vd-test01-c1-s7-48k.wav');
    expect(path.basename(c.reference.file!)).toBe('vd-test01-c1-s7-24k.wav');
    const written = await fsp.readFile(c.reference.file!);
    expect(createHash('sha256').update(written).digest('hex')).toBe(c.reference.sha256);
    expect(c.embedding).toHaveLength(192);
  });

  it('refuses a file whose bytes do not hash to the reported sha256', async () => {
    const body = designBody();
    (body.candidates[1].reference as { sha256: string }).sha256 = 'a'.repeat(64);
    vi.stubGlobal('fetch', respond(body));
    await expect(client.designVoice({ description: 'x', text: 'y', language: 'EN' })).rejects.toMatchObject({ code: 'PROVIDER' });
  });

  it('refuses an answer that breaks the contract, and a header that disagrees with the body', async () => {
    vi.stubGlobal('fetch', respond(designBody({ candidates: [] })));
    await expect(client.designVoice({ description: 'x', text: 'y', language: 'EN' })).rejects.toMatchObject({ code: 'PROVIDER' });
    const body = designBody();
    vi.stubGlobal('fetch', respond(body, { headers: { 'x-engine-version': 'something else' } }));
    await expect(client.designVoice({ description: 'x', text: 'y', language: 'EN' })).rejects.toMatchObject({ code: 'PROVIDER' });
  });

  it('maps service failures onto the studio error classes', async () => {
    vi.stubGlobal('fetch', respond({ detail: 'VoxCPM2 weights are not in the models volume yet' }, { status: 503 }));
    await expect(client.designVoice({ description: 'x', text: 'y', language: 'EN' })).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    vi.stubGlobal('fetch', respond({ detail: 'description refused (Rule V-DESIGN)' }, { status: 400 }));
    await expect(client.designVoice({ description: 'sounds like someone', text: 'y', language: 'EN' })).rejects.toMatchObject({ code: 'INVALID', message: expect.stringContaining('Rule V-DESIGN') });
    vi.stubGlobal('fetch', respond({ detail: 'boom' }, { status: 500 }));
    await expect(client.designVoice({ description: 'x', text: 'y', language: 'EN' })).rejects.toMatchObject({ code: 'PROVIDER' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); }));
    await expect(client.designVoice({ description: 'x', text: 'y', language: 'EN' })).rejects.toMatchObject({ code: 'UNAVAILABLE', message: expect.stringContaining('ECONNREFUSED') });
    vi.stubGlobal('fetch', respond('<html>not json</html>'));
    await expect(client.designVoice({ description: 'x', text: 'y', language: 'EN' })).rejects.toMatchObject({ code: 'PROVIDER' });
  });
});

describe('embeddings and similarity', () => {
  it('returns a normalised 192-d vector and refuses one that is not', async () => {
    const wav = path.join(dir, 'a.wav'); await fsp.writeFile(wav, Buffer.alloc(2000));
    vi.stubGlobal('fetch', respond({ ok: true, model: 'speechbrain/spkrec-ecapa-voxceleb', version: 'speechbrain 1.1.1', dim: 192, embedding: unit(3), duration: 4.2, ms: 80 }));
    const e = await client.embedVoice(wav);
    expect(e.embedding).toHaveLength(192);
    expect(client.cosine(e.embedding, e.embedding)).toBeCloseTo(1, 6);
    vi.stubGlobal('fetch', respond({ ok: true, model: 'm', version: 'v', dim: 192, embedding: unit(3).map((x) => x * 2), duration: 4.2, ms: 80 }));
    await expect(client.embedVoice(wav)).rejects.toMatchObject({ code: 'PROVIDER' });
    vi.stubGlobal('fetch', respond({ ok: true, model: 'm', version: 'v', dim: 192, embedding: [1, 2, 3], duration: 4.2, ms: 80 }));
    await expect(client.embedVoice(wav)).rejects.toMatchObject({ code: 'PROVIDER' });
  });

  it('reads a cosine in [-1, 1]', async () => {
    const a = path.join(dir, 'a.wav'); const b = path.join(dir, 'b.wav');
    await fsp.writeFile(a, Buffer.alloc(2000)); await fsp.writeFile(b, Buffer.alloc(2000));
    const fetchMock = respond({ ok: true, model: 'm', version: 'v', cosine: 0.42, a: { duration: 3 }, b: { duration: 4 }, ms: 50 });
    vi.stubGlobal('fetch', fetchMock);
    expect((await client.voiceSimilarity(a, b)).cosine).toBe(0.42);
    const fd = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    expect(fd.get('a')).toBeInstanceOf(Blob); expect(fd.get('b')).toBeInstanceOf(Blob);
    vi.stubGlobal('fetch', respond({ ok: true, model: 'm', version: 'v', cosine: 1.7, a: { duration: 3 }, b: { duration: 4 }, ms: 50 }));
    await expect(client.voiceSimilarity(a, b)).rejects.toMatchObject({ code: 'PROVIDER' });
  });
});

describe('configuration', () => {
  it('an empty TTS_DESIGN_URL is NOT_CONFIGURED, before any request', async () => {
    vi.resetModules();
    const saved = process.env.TTS_DESIGN_URL;
    process.env.TTS_DESIGN_URL = '';
    try {
      const fresh = await import('@/server/providers/voice-design');
      const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
      await expect(fresh.designHealth()).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { process.env.TTS_DESIGN_URL = saved; }
  });
});
