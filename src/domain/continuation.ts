import type { Production, Shot, Take, TakeStale } from './types';
import { orderedShots } from './timeline';

/** THE CONTINUATION CHAIN (docs/research/STORYBUILDER-INTEGRATION.md §f.5, gap V3). A continuation take is anchored
 *  on the tail of one specific take of the shot before it (`continuesTakeId`). When that shot's chosen take changes —
 *  another take chosen, the take rejected or removed, a new take accepted — every continuation downstream was made
 *  from a tail the cut no longer shows: its join would repeat frames that are not there. Such takes are STALE. The
 *  studio marks them the moment the choice changes (`reconcileContinuationChain`, run by every production change in
 *  src/domain/actions.ts), so the map can show it, PRODUCE regenerates exactly those shots in order, and the cut
 *  refuses a stale join unless told to allow it. Pure. */

const takeOf = (sh: Shot): Take | undefined => sh.takes.find((t) => t.id === sh.selectedTakeId);
/** a take that was generated as a continuation of a specific take */
export const isContinuationTake = (t: Take | undefined): t is Take & { continuesTakeId: string } => Boolean(t && t.relation === 'CONTINUATION' && t.continuesTakeId);

/** Whether a shot's chosen take is a stale continuation. */
export const continuationStale = (sh: Shot): boolean => Boolean(takeOf(sh)?.stale);

/** The shots whose chosen take is a stale continuation, in cut order. */
export const staleContinuations = (p: Production): Shot[] => orderedShots(p).filter(continuationStale);

/** What a continuation take's staleness should be now, from the shot before it in cut order: none when that shot
 *  chooses the very take it continued and that take is whole; `PREDECESSOR_RESELECTED` when it chooses another;
 *  `UPSTREAM_STALE` when it chooses the right take but that take is itself stale (the chain regenerates in order). */
export function staleVerdict(t: Take, previous: Shot | undefined, at: string): TakeStale | undefined {
  if (!isContinuationTake(t) || !previous) return undefined;
  const chosen = takeOf(previous);
  if (!chosen || chosen.id !== t.continuesTakeId) return { since: t.stale?.since ?? at, because: 'PREDECESSOR_RESELECTED', previousShotId: previous.id, expectedTakeId: chosen?.id, detail: chosen ? `shot ${previous.number} now chooses ${chosen.label} (${chosen.id}); this take continues ${t.continuesTakeId}` : `shot ${previous.number} has no chosen take; this take continues ${t.continuesTakeId}` };
  if (chosen.stale) return { since: t.stale?.since ?? at, because: 'UPSTREAM_STALE', previousShotId: previous.id, expectedTakeId: chosen.id, detail: `shot ${previous.number}'s chosen take ${chosen.label} is itself stale (${chosen.stale.because === 'UPSTREAM_STALE' ? 'further up the chain' : chosen.stale.detail}); it will be regenerated first` };
  return undefined;
}

const sameStale = (a?: TakeStale, b?: TakeStale) => (!a && !b) || Boolean(a && b && a.because === b.because && a.previousShotId === b.previousShotId && a.expectedTakeId === b.expectedTakeId && a.detail === b.detail);

/** The production with every continuation take's `stale` brought up to date against the chosen takes before it, in
 *  cut order (so a chain propagates in one pass). Returns the same object when nothing changes. A continuation across
 *  scenes is never stale (it was generated as a cut). */
export function reconcileContinuationChain(p: Production, at: string): Production {
  const ordered = orderedShots(p);
  const updated = new Map<string, Shot>();
  let changed = false;
  for (let i = 0; i < ordered.length; i++) {
    const sh = ordered[i];
    const prevRaw = i > 0 ? ordered[i - 1] : undefined;
    const previous = prevRaw && prevRaw.sceneId === sh.sceneId ? (updated.get(prevRaw.id) ?? prevRaw) : undefined;
    let shotChanged = false;
    const takes = sh.takes.map((t) => {
      if (!isContinuationTake(t)) { if (t.stale) { shotChanged = true; const { stale: _s, ...rest } = t; return rest as Take; } return t; }
      const want = staleVerdict(t, previous, at);
      if (sameStale(t.stale, want)) return t;
      shotChanged = true;
      if (!want) { const { stale: _s, ...rest } = t; return rest as Take; }
      return { ...t, stale: want };
    });
    if (shotChanged) { changed = true; updated.set(sh.id, { ...sh, takes }); }
  }
  if (!changed) return p;
  return { ...p, shots: p.shots.map((sh) => updated.get(sh.id) ?? sh) };
}
