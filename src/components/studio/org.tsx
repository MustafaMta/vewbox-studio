'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { AgentDef, AgentStat, DepartmentDef, StageDef, StudioEventRow, OrgSkill, ToolDef, ReliabilitySummary } from '@/studio/org';
import { useStudio } from '@/studio/store';
import { productionHref } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { Badge, Status, cls, type Tone } from '@/components/ui/kit';
import { IconAgent, IconArrowRight, IconChevronRight, IconSkill, IconTool } from '@/components/ui/icons';
import { fmtAgo } from '@/lib/format';

/** THE STUDIO'S OWN OBJECTS — a department card, an agent row, the activity feed, the pipeline graph and the
 *  reliability figures. Everything shown is read from persisted runs, handoffs, reports and events; a figure that
 *  has nothing behind it says so instead of showing a number. */

export const fmtMs = (ms: number | null | undefined) => (ms === null || ms === undefined || !Number.isFinite(ms) ? '—' : ms < 1000 ? `${Math.round(ms)} ms` : ms < 120_000 ? `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s` : `${(ms / 60_000).toFixed(1)} min`);
export const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)} %` : '—');

const DEPT_HUES: Record<string, string> = { EXECUTIVE: 'from-violet-500/25', STORY: 'from-amber-400/20', CASTING: 'from-rose-400/20', WORLD: 'from-emerald-400/20', PREPRODUCTION: 'from-sky-400/20', VIDEO: 'from-fuchsia-400/20', SOUND: 'from-teal-400/20', POST: 'from-orange-400/20', QA: 'from-lime-400/20' };
export const deptHue = (id: string) => DEPT_HUES[id] ?? 'from-violet-500/25';

/** One department: its director, how many agents, what it owns, and what it has actually done. */
export function DepartmentCard({ d, agents, stats, events }: { d: DepartmentDef; agents: AgentDef[]; stats: AgentStat[]; events: StudioEventRow[] }) {
  const T = useT();
  const mine = agents.filter((a) => a.department === d.id);
  const director = agents.find((a) => a.id === d.directorId);
  const st = stats.filter((s) => mine.some((a) => a.id === s.agentId));
  const runs = st.reduce((n, s) => n + s.runs, 0);
  const running = st.reduce((n, s) => n + s.running, 0);
  const failed = st.reduce((n, s) => n + s.failed, 0);
  const last = events.find((e) => e.departmentId === d.id);
  return (
    <li className="min-w-0">
      <Link href={`/studio/departments/${d.id}`} className={cls('card card-hover group relative flex h-full flex-col overflow-hidden bg-gradient-to-br to-transparent', deptHue(d.id))}>
        <div className="flex flex-1 flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">{d.stages.length ? d.stages.map((s) => T.dyn(`pipeline.${s}`, s)).join(' · ') : T('studio.executive')}</p>
              <h3 className="bi mt-1 text-[17px] font-semibold tracking-[-0.01em] text-fg" dir="auto"><span>{d.name}</span>{d.nameAr && <span className="bi-ar" dir="rtl">{d.nameAr}</span>}</h3>
            </div>
            {running > 0 ? <Status tone="info" live>{running} {T('jobs.running')}</Status> : runs > 0 ? <Status tone={failed ? 'warn' : 'ok'}>{runs} {T('studio.runs').toLowerCase()}</Status> : <Status tone="neutral">{T('studio.neverRan')}</Status>}
          </div>
          <p className="line-clamp-2 text-[12.5px] leading-relaxed text-faint" dir="auto">{d.responsibility}</p>
          <div className="mt-auto space-y-1.5 text-[12px] text-muted">
            <p className="truncate"><span className="text-faint">{T('studio.director')}:</span> <span className="text-fg">{director?.name ?? d.directorId}</span> · {mine.length} {T('studio.agents').toLowerCase()}</p>
            {last ? <p className="truncate" dir="auto"><span className="text-faint">{fmtAgo(last.at, T.locale)}:</span> {last.message}</p> : <p className="text-faint">{T('studio.noData')}</p>}
          </div>
        </div>
        <IconArrowRight aria-hidden className="absolute bottom-5 end-5 size-4 text-ink-500 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100 rtl:rotate-180" />
      </Link>
    </li>
  );
}

const TONE_OF = (s?: AgentStat): Tone => (!s || s.runs === 0 ? 'neutral' : s.running ? 'info' : s.failed && s.failed >= s.completed ? 'bad' : s.failed ? 'warn' : 'ok');

/** One agent as a row: name and role, what it runs on, the real numbers. */
export function AgentRow({ a, stat, director }: { a: AgentDef; stat?: AgentStat; director?: boolean }) {
  const T = useT();
  return (
    <li>
      <Link href={`/studio/agents/${a.id}`} className="row row-hover -mx-2 flex items-center gap-3 px-2 py-2.5">
        <span className={cls('grid size-9 flex-none place-items-center rounded-xl border border-line bg-input text-muted [&>svg]:size-4', director && 'border-accent/40 text-accent')}><IconAgent /></span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2"><span className="truncate text-[13.5px] font-medium text-fg">{a.name}</span>{director && <Badge tone="accent">{T('studio.director')}</Badge>}{a.jobTypes.length === 0 && <span className="text-[11px] text-faint">{T('studio.advisory').split(':')[0]}</span>}</span>
          <span className="block truncate text-[12px] text-faint">{a.role} · <span className="font-latin">{a.model}</span></span>
        </span>
        <span className="hidden flex-none text-end text-[12px] text-muted sm:block">
          {stat && stat.runs > 0 ? <><span className="num text-fg">{stat.runs}</span> {T('studio.runs').toLowerCase()} · {pct(stat.firstAttemptOk, stat.firstAttempts)} · {fmtMs(stat.p50Ms)}</> : <span className="text-faint">{T('studio.neverRan')}</span>}
        </span>
        <Status tone={TONE_OF(stat)} live={Boolean(stat?.running)} className="flex-none">{stat?.running ? T('jobs.running') : stat && stat.runs > 0 ? (stat.lastRunAt ? fmtAgo(stat.lastRunAt, T.locale) : '') : '—'}</Status>
        <IconChevronRight aria-hidden className="size-4 flex-none text-ink-500 rtl:rotate-180" />
      </Link>
    </li>
  );
}

const KIND_TONE = (kind: string): Tone => (/FAILED|REJECT|INVALID/.test(kind) ? 'bad' : /REVIEW|AWAITING|CANCEL/.test(kind) ? 'warn' : /COMPLETED|ACCEPT|HANDOFF|APPROVED|BUILT|DRAWN|COMPOSED|ASSEMBLED|EXPORTED|RECORDED|WRITTEN|PLANNED|DEVELOPED|SHEET|PLATES|FRAME/.test(kind) ? 'ok' : /STARTED/.test(kind) ? 'info' : 'neutral');

/** The activity feed: what happened, who did it, where. */
export function ActivityFeed({ events, agents, departments, compact, empty }: { events: StudioEventRow[]; agents: AgentDef[]; departments: DepartmentDef[]; compact?: boolean; empty?: ReactNode }) {
  const T = useT();
  const { state } = useStudio();
  if (!events.length) return <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-[13px] text-faint">{empty ?? T('studio.activity.empty')}</p>;
  return (
    <ol className={cls('divide-y divide-line/70', compact ? 'text-[12.5px]' : 'text-[13px]')}>
      {events.map((e) => {
        const a = e.agentId ? agents.find((x) => x.id === e.agentId) : undefined;
        const d = departments.find((x) => x.id === e.departmentId);
        const p = e.productionId ? state.productions.find((x) => x.id === e.productionId) : undefined;
        return (
          <li key={e.id} className="flex gap-3 py-2.5">
            <span className={cls('mt-1.5 dot', `bg-${KIND_TONE(e.kind) === 'neutral' ? 'ink-500' : KIND_TONE(e.kind)}`)} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-fg" dir="auto">{e.message}</p>
              <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11.5px] text-faint">
                <span className="num">{fmtAgo(e.at, T.locale)}</span>
                {a ? <Link href={`/studio/agents/${a.id}`} className="hover:text-fg">{a.name}</Link> : null}
                {d ? <Link href={`/studio/departments/${d.id}`} className="hover:text-fg">{d.name}</Link> : null}
                {p ? <Link href={productionHref(p)} className="truncate hover:text-fg" dir="auto">{p.title}</Link> : null}
                {e.jobId ? <Link href={`/production?job=${e.jobId}`} className="font-latin hover:text-fg">{T('jobs.details')}</Link> : null}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** The pipeline as a graph: stages in order, the department that owns each, the edges, and the human gates. When
 *  statuses are given (one production), each node shows where that production stands. */
export function PipelineGraph({ stages, departments, statuses }: { stages: StageDef[]; departments: DepartmentDef[]; statuses?: Record<string, { status: string; failed?: string[] }> }) {
  const T = useT();
  const tone = (s?: string): Tone => (s === 'DONE' ? 'ok' : s === 'AWAITING_APPROVAL' ? 'warn' : s === 'REJECTED' || s === 'INVALID' ? 'bad' : s === 'READY' ? 'info' : 'neutral');
  return (
    <ol className="flex gap-2 overflow-x-auto pb-2" aria-label={T('studio.pipeline')}>
      {stages.map((s, i) => {
        const d = departments.find((x) => x.id === s.department);
        const st = statuses?.[s.id];
        return (
          <li key={s.id} className="flex flex-none items-stretch gap-2">
            <div className={cls('card w-44 bg-gradient-to-br to-transparent p-3', deptHue(s.department), st && `ring-1 ${st.status === 'DONE' ? 'ring-ok/50' : st.status === 'AWAITING_APPROVAL' ? 'ring-warn/60' : st.status === 'INVALID' || st.status === 'REJECTED' ? 'ring-bad/60' : st.status === 'READY' ? 'ring-info/50' : 'ring-transparent'}`)}>
              <p className="eyebrow !text-[0.62rem]">{i + 1} · {d?.name ?? s.department}</p>
              <p className="mt-1 text-[13.5px] font-semibold text-fg">{T.dyn(`pipeline.${s.id}`, s.name)}</p>
              <p className="mt-1 truncate text-[11px] text-faint">{s.dependsOn.length ? `${T('studio.stage.BLOCKED').toLowerCase()}: ${s.dependsOn.map((x) => T.dyn(`pipeline.${x}`, x)).join(', ')}` : '—'}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {s.approval && <Badge tone="warn">{T('studio.approvals')}</Badge>}
                {st && <Status tone={tone(st.status)}>{T.dyn(`studio.stage.${st.status}`)}</Status>}
              </div>
              {st?.failed?.length ? <p className="mt-1 truncate text-[11px] text-bad">{st.failed.join(', ')}</p> : null}
            </div>
            {i < stages.length - 1 && <span className="grid place-items-center text-ink-500" aria-hidden><IconChevronRight className="size-4 rtl:rotate-180" /></span>}
          </li>
        );
      })}
    </ol>
  );
}

/** The reliability figures, each with the count that produced it. */
export function ReliabilityPanel({ r }: { r: ReliabilitySummary }) {
  const T = useT();
  const tile = (label: string, value: string, hint: string) => (
    <div className="card px-4 py-3"><p className="text-[12px] font-medium text-muted">{label}</p><p className="num mt-2 text-[24px] font-semibold leading-none tracking-[-0.02em] text-fg">{value}</p><p className="mt-1.5 text-[11.5px] text-faint">{hint}</p></div>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tile(T('studio.firstAttempt'), pct(r.firstAttemptTechnical.ok, r.firstAttemptTechnical.total), `${r.firstAttemptTechnical.ok} / ${r.firstAttemptTechnical.total}`)}
        {tile(T('studio.firstAcceptance'), pct(r.firstAttemptCreative.accepted, r.firstAttemptCreative.total), `${r.firstAttemptCreative.accepted} / ${r.firstAttemptCreative.total} takes`)}
        {tile(T('studio.retryRate'), pct(r.retryRate.retried, r.retryRate.jobs), `${r.retryRate.retried} / ${r.retryRate.jobs} jobs`)}
        {tile(T('studio.qaRejections'), pct(r.qa.rejected, r.qa.reports), `${r.qa.rejected} / ${r.qa.reports}${r.qa.review ? ` · ${r.qa.review} review` : ''}`)}
        {tile(T('studio.exportSuccess'), pct(r.exports.ok, r.exports.total), `${r.exports.ok} / ${r.exports.total}`)}
        {tile(T('studio.perAccepted'), fmtMs(r.perAcceptedShot.meanMsPerAccepted), r.perAcceptedShot.acceptedTakes ? `${r.perAcceptedShot.acceptedTakes} accepted · ${r.perAcceptedShot.meanAttemptsPerAccepted?.toFixed(2) ?? '—'} attempts${r.perAcceptedShot.costUsdPerAccepted ? ` · $${r.perAcceptedShot.costUsdPerAccepted.toFixed(3)}` : ''}` : T('studio.noData'))}
      </div>
      <div className="card p-4">
        <p className="mb-2 text-[12.5px] font-medium text-muted">{T('studio.failureClasses')}</p>
        {r.failureClasses.length === 0 ? <p className="text-[12.5px] text-faint">{T('studio.noFailures')}</p> : (
          <ul className="flex flex-wrap gap-2">{r.failureClasses.map((c) => <li key={c.failureClass}><Badge tone={c.resolved === c.count ? 'ok' : 'bad'}><span className="font-latin">{c.failureClass}</span> <span className="num">{c.count}</span>{c.resolved ? <span className="text-faint"> · {c.resolved} resolved</span> : null}</Badge></li>)}</ul>
        )}
        {r.openEvents.length > 0 && (
          <ol className="mt-3 divide-y divide-line/70 text-[12.5px]">
            {r.openEvents.slice(0, 8).map((e) => <li key={e.id} className="flex flex-wrap gap-x-3 py-1.5"><span className="num text-faint">{fmtAgo(e.createdAt, T.locale)}</span><span className="font-latin text-fg">{e.jobType}</span><Badge tone={e.resolved ? 'ok' : 'bad'}>{e.failureClass}</Badge><span className="min-w-0 flex-1 truncate text-muted" dir="auto">{e.failureMessage}</span>{e.changeMade && <span className="text-faint">→ {e.changeMade}</span>}</li>)}
          </ol>
        )}
      </div>
    </div>
  );
}

export function SkillChip({ s }: { s: OrgSkill }) {
  const T = useT();
  return <Badge tone={s.status === 'VALIDATED' ? 'ok' : s.status === 'UNAVAILABLE' ? 'warn' : 'neutral'} title={s.status === 'VALIDATED' ? T('studio.skillValidated') : s.status === 'UNAVAILABLE' ? T('studio.skillUnavailable') : T('studio.skillDraft')}><IconSkill aria-hidden />{s.name}</Badge>;
}
export function ToolChip({ t }: { t: ToolDef }) {
  return <Badge tone="neutral" title={t.description}><IconTool aria-hidden /><span className="font-latin">{t.id}</span></Badge>;
}
