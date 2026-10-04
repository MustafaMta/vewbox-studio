'use client';

import { FeaturedCardSkeleton, ShelfSkeleton, ToolCardSkeleton } from '@/components/media/Skeletons';
import { Skeleton, SkeletonRegion } from '@/components/ui/kit';

/** Home while the studio's first snapshot loads (§5.22): the banner, the featured row and the shelves in their final
 *  shapes and sizes (the same classes size them), so nothing moves when the content arrives. Its own small module, so
 *  the shell draws it synchronously on the server and the client alike (src/components/shell/route-skeletons.tsx). */
export function HomeSkeleton() {
  return (
    <SkeletonRegion label="Opening the studio…" className="home home-skeleton">
      <section className="home-hero">
        <Skeleton.Block className="home-hero-frame" width="100%" height="auto" radius="lg" />
        <div className="home-hero-caption">
          <div className="home-hero-words">
            <div className="home-hero-title"><Skeleton.Line size="title" width="16rem" /></div>
            {/* the badge (22) and the slate, the two buttons at the control height: 44 on a coarse pointer (QA p4) */}
            <div className="t-meta home-hero-meta"><Skeleton.Block width={64} height={22} radius="pill" /><Skeleton.Line width="16rem" /></div>
          </div>
          <div className="home-hero-acts"><Skeleton.Block width={128} height="var(--control-h)" radius="pill" /><Skeleton.Block width={112} height="var(--control-h)" radius="pill" /></div>
        </div>
      </section>
      <div className="home-feature">
        <FeaturedCardSkeleton thumbs={4} />
        <div className="home-tools">{Array.from({ length: 6 }, (_, i) => <ToolCardSkeleton key={i} />)}</div>
      </div>
      <ShelfSkeleton kind="wide" count={4} />
      <ShelfSkeleton kind="poster" count={6} />
      <ShelfSkeleton kind="sleeve" count={5} />
      <ShelfSkeleton kind="figure" count={7} />
    </SkeletonRegion>
  );
}
