'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useDepartment, useOrg } from '@/studio/org';
import { useStudio } from '@/studio/store';
import { productionHref } from '@/studio/selectors';
import { JOB_LABELS, type JobType } from '@/domain/jobs';
import { useT } from '@/components/ui/locale';
import { PageHeader, Section, Stat } from '@/components/ui/page';
import { ActivityFeed, PipelineGraph, SkillChip, ToolChip, deptHue, fmtMs, pct } from '@/components/studio/org';
import { AgentCard } from '@/components/studio/AgentCard';
import { Badge, Status, cls } from '@/components/ui/kit';
import { fmtAgo } from '@/lib/format';

/** A DEPARTMENT — its director and agents, what it is responsible for, the models it runs on, its real tools and
 *  verified skills, what it is doing right now, what it has delivered (handoffs with their checks), the quality
 *  results of its inspectors, and its activity. Every number comes from a record. */
export default function DepartmentPage() {
  const T = useT();
  const { id } = useParams<{ id: string }>();
  const { data: org } = useOrg();
  const { data } = useDepartment(id);
  const { state } = useStudio();
  if (!org || !data) return <div aria-busy className="space-y-4 pt-2"><div className="skeleton h-9 w-72" /><div className="skeleton h-4 w-96" /></div>;
  const d = data.department;
  const director = org.agents.find((a) => a.id === d.directorId);
  const stages = org.pipeline.filter((s) => d.stages.includes(s.id));
  const prod = (pid: string | null) => (pid ? state.productions.find((p) => p.id === pid) : undefined);
  const models = Array.from(new Set(data.agents.map((a) => a.model)));
  const delivered = data.handoffs.filter((h) => h.qualityStatus === 'VALIDATED').length;
  const rejected = data.reports.filter((r) => r.decision === 'REJECT').length;
  return (
    <>
      <div className={cls('-mx-5 -mt-6 mb-8 bg-gradient-to-b to-transparent px-5 pt-6 sm:-mx-8 sm:-mt-8 sm:px-8 sm:pt-8 lg:-mt-10 lg:pt-10', deptHue(d.id))}>
        <PageHeader title={d.name} titleAr={d.nameAr} eyebrow={d.id === 'EXECUTIVE' ? T('studio.executive') : `${T('studio.stages')}: ${d.stages.map((s) => T.dyn(`pipeline.${s}`, s)).join(' · ')}`} subtitle={d.responsibility} back={{ href: '/studio', label: T('nav.company') }} className="mb-2"
          action={data.activeRuns.length ? <Status tone="info" live>{data.activeRuns.length} {T('jobs.running')}</Status> : undefined} />
        <p className="pb-6 text-[13px] text-muted">{T('studio.director')}: <Link href={director ? `/studio/agents/${director.id}` : '#'} className="text-fg hover:underline">{director?.name ?? d.directorId}</Link>{director && director.department !== d.id ? ` (${org.departments.find((x) => x.id === director.department)?.name})` : ''} · {T('studio.model')}: <span className="font-latin">{models.join(' · ')}</span></p>
      </div>

      <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={T('studio.assignments')} value={data.activeRuns.length} hint={data.activeRuns.length ? data.activeRuns.map((r) => JOB_LABELS[r.jobType as JobType]?.[T.locale] ?? r.jobType).slice(0, 3).join(', ') : T('studio.idle')} />
        <Stat label={T('studio.deliverables')} value={delivered} hint={data.handoffs.length > delivered ? `${data.handoffs.length - delivered} ${T('studio.refused')}` : data.handoffs.length ? T('studio.allValidated') : T('studio.noData')} />
        <Stat label={T('studio.qualityResults')} value={data.reports.length} hint={data.reports.length ? `${rejected} ${T('studio.rejected')} · ${pct(data.reports.length - rejected, data.reports.length)} ${T('studio.accepted')}` : T('studio.noData')} />
        <Stat label={T('studio.runs')} value={data.recentRuns.length} hint={data.recentRuns.length ? `${pct(data.recentRuns.filter((r) => r.outcome === 'COMPLETED' || r.outcome === 'AWAITING_REVIEW').length, data.recentRuns.filter((r) => r.outcome && r.outcome !== 'CANCELLED').length)} ok` : T('studio.noData')} />
      </div>

      {stages.length > 0 && <Section title={T('studio.stages')} className="mb-10"><PipelineGraph stages={stages} departments={org.departments} /></Section>}

      <Section title={T('studio.agents')} count={data.agents.length} className="mb-10" description={T('studio.team.hint')}>
        {(() => { const dir = data.agents.find((a) => a.id === d.directorId) ?? (director && director.department !== d.id ? director : undefined); const rest = data.agents.filter((a) => a.id !== dir?.id); return (
          <div className="space-y-4">
            {dir && <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><AgentCard a={dir} stat={org.stats.find((s) => s.agentId === dir.id)} director /></ul>}
            {dir && rest.length > 0 && <div className="org-team-rule" aria-hidden />}
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rest.map((a) => <AgentCard key={a.id} a={a} stat={org.stats.find((s) => s.agentId === a.id)} />)}</ul>
          </div>
        ); })()}
      </Section>

      <div className="mb-10 grid gap-6 md:grid-cols-2">
        <Section title={T('studio.skills')} count={data.skills.length}><ul className="flex flex-wrap gap-2">{data.skills.map((s) => <li key={s.id}><SkillChip s={s} /></li>)}</ul></Section>
        <Section title={T('studio.tools')} count={data.tools.length}><ul className="flex flex-wrap gap-2">{data.tools.map((t) => <li key={t.id}><ToolChip t={t} /></li>)}</ul></Section>
      </div>

      <div className="mb-10 grid gap-8 xl:grid-cols-2">
        <Section title={T('studio.assignments')} count={data.activeRuns.length} description={T('studio.assignments.hint')}>
          {data.activeRuns.length === 0 ? <p className="rounded-2xl border border-dashed border-line px-6 py-8 text-center text-[13px] text-faint">{T('studio.idle')}</p> : (
            <ol className="card divide-y divide-line/70 px-4">{data.activeRuns.map((r) => { const p = prod(r.productionId); const a = data.agents.find((x) => x.id === r.agentId); return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-[13px]"><Status tone="info" live>{T('jobs.running')}</Status><span className="font-medium text-fg">{JOB_LABELS[r.jobType as JobType]?.[T.locale] ?? r.jobType}</span><span className="text-muted">{a?.name}</span>{p && <Link href={productionHref(p)} className="truncate text-muted hover:text-fg" dir="auto">{p.title}</Link>}<span className="ms-auto num text-[12px] text-faint">{fmtAgo(r.startedAt, T.locale)}</span></li>
            ); })}</ol>
          )}
        </Section>
        <Section title={T('studio.deliverables')} count={data.handoffs.length} description={T('studio.deliverables.hint')}>
          {data.handoffs.length === 0 ? <p className="rounded-2xl border border-dashed border-line px-6 py-8 text-center text-[13px] text-faint">{T('studio.noData')}</p> : (
            <ol className="card divide-y divide-line/70 px-4">{data.handoffs.slice(0, 20).map((h) => { const p = prod(h.productionId); const failed = h.validation.checks.filter((c) => !c.ok); return (
              <li key={h.id} className="py-3 text-[13px]">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><Status tone={h.validation.ok ? 'ok' : 'bad'}>{T.dyn(`pipeline.${h.stage}`, h.stage)}</Status>{p && <Link href={productionHref(p)} className="truncate font-medium text-fg hover:underline" dir="auto">{p.title}</Link>}<span className="text-faint">→ {org.departments.find((x) => x.id === h.receiverDepartment)?.name ?? '—'}</span><span className="ms-auto num text-[12px] text-faint">{fmtAgo(h.createdAt, T.locale)}</span></div>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">{h.validation.checks.map((c) => <li key={c.name}><Badge tone={c.ok ? 'neutral' : 'bad'} title={c.detail}><span className="font-latin">{c.name}</span></Badge></li>)}</ul>
                {failed.length > 0 && <p className="mt-1 text-[12px] text-bad">{failed.map((c) => `${c.name}${c.detail ? `: ${c.detail}` : ''}`).join(' · ')}</p>}
              </li>
            ); })}</ol>
          )}
        </Section>
      </div>

      <Section title={T('studio.qualityResults')} count={data.reports.length} description={T('studio.qualityResults.hint')} className="mb-10">
        {data.reports.length === 0 ? <p className="rounded-2xl border border-dashed border-line px-6 py-8 text-center text-[13px] text-faint">{T('studio.noData')}</p> : (
          <ol className="card divide-y divide-line/70 px-4">{data.reports.slice(0, 30).map((r) => { const p = prod(r.productionId); const a = data.agents.find((x) => x.id === r.inspectorId); const failed = r.checks.filter((c) => !c.ok); return (
            <li key={r.id} className="py-3 text-[13px]">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><Status tone={r.decision === 'ACCEPT' ? 'ok' : r.decision === 'REJECT' ? 'bad' : 'warn'}>{r.decision}</Status><span className="font-medium text-fg">{r.subjectKind.toLowerCase()}</span><span className="text-muted">{a?.name}</span>{p && <Link href={productionHref(p)} className="truncate text-muted hover:text-fg" dir="auto">{p.title}</Link>}{r.failureClass && <Badge tone="bad"><span className="font-latin">{r.failureClass}</span></Badge>}<span className="ms-auto num text-[12px] text-faint">{fmtAgo(r.createdAt, T.locale)}</span></div>
              <p className="mt-1 text-[12px] text-faint">{failed.length ? failed.map((c) => `${c.name}${c.value !== undefined ? ` = ${c.value}` : ''}${c.detail ? ` (${c.detail})` : ''}`).join(' · ') : `${r.checks.length} ${T('studio.checksPassed')}${r.notes ? ` · ${r.notes}` : ''}`}</p>
            </li>
          ); })}</ol>
        )}
      </Section>

      <Section title={T('studio.activity')} description={T('studio.activity.hint')}>
        <div className="card px-5 py-2"><ActivityFeed events={data.events} agents={org.agents} departments={org.departments} /></div>
      </Section>
      <p className="mt-6 text-[11.5px] text-faint">{T('studio.median')}: {fmtMs(org.stats.filter((s) => data.agents.some((a) => a.id === s.agentId)).reduce<number | null>((m, s) => (s.p50Ms === null ? m : m === null ? s.p50Ms : Math.max(m, s.p50Ms)), null))}</p>
    </>
  );
}
