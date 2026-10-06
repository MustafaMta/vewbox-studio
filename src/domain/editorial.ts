import { RELATION_BOUNDARY, type Shot, type ShotBoundary } from './types';
import type { Transition } from './vocabulary';

/** THE EDITORIAL JOIN FOLLOWS THE BOUNDARY (QA Q3, 2026-10-06; final directive §13: "Do not use fades, dissolves or
 *  black frames to hide broken continuity"). A shot's `transition` is no longer a producer's choice: it is derived from
 *  how the shot joins the one before it —
 *  - `continuous` → EXTEND (the action carries on; the cut trims the repeated head, no visible join),
 *  - `cut` and `transition` → CUT (an intentional hard cut; a new place or time is told by its picture, not a fade);
 *  - no stated boundary: the older plan's relation decides the same way; nothing stated at all → CUT.
 *  DISSOLVE and FADE are never derived, and a stored one is replaced the next time the shot is written. Pure. */
export function editorialTransition(sh: Pick<Shot, 'boundary' | 'continuity'>): Transition {
  const boundary: ShotBoundary | undefined = sh.boundary ?? (sh.continuity?.relationToPrevious ? RELATION_BOUNDARY[sh.continuity.relationToPrevious] : undefined);
  return boundary === 'continuous' ? 'EXTEND' : 'CUT';
}

/** The shot with its editorial join derived (the reducers write every shot through this). */
export const withEditorialTransition = <T extends Pick<Shot, 'boundary' | 'continuity' | 'transition'>>(sh: T): T => {
  const transition = editorialTransition(sh);
  return sh.transition === transition ? sh : { ...sh, transition };
};
