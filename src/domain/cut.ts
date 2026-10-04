import type { Production } from './types';
import { canonical, hashString } from './hash';

/** WHAT A CUT IS MADE FROM (docs/BACKEND-AUDIT-2026-10.md M2, step 12): the shots in cut order with what each brings
 *  to the cut — its chosen take (and that take's trim), its length, its lines and their recordings, its transition,
 *  its window on the song — and the song. When this changes, an assembled cut no longer shows the production: it is
 *  stale. Notes, prompts, continuity and frames do not reach the cut. Pure. */
export function cutInputs(p: Production): unknown {
  return {
    shots: p.shots.map((sh) => {
      const take = sh.takes.find((t) => t.id === sh.selectedTakeId);
      return { id: sh.id, sceneId: sh.sceneId, take: take ? { id: take.id, assetId: take.assetId, trim: take.trimStartFrames ?? 0, soundtrack: take.soundtrack?.assetId ?? null } : null, seconds: sh.durationSeconds, transition: sh.transition, songWindow: sh.songWindow ?? null, lines: sh.dialogue.map((d) => ({ id: d.id, text: d.text, textAr: d.textAr ?? null, audio: d.audioAssetId ?? null })) };
    }),
    song: p.song?.assetId ?? null,
  };
}

export const cutInputsHash = (p: Production): string => hashString(canonical(cutInputs(p)));
