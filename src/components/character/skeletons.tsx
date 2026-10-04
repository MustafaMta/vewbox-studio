'use client';

import { FigureCardSkeleton } from '@/components/media/Skeletons';
import { Skeleton, SkeletonRegion } from '@/components/ui/kit';

/** THE CAST'S SKELETONS (§5.22) — the directory and a profile while the studio's first snapshot loads, in their final
 *  shapes (the same classes size them). A small module of their own, so the shell can draw them synchronously on the
 *  server and the client alike (src/components/shell/route-skeletons.tsx). */

/** The directory: the head, the search field and a row of figure cards, so nothing moves when the cast arrives. */
export function CharactersSkeleton() {
  return (
    <SkeletonRegion label="Opening the cast…" className="pc-page pc-skeleton">
      <div className="pc-head">
        <div className="pc-head-words">
          <div className="t-page pc-head-title"><Skeleton.Line size="title" width="10rem" /></div>
          <div className="t-body pc-head-desc"><Skeleton.Line width="24rem" /></div>
        </div>
        <div className="pc-head-acts"><Skeleton.Block width={168} height={40} radius="pill" /></div>
      </div>
      <div className="pc-bar"><Skeleton.Block width="min(28rem, 100%)" height={40} radius="md" /></div>
      <div className="pc-grid">{Array.from({ length: 6 }, (_, i) => <div key={i}><FigureCardSkeleton /></div>)}</div>
    </SkeletonRegion>
  );
}

/** The profile: the figure at 928:1664 in its column, then the slate, the name, the role, the state, the actions and
 *  the voice row at their real sizes. */
export function CharacterSkeleton() {
  return (
    <SkeletonRegion label="Opening the character…" className="pc-page pc-skeleton">
      <div className="char">
        <div className="char-figure"><Skeleton.Media ratio="928/1664" className="char-figure-frame" /></div>
        <div className="char-main">
          <span className="pc-back"><Skeleton.Line width="6rem" /></span>
          <div className="t-meta char-slate"><Skeleton.Line width="16rem" /></div>
          <div className="t-hero char-name"><Skeleton.Line size="title" width="14rem" /></div>
          <div className="t-lead char-role"><Skeleton.Line width="80%" /></div>
          <div className="char-state"><Skeleton.Line width="10rem" /></div>
          <div className="char-acts"><Skeleton.Block width={112} height={40} radius="pill" /><Skeleton.Block width={104} height={40} radius="pill" /><Skeleton.Block width={128} height={40} radius="pill" /></div>
          <div className="char-voice"><Skeleton.Block width="100%" height={64} radius="md" /></div>
        </div>
      </div>
    </SkeletonRegion>
  );
}
