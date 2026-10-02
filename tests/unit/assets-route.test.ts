import { beforeEach, describe, expect, it, vi } from 'vitest';

/** POST /api/assets with `purpose: 'character-reference'` (contract §1.2, finding 2): the picture is measured on the
 *  CPU at upload, the measurement is stored on the asset (`provenance.validation`) and returned beside it. Without
 *  the purpose nothing is measured and the answer is `{ asset }` as before. Storage, the studio command and the
 *  measurement are faked; the route itself is the real one. */

const fake = vi.hoisted(() => ({ stored: [] as string[], removed: [] as string[], assets: [] as Array<Record<string, unknown>>, validated: [] as string[], validateFails: false, storeOpts: [] as Array<Record<string, unknown>> }));

vi.mock('@/server/media', () => ({
  storeBuffer: async (id: string, buf: Buffer, opts: Record<string, unknown>) => { fake.storeOpts.push(opts); fake.stored.push(id); return { relPath: `images/${id}.png`, absPath: `/lib/images/${id}.png`, bytes: buf.length, mime: 'image/png', kind: 'IMAGE', ext: 'png', sha256: 'x', probe: { width: 768, height: 960, hasAudio: false, hasVideo: true } }; },
  assetFromStored: (id: string, stored: { kind: string; mime: string; bytes: number }, meta: { label: string; tags: string[]; origin: string; provenance?: Record<string, unknown> }) => ({ id, kind: stored.kind, src: `/api/media/${id}`, label: meta.label, tags: meta.tags, sample: false, origin: meta.origin, mimeType: stored.mime, bytes: stored.bytes, width: 768, height: 960, provenance: meta.provenance }),
  removeFile: async (rel: string) => { fake.removed.push(rel); },
}));
vi.mock('@/server/media/image-check', () => ({
  FACE_DETECTION_NOTE: 'face detection not available (size and sharpness only)',
  validateReferenceImage: async (file: string) => { fake.validated.push(file); if (fake.validateFails) throw Object.assign(new Error('decode failed'), { name: 'StudioError', code: 'INVALID' }); return { ok: true, width: 768, height: 960, sharpness: 88.4, reasons: ['face detection not available (size and sharpness only)'] }; },
}));
vi.mock('@/server/studio/engine', () => ({ command: async (_name: string, args: unknown[]) => { const a = args[0] as Record<string, unknown>; fake.assets.push(a); return { asset: { ...a, createdAt: 'x' } }; } }));

import { POST } from '@/app/api/assets/route';
import { refusalReasons } from '@/components/character/create/preflight';

const upload = (fields: Record<string, string>, file = new File([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], 'face.png', { type: 'image/png' })) => {
  const fd = new FormData();
  fd.set('file', file);
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return POST(new Request('http://studio.test/api/assets', { method: 'POST', body: fd }), undefined);
};

beforeEach(() => { fake.stored = []; fake.removed = []; fake.assets = []; fake.validated = []; fake.validateFails = false; fake.storeOpts = []; });

describe('POST /api/assets — character reference', () => {
  it('measures the picture, stores the validation on the asset and answers { asset, validation }', async () => {
    const res = await upload({ expect: 'IMAGE', purpose: 'character-reference', label: 'Maysoon — reference' });
    expect(res.status).toBe(201);
    const body = await res.json() as { asset: { id: string; provenance: Record<string, unknown> }; validation: Record<string, unknown> };
    expect(body.validation).toMatchObject({ ok: true, width: 768, height: 960, sharpness: 88.4 });
    expect(body.validation.faces).toBeUndefined(); // no detector: no count is invented
    expect(body.validation.reasons).toEqual(['face detection not available (size and sharpness only)']);
    expect(body.asset.provenance).toMatchObject({ purpose: 'character-reference', validation: { ok: true, width: 768, height: 960 } });
    expect(fake.validated).toEqual([`/lib/images/${body.asset.id}.png`]);
    expect(fake.storeOpts[0]).toMatchObject({ expectKind: 'IMAGE' });
  });
  it('an ordinary upload is not measured and answers { asset } only', async () => {
    const res = await upload({ label: 'plate' });
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['asset']);
    expect(fake.validated).toHaveLength(0);
  });
  it('a reference must be a picture; a measurement that throws keeps no file', async () => {
    const wrong = await upload({ expect: 'AUDIO', purpose: 'character-reference' });
    expect(wrong.status).toBe(400);
    expect(fake.stored).toHaveLength(0);
    fake.validateFails = true;
    const res = await upload({ expect: 'IMAGE', purpose: 'character-reference' });
    expect(res.status).toBe(400);
    expect(fake.removed).toEqual([`images/${fake.stored[0]}.png`]);
    expect(fake.assets).toHaveLength(0);
  });
  it('the page lists the refusal reasons without the face-detection note (not a reason to refuse)', () => {
    expect(refusalReasons(['too small: 100×100; the short side must be at least 512 px', 'face detection not available (size and sharpness only)'])).toEqual(['too small: 100×100; the short side must be at least 512 px']);
  });
});
