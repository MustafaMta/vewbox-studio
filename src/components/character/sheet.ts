import type { Character } from '@/domain/types';
import type { CharacterRefRole } from '@/domain/vocabulary';

/** WHERE A CHARACTER'S PICTURES SIT ON THE APPEARANCE TAB — pure, unit-tested (review findings 1 and 21).
 *  The ROLE is the view a tile stands for; `ref.view` is provenance (how it was drawn: 'SHEET_TILE' for a tile cut
 *  from the identity sheet, 'FACE' for the crop, else the view name) and never decides where a tile sits. */

type Ref = Character['refs'][number];

/** The identity sheet, in a fixed order; OUTFIT and anything else are "views and outfits". */
export const SHEET_VIEWS: CharacterRefRole[] = ['FRONT', 'THREE_QUARTER', 'SIDE', 'BACK', 'FULL_BODY', 'EXPRESSION'];

export const viewOf = (r: Pick<Ref, 'role'>): string => r.role;

export interface SheetLayout {
  /** one slot per sheet view, with the ref drawn for it (if any) */
  sheet: Array<{ view: CharacterRefRole; ref?: Ref }>;
  /** the face crop the sheet was drawn from (its second reference): shown beside the portrait, not as a view */
  faceCrop?: Ref;
  /** every other view and outfit — never the portrait itself, never the face crop */
  others: Ref[];
}

export function sheetLayout(c: Pick<Character, 'refs' | 'portraitAssetId'>): SheetLayout {
  const sheet = SHEET_VIEWS.map((view) => ({ view, ref: c.refs.find((r) => viewOf(r) === view) }));
  const faceCrop = c.refs.find((r) => viewOf(r) === 'FACE');
  const others = c.refs.filter((r) => !SHEET_VIEWS.includes(viewOf(r) as CharacterRefRole) && viewOf(r) !== 'FACE' && r.assetId !== c.portraitAssetId);
  return { sheet, faceCrop, others };
}
