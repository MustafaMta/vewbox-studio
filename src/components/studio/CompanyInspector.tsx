'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { approveStage, type OrgDepartment, type OrgResponse } from '@/studio/org';
import { pipelineNeighbours, type Company, type CompanyEdge } from '@/studio/company';
import { useStudio } from '@/studio/store';
import { productionHref } from '@/studio/selectors';
import { JOB_LABELS, type JobType } from '@/domain/jobs';
import { T, type TFn } from '@/lib/copy';
import { useToast } from '@/components/ui/toast';
import { Button, LinkButton, Notice, Status, cls } from '@/components/ui/kit';
import { AgentStatus, Monogram } from './people';
import { teamOf, type Selection } from './Company';
import { fmtAgo } from '@/lib/format';

/** THE INSPECTOR — the selection in words, beside the constellation (§9.1). The orchestrator (the default) says
 *  where every production stands and what waits for you; a department names its people, whom it receives from and
 *  hands to, and what it is doing; a connection lists the handoffs behind it — the accessible twin of every line
 *  on the stage. Its content swaps with a short fade. */
export function CompanyInspector({ org, company: c, selection, onSelect, error, onRetry, className = '' }: { org: OrgResponse; company: Company; selection: Selection; onSelect: (s: Selection) => void; error?: string | null; onRetry?: () => void; className?: string }) {
  const key = selection.kind === 'orchestrator' ? 'o' : selection.kind === 'dept' ? `d-${selection.id}` : `e-${selection.key}`;
  // the content swap fades in over --t-slow; a one-off animation (no CSS animation left on the element), and none
  // on first render or under reduced motion
  const body = useRef<HTMLDivElement>(null);
  const prev = useRef(key);
  useEffect(() => {
    if (prev.current === key) return;
    prev.current = key;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.getAttribute('data-motion') === 'reduce';
    if (!reduce) body.current?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
  }, [key]);
  return (
    <aside className={cls('panel co-inspector', className)} aria-label={T('co.inspector')}>
      {error && <Notice tone="bad" className="mb-4" title={T('co.error')} action={onRetry && <Button size="sm" onClick={onRetry}>{T('co.tryAgain')}</Button>} />}
      <div ref={body}>
        {selection.kind === 'orchestrator' && <OrchestratorView org={org} c={c} />}
        {selection.kind === 'dept' && (() => { const d = org.departments.find((x) => x.id === selection.id); return d ? <DepartmentView org={org} c={c} d={d} onSelect={onSelect} /> : null; })()}
        {selection.kind === 'edge' && (() => { const e = c.edges.find((x) => x.key === selection.key); return e ? <EdgeView org={org} e={e} onSelect={onSelect} /> : <OrchestratorView org={org} c={c} />; })()}
      </div>
    </aside>
  );
}

const Row = ({ label, n, children }: { label: string; n: number; children?: React.ReactNode }) => (
  <div className="py-3">
    <p className="flex items-baseline justify-between gap-3 text-[14px]"><span className="font-medium text-fg">{label}</span><span className="num text-muted">{n}</span></p>
    {children}
  </div>
);

/** The orchestrator: the state sentence, the three counted rows, the recent decisions; with nothing in production,
 *  how the company works and the two ways to begin. */
export function OrchestratorView({ org, c, compact }: { org: OrgResponse; c: Company; compact?: boolean }) {
  const toast = useToast();
  const { state } = useStudio();
  const [busy, setBusy] = useState<string | null>(null);
  const prod = (id: string) => state.productions.find((p) => p.id === id);
  const stageName = (s: string) => T.dyn(`pipeline.${s}`, s);
  const decide = async (productionId: string, stage: string, decision: 'APPROVED' | 'CHANGES') => {
    setBusy(`${productionId}:${stage}:${decision}`);
    try { await approveStage(productionId, { stage, decision, by: 'producer' }); toast.ok(T('toast.saved')); } catch (e) { toast.bad((e as Error).message); } finally { setBusy(null); }
  };
  const sentence = c.state === 'IDLE' ? T('co.orch.sentence.idle') : `${T.dyn(`orch.state.${c.state}`)} — ${T.dyn(`orch.stateHint.${c.state}`)}.`;
  const nothing = c.inFlight.length === 0 && c.awaiting.length === 0 && c.blocked.length === 0;
  return (
    <div>
      {!compact && <h2 className="h2">{T('orch.title')}</h2>}
      <p className={cls('text-[14px] text-muted', !compact && 'mt-1')}>{sentence}</p>
      <div className="rows mt-3 border-t border-line-soft">
        <Row label={T('co.waitingForYou')} n={c.awaiting.length}>
          {c.awaiting.length > 0 && <ul className="mt-2 space-y-3">{c.awaiting.map((a) => { const p = prod(a.productionId); const k = `${a.productionId}:${a.stage}`; return (
            <li key={k} className="text-sm">
              <p className="text-fg"><bdi>{p?.title ?? a.productionId}</bdi> · <span className="text-warn">{stageName(a.stage)}</span></p>
              <div className="mt-1.5 flex flex-wrap gap-2"><Button size="sm" loading={busy === `${k}:APPROVED`} disabled={busy !== null} onClick={() => void decide(a.productionId, a.stage, 'APPROVED')}>{T('studio.approve')}</Button><Button size="sm" variant="quiet" disabled={busy !== null} onClick={() => void decide(a.productionId, a.stage, 'CHANGES')}>{T('studio.requestChanges')}</Button></div>
            </li>
          ); })}</ul>}
        </Row>
        <Row label={T('co.inProduction')} n={c.inFlight.length}>
          {c.inFlight.length > 0 && <ul className="mt-2 space-y-1.5">{c.inFlight.map((f, i) => { const p = prod(f.productionId); return (
            <li key={f.productionId} className="flex items-center gap-2 text-sm">
              {i < 3 && <span aria-hidden className={cls('inline-block size-2.5 flex-none rounded-full border-2', f.running ? 'border-accent' : 'border-muted')} />}
              {p ? <Link href={productionHref(p)} className="min-w-0 truncate text-fg hover:underline" dir="auto">{p.title}</Link> : <span className="text-fg">{f.productionId}</span>}
              <span className="num ms-auto flex-none text-xs text-faint">{f.done}/{f.total}{f.current ? ` · ${stageName(f.current.id)}` : ''}</span>
            </li>
          ); })}</ul>}
          {c.inFlight.length > 3 && <p className="mt-1 text-xs text-faint">{T.f('co.orch.more', { n: c.inFlight.length - 3 })}</p>}
        </Row>
        <Row label={T('orch.blocked')} n={c.blocked.length}>
          {c.blocked.length > 0 && <ul className="mt-2 space-y-2">{c.blocked.map((b) => { const p = prod(b.productionId); const d = org.departments.find((x) => x.id === b.department); return (
            <li key={`${b.productionId}-${b.stage}`} className="text-sm">
              <p className="text-fg"><bdi>{p?.title ?? b.productionId}</bdi> · <span className="text-bad">{stageName(b.stage)}</span></p>
              <p className="text-xs text-faint">{d ? d.name : b.department}{b.failed.length ? ` · ${b.failed.join(', ')}` : ''}</p>
              {p && <Link href={productionHref(p)} className="mt-1 inline-block text-xs font-medium text-muted hover:text-fg hover:underline">{T('btn.open')}</Link>}
            </li>
          ); })}</ul>}
        </Row>
      </div>
      {org.approvals.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[13px] font-semibold text-fg">{T('co.recentDecisions')}</h3>
          <ul className="mt-2 space-y-1.5 text-sm">{org.approvals.slice(0, 5).map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-2"><Status tone={a.decision === 'APPROVED' ? 'ok' : 'warn'}>{a.decision === 'APPROVED' ? T('gate.approved') : T('studio.requestChanges')}</Status><bdi className="text-fg">{prod(a.productionId)?.title ?? a.productionId}</bdi><span className="text-faint">{stageName(a.stage)}</span><span className="num ms-auto text-xs text-faint">{fmtAgo(a.createdAt)}</span></li>
          ))}</ul>
        </div>
      )}
      {nothing && (
        <div className="mt-5">
          <h3 className="text-[13px] font-semibold text-fg">{T('co.how.title')}</h3>
          <p className="mt-1.5 text-sm text-muted">{T('co.how.1')}</p>
          <p className="mt-1 text-sm text-muted">{T('co.how.2')}</p>
          <p className="mt-1 text-sm text-muted">{T('co.how.3')}</p>
          <div className="mt-4 flex flex-wrap gap-2"><LinkButton href="/new" variant="primary">{T('co.startProduction')}</LinkButton><LinkButton href="/characters/new">{T('co.addCharacter')}</LinkButton></div>
        </div>
      )}
      {c.failedJobs.length > 0 && <p className="mt-4 text-sm text-bad">{T.p('co.failedJobs', c.failedJobs.length)} · <Link href="/production?filter=failed" className="underline-offset-2 hover:underline">{T('nav.production')}</Link></p>}
    </div>
  );
}

/** The state words of a handoff path (or of its absence). */
export function edgeWords(T: TFn, e: CompanyEdge | undefined): { tone: 'neutral' | 'info' | 'warn' | 'bad' | 'ok'; text: string } {
  if (!e) return { tone: 'neutral', text: T('co.edge.none') };
  if (e.state === 'refused') return { tone: 'bad', text: T('co.edge.refused') };
  if (e.state === 'waiting') return { tone: 'warn', text: T('co.edge.waiting') };
  if (e.state === 'recent') return { tone: 'info', text: T.f('co.edge.recent', { ago: fmtAgo(e.latest.createdAt) }) };
  return { tone: 'ok', text: T.f('co.edge.used', { ago: fmtAgo(e.latest.createdAt) }) };
}

function DepartmentView({ org, c, d, onSelect }: { org: OrgResponse; c: Company; d: OrgDepartment; onSelect: (s: Selection) => void }) {
  const { state } = useStudio();
  const team = teamOf(org, d);
  const director = org.agents.find((a) => a.id === d.directorId);
  const place = pipelineNeighbours(org, d.id);
  const name = (id: string) => { const x = org.departments.find((y) => y.id === id); return x ? x.name : id; };
  const edgeOf = (from: string, to: string) => c.edges.find((e) => e.from === from && e.to === to);
  const runningJobs = org.jobs.filter((j) => team.some((a) => (a.jobTypes as string[]).includes(j.type)) && !['QUEUED', 'FAILED', 'COMPLETED', 'CANCELLED', 'AWAITING_REVIEW'].includes(j.status));
  const link = (id: string, edge: CompanyEdge | undefined, gate: boolean) => { const w = edgeWords(T, edge); return (
    <li key={id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-2 text-sm">
      <button type="button" className="text-start font-medium text-fg hover:underline" onClick={() => onSelect(edge ? { kind: 'edge', key: edge.key } : { kind: 'dept', id })}>{name(id)}{gate && <span className="font-normal text-faint"> · {T('co.afterApproval')}</span>}</button>
      <Status tone={w.tone}>{w.text}</Status>
    </li>
  ); };
  return (
    <div>
      <p className="eyebrow">{T('co.dept.eyebrow')}</p>
      <h2 className="h2 mt-1" dir="auto">{d.name}</h2>
      <p className="mt-1 text-sm text-muted" dir="auto">{d.responsibility}</p>
      {director && <p className="mt-2 text-sm text-muted">{T('studio.director')}: <Link href={`/studio/agents/${director.id}`} className="font-medium text-fg hover:underline" dir="auto">{director.name}</Link></p>}

      <h3 className="mt-5 text-[13px] font-semibold text-fg">{T('co.team')} <span className="num font-medium text-faint">{team.length}</span></h3>
      <ul className="rows mt-1">{team.map((a) => (
        <li key={a.id}>
          <Link href={`/studio/agents/${a.id}`} className="flex items-center gap-3 py-2 hover:text-fg">
            <Monogram name={a.name} size={28} director={a.id === d.directorId} />
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-fg" dir="auto">{a.name}</span><span className="block text-xs text-faint" dir="auto">{a.role}</span></span>
            <AgentStatus stat={org.stats.find((s) => s.agentId === a.id)} className="flex-none" />
          </Link>
        </li>
      ))}</ul>

      <h3 className="mt-5 text-[13px] font-semibold text-fg">{T('co.receivesFrom')}</h3>
      {place.from.length ? <ul className="rows">{place.from.map((x) => link(x.id, edgeOf(x.id, d.id), x.gate))}</ul> : <p className="mt-1 text-sm text-muted">{d.id === 'EXECUTIVE' ? T('co.coordinates') : T('co.fromYou')}</p>}
      <h3 className="mt-4 text-[13px] font-semibold text-fg">{T('co.handsTo')}</h3>
      {place.to.length ? <ul className="rows">{place.to.map((x) => link(x.id, edgeOf(d.id, x.id), x.gate))}</ul> : <p className="mt-1 text-sm text-muted">{d.id === 'EXECUTIVE' ? T('co.coordinates') : T('co.toYou')}</p>}

      <h3 className="mt-5 text-[13px] font-semibold text-fg">{T('co.currentWork')}</h3>
      {runningJobs.length === 0 ? <p className="mt-1 text-sm text-muted">{T('co.nothingAssigned')}</p> : (
        <ul className="mt-1 space-y-1.5 text-sm">{runningJobs.slice(0, 5).map((j) => { const p = j.productionId ? state.productions.find((x) => x.id === j.productionId) : undefined; return (
          <li key={j.id} className="flex flex-wrap items-center gap-x-2"><Status tone="info" live>{JOB_LABELS[j.type as JobType] ?? j.type}</Status>{p && <bdi className="text-muted">{p.title}</bdi>}{j.progress?.message && <span className="basis-full text-xs text-faint" dir="auto">{j.progress.message}</span>}</li>
        ); })}</ul>
      )}
      <LinkButton href={`/studio/departments/${d.id}`} variant="primary" className="mt-5">{T('co.openDept')}</LinkButton>
    </div>
  );
}

function EdgeView({ org, e, onSelect }: { org: OrgResponse; e: CompanyEdge; onSelect: (s: Selection) => void }) {
  const { state } = useStudio();
  const name = (id: string) => { const x = org.departments.find((y) => y.id === id); return x ? x.name : id; };
  return (
    <div>
      <p className="eyebrow">{T('co.edge.eyebrow')}</p>
      <h2 className="h2 mt-1"><button type="button" className="hover:underline" onClick={() => onSelect({ kind: 'dept', id: e.from })}>{name(e.from)}</button> → <button type="button" className="hover:underline" onClick={() => onSelect({ kind: 'dept', id: e.to })}>{name(e.to)}</button></h2>
      <p className="mt-1 text-sm text-muted">{T('co.carries')}: {e.stages.map((s) => T.dyn(`pipeline.${s}`, s)).join(' · ')}</p>
      <h3 className="mt-5 text-[13px] font-semibold text-fg">{T('co.lastHandoffs')}</h3>
      <ol className="rows mt-1">{e.handoffs.slice(0, 5).map((h) => { const p = state.productions.find((x) => x.id === h.productionId); const ok = h.qualityStatus === 'VALIDATED'; const passed = h.validation.checks.filter((x) => x.ok).length; const failed = h.validation.checks.filter((x) => !x.ok); return (
        <li key={h.id} className="py-2.5 text-sm">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><Status tone={ok ? 'ok' : 'bad'}>{ok ? T('orch.accepted') : T('orch.refused')}</Status><bdi className="text-fg">{p?.title ?? h.productionId}</bdi><span className="num ms-auto text-xs text-faint">{fmtAgo(h.createdAt)}</span></div>
          <p className="mt-0.5 text-xs text-faint">{T.dyn(`pipeline.${h.stage}`, h.stage)}{h.validation.checks.length ? ` · ${T.f('co.checksPassed', { ok: passed, n: h.validation.checks.length })}` : ''}</p>
          {failed.length > 0 && <p className="mt-0.5 text-xs text-bad" dir="auto">{failed.map((x) => `${x.name}${x.detail ? `: ${x.detail}` : ''}`).join(' · ')}</p>}
          {p && <Link href={productionHref(p)} className="mt-1 inline-block text-xs font-medium text-muted hover:text-fg hover:underline">{T('co.openProduction')}</Link>}
        </li>
      ); })}</ol>
    </div>
  );
}
