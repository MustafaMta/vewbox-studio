import type { Asset } from './types';

/** The people count recorded on a drawn shot frame (src/worker/handlers/images.ts drawShotFrame): how many people the
 *  vision model counted against how many the shot has. Absent when the frame was not counted (no vision model, an
 *  uploaded frame, a frame from before the count was kept). Read by the preflight (a failed count is never filmed
 *  from) and the shot page (shown beside the frame). */
export interface FrameCheck { expected: number; counted: number; ok: boolean }
export function frameCheckOf(a: Pick<Asset, 'provenance'> | undefined): FrameCheck | undefined {
  const pc = a?.provenance?.peopleCheck as { expected?: unknown; counted?: unknown; ok?: unknown } | undefined;
  return pc && typeof pc.expected === 'number' && typeof pc.counted === 'number' ? { expected: pc.expected, counted: pc.counted, ok: pc.ok === true } : undefined;
}
