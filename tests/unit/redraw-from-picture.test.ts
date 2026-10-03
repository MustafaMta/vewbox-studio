import { describe, expect, it } from 'vitest';
import { lookWritten, redrawsFromEarlierPicture } from '@/domain/identity';

/** D19: a character made from a picture has no written look (the picture is its look). A redraw without a new
 *  picture must draw from that picture again; from the empty written look it drew a stranger. */
describe('redraw of a character made from a picture (D19)', () => {
  const fromPicture = { pendingReference: undefined, canonicalImage: { assetId: 'gen-1', referenceAssetId: 'up-1', status: 'DRAFT', version: 1 } as never, build: '', face: '', hair: '', skin: '', eyes: '', wardrobe: '' };

  it('reuses the earlier picture while no look is written', () => {
    expect(lookWritten(fromPicture)).toBe(false);
    expect(redrawsFromEarlierPicture(fromPicture)).toBe(true);
  });
  it('a dash is not a written look', () => {
    expect(lookWritten({ ...fromPicture, face: '—', hair: ' ' })).toBe(false);
  });
  it('draws from words once the producer has written the look', () => {
    expect(redrawsFromEarlierPicture({ ...fromPicture, wardrobe: 'a grey dishdasha' })).toBe(false);
  });
  it('a new picture given with the redraw wins', () => {
    expect(redrawsFromEarlierPicture({ ...fromPicture, pendingReference: { assetId: 'up-2', addedAt: '2026-10-03T00:00:00Z' } })).toBe(false);
  });
  it('a character drawn from text never reuses a picture', () => {
    expect(redrawsFromEarlierPicture({ ...fromPicture, canonicalImage: { assetId: 'gen-1', status: 'DRAFT', version: 1 } as never })).toBe(false);
  });
});
