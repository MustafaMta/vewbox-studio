'use client';

import { Skeleton, SkeletonRegion } from '@/components/ui/kit';
import { HeadSkeleton, SectionHeadSkeleton } from '@/components/studio/parts';

/** Settings while the studio opens (§5.22): the head and the four panels of rows at their real sizes. A small module
 *  of its own, so the shell can draw it synchronously on the server and the client alike. */
export function SettingsSkeleton() {
  return (
    <SkeletonRegion label="Opening Settings…" className="cp settings">
      <HeadSkeleton />
      {[4, 8, 1, 4].map((n, k) => (
        <div key={k} className="cp-section">
          <SectionHeadSkeleton width="8rem" />
          <div className="card st-panel">{Array.from({ length: n }, (_, i) => <div key={i} className="st-row"><span className="st-row-words"><Skeleton.Line width="40%" /><Skeleton.Line width="60%" /></span><span className="st-control"><Skeleton.Block width="100%" height={40} radius="md" /></span></div>)}</div>
        </div>
      ))}
    </SkeletonRegion>
  );
}
