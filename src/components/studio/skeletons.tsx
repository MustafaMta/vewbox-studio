'use client';

import { RING } from '@/studio/company';
import { PanelCardSkeleton } from '@/components/media/Skeletons';
import { Skeleton, SkeletonRegion } from '@/components/ui/kit';
import { HeadSkeleton, RowsSkeleton, SectionHeadSkeleton } from './parts';

/** THE STUDIO COMPANY'S SKELETONS (§5.22) — the company, a department and an agent while their records load, at their
 *  real sizes (the same classes size them). A small module of their own, so the shell can draw them synchronously on
 *  the server and the client alike (src/components/shell/route-skeletons.tsx). */

/** The company while its record loads: the head, the state line, the ring's stage and the inspector at their real
 *  sizes (the spine on phones), then the sections' heads and rows. */
export function StudioCompanySkeleton() {
  return (
    <SkeletonRegion label="Reading the company record…" className="cp company">
      <HeadSkeleton />
      <div className="card co-state"><Skeleton.Line width="min(28rem, 80%)" /></div>
      <div className="co-grid">
        <div className="card co-stage"><div className="co-frame"><Skeleton.Block width="100%" height="100%" radius="lg" className="co-frame-sk" /></div><p className="t-meta co-legend"><Skeleton.Line width="70%" /></p></div>
        <div className="card co-inspector"><Skeleton.Line width="40%" /><span className="t-title co-insp-title"><Skeleton.Line size="title" width="70%" /></span><Skeleton.Text lines={3} /></div>
      </div>
      <div className="co-spine">
        <div className="card co-spine-orch"><Skeleton.Text lines={3} /></div>
        <div className="co-spine-list">{RING.map((id) => <div key={id} className="card co-spine-row"><span className="co-disc" /><span className="co-spine-words"><Skeleton.Line width="60%" /><Skeleton.Line width="30%" /></span></div>)}</div>
      </div>
      <div className="cp-section"><SectionHeadSkeleton width="8rem" /><RowsSkeleton n={1} /></div>
      <div className="cp-section"><SectionHeadSkeleton width="10rem" /><RowsSkeleton n={6} /></div>
    </SkeletonRegion>
  );
}

/** The department while its record loads: head, facts panel, place, members grid and the work rows. */
export function DepartmentSkeleton() {
  return (
    <SkeletonRegion label="Reading the department’s record…" className="cp dept">
      <HeadSkeleton back kicker />
      <PanelCardSkeleton cells={4} className="cp-facts" />
      <div className="cp-section"><SectionHeadSkeleton width="12rem" /><div className="card dp-place"><Skeleton.Text lines={2} /></div></div>
      <div className="cp-section"><SectionHeadSkeleton width="11rem" /><div className="dp-members">{Array.from({ length: 3 }, (_, i) => <div key={i} className="card dp-agent"><Skeleton.Line width="30%" /><Skeleton.Line width="60%" /><Skeleton.Text lines={2} /></div>)}</div></div>
      <div className="cp-section"><SectionHeadSkeleton width="5rem" /><RowsSkeleton n={4} /></div>
    </SkeletonRegion>
  );
}

export function AgentSkeleton() {
  return (
    <SkeletonRegion label="Reading the agent’s record…" className="cp agent">
      <HeadSkeleton back kicker />
      <PanelCardSkeleton cells={4} className="cp-facts" />
      <div className="cp-section"><SectionHeadSkeleton width="9rem" /><div className="pcard"><Skeleton.Text lines={3} /></div></div>
      <div className="cp-section"><SectionHeadSkeleton width="5rem" /><RowsSkeleton n={5} /></div>
    </SkeletonRegion>
  );
}
