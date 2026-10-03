import { describe, expect, it } from 'vitest';
import { seed } from '@/domain/sample';
import type { Asset, Production } from '@/domain/types';
import { currentCutVersion, cutVersionsOf, isCutOf } from '@/studio/selectors/cuts';

/** docs/CONTRACTS-REDESIGN-BACKEND.md B3: the cut history derived from the assets ASSEMBLE already stores. */

const asset = (id: string, over: Partial<Asset>): Asset => ({ id, kind: 'VIDEO', src: `/api/media/${id}`, label: 'The Static Sky — assembled cut', tags: ['cut', 'mp4-h264', '1080p'], sample: false, origin: 'DERIVED', createdAt: '2026-10-03T08:00:00.000Z', ...over });
const prod = (over: Partial<Production>): Pick<Production, 'id' | 'cutAssetId' | 'shots'> => ({ id: 'short-1', shots: [{ id: 'sh-a' }, { id: 'sh-b' }] as Production['shots'], ...over });

describe('cutVersionsOf', () => {
  const cut1 = asset('cut-1', { createdAt: '2026-10-03T08:51:00.000Z', provenance: { shots: [{ shotId: 'sh-a' }, { shotId: 'sh-b' }] }, durationSeconds: 55, poster: '/api/media/poster-1', jobId: 'job-1' });
  const cut2 = asset('cut-2', { createdAt: '2026-10-03T09:07:00.000Z', provenance: { shots: [{ shotId: 'sh-a' }, { shotId: 'sh-b' }] }, durationSeconds: 56 });
  const cut3 = asset('cut-3', { createdAt: '2026-10-03T09:29:00.000Z', provenance: { shots: [{ shotId: 'sh-a' }, { shotId: 'sh-b' }] }, durationSeconds: 56 });
  const other = asset('cut-x', { createdAt: '2026-10-03T09:00:00.000Z', provenance: { shots: [{ shotId: 'someone-else' }] } });
  const exported = asset('exp-1', { createdAt: '2026-10-03T09:33:00.000Z', tags: ['export', 'mp4-h264', '1080p'], provenance: { shots: [{ shotId: 'sh-a' }] } });
  const srt = asset('srt-1', { kind: 'SUBTITLE', tags: ['subtitles', 'en', 'srt', 'cut'], provenance: { for: 'cut-3', lang: 'en', format: 'srt' }, createdAt: '2026-10-03T09:29:10.000Z' });
  const vtt = asset('vtt-1', { kind: 'SUBTITLE', tags: ['subtitles', 'ar', 'vtt', 'cut'], provenance: { for: 'cut-3', lang: 'ar', format: 'vtt' }, createdAt: '2026-10-03T09:29:20.000Z' });
  const assets = [cut3, other, srt, cut1, exported, vtt, cut2];

  it('lists the production’s cuts oldest first, numbered, the current one marked, with sidecars', () => {
    const p = prod({ cutAssetId: 'cut-3' });
    const v = cutVersionsOf(p, assets);
    expect(v.map((c) => [c.version, c.assetId, c.current])).toEqual([[1, 'cut-1', false], [2, 'cut-2', false], [3, 'cut-3', true]]);
    expect(v[0]).toMatchObject({ durationSeconds: 55, poster: '/api/media/poster-1', shots: 2, shotIds: ['sh-a', 'sh-b'], jobId: 'job-1', subtitleAssetIds: [] });
    expect(v[2].subtitleAssetIds).toEqual(['srt-1', 'vtt-1']);
    expect(currentCutVersion(p, assets)).toEqual({ version: 3, of: 3 });
  });
  it('an older cut can be the current one ("Cut 2 of 3"); no cut at all is null', () => {
    expect(currentCutVersion(prod({ cutAssetId: 'cut-2' }), assets)).toEqual({ version: 2, of: 3 });
    expect(currentCutVersion(prod({}), assets)).toBeNull();
    expect(cutVersionsOf(prod({}), assets).length).toBe(3);
  });
  it('another production’s cut, an export and the current cut by id', () => {
    const p = prod({ cutAssetId: 'cut-x' });
    expect(isCutOf(p, other)).toBe(true); // the current cut is always a version, whatever its provenance says
    expect(isCutOf(prod({}), other)).toBe(false);
    expect(isCutOf(prod({}), exported)).toBe(false);
    expect(isCutOf(prod({}), asset('no-prov', {}))).toBe(false);
  });
  it('the sample studio: its one cut has no provenance, so it is the only version of its episode', () => {
    const s = seed();
    const ep = s.productions.find((p) => p.id === 's1e1')!;
    expect(cutVersionsOf(ep, s.assets).map((c) => c.assetId)).toEqual(['cut-s1e1']);
    for (const p of s.productions.filter((x) => !x.cutAssetId)) expect(cutVersionsOf(p, s.assets)).toEqual([]);
  });
});
