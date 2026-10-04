'use client';

import { FigureCardSkeleton, MediaTileSkeleton, SectionHeadSkeleton } from '@/components/media/Skeletons';
import { Skeleton, SkeletonRegion } from '@/components/ui/kit';

/** THE SHOWS' SKELETONS (§5.22) — the catalogue, a show, a season and an episode's lobby while the studio's first
 *  snapshot loads, in their final sizes (the same classes size them). A small module of their own, so the shell can
 *  draw them synchronously on the server and the client alike (src/components/shell/route-skeletons.tsx). */

/** The backdrop and caption while loading, in their final sizes. */
export function BackdropSkeleton({ poster }: { poster?: boolean }) {
  return (
    <section className="show-hero">
      <div className="show-hero-frame"><Skeleton.Block width="100%" height="100%" radius="lg" /></div>
      <div className="show-caption" data-poster={poster ? '' : undefined}>
        {poster && <div className="show-poster"><Skeleton.Media ratio="2/3" /></div>}
        <div className="show-caption-words">
          <div className="t-meta"><Skeleton.Line width="18rem" /></div>
          <div className="t-hero"><Skeleton.Line size="title" width="14rem" /></div>
          <div className="t-lead"><Skeleton.Line width="26rem" /></div>
        </div>
        <div className="show-acts"><Skeleton.Block width={120} height={40} radius="pill" /><Skeleton.Block width={200} height={40} radius="pill" /></div>
      </div>
    </section>
  );
}

export function EpisodeGridSkeleton({ n = 3 }: { n?: number }) {
  return (
    <div className="shows-grid">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="ep-tile">
          <Skeleton.Media ratio="16/9" />
          <span className="ep-tile-words">
            <span className="t-label"><Skeleton.Line width="30%" /></span>
            <span className="t-card"><Skeleton.Line width="60%" /></span>
            <span className="t-body ep-tile-syn"><Skeleton.Line width="92%" /> <Skeleton.Line width="70%" /></span>
            <span className="t-meta ep-tile-stage"><Skeleton.Line width="40%" /></span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** /shows while the studio's first snapshot loads: the head, then a 3 · 2 · 1 grid of key-art tiles in their final
 *  sizes (the same classes size them). */
export function ShowsSkeleton() {
  return (
    <SkeletonRegion label="Opening the shows…" className="shows shows-skeleton">
      <div className="shows-page-head">
        <div className="shows-page-title">
          <div className="t-page"><Skeleton.Line size="title" width="7rem" /></div>
          <div className="t-body"><Skeleton.Line width="22rem" /></div>
        </div>
        <div className="shows-page-acts"><Skeleton.Block width={144} height={40} radius="pill" /></div>
      </div>
      <div className="shows-grid">
        {Array.from({ length: 6 }, (_, i) => <div key={i}><MediaTileSkeleton ratio="16/9" /></div>)}
      </div>
    </SkeletonRegion>
  );
}

/** A show page while the studio's first snapshot loads: the backdrop and caption, the episodes head, the season
 *  control and a row of episode tiles, the cast head and a line of figures — all in their final sizes. */
export function ShowSkeleton() {
  return (
    <SkeletonRegion label="Opening the show…" className="shows show-page shows-skeleton">
      <BackdropSkeleton />
      <div className="shows-section">
        <SectionHeadSkeleton titleWidth="7rem" />
        <div className="show-seasons"><Skeleton.Block width={200} height={36} radius="sm" /></div>
        <p className="t-body show-arc"><Skeleton.Line width="40rem" /> <Skeleton.Line width="12rem" /></p>
        <EpisodeGridSkeleton />
      </div>
      <div className="shows-section">
        <SectionHeadSkeleton titleWidth="4rem" description />
        <div className="show-figures">{Array.from({ length: 6 }, (_, i) => <div key={i}><FigureCardSkeleton /></div>)}</div>
      </div>
    </SkeletonRegion>
  );
}

/** A season page while the studio's first snapshot loads: the back link, the head and a row of episode tiles. */
export function SeasonSkeleton() {
  return (
    <SkeletonRegion label="Opening the season…" className="shows season-page shows-skeleton">
      <div className="page-back"><Skeleton.Line width="8rem" /></div>
      <div className="shows-page-head">
        <div className="shows-page-title">
          <div className="t-label"><Skeleton.Line width="4rem" /></div>
          <div className="t-page"><Skeleton.Line size="title" width="14rem" /></div>
          <div className="t-meta"><Skeleton.Line width="12rem" /></div>
        </div>
        <div className="shows-page-acts"><Skeleton.Block width={40} height={40} radius="pill" /><Skeleton.Block width={136} height={40} radius="pill" /></div>
      </div>
      <div className="shows-section shows-section-first"><EpisodeGridSkeleton /></div>
    </SkeletonRegion>
  );
}

/** The six production steps of an episode (STAGE_ORDER in src/studio/selectors.ts), as cards. */
const STEPS = 6;

/** An episode lobby while the studio's first snapshot loads: the back link, the still and its caption, and the six
 *  production steps, in their final sizes. */
export function EpisodeSkeleton() {
  return (
    <SkeletonRegion label="Opening the episode…" className="shows episode-page shows-skeleton">
      <div className="page-back"><Skeleton.Line width="10rem" /></div>
      <BackdropSkeleton />
      <div className="shows-section">
        <SectionHeadSkeleton titleWidth="8rem" description />
        <div className="ep-steps">{Array.from({ length: STEPS }, (_, i) => <Skeleton.Block key={i} className="ep-step" width="100%" height="auto" radius="md" />)}</div>
      </div>
      <div className="shows-section">
        <SectionHeadSkeleton titleWidth="5rem" />
        <div className="t-prose ep-story-skeleton"><Skeleton.Line width="96%" /><Skeleton.Line width="88%" /><Skeleton.Line width="64%" /></div>
      </div>
    </SkeletonRegion>
  );
}
