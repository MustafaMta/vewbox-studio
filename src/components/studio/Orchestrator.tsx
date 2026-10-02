'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import type { AgentDef, DepartmentDef, HandoffRow, OrgResponse } from '@/studio/org';
import { useStudio } from '@/studio/store';
import { productionHref } from '@/studio/selectors';
import { useT } from '@/components/ui/locale';
import { Badge, Status, cls } from '@/components/ui/kit';
import { IconCharacters, IconFinalCut, IconLocations, IconProduce, IconShield, IconSound, IconStory, IconStoryboard, IconStudio } from '@/components/ui/icons';
import { fmtAgo } from '@/lib/format';

/** THE COMPANY DIAGRAM — the Studio Orchestrator at the centre (the coordination of every production: its state is
 *  read from the jobs, handoffs and approvals, never simulated), the departments on a ring around it, and the
 *  handoffs between departments as thin directional connections. A department lights up only while one of its
 *  agents has a run open; a connection lights up when a handoff crossed it recently; a gold ring means a decision
 *  waits for a person. Nodes are real links; connections open the latest handoff artifact. Below the large
 *  breakpoint the ring becomes a vertical organisation. */

export const DEPT_ICON: Record<string, (p: { className?: string }) => ReactNode> = {
  EXECUTIVE: (p) => <IconStudio {...p} />, STORY: (p) => <IconStory {...p} />, CASTING: (p) => <IconCharacters {...p} />, WORLD: (p) => <IconLocations {...p} />,
  PREPRODUCTION: (p) => <IconStoryboard {...p} />, VIDEO: (p) => <IconProduce {...p} />, SOUND: (p) => <IconSound {...p} />, POST: (p) => <IconFinalCut {...p} />, QA: (p) => <IconShield {...p} />,
};

/** The ring order follows the flow of a production clockwise from the top. */
export const RING: string[] = ['EXECUTIVE', 'STORY', 'CASTING', 'WORLD', 'PREPRODUCTION', 'SOUND', 'VIDEO', 'QA', 'POST'];

export type OrchestratorState = 'IDLE' | 'READY' | 'COORDINATING' | 'PRODUCING' | 'AWAITING_REVIEW' | 'BLOCKED';
export type NodeState = 'idle' | 'active' | 'awaiting' | 'blocked';

const GPU_JOBS = new Set(['GENERATE_TAKE', 'SHOT_FRAMES', 'CHARACTER_APPEARANCE', 'CHARACTER_REFS', 'LOCATION_PLATES', 'VOICE_BUILD', 'VOICE_PREVIEW', 'DIALOGUE_AUDIO', 'GENERATE_SONG']);
const RUNNING = new Set(['PREPARING', 'GENERATING', 'DOWNLOADING', 'VALIDATING', 'POSTPROCESSING']);

/** Everything the diagram derives from the organisation response. */
export function deriveCompany(org: OrgResponse, activeProductionIds: string[]) {
  const deptOfJob = new Map<string, string>();
  for (const a of org.agents) for (const t of a.jobTypes) deptOfJob.set(t, a.department);
  const running = org.jobs.filter((j) => RUNNING.has(j.status));
  const queued = org.jobs.filter((j) => j.status === 'QUEUED');
  const activeDepts = new Set<string>();
  for (const j of running) { const d = deptOfJob.get(j.type); if (d) activeDepts.add(d); }
  for (const s of org.stats) if (s.running > 0) { const a = org.agents.find((x) => x.id === s.agentId); if (a) activeDepts.add(a.department); }
  const positions = org.positions.filter((p) => activeProductionIds.includes(p.productionId));
  const awaiting = positions.flatMap((p) => p.stages.filter((s) => s.status === 'AWAITING_APPROVAL').map((s) => ({ productionId: p.productionId, stage: s.id })));
  const blocked = positions.flatMap((p) => p.stages.filter((s) => s.status === 'INVALID' || s.status === 'REJECTED').map((s) => ({ productionId: p.productionId, stage: s.id, department: s.department, failed: s.failed })));
  const failedJobs = org.jobs.filter((j) => j.status === 'FAILED');
  const state: OrchestratorState = running.some((j) => GPU_JOBS.has(j.type)) ? 'PRODUCING' : running.length || queued.length ? 'COORDINATING' : awaiting.length ? 'AWAITING_REVIEW' : blocked.length ? 'BLOCKED' : activeProductionIds.length ? 'READY' : 'IDLE';
  const nodeState = (dept: string): NodeState => activeDepts.has(dept) ? 'active' : blocked.some((b) => b.department === dept) ? 'blocked' : dept === 'EXECUTIVE' && awaiting.length ? 'awaiting' : 'idle';
  // the connections: each stage's producing department hands to the receiving one; the Executive Office opens
  // the gate after the story (its approval starts production)
  const edges = new Map<string, { from: string; to: string; stages: string[] }>();
  const add = (from: string, to: string, stage: string) => { if (from === to) return; const k = `${from}>${to}`; const e = edges.get(k) ?? { from, to, stages: [] }; e.stages.push(stage); edges.set(k, e); };
  for (const s of org.pipeline) { if (!s.handsTo) continue; if (s.id === 'CAST_WORLD') { add('CASTING', s.handsTo, s.id); add('WORLD', s.handsTo, s.id); } else add(s.department, s.handsTo, s.id); }
  add('EXECUTIVE', 'STORY', 'STORY'); add('STORY', 'WORLD', 'STORY');
  const now = Date.now();
  const edgeStatus = (e: { from: string; to: string; stages: string[] }): { lit: NodeState; latest?: HandoffRow } => {
    const latest = org.handoffs.find((h) => h.producerDepartment === e.from && (h.receiverDepartment === e.to || (e.to === 'EXECUTIVE' && h.stage === 'EDIT')));
    if (!latest) return { lit: 'idle' };
    const ageMin = (now - new Date(latest.createdAt).getTime()) / 60_000;
    if (latest.qualityStatus !== 'VALIDATED') return { lit: 'blocked', latest };
    if (ageMin < 90) return { lit: 'active', latest };
    return { lit: 'idle', latest };
  };
  return { state, running, queued, failedJobs, activeDepts, awaiting, blocked, edges: Array.from(edges.values()).map((e) => ({ ...e, ...edgeStatus(e) })), nodeState };
}

const STATE_TONE: Record<OrchestratorState, 'neutral' | 'ok' | 'info' | 'warn' | 'bad' | 'accent'> = { IDLE: 'neutral', READY: 'ok', COORDINATING: 'accent', PRODUCING: 'info', AWAITING_REVIEW: 'warn', BLOCKED: 'bad' };

/** Positions on the ring (percent of the stage), clockwise from the top. */
function ringPositions(n: number, rx = 40, ry = 40): Array<{ x: number; y: number }> {
  return Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; return { x: 50 + rx * Math.cos(a), y: 50 + ry * Math.sin(a) }; });
}

export function CompanyDiagram({ org, selectedEdge, onSelectEdge, onSelectOrchestrator, orchestratorOpen }: { org: OrgResponse; selectedEdge: string | null; onSelectEdge: (key: string | null) => void; onSelectOrchestrator: () => void; orchestratorOpen: boolean }) {
  const T = useT();
  const { state } = useStudio();
  const activeIds = state.productions.filter((p) => p.stage !== 'COMPLETE').map((p) => p.id);
  const c = useMemo(() => deriveCompany(org, activeIds), [org, activeIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const depts = RING.map((id) => org.departments.find((d) => d.id === id)).filter((d): d is DepartmentDef => Boolean(d));
  const pos = ringPositions(depts.length);
  const at = (id: string) => pos[RING.indexOf(id)] ?? { x: 50, y: 50 };
  const [hover, setHover] = useState<string | null>(null);
  const director = (d: DepartmentDef): AgentDef | undefined => org.agents.find((a) => a.id === d.directorId);
  const stateLabel = T.dyn(`orch.state.${c.state}`);
  return (
    <div className="org-stage" data-state={c.state.toLowerCase()}>
      {/* desktop: the ring */}
      <div className="org-ring hidden lg:block" role="group" aria-label={T('orch.diagram')}>
        <svg className="org-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <defs>
            <marker id="org-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" fill="currentColor" /></marker>
          </defs>
          {depts.map((d) => { const p = at(d.id); return <line key={`spoke-${d.id}`} className="org-spoke" x1="50" y1="50" x2={p.x} y2={p.y} vectorEffect="non-scaling-stroke" />; })}
          {c.edges.map((e) => { const a = at(e.from); const b = at(e.to); const key = `${e.from}>${e.to}`;
            // the line starts and ends at the node edges (radius ≈ 5.5 % of the stage), bowed slightly outward so chords
            // do not cross the orchestrator
            const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1; const ux = dx / len, uy = dy / len;
            const x1 = a.x + ux * 6, y1 = a.y + uy * 6, x2 = b.x - ux * 6.5, y2 = b.y - uy * 6.5;
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2; const ox = mx - 50, oy = my - 50; const ol = Math.hypot(ox, oy) || 1; const bow = len > 45 ? 10 : 4;
            const cx = mx + (ox / ol) * bow, cy = my + (oy / ol) * bow;
            return <path key={key} d={`M${x1},${y1} Q${cx},${cy} ${x2},${y2}`} className={cls('org-edge', `org-edge-${e.lit}`, selectedEdge === key && 'org-edge-selected')} markerEnd="url(#org-arrow)" vectorEffect="non-scaling-stroke" onClick={() => onSelectEdge(selectedEdge === key ? null : key)} style={{ pointerEvents: 'stroke', cursor: 'pointer' }}><title>{`${org.departments.find((d) => d.id === e.from)?.name} → ${org.departments.find((d) => d.id === e.to)?.name}: ${e.stages.map((s) => T.dyn(`pipeline.${s}`, s)).join(', ')}`}</title></path>; })}
        </svg>
        <button type="button" className="org-orchestrator" style={{ left: '50%', top: '50%' }} onClick={onSelectOrchestrator} aria-expanded={orchestratorOpen} aria-label={`${T('orch.title')}: ${stateLabel}`} data-state={c.state.toLowerCase()}>
          <span className="org-orchestrator-ring" aria-hidden />
          <span className="org-orchestrator-core">
            <IconStudio aria-hidden className="size-6" />
            <span className="org-orchestrator-title">{T('orch.title')}</span>
            <span className="org-orchestrator-state">{stateLabel}</span>
          </span>
        </button>
        {depts.map((d) => { const p = at(d.id); const Icon = DEPT_ICON[d.id]; const st = c.nodeState(d.id); const dir = director(d); const agents = org.agents.filter((a) => a.department === d.id).length; return (
          <Link key={d.id} href={`/studio/departments/${d.id}`} className="org-node" style={{ left: `${p.x}%`, top: `${p.y}%` }} data-state={st} onMouseEnter={() => setHover(d.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(d.id)} onBlur={() => setHover(null)} aria-label={`${d.name}: ${T.dyn(`orch.node.${st}`)}`} aria-describedby={hover === d.id ? `org-tip-${d.id}` : undefined}>
            <span className="org-node-circle"><Icon className="size-5" />{st === 'active' && <span className="org-node-pulse" aria-hidden />}</span>
            <span className="org-node-label"><span className="org-node-name" dir="auto">{d.name}</span><span className="org-node-meta">{st === 'active' ? T('jobs.running') : st === 'awaiting' ? T('studio.stage.AWAITING_APPROVAL') : st === 'blocked' ? T('orch.blocked') : `${agents} ${T('studio.agents').toLowerCase()}`}</span></span>
            {hover === d.id && <span role="tooltip" id={`org-tip-${d.id}`} className={cls('org-tip', p.y > 55 ? 'org-tip-above' : 'org-tip-below', p.x < 30 ? 'org-tip-start' : p.x > 70 ? 'org-tip-end' : '')}><span className="block text-[12.5px] font-semibold text-fg" dir="auto">{d.name}</span><span className="mt-0.5 block text-[12px] text-muted" dir="auto">{d.responsibility}</span><span className="mt-1.5 block text-[11.5px] text-faint">{T('studio.director')}: {dir?.name}</span></span>}
          </Link>
        ); })}
      </div>

      {/* phone and tablet: the organisation as a column in production order */}
      <div className="lg:hidden">
        <button type="button" className="org-orchestrator-row" onClick={onSelectOrchestrator} aria-expanded={orchestratorOpen} data-state={c.state.toLowerCase()}>
          <span className="org-orchestrator-mini"><IconStudio aria-hidden className="size-5" /></span>
          <span className="min-w-0 flex-1 text-start"><span className="block text-[14px] font-semibold text-fg">{T('orch.title')}</span><span className="block text-[12px] text-muted">{T('orch.lead')}</span></span>
          <Status tone={STATE_TONE[c.state]} live={c.state === 'PRODUCING' || c.state === 'COORDINATING'}>{stateLabel}</Status>
        </button>
        <ol className="org-column">
          {depts.map((d) => { const Icon = DEPT_ICON[d.id]; const st = c.nodeState(d.id); const dir = director(d); return (
            <li key={d.id}>
              <Link href={`/studio/departments/${d.id}`} className="org-row" data-state={st}>
                <span className="org-node-circle org-node-circle-sm"><Icon className="size-4" />{st === 'active' && <span className="org-node-pulse" aria-hidden />}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-semibold text-fg" dir="auto">{d.name}</span><span className="block truncate text-[12px] text-faint" dir="auto">{d.responsibility}</span><span className="block text-[11.5px] text-faint">{T('studio.director')}: {dir?.name}</span></span>
                <Status tone={st === 'active' ? 'info' : st === 'awaiting' ? 'warn' : st === 'blocked' ? 'bad' : 'neutral'} live={st === 'active'} className="flex-none">{T.dyn(`orch.node.${st}`)}</Status>
              </Link>
            </li>
          ); })}
        </ol>
      </div>
    </div>
  );
}

/** What the orchestrator shows when selected: the productions in flight, which departments are at work, each
 *  production's progress through the pipeline, the decisions waiting for a person, the blockers, the recent
 *  decisions. Plain language, from the records. */
export function OrchestratorPanel({ org }: { org: OrgResponse }) {
  const T = useT();
  const { state } = useStudio();
  const active = state.productions.filter((p) => p.stage !== 'COMPLETE');
  const c = useMemo(() => deriveCompany(org, active.map((p) => p.id)), [org, active.map((p) => p.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const prod = (id: string) => state.productions.find((p) => p.id === id);
  const stageName = (s: string) => T.dyn(`pipeline.${s}`, s);
  const deptName = (id: string) => org.departments.find((d) => d.id === id)?.name ?? id;
  return (
    <div className="org-panel fade-in" role="region" aria-label={T('orch.title')}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-5 py-4">
        <div><p className="eyebrow">{T('orch.title')}</p><p className="mt-1 text-[15px] font-semibold text-fg">{T.dyn(`orch.state.${c.state}`)} <span className="font-normal text-muted">· {T.dyn(`orch.stateHint.${c.state}`)}</span></p></div>
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted"><span><span className="num text-fg">{c.running.length}</span> {T('jobs.running')}</span><span><span className="num text-fg">{c.queued.length}</span> {T('jobs.waiting')}</span><span><span className="num text-fg">{active.length}</span> {T('orch.productions').toLowerCase()}</span></div>
      </div>
      <div className="grid gap-6 p-5 md:grid-cols-2 xl:grid-cols-3">
        <section>
          <h3 className="kicker mb-2">{T('orch.productions')}</h3>
          {active.length === 0 ? <p className="text-[13px] text-faint">{T('production.empty')}</p> : (
            <ul className="space-y-2">{active.map((p) => { const pos = org.positions.find((x) => x.productionId === p.id); const done = pos?.stages.filter((s) => s.status === 'DONE').length ?? 0; const total = pos?.stages.length ?? 10; const current = pos?.stages.find((s) => s.status !== 'DONE'); return (
              <li key={p.id}><Link href={productionHref(p)} className="block rounded-lg border border-line bg-input/60 px-3 py-2 transition-colors hover:border-line-strong"><span className="block truncate text-[13px] font-medium text-fg" dir="auto">{p.title}</span><span className="mt-1 flex items-center gap-2"><span className="progress flex-1" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total}><span style={{ width: `${(done / total) * 100}%` }} /></span><span className="num text-[11.5px] text-faint">{done}/{total}</span></span>{current && <span className="mt-1 block text-[11.5px] text-muted">{T('orch.next')}: {stageName(current.id)} · {T.dyn(`studio.stage.${current.status}`)}</span>}</Link></li>
            ); })}</ul>
          )}
        </section>
        <section>
          <h3 className="kicker mb-2">{T('orch.activeDepartments')}</h3>
          {c.activeDepts.size === 0 ? <p className="text-[13px] text-faint">{T('studio.idle')}</p> : <ul className="flex flex-wrap gap-2">{Array.from(c.activeDepts).map((d) => <li key={d}><Link href={`/studio/departments/${d}`}><Badge tone="info">{deptName(d)}</Badge></Link></li>)}</ul>}
          {c.running.length > 0 && <ul className="mt-3 space-y-1 text-[12.5px]">{c.running.slice(0, 6).map((j) => { const p = j.productionId ? prod(j.productionId) : undefined; return <li key={j.id} className="flex items-center gap-2 text-muted"><span className="dot bg-info" aria-hidden /><span className="truncate">{T.dyn(`jobs.type.${j.type}`, j.type.toLowerCase().replace(/_/g, ' '))}{p ? ` · ${p.title}` : ''}{j.progress?.message ? ` — ${j.progress.message}` : ''}</span></li>; })}</ul>}
        </section>
        <section>
          <h3 className="kicker mb-2">{T('orch.pending')}</h3>
          {c.awaiting.length === 0 && c.blocked.length === 0 ? <p className="text-[13px] text-faint">{T('orch.nothingPending')}</p> : (
            <ul className="space-y-2 text-[12.5px]">
              {c.awaiting.map((a) => { const p = prod(a.productionId); return <li key={`${a.productionId}-${a.stage}`} className="flex items-start gap-2"><Status tone="warn" className="flex-none">{T('studio.stage.AWAITING_APPROVAL')}</Status><span className="min-w-0"><Link href="/production" className="font-medium text-fg hover:underline" dir="auto">{p?.title}</Link><span className="block text-faint">{stageName(a.stage)} · {T('orch.yourDecision')}</span></span></li>; })}
              {c.blocked.map((b) => { const p = prod(b.productionId); return <li key={`${b.productionId}-${b.stage}`} className="flex items-start gap-2"><Status tone="bad" className="flex-none">{T('orch.blocked')}</Status><span className="min-w-0"><span className="font-medium text-fg" dir="auto">{p?.title}</span><span className="block text-faint">{stageName(b.stage)} · {deptName(b.department)}{b.failed.length ? ` · ${b.failed.join(', ')}` : ''}</span></span></li>; })}
            </ul>
          )}
          {c.failedJobs.length > 0 && <p className="mt-2 text-[12px] text-bad">{c.failedJobs.length} {T('jobs.failed').toLowerCase()} · <Link href="/production?filter=failed" className="underline-offset-2 hover:underline">{T('nav.production')}</Link></p>}
        </section>
        <section className="md:col-span-2 xl:col-span-3">
          <h3 className="kicker mb-2">{T('orch.recentDecisions')}</h3>
          {org.approvals.length === 0 && org.handoffs.length === 0 ? <p className="text-[13px] text-faint">{T('studio.noData')}</p> : (
            <ul className="divide-y divide-line/60 text-[12.5px]">
              {[...org.approvals.map((a) => ({ at: a.createdAt, node: <li key={`a-${a.id}`} className="flex flex-wrap items-center gap-x-2 py-1.5"><Status tone={a.decision === 'APPROVED' ? 'ok' : 'warn'}>{a.decision === 'APPROVED' ? T('gate.approved') : T('studio.requestChanges')}</Status><span className="text-fg" dir="auto">{prod(a.productionId)?.title}</span><span className="text-faint">{stageName(a.stage)} · {a.by}</span><span className="ms-auto num text-faint">{fmtAgo(a.createdAt, T.locale)}</span></li> })),
                ...org.handoffs.slice(0, 8).map((h) => ({ at: h.createdAt, node: <li key={`h-${h.id}`} className="flex flex-wrap items-center gap-x-2 py-1.5"><Status tone={h.qualityStatus === 'VALIDATED' ? 'ok' : 'bad'}>{T('studio.handoffs')}</Status><span className="text-fg" dir="auto">{prod(h.productionId)?.title}</span><span className="text-faint">{stageName(h.stage)}: {deptName(h.producerDepartment)} → {h.receiverDepartment ? deptName(h.receiverDepartment) : '—'}</span><span className="ms-auto num text-faint">{fmtAgo(h.createdAt, T.locale)}</span></li> }))]
                .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10).map((x) => x.node)}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** The handoff behind a selected connection. */
export function EdgeDetail({ org, edgeKey, onClose }: { org: OrgResponse; edgeKey: string; onClose: () => void }) {
  const T = useT();
  const { state } = useStudio();
  const [from, to] = edgeKey.split('>');
  const name = (id: string) => org.departments.find((d) => d.id === id)?.name ?? id;
  const stages = org.pipeline.filter((s) => (s.id === 'CAST_WORLD' ? (from === 'CASTING' || from === 'WORLD') && s.handsTo === to : s.department === from && s.handsTo === to) || (from === 'EXECUTIVE' && to === 'STORY' && s.id === 'STORY') || (from === 'STORY' && to === 'WORLD' && s.id === 'STORY'));
  const handoffs = org.handoffs.filter((h) => h.producerDepartment === from && (h.receiverDepartment === to || (to === 'EXECUTIVE' && h.stage === 'EDIT'))).slice(0, 5);
  return (
    <div className="org-panel fade-in" role="region" aria-label={`${name(from)} → ${name(to)}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-5 py-4">
        <div><p className="eyebrow">{T('studio.handoffs')}</p><p className="mt-1 text-[15px] font-semibold text-fg">{name(from)} → {name(to)}</p><p className="mt-0.5 text-[12.5px] text-muted">{stages.map((s) => T.dyn(`pipeline.${s.id}`, s.name)).join(' · ') || '—'}</p></div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>{T('btn.close')}</button>
      </div>
      <div className="p-5">
        {handoffs.length === 0 ? <p className="text-[13px] text-faint">{T('orch.noHandoffYet')}</p> : (
          <ol className="divide-y divide-line/60">{handoffs.map((h) => { const p = state.productions.find((x) => x.id === h.productionId); return (
            <li key={h.id} className="py-3 text-[13px]">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><Status tone={h.validation.ok ? 'ok' : 'bad'}>{h.validation.ok ? T('orch.accepted') : T('orch.refused')}</Status>{p && <Link href={productionHref(p)} className="font-medium text-fg hover:underline" dir="auto">{p.title}</Link>}<span className="text-faint">{T.dyn(`pipeline.${h.stage}`, h.stage)} · {h.artifactIds.length} {T('orch.artifacts')}</span><span className="ms-auto num text-[12px] text-faint">{fmtAgo(h.createdAt, T.locale)}</span></div>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">{h.validation.checks.map((c) => <li key={c.name}><Badge tone={c.ok ? 'neutral' : 'bad'} title={c.detail}><span className="font-latin">{c.name}</span>{c.detail ? <span className="text-faint"> · {c.detail}</span> : null}</Badge></li>)}</ul>
            </li>
          ); })}</ol>
        )}
      </div>
    </div>
  );
}
