'use client';

import { Skeleton, SkeletonRegion } from '@/components/ui/kit';

/** The page's frame while the studio opens or a route's code loads: a calm layout skeleton — a page title, a lead
 *  line, a row of filters and a grid of 16:9 frames with their names — on the placeholder tone, no spinner. The
 *  region says once, for assistive technology, what it waits for. */
export function ShellSkeleton({ label = 'Loading the page…' }: { label?: string }) {
  return (
    <SkeletonRegion label={label} className="shell-skeleton">
      <div className="shell-skeleton-head">
        <Skeleton.Line size="title" width="min(16rem, 60%)" />
        <Skeleton.Line size="body" width="min(28rem, 85%)" />
      </div>
      <div className="shell-skeleton-bar">
        {[72, 96, 84, 64].map((w) => <Skeleton.Block key={w} width={w} height={30} radius="pill" />)}
      </div>
      <div className="shell-skeleton-grid">
        {Array.from({ length: 8 }, (_, i) => <Skeleton.Tile key={i} ratio="16/9" />)}
      </div>
    </SkeletonRegion>
  );
}
