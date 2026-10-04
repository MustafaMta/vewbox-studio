'use client';

import { MediaCardSkeleton } from '@/components/media/Skeletons';
import { Skeleton, SkeletonRegion } from '@/components/ui/kit';

/** THE SHORTS' SKELETONS (§5.22) — the catalogue and the title page while the studio's first snapshot loads, in their
 *  final sizes (the same classes size them). A small module of their own, so the shell can draw them synchronously on
 *  the server and the client alike (src/components/shell/route-skeletons.tsx). */

/** One line box of the role it stands in (its own line height), with the placeholder bar set inside it, so a skeleton's text keeps the real line heights. */
export function SkLine({ width, height = 12, className }: { width: string; height?: number | string; className?: string }) {
  return <span className={className} style={{ display: 'block' }}><Skeleton.Block width={width} height={height} radius="media" style={{ display: 'inline-block', verticalAlign: 'top', marginBlockStart: '0.25em' }} /></span>;
}

/** The catalogue while the studio's first snapshot loads: the head and ten posters in the grid's exact sizes. */
export function ShortsSkeleton() {
  return (
    <SkeletonRegion label="Opening the shorts…" className="shorts shorts-skeleton">
      <div className="shorts-head">
        <div className="shorts-head-words">
          <div className="t-page shorts-title"><SkLine width="7rem" height="0.8em" /></div>
          <div className="t-body shorts-lead"><SkLine width="15rem" /></div>
        </div>
        <Skeleton.Block width={152} height="var(--control-h)" radius="pill" />
      </div>
      <div className="shorts-grid">
        {Array.from({ length: 10 }, (_, i) => <div key={i}><MediaCardSkeleton ratio="2/3" /></div>)}
      </div>
    </SkeletonRegion>
  );
}

/** The title page while the studio's first snapshot loads (§5.22): the head, the poster beside the player with its
 *  docked transport and the strip, in their final sizes — the same classes size them, so nothing moves. */
export function ShortSkeleton() {
  return (
    <SkeletonRegion label="Opening the film…" className="film film-skeleton">
      <div className="film-head">
        <span className="shead-link film-back"><Skeleton.Line width="4rem" /></span>
        <div className="film-head-row">
          <div className="film-words">
            <div className="film-meta"><Skeleton.Block width={64} height={22} radius="pill" /><Skeleton.Line width="18rem" /></div>
            <div className="t-display film-title"><SkLine width="min(28rem, 80%)" height="0.8em" /></div>
            <div className="t-lead film-logline"><SkLine width="92%" /><SkLine width="64%" /><SkLine width="88%" className="film-sk-phone" /><SkLine width="40%" className="film-sk-phone" /></div>
          </div>
          <div className="film-acts"><Skeleton.Block width={141} height="var(--control-h)" radius="pill" /><Skeleton.Block width={112} height="var(--control-h)" radius="pill" /></div>
        </div>
      </div>
      <div className="film-stage">
        <div className="film-poster"><Skeleton.Media ratio="2/3" className="film-poster-frame" /><span className="t-meta film-poster-cap"><Skeleton.Line width="9rem" /></span></div>
        <div className="film-screen"><div className="film-player"><Skeleton.Media ratio="16/9" className="film-player-pic" /><div className="film-transport" /></div></div>
        <div className="film-strip">
          {[1, 1].map((_, i) => (
            <div key={i} className="film-strip-scene" style={{ flexGrow: 1 }}>
              <div className="film-strip-shots">{Array.from({ length: 4 }, (_, j) => <div key={j} style={{ flexGrow: 1 }}><span className="film-strip-shot"><Skeleton.Media ratio="16/9" className="film-strip-frame" /></span></div>)}</div>
              <span className="t-meta film-strip-label"><Skeleton.Line width="8rem" /></span>
            </div>
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
}
