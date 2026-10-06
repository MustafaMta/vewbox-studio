import { describe, expect, it } from 'vitest';
import { groups, kindCounts, originWords, ownership, productionOnly } from '@/components/files/model';
import type { Asset, StudioState } from '@/domain/types';

const asset = (id: string, over: Partial<Asset> = {}): Asset => ({ id, kind: 'IMAGE', label: id, tags: [], src: `/api/media/${id}`, createdAt: '2026-10-06T00:00:00Z', origin: 'GENERATED', ...over } as Asset);

describe('a derived production-only reference is never listed as a file of its own (FINAL §12)', () => {
  const canon = asset('canon', { tier: 'CANONICAL' });
  const face = asset('face', { origin: 'DERIVED', tags: ['face-reference', 'production-reference', 'derived'], provenance: { kind: 'FACE_REFERENCE', derivedFrom: 'canon', characterId: 'c1', faceBox: { x: 0.4, y: 0.1, w: 0.2, h: 0.1 }, canonicalSize: { width: 928, height: 1664 } } });
  const s: Pick<StudioState, 'characters' | 'locations' | 'productions' | 'assets'> = { characters: [], locations: [], productions: [], assets: [canon, face] };
  it('is recognised by its provenance or its tag', () => {
    expect(productionOnly(face)).toBe(true);
    expect(productionOnly(asset('x', { tags: ['production-reference'] }))).toBe(true);
    expect(productionOnly(canon)).toBe(false);
  });
  it('is left out of the groups and the counts, and says what it is when opened', () => {
    const g = groups(s, ownership(s), { q: '', kind: 'ALL', owner: 'all' });
    expect(Object.values(g).flat().flatMap((x) => x.files.map((f) => f.asset.id))).toEqual(['canon']);
    expect(kindCounts(s).ALL).toBe(1);
    expect(originWords(face)).toBe('Derived · production only');
  });
});
