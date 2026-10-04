'use client';

import { MediaCardSkeleton, PanelCardSkeleton, SectionHeadSkeleton } from '@/components/media/Skeletons';
import { Skeleton, SkeletonRegion } from '@/components/ui/kit';

/** THE MUSIC VIDEOS' SKELETONS (§5.22) — the catalogue and the title page while the studio's first snapshot loads,
 *  in their exact shapes (the same classes size them). A small module of their own, so the shell can draw them
 *  synchronously on the server and the client alike (src/components/shell/route-skeletons.tsx). */

/** The catalogue while the studio's first snapshot loads: the head and a full first screen of sleeves. */
export function MusicVideosSkeleton() {
  return (
    <SkeletonRegion label="Opening the music videos…" className="mv-cat mv-sk">
      <div className="mv-cat-head">
        <div className="mv-cat-words">
          <div className="t-page mv-cat-title"><Skeleton.Line size="title" width="11rem" /></div>
          <div className="t-body mv-cat-desc"><Skeleton.Line width="14rem" /></div>
        </div>
        <Skeleton.Block className="mv-new" width={176} height={40} radius="pill" />
      </div>
      <div className="mv-grid">
        {Array.from({ length: 10 }, (_, i) => <div key={i}><MediaCardSkeleton ratio="1/1" /></div>)}
      </div>
    </SkeletonRegion>
  );
}

/** The title page while the studio's first snapshot loads: the hero (sleeve, words, audio row, actions) and the
 *  lyrics beside the facts and the cast, in their final sizes. */
export function MusicVideoSkeleton() {
  return (
    <SkeletonRegion label="Opening the music video…" className="hero mv-page mv-sk">
      <div className="mv-hero">
        <div className="t-body mv-back"><Skeleton.Line width="7rem" /></div>
        <div className="mv-head">
          <div className="mv-sleeve"><Skeleton.Media ratio="1/1" className="mv-sleeve-frame" /></div>
          <div className="mv-words">
            <div className="t-meta mv-meta"><Skeleton.Line width="16rem" /></div>
            <div className="t-display mv-title"><Skeleton.Line size="title" width="60%" /></div>
            <div className="mv-performers"><Skeleton.Line width="10rem" /></div>
            <Skeleton.Block className="mv-transport mv-sk-transport" width="100%" radius="md" style={{ blockSize: undefined }} />
            <div className="mv-acts"><Skeleton.Block width={128} height={40} radius="pill" /><Skeleton.Block width={176} height={40} radius="pill" /></div>
          </div>
        </div>
      </div>
      <div className="mv-body">
        <div className="mv-lyrics">
          <SectionHeadSkeleton titleWidth="5rem" description />
          <div className="mv-sections">
            {[3, 2, 2].map((n, i) => (
              <div key={i} className="mv-sec">
                <div className="mv-sec-head"><Skeleton.Line width="9rem" /></div>
                <div className="mv-sec-lines">{Array.from({ length: n }, (_, k) => <div key={k} className="lyric mv-line"><Skeleton.Line width={k % 2 ? '52%' : '70%'} /></div>)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="mv-side">
          <PanelCardSkeleton title cells={6} className="mv-facts" />
        </div>
      </div>
    </SkeletonRegion>
  );
}
