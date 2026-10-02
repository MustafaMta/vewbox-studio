import { describe, expect, it } from 'vitest';
import type { Character } from '@/domain/types';
import { SHEET_VIEWS, sheetLayout } from '@/components/character/sheet';

/** Where the Appearance tab puts a character's pictures. A tile sits by its ROLE — `view` is provenance
 *  ('SHEET_TILE', 'FACE', …) — so the tiles images.ts writes land in their sheet slots (finding 1); the face crop is
 *  shown beside the portrait, not listed under "Views and outfits" (finding 21). */

const refs: Character['refs'] = [
  { id: 'r-face', role: 'FACE', assetId: 'gen-face', view: 'FACE', references: ['gen-portrait'], seed: 7 },
  { id: 'r-front', role: 'FRONT', assetId: 'gen-front', view: 'SHEET_TILE', references: ['gen-sheet', 'gen-portrait', 'gen-face'], seed: 7 },
  { id: 'r-tq', role: 'THREE_QUARTER', assetId: 'gen-tq', view: 'SHEET_TILE', seed: 7 },
  { id: 'r-side', role: 'SIDE', assetId: 'gen-side', view: 'SHEET_TILE', seed: 7 },
  { id: 'r-back', role: 'BACK', assetId: 'gen-back', view: 'SHEET_TILE', seed: 7 },
  { id: 'r-full', role: 'FULL_BODY', assetId: 'gen-full', view: 'FULL_BODY', seed: 18 },
  { id: 'r-outfit', role: 'OUTFIT', assetId: 'up-outfit' },
  { id: 'r-portrait', role: 'PORTRAIT' as Character['refs'][number]['role'], assetId: 'gen-portrait' },
];

describe('sheetLayout', () => {
  it('places a SHEET_TILE ref in the slot of its role (FRONT tile → FRONT slot)', () => {
    const { sheet } = sheetLayout({ refs, portraitAssetId: 'gen-portrait' });
    expect(sheet.map((s) => s.view)).toEqual(SHEET_VIEWS);
    expect(sheet.find((s) => s.view === 'FRONT')!.ref).toMatchObject({ role: 'FRONT', view: 'SHEET_TILE', assetId: 'gen-front' });
    for (const v of ['THREE_QUARTER', 'SIDE', 'BACK', 'FULL_BODY'] as const) expect(sheet.find((s) => s.view === v)!.ref, v).toBeDefined();
    expect(sheet.find((s) => s.view === 'EXPRESSION')!.ref).toBeUndefined();
  });
  it('keeps the face crop out of "views and outfits" and out of the sheet; the portrait is listed nowhere twice', () => {
    const { faceCrop, others, sheet } = sheetLayout({ refs, portraitAssetId: 'gen-portrait' });
    expect(faceCrop).toMatchObject({ role: 'FACE', assetId: 'gen-face' });
    expect(others.map((r) => r.role)).toEqual(['OUTFIT']);
    expect(sheet.some((s) => s.ref?.role === 'FACE')).toBe(false);
    expect(sheetLayout({ refs: refs.filter((r) => r.role !== 'FACE'), portraitAssetId: 'gen-portrait' }).faceCrop).toBeUndefined();
  });
});
