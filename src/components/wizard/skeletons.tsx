'use client';

import { usePathname } from 'next/navigation';
import { ToolCardSkeleton } from '@/components/media/Skeletons';
import { Skeleton, SkeletonRegion } from '@/components/ui/kit';
import { KIND_INFO, type CreateKind } from './model';

/** THE CREATION PAGES' SKELETONS (§5.22) — the hub and the flow while the studio's first snapshot loads, at their real
 *  sizes (the same classes size them). A small module of their own, so the shell can draw them synchronously on the
 *  server and the client alike (src/components/shell/route-skeletons.tsx). */

/** The hub while the studio's first snapshot loads: the head and the two grids of start cards at their real sizes. */
export function CreateHubSkeleton() {
  return (
    <SkeletonRegion label="Opening the studio…" className="create-hub create-skeleton">
      <div className="create-hub-head"><span className="t-page"><Skeleton.Line size="title" width="8rem" /></span><span className="t-lead"><Skeleton.Line width="28rem" /></span></div>
      {[3].map((count) => (
        <div key={count} className="create-hub-section">
          <div className="create-hub-shead"><span className="t-section"><Skeleton.Line size="title" width="7rem" /></span><span className="t-body"><Skeleton.Line width="20rem" /></span></div>
          <div className="create-hub-grid" data-count={count}>
            {Array.from({ length: count }, (_, i) => (
              <div key={i}>
                <div className="card create-start">
                  <div className="create-start-stage" />
                  <div className="create-start-words"><span className="t-card"><Skeleton.Line width="40%" /></span><span className="t-body create-start-line"><Skeleton.Line width="80%" /></span><span className="t-meta"><Skeleton.Line width="30%" /></span></div>
                  <div className="create-start-acts"><Skeleton.Block width={84} height="var(--control-h-sm)" radius="pill" /></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="create-hub-section">
        <div className="create-hub-shead"><span className="t-section"><Skeleton.Line size="title" width="9rem" /></span><span className="t-body"><Skeleton.Line width="16rem" /></span></div>
        <div className="create-hub-tools"><div><ToolCardSkeleton /></div><div><ToolCardSkeleton /></div></div>
      </div>
    </SkeletonRegion>
  );
}

/** The flow while the studio's first snapshot loads: the head, the switch, two panels and the preview in their real
 *  sizes (the same classes size them). */
export function CreateFlowSkeleton() {
  const pathname = usePathname() ?? '';
  const k = pathname.split('/')[2] ?? 'short';
  const ratio = KIND_INFO[k as CreateKind]?.ratio ?? '2/3';
  return (
    <SkeletonRegion label="Opening the studio…" className="create create-skeleton">
      <div className="create-head">
        <span className="create-back"><Skeleton.Line width="5rem" /></span>
        <div className="create-title-row"><span className="create-glyph" /><span className="t-page create-title"><Skeleton.Line size="title" width="12rem" /></span></div>
        <span className="t-lead create-lead"><Skeleton.Line width="22rem" /></span>
        <div className="create-mode"><Skeleton.Block width={176} height={36} radius="md" /><span className="t-meta create-mode-hint"><Skeleton.Line width="18rem" /></span></div>
      </div>
      <div className="create-body">
        <div className="create-main">
          <div className="create-flow">
            <Skeleton.Block className="create-panel" width="100%" height={280} radius="md" />
            <Skeleton.Block className="create-panel" width="100%" height={200} radius="md" />
          </div>
        </div>
        <div className="create-aside"><div className="create-preview-card"><span className="t-label"><Skeleton.Line width="4rem" /></span><div className="create-preview-frame" data-ratio={ratio}><Skeleton.Media ratio={ratio} /></div></div></div>
      </div>
    </SkeletonRegion>
  );
}
