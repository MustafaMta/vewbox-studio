import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudioState } from '@/domain/types';

/** POST /api/characters/:id/voice-reference — the route itself (storage, measurement and the studio faked): nothing
 *  of a failed upload stays in the library, whatever failed before the records were written (finding 16), and an
 *  oversized file is refused from its declared size before the body is read (finding 18). */

const fake = vi.hoisted(() => ({ state: null as unknown as StudioState, removed: [] as string[], stored: [] as string[], adoptFails: null as Error | null, commandsFail: null as Error | null, readFailsAfterCommit: false, committed: false }));

vi.mock('@/server/media', () => ({
  assertSafeId: (x: string) => x,
  storeBuffer: async (id: string) => { fake.stored.push(id); return { relPath: `audio/${id}.wav`, absPath: `/lib/audio/${id}.wav`, bytes: 1000, mime: 'audio/wav', kind: 'AUDIO', ext: 'wav', sha256: 'x', probe: { hasAudio: true, hasVideo: false, durationSeconds: 8 } }; },
  adoptFile: async (id: string) => { if (fake.adoptFails) throw fake.adoptFails; return { relPath: `audio/${id}.wav`, absPath: `/lib/audio/${id}.wav`, bytes: 500, mime: 'audio/wav', kind: 'AUDIO', ext: 'wav', sha256: 'y' }; },
  assetFromStored: (id: string, stored: { kind: string }, meta: Record<string, unknown>) => ({ id, kind: stored.kind, ...meta }),
  removeFile: async (rel: string) => { fake.removed.push(rel); },
}));
vi.mock('@/server/media/ffmpeg', () => ({ tmpDir: async () => '/tmp/fake-voice-ref' }));
vi.mock('@/server/studio/voice-reference', () => ({
  measureVoiceReference: async () => ({ validation: { durationSeconds: 8, sampleRate: 48000, channels: 1, integratedLufs: -19, truePeakDbtp: -3, speech: { present: true, words: 6, language: 'EN', transcript: 'one two three four five six', confidence: 0.9 } }, measurement: { reasons: [], clipping: { clippedSamples: 0, totalSamples: 1, ratio: 0, flatFactor: 0, peakDbfs: -3 }, speechSeconds: 7 }, window: { from: 0.4, to: 7.6 }, trimmedFile: '/tmp/fake-voice-ref/x.wav', gainDb: -1, refusal: null }),
}));
vi.mock('@/server/studio/engine', () => ({
  readState: async () => { if (fake.committed && fake.readFailsAfterCommit) throw new Error('database went away'); return { state: fake.state, version: 1, hash: 'h' }; },
  commands: async () => { if (fake.commandsFail) throw fake.commandsFail; fake.committed = true; return []; },
}));

import { StudioError } from '@/domain/errors';
import { seed } from '@/domain/sample';
import { POST } from '@/app/api/characters/[id]/voice-reference/route';

const call = (file: File, consent: string | null = 'MY_VOICE') => { const fd = new FormData(); fd.set('file', file); if (consent !== null) fd.set('consent', consent); return POST({ url: 'http://studio.test/api/characters/nour/voice-reference', method: 'POST', formData: async () => fd } as unknown as Request, { params: Promise.resolve({ id: 'nour' }) }); };
const wav = () => new File([new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4])], 'take.wav', { type: 'audio/wav' });

beforeEach(() => { fake.state = seed(); fake.removed = []; fake.stored = []; fake.adoptFails = null; fake.commandsFail = null; fake.readFailsAfterCommit = false; fake.committed = false; });

describe('voice-reference route: nothing of a failed upload is kept', () => {
  it('an INVALID from adopting the window removes the stored original', async () => {
    fake.adoptFails = new StudioError('INVALID', 'The file does not decode cleanly');
    const res = await call(wav());
    expect(res.status).toBe(400);
    expect(fake.removed).toEqual([`audio/${fake.stored[0]}.wav`]);
  });
  it('a refused command batch (CONFLICT, NOT_FOUND, VOICE_LOCKED …) removes the original and its window', async () => {
    fake.commandsFail = new StudioError('CONFLICT', 'Voice sample already exists.');
    const res = await call(wav());
    expect(res.status).toBe(409);
    expect(fake.removed).toHaveLength(2);
    expect(fake.removed[0]).toBe(`audio/${fake.stored[0]}.wav`);
    expect(fake.removed[1]).toMatch(/^audio\/gen-/);
  });
  it('once the records are written the files are theirs: a later failure removes nothing', async () => {
    fake.readFailsAfterCommit = true;
    const res = await call(wav());
    expect(res.status).toBe(500);
    expect(fake.removed).toHaveLength(0);
  });
  it('the happy path keeps both files and answers 201; the sample carries the producer’s consent statement', async () => {
    let written: Array<{ name: string; args: unknown[] }> = [];
    const engine = await import('@/server/studio/engine');
    const spy = vi.spyOn(engine, 'commands').mockImplementationOnce(async (list) => { written = list as typeof written; fake.committed = true; return []; });
    const res = await call(wav(), 'SPEAKER_PERMISSION');
    spy.mockRestore();
    expect(res.status).toBe(201);
    expect(fake.removed).toHaveLength(0);
    const sample = written.find((c) => c.name === 'addVoiceSample')!.args[1] as { source: string; consent: { statement: string; by: string; at: string } };
    expect(sample).toMatchObject({ source: 'UPLOADED', consent: { statement: 'SPEAKER_PERMISSION', by: 'PRODUCER' } });
    expect(Date.parse(sample.consent.at)).not.toBeNaN();
  });
  it('without a consent statement (or with one that is not MY_VOICE / SPEAKER_PERMISSION) the upload is refused CONSENT_REQUIRED before it is read or stored (contract v2 §1)', async () => {
    for (const consent of [null, '', 'yes', 'my_voice']) {
      const f = wav();
      let read = false;
      Object.defineProperty(f, 'arrayBuffer', { value: async () => { read = true; return new ArrayBuffer(8); } });
      const res = await call(f, consent);
      expect(res.status, String(consent)).toBe(400);
      expect(await res.json()).toMatchObject({ ok: false, code: 'CONSENT_REQUIRED', error: { code: 'CONSENT_REQUIRED' } });
      expect(read).toBe(false);
    }
    expect(fake.stored).toHaveLength(0);
  });
  it('an oversized file is refused from its declared size before it is read or stored (finding 18)', async () => {
    const big = wav();
    Object.defineProperty(big, 'size', { value: 60 * 1024 * 1024 });
    let read = false;
    Object.defineProperty(big, 'arrayBuffer', { value: async () => { read = true; return new ArrayBuffer(8); } });
    const res = await call(big);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: 'TOO_LONG' });
    expect(read).toBe(false);
    expect(fake.stored).toHaveLength(0);
  });
});
