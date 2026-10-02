'use client';

import Link from 'next/link';
import type { AgentDef, AgentStat } from '@/studio/org';
import { useT } from '@/components/ui/locale';
import { Badge, Status, cls } from '@/components/ui/kit';
import { DEPT_ICON } from './Orchestrator';
import { fmtMs, pct } from './org';
import { fmtAgo } from '@/lib/format';

/** A team member's card: name and professional role first, what they run on, what they have actually done.
 *  The director's card carries the gold rule of the hierarchy. A supervisory agent says that it executes no
 *  job of its own rather than showing invented work. */
export function AgentCard({ a, stat, director }: { a: AgentDef; stat?: AgentStat; director?: boolean }) {
  const T = useT();
  const Icon = DEPT_ICON[a.department];
  const executes = a.jobTypes.length > 0;
  const tone = !stat || stat.runs === 0 ? 'neutral' : stat.running ? 'info' : stat.failed && stat.failed >= stat.completed ? 'bad' : stat.failed ? 'warn' : 'ok';
  const initials = a.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('');
  return (
    <li className="min-w-0">
      <Link href={`/studio/agents/${a.id}`} className={cls('card card-hover group flex h-full flex-col gap-3 p-4', director && 'org-director')}>
        <div className="flex items-start gap-3">
          <span className={cls('org-node-circle org-node-circle-sm flex-none text-[13px] font-semibold', director && '!border-[var(--gold-line)] !text-[var(--gold)]')} aria-hidden>{Icon ? <Icon className="size-4" /> : initials}{stat?.running ? <span className="org-node-pulse" /> : null}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="truncate text-[14px] font-semibold text-fg">{a.name}</span>{director && <Badge tone="accent" className="!border-[var(--gold-line)] !bg-[var(--gold-soft)] !text-[var(--gold)]">{T('studio.director')}</Badge>}</div>
            <p className="mt-0.5 text-[12.5px] text-muted" dir="auto">{a.role}</p>
          </div>
          <Status tone={tone} live={Boolean(stat?.running)} className="flex-none">{stat?.running ? T('jobs.running') : stat && stat.runs > 0 ? fmtAgo(stat.lastRunAt ?? '', T.locale) : T('studio.neverRan')}</Status>
        </div>
        <p className="line-clamp-2 text-[12.5px] leading-relaxed text-faint" dir="auto">{a.description}</p>
        <div className="mt-auto space-y-1.5 text-[11.5px] text-faint">
          <p className="truncate"><span className="text-muted">{T('studio.model')}:</span> <span className="font-latin text-body">{a.model}</span></p>
          <p className="truncate">{executes ? <><span className="text-muted">{T('studio.jobTypes')}:</span> {a.jobTypes.length} · {a.tools.length} {T('studio.tools').toLowerCase()} · {a.skills.length} {T('studio.skills').toLowerCase()}</> : <span>{T('studio.advisory').split(':')[0]} · {a.tools.length} {T('studio.tools').toLowerCase()}</span>}</p>
          {stat && stat.runs > 0 && <p className="num"><span className="text-fg">{stat.runs}</span> {T('studio.runs').toLowerCase()} · {pct(stat.firstAttemptOk, stat.firstAttempts)} {T('studio.firstAttempt').toLowerCase()} · {fmtMs(stat.p50Ms)}</p>}
        </div>
      </Link>
    </li>
  );
}
