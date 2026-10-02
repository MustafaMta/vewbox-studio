'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { agentDescription, agentName, agentRole, deptName, isDelegated, stepName, stepsOf, useAgent } from '@/studio/org';
import { useStudio } from '@/studio/store';
import { productionHref } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { PageHeader } from '@/components/ui/page';
import { Notice, Status, type Tone } from '@/components/ui/kit';
import { IconChevronLeft } from '@/components/ui/icons';
import { AgentStatus, Monogram, failureWords, fmtMs, pct } from '@/components/studio/people';
import { SkillEntry, ToolEntry, constWords, executesOf, jobWords, resourceWords } from '@/components/studio/internals';
import { fmtAgo } from '@/lib/format';

/** AN AGENT'S PROFILE (docs/DESIGN-SYSTEM-V3.md §9.3) — a person first: the monogram, name, role and status on one
 *  line, what the agent is for, what it executes (its job types and the steps it performs inside other agents'
 *  jobs), what it is doing now and its track record as words, its recent runs — delegated runs included — and its
 *  failures. Everything internal (instructions, model and limits, tools with their contracts, skills with their
 *  evidence, quality checks, input and output) is behind "Technical details". Nothing is claimed that no record
 *  shows. */
export default function AgentPage() {
  const T = useT();
  const { id } = useParams<{ id: string }>();
  const { data, error } = useAgent(id);
  const { state } = useStudio();
  if (error && !data) return <><PageHeader title={id} back={{ href: '/studio', label: T('nav.company') }} /><Notice tone="bad" title={T('co.error')}>{error}</Notice></>;
  if (!data) return <div aria-busy className="space-y-4 pt-2"><div className="skeleton h-4 w-40" /><div className="flex items-center gap-4"><div className="skeleton size-14 !rounded-full" /><div className="skeleton h-9 w-72" /></div><div className="skeleton h-4 w-[32rem] max-w-full" /></div>;
  const { agent: a, department: d, tools, skills, runs, stats, failures, current } = data;
  const lang = T.locale;
  const director = d?.directorId === a.id;
  const back = d ? { href: `/studio/departments/${d.id}`, label: deptName(d, lang) } : { href: '/studio', label: T('nav.company') };
  const prod = (pid: string | null) => (pid ? state.productions.find((x) => x.id === pid) : undefined);
  const ex = executesOf(T, a);
  const steps = stepsOf(a);
  const runWords = (r: (typeof runs)[number]) => (isDelegated(r) ? `${T('agent.delegated')} · ${r.purpose ?? jobWords(T, r.jobType)}` : jobWords(T, r.jobType));
  const outcome = (o: string | null): { tone: Tone; text: string } => o === null ? { tone: 'info', text: T('co.running') } : o === 'FAILED' ? { tone: 'bad', text: T('jobs.failed') } : o === 'CANCELLED' ? { tone: 'neutral', text: T('jobs.cancelled') } : o === 'AWAITING_REVIEW' ? { tone: 'warn', text: T('jobs.awaitingReview') } : { tone: 'ok', text: T('jobs.done') };
  const track = stats && stats.runs > 0
    ? [T.p('dept.runs', stats.runs), T.f('dept.firstTime', { p: pct(stats.firstAttemptOk, stats.firstAttempts) }), stats.p50Ms !== null ? T.f('dept.median', { t: fmtMs(stats.p50Ms) }) : null, stats.failed ? T.p('dept.failures', stats.failed) : null].filter(Boolean).join(' · ')
    : T('agent.noRuns');
  const curProd = current ? prod(current.productionId) : undefined;

  return (
    <>
      <header className="mb-8 lg:mb-10">
        <Link href={back.href} className="mb-4 inline-flex items-center gap-1 rounded-[var(--r-1)] text-[13px] font-medium text-muted transition-colors hover:text-fg"><IconChevronLeft className="size-3.5 rtl:rotate-180" aria-hidden /><span dir="auto">{back.label}</span></Link>
        <div className="flex items-start gap-4">
          <Monogram name={a.name} size={56} director={director} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-1 md:flex-row md:flex-wrap md:items-baseline md:gap-x-5">
              <h1 className="page-title" dir="auto">{agentName(a, lang)}</h1>
              <AgentStatus stat={stats} className="md:flex-none" />
            </div>
            <p className="mt-1 text-sm text-muted"><span dir="auto">{director ? T('studio.director') : agentRole(a, lang)}</span>{d && <> · <Link href={`/studio/departments/${d.id}`} className="hover:text-fg hover:underline" dir="auto">{deptName(d, lang)}</Link></>}</p>
          </div>
        </div>
        <p className="lead mt-4" dir="auto">{constWords(T, agentDescription(a, lang))}</p>
      </header>

      <dl className="facts-rows">
        <Fact term={T('dept.executes')}>
          {ex.jobs.length ? <span>{ex.jobs.join(' · ')}</span> : <span className="text-muted">{T('studio.advisory')}</span>}
        </Fact>
        {steps.length > 0 && <Fact term={T('dept.steps')}><ul className="space-y-0.5">{steps.map((s) => <li key={s.id} dir="auto">{stepName(s, lang)}</li>)}</ul></Fact>}
        <Fact term={T('agent.now')}>
          {current ? <span className="flex flex-wrap items-center gap-x-2"><Status tone="info" live>{T('co.running')}</Status><span className="text-fg">{runWords(current)}</span>{curProd && <Link href={productionHref(curProd)} className="text-muted hover:text-fg" dir="auto">{curProd.title}</Link>}<span className="num text-xs text-faint">{fmtAgo(current.startedAt, lang)}</span></span> : <span className="text-muted">{T('co.nothingAssigned')}</span>}
        </Fact>
        <Fact term={T('agent.track')}><span className={stats?.runs ? 'num text-body' : 'text-muted'}>{track}</span></Fact>
      </dl>

      <section aria-labelledby="agent-runs" className="mt-[var(--section)]">
        <h2 id="agent-runs" className="section-title mb-2">{T('studio.recentRuns')} {runs.length > 0 && <span className="num text-[13px] font-medium text-faint">{runs.length}</span>}</h2>
        {runs.length === 0 ? <p className="py-2 text-[14px] text-muted">{T('agent.noRuns')}</p> : (
          <ol className="rows">
            {runs.map((r) => { const o = outcome(r.outcome); const p = prod(r.productionId); return (
              <li key={r.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Status tone={o.tone} live={r.outcome === null}>{o.text}</Status>
                  <span className="font-medium text-fg" dir="auto">{runWords(r)}</span>
                  {isDelegated(r) && <span className="text-xs text-faint">{jobWords(T, r.jobType)}</span>}
                  {p && <Link href={productionHref(p)} className="text-muted hover:text-fg" dir="auto">{p.title}</Link>}
                  <span className="num ms-auto text-xs text-faint">{fmtAgo(r.startedAt, lang)}{r.attempt > 1 ? ` · ${T.f('agent.attemptN', { n: r.attempt })}` : ''}{r.ms !== null ? ` · ${fmtMs(r.ms)}` : ''}</span>
                  <Link href={`/production?job=${r.jobId}`} className="text-xs font-medium text-muted hover:text-fg hover:underline">{T('jobs.details')}</Link>
                </div>
                {r.failureClass && <p className="mt-0.5 text-xs text-bad" dir="auto">{failureWords(T, r.failureClass)}{r.errorMessage ? ` — ${r.errorMessage.slice(0, 200)}` : ''}</p>}
              </li>
            ); })}
          </ol>
        )}
      </section>

      <section aria-labelledby="agent-failures" className="mt-[var(--section)]">
        <h2 id="agent-failures" className="section-title mb-2">{T('studio.failureHistory')} {failures.length > 0 && <span className="num text-[13px] font-medium text-faint">{failures.length}</span>}</h2>
        {failures.length === 0 ? <p className="py-2 text-[14px] text-muted">{T('studio.noFailureHistory')}</p> : (
          <ol className="rows">{failures.map((f) => { const p = prod(f.productionId); return (
            <li key={f.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><Status tone={f.resolved ? 'ok' : 'bad'}>{failureWords(T, f.failureClass)}</Status><span className="text-fg">{jobWords(T, f.jobType)}</span>{p && <Link href={productionHref(p)} className="text-muted hover:text-fg" dir="auto">{p.title}</Link>}<span className="num text-xs text-faint">{T.f('agent.attemptN', { n: f.attempt })}</span><span className="num ms-auto text-xs text-faint">{fmtAgo(f.createdAt, lang)}</span></div>
              {f.failureMessage && <p className="mt-0.5 text-xs text-muted" dir="auto">{f.failureMessage}</p>}
              {f.changeMade && <p className="mt-0.5 text-xs text-faint" dir="auto">{T.f('agent.changeMade', { change: f.changeMade })}</p>}
            </li>
          ); })}</ol>
        )}
      </section>

      <section className="mt-[var(--section)] border-t border-line-soft pt-6">
        <details className="details">
          <summary><span className="h3">{T('dept.technical')}</span></summary>
          <div className="mt-4 grid gap-8 xl:grid-cols-2">
            <div className="space-y-6">
              <div>
                <h3 className="text-[13px] font-semibold text-fg">{a.instructionsReachModel ? T('studio.instructionsModel') : T('studio.instructionsDoc')}</h3>
                <p className="prose-copy mt-1.5 !text-[14px] !leading-6" dir="auto">{constWords(T, a.systemInstructions)}</p>
              </div>
              <div>
                <h3 className="text-[13px] font-semibold text-fg">{T('agent.modelLimits')}</h3>
                <p className="mt-1.5 text-sm text-body" dir="auto">{a.model}</p>
                <p className="mt-0.5 text-xs text-muted">{T.f('agent.limits', { min: Math.max(1, Math.round(a.limits.timeoutMs / 60_000)), attempts: T.p('agent.attempts', a.limits.maxAttempts), res: resourceWords(T, a.limits.resource) })} · {T.f('agent.version', { v: a.version })}</p>
              </div>
              {a.qualityRequirements.length > 0 && (
                <div>
                  <h3 className="text-[13px] font-semibold text-fg">{T('studio.quality')}</h3>
                  <ul className="mt-1.5 list-disc space-y-1 ps-4 text-sm text-body">{a.qualityRequirements.map((q) => <li key={q} dir="auto">{constWords(T, q)}</li>)}</ul>
                </div>
              )}
              <div>
                <h3 className="text-[13px] font-semibold text-fg">{T('agent.io')}</h3>
                <p className="mt-1.5 text-xs text-muted" dir="ltr"><span className="mono">{a.inputSchema}</span> → <span className="mono">{a.outputSchema}</span></p>
              </div>
              {steps.length > 0 && (
                <div>
                  <h3 className="text-[13px] font-semibold text-fg">{T('agent.stepsWhere')}</h3>
                  <ul className="mt-1.5 space-y-1 text-sm">{steps.map((s) => <li key={s.id}><span dir="auto">{stepName(s, lang)}</span> <span className="mono break-all text-xs text-faint" dir="ltr">{s.id} · {s.where}</span></li>)}</ul>
                </div>
              )}
            </div>
            <div className="space-y-6">
              <div>
                <h3 className="text-[13px] font-semibold text-fg">{T('studio.tools')} <span className="num font-medium text-faint">{tools.length}</span></h3>
                {tools.length ? <ul className="rows mt-1">{tools.map((t) => <ToolEntry key={t.id} tool={t} />)}</ul> : <p className="mt-1 text-sm text-muted">—</p>}
              </div>
              <div>
                <h3 className="text-[13px] font-semibold text-fg">{T('studio.skills')} <span className="num font-medium text-faint">{skills.length}</span></h3>
                {skills.length ? <ul className="rows mt-1">{skills.map((s) => <SkillEntry key={s.id} skill={s} agents={[a]} />)}</ul> : <p className="mt-1 text-sm text-muted">—</p>}
              </div>
            </div>
          </div>
        </details>
      </section>
    </>
  );
}

/** One definition row on the ground: the term on the start side, the value beside it (stacked on a phone). */
function Fact({ term, children }: { term: string; children: ReactNode }) {
  return <div className="grid gap-1 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6"><dt className="text-sm text-faint">{term}</dt><dd className="min-w-0 text-sm text-body">{children}</dd></div>;
}
