'use client';

import { Room } from '@/components/shell/Room';
import { Skeleton, SkeletonRegion } from '@/components/ui/kit';
import { DecisionCardSkeleton, SectionHeadSkeleton } from '@/components/media';

/** THE WORKSPACE WHILE IT LOADS (VISUAL-STANDARD-V5.1 §5.22; Design QA M2) — what the pages draw first, in the same
 *  classes and at the same sizes, so nothing moves when the content arrives. The map: the workspace bar, the studio
 *  line, the outline, then the status line, the flow line, "Waiting for you" (two decision cards), "On the floor"
 *  (one line), the Story (two prose lines, two facts, the approval gate's line), the breakdown table, the scenes with
 *  their shot strips, the cut and the production's facts. The shot: the canvas with its docked transport, the view
 *  switch, the status row, four takes with their verbs, the attempts, and the inspector with its three open sections.
 *  Heights that come from components the skeleton cannot draw (the transport, the picks grids) are measured from the
 *  loaded pages at 1440 and 390 (scripts/measure: see the commit) and set in workspace.css. Registered in
 *  src/components/shell/route-skeletons.tsx and each route's loading.tsx. */

const Btn = ({ width }: { width: number | string }) => <Skeleton.Block className="ws-sk-btn" width={width} height="auto" radius="pill" />;

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
      <div className="ws-panel-head"><Skeleton.Line width="4rem" /><Skeleton.Line width="3rem" /></div>
      <div className="ws-outline-body">
        <span className="ws-ol-row"><span className="ws-ol-words"><span className="ws-ol-name"><Skeleton.Line width="40%" /></span><span className="ws-ol-meta"><Skeleton.Line width="60%" /></span></span></span>
        {[0, 1].map((s) => (
          <div key={s} className="ws-ol-scene">
            <span className="ws-ol-row"><span className="ws-ol-name"><Skeleton.Line width="60%" /></span></span>
            <div className="ws-ol-shots">{[0, 1, 2, 3].map((i) => <span key={i} className="ws-ol-row ws-ol-shot"><span className="ws-ol-no"><Skeleton.Line width="1.5rem" /></span><span className="ws-ol-thumb"><Skeleton.Media ratio="16/9" /></span><span className="ws-ol-words"><span className="ws-ol-name"><Skeleton.Line width="70%" /></span><span className="ws-ol-meta"><Skeleton.Line width="80%" /></span></span></span>)}</div>
          </div>
        ))}
        <span className="ws-ol-row ws-ol-final"><span className="ws-ol-words"><span className="ws-ol-name"><Skeleton.Line width="30%" /></span><span className="ws-ol-meta"><Skeleton.Line width="50%" /></span></span></span>
      </div>
    </aside>
  );
}

const Seg = ({ options }: { options: number[] }) => <span className="seg">{options.map((w, i) => <span key={i}><Skeleton.Line width={`${w}px`} /></span>)}</span>;

export function ProductionWorkspaceSkeleton() {
  return (
    <SkeletonRegion label="Opening the production…" className="ws ws-skeleton">
      <Room value="cutting" />
      <Bar />
      <div className="ws-studioline" aria-hidden />
      <div className="ws-room" data-view="map">
        <Outline />
        <div className="ws-main ws-map">
          <p className="ws-lead"><span><Skeleton.Line width="34rem" /><span className="ws-sk-phone"><br /><Skeleton.Line width="12rem" /></span></span></p>
          <div className="ws-flow"><span><Skeleton.Line width="36rem" /></span><span className="ws-sk-phone"><Skeleton.Line width="16rem" /></span></div>

          <div className="ws-sec">
            <SectionHeadSkeleton titleWidth="9rem" />
            <ul className="ws-decisions" role="list">{[0, 1].map((i) => <li key={i}><DecisionCardSkeleton /></li>)}</ul>
          </div>

          <div className="ws-sec">
            <SectionHeadSkeleton titleWidth="7rem" />
            <p className="t-body ws-empty"><Skeleton.Line width="22rem" /></p>
          </div>

          <div className="ws-sec">
            <SectionHeadSkeleton titleWidth="4rem" />
            <div className="ws-story">
              <p className="t-lead ws-logline"><Skeleton.Line width="94%" /><br /><Skeleton.Line width="58%" /><span className="ws-sk-phone"><br /><Skeleton.Line width="90%" /><br /><Skeleton.Line width="40%" /></span></p>
              <ul className="ws-story-facts" role="list"><li className="t-meta"><Skeleton.Line width="11rem" /></li><li className="t-meta"><Skeleton.Line width="14rem" /></li></ul>
            </div>
            <div className="ws-gate" data-state="loading" />
          </div>

          <div className="ws-sec">
            <SectionHeadSkeleton titleWidth="10rem" description />
            <div className="ws-table-wrap">
              <table className="ws-table">
                <thead><tr>{['4rem', '2.5rem', '3.5rem', '6rem', '3rem'].map((w, i) => <th key={i} scope="col"><Skeleton.Line width={w} /></th>)}</tr></thead>
                <tbody>{[0, 1].map((r) => <tr key={r}>{['9rem', '1rem', '2rem', '2.5rem', '2rem'].map((w, i) => <td key={i}><Skeleton.Line width={w} /></td>)}</tr>)}</tbody>
                <tfoot><tr>{['3rem', '1rem', '5rem', '2.5rem', '3rem'].map((w, i) => <td key={i}><Skeleton.Line width={w} /></td>)}</tr></tfoot>
              </table>
            </div>
            <div className="ws-gate-foot"><span className="ws-gen"><Btn width={150} /><span className="ws-gen-why"><Skeleton.Line width="14rem" /></span></span></div>
          </div>

          <div className="ws-sec">
            <SectionHeadSkeleton titleWidth="10rem" />
            {[0, 1].map((s) => (
              <div key={s} className="ws-scene">
                <div className="ws-scene-head"><h3 className="t-title"><Skeleton.Line size="title" width="11rem" /></h3><span className="t-meta ws-slate"><span><Skeleton.Line width="13rem" /></span></span></div>
                <ul className="ws-strip" role="list" data-ratio="16/9">
                  {[0, 1, 2, 3].map((i) => (
                    <li key={i}><span className="ws-shot"><Skeleton.Media ratio="16/9" className="ws-shot-frame" /><span className="ws-shot-name"><Skeleton.Line width="70%" /></span><span className="ws-shot-purpose"><Skeleton.Line width="50%" /></span><span className="ws-shot-state"><Skeleton.Line width="40%" /></span></span></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="ws-sec">
            <SectionHeadSkeleton titleWidth="5rem" />
            <ol className="ws-cutline" role="list">{Array.from({ length: 8 }, (_, i) => <li key={i} className="sk" />)}</ol>
            <ol className="ws-versions" role="list">
              {[0, 1, 2].map((i) => <li key={i}><span className="ws-versions-n"><Skeleton.Line width="3rem" /></span><span className="ws-versions-t"><Skeleton.Line width="5rem" /></span><span className="ws-versions-d"><Skeleton.Line width="16rem" /></span><span><Skeleton.Line width="3rem" /></span></li>)}
            </ol>
          </div>

          <div className="ws-sec">
            <SectionHeadSkeleton titleWidth="11rem" />
            <div className="card pcard">
              <dl className="pcard-grid" data-cols={4}>
                {[0, 1, 2, 3].map((i) => <div key={i} className="pcard-cell"><dt className="t-label"><Skeleton.Line width="40%" /></dt><dd className="pcard-value"><Skeleton.Line width="60%" /></dd>{i === 3 && <dd className="pcard-sub"><Skeleton.Line width="50%" /></dd>}</div>)}
              </dl>
            </div>
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
      <div className="ws-studioline" aria-hidden />
      <div className="ws-room" data-view="shot">
        <Outline />
        <section className="ws-stage">
          <div className="ws-switcher"><Skeleton.Block className="ws-sk-btn" width={44} height="auto" radius="pill" /><Skeleton.Block className="ws-sk-ctl" width="auto" height="auto" radius="sm" /><Skeleton.Block className="ws-sk-btn" width={44} height="auto" radius="pill" /></div>
          <div className="ws-stage-head"><span className="ws-stage-title"><Skeleton.Line width="16rem" /></span><span className="ws-ro ws-stage-ro"><Skeleton.Line width="8rem" /></span></div>
          <div className="ws-canvas canvas"><div className="ws-sk-player"><Skeleton.Media ratio="16/9" /></div><div className="ws-sk-transport" /></div>
          <div className="ws-canvas-bar"><Seg options={[48, 88, 80]} /></div>
          <p className="ws-status ws-status-idle"><Skeleton.Line width="30rem" /></p>
          <section className="ws-takes">
            <div className="ws-sub-head"><h2 className="t-title"><Skeleton.Line size="title" width="4rem" /></h2><span className="t-meta"><Skeleton.Line width="10rem" /></span></div>
            <ul className="ws-take-row" role="list" data-ratio="16/9">
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="ws-take">
                  <span className="ws-take-frame"><Skeleton.Media ratio="16/9" /></span>
                  <span className="ws-take-name"><Skeleton.Line width="3rem" /></span>
                  <span className="t-meta"><Skeleton.Line width="5rem" /></span>
                  <span className="t-meta"><Skeleton.Line width="7rem" /></span>
                  <span className="ws-take-acts"><Btn width="100%" /><Btn width="60%" /><Skeleton.Block className="ws-sk-tick" width="50%" height="auto" radius="xs" /></span>
                </li>
              ))}
            </ul>
          </section>
          <section className="ws-attempts">
            <div className="ws-sub-head"><h2 className="t-title"><Skeleton.Line size="title" width="5rem" /></h2><span className="t-meta"><Skeleton.Line width="5rem" /></span></div>
            <ol className="ws-att-list" role="list">{[0, 1, 2, 3, 4].map((i) => <li key={i}><span className="ws-att-t"><Skeleton.Line width="5rem" /></span><span className="ws-att-d"><Skeleton.Line width="60%" /></span></li>)}</ol>
          </section>
        </section>
        <aside className="ws-inspector" aria-hidden>
          <div className="ws-insp-head"><p className="t-label"><Skeleton.Line width="50%" /></p><h2 className="ws-insp-title"><Skeleton.Line size="title" width="6rem" /></h2><p className="t-meta"><Skeleton.Line width="60%" /></p></div>
          <div className="ws-gen-block">
            <Seg options={[72, 32]} />
            {[0, 1].map((i) => <span key={i} className="ws-gen"><Btn width="100%" /><span className="ws-gen-why"><Skeleton.Line width="70%" /></span></span>)}
            <details className="ws-disc ws-disc-inner"><summary className="ws-disc-sum"><Skeleton.Line width="9rem" /></summary></details>
          </div>
          <details className="ws-disc" open><summary className="ws-disc-sum"><Skeleton.Line width="10rem" /></summary><div className="ws-disc-body"><Skeleton.Block className="ws-sk-camera" width="100%" height="auto" radius="sm" /></div></details>
          <details className="ws-disc" open><summary className="ws-disc-sum"><Skeleton.Line width="11rem" /></summary><div className="ws-disc-body"><Skeleton.Block className="ws-sk-refs" width="100%" height="auto" radius="sm" /></div></details>
          <details className="ws-disc" open><summary className="ws-disc-sum"><Skeleton.Line width="10rem" /></summary><div className="ws-disc-body"><Skeleton.Block className="ws-sk-action" width="100%" height="auto" radius="sm" /></div></details>
          {[0, 1].map((i) => <details key={i} className="ws-disc"><summary className="ws-disc-sum"><Skeleton.Line width="8rem" /></summary></details>)}
          <div className="ws-insp-foot"><span className="t-meta"><Skeleton.Line width="3rem" /></span><span className="ws-actions"><Btn width={110} /></span></div>
        </aside>
      </div>
    </SkeletonRegion>
  );
}
