import { describe, expect, it, vi } from 'vitest';

vi.stubEnv('DATABASE_URL', 'postgres://unused@127.0.0.1:1/unused');
const { referenceFilesReadiness, referenceNeeds } = await import('@/server/production/readiness');

/** The reference files a take request sends are checked on disk before any inference (directive §20, §26). Pure. */
describe('reference files', () => {
  const pack = { pictures: [{ assetId: 'canon', role: 'SUBJECT' }, { assetId: 'plate', role: 'LOCATION' }], opening: { kind: 'TAIL', assetId: 'prev-take' }, ending: { assetId: 'end' } };
  it('lists every picture, the opening clip/frame, the ending frame and each reused recording', () => {
    expect(referenceNeeds(pack, [{ id: 'l1', audioAssetId: 'line' }, { id: 'l2' }])).toEqual([
      { assetId: 'canon', what: 'reference picture 1 (subject)' },
      { assetId: 'plate', what: 'reference picture 2 (location)' },
      { assetId: 'prev-take', what: "opening clip (the previous take's tail)" },
      { assetId: 'end', what: 'ending frame' },
      { assetId: 'line', what: 'recorded line l1' },
    ]);
  });
  it('names what is missing — a file gone, or no record at all', async () => {
    const files: Record<string, string> = { canon: '/lib/canon.png', plate: '/lib/plate.png', 'prev-take': '/lib/t.mp4' };
    const r = await referenceFilesReadiness(referenceNeeds(pack), (id) => files[id], async (f) => f !== '/lib/canon.png');
    expect(r.ok).toBe(false);
    expect(r.detail).toBe('missing reference files: reference picture 1 (subject) (asset canon); ending frame (asset end, no record)');
    const ok = await referenceFilesReadiness(referenceNeeds({ ...pack, ending: undefined }), (id) => files[id], async () => true);
    expect(ok).toMatchObject({ ok: true, detail: '3 reference file(s) present' });
  });
});
