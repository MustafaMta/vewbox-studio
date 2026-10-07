import type { Asset } from './types';

/** The people count recorded on a drawn shot frame (src/worker/handlers/images.ts drawShotFrame): how many people the
 *  vision model counted against how many the shot has. Absent when the frame was not counted (no vision model, an
 *  uploaded frame, a frame from before the count was kept). Read by the preflight (a failed count is never filmed
 *  from) and the shot page (shown beside the frame). */
export interface FrameCheck { expected: number; counted: number; ok: boolean }
/** The face of a drawn frame measured against the character's canonical image (SFace cosine, the take QA's judge):
 *  recorded when the frame was edited to the moment's expression and condition, which can move a face. FAIL is never
 *  filmed from; REVIEW is shown beside the frame. */
export interface FrameIdentity { characterId: string; median: number | null; verdict: 'PASS' | 'REVIEW' | 'FAIL' | 'NOT_MEASURED' }
export function frameIdentityOf(a: Pick<Asset, 'provenance'> | undefined): FrameIdentity | undefined {
  const x = a?.provenance?.identityCheck as { characterId?: unknown; median?: unknown; verdict?: unknown } | undefined;
  return x && typeof x.characterId === 'string' && typeof x.verdict === 'string' ? { characterId: x.characterId, median: typeof x.median === 'number' ? x.median : null, verdict: x.verdict as FrameIdentity['verdict'] } : undefined;
}

export function frameCheckOf(a: Pick<Asset, 'provenance'> | undefined): FrameCheck | undefined {
  const pc = a?.provenance?.peopleCheck as { expected?: unknown; counted?: unknown; ok?: unknown } | undefined;
  return pc && typeof pc.expected === 'number' && typeof pc.counted === 'number' ? { expected: pc.expected, counted: pc.counted, ok: pc.ok === true } : undefined;
}
