'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useLive, useOrg, type HandoffRow, type OrgDepartment, type OrgResponse } from '@/studio/org';
import { RING, VIEW, deriveCompany, edgeGeometry, seats, type Company, type CompanyEdge, type NodeState, type Seat } from '@/studio/company';
import { useStudio } from '@/studio/store';
import { useShell } from '@/components/shell/context';
import { Button, ErrorState, JobDot, LinkButton, Skeleton, SkeletonRegion, StateWord, TabBar, TabPanel } from '@/components/ui/kit';
import { IconChevronRight } from '@/components/ui/icons';
import { RunningNow } from '@/components/production/Running';
import { EmptyLine, HeadSkeleton, PageHead, Row, Rows, RowsSkeleton, Section, SectionHeadSkeleton } from './parts';
import {
  checksLine, countWord, departmentCodes, departmentName, departmentsInOrder, duration, handoffTarget, percent, plural, recordOf,
  shortWhen, skillsOfTeam, spanWords, stageName, teamOf, toolsOfTeam,
} from './model';

/** THE STUDIO COMPANY (docs/DESIGN-SYSTEM-V5.md §8.9 on VISUAL-STANDARD-V5.1) — the live company from the run record:
 *  the Studio Orchestrator at the centre, the nine departments on one ring in pipeline order (clockwise from the top),
 *  the producer outside at the two approval gates, and a line only where work was handed over, with its count. The
 *  inspector beside the ring says the selection in words; on phones and tablets the same company is a spine. Below:
 *  what runs now, the record of handoffs, approvals and activity, and each department's run record. Every number
 *  comes from /api/studio/org; nothing is decorative or simulated. */

export interface Health { intake?: { paused: boolean; since?: string | null; reason?: string | null } | null; queue?: { queued: number; running: number; failed24h: number; completed24h: number } | null }
type Selection = { kind: 'orchestrator' } | { kind: 'dept'; id: string } | { kind: 'edge'; key: string };

export function StudioCompany() {
  const router = useRouter();
  const { state } = useStudio();
  const { decisions } = useShell();
  const { data: org, error, reload } = useOrg();
  const { data: health } = useLive<Health>('/api/health');
  const active = state.productions.filter((p) => p.stage !== 'COMPLETE').map((p) => p.id);
  const key = active.join(',');
  const company = useMemo(() => (org ? deriveCompany(org, active) : null), [org, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selection, setSelection] = useState<Selection>({ kind: 'orchestrator' });
  useEffect(() => { const sel = new URLSearchParams(window.location.search).get('select'); if (sel) setSelection({ kind: 'dept', id: sel }); }, []);

  if (!org || !company) {
    if (error) return (
      <div className="cp company">
        <PageHead title="Studio Company" />
        <ErrorState title="The company record could not be read" action={<Button size="sm" onClick={reload}>Try again</Button>} details={error}>The organisation did not answer. Nothing is lost; try again.</ErrorState>
      </div>
    );
    return <StudioCompanySkeleton />;
  }
  const depts = departmentsInOrder(org);
  const paused = Boolean(health?.intake?.paused);
  return (
    <div className="cp company">
      <PageHead title="Studio Company" lead={`${countWord(depts.length, true)} departments and ${org.agents.length} agents. Lines are drawn only where work was handed over, with the count on each.`} />
      <StateLine org={org} company={company} health={health} waiting={decisions.count} />
      <div className="co-grid">
        <CompanyStage org={org} company={company} selection={selection} onSelect={setSelection} onOpen={(id) => router.push(`/studio/departments/${id}`)} />
        <Inspector org={org} company={company} selection={selection} health={health} waiting={decisions.count} />
      </div>
      <CompanySpine org={org} company={company} health={health} waiting={decisions.count} />
      <Section id="running" title="Running now"><RunningNow paused={paused} /></Section>
      <OnRecord org={org} />
      <DepartmentRecords org={org} />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------- the state line

/** The orchestrator's state in words: paused (since when), making, waiting for you, ready. */
function orchestratorWords(c: Company, health: Health | null | undefined, waiting: number): { tone: 'idle' | 'running' | 'waiting'; words: string } {
  const running = c.running.length;
  if (running) return { tone: 'running', words: `Making · ${running} ${plural(running, 'job')}` };
  if (health?.intake?.paused) return { tone: 'idle', words: 'Paused' };
  if (waiting) return { tone: 'waiting', words: `${countWord(waiting, true)} ${plural(waiting, 'decision')} ${waiting === 1 ? 'waits' : 'wait'} for you` };
  if (c.queued.length) return { tone: 'idle', words: `${c.queued.length} queued` };
  return { tone: 'idle', words: 'Ready' };
}

function StateLine({ org, company: c, health, waiting }: { org: OrgResponse; company: Company; health: Health | null; waiting: number }) {
  const s = orchestratorWords(c, health, waiting);
  const since = shortWhen(health?.intake?.since);
  const facts = [
    health?.intake?.paused ? `Intake paused${since ? ` since ${since}` : ''}` : null,
    `${org.queue.completed24h} finished and ${org.queue.failed24h} failed in the last 24 hours`,
  ].filter(Boolean);
  return (
    <div className="card co-state" role="status">
      {s.tone === 'running' ? <JobDot>{s.words}</JobDot> : <StateWord tone={s.tone === 'waiting' ? 'waiting' : 'idle'}>{s.words}</StateWord>}
      <span className="t-meta co-state-facts">{facts.map((f) => <span key={f}>{f}</span>)}</span>
      {waiting > 0 && <Link href="/production#needs-you" className="co-state-link"><span className="t-ro co-wait-count">{waiting}</span> waiting in Production<IconChevronRight aria-hidden /></Link>}
    </div>
  );
}

// --------------------------------------------------------------------------------------------------- the stage

const RECENT_LABEL = 'in the last 90 minutes';
const nodeWords = (org: OrgResponse, c: Company, d: OrgDepartment): { state: NodeState; words: string } => {
  const st = c.nodeState(d.id);
  if (st === 'working') { const id = Array.from(c.workingAgents.get(d.id) ?? [])[0]; const a = org.agents.find((x) => x.id === id); return { state: st, words: a ? `${a.name} is working` : 'Working' }; }
  if (st === 'waiting') return { state: st, words: 'Waits for you' };
  if (st === 'blocked') return { state: st, words: 'Handoff refused' };
  const n = teamOf(org.agents, d).length;
  return { state: st, words: `${n} ${plural(n, 'agent')}` };
};
const refusedOf = (e: CompanyEdge) => e.handoffs.filter((h) => h.qualityStatus !== 'VALIDATED').length;
const edgeAria = (org: OrgResponse, e: CompanyEdge) => `${departmentName(org, e.from)} to ${e.to === 'EXECUTIVE' && e.stages.includes('EDIT') ? 'you' : departmentName(org, e.to)}: ${e.handoffs.length} ${plural(e.handoffs.length, 'handoff')}${refusedOf(e) ? `, ${refusedOf(e)} refused` : ''}`;

/** Where the producer stands: outside the ring, beside the department whose stage needs a human approval. */
const GATE_SPOT: Record<string, { x: number; y: number }> = { STORY: { x: 860, y: 40 }, EDIT: { x: 140, y: 40 } };

function CompanyStage({ org, company: c, selection, onSelect, onOpen }: { org: OrgResponse; company: Company; selection: Selection; onSelect: (s: Selection) => void; onOpen: (id: string) => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const el = frame.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width || 720));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const s = width / VIEW.w;
  const disc = 44;
  const seatList = useMemo(() => seats(), []);
  const seatOf = (id: string) => seatList.find((x) => x.id === id)!;
  const depts = departmentsInOrder(org);
  const codes = useMemo(() => departmentCodes(depts), [depts]);
  const gates = org.pipeline.filter((st) => st.approval === 'HUMAN');

  // roving focus: the orchestrator, then the departments in pipeline order (one Tab stop; arrows walk the ring)
  const order = ['ORCH', ...depts.map((d) => d.id)];
  const [focusId, setFocusId] = useState<string>(selection.kind === 'dept' ? selection.id : 'ORCH');
  const btns = useRef<Record<string, HTMLButtonElement | null>>({});
  const move = (id: string) => { setFocusId(id); btns.current[id]?.focus(); };
  useEffect(() => { if (selection.kind === 'dept') setFocusId(selection.id); }, [selection]);
  const onKeyDown = (e: KeyboardEvent) => {
    const i = order.indexOf(focusId); const n = depts.length;
    const step = (dir: 1 | -1) => (i <= 0 ? (dir === 1 ? order[1] : order[n]) : order[((i - 1 + dir + n) % n) + 1]);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(step(1)); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(step(-1)); }
    else if (e.key === 'Home') { e.preventDefault(); move('ORCH'); }
    else if (e.key === 'End') { e.preventDefault(); move(order[n]); }
    else if (e.key === 'Escape') { e.preventDefault(); onSelect({ kind: 'orchestrator' }); move('ORCH'); }
  };

  // the hovered or selected thing stays bright, the rest steps back
  const [hover, setHover] = useState<Selection | null>(null);
  const hot = hover ?? (selection.kind === 'orchestrator' ? null : selection);
  const bright = useMemo(() => {
    if (!hot) return null;
    if (hot.kind === 'dept') return { nodes: new Set([hot.id, ...c.neighbours(hot.id)]), edges: new Set(c.edgesOf(hot.id).map((e) => e.key)) };
    if (hot.kind === 'edge') { const e = c.edges.find((x) => x.key === hot.key); return e ? { nodes: new Set([e.from, e.to]), edges: new Set([e.key]) } : null; }
    return null;
  }, [hot, c]);

  const rDisc = (disc / 2 + 6) / s;
  const arrow = 6 / s;
  const geo = (e: CompanyEdge) => {
    const reverse = c.edges.some((x) => x.from === e.to && x.to === e.from);
    return edgeGeometry(seatOf(e.from), seatOf(e.to), rDisc, rDisc + 1 / s, arrow, reverse ? 18 : 0);
  };
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  return (
    <section className="card co-stage" aria-labelledby="co-stage-h">
      <h2 id="co-stage-h" className="sr-only">The company</h2>
      <div ref={frame} className="co-frame" role="group" aria-label="The company: the orchestrator and nine departments" onKeyDown={onKeyDown} onMouseLeave={() => setHover(null)}>
        <svg className="co-lines" viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} aria-hidden focusable="false">
          <ellipse className="co-orbit" cx={VIEW.cx} cy={VIEW.cy} rx={VIEW.rx} ry={VIEW.ry} vectorEffect="non-scaling-stroke" />
          {gates.map((g) => { const spot = GATE_SPOT[g.id]; const owner = seatOf(g.department); return spot && owner ? <path key={`gate-${g.id}`} className="co-gate-line" d={`M${spot.x},${spot.y + 14} L${owner.x},${owner.y - disc / 2 / s - 6 / s}`} vectorEffect="non-scaling-stroke" /> : null; })}
          {c.edges.map((e) => { const g = geo(e); const sel = selection.kind === 'edge' && selection.key === e.key; const dim = bright && !bright.edges.has(e.key) ? true : undefined; return (
            <g key={e.key} data-dim={dim}>
              <path className="co-edge" data-state={e.state} data-selected={sel || undefined} d={g.d} vectorEffect="non-scaling-stroke" />
              <path className="co-edge co-arrow" data-state={e.state} data-selected={sel || undefined} d={g.arrow} vectorEffect="non-scaling-stroke" />
              <path className="co-edge-hit" d={g.d} onClick={() => onSelect(sel ? { kind: 'orchestrator' } : { kind: 'edge', key: e.key })} onMouseEnter={() => setHover({ kind: 'edge', key: e.key })} onMouseLeave={() => setHover(null)} />
            </g>
          ); })}
        </svg>

        {c.edges.map((e) => { const g = geo(e); const bad = refusedOf(e); const dim = bright && !bright.edges.has(e.key) ? true : undefined; return (
          <button key={`n-${e.key}`} type="button" tabIndex={-1} className="co-count" data-state={e.state} data-dim={dim} style={{ insetInlineStart: pct(g.mid.x, VIEW.w), insetBlockStart: pct(g.mid.y, VIEW.h) }}
            aria-label={edgeAria(org, e)} onClick={() => onSelect({ kind: 'edge', key: e.key })} onMouseEnter={() => setHover({ kind: 'edge', key: e.key })} onMouseLeave={() => setHover(null)}>
            {e.handoffs.length}{bad > 0 && <span className="co-count-bad">✕{bad}</span>}
          </button>
        ); })}

        {gates.map((g) => { const spot = GATE_SPOT[g.id]; if (!spot) return null; const waits = c.awaiting.some((a) => a.stage === g.id); const done = org.approvals.filter((a) => a.stage === g.id).length; return (
          <span key={`you-${g.id}`} className="co-gate" data-waiting={waits || undefined} style={{ insetInlineStart: pct(spot.x, VIEW.w), insetBlockStart: pct(spot.y, VIEW.h) }}>
            <span className="co-gate-you">You</span>
            <span className="co-gate-words">{g.id === 'EDIT' ? 'approve the cut' : `approve the ${g.name.toLowerCase()}`}{waits ? ' · waits' : done ? ` · ${done} approved` : ''}</span>
          </span>
        ); })}

        <button ref={(el) => { btns.current.ORCH = el; }} type="button" className="co-orch" style={{ insetInlineStart: '50%', insetBlockStart: pct(VIEW.cy, VIEW.h) }}
          tabIndex={focusId === 'ORCH' ? 0 : -1} aria-pressed={selection.kind === 'orchestrator'} onFocus={() => setFocusId('ORCH')}
          onClick={() => { setFocusId('ORCH'); onSelect({ kind: 'orchestrator' }); }}>
          <span className="co-orch-name">Studio Orchestrator</span>
          <span className="co-orch-state">{c.inFlight.length ? `${c.inFlight.length} in flight` : c.running.length ? 'Coordinating' : 'Idle'}</span>
          <ProductionRings c={c} />
        </button>

        {depts.map((d) => {
          const seat = seatOf(d.id); const w = nodeWords(org, c, d);
          const selected = selection.kind === 'dept' && selection.id === d.id;
          return (
            <button key={d.id} ref={(el) => { btns.current[d.id] = el; }} type="button" className="co-node" data-state={w.state} data-placement={seat.placement}
              data-dim={bright && !bright.nodes.has(d.id) ? true : undefined} style={seatStyle(seat, disc)} tabIndex={focusId === d.id ? 0 : -1} aria-pressed={selected}
              aria-label={`${d.name}. ${w.words}.`} onFocus={() => setFocusId(d.id)}
              onClick={() => { setFocusId(d.id); onSelect(selected ? { kind: 'orchestrator' } : { kind: 'dept', id: d.id }); }} onDoubleClick={() => onOpen(d.id)}
              onMouseEnter={() => setHover({ kind: 'dept', id: d.id })} onMouseLeave={() => setHover(null)}>
              <span className="co-disc" aria-hidden><span className="t-ro">{codes.get(d.id)}</span></span>
              <span className="co-label" style={labelStyle(seat, s, disc)}>
                <span className="co-name">{d.name}</span>
                <span className="co-node-state">{w.words}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="t-meta co-legend">
        {c.edges.length === 0 ? 'Nothing has been handed over yet. A production passes through these departments in this order.'
          : `Numbers count the handoffs among the latest ${org.handoffs.length} on record; a brighter line passed work ${RECENT_LABEL}; ✕ marks a refused handoff. Cast & world is shared by Casting and World Building.`}
      </p>
    </section>
  );
}

/** One 2 px ring per production in flight (at most three) outside the orchestrator: the arc is the share of its
 *  pipeline stages done. */
function ProductionRings({ c }: { c: Company }) {
  const rings = c.inFlight.slice(0, 3);
  if (!rings.length) return null;
  const size = 128; const box = size + 2 * 24;
  return (
    <svg className="co-rings" width={box} height={box} viewBox={`0 0 ${box} ${box}`} aria-hidden focusable="false">
      {rings.map((p, k) => { const r = size / 2 + 6 * (k + 1); const circ = 2 * Math.PI * r; const frac = Math.max(0, Math.min(1, p.done / p.total)); return (
        <g key={p.productionId} transform={`rotate(-90 ${box / 2} ${box / 2})`}>
          <circle cx={box / 2} cy={box / 2} r={r} className="co-ring-track" />
          {frac > 0 && <circle cx={box / 2} cy={box / 2} r={r} className="co-ring-done" data-running={p.running || undefined} strokeDasharray={`${circ * frac} ${circ}`} />}
        </g>
      ); })}
    </svg>
  );
}

/** A seat's button: the disc centre lands on the ring point whatever the label's placement. */
function seatStyle(seat: Seat, disc: number): CSSProperties {
  const base = { insetInlineStart: `${(seat.x / VIEW.w) * 100}%`, insetBlockStart: `${(seat.y / VIEW.h) * 100}%`, '--disc': `${disc}px` } as CSSProperties;
  if (seat.placement === 'below') return { ...base, flexDirection: 'column', transform: `translate(-50%, ${-(disc / 2 + 4)}px)` };
  if (seat.placement === 'above') return { ...base, flexDirection: 'column-reverse', transform: `translate(-50%, calc(-100% + ${disc / 2 + 4}px))` };
  const right = seat.side !== 'left';
  return { ...base, flexDirection: right ? 'row' : 'row-reverse', transform: right ? `translate(${-(disc / 2 + 4)}px, -50%)` : `translate(calc(-100% + ${disc / 2 + 4}px), -50%)` };
}
/** A label's measure: at most 150 px, less where the stage edge is nearer; the side labels stay outside the ring. */
function labelStyle(seat: Seat, s: number, disc: number): CSSProperties {
  if (seat.placement !== 'beside') return { textAlign: 'center', alignItems: 'center', maxInlineSize: '150px' };
  const right = seat.side !== 'left';
  const room = (right ? VIEW.w - seat.x : seat.x) * s - disc / 2 - 12;
  return { textAlign: right ? 'left' : 'right', alignItems: right ? 'flex-start' : 'flex-end', maxInlineSize: `${Math.max(96, Math.min(150, Math.floor(room)))}px` };
}

// ------------------------------------------------------------------------------------------------- the inspector

function Inspector({ org, company: c, selection, health, waiting }: { org: OrgResponse; company: Company; selection: Selection; health: Health | null; waiting: number }) {
  return (
    <aside className="card co-inspector" aria-live="polite" aria-label="Selection">
      {selection.kind === 'dept' ? <DepartmentView org={org} c={c} id={selection.id} />
        : selection.kind === 'edge' ? <EdgeView org={org} edge={c.edges.find((e) => e.key === selection.key)} />
          : <OrchestratorView org={org} c={c} health={health} waiting={waiting} />}
    </aside>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="co-fact"><dt className="t-label">{label}</dt><dd>{children}</dd></div>;
}

function OrchestratorView({ org, c, health, waiting }: { org: OrgResponse; c: Company; health: Health | null; waiting: number }) {
  const s = orchestratorWords(c, health, waiting);
  const gates = org.pipeline.filter((x) => x.approval === 'HUMAN');
  return (
    <>
      <p className="t-label co-insp-kicker">The orchestrator</p>
      <h3 className="t-title co-insp-title">Studio Orchestrator</h3>
      <p className="t-body co-insp-body">Passes each production through the {countWord(org.pipeline.length)} pipeline stages in order and stops at your {countWord(gates.length)} {plural(gates.length, 'approval')}: {gates.map((g) => (g.id === 'EDIT' ? 'the cut' : `the ${g.name.toLowerCase()}`)).join(' and ')}.</p>
      <dl className="co-facts">
        <Fact label="State">{s.tone === 'running' ? <JobDot>{s.words}</JobDot> : <StateWord tone={s.tone === 'waiting' ? 'waiting' : 'idle'}>{s.words}</StateWord>}</Fact>
        <Fact label="Queue"><span className="t-ro t-ro-md">{org.queue.running}</span> running · <span className="t-ro t-ro-md">{org.queue.queued}</span> queued</Fact>
        <Fact label="Last 24 hours"><span className="t-ro t-ro-md">{org.queue.completed24h}</span> finished · <span className="t-ro t-ro-md">{org.queue.failed24h}</span> failed</Fact>
        <Fact label="Waiting for you">{waiting ? <Link href="/production#needs-you" className="cp-link"><span className="t-ro t-ro-md co-wait-count">{waiting}</span> {plural(waiting, 'decision')}</Link> : 'Nothing'}</Fact>
      </dl>
    </>
  );
}

function DepartmentView({ org, c, id }: { org: OrgResponse; c: Company; id: string }) {
  const depts = departmentsInOrder(org);
  const d = depts.find((x) => x.id === id);
  if (!d) return <p className="t-body">This department is not in the organisation.</p>;
  const team = teamOf(org.agents, d);
  const skills = skillsOfTeam(org.skills, team);
  const verified = skills.filter((x) => x.status === 'VERIFIED');
  const tools = toolsOfTeam(org.tools, team);
  const working = Array.from(c.workingAgents.get(d.id) ?? []).map((a) => org.agents.find((x) => x.id === a)?.name).filter(Boolean);
  const recent = org.handoffs.filter((h) => h.producerDepartment === d.id).slice(0, 3);
  const stages = d.stages.map((st) => stageName(org, st)).join(' · ');
  return (
    <>
      <p className="t-label co-insp-kicker">Department {depts.indexOf(d) + 1} of {depts.length}{stages ? ` · ${stages}` : ''}</p>
      <h3 className="t-title co-insp-title">{d.name}</h3>
      <p className="t-body co-insp-body">{d.responsibility}</p>
      <dl className="co-facts">
        <Fact label="Director and agents">
          <ul className="co-team">{team.map((a) => <li key={a.id}><Link href={`/studio/agents/${a.id}`} className="cp-link">{a.name}</Link><span className="t-meta"> · {a.id === d.directorId ? 'director' : 'agent'}</span></li>)}</ul>
        </Fact>
        <Fact label={`Verified skills · ${verified.length} of ${skills.length}`}>
          {verified.length ? <span className="co-tags">{verified.map((x) => <span key={x.id} className="badge badge-neutral" title={x.name}>{x.name}</span>)}</span> : 'None verified yet'}
        </Fact>
        <Fact label="Tools">{tools.length ? tools.map((t) => t.name).join(', ') : 'No tools of its own'}</Fact>
        <Fact label="Now">{working.length ? <JobDot>{working.join(', ')} {working.length === 1 ? 'is' : 'are'} working</JobDot> : 'Nothing assigned now'}</Fact>
        <Fact label="Recent work">
          {recent.length ? <ul className="co-team">{recent.map((h) => <li key={h.id}>{stageName(org, h.stage)} → {handoffTarget(org, h)}<span className="t-meta"> · {shortWhen(h.createdAt)}</span></li>)}</ul> : 'Nothing handed over yet'}
        </Fact>
      </dl>
      <LinkButton href={`/studio/departments/${d.id}`} size="sm" className="co-insp-open">Open the department</LinkButton>
    </>
  );
}

function EdgeView({ org, edge: e }: { org: OrgResponse; edge?: CompanyEdge }) {
  if (!e) return <p className="t-body">This connection is no longer in the record.</p>;
  const bad = refusedOf(e);
  return (
    <>
      <p className="t-label co-insp-kicker">Handoffs</p>
      <h3 className="t-title co-insp-title">{departmentName(org, e.from)} → {e.to === 'EXECUTIVE' && e.stages.includes('EDIT') ? 'you' : departmentName(org, e.to)}</h3>
      <dl className="co-facts">
        <Fact label="On record"><span className="t-ro t-ro-md">{e.handoffs.length}</span> {plural(e.handoffs.length, 'handoff')}{bad ? <> · <span className="co-bad">{bad} refused</span></> : null}</Fact>
        <Fact label="Stages">{e.stages.map((st) => stageName(org, st)).join(' · ')}</Fact>
        <Fact label="Latest">{shortWhen(e.latest.createdAt)}{checksLine(e.latest.validation.checks) ? ` · ${checksLine(e.latest.validation.checks)}` : ''}</Fact>
      </dl>
    </>
  );
}

// ------------------------------------------------------------------------------------------- the spine (< 1024)

function CompanySpine({ org, company: c, health, waiting }: { org: OrgResponse; company: Company; health: Health | null; waiting: number }) {
  const depts = departmentsInOrder(org);
  const codes = departmentCodes(depts);
  return (
    <section className="co-spine" aria-labelledby="co-spine-h">
      <h2 id="co-spine-h" className="sr-only">The company, in pipeline order</h2>
      <div className="card co-spine-orch"><OrchestratorView org={org} c={c} health={health} waiting={waiting} /></div>
      <ol className="co-spine-list">
        {depts.map((d) => {
          const w = nodeWords(org, c, d);
          const out = c.edges.filter((e) => e.from === d.id);
          return (
            <li key={d.id} data-state={w.state}>
              <Link href={`/studio/departments/${d.id}`} className="card co-spine-row">
                <span className="co-disc" aria-hidden><span className="t-ro">{codes.get(d.id)}</span></span>
                <span className="co-spine-words">
                  <span className="t-card co-spine-name">{d.name}</span>
                  <span className="co-node-state">{w.words}</span>
                  {out.map((e) => <span key={e.key} className="t-meta co-spine-rel">→ {e.to === 'EXECUTIVE' && e.stages.includes('EDIT') ? 'you' : departmentName(org, e.to)}: {e.handoffs.length}{refusedOf(e) ? `, ${refusedOf(e)} refused` : ''}</span>)}
                </span>
                <IconChevronRight aria-hidden className="co-chev" />
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------- on the record

const DECISION_WORDS: Record<string, { tone: 'done' | 'failed' | 'waiting'; words: string }> = { APPROVED: { tone: 'done', words: 'Approved' }, REJECTED: { tone: 'failed', words: 'Rejected' }, CHANGES: { tone: 'waiting', words: 'Changes asked' } };

function OnRecord({ org }: { org: OrgResponse }) {
  const { state } = useStudio();
  const [tab, setTab] = useState<'handoffs' | 'approvals' | 'activity'>('handoffs');
  const [all, setAll] = useState(false);
  const title = (pid: string | null) => { const p = pid ? state.productions.find((x) => x.id === pid) : undefined; return p ? (p.kind === 'MUSIC_VIDEO' ? p.song?.title || p.title : p.title) : null; };
  const handoffs = [...org.handoffs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const limit = all ? Infinity : 8;
  const more = (n: number) => (n > 8 ? <Button size="sm" variant="quiet" className="cp-more" onClick={() => setAll((v) => !v)}>{all ? 'Show fewer' : `Show all ${n}`}</Button> : null);
  return (
    <Section id="record" title="On the record" description="Every handoff between departments, your approvals and the latest activity, as the studio recorded them.">
      <TabBar ariaLabel="On the record" idBase="co-rec" current={tab} onSelect={(id) => { setTab(id as typeof tab); setAll(false); }}
        tabs={[{ id: 'handoffs', label: 'Handoffs', count: org.handoffs.length }, { id: 'approvals', label: 'Your approvals', count: org.approvals.length }, { id: 'activity', label: 'Activity', count: org.events.length }]} />
      <TabPanel idBase="co-rec" id="handoffs" current={tab} className="cp-tabpanel">
        {handoffs.length === 0 ? <EmptyLine>Nothing has been handed over yet.</EmptyLine> : (
          <>
            <Rows label="Handoffs">
              {handoffs.slice(0, limit).map((h: HandoffRow) => { const ok = h.qualityStatus === 'VALIDATED'; const t = title(h.productionId); return (
                <Row key={h.id} start={<StateWord tone={ok ? 'done' : 'failed'}>{ok ? 'Accepted' : 'Refused'}</StateWord>}
                  title={<>{departmentName(org, h.producerDepartment)} → {handoffTarget(org, h)}</>}
                  meta={<span className="t-facts"><span>{stageName(org, h.stage)}</span>{t && <span><bdi>{t}</bdi></span>}{checksLine(h.validation.checks) && <span>{checksLine(h.validation.checks)}</span>}</span>}
                  end={<span className="t-ro cp-time">{shortWhen(h.createdAt)}</span>} />
              ); })}
            </Rows>
            {more(handoffs.length)}
          </>
        )}
      </TabPanel>
      <TabPanel idBase="co-rec" id="approvals" current={tab} className="cp-tabpanel">
        {org.approvals.length === 0 ? <EmptyLine>You have not approved anything yet.</EmptyLine> : (
          <Rows label="Your approvals">
            {org.approvals.map((a) => { const w = DECISION_WORDS[a.decision] ?? { tone: 'done' as const, words: a.decision }; const t = title(a.productionId); return (
              <Row key={a.id} start={<StateWord tone={w.tone}>{w.words}</StateWord>}
                title={<>{a.stage === 'EDIT' ? 'The cut' : stageName(org, a.stage)}{t && <> of <bdi>{t}</bdi></>}</>}
                meta={a.note ? <span dir="auto">{a.note}</span> : `By the ${a.by}`}
                end={<span className="t-ro cp-time">{shortWhen(a.createdAt)}</span>} />
            ); })}
          </Rows>
        )}
      </TabPanel>
      <TabPanel idBase="co-rec" id="activity" current={tab} className="cp-tabpanel">
        {org.events.length === 0 ? <EmptyLine>No activity is recorded yet.</EmptyLine> : (
          <>
            <Rows label="Activity">
              {org.events.slice(0, limit).map((e) => { const a = e.agentId ? org.agents.find((x) => x.id === e.agentId) : undefined; return (
                <Row key={e.id} title={<span dir="auto">{e.message}</span>}
                  meta={<span className="t-facts"><span>{departmentName(org, e.departmentId)}</span>{a && <span>{a.name}</span>}</span>}
                  end={<span className="t-ro cp-time">{shortWhen(e.at)}</span>} />
              ); })}
            </Rows>
            {more(org.events.length)}
          </>
        )}
      </TabPanel>
    </Section>
  );
}

// ------------------------------------------------------------------------------------- each department's record

function DepartmentRecords({ org }: { org: OrgResponse }) {
  const depts = departmentsInOrder(org);
  const codes = departmentCodes(depts);
  return (
    <Section id="departments" title="Departments" count={depts.length} description={`Each department's runs in ${spanWords(org.hours)}, from its agents' own records.`}>
      <ul className="co-depts" role="list">
        {depts.map((d) => {
          const team = teamOf(org.agents, d);
          const r = recordOf(org.stats, team.map((a) => a.id));
          const first = percent(r.firstOk, r.firsts);
          const med = duration(r.medianMs);
          const director = team.find((a) => a.id === d.directorId);
          return (
            <li key={d.id}>
              <Link href={`/studio/departments/${d.id}`} className="card co-dept">
                <span className="co-dept-top"><span className="co-disc co-disc-sm" aria-hidden><span className="t-ro">{codes.get(d.id)}</span></span><IconChevronRight aria-hidden className="co-chev" /></span>
                <span className="t-card co-dept-name">{d.name}</span>
                <span className="t-meta co-dept-who">{director ? `${director.name} and ${team.length - 1} ${plural(team.length - 1, 'agent')}` : `${team.length} ${plural(team.length, 'agent')}`}</span>
                <span className="co-dept-facts">
                  {r.runs ? (
                    <>
                      <span><span className="t-ro t-ro-md">{r.runs}</span> {plural(r.runs, 'run')}</span>
                      {first && <span><span className="t-ro t-ro-md">{first}</span> first time</span>}
                      {med && <span>median {med}</span>}
                      {r.failed > 0 && <span className="co-bad"><span className="t-ro t-ro-md">{r.failed}</span> failed</span>}
                    </>
                  ) : <span>No runs in this period</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

// --------------------------------------------------------------------------------------------------- skeleton

/** The company while its record loads: the head, the state line, the ring's stage and the inspector at their real
 *  sizes (the spine on phones), then the sections' heads and rows (§5.22). */
export function StudioCompanySkeleton() {
  return (
    <SkeletonRegion label="Reading the company record…" className="cp company">
      <HeadSkeleton />
      <div className="card co-state"><Skeleton.Line width="min(28rem, 80%)" /></div>
      <div className="co-grid">
        <div className="card co-stage"><div className="co-frame"><Skeleton.Block width="100%" height="100%" radius="lg" className="co-frame-sk" /></div><p className="t-meta co-legend"><Skeleton.Line width="70%" /></p></div>
        <div className="card co-inspector"><Skeleton.Line width="40%" /><span className="t-title co-insp-title"><Skeleton.Line size="title" width="70%" /></span><Skeleton.Text lines={3} /></div>
      </div>
      <div className="co-spine">
        <div className="card co-spine-orch"><Skeleton.Text lines={3} /></div>
        <div className="co-spine-list">{RING.map((id) => <div key={id} className="card co-spine-row"><span className="co-disc" /><span className="co-spine-words"><Skeleton.Line width="60%" /><Skeleton.Line width="30%" /></span></div>)}</div>
      </div>
      <div className="cp-section"><SectionHeadSkeleton width="8rem" /><RowsSkeleton n={1} /></div>
      <div className="cp-section"><SectionHeadSkeleton width="10rem" /><RowsSkeleton n={6} /></div>
    </SkeletonRegion>
  );
}
