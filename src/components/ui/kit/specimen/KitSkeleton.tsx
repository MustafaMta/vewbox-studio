'use client';

import { Skeleton, SkeletonRegion } from '@/components/ui/kit/Loading';

/** /kit while the studio's first snapshot loads (§5.22; Design QA N2): the specimen's head (title, lead, the two
 *  preference switches), its anchor row and the Foundations section's swatches, with the same classes, so the
 *  specimen arrives where its skeleton stood. A small module of its own, registered in shell/route-skeletons.tsx. */
export function KitSkeleton() {
  return (
    <SkeletonRegion label="Opening the interface kit…" className="kit-spec kit-skeleton">
      <div className="kit-spec-head">
        <div className="t-page"><Skeleton.Line size="title" width="14rem" /></div>
        <div className="t-lead"><Skeleton.Line width="min(40rem, 92%)" /></div>
        <div className="kit-spec-prefs"><Skeleton.Block width={300} height="calc(var(--control-h-sm) + 4px)" radius="sm" /><Skeleton.Block width={200} height="calc(var(--control-h-sm) + 4px)" radius="sm" /></div>
      </div>
      <div className="kit-skeleton-nav">{[96, 64, 72, 64, 88, 64].map((w, i) => <Skeleton.Block key={i} width={w} height={20} radius="xs" />)}</div>
      <div className="kit-spec-section">
        <div className="t-section"><Skeleton.Line size="title" width="10rem" /></div>
        <div className="kit-spec-lead"><Skeleton.Line width="min(36rem, 90%)" /></div>
        <div className="kit-spec-body">
          <div className="kit-spec-swatches">{Array.from({ length: 13 }, (_, i) => <div key={i} className="kit-spec-swatch"><Skeleton.Block width={40} height={40} radius="sm" /><Skeleton.Line width="6rem" /></div>)}</div>
        </div>
      </div>
    </SkeletonRegion>
  );
}
