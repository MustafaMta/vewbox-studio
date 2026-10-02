'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { agentName, agentRole, deptName, deptResponsibility, plannedRolesOf, useDepartment, useOrg, type OrgDepartment, type OrgResponse } from '@/studio/org';
import { pipelineNeighbours, type Company } from '@/studio/company';
import { useStudio } from '@/studio/store';
import { productionHref } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { PageHeader } from '@/components/ui/page';
import { LinkButton, Notice, Segmented, Status, cls } from '@/components/ui/kit';
import { IconArrowRight, IconChevronRight } from '@/components/ui/icons';
import { DEPT_ICON, teamOf, useCompany } from '@/components/studio/Company';
import { edgeWords } from '@/components/studio/CompanyInspector';
import { AgentStatus, Monogram, failureWords, fmtMs, pct } from '@/components/studio/people';
import { ExecutesLine, SkillEntry, ToolEntry, jobWords } from '@/components/studio/internals';
import { ActivityFeed } from '@/components/studio/org';
import { fmtAgo } from '@/lib/format';

type WorkTab = 'now' | 'delivered' | 'quality' | 'activity';

/** A DEPARTMENT (docs/DESIGN-SYSTEM-V3.md §9.2) — people and state first: who leads, who is on the team and what
 *  each of them executes (job types and delegated steps), where the department sits in the pipeline, and its work
 *  from the records (one list, one filter, one honest sentence when empty). The roles it will have but does not
 *  staff yet are a muted list. Models, tools with their contracts and skills with their evidence sit behind
 *  "How this department works". */
export default function DepartmentPage() {
  const T = useT();
  const { id } = useParams<{ id: string }>();
  const { data: org } = useOrg();
  const { data, error } = useDepartment(id);
  const company = useCompany(org);
  const { state } = useStudio();
  const [tab, setTab] = useState<WorkTab>('now');
  const back = { href: '/studio', label: T('nav.company') };
  if (error && !data) return <><PageHeader title={id} back={back} /><Notice tone="bad" title={T('co.error')}>{error}</Notice></>;
  if (!org || !data || !company) return <div aria-busy className="space-y-4 pt-2"><div className="skeleton h-4 w-40" /><div className="skeleton h-9 w-96" /><div className="skeleton h-4 w-[32rem] max-w-full" /><div className="skeleton mt-10 h-28" /></div>;
  const d = data.department;
  const lang = T.locale;
  const team = teamOf({ agents: data.agents }, d);
  const director = org.agents.find((a) => a.id === d.directorId);
  const stats = org.stats.filter((s) => team.some((a) => a.id === s.agentId));
  const runs = stats.reduce((n, s) => n + s.runs, 0);
  const firstOk = stats.reduce((n, s) => n + s.firstAttemptOk, 0);
  const firsts = stats.reduce((n, s) => n + s.firstAttempts, 0);
  const failed = stats.reduce((n, s) => n + s.failed, 0);
  const median = stats.reduce<number | null>((m, s) => (s.p50Ms === null ? m : m === null ? s.p50Ms : Math.max(m, s.p50Ms)), null);
  const working = data.activeRuns.length > 0;
  const prod = (pid: string | null) => (pid ? state.productions.find((p) => p.id === pid) : undefined);
  const stagesWords = d.stages.map((s) => T.dyn(`pipeline.${s}`, s)).join(' · ');
  const planned = plannedRolesOf(d, lang);
  const models = Array.from(new Map(team.map((a) => [a.model, a] as const)).values());

  const meta = (
    <>
      <Status tone={working ? 'info' : 'neutral'} live={working}>{working ? T('orch.node.active') : T('orch.node.idle')}</Status>
      {director && <><span aria-hidden className="text-ink-500">·</span><span>{T('studio.director')}: <Link href={`/studio/agents/${director.id}`} className="font-medium text-fg hover:underline" dir="auto">{agentName(director, lang)}</Link></span></>}
      <span aria-hidden className="text-ink-500">·</span><span>{T.p('co.agents', team.length)}</span>
      {runs > 0 && <><span aria-hidden className="text-ink-500">·</span><span className="num">{T.p('dept.runs', runs)} · {T.f('dept.firstTime', { p: pct(firstOk, firsts) })}{median !== null ? ` · ${T.f('dept.median', { t: fmtMs(median) })}` : ''}{failed ? ` · ${T.p('dept.failures', failed)}` : ''}</span></>}
    </>
  );

  return (
    <>
      <PageHeader back={back} eyebrow={stagesWords ? `${T('co.dept.eyebrow')} · ${stagesWords}` : T('co.dept.eyebrow')} title={deptName(d, lang)} subtitle={deptResponsibility(d, lang)} meta={meta}
        action={<LinkButton href={`/studio?select=${d.id}`}>{T('dept.showInCompany')}</LinkButton>} />

      <section aria-labelledby="dept-place">
        <h2 id="dept-place" className="section-title mb-4">{T('dept.place')}</h2>
        <PipelinePlace org={org} company={company} d={d} />
      </section>

      <section aria-labelledby="dept-team" className="mt-[var(--section)]">
        <h2 id="dept-team" className="section-title mb-2">{T('co.team')} <span className="num text-[13px] font-medium text-faint">{team.length}</span></h2>
        <ul className="rows">
          {team.map((a) => { const isDirector = a.id === d.directorId; return (
            <li key={a.id}>
              <Link href={`/studio/agents/${a.id}`} className="row row-hover -mx-2 items-start px-2 sm:items-center">
                <Monogram name={a.name} size={32} director={isDirector} className="mt-0.5 sm:mt-0" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2"><span className="text-[14px] font-semibold text-fg" dir="auto">{agentName(a, lang)}</span>{isDirector && <span className="text-xs font-medium text-muted">{T('studio.director')}</span>}</span>
                  <span className="block text-sm text-muted" dir="auto">{agentRole(a, lang)}</span>
                  <ExecutesLine agent={a} className="mt-0.5 block text-xs text-muted" />
                </span>
                <AgentStatus stat={org.stats.find((s) => s.agentId === a.id)} className="mt-1 flex-none sm:mt-0" />
                <IconChevronRight aria-hidden className="mt-1 size-4 flex-none text-faint sm:mt-0 rtl:rotate-180" />
              </Link>
            </li>
          ); })}
        </ul>
      </section>

      <section aria-labelledby="dept-work" className="mt-[var(--section)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="dept-work" className="section-title">{T('dept.work')}</h2>
          <Segmented label={T('dept.work')} value={tab} onChange={setTab} options={[
            { value: 'now', label: <>{T('dept.work.now')}{data.activeRuns.length ? <span className="num text-faint"> {data.activeRuns.length}</span> : null}</> },
            { value: 'delivered', label: <>{T('dept.work.delivered')}{data.handoffs.length ? <span className="num text-faint"> {data.handoffs.length}</span> : null}</> },
            { value: 'quality', label: <>{T('dept.work.quality')}{data.reports.length ? <span className="num text-faint"> {data.reports.length}</span> : null}</> },
            { value: 'activity', label: T('dept.work.activity') },
          ]} />
        </div>
        {tab === 'now' && (data.activeRuns.length === 0 ? <EmptyLine text={T('dept.empty.now')} action={<LinkButton href="/production" size="sm">{T('dept.openProduction')}</LinkButton>} /> : (
          <ol className="rows">{data.activeRuns.map((r) => { const p = prod(r.productionId); const a = data.agents.find((x) => x.id === r.agentId); return (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm"><Status tone="info" live>{r.parentRunId ? (r.purpose ?? T('agent.delegated')) : jobWords(T, r.jobType)}</Status>{a && <span className="text-muted" dir="auto">{agentName(a, lang)}</span>}{p && <Link href={productionHref(p)} className="text-muted hover:text-fg" dir="auto">{p.title}</Link>}<span className="num ms-auto text-xs text-faint">{fmtAgo(r.startedAt, lang)}</span></li>
          ); })}</ol>
        ))}
        {tab === 'delivered' && (data.handoffs.length === 0 ? <EmptyLine text={T('dept.empty.delivered')} /> : (
          <ol className="rows">{data.handoffs.slice(0, 20).map((h) => { const p = prod(h.productionId); const bad = h.validation.checks.filter((c) => !c.ok); const to = org.departments.find((x) => x.id === (h.stage === 'EDIT' ? 'EXECUTIVE' : h.receiverDepartment)); return (
            <li key={h.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><Status tone={h.validation.ok ? 'ok' : 'bad'}>{h.validation.ok ? T('orch.accepted') : T('orch.refused')}</Status><span className="font-medium text-fg">{T.dyn(`pipeline.${h.stage}`, h.stage)}</span>{to && <span className="text-muted">→ <bdi>{deptName(to, lang)}</bdi></span>}{p && <Link href={productionHref(p)} className="text-muted hover:text-fg" dir="auto">{p.title}</Link>}<span className="num ms-auto text-xs text-faint">{fmtAgo(h.createdAt, lang)}</span></div>
              {h.validation.checks.length > 0 && <p className="mt-0.5 text-xs text-faint">{T.f('co.checksPassed', { ok: h.validation.checks.length - bad.length, n: h.validation.checks.length })}</p>}
              {bad.length > 0 && <p className="mt-0.5 text-xs text-bad" dir="auto">{bad.map((c) => `${c.name}${c.detail ? `: ${c.detail}` : ''}`).join(' · ')}</p>}
            </li>
          ); })}</ol>
        ))}
        {tab === 'quality' && (data.reports.length === 0 ? <EmptyLine text={T('dept.empty.quality')} /> : (
          <ol className="rows">{data.reports.slice(0, 30).map((r) => { const p = prod(r.productionId); const a = data.agents.find((x) => x.id === r.inspectorId); const bad = r.checks.filter((c) => !c.ok); return (
            <li key={r.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><Status tone={r.decision === 'ACCEPT' ? 'ok' : r.decision === 'REJECT' ? 'bad' : 'warn'}>{r.decision === 'ACCEPT' ? T('orch.accepted') : r.decision === 'REJECT' ? T('orch.refused') : T('jobs.awaitingReview')}</Status>{a && <span className="text-muted" dir="auto">{agentName(a, lang)}</span>}{p && <Link href={productionHref(p)} className="text-muted hover:text-fg" dir="auto">{p.title}</Link>}{r.failureClass && <span className="text-bad">{failureWords(T, r.failureClass)}</span>}<span className="num ms-auto text-xs text-faint">{fmtAgo(r.createdAt, lang)}</span></div>
              <p className="mt-0.5 text-xs text-faint" dir="auto">{bad.length ? bad.map((c) => `${c.name}${c.value !== undefined ? ` = ${c.value}` : ''}${c.detail ? ` (${c.detail})` : ''}`).join(' · ') : `${T.f('co.checksPassed', { ok: r.checks.length, n: r.checks.length })}${r.notes ? ` · ${r.notes}` : ''}`}</p>
            </li>
          ); })}</ol>
        ))}
        {tab === 'activity' && <ActivityFeed events={data.events} agents={org.agents} departments={org.departments} />}
      </section>

      {planned.length > 0 && (
        <section aria-labelledby="dept-planned" className="mt-[var(--section)]">
          <h2 id="dept-planned" className="section-title">{T('dept.planned')} <span className="num text-[13px] font-medium text-faint">{planned.length}</span></h2>
          <p className="mt-1 text-sm text-faint">{T('dept.planned.hint')}</p>
          <ul className="rows mt-2">
            {planned.map((r) => (
              <li key={r.key} className="py-3 text-sm text-muted">
                <p className="font-medium text-muted" dir="auto">{r.name}</p>
                {r.would && <p className="mt-0.5 text-faint" dir="auto">{r.would}</p>}
                <p className="mt-0.5 text-xs text-faint"><span dir="auto">{r.reason}</span>{r.phase && <> · <span dir="auto">{T.f('dept.planned.phase', { phase: r.phase })}</span></>}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-[var(--section)] border-t border-line-soft pt-6">
        <details className="details">
          <summary><span className="h3">{T('dept.how')}</span></summary>
          <div className="mt-4 grid gap-8 xl:grid-cols-2">
            <div>
              <h3 className="text-[13px] font-semibold text-fg">{T('dept.models')}</h3>
              <ul className="rows mt-1">{models.map((a) => <li key={a.model} className="py-2.5 text-sm"><span className="text-body" dir="auto">{a.model}</span><span className="block text-xs text-faint">{team.filter((x) => x.model === a.model).map((x) => agentName(x, lang)).join(', ')}</span></li>)}</ul>
              <h3 className="mt-6 text-[13px] font-semibold text-fg">{T('studio.skills')} <span className="num font-medium text-faint">{data.skills.length}</span></h3>
              <ul className="rows mt-1">{data.skills.map((s) => <SkillEntry key={s.id} skill={s} agents={org.agents} />)}</ul>
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-fg">{T('studio.tools')} <span className="num font-medium text-faint">{data.tools.length}</span></h3>
              <ul className="rows mt-1">{data.tools.map((t) => <ToolEntry key={t.id} tool={t} />)}</ul>
            </div>
          </div>
        </details>
      </section>
    </>
  );
}

function EmptyLine({ text, action }: { text: string; action?: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3 py-2"><p className="text-[14px] text-muted">{text}</p>{action}</div>;
}

/** The department's place in the pipeline: whom it receives from, itself, whom it hands to — the same seats and
 *  edge words as the company page; three stacked rows on a phone. */
function PipelinePlace({ org, company, d }: { org: OrgResponse; company: Company; d: OrgDepartment }) {
  const T = useT();
  const lang = T.locale;
  const place = pipelineNeighbours(org, d.id);
  const dept = (id: string) => org.departments.find((x) => x.id === id);
  const node = (id: string, current?: boolean) => { const Icon = DEPT_ICON[id] ?? DEPT_ICON.EXECUTIVE; return <span className="mini-node" data-current={current || undefined}><Icon /></span>; };
  const item = (id: string, gate: boolean, dir: 'from' | 'to') => {
    const x = dept(id); if (!x) return null;
    const e = company.edges.find((y) => (dir === 'from' ? y.from === id && y.to === d.id : y.from === d.id && y.to === id));
    const w = edgeWords(T, e);
    return (
      <li key={id} className="flex items-center gap-3 py-1.5">
        {node(id)}
        <span className="min-w-0">
          <Link href={`/studio/departments/${id}`} className="block text-sm font-medium text-fg hover:underline" dir="auto">{deptName(x, lang)}</Link>
          <span className="block text-xs text-faint">{w.text}{gate ? ` · ${T('co.afterApproval')}` : ''}</span>
        </span>
      </li>
    );
  };
  if (d.id === 'EXECUTIVE') return <div className="flex items-center gap-3">{node(d.id, true)}<p className="text-sm text-muted">{T('co.coordinates')}</p></div>;
  const col = (title: string, xs: Array<{ id: string; gate: boolean }>, dir: 'from' | 'to', fallback: string) => (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium text-faint">{title}</p>
      {xs.length ? <ul>{xs.map((x) => item(x.id, x.gate, dir))}</ul> : <p className="py-1.5 text-sm text-muted">{fallback}</p>}
    </div>
  );
  const arrow = <span aria-hidden className="hidden items-center self-center text-ink-550 md:flex"><span className="h-px w-10 bg-ink-600" /><IconArrowRight className="-ms-1 size-4 rtl:rotate-180" /></span>;
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
      {col(T('co.receivesFrom'), place.from, 'from', T('co.fromYou'))}
      {arrow}
      <div className={cls('flex items-center gap-3 md:self-center')}>{node(d.id, true)}<span className="text-sm font-semibold text-fg" dir="auto">{deptName(d, lang)}</span></div>
      {arrow}
      {col(T('co.handsTo'), place.to, 'to', T('co.toYou'))}
    </div>
  );
}
