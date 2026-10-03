'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { plannedRolesOf, skillStatusOf, useDepartment, useOrg, type AgentRunRow, type OrgAgent, type OrgResponse, type OrgSkill, type OrgTool } from '@/studio/org';
import { deriveCompany, pipelineNeighbours } from '@/studio/company';
import { useStudio } from '@/studio/store';
import { productionHref } from '@/studio/selectors';
import { Button, LinkButton, PanelCard, Skeleton, SkeletonRegion, StateWord, TabBar, TabPanel } from '@/components/ui/kit';
import { IconChevronRight } from '@/components/ui/icons';
import { PanelCardSkeleton } from '@/components/media/Skeletons';
import { EmptyLine, HeadSkeleton, PageHead, Row, Rows, RowsSkeleton, Section, SectionHeadSkeleton } from './parts';
import {
  agentStateWords, checksLine, departmentCodes, departmentName, departmentsInOrder, duration, failureWords, handoffTarget, jobWords, outcomeWords, percent, plural,
  recordOf, resourceWords, shortWhen, skillKindWords, spanWords, stageName, teamOf,
} from './model';

/** A DEPARTMENT (docs/DESIGN-SYSTEM-V5.md §8.9, §8.13) — what it is responsible for, its place in the pipeline, its
 *  director and agents (each with its own run record), its work from the record (running now, runs, what it handed
 *  over, quality reports, activity), its failures and reliability, and the tools and skills it works with. Every
 *  figure comes from /api/studio/org and /api/studio/org/departments/{id}. */
export function DepartmentPage({ id }: { id: string }) {
  const { data: org } = useOrg();
  const { data, error, reload } = useDepartment(id);
  const { state } = useStudio();
  const active = state.productions.filter((p) => p.stage !== 'COMPLETE').map((p) => p.id);
  const company = useMemo(() => (org ? deriveCompany(org, active) : null), [org]); // eslint-disable-line react-hooks/exhaustive-deps
  const back = { href: '/studio', label: 'Studio Company' };
  if (error && !data) return (
    <div className="cp dept">
      <PageHead back={back} title="This department isn’t in the studio" />
      <EmptyLine action={<Button size="sm" onClick={reload}>Try again</Button>}>Its record could not be read: {error}</EmptyLine>
    </div>
  );
  if (!org || !data || !company) return <DepartmentSkeleton />;

  const d = data.department;
  const depts = departmentsInOrder(org);
  const team = teamOf(data.agents, d);
  const director = team.find((a) => a.id === d.directorId);
  const rec = recordOf(org.stats, team.map((a) => a.id));
  const stages = d.stages.map((s) => stageName(org, s)).join(' · ');
  const first = percent(rec.firstOk, rec.firsts);
  const failures = data.recentRuns.filter((r) => r.outcome === 'FAILED' || r.failureClass);
  const planned = plannedRolesOf(d);
  return (
    <div className="cp dept">
      <PageHead back={back} kicker={`Department ${depts.findIndex((x) => x.id === d.id) + 1} of ${depts.length}${stages ? ` · ${stages}` : ''}`} title={d.name} lead={d.responsibility}
        end={<LinkButton href={`/studio?select=${d.id}`}>Show in the company</LinkButton>} />
      <PanelCard className="cp-facts" columns={4} facts={[
        { label: 'Director', value: director ? <Link href={`/studio/agents/${director.id}`} className="cp-link">{director.name}</Link> : 'None named', sub: `${team.length} ${plural(team.length, 'agent')} in all` },
        { label: 'Now', value: data.activeRuns.length ? <StateWord tone="running">{data.activeRuns.length} {plural(data.activeRuns.length, 'run')} open</StateWord> : <StateWord tone="idle">Idle</StateWord>, sub: rec.lastRunAt ? `Last ran ${shortWhen(rec.lastRunAt)}` : 'Has not run yet' },
        { label: `Runs · ${spanWords(org.hours)}`, value: <span className="t-ro t-ro-md">{rec.runs}</span>, sub: first ? `${first} succeeded the first time` : 'No finished first attempt yet' },
        { label: 'Median time', value: duration(rec.medianMs) ?? '—', sub: rec.failed ? <span className="co-bad">{rec.failed} {plural(rec.failed, 'run')} failed</span> : 'No failed runs' },
      ]} />

      <Section id="place" title="Place in the pipeline"><PipelinePlace org={org} id={d.id} edges={company.edges} /></Section>

      <Section id="members" title="Director and agents" count={team.length} description="Agents are the studio’s software workers; each one’s record is its own runs.">
        <ul className="dp-members" role="list">
          {team.map((a) => <li key={a.id}><AgentCard org={org} agent={a} director={a.id === d.directorId} /></li>)}
        </ul>
      </Section>

      <DepartmentWork org={org} data={data} />

      <Section id="failures" title="Failures" count={failures.length} description={`Failed runs among its latest ${data.recentRuns.length}, with the class the studio gave each failure.`}>
        {failures.length === 0 ? <EmptyLine>None of its latest runs failed.</EmptyLine> : <RunRows runs={failures} org={org} label="Failures" />}
      </Section>

      <ToolsAndSkills tools={data.tools} skills={data.skills} agents={org.agents} />

      {planned.length > 0 && (
        <Section id="planned" title="Roles not staffed yet" count={planned.length} description="What the department will add, and why it waits.">
          <Rows label="Roles not staffed yet">
            {planned.map((r) => <Row key={r.key} start={<StateWord tone="idle">Planned</StateWord>} title={r.name} meta={<span className="t-facts"><span dir="auto">{r.would}</span><span dir="auto">{r.reason}</span>{r.phase && <span>{r.phase}</span>}</span>} />)}
          </Rows>
        </Section>
      )}
    </div>
  );
}

/** An agent as a card that is one link: its name, role, run state and record. No face, no human name. */
function AgentCard({ org, agent: a, director }: { org: OrgResponse; agent: OrgAgent; director: boolean }) {
  const stat = org.stats.find((s) => s.agentId === a.id) ?? null;
  const st = agentStateWords(stat);
  const first = stat ? percent(stat.firstAttemptOk, stat.firstAttempts) : null;
  return (
    <Link href={`/studio/agents/${a.id}`} className="card dp-agent">
      <span className="dp-agent-top"><span className="t-label">{director ? 'Director' : 'Agent'}</span><IconChevronRight aria-hidden className="co-chev" /></span>
      <span className="t-card dp-agent-name" title={a.name}>{a.name}</span>
      <span className="t-body dp-agent-role">{a.role}</span>
      <span className="dp-agent-foot">
        <StateWord tone={st.tone === 'running' ? 'running' : st.tone === 'failed' ? 'failed' : 'idle'}>{st.words}</StateWord>
        <span className="t-meta">{stat && stat.runs ? <span className="t-facts"><span>{stat.runs} {plural(stat.runs, 'run')}</span>{first && <span>{first} first time</span>}{duration(stat.p50Ms) && <span>{duration(stat.p50Ms)}</span>}</span> : 'No runs yet'}</span>
      </span>
    </Link>
  );
}

/** Receives from → this department → hands to, from the pipeline graph, with the handoffs on record on each link. */
function PipelinePlace({ org, id, edges }: { org: OrgResponse; id: string; edges: ReturnType<typeof deriveCompany>['edges'] }) {
  const place = pipelineNeighbours(org, id);
  const codes = departmentCodes(departmentsInOrder(org));
  const count = (from: string, to: string) => edges.find((e) => e.from === from && e.to === to)?.handoffs.length ?? 0;
  const item = (x: { id: string; gate: boolean }, dir: 'from' | 'to') => {
    const n = dir === 'from' ? count(x.id, id) : count(id, x.id);
    return (
      <li key={x.id}>
        <Link href={`/studio/departments/${x.id}`} className="dp-place-item">
          <span className="co-disc co-disc-sm" aria-hidden><span className="t-ro">{codes.get(x.id)}</span></span>
          <span className="dp-place-words"><span className="dp-place-name">{departmentName(org, x.id)}</span><span className="t-meta">{n ? `${n} ${plural(n, 'handoff')} on record` : 'No handoff yet'}{x.gate ? ' · after your approval' : ''}</span></span>
        </Link>
      </li>
    );
  };
  if (id === 'EXECUTIVE') return <div className="card dp-place"><p className="t-body">The Executive Office coordinates every department and receives the cut for your approval.</p></div>;
  return (
    <div className="card dp-place">
      <div className="dp-place-col"><p className="t-label">Receives from</p>{place.from.length ? <ul role="list">{place.from.map((x) => item(x, 'from'))}</ul> : <p className="t-body">You: the production’s brief.</p>}</div>
      <div className="dp-place-col dp-place-self"><p className="t-label">This department</p><p className="dp-place-name">{departmentName(org, id)}</p></div>
      <div className="dp-place-col"><p className="t-label">Hands to</p>{place.to.length ? <ul role="list">{place.to.map((x) => item(x, 'to'))}</ul> : <p className="t-body">You: the finished film.</p>}</div>
    </div>
  );
}

type DeptData = NonNullable<ReturnType<typeof useDepartment>['data']>;

function DepartmentWork({ org, data }: { org: OrgResponse; data: DeptData }) {
  const { state } = useStudio();
  const [tab, setTab] = useState('now');
  const title = (pid: string | null) => { const p = pid ? state.productions.find((x) => x.id === pid) : undefined; return p ? { label: p.title, href: productionHref(p) } : null; };
  return (
    <Section id="work" title="Work" description="From the record: open runs, recent runs, what it handed over, quality reports and activity.">
      <TabBar ariaLabel="Work" idBase="dp-work" current={tab} onSelect={setTab}
        tabs={[{ id: 'now', label: 'Running now', count: data.activeRuns.length }, { id: 'runs', label: 'Runs', count: data.recentRuns.length }, { id: 'delivered', label: 'Handed over', count: data.handoffs.length }, { id: 'quality', label: 'Quality', count: data.reports.length }, { id: 'activity', label: 'Activity', count: data.events.length }]} />
      <TabPanel idBase="dp-work" id="now" current={tab} className="cp-tabpanel">
        {data.activeRuns.length === 0 ? <EmptyLine action={<LinkButton href="/production" size="sm">Open Production</LinkButton>}>Nothing of this department runs now.</EmptyLine> : <RunRows runs={data.activeRuns} org={org} label="Running now" />}
      </TabPanel>
      <TabPanel idBase="dp-work" id="runs" current={tab} className="cp-tabpanel">
        {data.recentRuns.length === 0 ? <EmptyLine>This department has not run yet.</EmptyLine> : <RunRows runs={data.recentRuns} org={org} label="Runs" limit={12} />}
      </TabPanel>
      <TabPanel idBase="dp-work" id="delivered" current={tab} className="cp-tabpanel">
        {data.handoffs.length === 0 ? <EmptyLine>It has not handed anything over yet.</EmptyLine> : (
          <Rows label="Handed over">
            {data.handoffs.slice(0, 20).map((h) => { const ok = h.validation.ok; const t = title(h.productionId); const bad = h.validation.checks.filter((c) => !c.ok); return (
              <Row key={h.id} start={<StateWord tone={ok ? 'done' : 'failed'}>{ok ? 'Accepted' : 'Refused'}</StateWord>} title={<>{stageName(org, h.stage)} → {handoffTarget(org, h)}</>}
                meta={<span className="t-facts">{t && <span><Link href={t.href} className="cp-link"><bdi>{t.label}</bdi></Link></span>}{checksLine(h.validation.checks) && <span>{checksLine(h.validation.checks)}</span>}{bad.map((c) => <span key={c.name} className="co-bad">{c.name}{c.detail ? `: ${c.detail}` : ''}</span>)}</span>}
                end={<span className="t-ro cp-time">{shortWhen(h.createdAt)}</span>} />
            ); })}
          </Rows>
        )}
      </TabPanel>
      <TabPanel idBase="dp-work" id="quality" current={tab} className="cp-tabpanel">
        {data.reports.length === 0 ? <EmptyLine>No quality report names this department yet.</EmptyLine> : (
          <Rows label="Quality reports">
            {data.reports.slice(0, 20).map((r) => { const t = title(r.productionId); const a = data.agents.find((x) => x.id === r.inspectorId); const bad = r.checks.filter((c) => !c.ok); const tone = r.decision === 'ACCEPT' ? 'done' : r.decision === 'REJECT' ? 'failed' : 'waiting'; return (
              <Row key={r.id} start={<StateWord tone={tone}>{r.decision === 'ACCEPT' ? 'Accepted' : r.decision === 'REJECT' ? 'Rejected' : 'For review'}</StateWord>}
                title={<>{a?.name ?? 'Inspector'}{t && <> · <bdi>{t.label}</bdi></>}</>}
                meta={<span className="t-facts"><span>{bad.length ? `${bad.length} of ${r.checks.length} checks failed` : `${r.checks.length} ${plural(r.checks.length, 'check')} passed`}</span>{r.failureClass && <span className="co-bad">{failureWords(r.failureClass)}</span>}</span>}
                end={<span className="t-ro cp-time">{shortWhen(r.createdAt)}</span>} />
            ); })}
          </Rows>
        )}
      </TabPanel>
      <TabPanel idBase="dp-work" id="activity" current={tab} className="cp-tabpanel">
        {data.events.length === 0 ? <EmptyLine>No activity is recorded yet.</EmptyLine> : (
          <Rows label="Activity">
            {data.events.slice(0, 20).map((e) => { const a = e.agentId ? org.agents.find((x) => x.id === e.agentId) : undefined; return <Row key={e.id} title={<span dir="auto">{e.message}</span>} meta={a?.name} end={<span className="t-ro cp-time">{shortWhen(e.at)}</span>} />; })}
          </Rows>
        )}
      </TabPanel>
    </Section>
  );
}

/** Runs as rows: the outcome, what was run (a delegated step by its purpose), for which production, the attempt and
 *  the time it took, and the failure in words. */
export function RunRows({ runs, org, label, limit }: { runs: AgentRunRow[]; org: Pick<OrgResponse, 'agents'>; label: string; limit?: number }) {
  const { state } = useStudio();
  const [all, setAll] = useState(false);
  const shown = limit && !all ? runs.slice(0, limit) : runs;
  return (
    <>
      <Rows label={label}>
        {shown.map((r) => {
          const o = outcomeWords(r.outcome);
          const p = r.productionId ? state.productions.find((x) => x.id === r.productionId) : undefined;
          const a = org.agents.find((x) => x.id === r.agentId);
          return (
            <Row key={r.id} start={<StateWord tone={o.tone}>{o.words}</StateWord>}
              title={<>{r.parentRunId ? (r.purpose ?? jobWords(r.jobType)) : jobWords(r.jobType)}{p && <> · <Link href={productionHref(p)} className="cp-link"><bdi>{p.title}</bdi></Link></>}</>}
              meta={<span className="t-facts">{a && <span>{a.name}</span>}{r.parentRunId && <span>a step of “{jobWords(r.jobType)}”</span>}{r.attempt > 1 && <span>attempt {r.attempt}</span>}{duration(r.ms) && <span>{duration(r.ms)}</span>}{r.failureClass && <span className="co-bad" title={r.failureClass}>{failureWords(r.failureClass)}</span>}</span>}
              end={<><span className="t-ro cp-time">{shortWhen(r.startedAt)}</span><Link href={`/production?job=${encodeURIComponent(r.jobId)}#history`} className="cp-link cp-rowlink">Job</Link></>}>
              {r.errorMessage && <span className="t-meta cp-row-err" dir="auto">{r.errorMessage.slice(0, 240)}</span>}
            </Row>
          );
        })}
      </Rows>
      {limit && runs.length > limit && <Button size="sm" variant="quiet" className="cp-more" onClick={() => setAll((v) => !v)}>{all ? 'Show fewer' : `Show all ${runs.length}`}</Button>}
    </>
  );
}

/** The tools (what each does, its engine and limit) and the skills (how each is used and whether it is verified). */
export function ToolsAndSkills({ tools, skills, agents }: { tools: OrgTool[]; skills: OrgSkill[]; agents: OrgAgent[] }) {
  return (
    <div className="dp-two">
      <Section id="tools" title="Tools" count={tools.length}>
        {tools.length === 0 ? <EmptyLine>No tools of its own.</EmptyLine> : (
          <Rows label="Tools">
            {tools.map((t) => <Row key={t.id} title={t.name} meta={<span className="t-facts"><span dir="auto">{t.description}</span><span>{resourceWords(t.resource)}</span><span>up to {Math.max(1, Math.round(t.timeoutMs / 60_000))} min</span></span>} />)}
          </Rows>
        )}
      </Section>
      <Section id="skills" title="Skills" count={skills.length}>
        {skills.length === 0 ? <EmptyLine>No skills of its own.</EmptyLine> : (
          <Rows label="Skills">
            {skills.map((s) => { const st = skillStatusOf(s); const users = (s.evidence?.usedBy ?? []).map((id) => agents.find((a) => a.id === id)?.name).filter(Boolean); return (
              <Row key={s.id} start={<StateWord tone={st.key === 'VERIFIED' ? 'done' : st.key === 'UNAVAILABLE' ? 'failed' : 'idle'}>{st.key === 'VERIFIED' ? 'Verified' : st.key === 'UNAVAILABLE' ? 'Unavailable' : 'Draft'}</StateWord>}
                title={s.name} meta={<span className="t-facts"><span>{skillKindWords(s.kind)}</span>{users.length > 0 && <span>used by {users.join(', ')}</span>}{st.reason && <span dir="auto">{st.reason}</span>}</span>} />
            ); })}
          </Rows>
        )}
      </Section>
    </div>
  );
}

/** The department while its record loads: head, facts panel, place, members grid and the work rows (§5.22). */
export function DepartmentSkeleton() {
  return (
    <SkeletonRegion label="Reading the department’s record…" className="cp dept">
      <HeadSkeleton back kicker />
      <PanelCardSkeleton cells={4} className="cp-facts" />
      <div className="cp-section"><SectionHeadSkeleton width="12rem" /><div className="card dp-place"><Skeleton.Text lines={2} /></div></div>
      <div className="cp-section"><SectionHeadSkeleton width="11rem" /><div className="dp-members">{Array.from({ length: 3 }, (_, i) => <div key={i} className="card dp-agent"><Skeleton.Line width="30%" /><Skeleton.Line width="60%" /><Skeleton.Text lines={2} /></div>)}</div></div>
      <div className="cp-section"><SectionHeadSkeleton width="5rem" /><RowsSkeleton n={4} /></div>
    </SkeletonRegion>
  );
}
