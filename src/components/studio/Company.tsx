'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { type OrgAgent, type OrgDepartment, type OrgResponse } from '@/studio/org';
import { RING, VIEW, deriveCompany, edgeGeometry, seats, teamOrder, type Company, type CompanyEdge, type NodeState, type Seat } from '@/studio/company';
import { useStudio } from '@/studio/store';
import { T, type TFn } from '@/lib/copy';
import { cls } from '@/components/ui/kit';
import { IconCharacters, IconChevronRight, IconFinalCut, IconLocations, IconProduce, IconShield, IconSound, IconStory, IconStoryboard, IconStudio } from '@/components/ui/icons';
import { fmtAgo } from '@/lib/format';

/** THE STUDIO COMPANY CONSTELLATION (docs/DESIGN-SYSTEM-V3.md §9.1) — the Studio Orchestrator at the centre, the nine
 *  departments on one orbit in pipeline order, each a seat with its people as dots. Lines appear only where a
 *  handoff was recorded; a department's assignment line only while one of its agents has an open run; the
 *  orchestrator's rings are the productions in flight. The stage is one tab stop with roving focus: the arrow keys
 *  walk the orbit, Enter selects, Enter again opens; the inspector beside it carries the
 *  selection in words, so the SVG itself is hidden from assistive technology. Below 768 px, or on request, the same
 *  company is a vertical spine. */

export const DEPT_ICON: Record<string, (p: { className?: string }) => ReactNode> = {
  EXECUTIVE: (p) => <IconStudio {...p} />, STORY: (p) => <IconStory {...p} />, CASTING: (p) => <IconCharacters {...p} />, WORLD: (p) => <IconLocations {...p} />,
  PREPRODUCTION: (p) => <IconStoryboard {...p} />, VIDEO: (p) => <IconProduce {...p} />, SOUND: (p) => <IconSound {...p} />, POST: (p) => <IconFinalCut {...p} />, QA: (p) => <IconShield {...p} />,
};

export type Selection = { kind: 'orchestrator' } | { kind: 'dept'; id: string } | { kind: 'edge'; key: string };

/** The company derived from the organisation and the productions that are not finished. */
export function useCompany(org: OrgResponse | null): Company | null {
  const { state } = useStudio();
  const ids = state.productions.filter((p) => p.stage !== 'COMPLETE').map((p) => p.id);
  const key = ids.join(',');
  return useMemo(() => (org ? deriveCompany(org, ids) : null), [org, key]); // eslint-disable-line react-hooks/exhaustive-deps
}

const prefersReducedMotion = () => typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.getAttribute('data-motion') === 'reduce');

/** The department's agents in the response, director first. */
export const teamOf = (org: Pick<OrgResponse, 'agents'>, d: OrgDepartment): OrgAgent[] => {
  const xs = org.agents.filter((a) => a.department === d.id);
  return [...xs.filter((a) => a.id === d.directorId), ...xs.filter((a) => a.id !== d.directorId)];
};

/** A seat's one-line state: idle with its headcount, working with the agent's name, waiting, blocked. */
export function nodeStateLine(T: TFn, org: OrgResponse, c: Company, d: OrgDepartment): { state: NodeState; text: string } {
  const st = c.nodeState(d.id);
  if (st === 'working') { const id = Array.from(c.workingAgents.get(d.id) ?? [])[0]; const a = org.agents.find((x) => x.id === id); return { state: st, text: a ? T.f('co.node.working', { agent: a.name }) : T('orch.node.active') }; }
  if (st === 'waiting') return { state: st, text: T('co.node.waiting') };
  if (st === 'blocked') { const b = c.blocked.find((x) => x.department === d.id); return { state: st, text: T.dyn(`studio.stage.${b?.status ?? 'INVALID'}`) }; }
  return { state: st, text: `${T('orch.node.idle')} · ${T.p('co.agents', teamOf(org, d).length)}` };
}

/** What a seat says to a screen reader: name, state, recent handoffs. */
function nodeAria(T: TFn, org: OrgResponse, c: Company, d: OrgDepartment): string {
  const line = nodeStateLine(T, org, c, d).text;
  const recent = c.edgesOf(d.id).reduce((n, e) => n + e.recentCount, 0);
  return `${d.name}. ${line}. ${recent ? T.p('co.handoffsRecent', recent) : T('co.noRecentHandoffs')}.`;
}

/** The orchestrator's state line: idle, coordinating n productions, waiting for you, blocked. */
export function orchestratorLine(T: TFn, c: Company): string {
  if (c.awaiting.length) return T.f('co.orch.waiting', { n: c.awaiting.length });
  if (c.blocked.length) return T.f('co.orch.blocked', { n: c.blocked.length });
  const n = c.inFlight.length;
  if (c.running.length || c.queued.length) return n ? T.p('co.orch.coordinating', n) : T.dyn('orch.state.COORDINATING');
  if (n) return T.p('co.orch.inProgress', n);
  return T('orch.state.IDLE');
}

// ---------------------------------------------------------------------------------------------------- the stage

interface StageProps { org: OrgResponse; company: Company; selection: Selection; onSelect: (s: Selection) => void; onOpen: (deptId: string) => void; lastKnown?: string | null }

export function CompanyStage({ org, company: c, selection, onSelect, onOpen, lastKnown }: StageProps) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(760);
  useEffect(() => {
    const el = frame.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width || 760));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const s = width / VIEW.w;                       // px per viewBox unit
  const large = width >= 700;
  const disc = large ? 56 : 48;
  const orch = large ? 136 : 112;
  const seatList = useMemo(() => seats(), []);
  const seatOf = (id: string) => seatList.find((x) => x.id === id)!;
  const depts = RING.map((id) => org.departments.find((d) => d.id === id)).filter((d): d is OrgDepartment => Boolean(d));

  // roving focus: the orchestrator, then the departments in pipeline order
  const order = ['ORCH', ...depts.map((d) => d.id)];
  const [focusId, setFocusId] = useState<string>(selection.kind === 'dept' ? selection.id : 'ORCH');
  const btns = useRef<Record<string, HTMLButtonElement | null>>({});
  const move = (id: string) => { setFocusId(id); btns.current[id]?.focus(); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = order.indexOf(focusId);
    const nextKey = 'ArrowRight';
    const prevKey = 'ArrowLeft';
    const n = depts.length;
    const step = (dir: 1 | -1) => (i <= 0 ? (dir === 1 ? order[1] : order[n]) : order[((i - 1 + dir + n) % n) + 1]);
    if (e.key === nextKey || e.key === 'ArrowDown') { e.preventDefault(); move(step(1)); }
    else if (e.key === prevKey || e.key === 'ArrowUp') { e.preventDefault(); move(step(-1)); }
    else if (e.key === 'Home') { e.preventDefault(); move('ORCH'); }
    else if (e.key === 'End') { e.preventDefault(); move(order[n]); }
    else if (e.key === 'Escape') { e.preventDefault(); onSelect({ kind: 'orchestrator' }); move('ORCH'); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (focusId === 'ORCH') onSelect({ kind: 'orchestrator' });
      else if (e.key === 'Enter' && selection.kind === 'dept' && selection.id === focusId) onOpen(focusId);
      else onSelect({ kind: 'dept', id: focusId });
    }
  };
  useEffect(() => { if (selection.kind === 'dept') setFocusId(selection.id); }, [selection]);

  // context: the hovered (or keyboard-focused, or selected) thing stays bright, the rest dims
  const [hover, setHover] = useState<Selection | null>(null);
  const [kbd, setKbd] = useState<string | null>(null);
  const hot: Selection | null = hover ?? (kbd && kbd !== 'ORCH' ? { kind: 'dept', id: kbd } : null) ?? (selection.kind === 'orchestrator' ? null : selection);
  const bright = useMemo(() => {
    if (!hot) return null;
    if (hot.kind === 'dept') return { nodes: new Set([hot.id, ...c.neighbours(hot.id)]), edges: new Set(c.edgesOf(hot.id).map((e) => e.key)) };
    if (hot.kind === 'edge') { const e = c.edges.find((x) => x.key === hot.key); return e ? { nodes: new Set([e.from, e.to]), edges: new Set([e.key]) } : null; }
    return null;
  }, [hot, c]);

  // a handoff that arrives while the page is open travels its path once; a run that starts travels hub → seat
  const seen = useRef<Set<string> | null>(null);
  const seenActive = useRef<Set<string> | null>(null);
  const [travel, setTravel] = useState<Array<{ id: string; kind: 'edge' | 'assign'; key: string }>>([]);
  useEffect(() => {
    const ids = new Set(org.handoffs.map((h) => h.id));
    const fresh: Array<{ id: string; kind: 'edge' | 'assign'; key: string }> = [];
    if (seen.current) for (const e of c.edges) for (const h of e.handoffs) if (!seen.current.has(h.id)) fresh.push({ id: `h-${h.id}`, kind: 'edge', key: e.key });
    if (seenActive.current) for (const d of c.activeDepts) if (!seenActive.current.has(d)) fresh.push({ id: `a-${d}-${Date.now()}`, kind: 'assign', key: d });
    seen.current = ids; seenActive.current = new Set(c.activeDepts);
    if (!fresh.length || prefersReducedMotion()) return;
    setTravel((t) => [...t, ...fresh]);
    const timer = setTimeout(() => setTravel((t) => t.filter((x) => !fresh.some((f) => f.id === x.id))), 1400);
    return () => clearTimeout(timer);
  }, [org.handoffs, c]);

  // geometry in viewBox units
  const rDisc = (disc / 2 + 6) / s;
  const arrow = 6 / s;
  const edgeGeo = (e: CompanyEdge) => {
    const a = seatOf(e.from); const b = seatOf(e.to);
    const reverse = c.edges.some((x) => x.from === e.to && x.to === e.from);
    return edgeGeometry(a, b, rDisc, rDisc + 1 / s, arrow, reverse ? 14 : 0);
  };
  const ringOuter = orch / 2 + 6 * Math.min(3, c.inFlight.length) + 4;
  const assignGeo = (id: string) => {
    const p = seatOf(id); const dx = p.x - VIEW.cx, dy = p.y - VIEW.cy; const l = Math.hypot(dx, dy) || 1;
    const a = { x: VIEW.cx + (dx / l) * (ringOuter / s), y: VIEW.cy + (dy / l) * (ringOuter / s) };
    const b = { x: p.x - (dx / l) * rDisc, y: p.y - (dy / l) * rDisc };
    return { d: `M${a.x},${a.y} L${b.x},${b.y}`, length: Math.hypot(b.x - a.x, b.y - a.y) };
  };
  const dimEdge = (key: string) => (bright && !bright.edges.has(key) ? true : undefined);

  return (
    <div className="co-stage" data-dimmed={lastKnown ? true : undefined}>
      {lastKnown && <p className="co-lastknown">{T.f('co.lastKnown', { ago: lastKnown })}</p>}
      <div ref={frame} className="co-frame" role="group" aria-label={T('orch.diagram')} aria-describedby="co-stage-hint" onKeyDown={onKeyDown} onMouseLeave={() => setHover(null)}>
        <p id="co-stage-hint" className="sr-only">{T('co.stageHint')}</p>
        <svg className="co-lines" viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} aria-hidden focusable="false">
          <ellipse className="co-orbit" cx={VIEW.cx} cy={VIEW.cy} rx={VIEW.rx} ry={VIEW.ry} vectorEffect="non-scaling-stroke" />
          {Array.from(c.activeDepts).map((id) => { const g = assignGeo(id); return <path key={`as-${id}`} className="co-assign" d={g.d} vectorEffect="non-scaling-stroke" data-dim={bright && !bright.nodes.has(id) ? true : undefined} />; })}
          {c.edges.map((e) => { const g = edgeGeo(e); const sel = selection.kind === 'edge' && selection.key === e.key; return (
            <g key={e.key} className="co-edge-g" data-dim={dimEdge(e.key)}>
              <path className="co-edge" data-state={e.state} data-selected={sel || undefined} d={g.d} vectorEffect="non-scaling-stroke" />
              <path className="co-edge co-arrow" data-state={e.state} data-selected={sel || undefined} d={g.arrow} vectorEffect="non-scaling-stroke" />
              {e.state === 'refused' && <path className="co-edge co-cross" data-state="refused" d={`M${g.mid.x - 4 / s},${g.mid.y - 4 / s} L${g.mid.x + 4 / s},${g.mid.y + 4 / s} M${g.mid.x + 4 / s},${g.mid.y - 4 / s} L${g.mid.x - 4 / s},${g.mid.y + 4 / s}`} vectorEffect="non-scaling-stroke" />}
              <path className="co-edge-hit" d={g.d} onClick={() => onSelect(sel ? { kind: 'orchestrator' } : { kind: 'edge', key: e.key })} onMouseEnter={() => setHover({ kind: 'edge', key: e.key })} onMouseLeave={() => setHover(null)} />
            </g>
          ); })}
          {travel.map((t) => {
            const g = t.kind === 'edge' ? (() => { const e = c.edges.find((x) => x.key === t.key); return e ? edgeGeo(e) : null; })() : assignGeo(t.key);
            if (!g) return null;
            const seg = Math.min(100, ((48 / s) / g.length) * 100);
            return <path key={t.id} className="co-travel" d={g.d} pathLength={100} vectorEffect="non-scaling-stroke" style={{ strokeDasharray: `${seg} 200`, '--from': `${seg}`, '--to': '-100' } as CSSProperties} />;
          })}
        </svg>

        {/* the orchestrator */}
        <button ref={(el) => { btns.current.ORCH = el; }} type="button" className="co-orch" style={{ left: '50%', top: `${(VIEW.cy / VIEW.h) * 100}%`, '--orch': `${orch}px` } as CSSProperties}
          tabIndex={focusId === 'ORCH' ? 0 : -1} aria-pressed={selection.kind === 'orchestrator'} aria-label={`${T('orch.title')}. ${orchestratorLine(T, c)}.`}
          onClick={() => { setFocusId('ORCH'); onSelect({ kind: 'orchestrator' }); }} onFocus={() => { setFocusId('ORCH'); setKbd('ORCH'); }} onBlur={() => setKbd(null)}>
          <ProductionRings c={c} size={orch} />
          <span className="co-orch-disc">
            <span className="co-orch-title">{T('orch.title')}</span>
            <span className="co-orch-state">{orchestratorLine(T, c)}</span>
          </span>
        </button>

        {depts.map((d) => {
          const seat = seatOf(d.id);
          const team = teamOrder(teamOf(org, d), d.directorId);
          const working = c.workingAgents.get(d.id) ?? new Set<string>();
          const line = nodeStateLine(T, org, c, d);
          const Icon = DEPT_ICON[d.id] ?? DEPT_ICON.EXECUTIVE;
          const selected = selection.kind === 'dept' && selection.id === d.id;
          return (
            <button key={d.id} ref={(el) => { btns.current[d.id] = el; }} type="button" className="co-node" data-state={line.state} data-placement={seat.placement}
              data-dim={bright && !bright.nodes.has(d.id) ? true : undefined}
              style={seatStyle(seat, disc)} tabIndex={focusId === d.id ? 0 : -1} aria-pressed={selected} aria-label={nodeAria(T, org, c, d)}
              onClick={() => { setFocusId(d.id); onSelect({ kind: 'dept', id: d.id }); }} onDoubleClick={() => onOpen(d.id)}
              onMouseEnter={() => setHover({ kind: 'dept', id: d.id })} onMouseLeave={() => setHover(null)}
              onFocus={() => { setFocusId(d.id); setKbd(d.id); }} onBlur={() => setKbd(null)}>
              <span className="co-disc">
                <Icon className="co-icon" />
                <TeamDots team={team} directorId={d.directorId} working={working} disc={disc} towards={Math.atan2(VIEW.cy - seat.y, VIEW.cx - seat.x)} />
              </span>
              <span className="co-label" style={labelStyle(seat, s, disc)}>
                <span className="co-name" dir="auto">{d.name}</span>
                <span className="co-state">{line.text}</span>
              </span>
            </button>
          );
        })}
      </div>
      {c.edges.length === 0 && <p className="co-caption">{T('co.empty.caption')}</p>}
    </div>
  );
}

/** Where a seat's button sits: the disc centre lands on the orbit point whatever the label's placement. */
function seatStyle(seat: Seat, disc: number): CSSProperties {
  const left = `${(seat.x / VIEW.w) * 100}%`; const top = `${(seat.y / VIEW.h) * 100}%`;
  const base = { left, top, '--disc': `${disc}px` } as CSSProperties & Record<string, string>;
  if (seat.placement === 'below') return { ...base, flexDirection: 'column', transform: `translate(-50%, ${-(disc / 2 + 4)}px)` };
  if (seat.placement === 'above') return { ...base, flexDirection: 'column-reverse', transform: `translate(-50%, calc(-100% + ${disc / 2 + 4}px))` };
  // beside: the disc on the side nearer the centre, the words growing away from it
  const right = seat.side !== 'left';
  return { ...base, flexDirection: right ? 'row' : 'row-reverse', transform: right ? `translate(${-(disc / 2 + 4)}px, -50%)` : `translate(calc(-100% + ${disc / 2 + 4}px), -50%)` };
}

/** A label's measure: 9.5rem at most, less where the stage edge is nearer (the stage pads 24 px around the frame). */
function labelStyle(seat: Seat, s: number, disc: number): CSSProperties {
  if (seat.placement !== 'beside') return { textAlign: 'center', alignItems: 'center', maxWidth: '9.5rem' };
  const right = seat.side !== 'left';
  const room = (right ? VIEW.w - seat.x : seat.x) * s + 16 - disc / 2 - 18;
  return { textAlign: right ? 'left' : 'right', alignItems: right ? 'flex-start' : 'flex-end', maxWidth: `${Math.max(76, Math.min(133, Math.floor(room)))}px` };
}

/** One dot per agent on a 100° arc on the side of the disc that faces the centre; the director's is larger; an agent
 *  with an open run is the accent and breathes. */
export function TeamDots({ team, directorId, working, disc, towards }: { team: OrgAgent[]; directorId: string; working: Set<string>; disc: number; towards: number }) {
  const n = team.length; if (!n) return null;
  const R = disc / 2 + 10;
  const span = (100 * Math.PI) / 180;
  return (
    <>
      {team.map((a, k) => {
        const ang = n === 1 ? towards : towards - span / 2 + (span * k) / (n - 1);
        const size = a.id === directorId ? 6 : 4;
        return <span key={a.id} aria-hidden className="co-dot" data-director={a.id === directorId || undefined} data-working={working.has(a.id) || undefined} style={{ width: size, height: size, left: disc / 2 + R * Math.cos(ang) - size / 2 - 1, top: disc / 2 + R * Math.sin(ang) - size / 2 - 1 }} />;
      })}
    </>
  );
}

/** One 2 px ring per production in flight (at most three), 6 px apart outside the orchestrator: the track in the
 *  hairline, the arc the share of stages done — the accent for a production with a job running. */
function ProductionRings({ c, size }: { c: Company; size: number }) {
  const rings = c.inFlight.slice(0, 3);
  if (!rings.length) return null;
  const box = size + 2 * (6 * 3 + 4);
  return (
    <svg className="co-rings" width={box} height={box} viewBox={`0 0 ${box} ${box}`} aria-hidden focusable="false">
      {rings.map((p, k) => {
        const r = size / 2 + 6 * (k + 1); const circ = 2 * Math.PI * r; const frac = Math.max(0, Math.min(1, p.done / p.total));
        return (
          <g key={p.productionId} transform={`rotate(-90 ${box / 2} ${box / 2})`}>
            <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={2} />
            {frac > 0 && <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke={p.running ? 'var(--accent)' : 'var(--fg-muted)'} strokeWidth={2} strokeDasharray={`${circ * frac} ${circ}`} strokeLinecap="round" />}
          </g>
        );
      })}
    </svg>
  );
}

/** What the lines mean, under the stage. */
export function EdgeLegend() {
  const sw = (cl: string, extra?: ReactNode) => <svg width="22" height="8" viewBox="0 0 22 8" aria-hidden><path d="M1 4 H21" className={cl} />{extra}</svg>;
  return (
    <ul className="co-legend" aria-label={T('co.legend')}>
      <li>{sw('co-sw co-sw-used')}{T('co.legend.used')}</li>
      <li>{sw('co-sw co-sw-recent')}{T('co.legend.recent')}</li>
      <li>{sw('co-sw co-sw-wait')}{T('co.legend.waiting')}</li>
      <li>{sw('co-sw co-sw-bad', <path d="M8 1 L14 7 M14 1 L8 7" className="co-sw co-sw-bad" />)}{T('co.legend.refused')}</li>
    </ul>
  );
}

/** The stage while the organisation loads: the orbit and nine empty seats, no shimmer. */
export function StageSkeleton() {
  return (
    <div className="co-stage" aria-busy>
      <div className="co-frame">
        <svg className="co-lines" viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} aria-hidden>
          <ellipse className="co-orbit" cx={VIEW.cx} cy={VIEW.cy} rx={VIEW.rx} ry={VIEW.ry} vectorEffect="non-scaling-stroke" />
          <circle cx={VIEW.cx} cy={VIEW.cy} r={80} fill="none" stroke="var(--line)" vectorEffect="non-scaling-stroke" />
          {seats().map((p) => <circle key={p.id} cx={p.x} cy={p.y} r={36} fill="none" stroke="var(--line)" vectorEffect="non-scaling-stroke" />)}
        </svg>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------------------------- the phone spine

/** The company as a spine (< 768 px, or "View as list"): the orchestrator's panel, then the departments in production
 *  order joined by a line that lights where a handoff passed in the last 90 minutes. Rows never truncate. */
export function CompanySpine({ org, company: c, orchestrator }: { org: OrgResponse; company: Company; orchestrator: ReactNode }) {
  const depts = RING.map((id) => org.departments.find((d) => d.id === id)).filter((d): d is OrgDepartment => Boolean(d));
  const litBetween = (a: string, b: string) => c.edges.some((e) => e.recentCount > 0 && ((e.from === a && e.to === b) || (e.from === b && e.to === a)));
  return (
    <div className="space-y-6">
      {orchestrator}
      <section aria-labelledby="co-spine-h">
        <h2 id="co-spine-h" className="h3 mb-2">{T('co.spine.title')}</h2>
        <ol className="co-spine">
          {depts.map((d, i) => {
            const line = nodeStateLine(T, org, c, d);
            const Icon = DEPT_ICON[d.id] ?? DEPT_ICON.EXECUTIVE;
            const team = teamOrder(teamOf(org, d), d.directorId);
            const far = c.edges.filter((e) => e.from === d.id && Math.abs(RING.indexOf(e.to as (typeof RING)[number]) - i) > 1);
            return (
              <li key={d.id} data-lit-above={i > 0 && litBetween(depts[i - 1].id, d.id) ? true : undefined} data-state={line.state}>
                <Link href={`/studio/departments/${d.id}`} className="co-spine-row" aria-label={nodeAria(T, org, c, d)}>
                  <span className="co-disc co-disc-sm"><Icon className="co-icon" /><TeamDots team={team} directorId={d.directorId} working={c.workingAgents.get(d.id) ?? new Set()} disc={40} towards={0} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold leading-5 text-fg" dir="auto">{d.name}</span>
                    <span className="co-state mt-0.5">{line.text}</span>
                    {far.map((e) => <span key={e.key} className="mt-0.5 block text-xs text-faint">→ {(org.departments.find((x) => x.id === e.to) ?? d).name} · {fmtAgo(e.latest.createdAt)}</span>)}
                  </span>
                  <IconChevronRight aria-hidden className="size-4 flex-none text-faint" />
                </Link>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

/** The latest handoffs across the company, as rows on the ground. */
export function RecentHandoffs({ org, limit = 8 }: { org: OrgResponse; limit?: number }) {
  const { state } = useStudio();
  const name = (id: string | null) => { const d = org.departments.find((x) => x.id === id); return d ? d.name : '—'; };
  const rows = [...org.handoffs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  return (
    <section aria-labelledby="co-recent-h" className="mt-[var(--section)]">
      <h2 id="co-recent-h" className="section-title mb-3">{T('co.recentHandoffs')}</h2>
      {rows.length === 0 ? <p className="text-[14px] text-muted">{T('co.recentHandoffs.empty')}</p> : (
        <ol className="rows">
          {rows.map((h) => { const p = state.productions.find((x) => x.id === h.productionId); const ok = h.qualityStatus === 'VALIDATED'; const passed = h.validation.checks.filter((x) => x.ok).length; return (
            <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm">
              <span className={cls('status', ok ? 'status-ok' : 'status-bad')}>{ok ? T('orch.accepted') : T('orch.refused')}</span>
              <span className="font-medium text-fg"><bdi>{name(h.producerDepartment)}</bdi> → <bdi>{name(h.stage === 'EDIT' ? 'EXECUTIVE' : h.receiverDepartment)}</bdi></span>
              <span className="text-muted">{T.dyn(`pipeline.${h.stage}`, h.stage)}</span>
              {p && <span className="text-muted" dir="auto">{p.title}</span>}
              {h.validation.checks.length > 0 && <span className="text-faint">{T.f('co.checksPassed', { ok: passed, n: h.validation.checks.length })}</span>}
              <span className="num ms-auto text-xs text-faint">{fmtAgo(h.createdAt)}</span>
            </li>
          ); })}
        </ol>
      )}
    </section>
  );
}
