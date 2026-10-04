'use client';

import type { Location } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { assetById } from '@/studio/selectors';
import { MediaTile } from '@/components/media';

const lang = (s: string) => (/[؀-ۿ]/.test(s) ? 'ar' : undefined);

/** A LOCATION as a 16:9 plate tile (docs/design/VISUAL-STANDARD-V5.1.md §5.6 "Plate"): the master plate (cover), the
 *  name on the start edge, and one meta line — "Interior · 2 plates". The whole tile is one link. */
export function LocationCard({ l, priority }: { l: Location; priority?: boolean }) {
  const { state } = useStudio();
  const plate = assetById(state, l.masterAssetId);
  const plates = l.refs.filter((r) => assetById(state, r.assetId)).length;
  return (
    <MediaTile href={`/locations/${encodeURIComponent(l.id)}`} title={l.name} titleLang={lang(l.name)} ratio="16/9" asset={plate && !plate.unavailable ? plate : undefined} priority={priority}
      meta={[l.kind === 'INTERIOR' ? 'Interior' : 'Exterior', plates === 0 ? 'No plates yet' : plates === 1 ? '1 plate' : `${plates} plates`]} />
  );
}
