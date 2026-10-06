'use client';

import { Skeleton, SkeletonRegion } from '@/components/ui/kit';
import { HeadSkeleton, SectionHeadSkeleton } from '@/components/studio/parts';

/** Settings while the studio opens (§5.22): the head and the panels of rows at their real sizes (engines, continuity,
 *  voices, research, motion, new work, licences, elsewhere). A small module of its own, so the shell can draw it
 *  synchronously on the server and the client alike. */
import { ENGINE_LICENCES } from '@/domain/licences';

/** rows per panel, section by section (a section with two panels lists both) */
export const SETTINGS_PANEL_ROWS: ReadonlyArray<number | readonly number[]> = [4, 4, 1, 8, 1, 4, [3, ENGINE_LICENCES.length], 1];
/** /terms while the studio opens: the head, the paragraph and the three lists at their real line counts. */
export function TermsSkeleton() {
  return (
    <SkeletonRegion label="Opening the terms…" className="cp settings terms">
      <HeadSkeleton />
      <Skeleton.Line width="80%" />
      {[8, 3, 2].map((n, k) => (
        <div key={k} className="cp-section">
          <SectionHeadSkeleton width="12rem" />
          <div className="card st-panel terms-list">{Array.from({ length: n }, (_, i) => <Skeleton.Line key={i} width={`${70 + ((i * 7) % 25)}%`} />)}</div>
        </div>
      ))}
    </SkeletonRegion>
  );
}

export function SettingsSkeleton() {
  return (
    <SkeletonRegion label="Opening Settings…" className="cp settings">
      <HeadSkeleton />
      {SETTINGS_PANEL_ROWS.map((rows, k) => (
        <div key={k} className="cp-section">
          <SectionHeadSkeleton width="8rem" />
          {(typeof rows === 'number' ? [rows] : rows).map((n, j) => <div key={j} className={j ? 'card st-panel st-credits' : 'card st-panel'}>{Array.from({ length: n }, (_, i) => <div key={i} className="st-row"><span className="st-row-words"><Skeleton.Line width="40%" /><Skeleton.Line width="60%" /></span><span className="st-control"><Skeleton.Block width="100%" height={40} radius="md" /></span></div>)}</div>)}
        </div>
      ))}
    </SkeletonRegion>
  );
}
