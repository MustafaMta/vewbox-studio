'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { agentName, deptName, type OrgAgent, type OrgDepartment, type StudioEventRow } from '@/studio/org';
import { useStudio } from '@/studio/store';
import { productionHref } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { cls } from '@/components/ui/kit';
import { fmtAgo } from '@/lib/format';

/** THE STUDIO'S ACTIVITY — what happened, who did it, where, as rows on the ground; an empty record is one honest
 *  sentence. (People, figures and internals live in people.tsx and internals.tsx.) */

export { fmtMs, pct } from './people';

export function ActivityFeed({ events, agents, departments, compact, empty }: { events: StudioEventRow[]; agents: OrgAgent[]; departments: OrgDepartment[]; compact?: boolean; empty?: ReactNode }) {
  const T = useT();
  const { state } = useStudio();
  if (!events.length) return <p className="py-2 text-[14px] text-muted">{empty ?? T('studio.activity.empty')}</p>;
  return (
    <ol className={cls('rows', compact ? 'text-sm' : 'text-[14px]')}>
      {events.map((e) => {
        const a = e.agentId ? agents.find((x) => x.id === e.agentId) : undefined;
        const d = departments.find((x) => x.id === e.departmentId);
        const p = e.productionId ? state.productions.find((x) => x.id === e.productionId) : undefined;
        const tone = /FAILED|REJECT|INVALID|REFUSED/.test(e.kind) ? 'bg-bad' : /REVIEW|AWAITING/.test(e.kind) ? 'bg-warn' : /STARTED/.test(e.kind) ? 'bg-accent' : 'bg-faint';
        return (
          <li key={e.id} className="flex gap-3 py-3">
            <span className={cls('dot mt-2', tone)} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-body" dir="auto">{e.message}</p>
              <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-faint">
                <span className="num">{fmtAgo(e.at, T.locale)}</span>
                {a ? <Link href={`/studio/agents/${a.id}`} className="hover:text-fg" dir="auto">{agentName(a, T.locale)}</Link> : null}
                {d ? <Link href={`/studio/departments/${d.id}`} className="hover:text-fg" dir="auto">{deptName(d, T.locale)}</Link> : null}
                {p ? <Link href={productionHref(p)} className="hover:text-fg" dir="auto">{p.title}</Link> : null}
                {e.jobId ? <Link href={`/production?job=${e.jobId}`} className="hover:text-fg">{T('jobs.details')}</Link> : null}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
