'use client';

import { T } from '@/lib/copy';

/** While a route's code loads: the page's frame in placeholders, and a sentence for screen readers (§5.16: no
 *  spinner without a sentence). */
export default function Loading() {
  return (
    <div aria-busy="true" className="shell-skeleton">
      <span className="sr-only" role="status">{T('shell.loading')}</span>
      <div className="shell-ph shell-skeleton-title" /><div className="shell-ph shell-skeleton-lead" />
      <div className="shell-skeleton-grid">{[0, 1, 2].map((i) => <div key={i} className="shell-ph shell-ph-wide" />)}</div>
    </div>
  );
}
