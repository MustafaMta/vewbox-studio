import type { CanonicalImage } from '@/domain/types';
import type { StoredCanonicalImage } from '../db/schema';

/** THE CANONICAL IMAGE IN THE DATABASE — `Character.canonicalImage` is stored as the `canonical_asset_id` column (the
 *  picture: queryable, protected by a foreign key) plus `canonical_image` jsonb with everything else (status, version,
 *  how it was drawn, the check, the approval). These two functions are the only translation between the two shapes,
 *  so an image read back is the image that was written (the saver's fingerprints depend on it). */

export interface CanonicalImageColumns { canonicalAssetId: string | null; canonicalImage: StoredCanonicalImage | null }

export function canonicalToColumns(img: CanonicalImage | undefined): CanonicalImageColumns {
  if (!img) return { canonicalAssetId: null, canonicalImage: null };
  const { assetId, ...rest } = img;
  // JSON keeps no undefined values: what is written is what canonical() fingerprints
  return { canonicalAssetId: assetId, canonicalImage: JSON.parse(JSON.stringify(rest)) as StoredCanonicalImage };
}

/** The image as the domain holds it. No column, no image (metadata without its picture is dropped). A column without
 *  metadata (written outside the studio) is a DRAFT version 1 dated by `generatedAtOf(assetId)` — the asset's own
 *  creation time. */
export function canonicalFromColumns(row: CanonicalImageColumns, generatedAtOf: (assetId: string) => string): CanonicalImage | undefined {
  const assetId = row.canonicalAssetId;
  if (!assetId) return undefined;
  const stored = row.canonicalImage;
  if (!stored) return { assetId, status: 'DRAFT', version: 1, generatedAt: generatedAtOf(assetId) };
  return {
    ...stored, assetId,
    status: stored.status === 'APPROVED' ? 'APPROVED' : 'DRAFT',
    version: typeof stored.version === 'number' ? stored.version : 1,
    generatedAt: typeof stored.generatedAt === 'string' ? stored.generatedAt : generatedAtOf(assetId),
  };
}
