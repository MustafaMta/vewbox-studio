'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAgent } from '@/studio/org';
import { useStudio } from '@/studio/store';
import { productionHref } from '@/studio/selectors';
import { JOB_LABELS, type JobType } from '@/domain/jobs';
import { useT } from '@/components/ui/locale';
import { PageHeader, Section, Stat } from '@/components/ui/page';
import { ActivityFeed, SkillChip, ToolChip, fmtMs, pct } from '@/components/studio/org';
import { Badge, Details, KV, Notice, Status } from '@/components/ui/kit';
import { fmtAgo } from '@/lib/format';

/** AN AGENT'S PROFILE — what it is for, its instructions, the model that runs for it, the skills it reads (with the
 *  skill text), the tools it may call, its limits and quality requirements, and its real runs with their tool calls
 *  and outcomes. A supervisory agent says that it executes no job of its own. */
export default function AgentPage() {
  const T = useT();
  const { id } = useParams<{ id: string }>();
  const { data, error } = useAgent(id);
  const { state } = useStudio();
  if (error) return <PageHeader title={id} subtitle={error} back={{ href: '/studio', label: T('studio.title') }} />;
  if (!data) return <div aria-busy className="space-y-4 pt-2"><div className="skeleton h-9 w-72" /><div className="skeleton h-4 w-96" /></div>;
  const { agent: a, department: d, tools, skills, runs, stats, events, failures, current } = data;
  const executes = a.jobTypes.length > 0 || Boolean(a.payloadRoutes?.length);
  const currentProd = current?.productionId ? state.productions.find((x) => x.id === current.productionId) : undefined;
  return (
    <>
      <PageHeader title={a.name} eyebrow={d ? <Link href={`/studio/departments/${d.id}`} className="hover:underline">{d.name}</Link> : a.department} subtitle={a.description} back={{ href: d ? `/studio/departments/${d.id}` : '/studio', label: d?.name ?? T('studio.title') }}
        action={stats && stats.runs > 0 ? <Status tone={stats.running ? 'info' : stats.failed ? 'warn' : 'ok'} live={Boolean(stats.running)}>{stats.running ? `${stats.running} ${T('jobs.running')}` : `${T('studio.lastRun')} ${stats.lastRunAt ? fmtAgo(stats.lastRunAt, T.locale) : ''}`}</Status> : <Status tone="neutral">{T('studio.neverRan')}</Status>} />

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={T('studio.runs')} value={stats?.runs ?? 0} hint={stats ? `${stats.completed} ok · ${stats.failed} failed${stats.cancelled ? ` · ${stats.cancelled} cancelled` : ''}` : T('studio.noData')} />
        <Stat label={T('studio.firstAttempt')} value={stats ? pct(stats.firstAttemptOk, stats.firstAttempts) : '—'} hint={stats ? `${stats.firstAttemptOk} / ${stats.firstAttempts}` : T('studio.noData')} />
        <Stat label={T('studio.median')} value={fmtMs(stats?.p50Ms)} hint={stats?.runs ? `${stats.runs} runs` : T('studio.noData')} />
        <Stat label={T('studio.toolCalls')} value={stats?.toolCalls ?? 0} hint={stats?.toolFailures ? `${stats.toolFailures} failed` : stats?.toolCalls ? 'all succeeded' : T('studio.noData')} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-8">
          <Section title={T('studio.currentAssignment')}>
            {current ? (
              <div className="card flex flex-wrap items-center gap-x-3 gap-y-1 p-4 text-[13px]"><Status tone="info" live>{T('studio.executionState')}: {T('jobs.running')}</Status><span className="font-medium text-fg">{JOB_LABELS[current.jobType as JobType]?.[T.locale] ?? current.jobType}</span>{currentProd && <Link href={productionHref(currentProd)} className="truncate text-muted hover:text-fg" dir="auto">{currentProd.title}</Link>}<span className="ms-auto num text-[12px] text-faint">{fmtAgo(current.startedAt, T.locale)}{current.attempt > 1 ? ` · ${T('studio.attempt')} ${current.attempt}` : ''}</span>{current.toolCalls.length > 0 && <ul className="basis-full flex flex-wrap gap-1.5">{current.toolCalls.map((c, i) => <li key={i}><Badge tone={c.ok ? 'neutral' : 'bad'}><span className="font-latin">{c.tool}</span></Badge></li>)}</ul>}</div>
            ) : <p className="rounded-2xl border border-dashed border-line px-6 py-5 text-[13px] text-faint">{T('studio.idle')} · {T('studio.executionState')}: {T('orch.node.idle')}</p>}
          </Section>
          <Section title={a.instructionsReachModel ? T('studio.instructionsModel') : T('studio.instructionsDoc')}>
            <div className="card p-5 text-[13.5px] leading-relaxed text-body" dir="auto">{a.systemInstructions}</div>
          </Section>
          {!executes && <Notice tone="info">{T('studio.advisory')}</Notice>}
          <Section title={T('studio.recentRuns')} count={runs.length}>
            {runs.length === 0 ? <p className="rounded-2xl border border-dashed border-line px-6 py-8 text-center text-[13px] text-faint">{T('studio.neverRan')}</p> : (
              <ol className="card divide-y divide-line/70 px-4">
                {runs.map((r) => {
                  const p = r.productionId ? state.productions.find((x) => x.id === r.productionId) : undefined;
                  const tone = r.outcome === null ? 'info' : r.outcome === 'FAILED' ? 'bad' : r.outcome === 'CANCELLED' ? 'neutral' : r.outcome === 'AWAITING_REVIEW' ? 'warn' : 'ok';
                  return (
                    <li key={r.id} className="py-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                        <Status tone={tone} live={r.outcome === null}>{r.outcome === null ? T('jobs.running') : r.outcome === 'FAILED' ? T('jobs.failed') : r.outcome === 'CANCELLED' ? T('jobs.cancelled') : r.outcome === 'AWAITING_REVIEW' ? T('jobs.awaitingReview') : T('jobs.done')}</Status>
                        <span className="font-medium text-fg">{JOB_LABELS[r.jobType as JobType]?.[T.locale] ?? r.jobType}</span>
                        {p && <Link href={productionHref(p)} className="truncate text-muted hover:text-fg" dir="auto">{p.title}</Link>}
                        <span className="ms-auto num text-[12px] text-faint">{fmtAgo(r.startedAt, T.locale)}{r.attempt > 1 ? ` · ${T('studio.attempt')} ${r.attempt}` : ''}{r.ms !== null ? ` · ${fmtMs(r.ms)}` : ''}</span>
                        <Link href={`/production?job=${r.jobId}`} className="text-[12px] font-medium text-accent-text hover:underline">{T('jobs.details')}</Link>
                      </div>
                      {r.failureClass && <p className="mt-1 text-[12.5px] text-bad"><span className="font-latin">{r.failureClass}</span>{r.errorMessage ? ` — ${r.errorMessage.slice(0, 200)}` : ''}</p>}
                      {r.toolCalls.length > 0 && <ul className="mt-1.5 flex flex-wrap gap-1.5">{r.toolCalls.map((c, i) => <li key={i}><Badge tone={c.ok ? 'neutral' : 'bad'} title={c.error}><span className="font-latin">{c.tool}</span> <span className="num text-faint">{fmtMs(c.ms)}</span></Badge></li>)}</ul>}
                    </li>
                  );
                })}
              </ol>
            )}
          </Section>
          <Section title={T('studio.failureHistory')} count={failures.length}>
            {failures.length === 0 ? <p className="rounded-2xl border border-dashed border-line px-6 py-5 text-[13px] text-faint">{T('studio.noFailureHistory')}</p> : (
              <ol className="card divide-y divide-line/70 px-4 text-[12.5px]">{failures.map((f) => { const p = f.productionId ? state.productions.find((x) => x.id === f.productionId) : undefined; return (
                <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5"><Badge tone={f.resolved ? 'ok' : 'bad'}><span className="font-latin">{f.failureClass}</span></Badge><span className="font-medium text-fg">{JOB_LABELS[f.jobType as JobType]?.[T.locale] ?? f.jobType}</span>{p && <Link href={productionHref(p)} className="truncate text-muted hover:text-fg" dir="auto">{p.title}</Link>}<span className="num text-faint">{T('studio.attempt')} {f.attempt}</span><span className="basis-full truncate text-muted" title={f.failureMessage ?? undefined} dir="auto">{f.failureMessage}</span>{f.changeMade && <span className="basis-full text-faint">→ {f.changeMade}{f.resolved ? ` · ${T('orch.accepted').toLowerCase()}` : ''}</span>}<span className="ms-auto num text-faint">{fmtAgo(f.createdAt, T.locale)}</span></li>
              ); })}</ol>
            )}
          </Section>
          <Section title={T('studio.activity')}>
            <div className="card px-5 py-2"><ActivityFeed events={events} agents={[a]} departments={d ? [d] : []} compact /></div>
          </Section>
        </div>
        <aside className="space-y-6">
          <div className="card p-5">
            <KV rows={[[T('studio.role'), a.role], [T('studio.model'), <span key="m" className="font-latin">{a.model}</span>], [T('studio.jobTypes'), executes ? a.jobTypes.map((t) => JOB_LABELS[t]?.[T.locale] ?? t).join(', ') : '—'], [T('studio.version'), <span key="v" className="font-latin">{a.version}</span>], [T('studio.limits'), `${Math.round(a.limits.timeoutMs / 60_000)} min · ${a.limits.maxAttempts} ${T('studio.attempt')}(s) · ${a.limits.resource}`], ['I/O', <span key="io" className="font-latin">{a.inputSchema} → {a.outputSchema}</span>]]} />
          </div>
          <div className="card p-5">
            <p className="mb-2 text-[12.5px] font-medium text-muted">{T('studio.quality')}</p>
            <ul className="list-disc space-y-1 ps-4 text-[13px] text-body">{a.qualityRequirements.map((q) => <li key={q}>{q}</li>)}</ul>
          </div>
          <div className="card p-5">
            <p className="mb-2 text-[12.5px] font-medium text-muted">{T('studio.tools')}</p>
            <ul className="space-y-2">{tools.map((t) => <li key={t.id} className="text-[12.5px]"><ToolChip t={t} /><p className="mt-1 text-faint">{t.description} <span className="font-latin">· v{t.version} · {t.resource}</span></p></li>)}</ul>
          </div>
          <div className="card p-5">
            <p className="mb-2 text-[12.5px] font-medium text-muted">{T('studio.skills')}</p>
            <ul className="space-y-3">{skills.map((s) => (
              <li key={s.id} className="text-[12.5px]">
                <SkillChip s={s} />
                <p className="mt-1 text-faint"><span className="font-latin">{s.path}</span> · {s.version}{s.note ? ` · ${s.note}` : ''}</p>
                {s.instructions && <Details summary={T('studio.instructions')} className="mt-1"><pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-input p-3 font-sans text-[12px] leading-relaxed text-body" dir="auto">{s.instructions}</pre></Details>}
              </li>
            ))}</ul>
          </div>
        </aside>
      </div>
    </>
  );
}
