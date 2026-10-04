import type { Production } from './types';
import { canonical, hashString } from './hash';

/** WHAT AN APPROVAL APPROVES (docs/BACKEND-AUDIT-2026-10.md H9, step 9). The two human gates approve a definite
 *  thing, and the gate opens only while that thing is unchanged:
 *  - STORY: the story as developed — the production's logline and synopsis, and its scenes in order with what each is
 *    (title, purpose, objective, entry and exit state, place, time of day). A redeveloped story or a changed scene
 *    needs a new approval. What the stages AFTER the approval add is not the story: the script's beats and lines (and
 *    the speakers they bring into a scene), casting, shots, frames and takes do not invalidate it.
 *  - EDIT: the cut — the assembled cut's asset and the take chosen for every shot. A re-selected take, a re-assembled
 *    cut, an added or removed shot needs a new approval before the export.
 *  The hash is computed the same way in the browser (from its copy of the studio) and on the server, so a page can
 *  send the hash of what the producer actually looked at. Pure. */

export type GatedStage = 'STORY' | 'EDIT';
export const GATED_STAGES: readonly GatedStage[] = ['STORY', 'EDIT'];
export const isGatedStage = (s: string): s is GatedStage => (GATED_STAGES as readonly string[]).includes(s);

/** The approved subject's content, by stage. */
export function approvalSubject(p: Production, stage: GatedStage): unknown {
  if (stage === 'STORY') {
    return {
      logline: p.logline, synopsis: p.synopsis,
      scenes: p.scenes.map((sc) => ({ id: sc.id, title: sc.title, locationId: sc.locationId, timeOfDay: sc.timeOfDay, purpose: sc.purpose, emotionalObjective: sc.emotionalObjective, entryState: sc.entryState, exitState: sc.exitState })),
    };
  }
  return { cutAssetId: p.cutAssetId ?? null, shots: p.shots.map((sh) => ({ id: sh.id, take: sh.selectedTakeId ?? null })) };
}

/** The subject's hash: what an approval records and a gate compares. */
export const approvalSubjectHash = (p: Production, stage: GatedStage): string => hashString(canonical(approvalSubject(p, stage)));
