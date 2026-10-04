'use client';

import { DecisionCardSkeleton } from '@/components/media/Skeletons';
import { Skeleton, SkeletonRegion } from '@/components/ui/kit';
import { HeadSkeleton, RowsSkeleton, SectionHeadSkeleton } from '@/components/studio/parts';

/** PRODUCTION'S SKELETONS (§5.22) — the control room and its engine room while the studio opens, at their real sizes
 *  (the same classes size them). A small module of their own, so the shell can draw them synchronously on the server
 *  and the client alike (src/components/shell/route-skeletons.tsx). */

/** The six engines of EngineRoom.tsx (video, pictures, story, voices, transcription, music), one card each. */
const ENGINE_COUNT = 6;

export function EngineRoomSkeleton() {
  return (
    <div className="cp-section">
      <SectionHeadSkeleton width="9rem" />
      <div className="ctl-engines">{Array.from({ length: ENGINE_COUNT }, (_, i) => <div key={i} className="card ctl-engine"><Skeleton.Line width="40%" /><Skeleton.Line width="70%" /><Skeleton.Line width="85%" /></div>)}</div>
    </div>
  );
}

/** The history filter's row before the record is known: the four chips at their real height (32, pill), so the
 *  rows under them do not move when the counts arrive (m7). */
export function HistoryFilterSkeleton() {
  return <div className="ctl-filter" aria-hidden><div className="filter-chips">{[88, 128, 76, 96].map((w) => <Skeleton.Block key={w} width={w} height="var(--control-h-sm)" radius="pill" />)}</div></div>;
}

/** Production while the studio opens: the head, the decision cards at their real size, the running row, the history
 *  rows and the engine room. */
export function ControlRoomSkeleton() {
  return (
    <SkeletonRegion label="Opening Production…" className="cp control">
      <HeadSkeleton />
      <div className="cp-section">
        <SectionHeadSkeleton width="8rem" />
        <div className="ctl-decisions">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i}><DecisionCardSkeleton className="ctl-dcard" /></div>
          ))}
        </div>
      </div>
      <div className="cp-section"><SectionHeadSkeleton width="9rem" /><RowsSkeleton n={1} /></div>
      <div className="cp-section"><SectionHeadSkeleton width="6rem" description /><HistoryFilterSkeleton /><RowsSkeleton n={6} /></div>
      <EngineRoomSkeleton />
    </SkeletonRegion>
  );
}
