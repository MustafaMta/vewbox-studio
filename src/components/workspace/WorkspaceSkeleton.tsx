'use client';

import { Room } from '@/components/shell/Room';
import { Skeleton, SkeletonRegion } from '@/components/ui/kit';

/** THE WORKSPACE WHILE IT LOADS (VISUAL-STANDARD-V5.1 §5.22) — the cutting room's real panels at their real sizes, built
 *  from the same classes as the pages: the workspace bar (64), the outline (280) with its rows, and either the map's
 *  sections (lead line, flow, shot strips at 16:9) or the shot's canvas, takes and the inspector (360). Nothing moves
 *  when the content arrives. Registered in src/components/shell/route-skeletons.tsx. */

function Bar() {
  return (
    <header className="ws-bar">
      <Skeleton.Block width={32} height={32} radius="pill" />
      <Skeleton.Block width={32} height={48} radius="md" className="ws-bar-thumb" />
      <span className="ws-bar-title"><Skeleton.Line size="title" width="9rem" /><Skeleton.Line width="7rem" /></span>
      <span className="ws-pipe">{[56, 64, 108, 96, 80, 84].map((w, i) => <Skeleton.Block key={i} width={w} height={32} radius="pill" />)}</span>
      <span className="ws-bar-end"><Skeleton.Block width={104} height={32} radius="pill" /></span>
    </header>
  );
}

function Outline() {
  return (
    <aside className="ws-outline" aria-hidden>
      <div className="ws-panel-head"><Skeleton.Line width="4rem" /></div>
      <div className="ws-outline-body">
        <span className="ws-ol-row"><Skeleton.Line width="70%" /></span>
        {[0, 1].map((s) => (
          <div key={s} className="ws-ol-scene">
            <span className="ws-ol-row"><Skeleton.Line width="60%" /></span>
            <div className="ws-ol-shots">{[0, 1, 2, 3].map((i) => <span key={i} className="ws-ol-row ws-ol-shot"><span className="ws-ol-thumb"><Skeleton.Media ratio="16/9" /></span><Skeleton.Text lines={2} /></span>)}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}

export function ProductionWorkspaceSkeleton() {
  return (
    <SkeletonRegion label="Opening the production…" className="ws ws-skeleton">
      <Room value="cutting" />
      <Bar />
      <div className="ws-room" data-view="map">
        <Outline />
        <div className="ws-main">
          <p className="ws-lead"><Skeleton.Line width="28rem" /></p>
          <div className="ws-flow"><Skeleton.Line width="36rem" /></div>
          <div className="ws-sec">
            <div className="shead"><div className="shead-row"><div className="shead-start"><span className="t-section"><Skeleton.Line size="title" width="10rem" /></span></div></div></div>
            <div className="ws-decisions">{[0, 1].map((i) => <Skeleton.Block key={i} width="100%" height={315} radius="md" />)}</div>
          </div>
          <div className="ws-sec">
            <div className="shead"><div className="shead-row"><div className="shead-start"><span className="t-section"><Skeleton.Line size="title" width="12rem" /></span></div></div></div>
            {[0, 1].map((s) => (
              <div key={s} className="ws-scene">
                <div className="ws-scene-head"><span className="t-title"><Skeleton.Line size="title" width="12rem" /></span></div>
                <div className="ws-strip">{[0, 1, 2, 3].map((i) => <span key={i} className="ws-shot"><Skeleton.Media ratio="16/9" /><span className="ws-shot-name"><Skeleton.Line width="70%" /></span><span className="ws-shot-purpose"><Skeleton.Line width="50%" /></span></span>)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonRegion>
  );
}

export function ShotWorkspaceSkeleton() {
  return (
    <SkeletonRegion label="Opening the shot…" className="ws ws-skeleton">
      <Room value="cutting" />
      <Bar />
      <div className="ws-room" data-view="shot">
        <Outline />
        <section className="ws-stage">
          <div className="ws-stage-head"><Skeleton.Line width="16rem" /></div>
          <div className="ws-canvas"><Skeleton.Media ratio="16/9" /></div>
          <div className="ws-canvas-bar"><Skeleton.Block width={300} height={36} radius="md" /></div>
          <Skeleton.Block width="100%" height={46} radius="md" />
          <div className="ws-take-row">{[0, 1, 2].map((i) => <span key={i} className="ws-take"><Skeleton.Media ratio="16/9" /><Skeleton.Line width="40%" /></span>)}</div>
        </section>
        <aside className="ws-inspector" aria-hidden>
          <div className="ws-insp-head"><Skeleton.Line width="50%" /><Skeleton.Line size="title" width="7rem" /><Skeleton.Line width="60%" /></div>
          <div className="ws-gen-block"><Skeleton.Block width={180} height={36} radius="md" /><Skeleton.Block width="100%" height={40} radius="pill" /><Skeleton.Block width="100%" height={40} radius="pill" /></div>
          {[0, 1, 2].map((i) => <div key={i} className="ws-disc"><div className="ws-disc-sum"><Skeleton.Line width="40%" /></div></div>)}
        </aside>
      </div>
    </SkeletonRegion>
  );
}
