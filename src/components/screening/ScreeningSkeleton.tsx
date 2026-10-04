'use client';

import { useSyncExternalStore } from 'react';
import { Room } from '@/components/shell/Room';
import { MediaCardSkeleton } from '@/components/media/Skeletons';
import { Skeleton, SkeletonRegion } from '@/components/ui/kit';

const subscribeNone = () => () => {};
/** `?p=` asks for the theatre; the server (and the first client render) assume it, the list is the exception. */
export function useWantsTheatre(): boolean {
  return useSyncExternalStore(subscribeNone, () => new URLSearchParams(window.location.search).has('p'), () => true);
}

/** The Screening Room while the studio's first snapshot loads (§5.22): the theatre in its exact shapes (the same
 *  classes size the stage, the docked transport, the review pane and the programme), or the poster grid for the list.
 *  A small module of its own, so the shell can draw it synchronously on the server and the client alike. */
export function ScreeningSkeleton({ view }: { view?: 'theatre' | 'list' }) {
  const wants = useWantsTheatre();
  const v = view ?? (wants ? 'theatre' : 'list');
  if (v === 'list') {
    return (
      <SkeletonRegion label="Opening the Screening Room…" className="theatre-lobby theatre-skeleton">
        <Room value="theatre" />
        <div className="theatre-lobby-head"><div className="t-page"><Skeleton.Line size="title" width="14rem" /></div><div className="t-body"><Skeleton.Line width="24rem" /></div></div>
        <div className="theatre-grid">{Array.from({ length: 6 }, (_, i) => <div key={i}><MediaCardSkeleton ratio="2/3" /></div>)}</div>
      </SkeletonRegion>
    );
  }
  return (
    <SkeletonRegion label="Opening the Screening Room…" className="theatre-room theatre-skeleton">
      <Room value="theatre" />
      <div className="theatre">
        <div className="theatre-stage">
          <div className="iplayer theatre-player" data-theatre>
            <div className="iplayer-box" style={{ aspectRatio: '16 / 9', maxBlockSize: '76vh' }} />
            <div className="ptransport"><Skeleton.Block width={36} height={36} radius="pill" /><span className="theatre-seek-sk"><Skeleton.Line width="100%" /></span></div>
          </div>
        </div>
        <div className="theatre-pane">
          <div className="theatre-tabs-wrap"><div className="tabs"><span className="tab"><Skeleton.Line width="3rem" /></span><span className="tab"><Skeleton.Line width="3rem" /></span><span className="tab"><Skeleton.Line width="3rem" /></span></div></div>
          <div className="theatre-panel">
            <div className="theatre-composer">
              <span className="theatre-composer-at t-label"><Skeleton.Line width="9rem" /></span>
              <Skeleton.Block className="theatre-composer-text" width="100%" height="auto" radius="md" />
              <div className="theatre-composer-acts"><Skeleton.Block width={140} height="var(--control-h-sm)" radius="pill" /><Skeleton.Block width={96} height="var(--control-h-sm)" radius="pill" /></div>
            </div>
          </div>
        </div>
        <div className="theatre-prog">
          <div className="t-label theatre-kicker"><Skeleton.Line width="6rem" /></div>
          <div className="theatre-prog-row"><div className="t-hero theatre-title"><Skeleton.Line size="title" width="16rem" /></div>
            <div className="theatre-prog-acts"><Skeleton.Block width={232} height="calc(var(--control-h-sm) + 4px)" radius="md" /><Skeleton.Block width={150} height="var(--control-h)" radius="pill" /><Skeleton.Block width={124} height="var(--control-h)" radius="pill" /></div></div>
          <div className="t-meta theatre-slate"><Skeleton.Line width="22rem" /></div>
          <div className="t-lead theatre-logline"><Skeleton.Line width="92%" /><Skeleton.Line width="58%" /></div>
        </div>
      </div>
    </SkeletonRegion>
  );
}
