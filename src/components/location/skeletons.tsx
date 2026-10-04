'use client';

import { MediaTileSkeleton } from '@/components/media/Skeletons';
import { Skeleton, SkeletonRegion } from '@/components/ui/kit';

/** THE LOCATIONS' SKELETONS (§5.22) — the board and a location page while the studio's first snapshot loads, at their
 *  real sizes (the same classes size them). A small module of their own, so the shell can draw them synchronously on
 *  the server and the client alike (src/components/shell/route-skeletons.tsx). */

export function LocationsSkeleton() {
  return (
    <SkeletonRegion label="Opening the locations…" className="pc-page pc-skeleton">
      <div className="pc-head">
        <div className="pc-head-words">
          <div className="t-page pc-head-title"><Skeleton.Line size="title" width="9rem" /></div>
          <div className="t-body pc-head-desc"><Skeleton.Line width="26rem" /></div>
        </div>
        <div className="pc-head-acts"><Skeleton.Block width={160} height={40} radius="pill" /></div>
      </div>
      <div className="pc-plates">{Array.from({ length: 3 }, (_, i) => <div key={i}><MediaTileSkeleton ratio="16/9" /></div>)}</div>
    </SkeletonRegion>
  );
}

/** The location page: the 2.39:1 plate, the switch, the caption and the actions at their real sizes. */
export function LocationSkeleton() {
  return (
    <SkeletonRegion label="Opening the location…" className="pc-page pc-skeleton">
      <span className="pc-back"><Skeleton.Line width="6rem" /></span>
      <div className="loc-hero">
        <Skeleton.Media ratio="2.39/1" className="loc-hero-plate" />
        <div className="loc-switch"><Skeleton.Block width={96} height={36} radius="md" /></div>
        <div className="loc-hero-caption">
          <div className="loc-hero-words">
            <div className="t-meta char-slate"><Skeleton.Line width="12rem" /></div>
            <div className="t-hero"><Skeleton.Line size="title" width="16rem" /></div>
          </div>
          <div className="loc-hero-acts"><Skeleton.Block width={88} height={40} radius="pill" /><Skeleton.Block width={168} height={40} radius="pill" /><Skeleton.Block width={40} height={40} radius="pill" /></div>
        </div>
      </div>
    </SkeletonRegion>
  );
}
