'use client';

import { Skeleton, SkeletonRegion } from '@/components/ui/kit';
import { HeadSkeleton, SectionHeadSkeleton } from '@/components/studio/parts';

/** Files while the studio opens (§5.22): the head, the bar, and an owner block of figures and one of 16:9 stills. A
 *  small module of its own, so the shell can draw it synchronously on the server and the client alike. */
export function FilesSkeleton() {
  return (
    <SkeletonRegion label="Opening Files…" className="cp files">
      <HeadSkeleton />
      <div className="fl-bar"><Skeleton.Block width="100%" height={40} radius="md" className="fl-search" /><Skeleton.Block width={360} height={36} radius="md" /><Skeleton.Block width={420} height={36} radius="md" /></div>
      <p className="t-meta fl-count"><Skeleton.Line width="6rem" /></p>
      <div className="cp-section">
        <SectionHeadSkeleton width="9rem" />
        <div className="fl-owner"><span className="t-title fl-owner-h"><Skeleton.Line width="8rem" /></span><div className="fl-grid" data-shape="figure">{Array.from({ length: 6 }, (_, i) => <Skeleton.Tile key={i} ratio="928/1664" />)}</div></div>
      </div>
      <div className="cp-section">
        <SectionHeadSkeleton width="9rem" />
        <div className="fl-owner"><span className="t-title fl-owner-h"><Skeleton.Line width="8rem" /></span><div className="fl-grid" data-shape="wide">{Array.from({ length: 4 }, (_, i) => <Skeleton.Tile key={i} ratio="16/9" />)}</div></div>
      </div>
    </SkeletonRegion>
  );
}
