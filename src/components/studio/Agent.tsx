'use client';

import Link from 'next/link';
import { JOB_LABELS, type JobType } from '@/domain/jobs';
import { stepsOf, useAgent } from '@/studio/org';
import { useStudio } from '@/studio/store';
import { productionHref } from '@/studio/selectors';
import { Button, ErrorState, JobDot, PanelCard, Skeleton, SkeletonRegion, StateWord } from '@/components/ui/kit';
import { PanelCardSkeleton } from '@/components/media/Skeletons';
import { EmptyLine, HeadSkeleton, PageHead, Row, Rows, RowsSkeleton, Section, SectionHeadSkeleton } from './parts';
import { RunRows, ToolsAndSkills } from './Department';
import { agentStateWords, duration, failureWords, jobWords, percent, plural, resourceWords, shortWhen } from './model';

/** Constants in prose become words: DESIGN_CHARACTER → “Design a character” (a job type by its label). */
const constWords = (s: string) => s.replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b|\b(?:PRODUCE|EXPORT|ASSEMBLE)\b/g, (m) => { const label = JOB_LABELS[m as JobType]; return label ? `“${label}”` : m.toLowerCase().replace(/_/g, ' '); });

/** AN AGENT (docs/DESIGN-SYSTEM-V5.md §8.9) — a software worker of a department, always labelled as an agent: what it
 *  is for, what it executes, what it does now, its record (runs, first-time success, median time, failures), its
 *  recent runs and failures, its tools and skills; its instructions and limits behind one disclosure. Every figure
 *  comes from /api/studio/org/agents/{id}; nothing is claimed that no record shows. */
export function AgentPage({ id }: { id: string }) {
  const { data, error, reload } = useAgent(id);
  const { state } = useStudio();
  if (error && !data) return (
    <div className="cp agent">
      <ErrorState kind="page" title="This agent isn’t in the studio" back={{ href: '/studio', label: 'Back to Studio Company' }} action={<Button onClick={reload}>Try again</Button>}>Its record could not be read.</ErrorState>
    </div>
  );
  if (!data) return <AgentSkeleton />;
  const { agent: a, department: d, tools, skills, runs, stats, failures, current } = data;
  const director = d?.directorId === a.id;
  const st = agentStateWords(stats);
  const first = stats ? percent(stats.firstAttemptOk, stats.firstAttempts) : null;
  const jobs = [...a.jobTypes.map((t) => jobWords(t)), ...(a.payloadRoutes ?? []).map((r) => `${jobWords(r.jobType)} (when ${r.when})`)];
  const steps = stepsOf(a);
  const cur = current?.productionId ? state.productions.find((p) => p.id === current.productionId) : undefined;
  return (
    <div className="cp agent">
      <PageHead back={d ? { href: `/studio/departments/${d.id}`, label: d.name } : { href: '/studio', label: 'Studio Company' }}
        kicker={`${director ? 'Director' : 'Agent'}${d ? ` · ${d.name}` : ''}`} title={a.name} lead={a.role} />
      <PanelCard className="cp-facts" columns={4} facts={[
        { label: 'Now', value: current?.outcome === 'WAITING' ? <StateWord tone="idle">Waiting for its jobs</StateWord> : current ? <JobDot>{current.parentRunId ? current.purpose ?? jobWords(current.jobType) : jobWords(current.jobType)}</JobDot> : <StateWord tone={st.tone === 'failed' ? 'failed' : 'idle'}>{st.words}</StateWord>, sub: cur ? <Link href={productionHref(cur)} className="cp-link"><bdi>{cur.title}</bdi></Link> : current ? `since ${shortWhen(current.startedAt)}` : null },
        { label: 'Runs', value: <span className="t-ro t-ro-md">{stats?.runs ?? 0}</span>, sub: first ? `${first} succeeded the first time` : 'No finished first attempt yet' },
        { label: 'Median time', value: duration(stats?.p50Ms) ?? '—', sub: stats?.completed ? `of ${stats.completed} finished ${plural(stats.completed, 'run')}` : 'Nothing finished yet' },
        { label: 'Failures', value: <span className="t-ro t-ro-md">{failures.length}</span>, sub: failures.length ? `${failures.filter((f) => f.resolved).length} resolved` : 'None on record' },
      ]} />

      <Section id="does" title="What it does">
        <PanelCard columns={2} facts={[
          { label: 'Executes', value: jobs.length ? jobs.join(' · ') : 'Advises other agents; it runs no job of its own' },
          { label: 'Steps inside other agents’ jobs', value: steps.length ? steps.map((s) => s.name).join(' · ') : 'None' },
          { label: 'Model', value: <span dir="auto">{a.model}</span> },
          { label: 'Limits', value: `${Math.max(1, Math.round(a.limits.timeoutMs / 60_000))} min · ${a.limits.maxAttempts} ${plural(a.limits.maxAttempts, 'attempt')} · ${resourceWords(a.limits.resource)}` },
        ]} />
        <p className="t-body cp-prose" dir="auto">{constWords(a.description)}</p>
      </Section>

      <Section id="runs" title="Runs" count={runs.length} description="Its latest runs, delegated steps included.">
        {runs.length === 0 ? <EmptyLine>This agent has not run yet.</EmptyLine> : <RunRows runs={runs} org={{ agents: [a] }} label="Runs" limit={10} />}
      </Section>

      <Section id="failures" title="Failures" count={failures.length} description="Every failure the studio recorded for this agent, with its class and what was changed.">
        {failures.length === 0 ? <EmptyLine>No failure is recorded for this agent.</EmptyLine> : (
          <Rows label="Failures">
            {failures.map((f) => { const p = f.productionId ? state.productions.find((x) => x.id === f.productionId) : undefined; return (
              <Row key={f.id} start={<StateWord tone={f.resolved ? 'done' : 'failed'}>{f.resolved ? 'Resolved' : 'Open'}</StateWord>}
                title={<span title={f.failureClass}>{failureWords(f.failureClass)} · {jobWords(f.jobType)}{p && <> · <bdi>{p.title}</bdi></>}</span>}
                meta={<span className="t-facts"><span>attempt {f.attempt}</span>{f.changeMade && <span dir="auto">{f.changeMade}</span>}</span>}
                end={<span className="t-ro cp-time">{shortWhen(f.createdAt)}</span>}>
                {f.failureMessage && <span className="t-meta cp-row-err" dir="auto">{f.failureMessage.slice(0, 240)}</span>}
              </Row>
            ); })}
          </Rows>
        )}
      </Section>

      <ToolsAndSkills tools={tools} skills={skills} agents={[a]} />

      <Section id="instructions" title="Instructions and checks">
        <details className="card cp-details">
          <summary className="cp-details-sum">{a.instructionsReachModel ? 'The instructions its model reads' : 'Its instructions (documentation; no model reads them)'}</summary>
          <p className="t-body cp-prose" dir="auto">{constWords(a.systemInstructions)}</p>
          {a.qualityRequirements.length > 0 && <><p className="t-label cp-details-label">Quality it must meet</p><ul className="cp-list">{a.qualityRequirements.map((q) => <li key={q} className="t-body" dir="auto">{constWords(q)}</li>)}</ul></>}
          <p className="t-meta cp-details-label">Version {a.version} · input <span className="t-ro">{a.inputSchema}</span> · output <span className="t-ro">{a.outputSchema}</span></p>
        </details>
      </Section>
    </div>
  );
}

export function AgentSkeleton() {
  return (
    <SkeletonRegion label="Reading the agent’s record…" className="cp agent">
      <HeadSkeleton back kicker />
      <PanelCardSkeleton cells={4} className="cp-facts" />
      <div className="cp-section"><SectionHeadSkeleton width="9rem" /><div className="pcard"><Skeleton.Text lines={3} /></div></div>
      <div className="cp-section"><SectionHeadSkeleton width="5rem" /><RowsSkeleton n={5} /></div>
    </SkeletonRegion>
  );
}
